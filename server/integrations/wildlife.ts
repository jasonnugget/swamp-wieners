import { z } from "zod";
import type { Site } from "../../shared/types";
import type { ProviderEvidence } from "../../shared/providers";
import { distanceMiles } from "../../shared/policy";
import { DAY, HOUR, ProviderCache, ProviderHttp, evidence, safely, tile } from "./provider";

export interface WildlifeSighting { id: string; species: string; observedAt: string; distanceMiles: number; source: string; sourceUrl: string; severity: "MODERATE" | "ELEVATED" | "HIGH" }
export interface WildlifeObservation { sightings: WildlifeSighting[] }
export interface WildlifeProvider { getWildlifeEvidence(site: Site): Promise<ProviderEvidence<WildlifeObservation>> }
// Screening relevance, not a claim that these animals are attacking or dangerous in every context.
export function classifySpecies(name: string): WildlifeSighting["severity"] | null {
  const species = name.toLowerCase().trim();
  if (["crocodylus acutus", "ursus arctos", "puma concolor", "agkistrodon piscivorus", "micrurus fulvius", "micruroides euryxanthus"].includes(species) || /^(crotalus|sistrurus) [a-z]+$/.test(species)) return "HIGH";
  if (["alligator mississippiensis", "ursus americanus", "bison bison", "alces alces", "agkistrodon contortrix"].includes(species)) return "ELEVATED";
  if (species === "canis lupus") return "MODERATE";
  return null;
}
const observationSchema = z.object({ id: z.number(), time_observed_at: z.string().nullable(),
  location: z.string().nullable(), geoprivacy: z.string().nullable().optional(), obscured: z.boolean().optional(),
  positional_accuracy: z.number().nullable().optional(), quality_grade: z.string(),
  taxon: z.object({ name: z.string(), rank: z.string() }).nullable(),
});
const responseSchema = z.object({ total_results: z.number().nonnegative(), results: z.array(z.unknown()) });
export class InaturalistProvider implements WildlifeProvider {
  constructor(private cache: ProviderCache, private http: ProviderHttp, private clock = Date.now) {}
  async getWildlifeEvidence(site: Site): Promise<ProviderEvidence<WildlifeObservation>> {
    const now = this.clock();
    return safely("iNaturalist", now, 6 * HOUR, async () => {
      const region = tile(site, 1, 10);
      const raw = await this.cache.get(`inat:research:v1:${region.key}`, 6 * HOUR, async () => {
        const [swlng, swlat, nelng, nelat] = region.bbox;
        const params = new URLSearchParams({ swlat: String(swlat), swlng: String(swlng), nelat: String(nelat), nelng: String(nelng), per_page: "200", quality_grade: "research", geo: "true", captive: "false", order_by: "observed_on", order: "desc", d1: new Date(now - DAY).toISOString().slice(0, 10) });
        return { fetchedAt: this.clock(), payload: responseSchema.parse(await this.http.json("iNaturalist", `https://api.inaturalist.org/v1/observations?${params}`)) };
      });
      const data = raw.payload;
      const sightings = data.results.flatMap(value => {
        const result = observationSchema.safeParse(value); if (!result.success) return [];
        const r = result.data, severity = r.taxon ? classifySpecies(r.taxon.name) : null;
        if (!r.time_observed_at || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(r.time_observed_at) || !severity || r.taxon?.rank !== "species" || r.quality_grade !== "research" || r.obscured || (r.geoprivacy && r.geoprivacy !== "open") || (r.positional_accuracy !== undefined && r.positional_accuracy !== null && r.positional_accuracy > 1000)) return [];
        const [latitude, longitude] = (r.location ?? "").split(",").map(Number), time = Date.parse(r.time_observed_at ?? "");
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !Number.isFinite(time) || now < time || now - time > DAY) return [];
        const distance = distanceMiles(site, { latitude, longitude }); if (distance > 10) return [];
        return [{ id: String(r.id), species: r.taxon!.name, observedAt: new Date(time).toISOString(), distanceMiles: distance, source: "iNaturalist research-grade public observation", sourceUrl: `https://www.inaturalist.org/observations/${r.id}`, severity }];
      }).sort((a, b) => a.distanceMiles - b.distanceMiles);
      if (data.results.length && data.results.every(r => !observationSchema.safeParse(r).success)) throw new Error("iNaturalist malformed observation records");
      return evidence("iNaturalist", { sightings }, now, 6 * HOUR, { fetchedAt: new Date(raw.fetchedAt).toISOString(), validUntil: new Date(raw.fetchedAt + 6 * HOUR).toISOString(), observedAt: sightings.map(s => s.observedAt).sort().at(-1) ?? null, confidence: sightings.length ? 0.35 : 0,
        details: { sightings: sightings.slice(0, 20), totalResults: data.total_results, returned: data.results.length, truncated: data.total_results > data.results.length, radiusMiles: 10,
          interpretation: "Sparse contextual sightings, not verified dangerous encounters; no results never means zero wildlife probability" } });
    });
  }
}
