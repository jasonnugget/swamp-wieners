import { z } from "zod";
import type { Alert, Site } from "../../shared/types";
import type { ProviderEvidence } from "../../shared/providers";
import { MINUTE, ProviderCache, ProviderHttp, evidence, safely } from "./provider";
const schema = z.object({ features: z.array(z.object({ id: z.string(), properties: z.object({
  event: z.string().min(1), headline: z.string().nullable(), severity: z.enum(["Extreme", "Severe", "Moderate", "Minor", "Unknown"]),
  expires: z.string().refine(v => Number.isFinite(Date.parse(v))), sent: z.string().optional(),
}) })) });
export interface OfficialAlertProvider { getAlerts(site: Site): Promise<ProviderEvidence<Alert[]>> }
export class NwsAlertProvider implements OfficialAlertProvider {
  constructor(private cache: ProviderCache, private http: ProviderHttp, private clock = Date.now) {}
  async getAlerts(site: Site) {
    const now = this.clock();
    return safely<Alert[]>("NOAA/NWS alerts", now, 5 * MINUTE, () => this.cache.get(`nws:alerts:${site.id}:${site.latitude}:${site.longitude}`, 5 * MINUTE, async () => {
      // A successful empty statewide response supplies an empty alert result
      // for every point. Use precise point queries whenever state alerts exist.
      const statewide = await this.cache.get(`nws:state-alerts:v1:${site.state}`, 5 * MINUTE, async () => ({
        fetchedAt: this.clock(), data: schema.parse(await this.http.json("NOAA/NWS alerts", `https://api.weather.gov/alerts/active?area=${encodeURIComponent(site.state)}`, { Accept: "application/geo+json" })),
      }));
      if (!statewide.data.features.length) return evidence("NOAA/NWS alerts", [], now, 5 * MINUTE, {
        fetchedAt: new Date(statewide.fetchedAt).toISOString(), validUntil: new Date(statewide.fetchedAt + 5 * MINUTE).toISOString(), confidence: 1,
        details: { sourceUrl: "https://api.weather.gov/alerts/active", scope: `Empty official statewide alert check: ${site.state}`, interpretation: "No active statewide alerts; not absence of environmental hazards" },
      });
      const data = schema.parse(await this.http.json("NOAA/NWS alerts", `https://api.weather.gov/alerts/active?point=${site.latitude},${site.longitude}`, { Accept: "application/geo+json" }));
      const alerts: Alert[] = data.features.map((f): Alert => {
        const p = f.properties, event = p.event.toLowerCase();
        return { id: `${site.id}:${f.id}`, siteId: site.id, title: p.headline || p.event, event: p.event,
          category: /flood/.test(event) ? "flood" : /fire|red flag/.test(event) ? "wildfire" : /heat/.test(event) ? "heat" : "weather",
          severity: p.severity === "Extreme" ? 10 : p.severity === "Severe" ? 7 : 3, expiresAt: new Date(p.expires).toISOString(), mode: "live" };
      }).filter(a => Date.parse(a.expiresAt) > now);
      return evidence("NOAA/NWS alerts", alerts, now, 5 * MINUTE, { confidence: 1, details: { sourceUrl: "https://api.weather.gov/alerts/active", interpretation: "Official alert semantics; not a second continuous weather-risk engine" } });
    }));
  }
}
// Existing refresh routes and the uniform provider dispatcher share request/cache work.
export const nwsAlertProvider = new NwsAlertProvider(new ProviderCache(), new ProviderHttp());
export async function fetchAlerts(site: Site): Promise<Alert[]> {
  const result = await nwsAlertProvider.getAlerts(site);
  if (result.status !== "ok" || result.data === null) throw new Error(result.error ?? "NWS alerts unavailable");
  return result.data;
}
