import type { Alert, Category, Forecast, HazardReport } from "./types";
import type { HazardScore, RiskExplanation, RiskFactor, SiteObservationV1 } from "./risk";
import { RISK_CONFIG as C } from "./risk-config";
import { crewEvidence } from "./crew-risk";

export const clampScore = (n: number) => Math.max(0, Math.min(10, n));
export const roundScore = (n: number) => Math.round(clampScore(n) * 10) / 10;
const valid = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
export function curve(value: number | null | undefined, anchors: readonly (readonly [number, number])[]): number | null {
  if (!valid(value)) return null;
  if (value <= anchors[0][0]) return clampScore(anchors[0][1]);
  for (let i = 1; i < anchors.length; i++) {
    const [x, y] = anchors[i], [previousX, previousY] = anchors[i - 1];
    if (value <= x) return clampScore(previousY + (y - previousY) * (value - previousX) / (x - previousX));
  }
  return clampScore(anchors[anchors.length - 1][1]);
}
function weighted(values: (number | null)[], weights: readonly number[]): number | null {
  let total = 0, weight = 0;
  values.forEach((value, i) => { if (valid(value)) { total += clampScore(value) * weights[i]; weight += weights[i]; } });
  return weight ? total / weight : null;
}
// Independent evidence supplies a floor and a small headroom-limited reinforcement.
// Repeated reports in a category are collapsed to their strongest evidence before merging.
export function mergeEvidence(a: number | null, b: number | null): number | null {
  if (!valid(a)) return valid(b) ? clampScore(b) : null;
  if (!valid(b)) return clampScore(a);
  const high = Math.max(clampScore(a), clampScore(b)), low = Math.min(clampScore(a), clampScore(b));
  return high + (10 - high) * C.reinforcement * (low / 10) ** 2;
}
export function scoreHeat(heatIndexF: number | null, apparentF: number | null = null): number | null {
  return curve(valid(heatIndexF) ? heatIndexF : apparentF, C.heat);
}
export function scoreWind(windMph: number | null): number | null { return curve(windMph, C.wind); }
export function scoreWeather(w: Pick<SiteObservationV1["weather"], "windMph" | "gustMph" | "precipitation1hMm"> & Partial<Pick<SiteObservationV1["weather"], "weatherCode">>): number | null {
  const combined = mergeEvidence(mergeEvidence(scoreWind(w.windMph), scoreWind(w.gustMph)), curve(w.precipitation1hMm, C.rain1h));
  const conditionFloor = valid(w.weatherCode) ? C.weatherCodeFloors[w.weatherCode] ?? null : null;
  return floor(combined, conditionFloor);
}
export function soilFromTrainingAnchors(moisture: number | null, thresholds?: number[]): number | null {
  if (!thresholds || thresholds.length !== 3 || !thresholds.every(Number.isFinite) ||
    !(thresholds[0] > 0 && thresholds[0] < thresholds[1] && thresholds[1] < thresholds[2] && thresholds[2] < 1)) return null;
  return curve(moisture, [[0, 0], [thresholds[0], C.soilAnchorScores[0]], [thresholds[1], C.soilAnchorScores[1]], [thresholds[2], C.soilAnchorScores[2]], [1, 10]]);
}
export function scoreSoil(soil: SiteObservationV1["soil"], thresholds?: number[]): number | null {
  if (valid(soil.historicalPercentile)) return curve(soil.historicalPercentile, C.soilPercentile);
  const values = [soil.moistureSurface, soil.moistureRoot];
  // Root-zone depth differs from the surface model target: use only surface training anchors.
  const surface = soilFromTrainingAnchors(soil.moistureSurface, thresholds);
  return surface ?? weighted(values.map(v => curve(v, C.soilFallback)), C.weights.soil);
}
export function alertFloor(alert: Pick<Alert, "category" | "title" | "event" | "severity">): number {
  const event = (alert.event ?? alert.title).toLowerCase();
  if (/flash flood warning/.test(event)) return C.alertFloors.flashFloodWarning;
  if (/flood warning/.test(event)) return C.alertFloors.floodWarning;
  if (/red flag/.test(event)) return C.alertFloors.redFlag;
  if (/warning/.test(event)) return C.alertFloors.warning;
  if (/watch/.test(event)) return C.alertFloors.watch;
  if (/advisory/.test(event)) return C.alertFloors.advisory;
  // Legacy records lack exact event names. Severity remains a bounded evidence floor.
  return Math.min(8, Math.max(C.alertFloors.advisory, valid(alert.severity) ? alert.severity : 0));
}
function floor(value: number | null, minimum: number | null): number | null {
  if (!valid(value)) return minimum;
  return valid(minimum) ? Math.max(value, minimum) : value;
}
type FloodInputs = {
  weather: Pick<SiteObservationV1["weather"], "precipitation1hMm" | "precipitation24hMm" | "precipitation7dMm">;
  flood: Pick<SiteObservationV1["flood"], "stagePercentile" | "stageTrend" | "floodplain" | "floodAlert">;
};
function floodParts(o: FloodInputs) {
  return [weighted([curve(o.weather.precipitation1hMm, C.rain1h), curve(o.weather.precipitation24hMm, C.rain24h), curve(o.weather.precipitation7dMm, C.rain7d)], C.weights.rain),
    weighted([curve(o.flood.stagePercentile, C.gaugePercentile), curve(o.flood.stageTrend, C.gaugeTrend)], C.weights.gauge),
    o.flood.floodplain === null ? null : o.flood.floodplain ? C.floodplainExposure : 0];
}
export function scoreFlood(o: FloodInputs, alerts: Alert[] = []): number | null {
  const floors = alerts.filter(a => a.category === "flood").map(alertFloor);
  const minimum = floors.length ? Math.max(...floors) : o.flood.floodAlert === true ? C.alertFloors.floodWarning : null;
  // A negative alert check alone is not evidence of zero flood risk.
  return floor(weighted(floodParts(o), C.weights.flood), minimum);
}
export function scoreLightning(l: Omit<SiteObservationV1["lightning"], "evidenceMode">): number | null {
  const detected = mergeEvidence(curve(l.nearestStrikeMiles, C.strikeDistance), curve(l.strikes10mi30m, C.strikeCount));
  return mergeEvidence(detected, curve(l.forecastPotential, C.stormPotential));
}
function fireParts(o: SiteObservationV1) {
  const f = o.wildfire;
  return [curve(f.nearestFireMiles, C.fireDistance), curve(f.firePower, C.firePower), curve(f.fireAgeMinutes, C.detectionAge),
    scoreWind(o.weather.windMph), curve(o.weather.humidityPct, C.dryness)];
}
export function scoreWildfire(o: SiteObservationV1): number | null {
  const f = o.wildfire, parts = fireParts(o);
  // Distance alone is explicitly provisional; age/power/wind/dryness alter the result.
  const fire = valid(f.nearestFireMiles) ? weighted(parts, C.weights.wildfire) : null;
  return floor(fire, f.redFlagAlert === true ? C.alertFloors.redFlag : null);
}
export function scoreWildlife(w: SiteObservationV1["wildlife"], now?: number): number | null {
  const base = weighted([curve(w.dangerousSightings24h, C.wildlifeCount), curve(w.nearestSightingMiles, C.wildlifeDistance)], C.weights.wildlife);
  if (base === null) return null; // Local absence of reports cannot establish absence of wildlife.
  const ageHours = now !== undefined && w.latestSightingAt ? (now - Date.parse(w.latestSightingAt)) / 3600000 : 0;
  if (!Number.isFinite(ageHours) || ageHours < 0) return null;
  const classified = w.severity ? floor(base, C.severity[w.severity])! : base;
  return classified * Math.max(C.wildlifeRecency.minimumRetention, 2 ** (-ageHours / C.wildlifeRecency.halfLifeHours));
}
export function explainComposite(channels: { hazard: Category; score: number | null }[]): RiskExplanation {
  const sorted = channels.filter((c): c is { hazard: Category; score: number } => valid(c.score))
    .map(c => ({ ...c, score: clampScore(c.score) })).sort((a, b) => b.score - a.score || a.hazard.localeCompare(b.hazard));
  const primary = sorted[0]?.score > 0 ? sorted[0] : null;
  const compounding = sorted.slice(1).filter(c => c.score > C.composite.noiseFloor).map(c => ({ ...c,
    strength: ((c.score - C.composite.noiseFloor) / (10 - C.composite.noiseFloor)) ** 2 }));
  const secondaryStrength = compounding.reduce((sum, c) => sum + c.strength, 0);
  const uplift = primary ? (10 - primary.score) * (1 - Math.exp(-C.composite.strength * secondaryStrength)) : 0;
  return { formula: `primary + (10-primary) * (1-exp(-${C.composite.strength}*sum((max(0,secondary-${C.composite.noiseFloor})/${10 - C.composite.noiseFloor})^2)))`, primary, compounding, secondaryStrength, uplift };
}
export function calculateCompositeRisk(channels: { score: number | null }[]): number | null {
  const known = channels.flatMap(c => valid(c.score) ? [clampScore(c.score)] : []).sort((a, b) => b - a);
  if (!known.length) return null;
  const strength = known.slice(1).reduce((sum, n) => sum + (Math.max(0, n - C.composite.noiseFloor) / (10 - C.composite.noiseFloor)) ** 2, 0);
  return roundScore(known[0] + (10 - known[0]) * (1 - Math.exp(-C.composite.strength * strength)));
}
export interface ScoringContext {
  now: number;
  reports?: HazardReport[];
  alerts?: Alert[];
  forecast?: Forecast;
  soilThresholds?: number[];
}
function modelFactors(o: SiteObservationV1, context: ScoringContext): Partial<Record<Category, RiskFactor>> {
  const f = context.forecast, now = context.now;
  if (!f || f.siteId !== o.siteId || f.mode !== "live" || now < Date.parse(f.fetchedAt) || now - Date.parse(f.fetchedAt) >= C.modelWindow.fetchTtlHours * 3600000) return {};
  const hours = f.hours.filter(h => Date.parse(h.time) >= now - C.modelWindow.lookbackHours * 3600000 && Date.parse(h.time) <= now + C.modelWindow.horizonHours * 3600000 && Date.parse(h.issuedAt) <= now &&
    h.heat.length === 3 && h.soil.length === 3 && [...h.heat, ...h.soil].every(Number.isFinite));
  if (!hours.length) return {};
  const make = (hazard: "heat" | "soil", value: number): RiskFactor => ({ key: hazard === "heat" ? "heatCast" : "groundCast", value,
    score: hazard === "heat" ? scoreHeat(value) : scoreSoil({ moistureSurface: value, moistureRoot: null, historicalPercentile: null }, context.soilThresholds),
    weight: 1, confidence: C.confidence.model, kind: "forecast", mode: f.mode, source: `${hazard === "heat" ? "HeatCast" : "GroundCast"} ${f.modelVersion}: forecast upper quantile, not current measurement`,
    validFrom: new Date(Math.min(...hours.map(h => Date.parse(h.time)))).toISOString(), validTo: new Date(Math.max(...hours.map(h => Date.parse(h.time)))).toISOString() });
  return { heat: make("heat", Math.max(...hours.map(h => h.heat[2]))), soil: make("soil", Math.max(...hours.map(h => h.soil[2]))) };
}
export function scoreChannels(o: SiteObservationV1, context: ScoringContext): HazardScore[] {
  const alerts = (context.alerts ?? []).filter(a => a.siteId === o.siteId && a.mode === "live" && Date.parse(a.expiresAt) > context.now);
  const models = modelFactors(o, context);
  const factor = (key: string, value: RiskFactor["value"], score: number | null, weight = 1, confidence = 1): RiskFactor => {
    const path = key === "flood.gauge" ? (o.flood.stagePercentile !== null ? "flood.stagePercentile" : "flood.stageTrend") : key;
    const metadata = o.provenance.fieldEvidence[path];
    return { key, value, score, weight, kind: o.provenance.mode === "forecast" && (key.startsWith("weather.") || key.startsWith("soil.") || key === "flood.rainfall" || key === "lightning.forecastPotential") ? "forecast" : "environment", mode: "live", confidence: score === null ? 0 : Math.min(confidence, metadata?.confidence ?? 1),
      source: o.provenance.fieldSources[path] ?? o.provenance.source, ...(metadata?.observedAt ? { validFrom: metadata.observedAt } : {}) };
  };
  const w = o.weather, f = o.wildfire, s = o.soil;
  const soilScore = scoreSoil(s, context.soilThresholds);
  const calibratedSoil = soilFromTrainingAnchors(s.moistureSurface, context.soilThresholds) !== null;
  const soilConfidence = s.historicalPercentile !== null ? 1 : calibratedSoil ? C.confidence.soilTraining : C.confidence.soilFallback;
  const flood = floodParts(o), fire = fireParts(o);
  const rainCompleteness = [w.precipitation1hMm, w.precipitation24hMm, w.precipitation7dMm].reduce<number>((sum, v, i) => sum + (v !== null ? C.weights.rain[i] : 0), 0);
  const gaugeCompleteness = (o.flood.stagePercentile !== null ? C.weights.gauge[0] : 0) + (o.flood.stageTrend !== null ? C.weights.gauge[1] : 0);
  const factors: Record<Category, RiskFactor[]> = {
    heat: [factor(w.heatIndexF !== null ? "weather.heatIndexF" : "weather.apparentTemperatureF", w.heatIndexF ?? w.apparentTemperatureF, scoreHeat(w.heatIndexF, w.apparentTemperatureF), 1, w.heatIndexF !== null ? 1 : C.confidence.apparent)],
    weather: [factor("weather.windMph", w.windMph, scoreWind(w.windMph), C.weights.weather[0]), factor("weather.gustMph", w.gustMph, scoreWind(w.gustMph), C.weights.weather[1]), factor("weather.precipitation1hMm", w.precipitation1hMm, curve(w.precipitation1hMm, C.rain1h), C.weights.weather[2]), factor("weather.weatherCode", w.weatherCode, valid(w.weatherCode) ? C.weatherCodeFloors[w.weatherCode] ?? null : null, C.weights.weather[3])],
    soil: [factor("soil.moisture", s.historicalPercentile ?? s.moistureSurface ?? s.moistureRoot, soilScore, 1, soilConfidence)],
    lightning: [factor("lightning.nearestStrikeMiles", o.lightning.nearestStrikeMiles, curve(o.lightning.nearestStrikeMiles, C.strikeDistance)), factor("lightning.strikes10mi30m", o.lightning.strikes10mi30m, curve(o.lightning.strikes10mi30m, C.strikeCount)), factor("lightning.forecastPotential", o.lightning.forecastPotential, curve(o.lightning.forecastPotential, C.stormPotential), 1, C.confidence.forecastLightning)],
    flood: [factor("flood.rainfall", w.precipitation24hMm, flood[0], C.weights.flood[0], rainCompleteness), factor("flood.gauge", o.flood.stagePercentile, flood[1], C.weights.flood[1], gaugeCompleteness), factor("flood.floodplain", o.flood.floodplain, flood[2], C.weights.flood[2])],
    wildfire: [factor("wildfire.nearestFireMiles", f.nearestFireMiles, fire[0], C.weights.wildfire[0]), factor("wildfire.firePower", f.firePower, fire[1], C.weights.wildfire[1]), factor("wildfire.fireAgeMinutes", f.fireAgeMinutes, fire[2], C.weights.wildfire[2]), factor("weather.windMph", w.windMph, fire[3], C.weights.wildfire[3]), factor("weather.humidityPct", w.humidityPct, fire[4], C.weights.wildfire[4])],
    wildlife: [factor("wildlife.dangerousSightings24h", o.wildlife.dangerousSightings24h, curve(o.wildlife.dangerousSightings24h, C.wildlifeCount), C.weights.wildlife[0], C.confidence.publicWildlife), factor("wildlife.nearestSightingMiles", o.wildlife.nearestSightingMiles, curve(o.wildlife.nearestSightingMiles, C.wildlifeDistance), C.weights.wildlife[1], C.confidence.publicWildlife)],
  };
  const values: Record<Category, number | null> = { heat: scoreHeat(w.heatIndexF, w.apparentTemperatureF), weather: scoreWeather(w), soil: soilScore,
    lightning: scoreLightning(o.lightning), flood: scoreFlood(o, alerts), wildfire: scoreWildfire(o), wildlife: scoreWildlife(o.wildlife, context.now) };
  return (Object.keys(factors) as Category[]).map(hazard => {
    let value = values[hazard];
    const list = factors[hazard];
    if (models[hazard]) { list.push(models[hazard]!); value = mergeEvidence(value, models[hazard]!.score); }
    if (hazard === "wildfire" && o.wildfire.redFlagAlert !== null) list.push(factor("wildfire.redFlagAlert", o.wildfire.redFlagAlert, o.wildfire.redFlagAlert ? C.alertFloors.redFlag : 0));
    for (const alert of alerts.filter(a => a.category === hazard)) {
      const minimum = alertFloor(alert); value = floor(value, minimum);
      list.push({ key: `alert:${alert.id}`, value: alert.event ?? alert.title, score: minimum, weight: 1, confidence: 1, kind: "official-alert", mode: alert.mode, source: "NWS official alert", validTo: alert.expiresAt });
    }
    const reports = (context.reports ?? []).filter(r => r.siteId === o.siteId && r.category === hazard && r.status === "open" && Date.parse(r.createdAt) <= context.now);
    let crew: number | null = null;
    for (const report of reports) {
      const evidence = crewEvidence(report, context.now);
      crew = crew === null ? evidence.score : Math.max(crew, evidence.score);
      list.push({ key: `crew:${report.id}`, value: evidence.severity, score: evidence.score, weight: 1, confidence: evidence.confidence, kind: "crew", mode: "crew",
        source: evidence.classification ? "Confirmed JEV crew classification" : "Unclassified crew evidence: provisional MODERATE", validFrom: report.createdAt });
    }
    value = mergeEvidence(value, crew);
    const environmental = list.filter(f => !f.key.startsWith("crew:"));
    const confidence = value === null ? 0 : Math.max(
      environmental.reduce((sum, f) => sum + f.weight * f.confidence, 0) / environmental.reduce((sum, f) => sum + f.weight, 0),
      ...list.filter(f => f.key.startsWith("crew:")).map(f => f.confidence));
    return { hazard, score: value === null ? null : roundScore(value), confidence,
      evidence: [value === null ? "No fresh scoring evidence; hazard remains unknown." : `Continuous screen: ${hazard}.`,
        ...(hazard === "soil" && soilConfidence < 1 ? [calibratedSoil ? "Approximation from training-period anchors; not a measured percentile." : "Absolute moisture fallback has low confidence; regional calibration is missing."] : []),
        ...(hazard === "lightning" ? ["Forecast storm potential does not establish detected strikes or detector coverage."] : []),
        ...list.filter(f => f.score !== null).map(f => `${f.key}: ${f.value}; score ${roundScore(f.score!)} (${f.source}).`)], factors: list };
  });
}
