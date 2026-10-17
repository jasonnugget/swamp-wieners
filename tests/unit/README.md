# Unit and artifact checks

| File | Behavior covered |
| --- | --- |
| `policy.test.ts` | Lightning timing/distance, independent holds, unknown/stale forecasts, flood screening, and heat index |
| `nws-screening.test.ts` | NOAA unit conversion and missing data, partial national scores, freshness expiry, independent holds, and engine demo-clock separation |
| `engine.test.ts` | Site-local briefing timing, carry-forward reports, duplicate prevention across restart, and timezone boundaries |
| `data.test.ts` | Fifty unique plants, geographic holdouts, chronological samples, feature availability, and Python/JS inference parity |
| `map-projection.test.ts` | Geographic projection round trips and distinct unknown-risk styling |
| `windows.test.ts` | Consecutive forecast windows and task-specific thresholds |

Run `npm test` from the root. Tests use Node's test runner through `tsx`; no running API or external service is required. Engine tests create and clean temporary SQLite directories. Artifact tests read bundled public exports rather than ignored raw downloads.

Add domain regressions here. UI, server transport, WebGPU training, and service-worker behavior belong in [browser tests](../e2e/README.md).

`weather.test.ts` verifies fifty-state/sample coverage, null handling, precipitation units, forecast time selection, concurrent request deduplication, and stale cache behavior after provider failure.

The catalog check validates at least five real plants in each of fifty states, valid IANA zones, unique EIA IDs, and exact preservation of the original fifty-site model cohort. Existing forecast IDs must still match only that cohort. Briefing checks account for all US timezones.
