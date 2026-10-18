import type { Site, WeatherScreening } from "../../shared/types";
import type { WeatherPoint } from "../../shared/weather";
import { RISK_CONFIG } from "../../shared/risk-config";
import { heatIndex } from "../../shared/model";
import { siteObservationV1Schema, type SiteObservationV1 } from "../../shared/risk";

const finite = (v: unknown, min = -Infinity, max = Infinity): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
const fresh = (time: string, now: number, ttl: number) => now >= Date.parse(time) && now - Date.parse(time) < ttl;

// Expected primary evidence, including disconnected hazard feeds. Derived values and
// redundant proximity/age fields do not inflate coverage. No unverified N/A flags.
export function updateCoverage(o: SiteObservationV1): void {
  const values = [o.weather.temperatureF, o.weather.humidityPct, o.weather.windMph, o.weather.gustMph,
    o.weather.precipitation1hMm, o.weather.precipitation24hMm, o.weather.precipitation7dMm,
    o.weather.weatherCode, o.weather.cape, o.soil.moistureSurface, o.soil.moistureRoot,
    o.lightning.strikes10mi30m, o.flood.stagePercentile, o.flood.floodAlert,
    o.wildfire.nearestFireMiles, o.wildfire.redFlagAlert, o.wildlife.dangerousSightings24h];
  const available = values.filter(v => v !== null).length;
  o.coverage = { available, expected: values.length, percent: Math.round(available / values.length * 1000) / 10 };
}
export function normalize(site: Site, point: WeatherPoint | undefined, now: number, screening?: WeatherScreening, sourceNow = now): SiteObservationV1 {
  const o: SiteObservationV1 = {
    version: 1, siteId: site.id, validAt: null, fetchedAt: null,
    weather: { temperatureF: null, humidityPct: null, heatIndexF: null, apparentTemperatureF: null,
      windMph: null, gustMph: null, precipitation1hMm: null, precipitation24hMm: null,
      precipitation7dMm: null, weatherCode: null, cape: null },
    soil: { moistureSurface: null, moistureRoot: null, historicalPercentile: null },
    lightning: { nearestStrikeMiles: null, latestStrikeAt: null, evidenceMode: "UNAVAILABLE", strikes10mi30m: null, forecastPotential: null },
    flood: { nearestGaugeMiles: null, stage: null, stagePercentile: null, stageTrend: null, floodAlert: null, floodplain: null },
    wildfire: { nearestFireMiles: null, fireAgeMinutes: null, firePower: null, redFlagAlert: null },
    wildlife: { dangerousSightings24h: null, nearestSightingMiles: null, crewReports24h: 0, latestSightingAt: null, severity: null },
    coverage: { available: 0, expected: 17, percent: 0 },
    provenance: { mode: "live", source: "No connected source", stale: false, error: point?.error ?? null, fieldSources: {}, fieldEvidence: {}, providers: {} },
  };
  if (point && point.latitude === site.latitude && point.longitude === site.longitude) {
    const live = !point.stale && fresh(point.fetchedAt, sourceNow, 3600000) && fresh(point.current.time, now, 2 * 3600000);
    // A failed refresh keeps the last fetched hourly forecast. Within the grace window its
    // row for this hour stands in at reduced confidence instead of blanking soil and CAPE.
    const cached = live || !fresh(point.fetchedAt, sourceNow, RISK_CONFIG.weatherCache.graceHours * 3600000) ? undefined
      : point.hours.find(h => Date.parse(h.time) === Math.floor(now / 3600000) * 3600000);
    const usable = live || !!cached, cap = live ? 1 : RISK_CONFIG.weatherCache.confidence;
    o.provenance = { ...o.provenance, source: cached ? "Open-Meteo cached forecast" : "Open-Meteo model estimates", stale: !live };
    o.fetchedAt = Number.isFinite(Date.parse(point.fetchedAt)) ? new Date(point.fetchedAt).toISOString() : null;
    o.validAt = Number.isFinite(Date.parse((cached ?? point.current).time)) ? new Date((cached ?? point.current).time).toISOString() : null;
    o.provenance.providers.weather = { source: "Open-Meteo", status: usable ? "ok" : "unavailable", mode: "FORECAST", fetchedAt: o.fetchedAt ?? new Date(now).toISOString(), observedAt: o.validAt,
      validUntil: new Date((o.fetchedAt ? Date.parse(o.fetchedAt) : now) + (cached ? RISK_CONFIG.weatherCache.graceHours : 1) * 3600000).toISOString(), confidence: usable ? 0.8 * cap : 0,
      error: live ? null : cached ? `Refresh failed (${point.error ?? "stale"}); using hourly forecast fetched ${o.fetchedAt}` : point.error ?? "Weather cache is stale or invalid", details: { interpretation: "Gridded model estimates, not field instruments" } };
    if (usable) {
      const c = cached ?? point.current, end = Math.floor(Date.parse(c.time) / 3600000) * 3600000;
      const hourly = point.hours.find(h => Date.parse(h.time) === end);
      const rolling = (count: number) => {
        const hours = Array.from({ length: count }, (_, i) => point.hours.find(h => Date.parse(h.time) === end - i * 3600000));
        const values = hours.map(h => finite(h?.rain, 0));
        return values.every((v): v is number => v !== null) ? values.reduce((a, b) => a + b, 0) : null;
      };
      Object.assign(o.weather, {
        temperatureF: finite(c.temperature), humidityPct: finite(c.humidity, 0, 100), apparentTemperatureF: finite(c.apparent),
        windMph: finite(c.wind, 0), gustMph: finite(c.gust, 0), precipitation1hMm: rolling(1),
        precipitation24hMm: rolling(24), precipitation7dMm: rolling(168), weatherCode: finite(c.code, 0), cape: finite(hourly?.cape, 0),
      });
      if (o.weather.temperatureF !== null && o.weather.humidityPct !== null)
        o.weather.heatIndexF = heatIndex((o.weather.temperatureF - 32) * 5 / 9, o.weather.humidityPct);
      o.soil.moistureSurface = finite(hourly?.soilSurface, 0, 1);
      o.soil.moistureRoot = finite(hourly?.soilRoot, 0, 1);
      // CAPE is a proxy for instability, never a detected lightning strike.
      o.lightning.evidenceMode = o.weather.cape === null ? "UNAVAILABLE" : "FORECAST";
      o.lightning.forecastPotential = o.weather.cape === null ? null : Math.min(1, o.weather.cape / RISK_CONFIG.capeNormalizationJkg);
      for (const [group, fields] of Object.entries({ weather: o.weather, soil: o.soil, lightning: o.lightning }))
        for (const [name, value] of Object.entries(fields)) if (value !== null) {
          const hourlyField = group === "soil" || name.startsWith("precipitation") || name === "cape" || name === "forecastPotential";
          o.provenance.fieldSources[`${group}.${name}`] = `Open-Meteo ${cached ? `cached forecast (fetched ${o.fetchedAt})` : "model estimate"} at ${hourlyField ? new Date(end).toISOString() : c.time}`;
          o.provenance.fieldEvidence[`${group}.${name}`] = { source: "Open-Meteo", mode: "FORECAST", fetchedAt: o.fetchedAt!, observedAt: hourlyField ? new Date(end).toISOString() : c.time, confidence: Math.min(cap, group === "lightning" ? 0.5 : 0.8) };
        }
    }
  }
  // NWS supplies same-hour heat/wind fallback, never next-day peaks as current readings.
  if (screening?.siteId === site.id && fresh(screening.fetchedAt, now, 3 * 3600000) && fresh(screening.issuedAt, now, 24 * 3600000)) {
    const hour = screening.hours.find(h => fresh(h.time, now, 3600000));
    for (const [field, value] of [["heatIndexF", finite(hour?.heatIndex)], ["windMph", hour?.windKmh == null ? null : finite(hour.windKmh / 1.609344, 0)]] as const) {
      if (o.weather[field] === null && value !== null) {
        o.weather[field] = value;
        if (!o.validAt) {
          o.validAt = new Date(hour!.time).toISOString();
          o.fetchedAt = new Date(screening.fetchedAt).toISOString();
          o.provenance.source = "NOAA/NWS model forecast";
        }
        o.provenance.fieldEvidence[`weather.${field}`] = { source: "NOAA/NWS forecast", mode: "FORECAST", fetchedAt: new Date(screening.fetchedAt).toISOString(), observedAt: new Date(hour!.time).toISOString(), confidence: 0.8 };
        o.provenance.fieldSources[`weather.${field}`] = `NOAA/NWS forecast ${hour!.time}; issued ${screening.issuedAt}; fetched ${screening.fetchedAt}`;
      }
    }
  }
  updateCoverage(o);
  return siteObservationV1Schema.parse(o);
}
