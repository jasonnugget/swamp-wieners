import { z } from "zod";
import type { Site } from "../../shared/types";
import type { ProviderEvidence } from "../../shared/providers";
import { distanceMiles } from "../../shared/policy";
import { DAY, HOUR, MINUTE, ProviderCache, ProviderHttp, evidence, safely, tile, unavailable } from "./provider";

export interface FloodObservation {
  nearestGaugeMiles: number | null; stage: number | null; stagePercentile: number | null; stageTrend: number | null;
}
export interface FloodProvider { getFloodEvidence(site: Site): Promise<ProviderEvidence<FloodObservation>> }
const rowSchema = z.object({ properties: z.object({
  monitoring_location_id: z.string(), time_series_id: z.string(), parameter_code: z.string(),
  time: z.string(), value: z.union([z.string(), z.number(), z.null()]), unit_of_measure: z.string(),
  qualifier: z.unknown().optional(),
}), geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) }).nullable() });
const collectionSchema = z.object({ type: z.literal("FeatureCollection"), features: z.array(z.unknown()), links: z.array(z.object({ rel: z.string() }).passthrough()).optional() });
type Reading = { station: string; series: string; time: number; stage: number; latitude: number; longitude: number };
function rows(payload: unknown): Reading[] {
  const data = collectionSchema.parse(payload);
  const result = data.features.flatMap(raw => {
    const r = rowSchema.safeParse(raw); if (!r.success) return [];
    const p = r.data.properties, coordinates = r.data.geometry?.coordinates;
    const value = p.value === null || p.value === "" ? NaN : Number(p.value), time = Date.parse(p.time);
    if (p.parameter_code !== "00065" || !coordinates || !Number.isFinite(value) || !Number.isFinite(time) || !["ft", "m"].includes(p.unit_of_measure)) return [];
    return [{ station: p.monitoring_location_id, series: p.time_series_id, stage: value * (p.unit_of_measure === "ft" ? 0.3048 : 1), time, longitude: coordinates[0], latitude: coordinates[1] }];
  });
  // A valid empty result is allowed; a nonempty response with no valid records is not a successful measurement.
  if (data.features.length && !result.length) throw new Error("USGS has no usable stage records");
  return result;
}
export class UsgsWaterProvider implements FloodProvider {
  private base = "https://api.waterdata.usgs.gov/ogcapi/v1/collections";
  constructor(private cache: ProviderCache, private http: ProviderHttp, private apiKey = "", private clock = Date.now) {}
  private async query(collection: string, params: Record<string, string>) {
    return this.http.json("USGS", `${this.base}/${collection}/items?${new URLSearchParams({ f: "json", ...params })}`, this.apiKey ? { "X-Api-Key": this.apiKey } : {});
  }
  async getFloodEvidence(site: Site): Promise<ProviderEvidence<FloodObservation>> {
    const now = this.clock();
    return safely("USGS", now, 30 * MINUTE, () => this.cache.get(`usgs:evidence:v1:${site.id}:${site.latitude}:${site.longitude}`, 30 * MINUTE, async () => {
      const region = tile(site, 1, 20);
      const association = await this.cache.get<Reading | null>(`usgs:association:v1:${site.id}:${site.latitude}:${site.longitude}`, association => association === null ? DAY : 30 * DAY, async () => {
        const candidates = await this.cache.get(`usgs:stations:v1:${region.key}`, DAY, async () => {
          // Local discovery, not a nationwide nearest-station scan. Filter out abandoned gauges.
          const payload = await this.query("latest-continuous", { parameter_code: "00065", bbox: region.bbox.join(","), datetime: `${new Date(now - 2 * HOUR).toISOString()}/..`, limit: "1000" });
          const collection = collectionSchema.parse(payload);
          if (collection.links?.some(l => l.rel === "next")) throw new Error("USGS local station discovery truncated; association unknown");
          return rows(payload).filter(r => r.time <= now && now - r.time < 2 * HOUR);
        });
        return candidates.filter(r => distanceMiles(site, r) <= 20).sort((a, b) => distanceMiles(site, a) - distanceMiles(site, b))[0] ?? null;
      });
      if (!association) return unavailable("USGS", now, 30 * MINUTE, "No fresh stage gauge identified within 20 miles");
      const latest = await this.cache.get(`usgs:latest:${association.series}`, 30 * MINUTE, async () => ({ fetchedAt: this.clock(), rows: rows(await this.query("latest-continuous", { time_series_id: association.series, limit: "10" })) }));
      const current = latest.rows.filter(r => r.series === association.series && r.time <= now && now - r.time < 2 * HOUR).sort((a, b) => b.time - a.time)[0];
      if (!current) return unavailable("USGS", now, 30 * MINUTE, "Associated gauge has no fresh stage reading");
      // Trend and relative abnormality are optional: preserve a valid current stage when history fails.
      let history: Reading[] = [], historyError: string | null = null;
      try {
        history = await this.cache.get(`usgs:history:v1:${association.series}`, DAY, async () => {
          const payload = await this.query("continuous", { time_series_id: association.series, datetime: `${new Date(now - 30 * DAY).toISOString()}/${new Date(now).toISOString()}`, sortby: "-time", limit: "10000" });
          const data = collectionSchema.parse(payload);
          if (data.links?.some(l => l.rel === "next")) throw new Error("USGS baseline response truncated");
          const seen = new Set<number>();
          return rows(payload).filter(r => r.series === association.series && r.time <= now && now - r.time <= 30 * DAY)
            .sort((a, b) => b.time - a.time).filter(r => { const hour = Math.floor(r.time / HOUR); if (seen.has(hour)) return false; seen.add(hour); return true; });
        });
      } catch { historyError = "Historical stage baseline unavailable"; }
      // Daily cached history is unsuitable for a current trend; fetch a small recent window separately.
      let recent: Reading[] = [];
      try { recent = await this.cache.get(`usgs:recent:${association.series}`, 30 * MINUTE, async () => rows(await this.query("continuous", { time_series_id: association.series, datetime: `${new Date(now - 6 * HOUR).toISOString()}/..`, sortby: "-time", limit: "100" }))); }
      catch { historyError = "Recent trend and/or baseline unavailable"; }
      const prior = recent.filter(r => r.series === current.series && r.time < current.time && current.time - r.time >= HOUR && current.time - r.time <= 6 * HOUR).sort((a, b) => b.time - a.time)[0];
      const samples = history.filter(r => r.time < current.time);
      const span = samples.length ? (Math.max(...samples.map(r => r.time)) - Math.min(...samples.map(r => r.time))) / DAY : 0;
      const percentile = samples.length >= 168 && span >= 7 ? (samples.filter(r => r.stage < current.stage - 1e-6).length + 0.5 * samples.filter(r => Math.abs(r.stage - current.stage) <= 1e-6).length) / samples.length : null;
      return evidence("USGS", { nearestGaugeMiles: distanceMiles(site, current), stage: current.stage, stagePercentile: percentile,
        stageTrend: prior ? (current.stage - prior.stage) / ((current.time - prior.time) / HOUR) : null }, now, 30 * MINUTE, {
        fetchedAt: new Date(latest.fetchedAt).toISOString(), validUntil: new Date(latest.fetchedAt + 30 * MINUTE).toISOString(), observedAt: new Date(current.time).toISOString(), confidence: 0.65,
        details: { stationId: current.station, seriesId: current.series, units: "meters; trend meters/hour", sourceUrl: "https://waterdata.usgs.gov/monitoring-location/" + current.station + "/",
          baseline: "Rolling 30-day empirical relative stage; not long-term flood probability", samples: samples.length, baselineSpanDays: span, historyError,
          association: "Nearby gauge proxy; hydrologic connectivity is not verified" },
      });
    }));
  }
}
