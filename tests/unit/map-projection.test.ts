import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  project,
  unproject,
  riskColor,
} from "../../src/components/site-map/projection";
import type { Site } from "../../shared/types";
import { PerspectiveCamera, Vector3 } from "three";
import { mapNearPlane } from "../../src/components/site-map/camera";

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

test("map depth resolves surface overlays at national zoom without clipping close report pins", () => {
  function depth(distance: number, near: number, height: number) {
    const camera = new PerspectiveCamera(38, 1, near, 1000);
    camera.position.set(0, distance, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return Math.round((new Vector3(0, height, 0).project(camera).z * 0.5 + 0.5) * (2 ** 24 - 1));
  }
  for (const distance of [115.172, 500]) {
    // The previous fixed near plane maps land and its halo to the same depth.
    assert.equal(depth(distance, 0.02, 0), depth(distance, 0.02, 0.008));
    assert.ok(depth(distance, mapNearPlane(distance), 0) > depth(distance, mapNearPlane(distance), 0.008));
  }
  for (const distance of [0.06, 0.24, 1.6, 55.245, 115.172, 500]) {
    const near = mapNearPlane(distance);
    assert.ok(near > 0 && near < distance / 10, "near plane must stay ahead of visible ground/pins");
  }
});
