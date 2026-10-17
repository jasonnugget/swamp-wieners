# Unit and artifact checks

| File | Behavior covered |
| --- | --- |
| `policy.test.ts` | Lightning timing/distance, independent holds, unknown/stale forecasts, flood screening, and heat index |
| `engine.test.ts` | Site-local briefing timing, carry-forward reports, duplicate prevention across restart, and timezone boundaries |
| `data.test.ts` | Fifty unique plants, geographic holdouts, chronological samples, feature availability, and Python/JS inference parity |
| `map-projection.test.ts` | Geographic projection round trips and distinct unknown-risk styling |
| `windows.test.ts` | Consecutive forecast windows and task-specific thresholds |

Run `npm test` from the root. Tests use Node's test runner through `tsx`; no running API or external service is required. Engine tests create and clean temporary SQLite directories. Artifact tests read bundled public exports rather than ignored raw downloads.

Add domain regressions here. UI, server transport, WebGPU training, and service-worker behavior belong in [browser tests](../e2e/README.md).
