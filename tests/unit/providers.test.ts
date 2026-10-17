import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Site, Strike } from "../../shared/types";
import { siteObservationV1Schema } from "../../shared/risk";
import { ProviderCache, ProviderHttp, MINUTE, HOUR, DAY, evidence, mapConcurrent } from "../../server/integrations/provider";
import { UsgsWaterProvider, type FloodObservation } from "../../server/integrations/usgs-water";
import { NwpsWaterProvider, FallbackFloodProvider } from "../../server/integrations/nwps-water";
import { FirmsProvider } from "../../server/integrations/firms";
import { FemaFloodplainProvider } from "../../server/integrations/floodplain";
import { InaturalistProvider, classifySpecies } from "../../server/integrations/wildlife";
import { NwsAlertProvider } from "../../server/integrations/nws";
import { RecordedLightningProvider, UnavailableLightningProvider } from "../../server/integrations/lightning";
import { EnvironmentalProviders, applyProviderEvidence, type StoredProviderRecord } from "../../server/pipeline/providers";
import { ProviderPoller } from "../../server/pipeline/provider-poller";
import { normalize } from "../../server/pipeline/normalize";
import { siteRisk } from "../../server/pipeline";
import { Store } from "../../server/store";

const site: Site = JSON.parse(readFileSync("public/data/sites.json", "utf8"))[0];
const now = Date.parse("2026-10-17T16:00:00Z"), clock = () => now;
const iso = (delta = 0) => new Date(now + delta).toISOString();
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const cache = () => new ProviderCache(undefined, clock);
const http = (handler: (url: string, init?: RequestInit) => Promise<Response> | Response) => new ProviderHttp(async (input, init) => handler(String(input), init), clock, 0);
function stage(time: number, value: string | null = "5") {
  return { type: "Feature", properties: { monitoring_location_id: "USGS-test", time_series_id: "series", parameter_code: "00065", time: new Date(time).toISOString(), value, unit_of_measure: "ft" }, geometry: { type: "Point", coordinates: [site.longitude, site.latitude] } };
}
const collection = (features: unknown[]) => ({ type: "FeatureCollection", features, links: [] });
function usgsResponse(url: string) {
  if (url.includes("latest-continuous")) return json(collection([stage(now - 15 * MINUTE)]));
  if (url.includes("limit=10000")) return json(collection(Array.from({ length: 200 }, (_, i) => stage(now - (i + 2) * HOUR))));
  return json(collection([stage(now - 75 * MINUTE, "3")]));
}
function sighting(species: string, id = 1) {
  return { id, time_observed_at: iso(-HOUR), location: `${site.latitude},${site.longitude}`, geoprivacy: "open", obscured: false, positional_accuracy: 10, quality_grade: "research", taxon: { name: species, rank: "species" } };
}
const csv = `latitude,longitude,acq_date,acq_time,frp,confidence,type\n${site.latitude},${site.longitude},2026-10-17,1530,12.5,n,0\n`;
const fema = { features: [{ attributes: { FLD_ZONE: "AE", SFHA_TF: "T" } }] };

