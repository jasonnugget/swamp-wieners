import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import type { Site } from "../../shared/types";
import type { ProviderEvidence } from "../../shared/providers";
import { DAY, ProviderCache, ProviderHttp, evidence, safely, unavailable } from "./provider";
export interface FloodplainProvider { getFloodplainEvidence(site: Site): Promise<ProviderEvidence<{ floodplain: boolean | null }>> }
export const staticExposureSchema = z.object({ version: z.literal(1), sites: z.record(z.object({
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  floodplain: z.boolean(), sourceUrl: z.string().url(), verifiedAt: z.string().datetime(),
})) });
const responseSchema = z.object({ features: z.array(z.object({ attributes: z.object({ FLD_ZONE: z.string().nullable(), SFHA_TF: z.string().nullable() }) })), exceededTransferLimit: z.boolean().optional() });
export class FemaFloodplainProvider implements FloodplainProvider {
  constructor(private cache: ProviderCache, private http: ProviderHttp, private staticFile = "", private enabled = true, private clock = Date.now) {}
  async getFloodplainEvidence(site: Site) {
    const now = this.clock();
    return safely<{ floodplain: boolean | null }>("FEMA NFHL", now, 30 * DAY, () => this.cache.get(`fema:v1:${this.enabled ? "enabled" : "disabled"}:${this.staticFile}:${this.staticFile ? statSync(this.staticFile).mtimeMs : "live"}:${site.id}:${site.latitude}:${site.longitude}`, 30 * DAY, async () => {
      if (this.staticFile) {
        const dataset = staticExposureSchema.parse(JSON.parse(readFileSync(this.staticFile, "utf8"))), row = dataset.sites[site.id];
        if (row && row.latitude === site.latitude && row.longitude === site.longitude && Date.parse(row.verifiedAt) <= now)
          return evidence("Verified static flood exposure", { floodplain: row.floodplain }, now, 30 * DAY, { mode: "STATIC", observedAt: row.verifiedAt, confidence: 0.7, details: { sourceUrl: row.sourceUrl, datasetVersion: dataset.version } });
      }
      if (!this.enabled) return unavailable<{ floodplain: boolean | null }>("FEMA NFHL", now, 30 * DAY, "Live FEMA lookup disabled; no matching verified static record", "STATIC");
      const params = new URLSearchParams({ f: "json", geometry: `${site.longitude},${site.latitude}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "FLD_ZONE,SFHA_TF", returnGeometry: "false" });
      const data = responseSchema.parse(await this.http.json("FEMA NFHL", `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?${params}`));
      if (data.exceededTransferLimit) throw new Error("FEMA response truncated");
      const flags = data.features.map(f => f.attributes.SFHA_TF).filter(v => v === "T" || v === "F");
      // No mapped polygon or unmapped zone is unknown, never a negative exposure claim.
      const floodplain = flags.includes("T") ? true : flags.length && flags.length === data.features.length ? false : null;
      return evidence("FEMA NFHL", { floodplain }, now, 30 * DAY, { mode: "STATIC", confidence: floodplain === null ? 0 : 0.7,
        details: { zones: data.features.map(f => f.attributes.FLD_ZONE), sourceUrl: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28", interpretation: "Mapped exposure context; not current inundation or a site-specific flood determination" } });
    }));
  }
}
