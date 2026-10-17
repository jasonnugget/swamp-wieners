import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Alert, Forecast, HazardReport, Site } from "../../shared/types";
import type { SiteObservationV1 } from "../../shared/risk";
import { normalize } from "../../server/pipeline/normalize";
import { siteRisk } from "../../server/pipeline";
import { calculateCompositeRisk, explainComposite, scoreHeat, scoreWind, scoreWeather, scoreSoil, scoreFlood, scoreWildfire, scoreLightning, scoreWildlife, scoreChannels, mergeEvidence } from "../../shared/risk-scoring";
import { RISK_CONFIG } from "../../shared/risk-config";
import { parseTriage, triage } from "../../server/integrations/jev";
import { crewEvidence } from "../../shared/crew-risk";
import { decide } from "../../shared/policy";
const site: Site = JSON.parse(readFileSync("public/data/sites.json", "utf8"))[0];
const now = Date.parse("2026-10-17T16:00:00Z");
const iso = (offset = 0) => new Date(now + offset).toISOString();
const empty = () => normalize(site, undefined, now);
const composite = (...scores: (number | null)[]) => calculateCompositeRisk(scores.map(score => ({ score })));
const report = (category: HazardReport["category"] = "soil"): HazardReport => ({ id: "report", siteId: site.id, category, description: "Truck stuck near access road", tasks: ["mobilization"], latitude: site.latitude, longitude: site.longitude, author: "Crew", status: "open", createdAt: iso() });
const alert = (event: string): Alert => ({ id: event, event, siteId: site.id, category: "flood", title: "County alert", severity: 7, mode: "live", expiresAt: iso(3600000) });
const forecast = (): Forecast => ({ siteId: site.id, mode: "live", fetchedAt: iso(), modelVersion: "frozen-test", hours: [{ time: iso(86400000), issuedAt: iso(-86400000), heat: [95, 100, 115], soil: [0.2, 0.25, 0.35], baselineHeat: 100, temperature: 32, humidity: 60, precipitation: 0, wind: 5, x: [] }] });

