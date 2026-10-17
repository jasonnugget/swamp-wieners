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

The homepage field-signal charts were verified on October 17, 2026. Unit tests were skipped for this visual iteration at the user’s request; the prior operational-pipeline run passed 125 tests.

| Check | Recorded result |
| --- | --- |
| `npm test` | Skipped for this iteration at the user’s request |
| `npm run test:e2e` | 30 passed, 0 failed, 3.9 minutes |
| `npm run build` | Passed through the full browser suite’s build step; bundle-size warning remains |
| TypeScript | Passed as part of `npm run build` |
| Lint | No lint script is configured |

The full browser suite returned exit 0. After the final selected-color and halo adjustments, the homepage chart tests rebuilt the app and passed both workflows in 15.5 seconds with exit 0. Homepage checks cover actual channel averages, measured zero versus unknown, stale exclusion, shared plant selection, report status counts, motion pause and phone layout. The [field-signal audit](../docs/home-signals.md) records chart semantics and production captures.

These are implementation-run results. Source-adapter fixture tests do not establish live credentials, nationwide coverage or calibrated field-safety performance. The completion command was also run against the local national catalog; its output records actual source/synthetic/N/A counts and source failures. See [provider verification boundaries](../docs/environment-providers.md) and [completion semantics](../docs/site-data-completion.md).

The [immersive atlas audit](../docs/immersive-atlas.md) includes production screenshots, measured desktop/mobile layout bounds and the manual console-error check. Browser fixtures validate risk ranges and failure states; the manual captures use persisted source evidence.

The demo-completion follow-up regenerated all 9,690 preview fields across 285 plants without nulls. API and browser checks verify source precedence, synthetic labels, reversible source-only display and unchanged operational risk/coverage/policy. Runtime exports remain ignored and can be regenerated with `npm run data:complete -- --offline`.

The immersive atlas workflow checks drawer focus/inert behavior, persistent close access, phone control spacing, reduced motion and selected-site forecast entry/exit. The long fixture-driven forecast-cache test postpones the 15-second workspace poll to isolate reuse between invalidations; the separate real crew/SSE workflow verifies evidence updates with normal invalidation. Manual captures show no document overflow or captured JavaScript page errors.
