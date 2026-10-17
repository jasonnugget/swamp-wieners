import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Site, HazardReport } from "../../shared/types";
import { siteRisk } from "../../server/pipeline";
import { todaySiteHazards, todayCrewReports } from "../../mobile/src/lib/site-hazards";
import { reconcileWorkspace } from "../../mobile/src/lib/workspace-sync";
import type { CrewWorkspace } from "../../shared/crew";
const site: Site = JSON.parse(readFileSync("public/data/sites.json", "utf8"))[0];
const now = Date.parse("2026-10-17T16:00:00Z");
const fresh = () => siteRisk(site, undefined, now, [], [], [], false).snapshot;

test("missing site coverage stays unknown across all seven channels, including wrong-site records", () => {
  for (const snapshot of [undefined, fresh(), { ...fresh(), siteId: "different" }]) {
    const today = todaySiteHazards(site, snapshot, false, now);
    assert.equal(today.rows.length, 7);
    assert.equal(today.unknown, 7);
    assert.equal(today.flagged, 0);
    assert.ok(today.rows.every(row => row.status === "UNKNOWN" && row.score === null));
  }
});

test("current zero scores remain zero and do not clear an independent crew hold", () => {
  const snapshot = fresh();
  snapshot.channels = snapshot.channels.map(channel => ({ ...channel, score: 0, confidence: 1 }));
  snapshot.activeOverrides.push({ id: "crew", hazard: "soil", source: "crew", state: "HOLD", tasks: ["mobilization"], reason: "Blocked road", expiresAt: null });
  const today = todaySiteHazards(site, snapshot, false, now);
  assert.equal(today.unknown, 0);
  assert.equal(today.rows[0].status, "HOLD");
  assert.equal(today.rows[0].score, 0);
  assert.equal(today.rows[0].detail, "Blocked road");
  assert.equal(today.flagged, 1);
});

test("cached, old and future snapshots cannot claim current scores; cached holds stay visible", () => {
  const snapshot = fresh();
  snapshot.channels[0].score = 8;
  snapshot.activeOverrides.push({ id: "alert", hazard: "flood", source: "official-alert", state: "RESTRICTED", tasks: ["installation"], reason: "Official flood warning", expiresAt: new Date(now + 3600000).toISOString() });
  for (const [value, cached] of [[snapshot, true], [{ ...snapshot, generatedAt: new Date(now - 180000).toISOString() }, false], [{ ...snapshot, generatedAt: new Date(now + 3600000).toISOString() }, false]] as const) {
    const today = todaySiteHazards(site, value, cached, now);
    assert.equal(today.current, false);
    assert.equal(today.unknown, 7);
    assert.equal(today.overrides[0].reason, "Official flood warning");
    assert.ok(today.rows.every(row => row.score === null));
  }
});

test("forecast lightning is labeled as an estimate and never presented as a detected strike", () => {
  const snapshot = fresh(), channel = snapshot.channels.find(value => value.hazard === "lightning")!;
  snapshot.observation.lightning.forecastPotential = .8;
  snapshot.observation.lightning.evidenceMode = "FORECAST";
  channel.score = 8;
  channel.factors = [{ key: "lightning.forecastPotential", score: 8, confidence: .5, weight: 1, source: "Model estimate", kind: "environment", mode: "live", value: .8 }];
  snapshot.observation.provenance.fieldEvidence["lightning.forecastPotential"] = { source: "Open-Meteo model estimate", mode: "FORECAST", confidence: .5, fetchedAt: snapshot.generatedAt, observedAt: snapshot.generatedAt };
  const lightning = todaySiteHazards(site, snapshot, false, now).rows.find(row => row.hazard === "lightning")!;
  assert.equal(lightning.status, "ELEVATED");
  assert.match(lightning.detail, /no strike confirmed/);
  assert.ok(lightning.labels.includes("Forecast / model estimate"));
  assert.equal(lightning.overrides.length, 0);
});

test("today means the selected site's calendar date, excluding future, other-site and demo-day reports", () => {
  const time = Date.parse("2026-10-18T02:00:00Z"); // Still Oct 17 in Florida.
  const report = (id: string, createdAt: string): HazardReport => ({ id, siteId: site.id, category: "soil", author: "Crew", description: "Photo report", latitude: site.latitude, longitude: site.longitude, tasks: ["mobilization"], createdAt, status: "open" });
  const reports = [report("today", "2026-10-17T05:00:00Z"), report("same-local-day", "2026-10-18T01:00:00Z"), report("yesterday", "2026-10-17T02:00:00Z"), report("future", "2026-10-18T03:00:00Z"), report("demo", "2026-08-02T15:00:00Z"), { ...report("other", "2026-10-18T01:00:00Z"), siteId: "other" }];
  assert.deepEqual(todayCrewReports(reports, site, time).map(value => value.id), ["today", "same-local-day"]);
});

test("hazard and freshness changes reach the UI while report and map references stay stable", () => {
  const conditions = fresh();
  const workspace: CrewWorkspace = { version: 1, siteId: site.id, sites: [site], teams: [], reports: [], now: conditions.generatedAt, clockMode: "demo", conditions };
  const changed = structuredClone(workspace);
  changed.conditions!.channels[0].score = 8;
  const updated = reconcileWorkspace(workspace, changed);
  assert.equal(updated.conditions!.channels[0].score, 8);
  assert.equal(updated.sites, workspace.sites);
  assert.equal(updated.reports, workspace.reports);
  const checked = reconcileWorkspace(updated, { ...updated, conditions: { ...updated.conditions!, generatedAt: new Date(now + 30000).toISOString() } });
  assert.notEqual(checked, updated);
  assert.equal(checked.reports, workspace.reports);
  assert.equal(checked.sites, workspace.sites);
  assert.equal(checked.conditions!.generatedAt, new Date(now + 30000).toISOString());
});
