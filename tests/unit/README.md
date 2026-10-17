# Unit and artifact checks

| File | Behavior covered |
| --- | --- |
| `policy.test.ts` | Lightning timing/distance, independent holds, unknown/stale forecasts, flood screening, and heat index |
| `nws-screening.test.ts` | NOAA unit conversion and missing data, partial national scores, freshness expiry, independent holds, and engine demo-clock separation |
| `dev-readiness.test.ts` | API startup retries, valid health responses, connection refusal and bounded hung requests |
| `engine.test.ts` | Site-local briefing timing, carry-forward reports, duplicate prevention across restart, and timezone boundaries |
| `data.test.ts` | National plant catalog, preserved fifty-site model cohort, geographic holdouts, chronological samples, feature availability, and Python/JS inference parity |
| `map-projection.test.ts` | Geographic projection round trips, distinct unknown-risk styling and 24-bit depth separation across zoom scales |
| `windows.test.ts` | Consecutive forecast windows and task-specific thresholds |

Run `npm test` from the root. Tests use Node's test runner through `tsx`; no running API or external service is required. Engine tests create and clean temporary SQLite directories. Artifact tests read bundled public exports rather than ignored raw downloads.

Add domain regressions here. UI, server transport, WebGPU training, and service-worker behavior belong in [browser tests](../e2e/README.md).

`weather.test.ts` verifies fifty-state/sample coverage, null handling, precipitation units, hourly transport, concurrent request deduplication, and stale cache behavior after provider failure.

The catalog check validates at least five real plants in each of fifty states, valid IANA zones, unique EIA IDs, and exact preservation of the original fifty-site model cohort. Existing forecast IDs must still match only that cohort. Briefing checks account for all US timezones.

`environment.test.ts` covers normalization, zero versus null, complete rain windows, field coverage, all-site shape parity, batched collection failures, live/replay separation, independent overrides, composite aggregation and canonical engine projection.

`risk-scoring.test.ts` covers heat/wind/soil boundaries, flood renormalization and warning floors, wildfire factors, wildlife recency, forecast lightning, model horizon/source guards, deterministic crew semantics and provider failures, confirmation chronology, score bounds, aggregation regressions and independent lightning policy. Policy regressions assert continuous scores and reject report-forced 10s.

`providers.test.ts` mocks source HTTP for USGS/NWS/FEMA/FIRMS/iNaturalist success, missing/malformed data, timeout, non-200, caching and expiry. It also verifies persistent cache restart, source backoff, national bounded scheduling, mode separation, zero versus unknown, normalized metadata and preservation of independent strike/alert controls.

`atlas.test.ts` checks scoped engine snapshots/forecast parity and current-frame parity for all plants, forecast scoring and source freshness, actual zero versus null, missing future hours, strike-hold expiry, warning fetch-time provenance, display selectors, continuous colors and supervisor ranking.

`http.test.ts` verifies large-JSON gzip negotiation, payload preservation, uncompressed fallback when gzip is refused, and unbuffered SSE.

`site-data.test.ts` checks real-value precedence, measured zero/false, deterministic location/season fallbacks, all-plant field parity, fully populated hypothetical event/gauge fields with unchanged observed nulls, source errors, unchanged operational coverage and real hourly-soil midrank. It runs the offline command in isolated SQLite storage to verify JSON/CSV exports and preserved unrelated records. Provider tests also cover shared keyless FIRMS downloads and separate Alaska caching.

NWPS provider tests cover zero/negative stage, sentinel/stale/flow/distance rejection, same-gauge trends and percentiles, incompatible history, timeout/non-200/malformed responses, cache timestamps and fallback without mixed gauge datums. NWS tests verify shared statewide empty checks without retimestamping.

`observation-display.test.ts` verifies all 34 displayed fields against every plant’s canonical shape, preserves zero/false versus unknown, checks moisture/percentile units and negative water-level trends, and formats timestamps in the plant’s time zone.

Atlas regression tests compare frames with and without demo companions at hours 0, 24 and 72, for all 285 plants. Every companion field must be non-null while the original snapshot, risk, source coverage and policy remain identical.
