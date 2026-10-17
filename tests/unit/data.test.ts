import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ModelBundle, Sample, Site } from "../../shared/types";
import { predict } from "../../shared/model";
const read = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8"));
test("fifty real plants, geographic bounds, and ten excluded sites", () => {
  const sites = read<Site[]>("public/data/sites.json");
  assert.equal(sites.length, 50);
  assert.equal(new Set(sites.map((s) => s.id)).size, 50);
  assert.equal(sites.filter((s) => s.heldOut).length, 10);
  for (const s of sites) {
    assert.ok(s.latitude >= 24 && s.latitude <= 34);
    assert.ok(s.longitude >= -94 && s.longitude <= -79);
    assert.match(s.source, /eia.gov/);
  }
});
test("exported data keeps temporal splits disjoint and all features available before the briefing", () => {
  const data = read<Record<string, Sample[]>>("public/data/samples.json");
  for (const samples of Object.values(data))
    for (const s of samples) {
      const date = s.time.slice(0, 10);
      const issue = Date.parse(s.issuedAt);
      assert.equal(Date.parse(s.time) - issue, 48 * 3600000);
      assert.ok(Date.parse(s.availableAt) <= issue);
      assert.ok(s.x.every(Number.isFinite));
      if (s.split === "train") assert.ok(date < "2025-01-01");
      if (s.split === "validation")
        assert.ok(date >= "2025-01-01" && date < "2025-07-01");
      if (s.split === "calibration")
        assert.ok(date >= "2025-07-01" && date < "2026-01-01");
      if (s.split === "test") assert.ok(date >= "2026-01-01");
    }
});
test("JavaScript inference reproduces the exported Python predictions", () => {
  const model = read<ModelBundle>("public/models/bundle.json");
  const forecasts = read<
    Record<
      string,
      {
        hours: {
          x: number[];
          baselineHeat: number;
          heat: number[];
          soil: number[];
        }[];
      }
    >
  >("public/data/forecasts.json");
  for (const f of Object.values(forecasts))
    for (const h of f.hours) {
      const heat = predict(model.heat, h.x, h.baselineHeat),
        soil = predict(model.soil, h.x).map((v) => Math.max(0, Math.min(1, v)));
      for (let j = 0; j < 3; j++) {
        assert.ok(Math.abs(heat[j] - h.heat[j]) < 0.005);
        assert.ok(Math.abs(soil[j] - h.soil[j]) < 0.0001);
      }
    }
  assert.ok(model.evaluation.heat.count > 100000);
  assert.ok(model.evaluation.unseenHeat.count > 10000);
});
