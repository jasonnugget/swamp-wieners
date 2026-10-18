import type { Site } from "./types";

export type ScenarioPresetId = "florida-hurricane" | "gulf-hurricane" | "inland-flood";
export type ScenarioKind = "hurricane" | "rainfall";
export type ScenarioLayer = "wind" | "rain" | "runoff";
export interface ScenarioPoint { latitude: number; longitude: number }
export interface ScenarioConfig {
  presetId: ScenarioPresetId;
  maxWindMph: number;
  rainRateMmH: number;
  radiusKm: number;
  drainageMmH: number;
  durationHours: number;
  latitudeOffset?: number;
  longitudeOffset?: number;
}
export interface ScenarioPreset {
  id: ScenarioPresetId;
  name: string;
  description: string;
  kind: ScenarioKind;
  track: readonly ScenarioPoint[];
  defaults: ScenarioConfig;
}
export interface ScenarioSample {
  distanceKm: number;
  windMph: number;
  rainRateMmH: number;
}
export interface ScenarioSiteImpact extends ScenarioSample {
  siteId: string;
  peakWindMph: number;
  accumulatedRainMm: number;
  /** Accumulated rain exceeding assumed drainage. Never flood-water depth. */
  runoffMm: number;
  /** Rain over the trailing 24 simulated hours, the window the flood channel scores. */
  rainLast24hMm: number;
  windExposureMphHours: number;
}
export interface ScenarioFrame {
  mode: "SIMULATED";
  kind: ScenarioKind;
  hour: number;
  config: ScenarioConfig;
  center: ScenarioPoint;
  track: ScenarioPoint[];
  traveledTrack: ScenarioPoint[];
  progress: number;
  active: boolean;
  travelSpeedKmh: number;
  impacts: Record<string, ScenarioSiteImpact>;
  limitations: readonly string[];
}

export const SCENARIO_LIMITS = {
  maxWindMph: [0, 200], rainRateMmH: [0, 80], radiusKm: [40, 400],
  drainageMmH: [0, 50], durationHours: [12, 72],
  latitudeOffset: [-5, 5], longitudeOffset: [-5, 5],
} as const;

export const SCENARIO_PRESETS: readonly ScenarioPreset[] = [
  {
    id: "florida-hurricane", name: "Florida crossing", kind: "hurricane",
    description: "An invented Gulf-to-Atlantic hurricane track across the Florida peninsula.",
    track: [{ latitude: 23.5, longitude: -84.8 }, { latitude: 25.6, longitude: -82.4 }, { latitude: 27.6, longitude: -80.9 }, { latitude: 30, longitude: -78.7 }],
    defaults: { presetId: "florida-hurricane", maxWindMph: 115, rainRateMmH: 22, radiusKm: 180, drainageMmH: 8, durationHours: 48, latitudeOffset: 0, longitudeOffset: 0 },
  },
  {
    id: "gulf-hurricane", name: "Gulf landfall", kind: "hurricane",
    description: "An invented northern Gulf landfall continuing into the Mississippi Valley.",
    track: [{ latitude: 25.2, longitude: -91.8 }, { latitude: 27.5, longitude: -90.4 }, { latitude: 29.6, longitude: -90.2 }, { latitude: 32.4, longitude: -89.6 }, { latitude: 35, longitude: -88.4 }],
    defaults: { presetId: "gulf-hurricane", maxWindMph: 130, rainRateMmH: 26, radiusKm: 240, drainageMmH: 8, durationHours: 60, latitudeOffset: 0, longitudeOffset: 0 },
  },
  {
    id: "inland-flood", name: "Inland rain corridor", kind: "rainfall",
    description: "An invented slow rain corridor from eastern Texas toward the Ohio Valley.",
    track: [{ latitude: 31.3, longitude: -95.8 }, { latitude: 34.1, longitude: -94.1 }, { latitude: 36.6, longitude: -91.7 }, { latitude: 38.7, longitude: -88.6 }, { latitude: 40, longitude: -85.5 }],
    defaults: { presetId: "inland-flood", maxWindMph: 25, rainRateMmH: 28, radiusKm: 140, drainageMmH: 6, durationHours: 60, latitudeOffset: 0, longitudeOffset: 0 },
  },
];
export const DEFAULT_SCENARIO_CONFIG: ScenarioConfig = { ...SCENARIO_PRESETS[0].defaults };
export const SCENARIO_LIMITATIONS = [
  "Synthetic what-if scenario, not a weather forecast or work authorization.",
  "Track, sustained wind, rain, footprint, duration and drainage are user assumptions. Intensity stays constant along the route; inland weakening is not modeled.",
  "Circular wind and rain fields omit terrain, buildings, wind asymmetry, storm surge, rivers and soil saturation.",
  "Runoff is accumulated rain excess above assumed drainage, not flood-water depth, inundation, equipment damage or outage probability.",
  "Exposure uses quarter-hour numerical sampling. Current evidence, unknowns and independent operational holds remain separate.",
] as const;

