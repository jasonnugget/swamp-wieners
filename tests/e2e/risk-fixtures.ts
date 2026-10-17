import { readFileSync } from "node:fs";
import type { RiskAtlas } from "../../shared/atlas";
import type { Site } from "../../shared/types";
import { siteRisk } from "../../server/pipeline";
import type { WeatherPoint } from "../../shared/weather";
export const atlasSites: Site[] = JSON.parse(readFileSync("public/data/sites.json", "utf8"));
export function atlasFrame(hour = 0, strikeAgeMinutes?: number): RiskAtlas {
  const now = Date.now(), valid = Math.floor(now / 3600000) * 3600000 + hour * 3600000;
  return { version: 1, generatedAt: new Date(now).toISOString(), validAt: new Date(valid).toISOString(), hour, kind: hour ? "FORECAST" : "CURRENT", limitations: hour ? ["Future detections unavailable; fixture forecast inputs use the canonical scorer."] : [],
    sites: atlasSites.map((site, i) => {
      const temperature = [70, 96, 125][i] + hour / 4;
      const reading = { time: new Date(valid).toISOString(), temperature, apparent: temperature, humidity: 40, rain: hour / 10, wind: 5, gust: 10, cape: 0, direction: null, clouds: null, code: 0, soilSurface: 0.2, soilRoot: 0.2 };
      const point: WeatherPoint | undefined = i < 3 ? { ...site, current: reading, hours: [reading], fetchedAt: new Date(now - 1000).toISOString() } : undefined;
      const strikes = i === 1 && strikeAgeMinutes !== undefined ? [{ id: "fixture-live-strike", latitude: site.latitude, longitude: site.longitude, mode: "live" as const, time: new Date(now - strikeAgeMinutes * 60000).toISOString() }] : [];
      return { site, snapshot: siteRisk(site, point, hour ? valid : now, [], strikes, [], false, undefined, undefined, undefined, undefined, [], now).snapshot };
    }),
  };
}
