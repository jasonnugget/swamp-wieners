import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Site } from "../../shared/types";
import { normalize } from "../../server/pipeline/normalize";
import type { ScenarioValues } from "../../src/features/site-simulation/types";
import { scenarioPreset, visualState } from "../../src/features/site-simulation/visualization-state";

function empty(): ScenarioValues {
  const site: Site = JSON.parse(readFileSync("public/data/sites.json", "utf8"))[0];
  const o = normalize(site, undefined, Date.now());
  return { weather: o.weather, soil: o.soil, flood: o.flood, lightning: o.lightning, wildfire: o.wildfire, wildlife: o.wildlife };
}
test("visual weather preserves unknown moisture/stage and does not turn humidity or CAPE into detected weather", () => {
  const v = empty(); v.weather.humidityPct = 100; v.weather.cape = 3500;
  const state = visualState(v);
  assert.equal(state.fog, false); assert.equal(state.storm, false); assert.equal(state.rain, 0);
  assert.equal(state.surface, null); assert.equal(state.root, null); assert.equal(state.stage, null);
  v.weather.weatherCode = 45; assert.equal(visualState(v).fog, true);
});
test("heat and soil treatments remain independent and snow/hail never become rain", () => {
  const v = empty(); v.soil.moistureSurface = 0.3;
  const moisture = visualState(v).surface;
  v.weather.heatIndexF = 120; assert.equal(visualState(v).surface, moisture); assert.equal(visualState(v).heat, 1);
  v.weather.weatherCode = 73; v.weather.precipitation1hMm = 25;
  assert.equal(visualState(v).snow, true); assert.equal(visualState(v).rain, 0);
  v.weather.weatherCode = 96; assert.equal(visualState(v).hail, true); assert.equal(visualState(v).rain, 0);
});
test("presets clone scenario inputs without rewriting source data or inventing unrelated event evidence", () => {
  const v = empty(), original = structuredClone(v);
  const storm = scenarioPreset(v, "storm"), heat = scenarioPreset(v, "heat");
  assert.deepEqual(v, original);
  assert.equal(storm.lightning.evidenceMode, "DEMO"); assert.equal(heat.weather.heatIndexF, 120);
  assert.deepEqual(heat.soil, original.soil); assert.deepEqual(storm.wildfire, original.wildfire);
  assert.deepEqual(storm.wildlife, original.wildlife);
});
