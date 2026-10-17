# Browser workflows

Run `npm run test:e2e` from the root. Installed Google Chrome is required. `playwright.config.ts` builds the app, starts the API on port 4173 and uses `runtime/e2e/`. Tests run serially because they share the isolated server; workflows explicitly reset demonstration state. They do not reset the normal runtime database.

| File | Coverage |
| --- | --- |
| `site-data-preview.spec.ts` | All-plant/current/future completion APIs, source precedence, unchanged operational scores/policy/coverage, synthetic labels, source-only switch and Site intelligence companion |
| `site-risk-api.spec.ts` | All-site current snapshot parity, observation validation, structured factors/drivers, model availability, provider status, atlas hours 0/72 and invalid query handling |
| `weather-atlas.spec.ts` | Canonical risk ranges, unknown/low-confidence states, coverage, eleven layers, forecast frames, search/regions, geometry reuse, countdown/reset, stale reads, all 34 observation fields, field provenance, provider/plant inspection, keyboard evidence-view switching and mobile overflow |
| `risk-fixtures.ts` | Deterministic canonical frames produced with the backend scorer; not live provider evidence |
| `national-plants.spec.ts` | All-state/catalog-only selection and reporting, matching-hour NOAA canonical fallback, stale-to-unknown behavior and no fabricated model coverage |
| `map.spec.ts` | Actual WebGL projection/depth across national and pinning scales, camera orbit/zoom, selection/showcase, geographic report pins, pan/pinch rejection, reduced motion, focus restoration, flat fallback and scene-module errors |
| `crew-teams.spec.ts` | Shared assignments, remembered defaults, plant-specific drafts/pins, report attribution, invalid-assignment rejection, history and reset preservation |
| `workflow.spec.ts` | Photo handoff across screens, independent replay lightning holds, briefing carry-forward, report resolution, browser training/inference, offline reload and mobile layout |
| `redesign.spec.ts` | Loading/retry, editorial homepage, navigation/history, reduced motion, feature keyboard controls, atlas bounds and reset confirmation |

The atlas tests reject any `/api/weather/*` request from the supervisor. Layer changes read one existing frame; slider changes request one batched national frame. The real crew-submission test verifies SSE updates to the supervisor's beacon, risk, evidence, holds and priority list. JEV and live lightning fixtures do not claim authenticated provider connectivity.

The isolated server sets `DISABLE_NWS_SCREENING=1`, `DISABLE_ENVIRONMENT_COLLECTION=1` and `DISABLE_EXTERNAL_PROVIDERS=1`. These flags disable their respective background jobs; explicit refresh requests can still collect. Tests use deterministic fixtures or existing persisted inputs. Actual source checks are recorded separately in [provider documentation](../../docs/environment-providers.md).

WebGPU/SwiftShader flags allow headless execution on the test machine. A backend label is evidence of that execution path, not hardware performance. The tests allow explicit fallbacks and assert computations, not only screenshots. The offline workflow checks both Model Lab and the atlas using the cached canonical workspace; there is no independent weather-atlas cache.

The scene-module failure test blocks service workers so interception reaches the import. It distinguishes a missing chunk from unavailable graphics. Production tests do not exercise Vite's optimized-dependency cache; after development dependency changes, also verify the running Vite scene has no HTTP 504 dependency errors.

Screenshots/traces go to ignored `test-results/`. Keep fixtures in maintained directories; do not commit test databases or uploads. Preserve offline checks after lazy-import, Three.js, static-URL or service-worker changes. See [verification context](../README.md) for the latest recorded run.

`cache-recovery.spec.ts` seeds pre-canonical and pre-structured-evidence snapshots, verifies a recoverable loading/error screen during an outage, then retries successfully without clearing the crew profile. It also forces browser storage quota errors and verifies fresh API state still opens the homepage. The offline workflow covers the versioned cache on a prepared production build.
