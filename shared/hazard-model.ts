// HazardCast inference: next-day hazard probabilities from 48h-lead forecasts.
// Mirrors scripts/prepare_hazard_features.py (daily aggregation) and
// scripts/train_hazards.py (network, Platt calibration, OverallCast); parity is
// checked against exported samples in tests/unit/hazard-model.test.ts.
import type { Category, DataMode, HazardDay, HazardForecast, HazardHour, HazardKey, HazardModelBundle, Layer } from "./types";
import { heatIndex } from "./model";

export const HAZARD_KEYS: HazardKey[] = ["wind", "flood", "lightning", "fire", "heat"];
// Learned hazards feed existing channels. Soil stays GroundCast; wildlife stays crew/public evidence.
export const HAZARD_CHANNELS: Record<HazardKey, Category> = { wind: "weather", flood: "flood", lightning: "lightning", fire: "wildfire", heat: "heat" };
export const HAZARD_NAMES: Record<HazardKey, string> = { wind: "WindCast", flood: "FloodCast", lightning: "StormCast", fire: "FireCast", heat: "HeatEventCast" };
export const HAZARD_EVENTS: Record<HazardKey, string> = { wind: "damaging wind", flood: "flooding", lightning: "a severe thunderstorm", fire: "a fire detection", heat: "a heat advisory or warning" };
export interface HazardEvidence { day: HazardDay; mode: DataMode; modelVersion: string; issuedAt: string }
export const HAZARD_FEATURES = ["tmax_c", "tmin_c", "rh_mean", "dewpoint_max_c", "heat_index_max_f", "rain_total_mm", "rain_max_1h_mm", "rain_hours",
  "wind_max_kmh", "gust_max_kmh", "cape_max", "cape_mean", "rain_prior_3d_mm", "rain_prior_7d_mm",
  "season_sin", "season_cos", "latitude", "longitude", "heatcast_max_p90", "groundcast_max_p90", "groundcast_ratio_p90",
  "fema_sfha_point", "fema_sfha_1mi", "fema_coastal_v_2mi", "fema_known", "leveed_area", "levee_near_miles", "boreholes_5mi_log", "levee_known", "tide_miles_log"];
const MIN_HOURS = 20;

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, z))));
const logit = (p: number) => { const q = Math.min(1 - 1e-6, Math.max(1e-6, p)); return Math.log(q / (1 - q)); };
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function hazardScore(probability: number, anchors: [number, number][]): number {
  if (probability <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++)
    if (probability <= anchors[i][0]) {
      const [x0, y0] = anchors[i - 1], [x1, y1] = anchors[i];
      return y0 + (y1 - y0) * (probability - x0) / (x1 - x0);
    }
  return anchors[anchors.length - 1][1];
}

function dense(layers: Layer[], x: number[]): number {
  let v = x;
  layers.forEach((layer, index) => {
    v = layer.bias.map((b, j) => {
      const sum = b + v.reduce((s, a, i) => s + a * layer.weights[i][j], 0);
      return index < layers.length - 1 ? Math.max(0, sum) : sum;
    });
  });
  return v[0];
}

export function hazardProbabilities(bundle: HazardModelBundle, x: number[]): Record<HazardKey | "overall", number> {
  const xn = x.map((v, i) => (v - bundle.mean[i]) / bundle.std[i]);
  const p = Object.fromEntries(HAZARD_KEYS.map(key => {
    const net = bundle.hazards[key];
    return [key, sigmoid(net.platt[0] * dense(net.layers, xn) + net.platt[1])];
  })) as Record<HazardKey, number>;
  const z = bundle.overall.inputs.map((key, i) => logit(p[key]) - bundle.overall.inputMean[i]);
  return { ...p, overall: sigmoid(bundle.overall.intercept + z.reduce((s, v, i) => s + v * bundle.overall.coefficients[i], 0)) };
}

// Log-odds contribution of each hazard relative to an average validation/calibration day.
export function overallContributions(bundle: HazardModelBundle, p: Record<HazardKey, number>): Record<HazardKey, number> {
  return Object.fromEntries(bundle.overall.inputs.map((key, i) =>
    [key, Math.round(bundle.overall.coefficients[i] * (logit(p[key]) - bundle.overall.inputMean[i]) * 1000) / 1000])) as Record<HazardKey, number>;
}

const dayOfYear = (date: string) => (Date.parse(`${date}T00:00:00Z`) - Date.UTC(Number(date.slice(0, 4)), 0, 1)) / 86400000;

