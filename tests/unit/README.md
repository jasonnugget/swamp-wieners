# Unit and artifact checks

| File | Behavior covered |
| --- | --- |
| `policy.test.ts` | Lightning timing/distance, independent holds, unknown/stale forecasts, flood screening, and heat index |
| `nws-screening.test.ts` | NOAA unit conversion and missing data, partial national scores, freshness expiry, independent holds, and engine demo-clock separation |
| `engine.test.ts` | Site-local briefing timing, carry-forward reports, duplicate prevention across restart, and timezone boundaries |
| `data.test.ts` | National plant catalog, preserved fifty-site model cohort, geographic holdouts, chronological samples, feature availability, and Python/JS inference parity |
| `map-projection.test.ts` | Geographic projection round trips and distinct unknown-risk styling |
| `windows.test.ts` | Consecutive forecast windows and task-specific thresholds |

Run `npm test` from the root. Tests use Node's test runner through `tsx`; no running API or external service is required. Engine tests create and clean temporary SQLite directories. Artifact tests read bundled public exports rather than ignored raw downloads.

Add domain regressions here. UI, server transport, WebGPU training, and service-worker behavior belong in [browser tests](../e2e/README.md).

`weather.test.ts` verifies fifty-state/sample coverage, null handling, precipitation units, hourly transport, concurrent request deduplication, and stale cache behavior after provider failure.

The catalog check validates at least five real plants in each of fifty states, valid IANA zones, unique EIA IDs, and exact preservation of the original fifty-site model cohort. Existing forecast IDs must still match only that cohort. Briefing checks account for all US timezones.

`environment.test.ts` covers normalization, zero versus null, complete rain windows, field coverage, all-site shape parity, batched collection failures, live/replay separation, independent overrides, composite aggregation and canonical engine projection.

`risk-scoring.test.ts` covers heat/wind/soil boundaries, flood renormalization and warning floors, wildfire factors, wildlife recency, forecast lightning, model horizon/source guards, deterministic crew semantics and provider failures, confirmation chronology, score bounds, aggregation regressions and independent lightning policy. Policy regressions assert continuous scores and reject report-forced 10s.

`providers.test.ts` mocks source HTTP for USGS/NWS/FEMA/FIRMS/iNaturalist success, missing/malformed data, timeout, non-200, caching and expiry. It also verifies persistent cache restart, source backoff, national bounded scheduling, mode separation, zero versus unknown, normalized metadata and preservation of independent strike/alert controls.

`atlas.test.ts` checks current-frame parity for all plants, forecast scoring and source freshness, actual zero versus null, missing future hours, strike-hold expiry, warning fetch-time provenance, display selectors, continuous colors and supervisor ranking.
