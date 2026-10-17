# Operational environment pipeline

Every catalog site follows the same path regardless of `catalogOnly` or model availability.

- `collect.ts` loads Open-Meteo in batches of ten and returns an entry for every requested site on failure.
- `normalize.ts` converts provider readings into the versioned vendor-neutral observation, rejects stale/invalid readings, and computes field coverage. Only complete contiguous hourly windows produce rolling rainfall totals.
- `enrich.ts` adds live detected events, NWS alerts and crew context, preserving independent policy overrides. A recent successful empty alert check permits `false`. Without a detector feed, strike counts remain null.
- `score.ts` exposes shared pure channel scoring, including model, alert and crew evidence. `index.ts` assembles the snapshot and invokes shared task policy.

The process dispatcher persists provider readings under `environment-weather`, refreshes all plants every fifteen minutes in staggered coordinate batches, and records provider errors under `feed`. Normalization runs at snapshot time so cached readings expire without requiring a successful refresh. Failed requests preserve persisted evidence; expired readings become null. Provider cache and uploads survive demo reset.

Snapshots use system time even during replay. Historical forecasts and simulated strikes stay in the replay/briefing path. Fresh live HeatCast/GroundCast forecasts add separate labeled factors with explicit valid periods. `mlCoverage` describes the original model cohort, not environmental eligibility or a successful current prediction. No current reading is replaced by a next-day model estimate.

Contracts live in `shared/risk.ts`; configuration and pure aggregation live in `shared/risk-config.ts` and `shared/risk-scoring.ts`; task rules live in `shared/policy.ts`. See [the complete contract and migration notes](../../docs/environment-pipeline.md). Run `npm test` and `npm run build` from the repository root. API/browser compatibility also needs `npm run test:e2e`.

See [continuous scoring](../../docs/risk-scoring.md) for thresholds, confidence, model horizons and the JEV confirmation boundary.

`providers.ts` merges source evidence into normalized observations with per-field metadata. `provider-poller.ts` schedules each source independently, bounds background jobs, persists provider records, and preserves positive strike/alert history across outages. Defaults and credential requirements are in [environmental providers](../../docs/environment-providers.md).

Water evidence prefers USGS and uses NOAA NWPS when the primary source is unavailable. Stage/history always stay tied to one station; `provenance.providers.usgs.source` identifies the actual water source. FIRMS uses shared keyless regional downloads when no area-API key is configured. The separate [completion export](../../docs/site-data-completion.md) reuses these providers but never injects synthetic fields into this operational pipeline.

`atlas.ts` projects one national risk frame for `/api/risk/atlas?hour=0..72`. Hour zero reuses canonical snapshots. Future hours normalize persisted hourly weather and reuse the same scoring/policy functions, with source freshness checked against real request time. Static exposure, known alert expiry and unresolved crew controls retain explicit assumptions; future detections remain unknown. No external requests or invented hourly model outputs are made by this read path.

With `completion=1`, `atlas.ts` attaches a separate demo companion after building each authoritative frame. Hypothetical values never enter `siteRisk`, normalization, policy or source coverage. All 34 companion fields are populated; original snapshot fields remain unchanged.
