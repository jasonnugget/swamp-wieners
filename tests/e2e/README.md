# Browser workflows

`national-plants.spec.ts` checks all-state plant coverage, selection of California/Alaska/Hawaii plants, honest missing model coverage, and report holds at newly added plants. The map workflow verifies all 285 plant beacons.

It also checks numeric NOAA-based risk beacons for California, Alaska and Hawaii with explicit partial-coverage labels, then expires the fixture and verifies unknown markers return. The test server disables automatic NOAA background requests; browser fixtures cover success and failure deterministically. Live source checks run separately.

`crew-teams.spec.ts` covers roster and plant assignment creation, shared visibility, remembered reporting defaults after reload, plant-specific draft/pin changes, report attribution and holds, server rejection of invalid assignments, historical team names after edits, and team preservation through demo reset.

`workflow.spec.ts` covers:

- Photo submission and immediate task holds on a second connected screen.
- Lightning timer resets, 6 PM briefing carry-forward, and preserved resolution history.
- Actual browser inference, calibration training, and saved candidates after offline reload.
- Desktop map asset loading and mobile layout without horizontal overflow.

Run `npm run test:e2e` from the root. `playwright.config.ts` builds the app, starts the API on port 4173, and uses `runtime/e2e/` for records. Installed Google Chrome is required. Tests run serially because they share the demo server and reset its state before each test.

The configured WebGPU/SwiftShader flags make headless execution possible on the test machine. A reported WebGPU backend is evidence of the execution path, not a hardware performance guarantee. The tests allow explicit fallbacks and assert actual computations rather than screenshots alone.

`map.spec.ts` checks 3D camera orbit/zoom, site selection, expanded showcase controls, geographic pin raycasting, pan/pinch rejection, reduced-motion controls, keyboard focus restoration, and the interactive flat fallback when WebGL is unavailable. The offline reload workflow also checks that the Three.js scene and bundled outlines load without networking.

The module-loading failure check blocks service workers so its network interception cannot be bypassed by the precache, then verifies that a missing scene chunk is reported separately from unavailable graphics. For development dependency changes, also open the running Vite URL and confirm the scene loads without HTTP 504 optimized-dependency errors; production tests do not exercise Vite's dependency cache.

Screenshots and failure traces go to ignored `test-results/`. Keep fixtures in maintained test directories; do not commit temporary databases or uploaded test photos. Preserve the offline reload check when changing lazy imports, Three.js scene chunks, public URLs, or service-worker caching.

`weather-atlas.spec.ts` supplies deterministic provider-response fixtures for national geography, Alaska/Hawaii navigation, weather layers, forecast valid times, location search, playback, reduced motion, stale-cache labels, and mobile controls. Live connectivity is checked separately against the actual API; fixtures alone do not establish provider availability.

`redesign.spec.ts` covers loading readiness and retry, the two-line editorial hero, ambient motion controls, reduced-motion content, keyboard feature accordions, deep-linked navigation and browser history, plant selection across views, fullscreen atlas bounds, mobile overflow, and cancellation/confirmation of demo reset. Map and weather tests enter `/?view=atlas`; operational workflows enter their own views. The offline workflow verifies both the saved Model Lab and the separate cached atlas.
