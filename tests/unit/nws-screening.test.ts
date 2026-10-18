import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchNwsScreening } from "../../server/integrations/nws-screening";
import { decide } from "../../shared/policy";
import { heatIndex } from "../../shared/model";
import { Engine } from "../../server/engine";
import { Store } from "../../server/store";
import type { Site, WeatherScreening, HazardReport } from "../../shared/types";
const sites: Site[] = JSON.parse(readFileSync("public/data/sites.json", "utf8"));
const site = sites.find(s => s.state === "CA")!;
const now = Date.now();
const screening: WeatherScreening = {
  siteId: site.id, source: "NOAA/NWS", sourceUrl: "https://api.weather.gov/gridpoints/LOX/70,113/forecast/hourly",
  fetchedAt: new Date(now).toISOString(), issuedAt: new Date(now - 3600000).toISOString(),
  hours: [{ time: new Date(now + 3600000).toISOString(), heatIndex: 104, windKmh: 55 }],
};
test("NWS adapter converts Fahrenheit and wind ranges, preserving missing humidity and wind", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => new Response(JSON.stringify(String(input).includes("/points/")
    ? { properties: { forecastHourly: screening.sourceUrl } }
    : { properties: { updateTime: screening.issuedAt, periods: [
      { startTime: screening.hours[0].time, temperature: 95, temperatureUnit: "F", relativeHumidity: { value: 60 }, windSpeed: "10 to 20 mph" },
      { startTime: screening.hours[0].time, temperature: 20, temperatureUnit: "C", relativeHumidity: { value: null }, windSpeed: "unknown" },
    ] } }), { status: 200 });
  try {
    const result = await fetchNwsScreening(site);
    assert.equal(result.hours[0].heatIndex, heatIndex(35, 60));
    assert.equal(result.hours[0].windKmh, 20 * 1.609344);
    assert.equal(result.hours[1].heatIndex, null);
    assert.equal(result.hours[1].windKmh, null);
    assert.equal(result.source, "NOAA/NWS");
    assert.equal("modelVersion" in result, false);
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(fetchNwsScreening(site), /HTTP 503/);
  } finally { globalThis.fetch = original; }
});
test("national forecast screening scores heat/wind without inventing soil or custom model coverage", () => {
  const result = decide(site, undefined, [], [], [], now, undefined, screening);
  assert.ok(result.index !== null && result.index >= 6 && result.index < 7);
  assert.equal(result.unknownCount, 5);
  assert.equal(result.channels.find(c => c.category === "soil")?.severity, null);
  assert.match(result.channels.find(c => c.category === "heat")!.source, /NOAA\/NWS/);
  for (const invalid of [
    { ...screening, fetchedAt: new Date(now - 3 * 3600000).toISOString() },
    { ...screening, issuedAt: new Date(now - 24 * 3600000).toISOString() },
    { ...screening, siteId: "another" },
    { ...screening, hours: [{ ...screening.hours[0], time: new Date(now + 48 * 3600000).toISOString() }] },
    { ...screening, hours: [{ ...screening.hours[0], heatIndex: null, windKmh: null }] },
  ]) assert.equal(decide(site, undefined, [], [], [], now, undefined, invalid).index, null);
});
test("low official forecasts cannot clear independent crew or lightning holds", () => {
  const low = { ...screening, hours: [{ ...screening.hours[0], heatIndex: 70, windKmh: 0 }] };
  const report: HazardReport = { id: "crew", siteId: site.id, category: "soil", description: "Access road blocked", tasks: ["mobilization"], latitude: site.latitude, longitude: site.longitude, author: "Crew", status: "open", createdAt: new Date(now).toISOString() };
  const strikes = [{ id: "strike", latitude: site.latitude, longitude: site.longitude, time: new Date(now).toISOString(), mode: "simulated" as const }];
  const result = decide(site, undefined, [report], strikes, [], now, undefined, low);
  assert.ok(result.index! >= 9 && result.index! < 10);
  assert.equal(result.tasks.find(t => t.task === "mobilization")?.state, "HOLD");
  assert.equal(result.tasks.find(t => t.task === "installation")?.state, "HOLD");
  assert.ok(decide(site, undefined, [{ ...report, status: "resolved" }], strikes, [], now, undefined, low).index! < 10);
});
test("engine uses current official screening in demo without borrowing model forecasts, and expires it", () => {
  const directory = mkdtempSync(join(tmpdir(), "threshold-nws-"));
  const store = new Store(directory);
  try {
    const models = JSON.parse(readFileSync("public/models/bundle.json", "utf8"));
    const engine = new Engine(store, [site], {}, models, { now: "2026-08-01T12:00:00Z", heroSiteId: site.id });
    store.put("weather-screening", site.id, screening);
    const snapshot = engine.snapshot();
    assert.equal(snapshot.clockMode, "demo");
    assert.equal(snapshot.forecasts[site.id], undefined);
    assert.ok(snapshot.decisions[site.id].index! >= 6);
    store.put("weather-screening", site.id, { ...screening, fetchedAt: new Date(now - 4 * 3600000).toISOString() });
    assert.equal(engine.snapshot().decisions[site.id].index, null);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("offshore plants use official raw grid intervals instead of unavailable land hourly forecasts", async () => {
  const original = globalThis.fetch;
  const start = Math.floor(Date.now() / 3600000) * 3600000;
  const validTime = `${new Date(start).toISOString()}/PT2H`;
  globalThis.fetch = async input => new Response(JSON.stringify(String(input).includes("/points/")
    ? { properties: { type: "marine", forecastGridData: "https://api.weather.gov/gridpoints/BOX/101,45" } }
    : { properties: { updateTime: new Date().toISOString(),
      temperature: { uom: "wmoUnit:degC", values: [{ validTime, value: 30 }] },
      relativeHumidity: { uom: "wmoUnit:percent", values: [{ validTime, value: 70 }] },
      windSpeed: { uom: "wmoUnit:km_h-1", values: [{ validTime, value: 55 }] },
    } }), { status: 200 });
  try {
    const result = await fetchNwsScreening(site);
    assert.equal(result.hours[0].heatIndex, heatIndex(30, 70));
    assert.equal(result.hours[1].windKmh, 55);
    assert.equal(result.hours[2].windKmh, null);
    assert.equal(result.hours[2].heatIndex, null);
  } finally { globalThis.fetch = original; }
});

test("real-clock briefing includes the entire next local day of NOAA screening", () => {
  const directory = mkdtempSync(join(tmpdir(), "threshold-nws-briefing-"));
  const store = new Store(directory);
  const originalNow = Date.now;
  const evening = Date.parse("2026-10-18T02:00:00Z"); // 7 PM on October 17 in California.
  Date.now = () => evening;
  try {
    const models = JSON.parse(readFileSync("public/models/bundle.json", "utf8"));
    const engine = new Engine(store, [site], {}, models, { now: "2026-08-01T12:00:00Z", heroSiteId: site.id });
    store.put("weather-screening", site.id, { ...screening,
      fetchedAt: new Date(evening).toISOString(), issuedAt: new Date(evening).toISOString(),
      hours: Array.from({ length: 24 }, (_, i) => ({ time: new Date(Date.parse("2026-10-18T07:00:00Z") + i * 3600000).toISOString(), heatIndex: i === 23 ? 104 : 70, windKmh: 0 })),
    });
    engine.setClock("real");
    const briefing = engine.snapshot().briefings[0];
    assert.equal(briefing.localDate, "2026-10-18");
    assert.equal(briefing.forecastMode, "live");
    assert.ok(briefing.decision.index! >= 6);
    assert.match(briefing.text, /24 hourly records.*NOAA\/NWS/);
  } finally { Date.now = originalNow; store.close(); rmSync(directory, { recursive: true, force: true }); }
});