const EARTH_KM = 6371.0088;
const RAD = Math.PI / 180;
const STEP_HOURS = .25;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function bounded(value: number, bounds: readonly [number, number], name: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return clamp(value, bounds[0], bounds[1]);
}

export function normalizeScenarioConfig(config: ScenarioConfig): ScenarioConfig {
  if (!SCENARIO_PRESETS.some(preset => preset.id === config.presetId)) throw new RangeError("Unknown scenario preset");
  return {
    presetId: config.presetId,
    maxWindMph: bounded(config.maxWindMph, SCENARIO_LIMITS.maxWindMph, "Maximum wind"),
    rainRateMmH: bounded(config.rainRateMmH, SCENARIO_LIMITS.rainRateMmH, "Rain rate"),
    radiusKm: bounded(config.radiusKm, SCENARIO_LIMITS.radiusKm, "Footprint radius"),
    drainageMmH: bounded(config.drainageMmH, SCENARIO_LIMITS.drainageMmH, "Drainage"),
    durationHours: bounded(config.durationHours, SCENARIO_LIMITS.durationHours, "Duration"),
    latitudeOffset: bounded(config.latitudeOffset ?? 0, SCENARIO_LIMITS.latitudeOffset, "Latitude shift"),
    longitudeOffset: bounded(config.longitudeOffset ?? 0, SCENARIO_LIMITS.longitudeOffset, "Longitude shift"),
  };
}

function distanceKm(a: ScenarioPoint, b: ScenarioPoint) {
  const lat = (b.latitude - a.latitude) * RAD, lon = (b.longitude - a.longitude) * RAD;
  const haversine = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * RAD) * Math.cos(b.latitude * RAD) * Math.sin(lon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(clamp(haversine, 0, 1)));
}

function interpolate(a: ScenarioPoint, b: ScenarioPoint, fraction: number, kilometers: number): ScenarioPoint {
  if (kilometers < .000001) return { ...a };
  const angle = kilometers / EARTH_KM;
  const first = Math.sin((1 - fraction) * angle) / Math.sin(angle), second = Math.sin(fraction * angle) / Math.sin(angle);
  const vector = (point: ScenarioPoint) => [Math.cos(point.latitude * RAD) * Math.cos(point.longitude * RAD), Math.cos(point.latitude * RAD) * Math.sin(point.longitude * RAD), Math.sin(point.latitude * RAD)];
  const av = vector(a), bv = vector(b), [x, y, z] = av.map((value, index) => value * first + bv[index] * second);
  return { latitude: Math.atan2(z, Math.hypot(x, y)) / RAD, longitude: Math.atan2(y, x) / RAD };
}

function prepare(input: ScenarioConfig) {
  const config = normalizeScenarioConfig(input);
  const preset = SCENARIO_PRESETS.find(item => item.id === config.presetId)!;
  const track = preset.track.map(point => ({ latitude: point.latitude + config.latitudeOffset!, longitude: point.longitude + config.longitudeOffset! }));
  const segments = track.slice(1).map((point, index) => distanceKm(track[index], point));
  return { config, kind: preset.kind, track, segments, lengthKm: segments.reduce((sum, length) => sum + length, 0) };
}
type Prepared = ReturnType<typeof prepare>;

function trackPosition(scenario: Prepared, hour: number) {
  const progress = clamp(hour / scenario.config.durationHours, 0, 1);
  let remaining = progress * scenario.lengthKm;
  const traveledTrack = [{ ...scenario.track[0] }];
  for (let index = 0; index < scenario.segments.length; index++) {
    const length = scenario.segments[index];
    if (remaining < length) {
      const center = interpolate(scenario.track[index], scenario.track[index + 1], remaining / length, length);
      if (remaining > 0) traveledTrack.push(center);
      return { center, traveledTrack, progress };
    }
    traveledTrack.push({ ...scenario.track[index + 1] });
    remaining -= length;
  }
  return { center: { ...scenario.track.at(-1)! }, traveledTrack, progress };
}

function windAtDistance(scenario: Prepared, distance: number) {
  if (distance >= scenario.config.radiusKm) return 0;
  const fraction = distance / scenario.config.radiusKm;
  // A deliberately schematic eye/eyewall, not a calibrated hurricane wind model.
  const eye = .16;
  const windFraction = scenario.kind === "hurricane"
    ? fraction <= eye ? fraction / eye : (eye / fraction) ** .7 * (1 - ((fraction - eye) / (1 - eye)) ** 2)
    : (1 - fraction) ** 2;
  return scenario.config.maxWindMph * windFraction;
}

function sample(scenario: Prepared, center: ScenarioPoint, active: boolean, point: ScenarioPoint): ScenarioSample {
  const distance = distanceKm(center, point), radius = scenario.config.radiusKm;
  if (!active || distance >= radius) return { distanceKm: distance, windMph: 0, rainRateMmH: 0 };
  return {
    distanceKm: distance,
    windMph: windAtDistance(scenario, distance),
    rainRateMmH: scenario.config.rainRateMmH * (1 - (distance / radius) ** 2) ** 2,
  };
}

