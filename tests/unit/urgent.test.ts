import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store";
import { Engine } from "../../server/engine";
import { detectUrgentHazards } from "../../shared/urgent";
import type { Alert, ModelBundle, Site, Strike } from "../../shared/types";
import type { SiteRiskSnapshot } from "../../shared/risk";

const sites = JSON.parse(readFileSync("public/data/sites.json", "utf8")) as Site[];
const site = sites[0], now = Date.parse("2026-08-02T21:45:00Z");
const strike = (miles: number, minutesAgo = 5, id = `s${miles}`): Strike => ({ id, latitude: site.latitude + miles / 69.1, longitude: site.longitude, time: new Date(now - minutesAgo * 60000).toISOString(), mode: "simulated" });
const empty = { strikes: [] as Strike[], alerts: [] as Alert[], siteRisks: {} as Record<string, SiteRiskSnapshot>, decisions: {} };

test("lightning alerts fire only for recent strikes within 10 miles", () => {
  assert.equal(detectUrgentHazards([site], { ...empty, strikes: [strike(6)] }, now)[0]?.kind, "lightning");
  assert.equal(detectUrgentHazards([site], { ...empty, strikes: [strike(12)] }, now).length, 0);
  assert.equal(detectUrgentHazards([site], { ...empty, strikes: [strike(6, 45)] }, now).length, 0);
  // A newer strike re-notifies with a new id.
  const a = detectUrgentHazards([site], { ...empty, strikes: [strike(6, 10, "a")] }, now)[0].id;
  const b = detectUrgentHazards([site], { ...empty, strikes: [strike(6, 10, "a"), strike(4, 1, "b")] }, now)[0].id;
  assert.notEqual(a, b);
});

test("thunderstorm weather codes and severe official alerts escalate", () => {
  const risk = { observation: { weather: { weatherCode: 95 } } } as unknown as SiteRiskSnapshot;
  assert.equal(detectUrgentHazards([site], { ...empty, siteRisks: { [site.id]: risk } }, now)[0]?.kind, "thunderstorm");
  const alert: Alert = { id: "nws-1", siteId: site.id, category: "flood", title: "Flash Flood Warning", event: "Flash Flood Warning", severity: 7, expiresAt: new Date(now + 3600000).toISOString(), mode: "live" };
  assert.deepEqual(detectUrgentHazards([site], { ...empty, alerts: [alert] }, now).map(a => a.kind), ["nws-warning"]);
  assert.equal(detectUrgentHazards([site], { ...empty, alerts: [{ ...alert, severity: 3 }] }, now).length, 0);
  assert.equal(detectUrgentHazards([site], { ...empty, alerts: [{ ...alert, expiresAt: new Date(now - 1).toISOString() }] }, now).length, 0);
});

test("engine keeps the first detection time so alerts are edge-triggered", () => {
  const directory = mkdtempSync(join(tmpdir(), "threshold-urgent-")), store = new Store(directory);
  try {
    const engine = new Engine(store, [site], JSON.parse(readFileSync("public/data/forecasts.json", "utf8")),
      JSON.parse(readFileSync("public/models/bundle.json", "utf8")) as ModelBundle, JSON.parse(readFileSync("public/data/scenario.json", "utf8")));
    store.insert("strike", "demo", { ...strike(6, 0, "demo"), time: new Date(engine.now()).toISOString() });
    const first = engine.snapshot().urgentAlerts.find(a => a.kind === "lightning");
    assert.ok(first);
    store.put("config", "clock", { mode: "demo", now: new Date(engine.now() + 10 * 60000).toISOString() });
    const later = engine.snapshot().urgentAlerts.find(a => a.kind === "lightning");
    assert.equal(later?.id, first.id);
    assert.equal(later?.firedAt, first.firedAt);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
