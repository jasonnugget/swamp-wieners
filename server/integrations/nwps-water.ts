import { z } from "zod";
import type { Site } from "../../shared/types";
import type { ProviderEvidence } from "../../shared/providers";
import { distanceMiles } from "../../shared/policy";
import type { FloodObservation, FloodProvider } from "./usgs-water";
import { DAY, HOUR, MINUTE, ProviderCache, ProviderHttp, evidence, safely, tile, unavailable } from "./provider";

const gaugeSchema = z.object({ lid: z.string().min(1), name: z.string(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  pedts: z.object({ observed: z.string() }), status: z.object({ observed: z.object({ primary: z.number().finite(), primaryUnit: z.string(), validTime: z.string() }) }) });
const responseSchema = z.object({ gauges: z.array(z.unknown()) });
const seriesSchema = z.object({ pedts: z.string(), primaryUnits: z.string(), data: z.array(z.object({ validTime: z.string(), primary: z.number().finite() })) });
const conversion = (unit: string) => unit === "ft" ? 0.3048 : unit === "m" ? 1 : null;
const validValue = (v: number) => v > -900; // NWPS uses -999 for missing values; negative gauge heights are valid.

export class NwpsWaterProvider implements FloodProvider {
  constructor(private cache: ProviderCache, private http: ProviderHttp, private clock = Date.now) {}
  async getFloodEvidence(site: Site): Promise<ProviderEvidence<FloodObservation>> {
    const now = this.clock();
    return safely("NOAA NWPS", now, 30 * MINUTE, async () => {
      const region = tile(site, 4, 20);
      const gauges = await this.cache.get(`nwps:gauges:v1:${region.key}`, 30 * MINUTE, async () => {
        const [xmin, ymin, xmax, ymax] = region.bbox;
        const query = new URLSearchParams({ "bbox.xmin": String(xmin), "bbox.ymin": String(ymin), "bbox.xmax": String(xmax), "bbox.ymax": String(ymax), srid: "EPSG_4326" });
        const payload = responseSchema.parse(await this.http.json("NOAA NWPS", `https://api.water.noaa.gov/nwps/v1/gauges?${query}`));
        const parsed = payload.gauges.flatMap(g => { const r = gaugeSchema.safeParse(g); return r.success ? [r.data] : []; });
        if (payload.gauges.length && !parsed.length) throw new Error("NOAA NWPS malformed gauge records");
        return { fetchedAt: this.clock(), gauges: parsed };
      });
      const nearby = gauges.gauges.map(gauge => ({ gauge, miles: distanceMiles(site, gauge) }))
        .filter(({ gauge: g, miles }) => miles <= 20 && conversion(g.status.observed.primaryUnit) !== null && validValue(g.status.observed.primary) &&
          Date.parse(g.status.observed.validTime) <= now && now - Date.parse(g.status.observed.validTime) < 2 * HOUR)
        .sort((a, b) => a.miles - b.miles);
      const nearest = nearby[0];
      if (!nearest) return unavailable("NOAA NWPS", now, 30 * MINUTE, "No fresh stage gauge identified within 20 miles in NWPS");
      const g = nearest.gauge, current = g.status.observed, time = Date.parse(current.validTime), factor = conversion(current.primaryUnit)!;
      let trend: number | null = null, percentile: number | null = null, samples = 0, historyError: string | null = null;
      try {
        const series = await this.cache.get(`nwps:observed:v1:${g.lid}`, 30 * MINUTE, async () =>
          seriesSchema.parse(await this.http.json("NOAA NWPS", `https://api.water.noaa.gov/nwps/v1/gauges/${encodeURIComponent(g.lid)}/stageflow/observed`)));
        if (series.pedts !== g.pedts.observed || series.primaryUnits !== current.primaryUnit) throw new Error("NWPS gauge parameter/units changed");
        const rows = series.data.map(r => ({ time: Date.parse(r.validTime), value: r.primary }))
          .filter(r => r.time < time && time - r.time <= 30 * DAY && validValue(r.value)).sort((a, b) => b.time - a.time);
        const prior = rows.find(r => time - r.time >= HOUR && time - r.time <= 6 * HOUR);
        if (prior) trend = (current.primary - prior.value) * factor / ((time - prior.time) / HOUR);
        const hourly = [...new Map([...rows].reverse().map(r => [Math.floor(r.time / HOUR), r])).values()];
        samples = hourly.length;
        const span = samples ? Math.max(...hourly.map(r => r.time)) - Math.min(...hourly.map(r => r.time)) : 0;
        if (samples >= 168 && span >= 7 * DAY) percentile = hourly.reduce((sum, r) => sum + (r.value < current.primary - 1e-6 ? 1 : Math.abs(r.value - current.primary) <= 1e-6 ? 0.5 : 0), 0) / samples;
      } catch { historyError = "NWPS same-gauge observed series unavailable or incompatible"; }
      return evidence("NOAA NWPS", { nearestGaugeMiles: nearest.miles, stage: current.primary * factor, stageTrend: trend, stagePercentile: percentile }, now, 30 * MINUTE, {
        fetchedAt: new Date(gauges.fetchedAt).toISOString(), validUntil: new Date(gauges.fetchedAt + 30 * MINUTE).toISOString(), observedAt: new Date(time).toISOString(), confidence: 0.6,
        details: { stationId: g.lid, name: g.name, sourceUrl: `https://water.noaa.gov/gauges/${g.lid}`, units: "meters; trend meters/hour", samples, historyError,
          baseline: "Available observed-product history, up to 30 days; not long-term flood probability", association: "Nearby gauge proxy; hydrologic connectivity is not verified" },
      });
    });
  }
}

export class FallbackFloodProvider implements FloodProvider {
  constructor(private primary: FloodProvider, private fallback: FloodProvider) {}
  async getFloodEvidence(site: Site): Promise<ProviderEvidence<FloodObservation>> {
    const primary = await this.primary.getFloodEvidence(site);
    if (primary.status === "ok" && primary.data !== null) return primary;
    const fallback = await this.fallback.getFloodEvidence(site);
    return { ...fallback, details: { ...fallback.details, primarySource: primary.source, primaryError: primary.error } };
  }
}