// Daily aggregation for one site-local date. `hours` are that date's hours;
// `priorRain` is hourly forecast rain for the 168 hours before local midnight.
export function dailyHazardFeatures(date: string, site: { latitude: number; longitude: number }, hours: HazardHour[], priorRain: (number | null)[],
  soilP90: number, traits: number[]): number[] | null {
  const complete = hours.filter(h => [h.temperature, h.humidity, h.precipitation, h.wind, h.gust, h.cape, h.dewPoint, h.heatcastP90, h.groundcastP90].every(finite));
  if (complete.length < MIN_HOURS || priorRain.length !== 168 || !priorRain.every(finite) || !finite(soilP90) || soilP90 <= 0 || traits.length !== 9) return null;
  const max = (f: (h: HazardHour) => number) => Math.max(...complete.map(f));
  const min = (f: (h: HazardHour) => number) => Math.min(...complete.map(f));
  const sum = (f: (h: HazardHour) => number) => complete.reduce((s, h) => s + f(h), 0);
  const rain = priorRain as number[], doy = dayOfYear(date) * 2 * Math.PI / 365.25, groundcast = max(h => h.groundcastP90);
  return [max(h => h.temperature), min(h => h.temperature), sum(h => h.humidity) / complete.length, max(h => h.dewPoint),
    max(h => heatIndex(h.temperature, h.humidity)), sum(h => h.precipitation), max(h => h.precipitation), complete.filter(h => h.precipitation >= 0.5).length,
    max(h => h.wind), max(h => h.gust), max(h => h.cape), sum(h => h.cape) / complete.length,
    rain.slice(-72).reduce((s, v) => s + v, 0), rain.reduce((s, v) => s + v, 0),
    Math.sin(doy), Math.cos(doy), site.latitude, site.longitude, max(h => h.heatcastP90), groundcast, groundcast / soilP90, ...traits];
}

export function hazardDay(bundle: HazardModelBundle, date: string, x: number[]): HazardDay {
  return hazardDayFromProbabilities(bundle, date, hazardProbabilities(bundle, x));
}

export function hazardDayFromProbabilities(bundle: HazardModelBundle, date: string, p: Record<HazardKey | "overall", number>): HazardDay {
  const month = Number(date.slice(5, 7)) - 1;
  const hazards = Object.fromEntries(HAZARD_KEYS.map(key => [key, {
    probability: round(p[key]), score: round(hazardScore(p[key], bundle.scoreAnchors), 2), climatology: bundle.hazards[key].climatology[month] }])) as HazardDay["hazards"];
  return { date, hazards, overall: { probability: round(p.overall), score: round(hazardScore(p.overall, bundle.scoreAnchors), 2),
    climatology: bundle.overall.climatology[month], contributions: overallContributions(bundle, p) } };
}

export interface HistoricalHazardFile { version: string; dates: string[]; sites: Record<string, Record<HazardKey | "overall", (number | null)[]>> }
// Bundled test-period predictions (public/data/hazard-forecasts.json) for demo and replay.
export function historicalHazardForecasts(bundle: HazardModelBundle, file: HistoricalHazardFile): Record<string, HazardForecast> {
  if (file.version !== bundle.version) return {};
  return Object.fromEntries(Object.entries(file.sites).map(([siteId, series]) => {
    const days = file.dates.flatMap((date, i) => {
      const p = Object.fromEntries([...HAZARD_KEYS, "overall"].map(k => [k, series[k as HazardKey][i]])) as Record<HazardKey | "overall", number | null>;
      return Object.values(p).every(finite) ? [hazardDayFromProbabilities(bundle, date, p as Record<HazardKey | "overall", number>)] : [];
    });
    const issuedAt = new Date(Date.parse(`${file.dates[0]}T00:00:00Z`) - 48 * 3600000).toISOString();
    return [siteId, { siteId, mode: "historical", fetchedAt: bundle.createdAt, issuedAt, modelVersion: bundle.version, days } satisfies HazardForecast];
  }).filter(([, f]) => (f as HazardForecast).days.length));
}

export function hazardForecast(bundle: HazardModelBundle, siteId: string, mode: DataMode, fetchedAt: string, issuedAt: string, days: { date: string; x: number[] | null }[]): HazardForecast | null {
  const valid = days.filter((d): d is { date: string; x: number[] } => d.x !== null).map(d => hazardDay(bundle, d.date, d.x));
  return valid.length ? { siteId, mode, fetchedAt, issuedAt, modelVersion: bundle.version, days: valid } : null;
}

// A live hazard forecast is usable for a site-local date while fresh and issued;
// historical forecasts serve demo/replay briefings for their own dates only.
export function hazardEvidence(forecast: HazardForecast | undefined, siteId: string, date: string, now: number, ttlHours: number): HazardEvidence | null {
  if (!forecast || forecast.siteId !== siteId || Date.parse(forecast.issuedAt) > now) return null;
  if (forecast.mode === "live" && (now < Date.parse(forecast.fetchedAt) || now - Date.parse(forecast.fetchedAt) >= ttlHours * 3600000)) return null;
  const day = forecast.days.find(d => d.date === date);
  return day ? { day, mode: forecast.mode, modelVersion: forecast.modelVersion, issuedAt: forecast.issuedAt } : null;
}

export function describeHazard(key: HazardKey, h: HazardDay["hazards"][HazardKey]): string {
  const lift = h.climatology > 0 ? `, ${(h.probability / h.climatology).toFixed(1)}× normal for the month` : "";
  return `${Math.round(h.probability * 100)}% chance of ${HAZARD_EVENTS[key]} within range of the site${lift}`;
}

// Learned site index: OverallCast score, never below the highest channel score.
export function learnedIndex(channelScores: (number | null)[], evidence: HazardEvidence | null): number | null {
  if (!evidence) return null;
  const known = channelScores.filter(finite);
  return Math.round(Math.max(evidence.day.overall.score, ...known) * 10) / 10;
}

const round = (n: number, digits = 4) => Math.round(n * 10 ** digits) / 10 ** digits;