function peakWind(scenario: Prepared, traveled: ScenarioPoint[], point: ScenarioPoint) {
  let peak = windAtDistance(scenario, distanceKm(traveled[0], point));
  const vector = (p: ScenarioPoint) => [Math.cos(p.latitude * RAD) * Math.cos(p.longitude * RAD), Math.cos(p.latitude * RAD) * Math.sin(p.longitude * RAD), Math.sin(p.latitude * RAD)];
  const dot = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const site = vector(point);
  for (let index = 1; index < traveled.length; index++) {
    const a = vector(traveled[index - 1]), b = vector(traveled[index]);
    const angle = distanceKm(traveled[index - 1], traveled[index]) / EARTH_KM;
    if (angle < 1e-10) continue;
    const tangent = b.map((value, axis) => (value - a[axis] * Math.cos(angle)) / Math.sin(angle));
    const first = dot(site, a), second = dot(site, tangent);
    // The dot product along a great-circle arc is A cos(t) + B sin(t).
    // Its extrema give the continuous distance range, avoiding a peak that
    // changes with playback cadence or drops between integration samples.
    const candidates = [first, dot(site, b)], stationary = Math.atan2(second, first);
    for (let turn = -1; turn <= 2; turn++) {
      const at = stationary + turn * Math.PI;
      if (at > 0 && at < angle) candidates.push(first * Math.cos(at) + second * Math.sin(at));
    }
    const closest = EARTH_KM * Math.acos(clamp(Math.max(...candidates), -1, 1));
    const farthest = EARTH_KM * Math.acos(clamp(Math.min(...candidates), -1, 1));
    const eyewall = scenario.config.radiusKm * .16;
    if (scenario.kind === "hurricane" && closest <= eyewall && farthest >= eyewall) return scenario.config.maxWindMph;
    peak = Math.max(peak, windAtDistance(scenario, closest), windAtDistance(scenario, farthest));
  }
  return peak;
}

function validatePoint(point: ScenarioPoint) {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) throw new RangeError("Scenario location requires valid latitude and longitude");
}

export function sampleScenarioPoint(config: ScenarioConfig, hour: number, point: ScenarioPoint): ScenarioSample {
  validatePoint(point);
  const scenario = prepare(config), time = bounded(hour, [0, 72], "Scenario hour");
  return sample(scenario, trackPosition(scenario, time).center, time < scenario.config.durationHours, point);
}

/** The Saffir–Simpson thresholds describe sustained wind only, never flood severity. */
export function scenarioWindCategory(maxWindMph: number): string {
  if (!Number.isFinite(maxWindMph)) throw new RangeError("Maximum wind must be finite");
  if (maxWindMph >= 157) return "Category 5";
  if (maxWindMph >= 130) return "Category 4";
  if (maxWindMph >= 111) return "Category 3";
  if (maxWindMph >= 96) return "Category 2";
  if (maxWindMph >= 74) return "Category 1";
  return maxWindMph >= 39 ? "Tropical storm" : "Below tropical-storm strength";
}

export function buildScenarioFrame(input: ScenarioConfig, hour: number, sites: readonly Pick<Site, "id" | "latitude" | "longitude">[]): ScenarioFrame {
  const scenario = prepare(input), time = bounded(hour, [0, 72], "Scenario hour");
  const { config } = scenario, location = trackPosition(scenario, time), active = time < config.durationHours;
  const until = Math.min(time, config.durationHours);
  const steps: { center: ScenarioPoint; hours: number; start: number }[] = [];
  for (let start = 0; start < until; start += STEP_HOURS) {
    const end = Math.min(start + STEP_HOURS, config.durationHours);
    // Fixed midpoint samples keep cumulative totals monotonic during scrubbing,
    // including a partially elapsed final integration cell.
    steps.push({ center: trackPosition(scenario, (start + end) / 2).center, hours: Math.min(end, until) - start, start });
  }
  const impacts: Record<string, ScenarioSiteImpact> = {};
  for (const site of sites) {
    validatePoint(site);
    const instantaneous = sample(scenario, location.center, active, site);
    let accumulatedRainMm = 0, runoffMm = 0, rainLast24hMm = 0, windExposureMphHours = 0;
    for (const step of steps) {
      const reading = sample(scenario, step.center, true, site);
      accumulatedRainMm += reading.rainRateMmH * step.hours;
      if (step.start >= time - 24) rainLast24hMm += reading.rainRateMmH * step.hours;
      runoffMm += Math.max(0, reading.rainRateMmH - config.drainageMmH) * step.hours;
      windExposureMphHours += reading.windMph * step.hours;
    }
    impacts[site.id] = { siteId: site.id, ...instantaneous, peakWindMph: peakWind(scenario, location.traveledTrack, site), accumulatedRainMm, runoffMm, rainLast24hMm, windExposureMphHours };
  }
  return {
    mode: "SIMULATED", kind: scenario.kind, hour: time, config,
    ...location, track: scenario.track, active,
    travelSpeedKmh: scenario.lengthKm / config.durationHours,
    impacts, limitations: SCENARIO_LIMITATIONS,
  };
}
