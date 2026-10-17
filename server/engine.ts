import { randomUUID } from "node:crypto";
import type {
  Alert,
  Briefing,
  CrewTeam,
  Forecast,
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
import { Store } from "./store";

export class Engine {
  constructor(
    public store: Store,
    public sites: Site[],
    public bundledForecasts: Record<string, Forecast>,
    public models: ModelBundle,
    public scenario: { now: string; heroSiteId: string },
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
  snapshot(siteId?: string): Snapshot {
    const sites = siteId ? this.sites.filter(site => site.id === siteId) : this.sites;
    const now = this.now(),
      reports = this.store.all<HazardReport>("report"),
      strikes = this.store.all<Strike>("strike").filter(s => this.clockMode() === "demo" ? s.mode !== "live" : s.mode === "live"),
      alerts = this.store
        .all<Alert>("alert")
        .filter((a) =>
          this.clockMode() === "demo" ? a.mode !== "live" : a.mode === "live",
        ),
      forecasts = this.forecasts(),
      weatherScreenings = Object.fromEntries(this.store.all<WeatherScreening>("weather-screening").map(s => [s.siteId, s]));
    const weather = siteId ? [this.store.get<WeatherPoint>("environment-weather", siteId)].filter((p): p is WeatherPoint => !!p) : this.store.all<WeatherPoint>("environment-weather");
    const points = Object.fromEntries(weather.map(p => [p.id, p]));
    const providerRecords = this.store.all<StoredProviderRecord>("environment-provider");
    const liveNow = Date.now();
    const liveAlerts = this.store.all<Alert>("alert");
    const liveStrikes = this.store.all<Strike>("strike");
    const risks = Object.fromEntries(sites.map(site => {
      const checked = this.store.get<{ ok: boolean; checkedAt: string }>("feed", `${site.id}:nws`);
      const collection = this.store.get<{ ok: boolean; message: string }>("feed", `${site.id}:environment`);
      return [site.id, siteRisk(site, points[site.id], liveNow, reports, liveStrikes,
        liveAlerts, !!this.bundledForecasts[site.id], weatherScreenings[site.id], checked?.ok ? checked.checkedAt : undefined, collection && !collection.ok ? collection.message : undefined, { forecast: this.clockMode() === "real" ? forecasts[site.id] : undefined, soilThresholds: site.heldOut ? undefined : this.models.soilThresholds[site.id] }, providerRecords.filter(r => r.siteId === site.id))];
    }));
    return {
      siteRisks: Object.fromEntries(Object.entries(risks).map(([id, r]) => [id, r.snapshot])),
      now: new Date(now).toISOString(),
      clockMode: this.clockMode(),
      sites,
      teams: this.store.all<CrewTeam>("team"),
      forecasts,
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
          .map((f) => [f.id, f]),
      ),
    };
  }
  tick() {
    const snap = this.snapshot();
    let changed = false;
    for (const site of this.sites) {
      const local = localParts(this.now(), site.timezone);
      if (local.hour < 18) continue;
      const localDate = nextDate(local.date),
        id = `${site.id}:${localDate}`;
      if (this.store.get("briefing", id)) continue;
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
      );
      const briefing: Briefing = {
        id,
        siteId: site.id,
        localDate,
        generatedAt: snap.now,
        forecastMode: forecast?.mode ?? (nextScreening ? "live" : "historical"),
        decision,
        reportIds: reports.map((r) => r.id),
        text: [
          `${site.name} · next-day safety briefing · ${localDate}`,
          `Hazard index: ${decision.index ?? "unknown"}/10 (${decision.unknownCount} channels unknown).`,
          ...decision.tasks.map(
            (t) => `${TASK_LABELS[t.task]}: ${t.state}. ${t.reasons.join(" ")}`,
          ),
          ...reports.map(
            (r) => `Carry forward: ${r.description} (${r.author}, ${r.id}).`,
          ),
          `Forecast coverage: ${nextScreening?.hours.length ?? nextHours.length} hourly records. Source: ${nextScreening ? "NOAA/NWS forecast screening" : forecast?.mode ?? "unavailable"}. Policy: ${decision.policyVersion}.`,
        ].join("\n"),
      };
      changed = this.store.insert("briefing", id, briefing) || changed;
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
      "strike",
      "alert",
      "briefing",
      "forecast",
      "feed",
    ])
      this.store.clear(k);
    this.setClock("demo", this.scenario.now);
  }
}