test("USGS selects/caches a nearby gauge, converts feet, derives trend and uses midrank rolling percentile", async () => {
  let calls = 0;
  const provider = new UsgsWaterProvider(cache(), http((url, init) => {
    calls++; assert.ok(url.startsWith("https://api.waterdata.usgs.gov/ogcapi/v1/"));
    assert.equal((init?.headers as Record<string, string>)["X-Api-Key"], "test-placeholder");
    return usgsResponse(url);
  }), "test-placeholder", clock);
  const a = await provider.getFloodEvidence(site), b = await provider.getFloodEvidence(site);
  assert.equal(a.status, "ok"); assert.equal(calls, 4); assert.deepEqual(a, b);
  assert.equal(a.data!.stage, 1.524); assert.equal(a.data!.nearestGaugeMiles, 0);
  assert.ok(Math.abs(a.data!.stageTrend! - 0.6096) < 1e-10);
  assert.equal(a.data!.stagePercentile, 0.5); // Stable readings must not become percentile 100.
  assert.match(String(a.details.baseline), /Rolling 30-day/);
});
test("USGS missing gauges and stale/invalid readings remain unavailable, never measured zero", async () => {
  const empty = new UsgsWaterProvider(cache(), http(() => json(collection([]))), "", clock);
  assert.equal((await empty.getFloodEvidence(site)).data, null);
  const old = new UsgsWaterProvider(cache(), http(() => json(collection([stage(now - DAY)]))), "", clock);
  assert.equal((await old.getFloodEvidence(site)).status, "unavailable");
  const bad = new UsgsWaterProvider(cache(), http(() => json(collection([stage(now, null)]))), "", clock);
  assert.equal((await bad.getFloodEvidence(site)).status, "error");
});
test("USGS history failure preserves a genuine current zero stage while history fields stay null", async () => {
  const provider = new UsgsWaterProvider(cache(), http(url => url.includes("latest-continuous") ? json(collection([stage(now, "0")])) : new Response("offline", { status: 503 })), "", clock);
  const r = await provider.getFloodEvidence(site);
  assert.equal(r.status, "ok"); assert.equal(r.data!.stage, 0); assert.equal(r.data!.stageTrend, null); assert.equal(r.data!.stagePercentile, null);
});
function nwpsGauge(primary = 0, unit = "ft", time = iso(-15 * MINUTE)) {
  return { lid: "TEST1", name: "Test river", latitude: site.latitude, longitude: site.longitude,
    pedts: { observed: "HGIRG" }, status: { observed: { primary, primaryUnit: unit, validTime: time } } };
}
function nwpsSeries() {
  return { pedts: "HGIRG", primaryUnits: "ft", data: [
    { validTime: iso(-75 * MINUTE), primary: -1 },
    ...Array.from({ length: 200 }, (_, i) => ({ validTime: iso(-(i + 2) * HOUR), primary: 0 })),
  ] };
}
test("NWPS fallback preserves current zero stage, same-gauge trend, midrank and cached fetch time", async () => {
  let time = now, calls = 0;
  const provider = new NwpsWaterProvider(new ProviderCache(undefined, () => time), new ProviderHttp(async input => {
    calls++; const url = String(input);
    if (url.includes("stageflow")) return json(nwpsSeries());
    const params = new URL(url).searchParams;
    assert.equal(params.get("srid"), "EPSG_4326"); assert.ok(params.has("bbox.xmin"));
    return json({ gauges: [nwpsGauge()] });
  }, () => time, 0), () => time);
  const first = await provider.getFloodEvidence(site); time += MINUTE;
  const second = await provider.getFloodEvidence({ ...site, id: "second" });
  assert.equal(calls, 2); assert.equal(first.fetchedAt, second.fetchedAt);
  assert.equal(first.data!.stage, 0); assert.equal(first.data!.stageTrend, 0.3048);
  assert.ok(first.data!.stagePercentile! > 0.49 && first.data!.stagePercentile! < 0.51);
  const o = normalize(site, undefined, now);
  applyProviderEvidence(o, site, [{ siteId: site.id, provider: "usgs", evidence: first }], now);
  assert.equal(o.flood.stage, 0); assert.equal(o.provenance.fieldEvidence["flood.stage"].source, "NOAA NWPS");
});
test("NWPS rejects missing sentinels, stale/future gauges, flow units and distant stations", async () => {
  for (const gauge of [nwpsGauge(-999), nwpsGauge(5, "kcfs"), nwpsGauge(5, "ft", iso(-3 * HOUR)), nwpsGauge(5, "ft", iso(MINUTE)), { ...nwpsGauge(), latitude: site.latitude + 2 }]) {
    const r = await new NwpsWaterProvider(cache(), http(() => json({ gauges: [gauge] })), clock).getFloodEvidence(site);
    assert.equal(r.status, "unavailable"); assert.equal(r.data, null);
  }
  const negative = await new NwpsWaterProvider(cache(), http(url => json(url.includes("stageflow") ? nwpsSeries() : { gauges: [nwpsGauge(-1)] })), clock).getFloodEvidence(site);
  assert.equal(negative.data!.stage, -0.3048);
});
test("NWPS bad or incompatible history preserves a real current reading without mixed-datum trends", async () => {
  for (const payload of [{ ...nwpsSeries(), pedts: "OTHER" }, { ...nwpsSeries(), primaryUnits: "m" }, {}]) {
    const r = await new NwpsWaterProvider(cache(), http(url => json(url.includes("stageflow") ? payload : { gauges: [nwpsGauge(5)] })), clock).getFloodEvidence(site);
    assert.equal(r.status, "ok"); assert.equal(r.data!.stage, 1.524);
    assert.equal(r.data!.stageTrend, null); assert.equal(r.data!.stagePercentile, null);
  }
});
test("NWPS missing/malformed/upstream failures remain unknown", async () => {
  for (const payload of [{}, { gauges: [{}] }]) {
    const r = await new NwpsWaterProvider(cache(), http(() => json(payload)), clock).getFloodEvidence(site);
    assert.equal(r.status, "error"); assert.equal(r.data, null);
  }
  for (const transport of [http(() => new Response("failed", { status: 503 })), http(() => { throw new DOMException("timeout", "TimeoutError"); })]) {
    const r = await new NwpsWaterProvider(cache(), transport, clock).getFloodEvidence(site);
    assert.equal(r.status, "error"); assert.equal(r.data, null);
  }
  assert.equal((await new NwpsWaterProvider(cache(), http(() => json({ gauges: [] })), clock).getFloodEvidence(site)).status, "unavailable");
});
test("water fallback prefers USGS and never combines fields from different gauges", async () => {
  const data = { nearestGaugeMiles: 2, stage: 0, stageTrend: null, stagePercentile: null };
  let calls = 0;
  const primary = { getFloodEvidence: async () => evidence("USGS", data, now, HOUR) };
  const secondary = { getFloodEvidence: async () => { calls++; return evidence("NOAA NWPS", { ...data, stage: 8, stagePercentile: 0.8 }, now, HOUR); } };
  const first = await new FallbackFloodProvider(primary, secondary).getFloodEvidence(site);
  assert.equal(calls, 0); assert.deepEqual(first.data, data);
  const failed = { getFloodEvidence: async () => evidence<FloodObservation>("USGS", null, now, HOUR, { status: "error", error: "HTTP 429" }) };
  const fallback = await new FallbackFloodProvider(failed, secondary).getFloodEvidence(site);
  assert.equal(calls, 1); assert.equal(fallback.source, "NOAA NWPS");
  assert.equal(fallback.details.primaryError, "HTTP 429"); assert.equal(fallback.data!.stage, 8);
});
test("FIRMS uses regional queries and cached actual fetch time, excluding low-confidence and industrial detections", async () => {
  let time = now, calls = 0;
  const provider = new FirmsProvider(new ProviderCache(undefined, () => time), new ProviderHttp(async input => {
    calls++; const url = String(input); assert.ok(url.includes("/VIIRS_NOAA20_NRT/")); assert.ok(!url.includes("/world/"));
    return new Response(csv + `${site.latitude},${site.longitude},2026-10-17,1530,100,h,2\n${site.latitude},${site.longitude},2026-10-17,1530,100,l,0\n`);
  }, () => time, 0), "test-placeholder", () => time);
  const first = await provider.getFireEvidence(site); time += 30 * MINUTE;
  const second = await provider.getFireEvidence(site);
  assert.equal(calls, 1); assert.equal(first.fetchedAt, second.fetchedAt);
  assert.equal(first.data!.nearestFireMiles, 0); assert.equal(first.data!.firePower, 12.5);
  assert.equal(first.data!.fireAgeMinutes, 30); assert.equal(second.data!.fireAgeMinutes, 60);
  assert.equal((second.details.detections as unknown[]).length, 1);
});
test("FIRMS public downloads work without credentials and empty results do not fabricate fire absence", async () => {
  let calls = 0; const transport = http(() => { calls++; return new Response("latitude,longitude,acq_date,acq_time,frp,confidence\n"); });
  const unconfigured = await new FirmsProvider(cache(), transport, "", clock).getFireEvidence(site);
  assert.equal(unconfigured.status, "ok"); assert.equal(calls, 1);
  assert.equal(unconfigured.details.access, "public-regional-download");
  const empty = await new FirmsProvider(cache(), transport, "placeholder", clock).getFireEvidence(site);
  assert.equal(empty.status, "ok"); assert.equal(empty.data!.nearestFireMiles, null);
});
test("FIRMS public US downloads are shared across plants, with a separate Alaska cache", async () => {
  const urls: string[] = [];
  const provider = new FirmsProvider(cache(), http(url => { urls.push(url); return new Response(csv); }), "", clock);
  await provider.getFireEvidence(site);
  await provider.getFireEvidence({ ...site, id: "other", latitude: 40, longitude: -90 });
  await provider.getFireEvidence({ ...site, id: "alaska", state: "AK", latitude: 65, longitude: -148 });
  assert.equal(urls.length, 2);
  assert.match(urls[0], /J1_VIIRS_C2_USA_contiguous_and_Hawaii_48h.csv$/);
  assert.match(urls[1], /J1_VIIRS_C2_Alaska_48h.csv$/);
});
test("FEMA distinguishes mapped true/false, unmapped unknown and verified static fallback", async () => {
  for (const [features, expected] of [[fema.features, true], [[{ attributes: { FLD_ZONE: "X", SFHA_TF: "F" } }], false], [[], null]] as const) {
    const result = await new FemaFloodplainProvider(cache(), http(() => json({ features })), "", true, clock).getFloodplainEvidence(site);
    assert.equal(result.data!.floodplain, expected); assert.equal(result.mode, "STATIC");
  }
  const directory = mkdtempSync(join(tmpdir(), "planit-fema-"));
  try {
    const file = join(directory, "exposure.json");
    writeFileSync(file, JSON.stringify({ version: 1, sites: { [site.id]: { latitude: site.latitude, longitude: site.longitude, floodplain: true, verifiedAt: iso(-DAY), sourceUrl: "https://hazards.fema.gov/" } } }));
    const provider = new FemaFloodplainProvider(cache(), http(() => { throw new Error("Must not use network"); }), file, false, clock);
    const result = await provider.getFloodplainEvidence(site);
    assert.equal(result.status, "ok"); assert.equal(result.data!.floodplain, true); assert.match(result.source, /static/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("FEMA caches lookups and unavailable static records stay unknown", async () => {
  let calls = 0;
  const provider = new FemaFloodplainProvider(cache(), http(() => { calls++; return json(fema); }), "", true, clock);
  await provider.getFloodplainEvidence(site); await provider.getFloodplainEvidence(site); assert.equal(calls, 1);
  const disabled = new FemaFloodplainProvider(cache(), http(() => { throw Error(); }), "", false, clock);
  assert.equal((await disabled.getFloodplainEvidence(site)).data, null);
});
test("wildlife filters ordinary, old, future, obscured and imprecise observations while preserving species/source metadata", async () => {
  let calls = 0;
  const provider = new InaturalistProvider(cache(), http(url => {
    calls++;
    const params = new URL(url).searchParams;
    assert.equal(params.get("iconic_taxa"), "Mammalia,Reptilia");
    assert.equal(params.get("per_page"), "100");
    return json({ total_results: 6, results: [sighting("Alligator mississippiensis"), sighting("Passer domesticus", 2), { ...sighting("Ursus arctos", 3), obscured: true }, { ...sighting("Ursus arctos", 4), time_observed_at: iso(-2 * DAY) }, { ...sighting("Ursus arctos", 5), time_observed_at: iso(HOUR) }, { ...sighting("Ursus arctos", 6), positional_accuracy: 2000 }] });
  }), clock);
  const result = await provider.getWildlifeEvidence(site); await provider.getWildlifeEvidence(site);
  assert.equal(calls, 1); assert.equal(result.data!.sightings.length, 1);
  const o = normalize(site, undefined, now);
  applyProviderEvidence(o, site, [{ siteId: site.id, provider: "wildlife", evidence: result }], now);
  assert.equal(o.wildlife.severity, null); // A species match is not an observed dangerous encounter.
  assert.equal(o.provenance.fieldEvidence["wildlife.dangerousSightings24h"].confidence, 0.35);
  assert.equal(result.data!.sightings[0].species, "Alligator mississippiensis"); assert.equal(result.data!.sightings[0].distanceMiles, 0);
  assert.ok(result.confidence < 0.4); assert.equal(classifySpecies("Passer domesticus"), null);
});
test("empty wildlife searches leave normalized probability unknown", async () => {
  const result = await new InaturalistProvider(cache(), http(() => json({ total_results: 0, results: [] })), clock).getWildlifeEvidence(site);
  const o = normalize(site, undefined, now);
  applyProviderEvidence(o, site, [{ siteId: site.id, provider: "wildlife", evidence: result }], now);
  assert.equal(o.wildlife.dangerousSightings24h, null); assert.equal(o.wildlife.crewReports24h, 0);
});
test("NWS preserves event semantics, assigns hazards, caches success and accepts a successful empty check", async () => {
  let calls = 0;
  const provider = new NwsAlertProvider(cache(), http(() => { calls++; return json({ features: ["Flash Flood Warning", "Red Flag Warning", "Heat Advisory"].map((event, i) => ({ id: String(i), properties: { event, headline: "County message", severity: "Severe", expires: iso(HOUR) } })) }); }), clock);
  const result = await provider.getAlerts(site); await provider.getAlerts(site);
  assert.equal(calls, 2); assert.deepEqual(result.data!.map(a => a.category), ["flood", "wildfire", "heat"]);
  assert.equal(result.data![0].event, "Flash Flood Warning");
  assert.equal((await new NwsAlertProvider(cache(), http(() => json({ features: [] })), clock).getAlerts(site)).status, "ok");
});
test("NWS empty statewide checks are shared and retain original fetch times across plants", async () => {
  let time = now, calls = 0;
  const provider = new NwsAlertProvider(new ProviderCache(undefined, () => time), new ProviderHttp(async url => {
    assert.ok(new URL(String(url)).searchParams.has("area")); calls++;
    return json({ features: [] });
  }, () => time, 0), () => time);
  const a = await provider.getAlerts(site); time += MINUTE;
  const b = await provider.getAlerts({ ...site, id: "second" });
  assert.equal(calls, 1); assert.equal(a.fetchedAt, b.fetchedAt);
  assert.equal(a.validUntil, b.validUntil); assert.deepEqual(b.data, []);
  time += 5 * MINUTE;
  await provider.getAlerts(site); assert.equal(calls, 2);
});

for (const failure of ["malformed", "timeout", "non200"] as const) {
  test(`all HTTP hazard providers handle ${failure} without inventing zero`, async () => {
    const transport = () => http(() => {
      if (failure === "timeout") throw new DOMException("test timeout", "TimeoutError");
      return failure === "non200" ? new Response("unavailable", { status: 503 }) : new Response("not a valid payload");
    });
    const results = await Promise.all([
      new UsgsWaterProvider(cache(), transport(), "", clock).getFloodEvidence(site),
      new FirmsProvider(cache(), transport(), "placeholder", clock).getFireEvidence(site),
      new FemaFloodplainProvider(cache(), transport(), "", true, clock).getFloodplainEvidence(site),
      new InaturalistProvider(cache(), transport(), clock).getWildlifeEvidence(site),
      new NwsAlertProvider(cache(), transport(), clock).getAlerts(site),
    ]);
    for (const result of results) { assert.equal(result.status, "error"); assert.equal(result.data, null); assert.equal(result.confidence, 0); assert.ok(result.error); assert.ok(!result.error.includes("placeholder")); }
  });
}

test("demo and missing lightning never become live detections; healthy zero requires explicit coverage", async () => {
  const strikes: Strike[] = [{ id: "demo", mode: "simulated", time: iso(), latitude: site.latitude, longitude: site.longitude }];
  const demo = await new RecordedLightningProvider(() => strikes, "DEMO", clock).nearbyStrikes(site, 10, new Date(now - 30 * MINUTE));
  assert.equal(demo.mode, "DEMO"); assert.equal(demo.data!.strikes.length, 1);
  const o = normalize(site, undefined, now);
  applyProviderEvidence(o, site, [{ siteId: site.id, provider: "lightning", evidence: demo }], now);
  assert.equal(o.lightning.nearestStrikeMiles, null); assert.equal(o.lightning.strikes10mi30m, null);
  const missing = await new UnavailableLightningProvider(clock).nearbyStrikes(); assert.equal(missing.status, "unavailable");
  const live = evidence("Test live detector", { strikes: [], complete: true }, now, MINUTE);
  applyProviderEvidence(o, site, [{ siteId: site.id, provider: "lightning", evidence: live }], now);
  assert.equal(o.lightning.strikes10mi30m, 0); assert.equal(o.lightning.evidenceMode, "LIVE");
});
test("provider evidence populates normalized fields and confidence metadata, and expiry/error cannot look like zero", async () => {
  const usgs = await new UsgsWaterProvider(cache(), http(usgsResponse), "", clock).getFloodEvidence(site);
  const records: StoredProviderRecord[] = [{ siteId: site.id, provider: "usgs", evidence: usgs }, { siteId: site.id, provider: "floodplain", evidence: evidence("FEMA", { floodplain: false }, now, DAY, { mode: "STATIC" }) }];
  const result = siteRisk(site, undefined, now, [], [], [], false, undefined, undefined, undefined, undefined, records).snapshot;
  assert.equal(result.observation.flood.stage, 1.524); assert.equal(result.observation.flood.floodplain, false);
  assert.ok(result.observation.coverage.available > 0); assert.equal(result.observation.provenance.fieldEvidence["flood.stage"].source, "USGS");
  assert.ok(siteObservationV1Schema.safeParse(result.observation).success);
  const expired = siteRisk(site, undefined, now + DAY, [], [], [], false, undefined, undefined, undefined, undefined, records).snapshot;
  assert.equal(expired.observation.flood.stage, null); assert.equal(expired.observation.flood.stagePercentile, null); assert.equal(expired.observation.flood.floodplain, null);
  assert.equal(expired.risk, null); assert.equal(expired.confidence, 0);
});
test("cache persists across adapter restart, deduplicates work, expires, and does not cache failures as success", async () => {
  const directory = mkdtempSync(join(tmpdir(), "planit-cache-")), store = new Store(directory);
  let time = now, calls = 0;
  try {
    const first = new ProviderCache(store, () => time);
    const load = async () => { calls++; return 0; };
    assert.deepEqual(await Promise.all([first.get("key", MINUTE, load), first.get("key", MINUTE, load)]), [0, 0]); assert.equal(calls, 1);
    const restarted = new ProviderCache(store, () => time); assert.equal(await restarted.get("key", MINUTE, load), 0); assert.equal(calls, 1);
    time += MINUTE; await restarted.get("key", MINUTE, load); assert.equal(calls, 2);
    await assert.rejects(first.get("error", MINUTE, async () => { throw Error("offline"); }));
    assert.equal(await first.get("error", MINUTE, load), 0);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
test("origin backoff honors 429 Retry-After, isolates origins, recovers, and bounds concurrency", async () => {
  let time = now, calls = 0;
  const client = new ProviderHttp(async () => { calls++; return calls === 1 ? new Response("limited", { status: 429, headers: { "Retry-After": "120" } }) : json({ ok: true }); }, () => time, 0);
  await assert.rejects(client.json("source", "https://example.test/a"), /429/);
  await assert.rejects(client.json("source", "https://example.test/b"), /backoff/); assert.equal(calls, 1);
  await client.json("other", "https://other.test/a"); assert.equal(calls, 2);
  time += 120 * MINUTE / 60; await client.json("source", "https://example.test/b"); assert.equal(calls, 3);
  let active = 0, peak = 0;
  await mapConcurrent(Array.from({ length: 285 }, (_, i) => i), 3, async () => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; });
  assert.equal(peak, 3);
});
test("a failed NWS refresh preserves existing unexpired warnings and a failed source leaves other evidence usable", async () => {
  const directory = mkdtempSync(join(tmpdir(), "planit-poller-")), store = new Store(directory);
  try {
    const warning = { id: "flood", siteId: site.id, category: "flood" as const, title: "Flood Warning", event: "Flood Warning", severity: 7, expiresAt: iso(HOUR), mode: "live" as const };
    store.put("alert", warning.id, warning);
    const providers = new EnvironmentalProviders(new UsgsWaterProvider(cache(), http(usgsResponse), "", clock), new FirmsProvider(cache(), http(() => json({})), "", clock),
      new FemaFloodplainProvider(cache(), http(() => json(fema)), "", true, clock), new InaturalistProvider(cache(), http(() => json({ total_results: 0, results: [] })), clock), new UnavailableLightningProvider(clock),
      new NwsAlertProvider(cache(), http(() => new Response("offline", { status: 503 })), clock));
    const poller = new ProviderPoller(store, [site], providers, () => {}, clock);
    await poller.refreshSite(site);
    assert.equal(store.all("alert").length, 1);
    const records = store.all<StoredProviderRecord>("environment-provider");
    assert.equal(records.length, 6);
    const risk = siteRisk(site, undefined, now, [], [], [warning], false, undefined, undefined, undefined, undefined, records).snapshot;
    assert.equal(risk.observation.flood.stage, 1.524); assert.equal(risk.observation.wildfire.nearestFireMiles, null);
    assert.ok(risk.channels.find(c => c.hazard === "flood")!.score! >= 8);
    assert.ok(risk.activeOverrides.some(o => o.source === "official-alert"));
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("national provider polling bounds source jobs, deduplicates selected refreshes and does not skip catalog plants", async () => {
  const sites: Site[] = JSON.parse(readFileSync("public/data/sites.json", "utf8"));
  const directory = mkdtempSync(join(tmpdir(), "planit-batch-")), store = new Store(directory);
  const calls = new Map<string, number>(); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  async function counted<T>(source: string, data: T) { calls.set(source, (calls.get(source) ?? 0) + 1); await gate; return evidence(source, data, now, MINUTE); }
  const providers = new EnvironmentalProviders(
    { getFloodEvidence: () => counted("usgs", { nearestGaugeMiles: null, stage: null, stagePercentile: null, stageTrend: null }) },
    { getFireEvidence: () => counted("firms", { nearestFireMiles: null, fireAgeMinutes: null, firePower: null }) },
    { getFloodplainEvidence: () => counted("floodplain", { floodplain: null }) },
    { getWildlifeEvidence: () => counted("wildlife", { sightings: [] }) }, new UnavailableLightningProvider(clock), { getAlerts: () => counted("nws", []) });
  try {
    const poller = new ProviderPoller(store, [...sites.filter(s => s.catalogOnly), ...sites.filter(s => !s.catalogOnly)], providers, () => {}, clock);
    poller.poll(); poller.poll();
    for (const provider of ["usgs", "firms", "floodplain", "wildlife", "nws"]) assert.equal(calls.get(provider), 2);
    const first = sites.find(s => s.catalogOnly)!;
    const running = poller.refresh(first, "usgs"); assert.equal(running, poller.refresh(first, "usgs"));
    release(); await running; await new Promise(resolve => setImmediate(resolve));
    assert.ok(store.all<StoredProviderRecord>("environment-provider").some(r => r.siteId === first.id));
  } finally { release(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("positive live provider events normalize and hold directly, while provider failure cannot clear an already recorded hold", () => {
  const strike: Strike = { id: "live-event", mode: "live", time: iso(-5 * MINUTE), latitude: site.latitude, longitude: site.longitude };
  const record: StoredProviderRecord = { siteId: site.id, provider: "lightning", evidence: evidence("Test detector", { strikes: [strike], complete: false }, now, MINUTE) };
  const first = siteRisk(site, undefined, now, [], [], [], false, undefined, undefined, undefined, undefined, [record]);
  assert.equal(first.snapshot.observation.lightning.nearestStrikeMiles, 0);
  assert.equal(first.snapshot.observation.lightning.strikes10mi30m, null);
  assert.equal(first.snapshot.observation.lightning.evidenceMode, "LIVE");
  assert.equal(first.decision.lightningUntil, iso(25 * MINUTE));
  assert.equal(first.snapshot.tasks.find(t => t.task === "installation")!.state, "HOLD");
  const failed: StoredProviderRecord = { siteId: site.id, provider: "lightning", evidence: evidence<never>("Test detector", null, now, MINUTE, { status: "error", error: "offline" }) };
  const after = siteRisk(site, undefined, now, [], [strike], [], false, undefined, undefined, undefined, undefined, [failed]);
  assert.equal(after.snapshot.tasks.find(t => t.task === "installation")!.state, "HOLD");
  assert.equal(after.snapshot.observation.lightning.strikes10mi30m, null);
});

test("a temporary lack of gauges recovers after the shorter negative-association cache expires", async () => {
  let time = now, available = false, calls = 0;
  const provider = new UsgsWaterProvider(new ProviderCache(undefined, () => time), new ProviderHttp(async input => {
    calls++; const url = String(input);
    if (url.includes("bbox=") && !available) return json(collection([]));
    if (url.includes("latest-continuous")) return json(collection([stage(time - 15 * MINUTE)]));
    return json(collection([]));
  }, () => time, 0), "", () => time);
  assert.equal((await provider.getFloodEvidence(site)).status, "unavailable");
  available = true; time += HOUR;
  assert.equal((await provider.getFloodEvidence(site)).status, "unavailable"); assert.equal(calls, 1);
  time += DAY;
  assert.equal((await provider.getFloodEvidence(site)).status, "ok"); assert.ok(calls > 1);
});

test("never-collected provider metadata has null timestamps and remains stable between reads", () => {
  const first = siteRisk(site, undefined, now, [], [], [], false).snapshot.observation;
  const next = siteRisk(site, undefined, now + MINUTE, [], [], [], false).snapshot.observation;
  assert.deepEqual(first, next);
  for (const meta of Object.values(first.provenance.providers)) {
    assert.equal(meta.fetchedAt, null); assert.equal(meta.validUntil, null); assert.equal(meta.status, "unavailable");
  }
});
test("FIRMS rejects malformed critical row values rather than claiming a successful empty query", async () => {
  const result = await new FirmsProvider(cache(), http(() => new Response(csv.replace(String(site.latitude), "not-a-coordinate"))), "placeholder", clock).getFireEvidence(site);
  assert.equal(result.status, "error"); assert.equal(result.data, null);
});
