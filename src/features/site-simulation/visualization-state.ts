import type { ScenarioValues } from "./types";

export const fraction = (value: number | null | undefined, max = 1) => Math.min(1, Math.max(0, (value ?? 0) / max));
// Artistic controls only. These are not hazard scores or physical predictions.
export function visualState(v: ScenarioValues) {
  const w = v.weather, code = w.weatherCode;
  const snow = code !== null && [71, 73, 75, 77, 85, 86].includes(code);
  const hail = code === 96 || code === 99;
  const fog = code === 45 || code === 48;
  const storm = code !== null && code >= 95;
  const cloud = code === null ? 0.12 : fog ? 0.75 : storm ? 1 : code >= 51 ? 0.85 : code === 3 ? 0.78 : code === 2 ? 0.45 : code === 1 ? 0.22 : 0.08;
  const rainingCode = code !== null && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || storm);
  const rain = !snow && !hail ? Math.max(rainingCode ? 0.35 : 0, fraction(w.precipitation1hMm, 25)) : 0;
  return {
    snow, hail, fog, storm, cloud, rain,
    heat: fraction(w.heatIndexF === null ? null : w.heatIndexF - 80, 40),
    wind: fraction(w.windMph, 55), gust: fraction(w.gustMph, 75),
    wet: fraction(w.precipitation1hMm, 12),
    surface: v.soil.moistureSurface === null ? null : fraction(v.soil.moistureSurface, 0.6),
    root: v.soil.moistureRoot === null ? null : fraction(v.soil.moistureRoot, 0.6),
    stage: v.flood.stagePercentile,
  };
}
export type VisualState = ReturnType<typeof visualState>;

export type Preset = "clear" | "heat" | "storm" | "snow" | "wet" | "fire";
export function scenarioPreset(base: ScenarioValues, preset: Preset): ScenarioValues {
  const v = structuredClone(base);
  if (preset === "clear") Object.assign(v.weather, { temperatureF: 76, humidityPct: 45, heatIndexF: 76, apparentTemperatureF: 76, weatherCode: 0, windMph: 6, gustMph: 10, precipitation1hMm: 0 });
  if (preset === "heat") Object.assign(v.weather, { temperatureF: 100, humidityPct: 65, heatIndexF: 120, apparentTemperatureF: 120, weatherCode: 0, windMph: 4, gustMph: 8, precipitation1hMm: 0 });
  if (preset === "storm") {
    Object.assign(v.weather, { weatherCode: 95, windMph: 30, gustMph: 50, precipitation1hMm: 20, precipitation24hMm: 65, cape: 2000 });
    Object.assign(v.soil, { moistureSurface: 0.55, moistureRoot: 0.42 });
    Object.assign(v.flood, { stagePercentile: 0.95, stageTrend: 0.12 });
    Object.assign(v.lightning, { evidenceMode: "DEMO", nearestStrikeMiles: 5 });
  }
  if (preset === "snow") Object.assign(v.weather, { temperatureF: 28, apparentTemperatureF: 18, heatIndexF: null, weatherCode: 73, windMph: 12, gustMph: 18, precipitation1hMm: null });
  if (preset === "wet") {
    Object.assign(v.weather, { weatherCode: 3, precipitation1hMm: 0, precipitation24hMm: 48, precipitation7dMm: 130 });
    Object.assign(v.soil, { moistureSurface: 0.55, moistureRoot: 0.48, historicalPercentile: 0.95 });
    Object.assign(v.flood, { stagePercentile: 0.88, stageTrend: 0.08 });
  }
  if (preset === "fire") {
    Object.assign(v.weather, { weatherCode: 0, windMph: 18, gustMph: 28, precipitation1hMm: 0 });
    Object.assign(v.wildfire, { nearestFireMiles: 4, fireAgeMinutes: 12, firePower: 40, redFlagAlert: true });
  }
  return v;
}
