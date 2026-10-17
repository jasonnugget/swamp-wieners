import { completeSiteData, siteDataPreview } from "../../shared/site-data";
import type { RiskAtlas } from "../../shared/atlas";
import type { Site, Snapshot } from "../../shared/types";
import type { WeatherPoint } from "../../shared/weather";
import type { Store } from "../store";
import { siteRisk } from "./index";
import type { StoredProviderRecord } from "./providers";

// One requested frame across the supplied sites. No source HTTP calls and no future
// timestamps manufactured for source freshness. Current snapshots are unchanged.
export function riskAtlas(snapshot: Snapshot, store: Store, hour: number, now = Date.now(), completion = false): RiskAtlas {
  const target = hour === 0 ? now : Math.floor(now / 3600000) * 3600000 + hour * 3600000;
  const weather = snapshot.sites.length === 1
    ? [store.get<WeatherPoint>("environment-weather", snapshot.sites[0].id)].filter((p): p is WeatherPoint => !!p)
    : store.all<WeatherPoint>("environment-weather");
  const points = new Map(weather.map(p => [p.id, p]));
  const reports = snapshot.reports.filter(r => Date.parse(r.createdAt) <= now);
  const alerts = store.all<import("../../shared/types").Alert>("alert").filter(a => a.mode === "live");
  const strikes = store.all<import("../../shared/types").Strike>("strike").filter(s => s.mode === "live" && Date.parse(s.time) <= now);
  const staticRecords = store.all<StoredProviderRecord>("environment-provider").filter(r => r.provider === "floodplain");
  function frame(site: Site) {
    if (hour === 0) return snapshot.siteRisks[site.id];
    const point = points.get(site.id), reading = point?.hours.find(h => Date.parse(h.time) === target);
    const projected = point && reading ? { ...point, current: reading } : undefined;
    // Only static exposure, still-valid official alerts, existing holds and
    // forecast weather can extend into a future frame. No future gauge/fire/
    // strike/sighting readings are invented. Existing open reports are assumed
    // unresolved; this is forecast policy, not a future work authorization.
    const checked = store.get<{ ok: boolean; checkedAt: string }>("feed", `${site.id}:nws`);
    const result = siteRisk(site, projected, target, reports, strikes, alerts, false,
      undefined, checked?.ok ? checked.checkedAt : undefined, undefined, undefined, staticRecords.filter(r => r.siteId === site.id), now).snapshot;
    result.mlCoverage = snapshot.siteRisks[site.id].mlCoverage;
    result.generatedAt = new Date(now).toISOString();
    result.observation.provenance.mode = "forecast";
    return result;
  }
  return { version: 1, generatedAt: new Date(now).toISOString(), validAt: new Date(target).toISOString(), hour,
    kind: hour === 0 ? "CURRENT" : "FORECAST",
    limitations: hour === 0 ? [] : ["Weather-driven forecast screening; future detected strikes, gauge stages, fire detections and public sightings are unknown.", "Current unresolved crew holds are assumed to continue; future task states are not work authorization.", "HeatCast/GroundCast remain in current snapshots; this hourly projection uses provider weather and soil inputs, not invented ML predictions."],
    sites: snapshot.sites.map(site => {
      const risk = frame(site);
      return { site, snapshot: risk, ...(completion ? { completion: siteDataPreview(completeSiteData(site, risk.observation, target, hour === 0 ? points.get(site.id) : undefined)) } : {}) };
    }),
  };
}