test("all-zero scores remain zero; a severe hazard is never diluted", () => {
  assert.equal(composite(0, 0, 0, 0, 0, 0, 0), 0);
  assert.equal(composite(9, 0, 0, 0, 0, 0, 0), 9);
  assert.equal(composite(10, 0, null), 10);
  assert.equal(composite(4), 4);
});
test("moderate hazards compound without saturation, duplication of noise or dilution", () => {
  assert.equal(composite(7), 7);
  assert.equal(composite(7, 6, 5, 3, 1, 0, 2), 7.5);
  assert.ok(composite(5, 5, 5, 5, 5, 5, 5)! > 5);
  assert.ok(composite(5, 5, 5, 5, 5, 5, 5)! < 8);
  assert.equal(composite(1, 1, 1, 1, 1, 1, 1), 1);
  assert.equal(composite(7, 0, 1), 7);
});
test("null is not zero, permutations are deterministic and explanation reconstructs the result", () => {
  assert.equal(composite(null, null), null);
  assert.equal(composite(0, null), 0);
  assert.equal(composite(7, null, 5), composite(5, 7));
  const channels = [{ hazard: "heat" as const, score: 7 }, { hazard: "soil" as const, score: 6 }, { hazard: "wildlife" as const, score: null }];
  const e = explainComposite(channels);
  assert.equal(e.primary?.hazard, "heat");
  assert.equal(e.compounding[0].hazard, "soil");
  assert.equal(Math.round((e.primary!.score + e.uplift) * 10) / 10, calculateCompositeRisk(channels));
  assert.equal(explainComposite([]).primary, null);
});
for (const [temperature, expected] of [[70, 0], [80, 0], [90, 2], [100, 4], [103, 6], [115, 8], [125, 10], [140, 10]]) {
  test(`heat boundary ${temperature} F maps to ${expected}`, () => assert.equal(scoreHeat(temperature), expected));
}
test("heat interpolation, apparent fallback and missing values", () => {
  assert.equal(scoreHeat(95), 3);
  assert.equal(scoreHeat(null, 115), 8);
  assert.equal(scoreHeat(null), null);
  assert.equal(scoreHeat(NaN), null);
  assert.equal(scoreHeat(0, 125), 0);
});
test("wind interpolates between buckets and gusts add evidence", () => {
  assert.equal(scoreWind(20), 1); assert.equal(scoreWind(25), 2); assert.equal(scoreWind(65), 10);
  const o = empty(); o.weather.windMph = 20; o.weather.gustMph = 40;
  assert.ok(scoreWeather(o.weather)! >= 5 && scoreWeather(o.weather)! < 6);
  assert.equal(scoreWind(null), null);
});
for (const [percentile, expected] of [[0, 0], [0.5, 1], [0.7, 3], [0.8, 5], [0.9, 7], [0.95, 9], [0.99, 10]]) {
  test(`soil percentile ${percentile} maps to ${expected}`, () => assert.equal(scoreSoil({ moistureSurface: 0.9, moistureRoot: null, historicalPercentile: percentile }), expected));
}
test("soil uses site training anchors, not a global threshold when site calibration exists", () => {
  const s = { moistureSurface: 0.3, moistureRoot: null, historicalPercentile: null };
  assert.equal(scoreSoil(s, [0.1, 0.3, 0.4]), 7);
  assert.equal(scoreSoil(s, [0.3, 0.5, 0.6]), 1);
  const o = empty(); o.soil = s;
  assert.equal(scoreChannels(o, { now }).find(c => c.hazard === "soil")!.confidence, 0.35);
  assert.equal(scoreSoil({ moistureSurface: null, moistureRoot: null, historicalPercentile: null }), null);
});
test("flood renormalizes rainfall, gauge and exposure without manufacturing missing zero", () => {
  const o = empty(); o.weather.precipitation24hMm = 50;
  assert.equal(scoreFlood(o), 7);
  o.flood.stagePercentile = 0.5;
  assert.equal(scoreFlood(o), (7 * 0.35 + 1 * 0.45) / 0.8);
  const falling = scoreFlood({ ...o, flood: { ...o.flood, stageTrend: -0.1 } });
  const rising = scoreFlood({ ...o, flood: { ...o.flood, stageTrend: 0.5 } });
  assert.ok(rising! > falling!);
  o.flood.floodplain = true;
  assert.ok(scoreFlood(o)! > 0);
  assert.equal(scoreFlood(empty()), null);
  const unknown = empty(); unknown.flood.floodAlert = false;
  assert.equal(scoreFlood(unknown), null);
});
test("NWS exact flood event names enforce warning floors independently of headline", () => {
  assert.equal(scoreFlood(empty(), [alert("Flood Warning")]), 8);
  assert.equal(scoreFlood(empty(), [alert("Flash Flood Warning")]), 9);
  assert.equal(scoreFlood(empty(), [alert("Flood Watch")]), 4);
});
test("wildfire distance is continuous and age/power/weather change the result", () => {
  for (const [miles, expected] of [[80, 1], [30, 3], [10, 6], [3, 9]]) {
    const o = empty(); o.wildfire.nearestFireMiles = miles;
    assert.equal(scoreWildfire(o), expected);
  }
  const o = empty(); o.wildfire.nearestFireMiles = 10;
  const baseline = scoreWildfire(o)!;
  o.wildfire.firePower = 400; o.wildfire.fireAgeMinutes = 0;
  assert.ok(scoreWildfire(o)! > baseline);
  o.wildfire.firePower = 0; o.wildfire.fireAgeMinutes = 2880;
  assert.ok(scoreWildfire(o)! < baseline);
  o.wildfire.redFlagAlert = true;
  assert.ok(scoreWildfire(o)! >= 6);
  assert.equal(scoreWildfire(empty()), null);
});
test("forecast lightning contributes continuous risk and never manufactures detected strikes", () => {
  const o = empty(); o.lightning.forecastPotential = 0.5;
  assert.equal(scoreLightning(o.lightning), 3);
  assert.equal(o.lightning.nearestStrikeMiles, null);
  assert.equal(siteRisk(site, undefined, now, [], [], [], false).snapshot.activeOverrides.length, 0);
  o.lightning.forecastPotential = 1;
  assert.equal(scoreLightning(o.lightning), 6);
});
test("wildlife absence of reports stays unknown, while proximity, recency and severity affect sightings", () => {
  const o = empty(); assert.equal(scoreWildlife(o.wildlife, now), null);
  o.wildlife.dangerousSightings24h = 1; o.wildlife.nearestSightingMiles = 1;
  const recent = scoreWildlife(o.wildlife, now)!;
  o.wildlife.latestSightingAt = iso(-86400000);
  assert.ok(scoreWildlife(o.wildlife, now)! < recent);
  o.wildlife.latestSightingAt = iso(); o.wildlife.severity = "HIGH";
  assert.ok(scoreWildlife(o.wildlife, now)! >= 8);
});
test("ordinary reports do not produce 10; confirmed HIGH reports floor environmental evidence near 8", () => {
  const r = report();
  const before = siteRisk(site, undefined, now, [r], [], [], false).snapshot;
  assert.equal(before.risk, 4);
  assert.equal(before.tasks.find(t => t.task === "mobilization")!.state, "HOLD");
  r.triage = { mode: "live", classification: { category: "soil", severity: "HIGH", immediacy: "RESTRICT", affectedTasks: ["mobilization", "installation"], confidence: "HIGH", summary: r.description } };
  assert.equal(crewEvidence(r, now).score, 4); // Unconfirmed suggestions cannot become operational evidence.
  r.triage.confirmedAt = iso();
  assert.equal(crewEvidence(r, now).score, 8);
  assert.ok(mergeEvidence(4.3, 8)! >= 8 && mergeEvidence(4.3, 8)! < 8.1);
  const after = siteRisk(site, undefined, now, [r], [], [], false).snapshot;
  assert.equal(after.channels.find(c => c.hazard === "soil")!.score, 8);
  assert.equal(after.tasks.find(t => t.task === "installation")!.state, "RESTRICTED");
  assert.equal(after.tasks.find(t => t.task === "mobilization")!.state, "HOLD");
  assert.equal(siteRisk(site, undefined, now, [{ ...r, status: "resolved" }], [], [], false).snapshot.risk, null);
  assert.equal(siteRisk(site, undefined, now, [r, { ...r, id: "duplicate" }], [], [], false).snapshot.risk, after.risk);
});
test("JEV parses strict semantic choices, multiple affected tasks and reported confidence", () => {
  const payload = { model: "jev-test", answers: Object.fromEntries(Object.entries({ category: "soil", severity: "HIGH", immediacy: "RESTRICT", affects_mobilization: "yes", affects_installation: "yes", affects_preparation: "no" }).map(([key, choice]) => [key, { choice, confidence: 0.9 }])) };
  const r = parseTriage(payload, report());
  assert.equal(r.classification!.severity, "HIGH"); assert.deepEqual(r.classification!.affectedTasks, ["mobilization", "installation"]);
  assert.equal(r.classification!.confidence, "HIGH"); assert.equal(r.classification!.summary, report().description);
  assert.throws(() => parseTriage({ answers: { severity: { choice: 8.43, confidence: 1 } } }, report()));
  assert.throws(() => parseTriage({ ...payload, answers: { ...payload.answers, severity: { choice: "8.4", confidence: 1 } } }, report()));
});
test("JEV missing credentials or failed provider preserves manual evidence", async t => {
  const old = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    assert.equal((await triage(report())).mode, "unavailable");
    process.env.TYPESAFE_API_KEY = "unit-test-placeholder";
    t.mock.method(globalThis, "fetch", async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.questions.severity.type, "choice"); assert.ok(body.questions.affects_preparation);
      return new Response("unavailable", { status: 503 });
    });
    assert.equal((await triage(report())).mode, "unavailable");
    assert.equal(crewEvidence(report(), now).score, 4);
  } finally { if (old === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = old; }
});
test("ML forecasts enter heat/soil channels with version/horizon and never leak replay into live scoring", () => {
  const o = empty(), f = forecast();
  const context = { now, forecast: f, soilThresholds: [0.1, 0.3, 0.4] };
  const channels = scoreChannels(o, context);
  assert.equal(channels.find(c => c.hazard === "heat")!.score, 8);
  assert.ok(channels.find(c => c.hazard === "soil")!.score! > 7);
  const factor = channels.find(c => c.hazard === "heat")!.factors!.find(f => f.key === "heatCast")!;
  assert.match(factor.source, /frozen-test/); assert.equal(factor.validFrom, f.hours[0].time);
  for (const invalid of [{ ...f, mode: "historical" as const }, { ...f, siteId: "other" }, { ...f, fetchedAt: iso(-3 * 3600000) }, { ...f, fetchedAt: iso(1) }, { ...f, hours: [{ ...f.hours[0], time: iso(49 * 3600000) }] }])
    assert.equal(scoreChannels(o, { ...context, forecast: invalid }).find(c => c.hazard === "heat")!.score, null);
});
test("confidence distinguishes sparse low risk from observed low risk", () => {
  const low = siteRisk(site, undefined, now, [], [], [], false).snapshot;
  assert.equal(low.risk, null); assert.equal(low.confidence, 0);
  const o = empty(); o.weather.heatIndexF = 90;
  const channels = scoreChannels(o, { now });
  assert.equal(channels.find(c => c.hazard === "heat")!.score, 2);
  assert.equal(channels.find(c => c.hazard === "flood")!.confidence, 0);
  assert.equal(channels.find(c => c.hazard === "flood")!.score, null);
});
test("score 10 does not automatically HOLD; detected lightning holds reset and expire independently", () => {
  const f = forecast(); f.hours[0].heat = [120, 125, 130];
  const d = decide(site, f, [], [], [], now, [0.1, 0.3, 0.4]);
  assert.equal(d.channels.find(c => c.category === "heat")!.severity, 10);
  assert.equal(d.tasks.find(t => t.task === "installation")!.state, "RESTRICTED");
  const strike = { id: "s", mode: "live" as const, latitude: site.latitude, longitude: site.longitude, time: iso() };
  const held = siteRisk(site, undefined, now, [], [strike], [], false);
  assert.equal(held.decision.lightningUntil, iso(1800000));
  assert.equal(held.snapshot.tasks.find(t => t.task === "installation")!.state, "HOLD");
  assert.ok(held.snapshot.risk! < 10);
  const next = { ...strike, id: "next", time: iso(10 * 60000) };
  assert.equal(siteRisk(site, undefined, now + 10 * 60000, [], [strike, next], [], false).decision.lightningUntil, iso(40 * 60000));
  assert.equal(siteRisk(site, undefined, now + 40 * 60000, [], [strike, next], [], false).snapshot.tasks.find(t => t.task === "installation")!.state, "UNKNOWN");
});
test("all scoring outputs stay finite in [0,10], interpolation is continuous and composite is monotone", () => {
  for (let n = -100; n <= 1000; n += 0.5) {
    const o = empty(); o.weather.heatIndexF = n; o.weather.windMph = Math.max(0, n); o.weather.gustMph = Math.max(0, n + 1);
    o.weather.precipitation24hMm = Math.max(0, n); o.soil.historicalPercentile = n / 100;
    o.wildfire.nearestFireMiles = Math.max(0, n); o.lightning.forecastPotential = n / 100;
    const values = [scoreHeat(n), scoreWind(n), scoreWeather(o.weather), scoreSoil(o.soil), scoreFlood(o), scoreWildfire(o), scoreLightning(o.lightning), scoreWildlife(o.wildlife, now), composite(n, n / 2)];
    for (const value of values) assert.ok(value === null || Number.isFinite(value) && value >= 0 && value <= 10);
    assert.ok(composite(7, Math.max(0, n))! >= 7);
  }
  for (const [boundary] of RISK_CONFIG.heat) assert.ok(Math.abs(scoreHeat(boundary - 0.00001)! - scoreHeat(boundary + 0.00001)!) < 0.001);
});

