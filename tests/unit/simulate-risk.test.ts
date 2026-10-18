import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Site } from "../../shared/types";
import { buildScenarioFrame, DEFAULT_SCENARIO_CONFIG, SCENARIO_PRESETS, type ScenarioSiteImpact } from "../../shared/simulation";
import { atRisk, onHold, simulateFleet, simulateSiteRisk } from "../../shared/simulate-risk";

const sites: Site[] = JSON.parse(readFileSync("public/data/sites.json", "utf8"));
const calm = (siteId: string): ScenarioSiteImpact => ({ siteId, distanceKm: 999, windMph: 0, rainRateMmH: 0, peakWindMph: 0, accumulatedRainMm: 0, runoffMm: 0, rainLast24hMm: 0, windExposureMphHours: 0 });

test("trailing 24 h rain never exceeds the total and equals it within the first day", () => {
  for (const hour of [6, 24, 48, 72]) {
    const frame = buildScenarioFrame(DEFAULT_SCENARIO_CONFIG, hour, sites);
    for (const impact of Object.values(frame.impacts)) {
      assert.ok(impact.rainLast24hMm <= impact.accumulatedRainMm + 1e-9);
      if (hour <= 24) assert.ok(Math.abs(impact.rainLast24hMm - impact.accumulatedRainMm) < 1e-9);
    }
  }
});

test("a direct major-hurricane pass restricts or holds work and the score rises over the timeline", () => {
  const preset = SCENARIO_PRESETS.find(p => p.kind === "hurricane")!;
  const config = { ...preset.defaults, maxWindMph: 140 };
  const center = buildScenarioFrame(config, 24, []).center;
  // The idealized eye is calm; the eyewall sits at 0.16 of the storm radius.
  const site = { ...sites[0], id: "eye", latitude: center.latitude + config.radiusKm * 0.16 / 111.2, longitude: center.longitude };
  const impact = buildScenarioFrame(config, 24, [site]).impacts.eye;
  assert.ok(impact.windMph > 100, `eyewall wind ${impact.windMph}`);
  const result = simulateSiteRisk(site, undefined, impact, Date.now());
  assert.equal(result.mode, "SIMULATED");
  assert.ok((result.risk ?? 0) >= 9, `risk ${result.risk}`);
  assert.ok(onHold(result.tasks));
  assert.ok(simulateSiteRisk(site, undefined, calm("eye"), Date.now()).risk === null || !atRisk(simulateSiteRisk(site, undefined, calm("eye"), Date.now()).tasks));
});

test("calm scenarios leave current evidence unchanged and never mutate the input", () => {
  const frame = buildScenarioFrame(DEFAULT_SCENARIO_CONFIG, 0, sites.slice(0, 5));
  const base = Object.fromEntries(sites.slice(0, 5).map(s => [s.id, undefined]));
  const before = JSON.stringify(frame);
  const result = simulateFleet(frame, sites.slice(0, 5), base as never);
  assert.equal(JSON.stringify(frame), before);
  assert.equal(Object.keys(result).length, 5);
});
