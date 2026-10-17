import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, distanceMiles, lightningUntil } from "../../shared/policy";
import { heatIndex } from "../../shared/model";
import type { Forecast, HazardReport, Site, Strike } from "../../shared/types";
const site: Site = {
  id: "1",
  name: "Test",
  state: "FL",
  county: "Dade",
  utility: "Test",
  latitude: 25,
  longitude: -80,
  timezone: "America/New_York",
  capacityMw: 1,
  source: "test",
  sourceDate: "2026-08",
  heldOut: false,
  riverScreening: false,
};
const now = Date.parse("2026-08-01T16:00:00Z");
const strike = (id: string, time: number, miles = 0): Strike => ({
  id,
  time: new Date(time).toISOString(),
  latitude: site.latitude + miles / 69.0934,
  longitude: site.longitude,
  mode: "simulated",
});
const forecast: Forecast = {
  siteId: "1",
  mode: "historical",
  fetchedAt: new Date(now).toISOString(),
  modelVersion: "test",
  hours: [
    {
      time: new Date(now + 86400000).toISOString(),
      issuedAt: new Date(now - 86400000).toISOString(),
      heat: [70, 75, 79],
      soil: [0.1, 0.15, 0.19],
      temperature: 25,
      humidity: 50,
      precipitation: 0,
      wind: 10,
      baselineHeat: 75,
      x: [],
    },
  ],
};
test("lightning resets from the latest qualifying strike and releases at exactly thirty minutes", () => {
  const events = [strike("a", now - 20 * 60000), strike("b", now - 5 * 60000)];
  assert.equal(
    lightningUntil(site, events, now),
    new Date(now + 25 * 60000).toISOString(),
  );
  assert.equal(lightningUntil(site, events, now + 25 * 60000), null);
  assert.equal(
    lightningUntil(site, [...events, events[1]], now),
    new Date(now + 25 * 60000).toISOString(),
  );
});
test("strikes outside ten miles and in the future do not create holds", () => {
  assert.equal(
    lightningUntil(
      site,
      [strike("far", now, 10.01), strike("future", now + 60000)],
      now,
    ),
    null,
  );
  assert.ok(lightningUntil(site, [strike("inside", now, 9.99)], now));
  assert.equal(distanceMiles(site, site), 0);
});
test("a lower model estimate cannot clear a crew hold; resolution preserves other holds", () => {
  const report: HazardReport = {
    id: "r",
    siteId: "1",
    category: "soil",
    tasks: ["mobilization"],
    description: "Road access is blocked",
    latitude: 25,
    longitude: -80,
    author: "Crew",
    createdAt: new Date(now).toISOString(),
    status: "open",
  };
  const d = decide(site, forecast, [report], [], [], now);
  assert.equal(d.tasks.find((t) => t.task === "mobilization")!.state, "HOLD");
  assert.ok(d.index! >= 4 && d.index! < 10);
  assert.equal(
    d.tasks.find((t) => t.task === "preparation")!.state,
    "AVAILABLE",
  );
  const resolved = decide(
    site,
    forecast,
    [{ ...report, status: "resolved" }],
    [strike("s", now)],
    [],
    now,
  );
  assert.equal(
    resolved.tasks.find((t) => t.task === "mobilization")!.state,
    "HOLD",
  );
});
test("a task-specific crew report cannot hide an independent environmental hold in the same category", () => {
  const report: HazardReport = {
    id: "r",
    siteId: "1",
    category: "lightning",
    tasks: ["preparation"],
    description: "Check the shelter before use",
    latitude: 25,
    longitude: -80,
    author: "Crew",
    createdAt: new Date(now).toISOString(),
    status: "open",
  };
  const d = decide(site, forecast, [report], [strike("s", now)], [], now);
  assert.equal(d.tasks.find((t) => t.task === "installation")!.state, "HOLD");
  assert.equal(d.tasks.find((t) => t.task === "preparation")!.state, "HOLD");
});
test("missing, stale, or invalid forecasts remain unknown rather than zero", () => {
  assert.equal(decide(site, undefined, [], [], [], now).index, null);
  assert.equal(
    decide(
      site,
      {
        ...forecast,
        mode: "live",
        fetchedAt: new Date(now - 4 * 3600000).toISOString(),
      },
      [],
      [],
      [],
      now,
    ).index,
    null,
  );
  assert.equal(
    decide(
      site,
      {
        ...forecast,
        mode: "live",
        fetchedAt: new Date(now + 3600000).toISOString(),
      },
      [],
      [],
      [],
      now,
    ).index,
    null,
  );
  assert.equal(
    decide(
      site,
      { ...forecast, hours: [{ ...forecast.hours[0], heat: [NaN, 80, 90] }] },
      [],
      [],
      [],
      now,
    ).index,
    null,
  );
  assert.equal(
    decide(site, forecast, [], [], [], now + 30 * 86400000).index,
    null,
  );
  assert.equal(decide(site, forecast, [], [], [], now).unknownCount, 4);
});
test("river rainfall screen restricts access while dry, unverified flooding remains unknown", () => {
  const wet = {
    ...forecast,
    hours: [{ ...forecast.hours[0], precipitation: 30 }],
  };
  const d = decide({ ...site, riverScreening: true }, wet, [], [], [], now);
  assert.equal(
    d.channels.find((c) => c.category === "flood")!.status,
    "RESTRICTED",
  );
  assert.equal(
    decide(
      { ...site, riverScreening: true },
      forecast,
      [],
      [],
      [],
      now,
    ).channels.find((c) => c.category === "flood")!.status,
    "UNKNOWN",
  );
  const overnight = decide(
    { ...site, riverScreening: true },
    { ...forecast, antecedentRain24: 35 },
    [],
    [],
    [],
    now,
  );
  assert.equal(
    overnight.channels.find((c) => c.category === "flood")!.status,
    "RESTRICTED",
  );
});
test("NOAA heat index calculation handles heat and mild weather", () => {
  assert.ok(Math.abs(heatIndex((96 - 32) / 1.8, 65) - 121) < 1);
  assert.ok(heatIndex(20, 40) < 80);
});