test("every confirmed semantic severity maps deterministically; future reviews and old reports do not gain authority", () => {
  for (const [severity, score] of Object.entries(RISK_CONFIG.severity)) {
    const r = report(); r.triage = { mode: "live", confirmedAt: iso(), classification: { category: "soil", severity: severity as keyof typeof RISK_CONFIG.severity, immediacy: "MONITOR", affectedTasks: ["mobilization"], confidence: "HIGH", summary: r.description } };
    assert.equal(crewEvidence(r, now).score, score);
    assert.equal(crewEvidence({ ...r, triage: { ...r.triage, confirmedAt: iso(1) } }, now).score, 4);
    assert.equal(crewEvidence({ ...r, triage: { ...r.triage, mode: "unavailable" } }, now).score, 4);
    assert.ok(crewEvidence(r, now + 86400000).score < score);
  }
});
test("a critical classification does not invent a hold on a task the crew did not select", () => {
  const r = report("heat"); r.triage = { mode: "live", confirmedAt: iso(), classification: { category: "heat", severity: "CRITICAL", immediacy: "MONITOR", affectedTasks: ["installation"], confidence: "HIGH", summary: r.description } };
  const risk = siteRisk(site, undefined, now, [r], [], [], false).snapshot;
  assert.equal(risk.risk, 10);
  assert.equal(risk.tasks.find(t => t.task === "mobilization")!.state, "HOLD");
  assert.notEqual(risk.tasks.find(t => t.task === "installation")!.state, "HOLD");
});

