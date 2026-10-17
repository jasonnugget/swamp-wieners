import type { Site } from "../../shared/types";
import type { WeatherPoint } from "../../shared/weather";
import { loadWeather } from "../integrations/open-meteo";

// Ten-coordinate batches bound provider payloads. Sequential batches bound concurrency.
// Return an entry for every site even on a cold-cache provider outage.
export async function collect(sites: Site[], provider = loadWeather): Promise<{ site: Site; point?: WeatherPoint; error: string | null }[]> {
  const results: { site: Site; point?: WeatherPoint; error: string | null }[] = [];
  for (let i = 0; i < sites.length; i += 10) {
    const batch = sites.slice(i, i + 10);
    try {
      const points = await provider(batch);
      for (const site of batch) {
        const point = points.find(p => p.id === site.id);
        results.push({ site, point, error: point?.error ?? (point ? null : "Environmental provider unavailable") });
      }
    } catch (error) {
      for (const site of batch) results.push({ site, error: String(error) });
    }
  }
  return results;
}
