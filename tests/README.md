# Verification

Run tests from the repository root.

| Command | Checks |
| --- | --- |
| `npm test` | Normalization, providers, continuous scoring, canonical atlas frames, model parity, scheduler and policy |
| `npm run build` | TypeScript validation and production asset packaging |
| `npm run test:e2e` | Canonical API/map/timeline, crew SSE updates, reporting, browser ML, offline reload and mobile layout |

[Unit tests](unit/README.md) and [browser tests](e2e/README.md) have separate directories and runners. Unit tests read committed model/data exports. Browser tests build the app and start an isolated API using `runtime/e2e/`; tests share that isolated store and explicitly reset demonstration state in their workflows.

Generated screenshots, traces, and reports are ignored. Do not add documentation or fixtures inside generated output. Add tests for meaningful behavior and failure modes, not file moves or assertions that duplicate implementation line by line.

## Latest implementation verification

The atlas scenario lab was verified on October 17, 2026. The [simulation study](../docs/atlas-simulation.md) records sources, equations, screenshots and verification limits. The [reference design study](../docs/reference-design.md) preserves the earlier website redesign checks.

| Check | Recorded result |
| --- | --- |
| `npm test` | 149 passed, 0 failed |
| `npm run test:e2e` | 41 passed, 0 failed, 4.7 minutes |
| `npm run build` | Passed through the full browser suite’s build step; browser-ML bundle-size warning remains |
| TypeScript | Passed as part of `npm run build` |
| Lint | No lint script is configured |

The full browser suite returned exit 0. New simulation checks cover canonical beacon and hold separation, JSON export and drainage comparison, phone/keyboard/reduced-motion controls, flat fallback, a newer workspace hold during atlas failure and offline scenario calculation. The nine simulation unit checks cover all 285 plants, geographic motion, bounded fields, accumulation, drainage, peak wind and deterministic results. Existing checks retain crew handoff, reporting, model calibration, offline inference, source distinctions, forecast scrubbing and mobile layout. The crew/SSE test selects a plant whose canonical risk is unknown because prior screening checks can leave legitimate provider-cache records after a demo reset.

These are implementation-run results. Source-adapter fixture tests do not establish live credentials, nationwide coverage or calibrated field-safety performance. The completion command was also run against the local national catalog; its output records actual source/synthetic/N/A counts and source failures. See [provider verification boundaries](../docs/environment-providers.md) and [completion semantics](../docs/site-data-completion.md).

The [immersive atlas audit](../docs/immersive-atlas.md) includes production screenshots, measured desktop/mobile layout bounds and the manual console-error check. Browser fixtures validate risk ranges and failure states; the manual captures use persisted source evidence.

The demo-completion follow-up regenerated all 9,690 preview fields across 285 plants without nulls. API and browser checks verify source precedence, synthetic labels, reversible source-only display and unchanged operational risk/coverage/policy. Runtime exports remain ignored and can be regenerated with `npm run data:complete -- --offline`.

The immersive atlas workflow checks drawer focus/inert behavior, persistent close access, phone control spacing, reduced motion and selected-site forecast entry/exit. The long fixture-driven forecast-cache test postpones the 15-second workspace poll to isolate reuse between invalidations; the separate real crew/SSE workflow verifies evidence updates with normal invalidation. Manual captures show no document overflow or captured JavaScript page errors.
