import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store";
import { buildFleetBriefing, dueFleetDate, fleetPdfPath } from "../../server/briefings/fleet";
import { atRiskFromBriefings, templateSummary } from "../../shared/fleet-briefing";
import type { Briefing, Site, TaskState } from "../../shared/types";

const sites = (JSON.parse(readFileSync("public/data/sites.json", "utf8")) as Site[]).slice(0, 3);
const briefing = (site: Site, states: TaskState[], index: number): Briefing => ({
  id: `${site.id}:2026-08-03`, siteId: site.id, localDate: "2026-08-03", generatedAt: "2026-08-02T22:00:00Z", forecastMode: "historical", reportIds: [], text: "",
  decision: { siteId: site.id, index, policyVersion: "test", channels: [], lightningUntil: null, unknownCount: 0,
    tasks: (["mobilization", "installation", "preparation"] as const).map((task, i) => ({ task, state: states[i], reasons: states[i] === "AVAILABLE" ? [] : ["Weather: 8.0/10 environmental screen"] })) },
});

test("at-risk selection keeps restricted and held sites, holds first", () => {
  const list = atRiskFromBriefings([
    briefing(sites[0], ["RESTRICTED", "RESTRICTED", "AVAILABLE"], 8.5),
    briefing(sites[1], ["HOLD", "AVAILABLE", "AVAILABLE"], 6),
    briefing(sites[2], ["AVAILABLE", "AVAILABLE", "AVAILABLE"], 2),
  ], sites);
  assert.deepEqual(list.map(s => s.siteId), [sites[1].id, sites[0].id]);
  assert.match(templateSummary("2026-08-03", list, 3), /2 of 3 plants/);
});

test("fleet briefing falls back to a template summary without Gemini and writes a PDF", async () => {
  const key = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
  const directory = mkdtempSync(join(tmpdir(), "threshold-fleet-")), store = new Store(directory);
  try {
    for (const b of [briefing(sites[0], ["HOLD", "HOLD", "AVAILABLE"], 9.2), briefing(sites[1], ["AVAILABLE", "AVAILABLE", "AVAILABLE"], 1)]) store.put("briefing", b.id, b);
    assert.equal(dueFleetDate(store, sites), "2026-08-03");
    const result = await buildFleetBriefing(store, directory, sites, "2026-08-03", Date.parse("2026-08-02T22:00:00Z"));
    assert.equal(result.summaryMode, "template");
    assert.equal(result.atRiskSites.length, 1);
    assert.equal(result.totalSites, 2);
    const pdf = fleetPdfPath(directory, "2026-08-03");
    assert.ok(existsSync(pdf));
    assert.equal(readFileSync(pdf).subarray(0, 4).toString(), "%PDF");
    assert.equal(dueFleetDate(store, sites), undefined);
    // A later time zone briefing makes the day due again.
    const late = briefing(sites[2], ["RESTRICTED", "AVAILABLE", "AVAILABLE"], 7.1);
    store.put("briefing", late.id, late);
    assert.equal(dueFleetDate(store, sites), "2026-08-03");
  } finally {
    if (key !== undefined) process.env.GEMINI_API_KEY = key;
    store.close(); rmSync(directory, { recursive: true, force: true });
  }
});
