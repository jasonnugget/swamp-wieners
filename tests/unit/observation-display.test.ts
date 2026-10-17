import { test } from "node:test";
import assert from "node:assert/strict";
import { OBSERVATION_GROUPS, formatObservation } from "../../src/components/site-map/observations";
import { normalize } from "../../server/pipeline/normalize";
import { readFileSync } from "node:fs";
import type { Site } from "../../shared/types";

test("environmental display includes each canonical field exactly once for every plant", () => {
  const sites: Site[] = JSON.parse(readFileSync("public/data/sites.json", "utf8"));
  const displayed = OBSERVATION_GROUPS.flatMap(g => g.fields.map(f => `${g.id}.${f.key}`)).sort();
  assert.equal(displayed.length, 34); assert.equal(new Set(displayed).size, 34);
  for (const site of sites) {
    const o = normalize(site, undefined, Date.now());
    const expected = OBSERVATION_GROUPS.flatMap(g => Object.keys(o[g.id]).map(key => `${g.id}.${key}`)).sort();
    assert.deepEqual(displayed, expected);
  }
});
test("display preserves unknown, measured zero, negative trend and explicit false", () => {
  const number = { key: "temperatureF", label: "Temperature", unit: "°F" };
  assert.equal(formatObservation(null, number), "Unknown");
  assert.equal(formatObservation(undefined, number), "Unknown");
  assert.equal(formatObservation(NaN, number), "Unknown");
  assert.equal(formatObservation(0, number), "0.0 °F");
  const fraction = OBSERVATION_GROUPS.find(g => g.id === "soil")!.fields[0];
  assert.equal(formatObservation(0, fraction), "0.0%"); assert.equal(formatObservation(0.25, fraction), "25.0%");
  const flood = OBSERVATION_GROUPS.find(g => g.id === "flood")!;
  assert.equal(formatObservation(false, flood.fields.find(f => f.key === "floodAlert")!), "No");
  assert.equal(formatObservation(null, flood.fields.find(f => f.key === "floodAlert")!), "Unknown");
  assert.equal(formatObservation(-0.04, flood.fields.find(f => f.key === "stageTrend")!), "-0.04 m/h");
});
test("source time and weather codes have readable, explicit representations", () => {
  const time = OBSERVATION_GROUPS.find(g => g.id === "lightning")!.fields.find(f => f.key === "latestStrikeAt")!;
  assert.equal(formatObservation("invalid", time), "Unknown");
  assert.match(formatObservation("2026-10-17T16:00:00Z", time, "America/New_York"), /Oct 17.*12:00/);
  const code = OBSERVATION_GROUPS[0].fields.find(f => f.key === "weatherCode")!;
  assert.equal(formatObservation(0, code), "Clear · 0");
  assert.equal(formatObservation(999, code), "WMO code · 999");
});
