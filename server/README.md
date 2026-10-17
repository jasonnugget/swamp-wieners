# API and application engine

| File/directory | Responsibility |
| --- | --- |
| `index.ts` | Environment loading, HTTP validation/routes, SSE, uploads, feed dispatcher, and shutdown |
| `http.ts` | Negotiated compression for JSON and static assets; streaming events bypass compression |
| `engine.ts` | Clock selection, forecast selection, snapshot assembly, and next-day briefing creation |
| `dev-readiness.ts` | Bounded API health wait used by the Vite development server |
| `complete-site-data.ts` | Resumable national provider refresh and separate labeled data-completion export |
| `store.ts` | SQLite JSON-record store and duplicate-safe insertion |
| [integrations](integrations/README.md) | Environmental providers, fixed-lead model features and JEV |
| [pipeline](pipeline/README.md) | Collection, normalization, enrichment, scoring, provider scheduling and atlas frames |

Run `npm start` from the repository root after building. The server resolves public assets relative to that root. `npm run dev` starts the API and Vite together; Vite waits for a healthy API response before listening. Startup timeout errors identify the API target and leave the backend logs visible. Runtime records default to `runtime/`. Server settings and optional credentials come from the environment or `.env`; see [.env.example](../.env.example) and [provider operations](../docs/environment-providers.md).

`npm run data:complete` refreshes all plant sources with the same providers and writes a separate demo-only completion export. `--offline` uses persisted records. See [completion semantics and field provenance](../docs/site-data-completion.md); this command does not load synthetic data into canonical risk or policy.

SQLite uses WAL and a five-second busy timeout so the application and bulk collector can finish short concurrent writes without an immediate lock failure.

Persist reports before triage. Preserve independent hazard holds and audit history. Keep demo and real clock behavior distinct. Briefings are immutable snapshots keyed by site and next local date; duplicate-safe insertion prevents repeat delivery after restart. The process must remain active for timers and streaming updates.

Team rosters and plant assignments are SQLite `team` records included in snapshots and shared through SSE invalidation. Team reports must name a current member and assigned plant; the server copies the current team name onto the report for history. Teams survive demo reset. Team membership is reporting context, not an authorization system.

The server binds to localhost by default and has no account authentication. Public datasets and weights are intentionally readable. Credentials, the SQLite database, and upload storage must remain outside `public/`.

Read [API contracts](../docs/api.md) and [architecture](../docs/architecture.md). Run `npm test` for engine/policy behavior and `npm run test:e2e` for complete HTTP/browser workflows.

The read-only `/api/weather/atlas` and `/api/weather/point` routes remain compatibility weather APIs through `integrations/atlas-weather.ts`. They use provider/system time, preserve nulls and stale status, and do not change the engine clock or safety forecasts.

The expanded plant catalog retains the original fifty-site historical cohort and adds catalog-only sites nationwide. Frozen-model forecasts remain limited to that cohort. All plants can load NOAA/NWS heat/wind screenings automatically, in up to three background jobs. Selected sites can request priority loading through `GET /api/sites/:id/screening`; identical pending requests share work. Results persist as `weather-screening` records and refresh every fifteen minutes; failed checks retry after fifteen minutes. Screenings use actual provider/system time in demo and real modes without changing the safety clock. Reset preserves this provider cache. `DISABLE_NWS_SCREENING=1` disables automatic background loading for isolated tests; explicit requests still work.

All sites use [pipeline](pipeline/README.md), irrespective of model cohort. The engine exposes canonical live `siteRisks`, and real-clock legacy decisions project those snapshots. `environment-weather` records persist provider inputs; the staggered ten-coordinate collector uses the shared Open-Meteo adapter. `DISABLE_ENVIRONMENT_COLLECTION=1` disables background collection for isolated tests. Explicit site refresh still collects. See [environment contracts](../docs/environment-pipeline.md).

The engine supplies fresh live frozen-model forecasts and eligible training soil anchors to shared scoring. Historical inputs remain replay-only. JEV classifications are validated and activated by explicit confirmation; confirmation cannot release selected crew holds. See [continuous scoring](../docs/risk-scoring.md).

Independent source polling covers USGS, FEMA, NWS and iNaturalist, with keyless FIRMS downloads, optional keyed area queries and explicit lightning modes. Provider caches and records persist under `provider-cache` and `environment-provider`; demo reset preserves them. `DISABLE_EXTERNAL_PROVIDERS=1` disables background source jobs for isolated tests. Site refresh also queues source refreshes and publishes SSE invalidation as each completes. See [provider operations](../docs/environment-providers.md).

`GET /api/risk/atlas?hour=0..72` supports optional `siteId`; selected-site requests construct and score only that plant. The supervisor loads the current national map and requests future frames only for the selected site. Current frames reuse `siteRisks`; forecast frames use `pipeline/atlas.ts` and the same scorers, with explicit future-evidence limits. The old weather routes remain compatibility APIs and have no map consumer. See [atlas API details](../docs/api.md#authoritative-supervisor-atlas).

The atlas accepts `completion=1` to include a compact, demo-only filled-data companion per plant. `GET /api/sites/:id/data-completion` returns one for Site intelligence. Read paths reuse persisted evidence and never inject hypothetical values into observations or scores. See [the endpoint contract](../docs/api.md#demo-data-completion).

The native iOS client uses `/api/crew/workspace` for catalog/team context and plant-scoped report history without national scoring. Report retries can include `clientRequestId`; the report and its `report-request` receipt are committed atomically. Demo reset clears those receipts alongside reports. Native and browser clients share the same evidence, uploads and SSE invalidations. See [the crew API](../docs/api.md#native-crew-app).

The native crew workspace includes only its selected plant’s canonical current conditions, alongside scoped report history. It reuses the existing engine’s selected-site scoring and source freshness rules, with no national frame generation or new external calls in the read handler. Current provider screening follows system time independently of the demo reporting clock.
