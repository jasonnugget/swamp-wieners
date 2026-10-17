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

The source-first demo companions, providers, map depth precision and expanded supervisor UI were verified on October 17, 2026:

| Check | Recorded result |
| --- | --- |
| `npm test` | 123 passed, 0 failed |
| `npm run test:e2e` | 26 passed, 0 failed, 2.8 minutes |
| `npm run build` | Passed through the full browser suite’s build step; bundle-size warning remains |
| `npx tsc --noEmit` | Passed |
| Lint | No lint script is configured |

These are implementation-run results. Source-adapter fixture tests do not establish live credentials, nationwide coverage or calibrated field-safety performance. The completion command was also run against the local national catalog; its output records actual source/synthetic/N/A counts and source failures. See [provider verification boundaries](../docs/environment-providers.md) and [completion semantics](../docs/site-data-completion.md).

The [UI audit](../docs/ui-audit.md) includes production screenshots, measured desktop/mobile layout bounds and the manual console-error check. Browser fixtures validate risk ranges and failure states; the manual captures use persisted source evidence.

The demo-completion follow-up regenerated all 9,690 preview fields across 285 plants without nulls. API and browser checks verify source precedence, synthetic labels, reversible source-only display and unchanged operational risk/coverage/policy. Runtime exports remain ignored and can be regenerated with `npm run data:complete -- --offline`.
