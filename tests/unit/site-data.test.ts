import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { Site } from "../../shared/types";
import { siteObservationV1Schema } from "../../shared/risk";
import { completeSiteData, ENVIRONMENT_GROUPS } from "../../shared/site-data";
import { normalize } from "../../server/pipeline/normalize";
import type { WeatherPoint } from "../../shared/weather";
import { Store } from "../../server/store";

const sites: Site[] = JSON.parse(readFileSync("public/data/sites.json", "utf8"));
const now = Date.parse("2026-10-17T16:00:00Z"), site = sites[0];

test("completion fills only missing data, preserving measured zero/false and canonical coverage", () => {
  const input = normalize(site, undefined, now);
  input.weather.temperatureF = 91;
  input.weather.precipitation24hMm = 0;
  input.flood.floodplain = false;
  input.provenance.fieldSources["weather.temperatureF"] = "Real source";
  const before = structuredClone(input), output = completeSiteData(site, input, now);
  assert.deepEqual(input, before);
  assert.equal(output.scenario.weather.temperatureF, 91);
  assert.equal(output.scenario.weather.precipitation24hMm, 0);
  assert.equal(output.scenario.flood.floodplain, false);
  assert.equal(output.fields["weather.temperatureF"].kind, "SOURCE");
  assert.equal(output.fields["weather.temperatureF"].reason, "Real source");
  assert.equal(output.fields["weather.humidityPct"].kind, "SYNTHETIC");
  assert.deepEqual(output.observed.coverage, input.coverage);
  assert.equal(output.observed.weather.humidityPct, null);
  assert.equal(output.usage, "DEMO_ONLY");
  assert.throws(() => siteObservationV1Schema.parse(output));
});

test("all 285 plants have identical completed shape and field-level provenance", () => {
  let keys: string[] | undefined;
  for (const plant of sites) {
    const result = completeSiteData(plant, normalize(plant, undefined, now), now);
    const paths = Object.keys(result.fields).sort();
    keys ??= paths;
    assert.deepEqual(paths, keys);
    for (const group of ENVIRONMENT_GROUPS) for (const [key, value] of Object.entries(result.scenario[group])) {
      const metadata = result.fields[`${group}.${key}`];
      assert.ok(metadata);
      assert.notEqual(value, null, `${plant.id}: ${group}.${key}`);
      if (typeof value === "number") assert.ok(Number.isFinite(value));
      if (metadata.kind === "SYNTHETIC") assert.ok(metadata.basis.length);
    }
    const c = result.completeness;
    assert.equal(c.source + c.synthetic + c.notApplicable, c.total);
  }
});

test("fallbacks are deterministic, geographic, seasonal and based on available local weather", () => {
  const input = normalize(site, undefined, now);
  assert.deepEqual(completeSiteData(site, input, now), completeSiteData(site, input, now));
  const alaska = sites.find(s => s.state === "AK")!;
  const florida = completeSiteData(site, input, now);
  const north = completeSiteData(alaska, normalize(alaska, undefined, now), now);
  assert.ok(north.scenario.weather.temperatureF! < florida.scenario.weather.temperatureF!);
  const winter = Date.parse("2026-01-17T16:00:00Z"), summer = Date.parse("2026-07-17T16:00:00Z");
  assert.ok(completeSiteData(alaska, normalize(alaska, undefined, winter), winter).scenario.weather.temperatureF! <
    completeSiteData(alaska, normalize(alaska, undefined, summer), summer).scenario.weather.temperatureF!);
  input.weather.precipitation7dMm = 100;
  assert.ok(completeSiteData(site, input, now).scenario.soil.moistureSurface! > florida.scenario.soil.moistureSurface!);
});

test("hypothetical event and gauge values fill previews without inventing operational measurements", () => {
  const result = completeSiteData(site, normalize(site, undefined, now), now);
  assert.equal(result.scenario.lightning.evidenceMode, "DEMO");
  assert.equal(result.scenario.lightning.strikes10mi30m, 0);
  for (const path of ["lightning.latestStrikeAt", "lightning.nearestStrikeMiles", "flood.stage", "wildfire.nearestFireMiles", "wildlife.latestSightingAt"])
    assert.equal(result.fields[path].kind, "SYNTHETIC");
  assert.equal(result.observed.lightning.strikes10mi30m, null);
  assert.equal(result.observed.flood.stage, null);
  assert.equal(result.completeness.notApplicable, 0);
  assert.ok(result.scenario.lightning.nearestStrikeMiles! > 10);
  assert.ok(now - Date.parse(result.scenario.lightning.latestStrikeAt!) > 30 * 60000);
  assert.ok(now - Date.parse(result.scenario.wildlife.latestSightingAt!) > 24 * 3600000);
  assert.equal(result.fields["lightning.strikes10mi30m"].kind, "SYNTHETIC");
});

