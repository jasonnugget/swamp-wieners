import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalize } from "../../server/pipeline/normalize";
import { siteRisk } from "../../server/pipeline";
import { collect } from "../../server/pipeline/collect";
import { siteObservationV1Schema, compositeRisk } from "../../shared/risk";
import { Engine } from "../../server/engine";
import { Store } from "../../server/store";
import type { Site, HazardReport, Alert, Strike } from "../../shared/types";
import type { WeatherPoint } from "../../shared/weather";
const sites: Site[] = JSON.parse(readFileSync("public/data/sites.json", "utf8"));
const site = sites[0];
const now = Date.parse("2026-10-17T16:15:00Z");
function point(): WeatherPoint {
  return { ...site, fetchedAt: new Date(now).toISOString(), current: {
    time: new Date(now - 900000).toISOString(), temperature: 80, humidity: 50, apparent: 79,
    rain: 0, wind: 0, gust: 0, direction: 0, clouds: 0, code: 0,
  }, hours: Array.from({ length: 168 }, (_, i) => ({
    time: new Date(now - 900000 - i * 3600000).toISOString(), temperature: 80, rain: 0,
    apparent: null, wind: 0, direction: 0, clouds: 0, code: 0, soilSurface: 0, soilRoot: 0, cape: 0,
  })) };
}
test("normalization preserves measured zero, computes complete rain windows and explicit coverage", () => {
  const o = normalize(site, point(), now);
  assert.equal(o.weather.windMph, 0);
  assert.equal(o.weather.precipitation7dMm, 0);
  assert.equal(o.soil.moistureSurface, 0);
  assert.equal(o.lightning.strikes10mi30m, null);
  assert.equal(o.lightning.forecastPotential, 0);
  assert.equal(o.coverage.available, 11);
  assert.equal(o.coverage.expected, 17);
  assert.equal(o.coverage.percent, 64.7);
  assert.equal(o.soil.historicalPercentile, null);
  assert.ok(o.weather.heatIndexF !== null);
  assert.ok(siteObservationV1Schema.safeParse(o).success);
  assert.equal(siteObservationV1Schema.safeParse({ ...o, weather: { ...o.weather, windMph: NaN } }).success, false);
});
test("incomplete rolling rain, invalid fields, mismatched sites, stale and future data remain unknown", () => {
  const p = point();
  p.hours[40].rain = null;
  p.current.humidity = 101;
  p.current.wind = -1;
  const partial = normalize(site, p, now);
  assert.equal(partial.weather.precipitation7dMm, null);
  assert.equal(partial.weather.precipitation24hMm, 0);
  assert.equal(partial.weather.heatIndexF, null);
  assert.equal(partial.weather.windMph, null);
  for (const p of [undefined, { ...point(), stale: true }, { ...point(), fetchedAt: new Date(now + 1).toISOString() },
    { ...point(), fetchedAt: new Date(now - 3600000).toISOString() }, { ...point(), latitude: site.latitude + 1 }]) {
    const o = normalize(site, p, now);
    assert.equal(o.weather.temperatureF, null);
    assert.equal(o.weather.precipitation1hMm, null);
    assert.equal(o.coverage.percent, 0);
  }
});
test("every catalog and model site has the same complete shape even on provider failure", async () => {
  let requests = 0;
  const results = await collect(sites, async batch => { requests++; assert.ok(batch.length <= 10); throw new Error("offline"); });
  assert.equal(requests, Math.ceil(sites.length / 10));
  assert.equal(results.length, sites.length);
  const keys = (o: unknown): string => JSON.stringify(o, (key, value) => key === "siteId" ? "site" : value);
  const template = keys(normalize(site, undefined, now));
  for (const r of results) {
    assert.match(r.error!, /offline/);
    assert.equal(keys(normalize(r.site, r.point, now)), template);
  }
  const partial = await collect(sites.slice(0, 2), async () => [{ ...point(), stale: true, error: "offline" }]);
  assert.equal(partial[0].point?.stale, true);
  assert.equal(partial[1].point, undefined);
  assert.match(partial[1].error!, /unavailable/);
});
test("policy holds remain independent from composite risk and resolution cannot clear lightning or alerts", () => {
  const report: HazardReport = { id: "r", siteId: site.id, category: "lightning", description: "Shelter damaged", tasks: ["preparation"], latitude: site.latitude, longitude: site.longitude, author: "Crew", status: "open", createdAt: new Date(now).toISOString() };
  const strike: Strike = { id: "s", latitude: site.latitude, longitude: site.longitude, time: new Date(now).toISOString(), mode: "live" };
  const alert: Alert = { id: "a", siteId: site.id, category: "flood", title: "Flood warning", severity: 10, mode: "live", expiresAt: new Date(now + 3600000).toISOString() };
  const run = (reports: HazardReport[], strikes: Strike[] = []) => siteRisk(site, point(), now, reports, strikes, [alert], false);
  const before = run([]), crew = run([report]);
  assert.ok(crew.snapshot.risk! >= before.snapshot.risk!);
  assert.ok(crew.snapshot.risk! < 10);
  assert.equal(crew.snapshot.tasks.find(t => t.task === "preparation")!.state, "HOLD");
  const held = run([{ ...report, status: "resolved" }], [strike]);
  assert.equal(held.snapshot.tasks.find(t => t.task === "installation")!.state, "HOLD");
  assert.equal(held.snapshot.activeOverrides.length, 2);
  const lowerAlert = siteRisk(site, point(), now, [], [strike], [{ ...alert, category: "lightning", severity: 3 }], false);
  assert.equal(lowerAlert.snapshot.tasks.find(t => t.task === "installation")!.state, "HOLD");
  assert.ok(held.snapshot.risk! < 10);
  assert.equal(held.snapshot.observation.lightning.strikes10mi30m, null);
  assert.equal(held.snapshot.channels.find(c => c.hazard === "flood")!.score, 8);
  assert.equal(held.snapshot.observation.flood.floodAlert, true);
  assert.equal(run([], [{ ...strike, mode: "simulated" }]).snapshot.channels.find(c => c.hazard === "lightning")!.score, 0);
});
test("forecast CAPE never establishes detected lightning or a hold; absent data never contributes zero to composite", () => {
  const p = point(); p.hours[0].cape = 3000;
  const r = siteRisk(site, p, now, [], [], [], true).snapshot;
  assert.equal(r.observation.lightning.forecastPotential, 1);
  assert.equal(r.channels.find(c => c.hazard === "lightning")!.score, 6);
  assert.equal(r.activeOverrides.length, 0);
  assert.ok(r.confidence < 0.5);
  assert.equal(compositeRisk([{ score: null }, { score: 6 }]), 6);
  assert.equal(compositeRisk([{ score: null }]), null);
  assert.equal(compositeRisk([{ score: 0 }, { score: 10 }]), 10);
  assert.equal(siteRisk(site, undefined, now, [], [], [], false).snapshot.risk, null);
});
test("successful fresh NWS check establishes false alert flags; absent, failed or stale checks do not", () => {
  const fresh = siteRisk(site, undefined, now, [], [], [], false, undefined, new Date(now).toISOString()).snapshot.observation;
  assert.equal(fresh.flood.floodAlert, false);
  assert.equal(fresh.wildfire.redFlagAlert, false);
  assert.equal(fresh.coverage.available, 2);
  const old = siteRisk(site, undefined, now, [], [], [], false, undefined, new Date(now - 600000).toISOString()).snapshot.observation;
  assert.equal(old.flood.floodAlert, null);
});
test("real-mode legacy decisions are projections of canonical risk; demo evidence never contaminates live snapshots", t => {
  t.mock.method(Date, "now", () => now);
  const directory = mkdtempSync(join(tmpdir(), "planit-environment-"));
  const store = new Store(directory);
  try {
    const models = JSON.parse(readFileSync("public/models/bundle.json", "utf8"));
    const engine = new Engine(store, sites.slice(0, 2), { [site.id]: { siteId: site.id, mode: "historical", fetchedAt: new Date(now).toISOString(), modelVersion: "test", hours: [] } }, models, { now: "2026-08-01T12:00:00Z", heroSiteId: site.id });
    store.put("environment-weather", site.id, point());
    store.put("strike", "simulated", { id: "simulated", mode: "simulated", latitude: site.latitude, longitude: site.longitude, time: new Date(now).toISOString() });
    engine.setClock("real");
    const s = engine.snapshot();
    assert.equal(s.siteRisks[site.id].risk, s.decisions[site.id].index);
    assert.deepEqual(s.siteRisks[site.id].tasks, s.decisions[site.id].tasks);
    assert.equal(s.siteRisks[site.id].activeOverrides.length, 0);
    assert.equal(s.siteRisks[sites[1].id].risk, null);
    assert.equal(s.siteRisks[site.id].mlCoverage.heatCast, true);
    assert.equal(s.siteRisks[sites[1].id].mlCoverage.heatCast, false);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("fresh same-hour NWS fallback fills missing fields for either cohort without copying future peaks", () => {
  const screening = { siteId: site.id, source: "NOAA/NWS" as const, sourceUrl: "https://api.weather.gov/test",
    fetchedAt: new Date(now).toISOString(), issuedAt: new Date(now - 3600000).toISOString(),
    hours: [{ time: "2026-10-17T12:00:00-04:00", heatIndex: 90, windKmh: 16.09344 },
      { time: new Date(now + 3600000).toISOString(), heatIndex: 120, windKmh: 100 }] };
  const o = normalize(site, undefined, now, screening);
  assert.equal(o.weather.heatIndexF, 90);
  assert.equal(o.weather.windMph, 10);
  assert.equal(o.validAt, new Date(screening.hours[0].time).toISOString());
  assert.match(o.provenance.fieldSources["weather.windMph"], /NOAA/);
  assert.equal(o.weather.temperatureF, null);
  assert.equal(normalize(site, point(), now, screening).weather.windMph, 0);
  assert.equal(normalize(site, undefined, now, { ...screening, issuedAt: new Date(now - 86400000).toISOString() }).weather.windMph, null);
});
