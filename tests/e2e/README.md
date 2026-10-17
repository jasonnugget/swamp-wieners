# Browser workflows

`workflow.spec.ts` covers:

- Photo submission and immediate task holds on a second connected screen.
- Lightning timer resets, 6 PM briefing carry-forward, and preserved resolution history.
- Actual browser inference, calibration training, and saved candidates after offline reload.
- Desktop map asset loading and mobile layout without horizontal overflow.

Run `npm run test:e2e` from the root. `playwright.config.ts` builds the app, starts the API on port 4173, and uses `runtime/e2e/` for records. Installed Google Chrome is required. Tests run serially because they share the demo server and reset its state before each test.

The configured WebGPU/SwiftShader flags make headless execution possible on the test machine. A reported WebGPU backend is evidence of the execution path, not a hardware performance guarantee. The tests allow explicit fallbacks and assert actual computations rather than screenshots alone.

Screenshots and failure traces go to ignored `test-results/`. Keep fixtures in maintained test directories; do not commit temporary databases or uploaded test photos. Preserve the offline reload check when changing lazy imports, MapLibre workers, public URLs, or service-worker caching.
