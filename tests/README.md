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

The preceding backend/provider/atlas implementation was verified on October 17, 2026:

| Check | Recorded result |
| --- | --- |
| `npm test` | 101 passed, 0 failed |
| `npm run test:e2e` | 19 passed, 0 failed, 2.6 minutes |
| `npm run build` | Passed through the browser server's build step; bundle-size warning remains |
| `npx tsc --noEmit` | Passed |
| Lint | No lint script is configured |

These are implementation-run results, not a claim that the later Markdown-only audit reran the application suites. Source-adapter fixture tests do not establish live credentials, nationwide coverage or calibrated field-safety performance. See [provider verification boundaries](../docs/environment-providers.md).
