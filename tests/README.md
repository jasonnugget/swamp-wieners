# Verification

Run tests from the repository root.

| Command | Checks |
| --- | --- |
| `npm test` | Node unit tests, data contracts, inference parity, clock/scheduler, and policy behavior |
| `npm run build` | TypeScript validation and production asset packaging |
| `npm run test:e2e` | Chrome workflows, browser training, offline reload, and responsive layout |

[Unit tests](unit/README.md) and [browser tests](e2e/README.md) have separate directories and runners. Unit tests read committed model/data exports. Browser tests build the app and start an isolated API using `runtime/e2e/`; they reset demonstration state before each test.

Generated screenshots, traces, and reports are ignored. Do not add documentation or fixtures inside generated output. Add tests for meaningful behavior and failure modes, not file moves or assertions that duplicate implementation line by line.
