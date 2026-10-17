# API and application engine

| File/directory | Responsibility |
| --- | --- |
| `index.ts` | Environment loading, HTTP validation/routes, SSE, uploads, feed dispatcher, and shutdown |
| `engine.ts` | Clock selection, forecast selection, snapshot assembly, and next-day briefing creation |
| `store.ts` | SQLite JSON-record store and duplicate-safe insertion |
| [integrations](integrations/README.md) | External weather, official-alert, and Jev adapters |

Run `npm start` from the repository root after building. The server resolves public assets relative to that root. `npm run dev` starts it alongside Vite. Runtime records default to `runtime/`; `DATA_DIR`, `HOST`, `PORT`, `TYPESAFE_API_KEY`, and `JEV_MODEL` are configured through the environment or `.env`.

Persist reports before triage. Preserve independent hazard holds and audit history. Keep demo and real clock behavior distinct. Briefings are immutable snapshots keyed by site and next local date; duplicate-safe insertion prevents repeat delivery after restart. The process must remain active for timers and streaming updates.

The server binds to localhost by default and has no account authentication. Public datasets and weights are intentionally readable. Credentials, the SQLite database, and upload storage must remain outside `public/`.

Read [API contracts](../docs/api.md) and [architecture](../docs/architecture.md). Run `npm test` for engine/policy behavior and `npm run test:e2e` for complete HTTP/browser workflows.
