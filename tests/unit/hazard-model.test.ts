import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Forecast, HazardKey, HazardModelBundle, Site } from "../../shared/types";
import { dailyHazardFeatures, HAZARD_FEATURES, HAZARD_KEYS, hazardDayFromProbabilities, hazardEvidence, hazardProbabilities, hazardScore, historicalHazardForecasts, learnedIndex,
  type HazardEvidence, type HistoricalHazardFile } from "../../shared/hazard-model";
import { decide } from "../../shared/policy";
import { siteRisk } from "../../server/pipeline";
import { RISK_CONFIG } from "../../shared/risk-config";
const read = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8"));
const bundle = read<HazardModelBundle>("public/models/hazards.json");
const sites = read<Site[]>("public/data/model-sites.json");
const site = sites.find(s => !s.heldOut)!;
const now = Date.parse("2026-08-02T22:00:00Z");
const evidence = (p: Partial<Record<HazardKey | "overall", number>>, mode: "live" | "historical" = "historical"): HazardEvidence => ({
  day: hazardDayFromProbabilities(bundle, "2026-08-03", { wind: 0.01, flood: 0.01, lightning: 0.01, fire: 0.01, heat: 0.01, overall: 0.01, ...p }),
  mode, modelVersion: bundle.version, issuedAt: "2026-08-01T00:00:00Z" });
const status = (d: ReturnType<typeof decide>, category: string) => d.channels.find(c => c.category === category)!.status;

