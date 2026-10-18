import { completeSiteData, siteDataPreview } from "../../shared/site-data";
import type { RiskAtlas } from "../../shared/atlas";
import type { Site, Snapshot } from "../../shared/types";
import type { WeatherPoint } from "../../shared/weather";
import type { Store } from "../store";
import { siteRisk } from "./index";
import type { StoredProviderRecord } from "./providers";

// ML inputs for one site at one scoring time; the engine supplies the same context its
// current snapshot uses so every hour of the slider is scored on the same terms.
export type AtlasModels = (site: Site, target: number) => { mlAvailable: boolean; context: Parameters<typeof siteRisk>[10] };

// One requested frame across the supplied sites. No source HTTP calls and no future
// timestamps manufactured for source freshness. Current snapshots are unchanged.
export function riskAtlas(snapshot: Snapshot, store: Store, hour: number, now = Date.now(), completion = false, models?: AtlasModels): RiskAtlas {
  const target = hour === 0 ? now : Math.floor(now / 3600000) * 3600000 + hour * 3600000;
  const weather = snapshot.sites.length === 1
    ? [store.get<WeatherPoint>("environment-weather", snapshot.sites[0].id)].filter((p): p is WeatherPoint => !!p)
    : store.all<WeatherPoint>("environment-weather");
  const points = new Map(weather.map(p => [p.id, p]));
  const reports = snapshot.reports.filter(r => Date.parse(r.createdAt) <= now);
  const alerts = store.all<import("../../shared/types").Alert>("alert").filter(a => a.mode === "live");
  const strikes = store.all<import("../../shared/types").Strike>("strike").filter(s => s.mode === "live" && Date.parse(s.time) <= now);
  const providerRecords = store.all<StoredProviderRecord>("environment-provider");
  function frame(site: Site) {
    if (hour === 0) return snapshot.siteRisks[site.id];
    const point = points.get(site.id), reading = point?.hours.find(h => Date.parse(h.time) === target);
    const projected = point && reading ? { ...point, current: reading } : undefined;
    // Weather and soil follow the hourly forecast and ML follows its daily output.
    // Readings with no hourly forecast (gauges, fire, strikes, sightings, alert checks,
    // open reports) are held at their latest value rather than dropped or invented.
    const checked = store.get<{ ok: boolean; checkedAt: string }>("feed", `${site.id}:nws`);
    const ml = models?.(site, target);
    const result = siteRisk(site, projected, target, reports, strikes, alerts, ml?.mlAvailable ?? false,
      undefined, checked?.ok ? checked.checkedAt : undefined, undefined, ml?.context, providerRecords.filter(r => r.siteId === site.id), now).snapshot;
    result.generatedAt = new Date(now).toISOString();
    result.observation.provenance.mode = "forecast";
    return result;
  }
  return { version: 1, generatedAt: new Date(now).toISOString(), validAt: new Date(target).toISOString(), hour,
    kind: hour === 0 ? "CURRENT" : "FORECAST",
    limitations: hour === 0 ? [] : ["Hourly weather and soil forecast; detected strikes, gauge stages, fire detections, sightings and alert checks are held at their latest reading.", "Current unresolved crew holds are assumed to continue; future task states are not work authorization.", "Daily model output applies to every hour of its day; the latest issued day stands in beyond the model horizon."],
    sites: snapshot.sites.map(site => {
      const risk = frame(site);
      return { site, snapshot: risk, ...(completion ? { completion: siteDataPreview(completeSiteData(site, risk.observation, target, hour === 0 ? points.get(site.id) : undefined)) } : {}) };
    }),
  };
}
