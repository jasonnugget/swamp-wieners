# Browser workflows

`workflow.spec.ts` covers:

- Photo submission and immediate task holds on a second connected screen.
- Lightning timer resets, 6 PM briefing carry-forward, and preserved resolution history.
- Actual browser inference, calibration training, and saved candidates after offline reload.
- Desktop map asset loading and mobile layout without horizontal overflow.

Run `npm run test:e2e` from the root. `playwright.config.ts` builds the app, starts the API on port 4173, and uses `runtime/e2e/` for records. Installed Google Chrome is required. Tests run serially because they share the demo server and reset its state before each test.

The configured WebGPU/SwiftShader flags make headless execution possible on the test machine. A reported WebGPU backend is evidence of the execution path, not a hardware performance guarantee. The tests allow explicit fallbacks and assert actual computations rather than screenshots alone.

`map.spec.ts` checks 3D camera orbit/zoom, site selection, expanded showcase controls, geographic pin raycasting, pan/pinch rejection, reduced-motion controls, keyboard focus restoration, and the interactive flat fallback when WebGL is unavailable. The offline reload workflow also checks that the Three.js scene and bundled outlines load without networking.

The module-loading failure check verifies that a missing scene chunk is reported separately from unavailable graphics. For development dependency changes, also open the running Vite URL and confirm the scene loads without HTTP 504 optimized-dependency errors; production tests do not exercise Vite's dependency cache.

Screenshots and failure traces go to ignored `test-results/`. Keep fixtures in maintained test directories; do not commit temporary databases or uploaded test photos. Preserve the offline reload check when changing lazy imports, Three.js scene chunks, public URLs, or service-worker caching.
