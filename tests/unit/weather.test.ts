import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadWeather, parseWeather } from "../../server/integrations/atlas-weather";
import { type WeatherLocation } from "../../shared/weather";

const location: WeatherLocation = { id: "test", name: "Test point", latitude: 39.74, longitude: -104.99 };
const epoch = Date.parse("2026-10-17T06:15:00Z") / 1000;
function fixture() {
  return { current: { time: epoch, interval: 900, temperature_2m: 62, apparent_temperature: 60, precipitation: 0.5, wind_speed_10m: 12, wind_direction_10m: 270, cloud_cover: 40, weather_code: 3 }, hourly: { time: [epoch + 2700, epoch + 6300], temperature_2m: [66, null], precipitation: [1.5, null], wind_speed_10m: [15, null], cloud_cover: [50, null] } };
}
test("atlas has fifty states and samples, including Alaska and Hawaii", () => {
  const states = JSON.parse(readFileSync("public/data/us-states.geojson", "utf8"));
  const stations = JSON.parse(readFileSync("public/data/weather-stations.json", "utf8"));
  assert.equal(new Set(states.features.map((f: any) => f.properties.name)).size, 50);
  assert.equal(new Set(stations.map((p: WeatherLocation) => p.id)).size, 50);
  assert.ok(states.features.some((f: any) => f.properties.name === "Alaska"));
  assert.ok(stations.some((p: WeatherLocation) => p.id === "HI"));
});
test("weather keeps provider units, normalizes the current precipitation interval, and never turns missing values into zero", () => {
  const point = parseWeather(fixture(), location, epoch * 1000);
  assert.equal(point.current.temperature, 62);
  assert.equal(point.current.rain, 2);
  assert.equal(point.hours[0].rain, 1.5);
  assert.equal(point.hours[0].apparent, null);
  assert.equal(point.hours[1].temperature, null);
  assert.equal(point.hours[0].temperature, 66);
});
test("weather cache deduplicates concurrent requests and marks old results stale on provider failure", async (t) => {
  let now = epoch * 1000, calls = 0, fail = false;
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (fail) throw new Error("Provider offline");
    return new Response(JSON.stringify(fixture()), { status: 200 });
  });
  const [a, b] = await Promise.all([loadWeather([location]), loadWeather([location])]);
  assert.equal(calls, 1);
  assert.equal(a[0].current.temperature, b[0].current.temperature);
  now += 16 * 60 * 1000;
  fail = true;
  const stale = await loadWeather([location]);
  assert.equal(stale[0].stale, true);
  assert.equal(stale[0].fetchedAt, a[0].fetchedAt);
  assert.match(stale[0].error!, /offline/);
});

test("provider 429 shares a Retry-After cooldown across coordinate batches and recovers", async t => {
  let now = epoch * 1000, calls = 0;
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    calls++;
    const url = new URL(String(input));
    assert.ok(url.searchParams.get("hourly")?.includes("soil_moisture_0_to_1cm"));
    assert.ok(url.searchParams.get("hourly")?.includes("cape"));
    assert.ok(url.searchParams.get("current")?.includes("relative_humidity_2m"));
    assert.equal(url.searchParams.get("past_hours"), "168");
    return calls === 1 ? new Response("rate limited", { status: 429, headers: { "Retry-After": "120" } })
      : new Response(JSON.stringify([fixture(), fixture()]));
  });
  const locations = [{ ...location, id: "rate-a", latitude: 40 }, { ...location, id: "rate-b", latitude: 41 }];
  assert.deepEqual(await loadWeather(locations), []);
  assert.deepEqual(await loadWeather([{ ...location, latitude: 42 }]), []);
  assert.equal(calls, 1);
  now += 120000;
  assert.equal((await loadWeather(locations)).length, 2);
  assert.equal(calls, 2);
});