test("HazardCast feature order matches the Python pipeline", () => {
  assert.deepEqual(bundle.features, HAZARD_FEATURES);
  assert.equal(bundle.mean.length, HAZARD_FEATURES.length);
  for (const s of sites) if (bundle.siteTraits[s.id]) assert.equal(bundle.siteTraits[s.id].length, 9);
});
test("TypeScript daily aggregation reproduces Python features from raw forecast hours", () => {
  assert.ok(bundle.featureSamples.length >= 10);
  for (const sample of bundle.featureSamples) {
    const s = sites.find(x => x.id === sample.siteId)!;
    const hours = sample.hours.map(h => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v ?? NaN]))) as typeof sample.hours;
    const x = dailyHazardFeatures(sample.date, s, hours, sample.priorRain, sample.soilP90, bundle.siteTraits[s.id]);
    assert.ok(x, `${sample.siteId} ${sample.date} should be complete`);
    x!.forEach((v, i) => assert.ok(Math.abs(v - sample.expected[i]) <= 1e-3 * Math.max(1, Math.abs(sample.expected[i])), `${HAZARD_FEATURES[i]}: ${v} vs ${sample.expected[i]}`));
  }
});
test("TypeScript inference reproduces exported Python probabilities", () => {
  for (const sample of bundle.samples) {
    const p = hazardProbabilities(bundle, sample.x);
    for (const key of [...HAZARD_KEYS, "overall"] as const) assert.ok(Math.abs(p[key] - sample.probabilities[key]) < 1e-4, `${key} ${p[key]} vs ${sample.probabilities[key]}`);
  }
});
test("incomplete forecasts and untrained sites stay unknown", () => {
  const sample = bundle.featureSamples[0], s = sites.find(x => x.id === sample.siteId)!;
  assert.equal(dailyHazardFeatures(sample.date, s, sample.hours.slice(0, 10) as never, sample.priorRain, sample.soilP90, bundle.siteTraits[s.id]), null);
  assert.equal(dailyHazardFeatures(sample.date, s, sample.hours as never, sample.priorRain.slice(1), sample.soilP90, bundle.siteTraits[s.id]), null);
  assert.equal(dailyHazardFeatures(sample.date, s, sample.hours as never, sample.priorRain, 0, bundle.siteTraits[s.id]), null);
  const catalog = read<Site[]>("public/data/sites.json").find(x => x.catalogOnly)!;
  assert.equal(bundle.siteTraits[catalog.id], undefined);
});
test("score mapping is monotone and bounded", () => {
  let last = -1;
  for (let p = 0; p <= 1; p += 0.001) { const s = hazardScore(p, bundle.scoreAnchors); assert.ok(s >= last && s >= 0 && s <= 10); last = s; }
});
test("live hazard evidence expires; historical evidence serves only its own dates", () => {
  const live = { siteId: site.id, mode: "live" as const, fetchedAt: new Date(now).toISOString(), issuedAt: new Date(now - 48 * 3600000).toISOString(), modelVersion: bundle.version, days: [evidence({}).day] };
  assert.ok(hazardEvidence(live, site.id, "2026-08-03", now + 3600000, 3));
  assert.equal(hazardEvidence(live, site.id, "2026-08-03", now + 3 * 3600000, 3), null);
  assert.equal(hazardEvidence(live, site.id, "2026-08-03", now - 1, 3), null);
  assert.equal(hazardEvidence(live, "other", "2026-08-03", now, 3), null);
  assert.equal(hazardEvidence(live, site.id, "2026-08-04", now, 3), null);
  const historical = historicalHazardForecasts(bundle, read<HistoricalHazardFile>("public/data/hazard-forecasts.json"));
  assert.equal(historical[site.id].mode, "historical");
  assert.ok(historical[site.id].days.every(d => d.date >= "2026-01-01"));
});
test("an extreme learned hazard holds that channel's tasks; low predictions never clear other holds", () => {
  const flood = decide(site, undefined, [], [], [], now, undefined, undefined, now, 24, undefined, evidence({ flood: 0.95 }));
  assert.equal(status(flood, "flood"), "HOLD");
  assert.equal(flood.tasks.find(t => t.task === "mobilization")!.state, "HOLD");
  assert.equal(flood.tasks.find(t => t.task === "preparation")!.state, "AVAILABLE");
  const caution = decide(site, undefined, [], [], [], now, undefined, undefined, now, 24, undefined, evidence({ wind: 0.5 }));
  assert.equal(status(caution, "weather"), "RESTRICTED");
  // A calm forecast cannot clear a detected-strike hold, an official alert or missing coverage.
  const strike = { id: "s", mode: "live" as const, latitude: site.latitude, longitude: site.longitude, time: new Date(now).toISOString() };
  const calm = evidence({});
  assert.equal(status(decide(site, undefined, [], [strike], [], now, undefined, undefined, now, 24, undefined, calm), "lightning"), "HOLD");
  const warning = { id: "a", siteId: site.id, category: "flood" as const, title: "Flash Flood Warning", severity: 10, mode: "live" as const, expiresAt: new Date(now + 3600000).toISOString() };
  assert.equal(status(decide(site, undefined, [], [], [warning], now, undefined, undefined, now, 24, undefined, calm), "flood"), "HOLD");
  assert.equal(status(decide(site, undefined, [], [], [], now, undefined, undefined, now, 24, undefined, calm), "flood"), "UNKNOWN");
});
test("the learned index never sits below the worst channel and an extreme index holds field work", () => {
  const e = evidence({ overall: 0.05 });
  assert.equal(learnedIndex([8, 1, null], e), 8);
  assert.equal(learnedIndex([1, null], null), null);
  const extreme = decide(site, undefined, [], [], [], now, undefined, undefined, now, 24, undefined, evidence({ overall: 0.95 }));
  assert.ok(extreme.index! >= RISK_CONFIG.policy.holdScore);
  for (const task of ["mobilization", "installation"]) assert.equal(extreme.tasks.find(t => t.task === task)!.state, "HOLD");
  assert.equal(extreme.tasks.find(t => t.task === "preparation")!.state, "AVAILABLE");
});
test("live snapshots expose learned factors, the learned composite and the rule fallback", () => {
  const f: Forecast = { siteId: site.id, mode: "live", fetchedAt: new Date(now).toISOString(), modelVersion: "test", hours: [] };
  const { snapshot } = siteRisk(site, undefined, now, [], [], [], true, undefined, undefined, undefined, { forecast: f, hazard: evidence({ flood: 0.5, overall: 0.4 }, "live") });
  assert.equal(snapshot.mlCoverage.hazardCast, true);
  assert.ok(snapshot.channels.find(c => c.hazard === "flood")!.factors.some(x => x.key === "floodCast" && x.kind === "forecast"));
  assert.equal(snapshot.explanation.learned?.probability, 0.4);
  assert.ok(snapshot.risk! >= snapshot.explanation.learned!.score);
  const fallback = siteRisk(site, undefined, now, [], [], [], true).snapshot;
  assert.equal(fallback.mlCoverage.hazardCast, false);
  assert.equal(fallback.explanation.learned, undefined);
});