test("a dry antecedent period cannot erase heavy forecast rain in the replay flood screen", () => {
  const f = forecast(); f.mode = "historical"; f.antecedentRain24 = 0; f.hours[0].precipitation = 30;
  const d = decide({ ...site, riverScreening: true }, f, [], [], [], now);
  assert.ok(d.channels.find(c => c.category === "flood")!.severity! >= 4);
  assert.equal(d.channels.find(c => c.category === "flood")!.status, "RESTRICTED");
  assert.ok(d.channels.find(c => c.category === "weather")!.severity! > 7);
});

test("identical low numeric risks expose materially different confidence when fields are missing", () => {
  const time = iso();
  const current = { time, temperature: null as number | null, humidity: null as number | null, apparent: null as number | null, wind: 0, gust: null as number | null, rain: null as number | null, direction: null as number | null, clouds: null as number | null, code: null as number | null };
  const sparse = { ...site, fetchedAt: time, current, hours: [] };
  const full = { ...sparse, current: { ...current, temperature: 70, humidity: 50, apparent: 70, gust: 0, rain: 0, code: 0 },
    hours: Array.from({ length: 168 }, (_, i) => ({ ...current, time: iso(-i * 3600000), rain: 0, soilSurface: 0, soilRoot: 0, cape: 0 })) };
  const a = siteRisk(site, sparse, now, [], [], [], false).snapshot;
  const b = siteRisk(site, full, now, [], [], [], false).snapshot;
  assert.equal(a.risk, 0); assert.equal(b.risk, 0);
  assert.ok(b.confidence > a.confidence);
  assert.ok(b.observation.coverage.percent > a.observation.coverage.percent);
  assert.equal(b.explanation.primary, null);
});

test("modeled thunderstorm/hail conditions raise a weather floor without inventing strikes", () => {
  const o = empty(); o.weather.weatherCode = 99;
  assert.equal(scoreWeather(o.weather), 8);
  assert.equal(scoreLightning(o.lightning), null);
  assert.equal(scoreChannels(o, { now }).find(c => c.hazard === "weather")!.factors.find(f => f.key === "weather.weatherCode")!.value, 99);
});
