# Browser workflows

Run `npm run test:e2e` from the root. Installed Google Chrome is required. `playwright.config.ts` builds the app, starts the API on port 4173 and uses `runtime/e2e/`. Tests run serially because they share the isolated server; workflows explicitly reset demonstration state. They do not reset the normal runtime database.

| File | Coverage |
| --- | --- |
| `simulation.spec.ts` | Canonical beacon/hold/unknown separation, no operational writes, scenario export and drainage comparison, playback, mobile/keyboard/reduced motion, flat fallback, newer workspace holds during atlas failure and offline reload |
| `refresh-coalescing.spec.ts` | A 100-event provider burst produces one active snapshot read and a retained follow-up update |
| `network-preview.spec.ts` | Shared homepage/atlas plant selection and reload persistence; stale/cached unknown states with retained holds; local-geography failure at 320px |
| `home-signals.spec.ts` | Hazard dial zero/null/stale handling; automatic NWS forecast selection, gaps, freshness, wind units and scrubbing; policy board without reports; scan/pause, reduced motion, empty forecasts and phone bounds |
| `immersive-atlas.spec.ts` | Full-viewport renderer, floating navigation, two-line title, drawer close/reopen/Escape focus, inert hidden content, persistent close control, selected-site summary, mobile bounds and reduced motion |
| `site-data-preview.spec.ts` | All-plant/current/future completion APIs, source precedence, unchanged operational scores/policy/coverage, synthetic labels, source-only switch and Site intelligence companion |
| `site-risk-api.spec.ts` | All-site current snapshot parity, observation validation, structured factors/drivers, model availability, provider status, atlas hours 0/72 and invalid query handling |
| `weather-atlas.spec.ts` | Canonical risk ranges, unknown/low-confidence states, coverage, eleven layers, forecast frames, search/regions, geometry reuse, countdown/reset, stale reads, all 34 observation fields, field provenance, provider/plant inspection, keyboard evidence-view switching and mobile overflow |
| `risk-fixtures.ts` | Deterministic canonical frames produced with the backend scorer; not live provider evidence |
| `national-plants.spec.ts` | All-state/catalog-only selection and reporting, matching-hour NOAA canonical fallback, stale-to-unknown behavior and no fabricated model coverage |
| `map.spec.ts` | Actual WebGL projection/depth across national and pinning scales, camera orbit/zoom, selection/showcase, geographic report pins, pan/pinch rejection, reduced motion, focus restoration, flat fallback and scene-module errors |
| `crew-teams.spec.ts` | Shared assignments, remembered defaults, plant-specific drafts/pins, report attribution, invalid-assignment rejection, history and reset preservation |
| `workflow.spec.ts` | Photo handoff across screens, independent replay lightning holds, briefing carry-forward, report resolution, and mobile layout |
| `redesign.spec.ts` | Loading/retry, editorial homepage, navigation/history, reduced motion, feature keyboard controls, atlas bounds and reset confirmation |

The atlas tests reject any `/api/weather/*` request from the supervisor. Layer changes read one existing frame; slider changes request only the selected plant. Tests cover hiding the slider in overviews, restoring it through explicit site focus, stopping playback on exit, switching plants, visited-frame reuse and future failures while the map remains current. The real crew-submission test verifies SSE updates to the supervisor's beacon, risk, evidence, holds and priority list. JEV and live lightning fixtures do not claim authenticated provider connectivity.

The isolated server sets `DISABLE_NWS_SCREENING=1`, `DISABLE_ENVIRONMENT_COLLECTION=1` and `DISABLE_EXTERNAL_PROVIDERS=1`. These flags disable their respective background jobs; explicit refresh requests can still collect. Tests use deterministic fixtures or existing persisted inputs. Actual source checks are recorded separately in [provider documentation](../../docs/environment-providers.md).

SwiftShader flags allow headless WebGL on the test machine. The tests assert computations, not only screenshots. There is no independent weather-atlas cache.

The scene-module failure test blocks service workers so interception reaches the import. It distinguishes a missing chunk from unavailable graphics. Production tests do not exercise Vite's optimized-dependency cache; after development dependency changes, also verify the running Vite scene has no HTTP 504 dependency errors.

Screenshots/traces go to ignored `test-results/`. Keep fixtures in maintained directories; do not commit test databases or uploads. Preserve offline checks after lazy-import, Three.js, static-URL or service-worker changes. See [verification context](../README.md) for the latest recorded run.

`cache-recovery.spec.ts` seeds pre-canonical and pre-structured-evidence snapshots, verifies a recoverable loading/error screen during an outage, then retries successfully without clearing the crew profile. It also forces browser storage quota errors and verifies fresh API state still opens the homepage. The offline workflow covers the versioned cache on a prepared production build.

Cold browser runs allow up to thirty seconds for map assets and live snapshot propagation, while the offline package downloads. The checks still require complete geography and report-driven risk updates.

`crew-api.spec.ts` exercises the native client contract: scoped history, real photo upload/retrieval, idempotent retries, payload-conflict rejection, immediate task holds and retained resolution evidence. Native camera/Apple Maps interaction requires an iPhone or iOS Simulator; see [mobile setup](../../mobile/README.md).

The native crew API check also verifies selected-site canonical conditions, all seven channels, absence of synthetic completion and immediate crew task holds in the returned conditions.

The playful website keeps the existing `redesign.spec.ts` navigation, readiness, reduced-motion and reset-confirmation checks, using the current hero/loading titles. Its additional carousel check creates labeled accepted reports in the isolated test server and proves that home shows only the selected site’s evidence and links to the matching report history. See [the current web UI audit](../../docs/web-playful-ui.md).
