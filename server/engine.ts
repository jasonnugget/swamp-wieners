import { randomUUID } from "node:crypto";
import type {
  Alert,
  Briefing,
  Forecast,
  HazardReport,
  ModelBundle,
  Site,
  Snapshot,
  Strike,
} from "../shared/types";
import { decide, TASK_LABELS } from "../shared/policy";
import { localParts, nextDate } from "../shared/clock";
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
  snapshot(): Snapshot {
    const now = this.now(),
      reports = this.store.all<HazardReport>("report"),
      strikes = this.store.all<Strike>("strike"),
      alerts = this.store
        .all<Alert>("alert")
        .filter((a) =>
          this.clockMode() === "demo" ? a.mode !== "live" : a.mode === "live",
        ),
      forecasts = this.forecasts();
    return {
      now: new Date(now).toISOString(),
      clockMode: this.clockMode(),
      sites: this.sites,
      forecasts,
      reports,
      strikes,
      alerts,
      briefings: this.store.all<Briefing>("briefing"),
      decisions: Object.fromEntries(
        this.sites.map((s) => [
          s.id,
          decide(
            s,
            forecasts[s.id],
            reports,
            strikes,
            alerts,
            now,
            this.models.soilThresholds[s.id],
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
      const decision = decide(
        site,
        validForecast,
        reports,
        snap.strikes,
        snap.alerts,
        this.now(),
        this.models.soilThresholds[site.id],
      );
      const briefing: Briefing = {
        id,
        siteId: site.id,
        localDate,
        generatedAt: snap.now,
        forecastMode: forecast?.mode ?? "historical",
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
          `Forecast coverage: ${nextHours.length} hourly records. Source: ${forecast?.mode ?? "unavailable"}. Policy: ${decision.policyVersion}.`,
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
