import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store";
import { Engine } from "../../server/engine";
import { riskAtlas } from "../../server/pipeline/atlas";
import { siteRisk } from "../../server/pipeline";
import { siteObservationV1Schema } from "../../shared/risk";
import { atlasColor, atlasValue, rankSites, ATLAS_LAYERS } from "../../shared/atlas";
import type { Site, ModelBundle, Snapshot, Strike } from "../../shared/types";
import type { WeatherPoint } from "../../shared/weather";
const sites: Site[] = JSON.parse(readFileSync("public/data/sites.json", "utf8"));
const models: ModelBundle = JSON.parse(readFileSync("public/models/bundle.json", "utf8"));
const now = Math.floor(Date.now() / 3600000) * 3600000 + 15 * 60000;
function weather(): WeatherPoint {
  const base = { temperature: 80, humidity: 40, apparent: 80, rain: 0, wind: 0, gust: 0, cape: 0, soilSurface: 0.2, soilRoot: 0.2, direction: null, clouds: null, code: 0 };
  const start = Math.floor(now / 3600000) * 3600000;
  return { ...sites[0], fetchedAt: new Date(now - 60000).toISOString(), current: { ...base, time: new Date(start).toISOString() },
    hours: Array.from({ length: 241 }, (_, i) => ({ ...base, temperature: i >= 192 ? 112 : 80, apparent: i >= 192 ? 112 : 80, time: new Date(start + (i - 168) * 3600000).toISOString() })) };
}
function fixture(run: (store: Store, snapshot: Snapshot) => void) {
  const directory = mkdtempSync(join(tmpdir(), "threshold-atlas-")), store = new Store(directory);
  try {
    store.put("environment-weather", sites[0].id, weather());
    const engine = new Engine(store, sites, {}, models, { now: new Date(now).toISOString(), heroSiteId: sites[0].id });
    // Fixed time is explicit in pure frame tests, independent of Engine's real clock.
    const snapshot = engine.snapshot();
    snapshot.siteRisks[sites[0].id] = siteRisk(sites[0], weather(), now, [], [], [], false).snapshot;
    run(store, snapshot);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
}
test("atlas current frame is exactly the authoritative snapshots for every site", () => fixture((store, snapshot) => {
  const atlas = riskAtlas(snapshot, store, 0, now);
  assert.equal(atlas.sites.length, 285);
  for (const entry of atlas.sites) { assert.equal(entry.snapshot, snapshot.siteRisks[entry.site.id]); assert.ok(siteObservationV1Schema.safeParse(entry.snapshot.observation).success); }
  assert.equal(atlas.kind, "CURRENT");
}));
test("timeline scores the same future weather frame, retains actual fetch times and distinguishes zero from null", () => fixture((store, snapshot) => {
  const current = riskAtlas(snapshot, store, 0, now).sites[0].snapshot;
  const future = riskAtlas(snapshot, store, 24, now).sites[0].snapshot;
  assert.equal(future.observation.weather.temperatureF, 112);
  assert.equal(future.observation.weather.precipitation24hMm, 0);
  assert.equal(future.observation.weather.gustMph, 0);
  assert.equal(future.observation.fetchedAt, weather().fetchedAt);
  assert.equal(future.observation.provenance.mode, "forecast");
  assert.ok(future.channels.find(c => c.hazard === "heat")!.score! > current.channels.find(c => c.hazard === "heat")!.score!);
  assert.ok(future.risk! > current.risk!);
  assert.equal(future.observation.flood.stage, null);
  assert.equal(future.observation.wildfire.nearestFireMiles, null);
  assert.equal(future.observation.lightning.strikes10mi30m, null);
  assert.equal(future.observation.wildlife.dangerousSightings24h, null);
  assert.equal(future.channels.find(c => c.hazard === "heat")!.factors[0].kind, "forecast");
  const absent = riskAtlas(snapshot, store, 24, now).sites[1].snapshot;
  assert.equal(absent.risk, null); assert.equal(absent.observation.coverage.percent, 0);
  assert.ok(absent.channels.every(c => c.score === null));
}));
test("stale forecast input and absent future hours stay unknown without retimestamping", () => fixture((store, snapshot) => {
  const p = weather(); p.fetchedAt = new Date(now - 3600000).toISOString();
  store.put("environment-weather", sites[0].id, p);
  const cached = riskAtlas(snapshot, store, 24, now).sites[0].snapshot;
  assert.notEqual(cached.risk, null); assert.equal(cached.observation.provenance.stale, true);
  p.fetchedAt = new Date(now - 6 * 3600000).toISOString();
  store.put("environment-weather", sites[0].id, p);
  assert.equal(riskAtlas(snapshot, store, 24, now).sites[0].snapshot.risk, null);
  store.put("environment-weather", sites[0].id, { ...weather(), hours: [] });
  assert.equal(riskAtlas(snapshot, store, 72, now).sites[0].snapshot.risk, null);
}));
test("future frames hold the latest detected-strike stop-work", () => fixture((store, snapshot) => {
  const strike: Strike = { id: "live", time: new Date(now).toISOString(), latitude: sites[0].latitude, longitude: sites[0].longitude, mode: "live" };
  store.put("strike", strike.id, strike);
  snapshot.siteRisks[sites[0].id] = siteRisk(sites[0], weather(), now, [], [strike], [], false).snapshot;
  assert.ok(riskAtlas(snapshot, store, 0, now).sites[0].snapshot.activeOverrides.some(o => o.source === "lightning"));
  assert.ok(riskAtlas(snapshot, store, 1, now).sites[0].snapshot.activeOverrides.some(o => o.source === "lightning"));

}));
test("atlas layers only select backend values, preserve unknowns, and interpolate risk colors", () => {
  const r = siteRisk(sites[0], weather(), now, [], [], [], false).snapshot;
  assert.equal(atlasValue(r, "temperature"), 80); assert.equal(atlasValue(r, "wind"), 0); assert.equal(atlasValue(r, "rain"), 0);
  assert.equal(atlasValue(r, "risk"), r.risk); assert.equal(atlasValue(r, "heat"), r.channels.find(c => c.hazard === "heat")!.score);
  for (const layer of Object.keys(ATLAS_LAYERS) as (keyof typeof ATLAS_LAYERS)[]) assert.equal(atlasValue(undefined, layer), null);
  assert.equal(atlasColor(null), "#9cabb4"); assert.notEqual(atlasColor(0), atlasColor(null));
  assert.equal(new Set(Array.from({ length: 101 }, (_, i) => atlasColor(i / 10))).size, 101);
});
test("ranking prioritizes holds, significant risk, insufficient coverage, then observed low risk", () => {
  const r = siteRisk(sites[0], weather(), now, [], [], [], false).snapshot;
  const risks = Object.fromEntries(sites.slice(0, 4).map(s => [s.id, structuredClone(r)]));
  risks[sites[0].id].risk = 1; risks[sites[0].id].confidence = 1; risks[sites[0].id].observation.coverage.percent = 100;
  risks[sites[1].id].risk = null;
  risks[sites[2].id].risk = 8;
  risks[sites[3].id].risk = 2; risks[sites[3].id].activeOverrides.push({ id: "crew", hazard: "soil", source: "crew", state: "HOLD", tasks: ["mobilization"], reason: "Road blocked", expiresAt: null });
  assert.deepEqual(rankSites(sites.slice(0, 4), risks).map(s => s.id), [sites[3].id, sites[2].id, sites[1].id, sites[0].id]);
});

test("projected warnings preserve real check timestamps or unknown provenance, never a future fetch", () => fixture((store, snapshot) => {
  store.put("alert", "warning", { id: "warning", siteId: sites[0].id, mode: "live", category: "flood", severity: 8, title: "Flood Warning", event: "Flood Warning", expiresAt: new Date(now + 48 * 3600000).toISOString() });
  const checkedAt = new Date(now - 60000).toISOString();
  store.put("feed", `${sites[0].id}:nws`, { ok: true, checkedAt });
  const run = () => riskAtlas(snapshot, store, 24, now).sites[0].snapshot;
  assert.equal(run().observation.flood.floodAlert, true);
  assert.equal(run().observation.provenance.fieldEvidence["flood.floodAlert"].fetchedAt, checkedAt);
  store.put("feed", `${sites[0].id}:nws`, { ok: false, checkedAt });
  assert.equal(run().observation.provenance.fieldEvidence["flood.floodAlert"].fetchedAt, null);
  assert.equal(riskAtlas(snapshot, store, 72, now).sites[0].snapshot.observation.flood.floodAlert, null);
}));


test("site-scoped snapshots and forecasts exclude every other plant", () => fixture((store, snapshot) => {
  const engine = new Engine(store, sites, {}, models, { now: new Date(now).toISOString(), heroSiteId: sites[0].id });
  const scoped = engine.snapshot(sites[0].id);
  assert.deepEqual(scoped.sites.map(s => s.id), [sites[0].id]);
  assert.deepEqual(Object.keys(scoped.siteRisks), [sites[0].id]);
  assert.deepEqual(Object.keys(scoped.decisions), [sites[0].id]);
  scoped.siteRisks[sites[0].id] = snapshot.siteRisks[sites[0].id];
  const future = riskAtlas(scoped, store, 24, now);
  assert.equal(future.sites.length, 1);
  const completed = riskAtlas(scoped, store, 24, now, true);
  assert.equal(completed.sites.length, 1);
  assert.equal(completed.sites[0].completion!.usage, "DEMO_ONLY");
  assert.equal(Object.keys(completed.sites[0].completion!.fields).length, 34);
  assert.deepEqual(future.sites[0], riskAtlas(snapshot, store, 24, now).sites[0]);
}));

test("optional demo companions fill every field for every hour without changing authoritative risk, coverage or holds", () => fixture((store, snapshot) => {
  const before = structuredClone(snapshot);
  for (const hour of [0, 24, 72]) {
    const raw = riskAtlas(snapshot, store, hour, now), completed = riskAtlas(snapshot, store, hour, now, true);
    for (const [index, entry] of completed.sites.entries()) {
      assert.deepEqual(entry.snapshot, raw.sites[index].snapshot);
      assert.equal(raw.sites[index].completion, undefined);
      assert.equal(entry.completion!.usage, "DEMO_ONLY");
      assert.equal(Object.keys(entry.completion!.fields).length, 34);
      for (const group of Object.values(entry.completion!.scenario)) for (const value of Object.values(group)) assert.notEqual(value, null);
      assert.equal(entry.completion!.completeness.notApplicable, 0);
    }
  }
  assert.deepEqual(snapshot, before);
}));
test("model forecasts stay applied at future hours while fresh against real time", async () => {
  const { scoreChannels } = await import("../../shared/risk-scoring");
  const target = Math.floor(now / 3600000) * 3600000 + 24 * 3600000;
  const forecast = { siteId: sites[0].id, mode: "live" as const, fetchedAt: new Date(now - 60000).toISOString(), modelVersion: "test",
    hours: Array.from({ length: 73 }, (_, i) => ({ time: new Date(Math.floor(now / 3600000) * 3600000 + i * 3600000).toISOString(), issuedAt: new Date(now - 60000).toISOString(), heat: [90, 95, 100], soil: [0.2, 0.25, 0.3], wind: 5, precipitation: 0 })) };
  const o = siteRisk(sites[0], weather(), now, [], [], [], false).snapshot.observation;
  const heatCast = (context: Parameters<typeof scoreChannels>[1]) => scoreChannels(o, context).find(c => c.hazard === "heat")!.factors.some(f => f.key === "heatCast");
  assert.ok(heatCast({ now: target, sourceNow: now, forecast: forecast as never }));
  assert.ok(!heatCast({ now: target, forecast: forecast as never }));
});