test("source failures are disclosed and positive strike evidence is never paired with invented zero count", () => {
  const input = normalize(site, undefined, now);
  input.lightning.nearestStrikeMiles = 6;
  input.lightning.evidenceMode = "LIVE";
  input.provenance.error = "Source request timed out";
  const result = completeSiteData(site, input, now);
  assert.equal(result.scenario.lightning.nearestStrikeMiles, 6);
  assert.equal(result.scenario.lightning.strikes10mi30m, 1);
  assert.equal(result.fields["lightning.strikes10mi30m"].kind, "SYNTHETIC");
  assert.equal(result.scenario.lightning.evidenceMode, "DEMO");
  assert.equal(result.observed.lightning.evidenceMode, "LIVE");
  assert.match(result.fields["weather.temperatureF"].reason, /timed out/);
  assert.throws(() => completeSiteData({ ...site, id: "wrong" }, input, now), /match/);
});

test("real same-depth hourly soil history takes precedence over a synthetic percentile", () => {
  const end = Math.floor(now / 3600000) * 3600000;
  const input = normalize(site, undefined, now);
  input.validAt = new Date(end).toISOString(); input.soil.moistureRoot = 0.25;
  const point: WeatherPoint = { ...site, fetchedAt: new Date(now).toISOString(),
    current: { time: input.validAt, temperature: null, apparent: null, rain: null, wind: null, direction: null, clouds: null, code: null },
    hours: Array.from({ length: 168 }, (_, i) => ({ time: new Date(end - (i + 1) * 3600000).toISOString(), soilRoot: 0.25,
      temperature: null, apparent: null, rain: null, wind: null, direction: null, clouds: null, code: null })) };
  const result = completeSiteData(site, input, now, point);
  assert.equal(result.scenario.soil.historicalPercentile, 0.5);
  assert.equal(result.fields["soil.historicalPercentile"].kind, "SOURCE");
  assert.match(result.fields["soil.historicalPercentile"].reason, /not climatic/);
  assert.equal(result.observed.soil.historicalPercentile, null);
  for (const bad of [{ ...point, stale: true }, { ...point, latitude: site.latitude + 1 }, { ...point, hours: point.hours.slice(0, 100) }, { ...point, hours: Array(200).fill(point.hours[0]) }])
    assert.equal(completeSiteData(site, input, now, bad).fields["soil.historicalPercentile"].kind, "SYNTHETIC");
});

test("offline completion command exports every plant and preserves unrelated runtime records", () => {
  const directory = mkdtempSync(join(tmpdir(), "planit-completion-"));
  try {
    const store = new Store(directory);
    store.put("team", "team-to-preserve", { id: "team-to-preserve", name: "Existing crew", members: ["Crew member"], siteIds: [site.id] });
    store.close();
    const run = spawnSync(process.execPath, ["--import", "tsx", "server/complete-site-data.ts", "--offline"], {
      env: { ...process.env, DATA_DIR: directory }, encoding: "utf8", timeout: 30000,
    });
    assert.equal(run.status, 0, run.stderr);
    const output = JSON.parse(readFileSync(join(directory, "site-data/completion.json"), "utf8"));
    assert.equal(output.plantCount, 285); assert.equal(output.sites.length, 285);
    assert.equal(output.collection, "persisted-cache-only");
    assert.equal(output.sites[0].site.id, site.id);
    assert.equal(output.sites[0].observed.coverage.available, 0);
    const csv = readFileSync(join(directory, "site-data/coverage.csv"), "utf8").trim().split("\n");
    assert.equal(csv.length, 286);
    const invalid = spawnSync(process.execPath, ["--import", "tsx", "server/complete-site-data.ts", "--providers="], {
      env: { ...process.env, DATA_DIR: directory }, encoding: "utf8", timeout: 30000,
    });
    assert.notEqual(invalid.status, 0); assert.match(invalid.stderr, /Usage:/);
    const reopened = new Store(directory);
    try { assert.equal(reopened.get<{ name: string }>("team", "team-to-preserve")?.name, "Existing crew"); }
    finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
