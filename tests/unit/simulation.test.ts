import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Site } from "../../shared/types";
import {
  buildScenarioFrame, sampleScenarioPoint, scenarioWindCategory,
  normalizeScenarioConfig, SCENARIO_PRESETS, DEFAULT_SCENARIO_CONFIG,
  type ScenarioConfig,
} from "../../shared/simulation";

const sites: Site[] = JSON.parse(readFileSync("public/data/sites.json", "utf8"));
const config = DEFAULT_SCENARIO_CONFIG;
const close = (actual: number, expected: number, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const centerSite = (input: ScenarioConfig, hour: number) => ({ id: "synthetic-sampling-point", ...buildScenarioFrame(input, hour, []).center });

test("invented presets produce deterministic bounded exposure for every real plant without operational decisions", () => {
  for (const preset of SCENARIO_PRESETS) {
    const frame = buildScenarioFrame(preset.defaults, 36, sites);
    assert.deepEqual(frame, buildScenarioFrame(preset.defaults, 36, sites));
    assert.equal(frame.mode, "SIMULATED");
    assert.equal(Object.keys(frame.impacts).length, 285);
    assert.ok(frame.limitations.some(limit => limit.includes("not flood-water depth")));
    for (const impact of Object.values(frame.impacts)) {
      for (const [key, value] of Object.entries(impact)) if (key !== "siteId") assert.ok(typeof value === "number" && Number.isFinite(value) && value >= 0, key);
      assert.ok(impact.windMph <= preset.defaults.maxWindMph);
      assert.ok(impact.rainRateMmH <= preset.defaults.rainRateMmH);
      assert.ok(impact.runoffMm <= impact.accumulatedRainMm + 1e-8);
      assert.ok(!("risk" in impact) && !("tasks" in impact) && !("floodDepth" in impact));
    }
  }
});

test("hurricane eye, eyewall, outer decay and rain are separate geodesic fields", () => {
  const center = buildScenarioFrame(config, 0, []).center;
  const north = (distance: number) => ({ latitude: center.latitude + distance / 6371.0088 * 180 / Math.PI, longitude: center.longitude });
  const eye = sampleScenarioPoint(config, 0, center);
  const eyewall = sampleScenarioPoint(config, 0, north(config.radiusKm * .16));
  const outer = sampleScenarioPoint(config, 0, north(config.radiusKm * .7));
  const outside = sampleScenarioPoint(config, 0, north(config.radiusKm * 1.01));
  close(eye.windMph, 0);
  close(eye.rainRateMmH, config.rainRateMmH);
  close(eyewall.windMph, config.maxWindMph);
  assert.ok(outer.windMph > 0 && outer.windMph < eyewall.windMph);
  assert.equal(outside.windMph, 0);
  assert.equal(outside.rainRateMmH, 0);
  const windless = sampleScenarioPoint({ ...config, maxWindMph: 0 }, 0, center);
  assert.equal(windless.windMph, 0);
  assert.equal(windless.rainRateMmH, eye.rainRateMmH);
});

test("track travel starts at the first point, ends at the last, and stops forcing after duration", () => {
  const point = centerSite(config, config.durationHours / 2);
  const start = buildScenarioFrame(config, 0, [point]);
  const end = buildScenarioFrame(config, config.durationHours, [point]);
  const later = buildScenarioFrame(config, 72, [point]);
  close(start.center.latitude, start.track[0].latitude);
  close(start.center.longitude, start.track[0].longitude);
  assert.equal(start.progress, 0);
  assert.equal(start.impacts[point.id].accumulatedRainMm, 0);
  assert.equal(start.impacts[point.id].runoffMm, 0);
  assert.equal(start.impacts[point.id].windExposureMphHours, 0);
  assert.deepEqual(end.center, end.track.at(-1));
  assert.deepEqual(end.traveledTrack, end.track);
  assert.equal(end.progress, 1);
  assert.equal(end.active, false);
  assert.equal(end.impacts[point.id].windMph, 0);
  assert.equal(end.impacts[point.id].rainRateMmH, 0);
  assert.ok(end.impacts[point.id].accumulatedRainMm > 0);
  // Totals are retained after the track ends; only the trailing 24 h window ages out.
  const { rainLast24hMm: laterWindow, ...laterTotals } = later.impacts[point.id];
  const { rainLast24hMm: endWindow, ...endTotals } = end.impacts[point.id];
  assert.deepEqual(laterTotals, endTotals);
  assert.ok(endWindow > 0);
  assert.ok(laterWindow < endWindow);
});

test("cumulative rain and rain excess cannot decrease while moving forward through fractional hours", () => {
  const point = centerSite(config, 12);
  let rain = 0, runoff = 0, peak = 0;
  for (const hour of [0, .01, .1, .249, .25, 2, 8, 12.01, 12.1, 12.249, 12.25, 24, 48, 72]) {
    const impact = buildScenarioFrame(config, hour, [point]).impacts[point.id];
    assert.ok(impact.accumulatedRainMm >= rain);
    assert.ok(impact.runoffMm >= runoff);
    assert.ok(impact.peakWindMph >= peak - 1e-6);
    assert.ok(impact.peakWindMph >= impact.windMph - 1e-6);
    rain = impact.accumulatedRainMm;
    runoff = impact.runoffMm;
    peak = impact.peakWindMph;
  }
});

test("drainage changes accumulated excess only and cannot generate flood depth or change storm forcing", () => {
  const point = centerSite(config, 24), hour = 48;
  const none = buildScenarioFrame({ ...config, drainageMmH: 0 }, hour, [point]).impacts[point.id];
  const partial = buildScenarioFrame({ ...config, drainageMmH: 8 }, hour, [point]).impacts[point.id];
  const sufficient = buildScenarioFrame({ ...config, drainageMmH: config.rainRateMmH }, hour, [point]).impacts[point.id];
  close(none.runoffMm, none.accumulatedRainMm);
  assert.ok(partial.runoffMm > 0 && partial.runoffMm < none.runoffMm);
  assert.equal(sufficient.runoffMm, 0);
  assert.equal(none.accumulatedRainMm, partial.accumulatedRainMm);
  assert.equal(partial.accumulatedRainMm, sufficient.accumulatedRainMm);
  assert.equal(none.windExposureMphHours, sufficient.windExposureMphHours);
  assert.equal(none.peakWindMph, sufficient.peakWindMph);
});

test("slower travel increases exposure without changing the track or configured intensity", () => {
  const fastConfig = { ...config, durationHours: 24 }, slowConfig = { ...config, durationHours: 48 };
  const point = centerSite(config, 24);
  const fast = buildScenarioFrame(fastConfig, 24, [point]);
  const slow = buildScenarioFrame(slowConfig, 48, [point]);
  assert.deepEqual(fast.track, slow.track);
  close(fast.travelSpeedKmh, slow.travelSpeedKmh * 2);
  assert.deepEqual(buildScenarioFrame(fastConfig, 12, []).center, buildScenarioFrame(slowConfig, 24, []).center);
  const ratio = slow.impacts[point.id].accumulatedRainMm / fast.impacts[point.id].accumulatedRainMm;
  assert.ok(ratio > 1.98 && ratio < 2.02);
});

test("moving the footprint changes geographic exposure but never mutates caller data or preset tracks", () => {
  const original = structuredClone({ config, sites, presets: SCENARIO_PRESETS });
  const point = centerSite(config, 0);
  const shifted = buildScenarioFrame({ ...config, latitudeOffset: 5, longitudeOffset: 5 }, 0, [point]);
  close(shifted.center.latitude, original.presets[0].track[0].latitude + 5);
  close(shifted.center.longitude, original.presets[0].track[0].longitude + 5);
  assert.equal(shifted.impacts[point.id].rainRateMmH, 0);
  assert.ok(sampleScenarioPoint(config, 0, point).rainRateMmH > 0);
  buildScenarioFrame(Object.freeze(config), 72, Object.freeze(sites.map(site => Object.freeze(site))));
  assert.deepEqual({ config, sites, presets: SCENARIO_PRESETS }, original);
});

test("empty sites, bounded controls, absent offsets and invalid numeric input have explicit behavior", () => {
  const { latitudeOffset: _latitude, longitudeOffset: _longitude, ...withoutOffsets } = config;
  const normal = normalizeScenarioConfig(withoutOffsets);
  assert.equal(normal.latitudeOffset, 0);
  assert.equal(normal.longitudeOffset, 0);
  const bounded = buildScenarioFrame({ ...config, durationHours: 1, radiusKm: 0, latitudeOffset: 99 }, 100, []);
  assert.equal(bounded.hour, 72);
  assert.equal(bounded.config.durationHours, 12);
  assert.equal(bounded.config.radiusKm, 40);
  assert.equal(bounded.config.latitudeOffset, 5);
  assert.deepEqual(bounded.impacts, {});
  assert.throws(() => buildScenarioFrame({ ...config, rainRateMmH: NaN }, 1, []), /must be finite/);
  assert.throws(() => buildScenarioFrame(config, Infinity, []), /must be finite/);
  assert.throws(() => sampleScenarioPoint(config, 1, { latitude: 91, longitude: 0 }), /valid latitude/);
  assert.throws(() => buildScenarioFrame({ ...config, presetId: "missing" as ScenarioConfig["presetId"] }, 1, []), /Unknown scenario preset/);
});

test("NHC wind category labels cross sustained-wind boundaries independently of rainfall", () => {
  const cases: [number, string][] = [[38, "Below tropical-storm strength"], [39, "Tropical storm"], [73, "Tropical storm"], [74, "Category 1"], [95, "Category 1"], [96, "Category 2"], [110, "Category 2"], [111, "Category 3"], [129, "Category 3"], [130, "Category 4"], [156, "Category 4"], [157, "Category 5"]];
  for (const [wind, category] of cases) assert.equal(scenarioWindCategory(wind), category);
  assert.throws(() => scenarioWindCategory(NaN), /finite/);
});
