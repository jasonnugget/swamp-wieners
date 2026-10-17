import type { Site } from "./types";
import { heatIndex } from "./model";
import { siteObservationV1Schema, type SiteObservationV1 } from "./risk";
import type { WeatherPoint } from "./weather";

export const ENVIRONMENT_GROUPS = ["weather", "soil", "lightning", "flood", "wildfire", "wildlife"] as const;
type Group = typeof ENVIRONMENT_GROUPS[number];
type Values = Pick<SiteObservationV1, Group>;
export interface CompletionField {
  kind: "SOURCE" | "SYNTHETIC" | "NOT_APPLICABLE";
  confidence: number;
  reason: string;
  basis: string[];
}
// This is deliberately NOT a SiteObservation or SiteRiskSnapshot. Scenario
// values cannot be passed to operational scorers/policy as live observations.
export interface SiteDataCompletion {
  version: 1;
  method: "location-season-weather-v1";
  siteId: string;
  site: Site;
  generatedAt: string;
  usage: "DEMO_ONLY";
  observed: SiteObservationV1;
  scenario: Values;
  fields: Record<string, CompletionField>;
  completeness: { source: number; synthetic: number; notApplicable: number; total: number };
}
const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

export function completeSiteData(site: Site, input: SiteObservationV1, now: number, history?: WeatherPoint): SiteDataCompletion {
  const observed = siteObservationV1Schema.parse(input);
  if (observed.siteId !== site.id) throw new Error("Completion site does not match observation");
  if (!Number.isFinite(now)) throw new Error("Completion time must be finite");
  const date = new Date(now), month = date.getUTCMonth();
  const arid = site.longitude < -100 && site.latitude < 43 && site.state !== "HI";
  const maritime = ["HI", "FL", "WA", "OR"].includes(site.state);
  // Transparent scenario heuristics, not fitted climate normals or measurements.
  // Prefer this plant's fresh weather over regional/seasonal assumptions.
  const summer = Math.cos((month - 6) * Math.PI / 6);
  const localHour = ((date.getUTCHours() + site.longitude / 15) % 24 + 24) % 24;
  const annualMeanF = clamp(103 - 1.25 * Math.abs(site.latitude), 12, 82);
  const seasonalF = summer * (maritime ? 9 : site.state === "AK" ? 29 : 22);
  const temperature = observed.weather.temperatureF ?? round(annualMeanF + seasonalF + 5 * Math.cos((localHour - 15) * Math.PI / 12));
  const humidity = observed.weather.humidityPct ?? (arid ? 32 : maritime ? 73 : 62);
  const wind = observed.weather.windMph ?? (site.state === "AK" ? 12 : arid ? 11 : 8);
  const gust = observed.weather.gustMph ?? round(Math.max(wind, wind * 1.45));
  const rain1h = observed.weather.precipitation1hMm ?? 0;
  const rain24h = observed.weather.precipitation24hMm ?? round(Math.max(rain1h, arid ? 0.4 : 2));
  const rain7d = observed.weather.precipitation7dMm ?? round(Math.max(rain24h, rain24h * 4));
  const soil = observed.soil.moistureSurface ?? round(clamp((arid ? 0.12 : 0.25) + rain7d / 500, 0.03, 0.6));
  const percentile = round(clamp(0.5 + (soil - (arid ? 0.16 : 0.3)) * 1.5, 0.01, 0.99));
  const cape = observed.weather.cape ?? round(Math.max(0, temperature - 65) * humidity * (arid ? 0.2 : 0.6));
  const potential = observed.lightning.forecastPotential ?? clamp(cape / 3000);
  // A no-event demo scenario avoids manufacturing a reported encounter/strike.
  // Dependent event fields are explicitly N/A, never a fake measurement of zero.
  const defaults: Values = {
    weather: { temperatureF: temperature, humidityPct: humidity, heatIndexF: heatIndex((temperature - 32) * 5 / 9, humidity),
      apparentTemperatureF: temperature, windMph: wind, gustMph: gust, precipitation1hMm: rain1h,
      precipitation24hMm: rain24h, precipitation7dMm: rain7d, weatherCode: rain1h > 0 ? 61 : humidity > 80 ? 3 : 0, cape },
    soil: { moistureSurface: soil, moistureRoot: round(clamp(soil * 0.9 + 0.03)), historicalPercentile: percentile },
    lightning: { nearestStrikeMiles: null, latestStrikeAt: null, evidenceMode: "DEMO", strikes10mi30m: 0, forecastPotential: round(potential) },
    flood: { nearestGaugeMiles: null, stage: null, stagePercentile: round(clamp(0.35 + rain7d / 150)), stageTrend: null,
      floodAlert: false, floodplain: site.riverScreening },
    wildfire: { nearestFireMiles: null, fireAgeMinutes: null, firePower: null, redFlagAlert: false },
    wildlife: { dangerousSightings24h: 0, nearestSightingMiles: null, crewReports24h: observed.wildlife.crewReports24h, latestSightingAt: null, severity: "LOW" },
  };
  const scenario = structuredClone(defaults), fields: Record<string, CompletionField> = {};
  const basis = [`Plant coordinates ${site.latitude},${site.longitude}; state ${site.state}`, `UTC month ${month + 1}; solar local hour ${round(localHour)}`,
    `Inputs used (source values where available, otherwise scenario assumptions): temperature ${temperature} F, humidity ${humidity}%, 7d rain ${rain7d} mm`,
    "Uncalibrated scenario heuristic; not a measurement, historical percentile, gauge datum, official alert or incident report"];
  for (const group of ENVIRONMENT_GROUPS) {
    for (const [key, value] of Object.entries(observed[group])) {
      const path = `${group}.${key}`, target = scenario[group] as Record<string, unknown>;
      const known = value !== null && !(path === "lightning.evidenceMode" && ["UNAVAILABLE", "FORECAST"].includes(String(value)));
      if (known) {
        target[key] = value;
        fields[path] = { kind: "SOURCE", confidence: observed.provenance.fieldEvidence[path]?.confidence ?? (path === "wildlife.crewReports24h" ? 1 : 0.5), reason: observed.provenance.fieldSources[path] ?? (path === "wildlife.crewReports24h" ? "Actual stored crew report count" : "Canonical normalized evidence"), basis: [] };
      } else {
        const provider = path === "flood.floodplain" ? "floodplain" : ["flood.floodAlert", "wildfire.redFlagAlert"].includes(path) ? "nws" :
          group === "flood" ? "usgs" : group === "wildfire" ? "firms" : group === "soil" ? "weather" : group;
        const failure = observed.provenance.providers[provider]?.error ?? observed.provenance.error;
        const notApplicable = target[key] === null;
        fields[path] = { kind: notApplicable ? "NOT_APPLICABLE" : "SYNTHETIC", confidence: 0,
          reason: notApplicable ? "No event or identified physical gauge in the demo scenario; no measurement invented" : `No usable current value${failure ? `: ${failure}` : " in connected sources"}`, basis: [...basis] };
      }
    }
  }
  // Reuse real hourly model history before resorting to a synthetic percentile.
  // This short-window statistic stays in the completion export pending risk calibration.
  if (observed.soil.historicalPercentile === null && observed.soil.moistureRoot !== null && history &&
    history.latitude === site.latitude && history.longitude === site.longitude && !history.stale &&
    now >= Date.parse(history.fetchedAt) && now - Date.parse(history.fetchedAt) < 3600000 &&
    observed.validAt === history.current.time) {
    const end = Math.floor(Date.parse(observed.validAt) / 3600000) * 3600000;
    const samples = [...new Map(history.hours.flatMap(h => {
      const t = Date.parse(h.time), value = h.soilRoot;
      return t < end && t >= end - 168 * 3600000 && t % 3600000 === 0 && typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? [[t, value] as const] : [];
    })).entries()];
    if (samples.length >= 144 && Math.max(...samples.map(([t]) => t)) - Math.min(...samples.map(([t]) => t)) >= 6 * 86400000) {
      const current = observed.soil.moistureRoot;
      scenario.soil.historicalPercentile = round(samples.reduce((sum, [, value]) => sum + (value < current - 1e-6 ? 1 : Math.abs(value - current) <= 1e-6 ? 0.5 : 0), 0) / samples.length);
      fields["soil.historicalPercentile"] = { kind: "SOURCE", confidence: 0.35, reason: "Open-Meteo same-site 9-27 cm root-zone 7-day empirical midrank; short-window abnormality, not climatic percentile",
        basis: [`${samples.length} unique hourly modeled samples preceding ${observed.validAt}`, `Fetched ${history.fetchedAt}; current root moisture ${current}`] };
    }
  }
  // A real positive event must not inherit the synthetic no-event count.
  if (observed.lightning.nearestStrikeMiles !== null && observed.lightning.strikes10mi30m === null) {
    scenario.lightning.strikes10mi30m = observed.lightning.nearestStrikeMiles <= 10 ? 1 : 0;
    fields["lightning.strikes10mi30m"].reason = "Synthetic minimum count from nearest observed strike; detector completeness unknown";
  }
  const entries = Object.values(fields);
  return { version: 1, method: "location-season-weather-v1", siteId: site.id, site: structuredClone(site), generatedAt: date.toISOString(), usage: "DEMO_ONLY", observed, scenario, fields,
    completeness: { source: entries.filter(f => f.kind === "SOURCE").length, synthetic: entries.filter(f => f.kind === "SYNTHETIC").length,
      notApplicable: entries.filter(f => f.kind === "NOT_APPLICABLE").length, total: entries.length } };
}
