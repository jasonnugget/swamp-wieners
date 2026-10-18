import { randomUUID } from "node:crypto";
import type {
  Alert,
  Briefing,
  CrewTeam,
  Forecast,
  HazardForecast,
  HazardReport,
  ModelBundle,
  Site,
  Snapshot,
  Strike,
  WeatherScreening,
} from "../shared/types";
import { decide, TASK_LABELS } from "../shared/policy";
import { localParts, nextDate } from "../shared/clock";
import type { WeatherPoint } from "../shared/weather";
import type { StoredProviderRecord } from "./pipeline/providers";
import { siteRisk } from "./pipeline";
import { describeHazard, hazardEvidence, HAZARD_KEYS, HAZARD_NAMES, type HazardEvidence } from "../shared/hazard-model";
import { RISK_CONFIG } from "../shared/risk-config";
import { Store } from "./store";
import { detectUrgentHazards, type UrgentAlert } from "../shared/urgent";
import type { FleetBriefing } from "../shared/fleet-briefing";
import { geminiConfigured } from "./integrations/gemini";

export class Engine {
  constructor(
    public store: Store,
    public sites: Site[],
    public bundledForecasts: Record<string, Forecast>,
    public models: ModelBundle,
    public scenario: { now: string; heroSiteId: string },
    public bundledHazards: Record<string, HazardForecast> = {},
  ) {
    if (!store.get("config", "clock"))
      store.put("config", "clock", { mode: "demo", now: scenario.now });
  }
  now() {
    const clock = this.store.get<{ mode: string; now: string }>(
      "config",
      "clock",
    )!;
    return clock.mode === "demo" ? Date.parse(clock.now) : Date.now();
  }
  clockMode() {
    return this.store.get<{ mode: "real" | "demo" }>("config", "clock")!.mode;
  }
  forecasts() {
    return this.clockMode() === "demo"
      ? this.bundledForecasts
      : {
          ...this.bundledForecasts,
          ...Object.fromEntries(
            this.store.all<Forecast>("forecast").map((f) => [f.siteId, f]),
          ),
        };
  }
  // Demo uses bundled historical test-period predictions; real mode uses live forecasts only.
  hazardForecasts(): Record<string, HazardForecast> {
    return this.clockMode() === "demo" ? this.bundledHazards : Object.fromEntries(this.store.all<HazardForecast>("hazard-forecast").map(f => [f.siteId, f]));
  }
  // Pass the map when looking up many sites: in real mode each read parses every stored record.
  hazardFor(site: Site, date: string, now: number, forecasts = this.hazardForecasts()): HazardEvidence | null {
    return hazardEvidence(forecasts[site.id], site.id, date, now, RISK_CONFIG.hazardModel.fetchTtlHours);
  }
  // ML inputs for scoring one site at time `at`. Freshness is checked against real `now`;
  // a day's HazardCast output covers every hour of that day, and the latest issued day
  // stands in once the daily forecast runs out.
  modelContext(site: Site, at: number, now: number, forecasts = this.forecasts(), hazardForecasts = this.hazardForecasts()) {
    const real = this.clockMode() === "real", date = localParts(at, site.timezone).date;
    const latest = hazardForecasts[site.id]?.days.map(d => d.date).filter(d => d <= date).sort().at(-1) ?? date;
    return { mlAvailable: !!this.bundledForecasts[site.id], context: { forecast: real ? forecasts[site.id] : undefined, soilThresholds: site.heldOut ? undefined : this.models.soilThresholds[site.id],
      hazard: real ? this.hazardFor(site, latest, now, hazardForecasts) : null } };
  }
  // The operating day a demo decision covers: the bundled forecast day when near, else tomorrow after 6 PM.
  decisionDate(site: Site, now: number) {
    const first = this.forecasts()[site.id]?.hours[0];
    if (first && Math.abs(Date.parse(first.time) - now) < 48 * 3600000) return localParts(Date.parse(first.time), site.timezone).date;
    const local = localParts(now, site.timezone);
    return local.hour >= 18 ? nextDate(local.date) : local.date;
  }
  snapshot(siteId?: string): Snapshot {
    const sites = siteId ? this.sites.filter(site => site.id === siteId) : this.sites;
    // Records for plants outside the loaded scope (SITE_SCOPE) stay stored but are not sent.
    const known = new Set(this.sites.map(site => site.id));
    const now = this.now(),
      reports = this.store.all<HazardReport>("report"),
      strikes = this.store.all<Strike>("strike").filter(s => this.clockMode() === "demo" ? s.mode !== "live" : s.mode === "live"),
      alerts = this.store
        .all<Alert>("alert")
        .filter((a) =>
          this.clockMode() === "demo" ? a.mode !== "live" : a.mode === "live",
        ),
      forecasts = this.forecasts(),
      hazardForecasts = this.hazardForecasts(),
      weatherScreenings = Object.fromEntries(this.store.all<WeatherScreening>("weather-screening").filter(s => known.has(s.siteId)).map(s => [s.siteId, s]));
    const weather = siteId ? [this.store.get<WeatherPoint>("environment-weather", siteId)].filter((p): p is WeatherPoint => !!p) : this.store.all<WeatherPoint>("environment-weather");
    const points = Object.fromEntries(weather.map(p => [p.id, p]));
    const providerRecords = this.store.all<StoredProviderRecord>("environment-provider");
    const liveNow = Date.now();
    const liveAlerts = this.store.all<Alert>("alert");
    const liveStrikes = this.store.all<Strike>("strike");
    const risks = Object.fromEntries(sites.map(site => {
      const checked = this.store.get<{ ok: boolean; checkedAt: string }>("feed", `${site.id}:nws`);
      const collection = this.store.get<{ ok: boolean; message: string }>("feed", `${site.id}:environment`);
      const ml = this.modelContext(site, liveNow, liveNow, forecasts, hazardForecasts);
      return [site.id, siteRisk(site, points[site.id], liveNow, reports, liveStrikes,
        liveAlerts, ml.mlAvailable, weatherScreenings[site.id], checked?.ok ? checked.checkedAt : undefined, collection && !collection.ok ? collection.message : undefined, ml.context, providerRecords.filter(r => r.siteId === site.id))];
    }));
    const result: Snapshot = {
      siteRisks: Object.fromEntries(Object.entries(risks).map(([id, r]) => [id, r.snapshot])),
      now: new Date(now).toISOString(),
      clockMode: this.clockMode(),
      sites,
      teams: this.store.all<CrewTeam>("team"),
      forecasts,
      // Local date computed once per site: bundled forecasts hold every test-period day.
      hazardForecasts: Object.fromEntries(sites.flatMap(site => {
        const f = hazardForecasts[site.id];
        if (!f) return [];
        const today = localParts(now, site.timezone).date;
        return [[site.id, { ...f, days: f.days.filter(d => d.date >= today).slice(0, 2) }]];
      })),
      weatherScreenings,
      reports,
      strikes,
      alerts,
      briefings: this.store.all<Briefing>("briefing"),
      decisions: Object.fromEntries(
        sites.map((s) => [
          s.id,
          this.clockMode() === "real" ? risks[s.id].decision : decide(
            s,
            forecasts[s.id],
            reports,
            strikes,
            alerts,
            now,
            this.models.soilThresholds[s.id],
            weatherScreenings[s.id],
            Date.now(),
            24,
            undefined,
            this.hazardFor(s, this.decisionDate(s, now), now, hazardForecasts),
          ),
        ]),
      ),
      jevConfigured: !!process.env.TYPESAFE_API_KEY,
      feedStatus: Object.fromEntries(
        this.store
          .all<{
            id: string;
            checkedAt: string;
            ok: boolean;
            message: string;
          }>("feed")
          .filter((f) => known.has(f.id.split(":")[0]))
          .map((f) => [f.id, f]),
      ),
      fleetBriefings: this.store.all<FleetBriefing>("fleet-briefing").sort((a, b) => b.localDate.localeCompare(a.localDate)),
      geminiConfigured: geminiConfigured(),
      urgentAlerts: [],
      alertHistory: [],
    };
    result.urgentAlerts = this.urgentAlerts(sites, result, now);
    // Demo replays can rewind the clock, so alerts "from the future" are left out.
    result.alertHistory = this.store.all<UrgentAlert>("hazard-alert")
      .filter(a => known.has(a.siteId) && Date.parse(a.firedAt) <= now)
      .sort((a, b) => Date.parse(b.firedAt) - Date.parse(a.firedAt) || Number(a.kind === "hold") - Number(b.kind === "hold")).slice(0, 50);
    return result;
  }
  // Edge-triggered: the first detection is stored with its time; later refreshes reuse it.
  urgentAlerts(sites: Site[], snap: Pick<Snapshot, "strikes" | "alerts" | "siteRisks" | "decisions">, now: number): UrgentAlert[] {
    return detectUrgentHazards(sites, snap, now).map(candidate => {
      const fired: UrgentAlert = { ...candidate, firedAt: new Date(now).toISOString() };
      this.store.insert("hazard-alert", candidate.id, fired);
      const stored = this.store.get<UrgentAlert>("hazard-alert", candidate.id)!;
      return { ...candidate, firedAt: stored.firedAt };
    });
  }
  tick() {
    const due = this.sites.flatMap(site => {
      const local = localParts(this.now(), site.timezone);
      if (local.hour < 18) return [];
      const localDate = nextDate(local.date), id = `${site.id}:${localDate}`;
      return this.finalBriefing(id) ? [] : [{ site, localDate, id, early: false }];
    });
    // An idle scheduler must not score the entire live catalog every five seconds.
    if (!due.length) return false;
    return this.writeBriefings(due);
  }
  /**
   * Briefs every site for its next local day now, whatever the hour. Sites past 6 PM get their
   * normal briefing; earlier ones are marked early and replaced by the scheduler at 6 PM.
   * Returns the work day most sites share, which the fleet PDF covers.
   */
  briefNow(): string {
    const due = this.sites.map(site => {
      const local = localParts(this.now(), site.timezone), localDate = nextDate(local.date);
      return { site, localDate, id: `${site.id}:${localDate}`, early: local.hour < 18 };
    });
    this.writeBriefings(due.filter(d => !this.finalBriefing(d.id)));
    const counts = new Map<string, number>();
    for (const d of due) counts.set(d.localDate, (counts.get(d.localDate) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0][0];
  }
  /** A scheduled (6 PM or later) briefing is final; early on-demand ones may be replaced. */
  private finalBriefing(id: string) {
    const existing = this.store.get<Briefing>("briefing", id);
    return Boolean(existing && !existing.early);
  }
  private writeBriefings(due: { site: Site; localDate: string; id: string; early: boolean }[]) {
    if (!due.length) return false;
    const snap = this.snapshot(), hazardForecasts = this.hazardForecasts();
    let changed = false;
    for (const { site, localDate, id, early } of due) {
      const reports = snap.reports.filter(
        (r) => r.siteId === site.id && r.status === "open",
      );
      const forecast = snap.forecasts[site.id];
      const nextHours =
        forecast?.hours.filter(
          (h) =>
            localParts(Date.parse(h.time), site.timezone).date === localDate,
        ) ?? [];
      const validForecast = nextHours.length
        ? { ...forecast, hours: nextHours }
        : undefined;
      const screening = this.clockMode() === "real" ? snap.weatherScreenings?.[site.id] : undefined;
      const nextScreening = screening ? { ...screening, hours: screening.hours.filter(h => localParts(Date.parse(h.time), site.timezone).date === localDate) } : undefined;
      const hazard = this.hazardFor(site, localDate, this.now(), hazardForecasts);
      const decision = decide(
        site,
        validForecast,
        reports,
        snap.strikes,
        snap.alerts,
        this.now(),
        this.models.soilThresholds[site.id],
        nextScreening,
        this.now(),
        48,
        undefined,
        hazard,
      );
      const briefing: Briefing = {
        id,
        siteId: site.id,
        localDate,
        generatedAt: snap.now,
        forecastMode: forecast?.mode ?? (nextScreening ? "live" : "historical"),
        decision,
        reportIds: reports.map((r) => r.id),
        ...(early ? { early } : {}),
        text: [
          `${site.name} · next-day safety briefing · ${localDate}`,
          `Hazard index: ${decision.index ?? "unknown"}/10 (${decision.unknownCount} channels unknown)${hazard ? `; OverallCast ${Math.round(hazard.day.overall.probability * 100)}% chance of warning-level weather (${hazard.mode} learned forecast)` : "; learned HazardCast forecast unavailable"}.`,
          ...(hazard ? HAZARD_KEYS.map(key => `${HAZARD_NAMES[key]} ${hazard.day.hazards[key].score.toFixed(1)}/10: ${describeHazard(key, hazard.day.hazards[key])}.`) : []),
          ...decision.tasks.map(
            (t) => `${TASK_LABELS[t.task]}: ${t.state}. ${t.reasons.join(" ")}`,
          ),
          ...reports.map(
            (r) => `Carry forward: ${r.description} (${r.author}, ${r.id}).`,
          ),
          `Forecast coverage: ${nextScreening?.hours.length ?? nextHours.length} hourly records. Source: ${nextScreening ? "NOAA/NWS forecast screening" : forecast?.mode ?? "unavailable"}. Policy: ${decision.policyVersion}.`,
        ].join("\n"),
      };
      // Early briefings are drafts; the 6 PM run and later on-demand runs overwrite them.
      this.store.put("briefing", id, briefing);
      changed = true;
    }
    return changed;
  }
  report(value: Omit<HazardReport, "id" | "status" | "createdAt">) {
    const report: HazardReport = {
      ...value,
      id: randomUUID(),
      status: "open",
      createdAt: new Date(this.now()).toISOString(),
    };
    this.store.put("report", report.id, report);
    return report;
  }
  setClock(mode: "real" | "demo", now?: string) {
    this.store.put("config", "clock", {
      mode,
      now: now ?? new Date(this.now()).toISOString(),
    });
    this.tick();
  }
  reset() {
    for (const k of [
      "report",
      "report-request",
      "strike",
      "alert",
      "briefing",
      "fleet-briefing",
      "hazard-alert",
      "forecast",
      "hazard-forecast",
      "feed",
    ])
      this.store.clear(k);
    this.setClock("demo", this.scenario.now);
  }
}
