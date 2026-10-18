import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store";
import { Engine } from "../../server/engine";
import { localParts, nextDate } from "../../shared/clock";
import type { ModelBundle, Site } from "../../shared/types";
const sites = JSON.parse(
  readFileSync("public/data/sites.json", "utf8"),
) as Site[];
const models = JSON.parse(
  readFileSync("public/models/bundle.json", "utf8"),
) as ModelBundle;
const forecasts = JSON.parse(
  readFileSync("public/data/forecasts.json", "utf8"),
);
const scenario = JSON.parse(readFileSync("public/data/scenario.json", "utf8"));
test("idle and already-generated briefing ticks avoid national scoring without changing scheduling", () => {
  const directory = mkdtempSync(join(tmpdir(), "planit-idle-")), store = new Store(directory);
  try {
    const eastern = sites.find(s => s.timezone === "America/New_York")!;
    const engine = new Engine(store, [eastern], forecasts, models, scenario);
    const snapshot = engine.snapshot.bind(engine); let reads = 0;
    engine.snapshot = (...args) => { reads++; return snapshot(...args); };
    store.put("config", "clock", { mode: "demo", now: "2026-08-02T16:00:00Z" });
    assert.equal(engine.tick(), false); assert.equal(reads, 0);
    store.put("config", "clock", { mode: "demo", now: "2026-08-02T22:00:00Z" });
    assert.equal(engine.tick(), true); assert.equal(reads, 1);
    assert.equal(store.all("briefing").length, 1);
    assert.equal(engine.tick(), false); assert.equal(reads, 1);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
test("six PM briefing runs per timezone, includes unresolved reports, and survives restart without duplicates", () => {
  const directory = mkdtempSync(join(tmpdir(), "planit-"));
  let store = new Store(directory);
  try {
    let engine = new Engine(store, sites, forecasts, models, scenario);
    const eastern = sites.find((s) => s.timezone === "America/New_York")!,
      central = sites.find((s) => s.timezone === "America/Chicago")!;
    const report = engine.report({
      siteId: eastern.id,
      category: "wildlife",
      description: "Alligator at access road",
      tasks: ["mobilization"],
      latitude: eastern.latitude,
      longitude: eastern.longitude,
      author: "Crew",
    });
    engine.setClock("demo", "2026-08-01T21:59:00Z");
    assert.equal(store.all("briefing").length, 0);
    engine.setClock("demo", "2026-08-01T22:00:00Z");
    const a = engine.snapshot().briefings;
    assert.ok(a.some((b) => b.siteId === eastern.id));
    assert.ok(!a.some((b) => b.siteId === central.id));
    const briefing = a.find((b) => b.siteId === eastern.id)!;
    assert.equal(briefing.localDate, "2026-08-02");
    assert.ok(briefing.reportIds.includes(report.id));
    assert.match(briefing.text, /Alligator/);
    assert.equal(engine.tick(), false);
    store.close();
    store = new Store(directory);
    engine = new Engine(store, sites, forecasts, models, scenario);
    assert.equal(engine.tick(), false);
    assert.equal(engine.snapshot().briefings.length, a.length);
    engine.setClock("demo", "2026-08-01T23:00:00Z");
    assert.equal(engine.snapshot().briefings.length, sites.filter((s) => localParts(engine.now(), s.timezone).hour >= 18).length);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("timezone handling covers winter, daylight saving changes, and year boundaries", () => {
  assert.equal(
    localParts(Date.parse("2026-11-01T23:00:00Z"), "America/New_York").hour,
    18,
  );
  assert.equal(
    localParts(Date.parse("2026-03-08T22:00:00Z"), "America/New_York").hour,
    18,
  );
  assert.equal(nextDate("2026-12-31"), "2027-01-01");
});
