import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  project,
  unproject,
  riskColor,
} from "../../src/components/site-map/projection";
import type { Site } from "../../shared/types";

test("3D map projection round-trips all real site coordinates for hazard pinning", () => {
  const sites = JSON.parse(
    readFileSync("public/data/sites.json", "utf8"),
  ) as Site[];
  for (const site of sites) {
    const point = project(site.latitude, site.longitude);
    const restored = unproject(point.x, point.z);
    assert.ok(Math.abs(restored.latitude - site.latitude) < 1e-9);
    assert.ok(Math.abs(restored.longitude - site.longitude) < 1e-9);
  }
  const origin = project(29.5, -86.5);
  assert.ok(Math.abs(origin.x) < 1e-9 && Math.abs(origin.z) < 1e-9);
  assert.ok(project(31, -86.5).z < origin.z, "north must be up on the map");
  assert.ok(project(29.5, -84).x > origin.x, "east must be right on the map");
});

test("unknown map risk has a distinct color and never appears as low risk", () => {
  assert.equal(riskColor(undefined), riskColor(null));
  assert.notEqual(riskColor(null), riskColor(0));
  assert.notEqual(riskColor(4), riskColor(5));
  assert.notEqual(riskColor(7.9), riskColor(8));
});
