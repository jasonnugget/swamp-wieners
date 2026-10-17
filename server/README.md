# API and application engine

| File/directory | Responsibility |
| --- | --- |
| `index.ts` | Environment loading, HTTP validation/routes, SSE, uploads, feed dispatcher, and shutdown |
| `engine.ts` | Clock selection, forecast selection, snapshot assembly, and next-day briefing creation |
| `store.ts` | SQLite JSON-record store and duplicate-safe insertion |
| [integrations](integrations/README.md) | External weather, official-alert, and Jev adapters |

Run `npm start` from the repository root after building. The server resolves public assets relative to that root. `npm run dev` starts it alongside Vite. Runtime records default to `runtime/`; `DATA_DIR`, `HOST`, `PORT`, `TYPESAFE_API_KEY`, and `JEV_MODEL` are configured through the environment or `.env`.

Persist reports before triage. Preserve independent hazard holds and audit history. Keep demo and real clock behavior distinct. Briefings are immutable snapshots keyed by site and next local date; duplicate-safe insertion prevents repeat delivery after restart. The process must remain active for timers and streaming updates.

Team rosters and plant assignments are SQLite `team` records included in snapshots and shared through SSE invalidation. Team reports must name a current member and assigned plant; the server copies the current team name onto the report for history. Teams survive demo reset. Team membership is reporting context, not an authorization system.

The server binds to localhost by default and has no account authentication. Public datasets and weights are intentionally readable. Credentials, the SQLite database, and upload storage must remain outside `public/`.

Read [API contracts](../docs/api.md) and [architecture](../docs/architecture.md). Run `npm test` for engine/policy behavior and `npm run test:e2e` for complete HTTP/browser workflows.

The read-only `/api/weather/atlas` and `/api/weather/point` routes serve the national visualization through `integrations/atlas-weather.ts`. They use provider/system time, preserve nulls and stale status, and do not change the engine clock or safety forecasts.

The expanded plant catalog retains the original fifty-site historical cohort and adds catalog-only sites nationwide. Frozen-model forecasts remain limited to that cohort. National additions load NOAA/NWS heat/wind screenings automatically, in up to three background jobs. Selected sites can request priority loading through `GET /api/sites/:id/screening`; identical pending requests share work. Results persist as `weather-screening` records and refresh every fifteen minutes; failed checks retry after fifteen minutes. Screenings use actual provider/system time in demo and real modes without changing the safety clock. Reset preserves this provider cache. `DISABLE_NWS_SCREENING=1` disables automatic background loading for isolated tests; explicit requests still work.
