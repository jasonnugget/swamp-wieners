import { test } from "node:test";
import assert from "node:assert/strict";
import { workWindows } from "../../shared/windows";
import type { ForecastHour } from "../../shared/types";
test("forecast windows group consecutive shift hours and keep task-specific thresholds", () => {
  const hours = Array.from(
    { length: 24 },
    (_, i) =>
      ({
        time: new Date(Date.UTC(2026, 7, 1, i))
          .toISOString()
          .replace(".000Z", "Z"),
        heat: [80, 90, i >= 16 && i < 20 ? 106 : 99],
        soil: [0.1, 0.2, 0.3],
        issuedAt: "",
        baselineHeat: 90,
        temperature: 30,
        humidity: 60,
        wind: 5,
        precipitation: 0,
        x: [],
      }) satisfies ForecastHour,
  );
  const windows = workWindows(hours, "America/New_York", 0.25, "installation");
  assert.equal(windows.length, 3);
  assert.equal(windows[0].start, "2026-08-01T10:00:00Z");
  assert.equal(windows[1].restricted, true);
  assert.equal(windows[2].end, "2026-08-01T22:00:00.000Z");
  const access = workWindows(hours, "America/New_York", 0.25, "mobilization");
  assert.equal(access.length, 1);
  assert.equal(access[0].restricted, true);
});
