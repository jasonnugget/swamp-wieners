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

Main-branch integration preserves both the atlas scenario lab and Environment Studio. The studio visual-state checks now live in `tests/unit/site-simulation.test.ts`; the atlas checks retain `simulation.test.ts`. Unit tests were skipped for this integration at the user’s request; earlier counts below describe their respective pre-integration revisions.

The atlas scenario lab was verified on October 17, 2026. The [simulation study](../docs/atlas-simulation.md) records sources, equations, screenshots and verification limits. The [reference design study](../docs/reference-design.md) preserves the earlier website redesign checks.
Live-data follow-up: overlapping workspace reads are now coalesced and idle briefing ticks skip unused national scoring. Production build/type checking and all 146 unit tests passed, including burst/failure recovery and scheduler eligibility/deduplication. The final nine-check regression run passed seven: all cache-recovery cases, team reporting, a 100-event refresh burst, briefing/report history and CPU inference/training/offline inference. Two graphics checks timed out before completing map readiness/report selection; they are not recorded as passes for that run. The complete studio rendering sweep and six-check targeted run described below passed before this read-scheduling follow-up; scene rendering code was unchanged by that follow-up. Live workspace measurement after the fix returned the existing 8.96 MB snapshot in 3.3 seconds and health in about 1 ms on this machine; these are local measurements, not latency guarantees. No stored records/uploads were cleared.

The final live development smoke check passed in Chrome using its default graphics configuration: `http://localhost:5173/?view=atlas` opened the studio against the existing live workspace, selected the heat preset and rendered the heat lens with no captured page/shader/renderer errors. The dev runner remains available on port 5173 with its API on 3001. The earlier forced-software-graphics checks retain the timeout limits described above.

The Environment Studio visual upgrade passed production build/type checking and all 143 unit tests. The full 40-scenario browser run passed 37 checks; existing crew-report display, pin-map readiness and GPU inference waits timed out. A final-build targeted run passed all six selected checks: those three workflows plus studio isolation/offline/mobile, the full lens/preset/template rendering sweep and graphics fallback. The ML rerun used the documented `PLAYWRIGHT_ML_CPU=1` option and executed actual CPU inference/training and offline inference; it does not establish GPU performance. Studio checks capture shader errors, separate heat/soil behavior, demonstration-only event graphics, geometry reuse after warmup, animation pause, modal focus, persistent phone close access and a full offline reload. Production captures live under `docs/assets/environment-studio/` with explicit hypothetical/test-fixture context. Hardware frame-rate targets and physical hazard accuracy are not claimed.

The Three.js site-simulation addition passed production build/type checking and all 140 unit tests. The initial 38-test browser run passed 35 checks; three atlas geography-readiness assertions exceeded their old five-second wait. Those assertions now allow the documented thirty-second cold-start window, and all three passed on targeted rerun. The simulator also passed a separate final-build check with all 34 controls, input validation/reset, heat/storm presets, unchanged live risk, no API writes, modal focus, reduced motion, phone bounds and reopening after a full offline reload. No terrain or physical simulation accuracy is claimed.

The reference-driven website redesign was verified on October 17, 2026. The [reference design study](../docs/reference-design.md) records sources, screenshots, accessibility checks and verification limits.

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
