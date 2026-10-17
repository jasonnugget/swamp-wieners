# Plant data collection and completion

Run `npm run data:complete` from the repository root to refresh environmental sources for all 285 plants and export `runtime/site-data/completion.json`. The command uses the same adapters, normalization, expiry checks and SQLite records as the application. It persists each weather batch and provider result, so interrupted runs can resume. Existing reports, uploads, model artifacts and history are preserved.

`runtime/site-data/coverage.csv` lists each plant's name, coordinates, source/synthetic field counts (the legacy N/A column is retained as zero) and actual observation coverage. Both exports use atomic replacement. They remain outside browser-readable public assets.

```bash
npm run data:complete
npm run data:complete -- --offline
npm run data:complete -- --providers=firms,nws,usgs
```

`--offline` creates the export from persisted evidence, applying current freshness rules. It does not label old readings as current. `--providers` selects external adapters to refresh; weather still refreshes when due. Fresh successful provider records are reused. Failed sources retain an explicit error, including quota/backoff and timeout failures. The command loads optional credentials from the server environment or `.env`.

## Real data first

Each plant includes its original canonical `observed` record, a separate `scenario` with the same environmental field groups, and a `fields` entry for every environmental field. Existing values always win, including zero and `false`.

| Field kind | Meaning |
| --- | --- |
| `SOURCE` | Available normalized evidence, actual local report counts, or an explicitly documented calculation from source data |
| `SYNTHETIC` | No usable current value; a labeled demo assumption fills that field |
| `NOT_APPLICABLE` | Legacy export kind; version-2 generation fills every field, so its count is zero |

The export includes source/synthetic counts per plant and a national `fieldSummary`. These counts are **not observation coverage**. The unchanged `observed.coverage` reports operational source completeness. A successful empty wildlife/fire query does not establish zero risk or an actual event distance.

The command reuses Open-Meteo's preceding hourly 9-27 cm root-zone moisture to calculate an empirical percentile where possible. It requires at least 144 unique hourly samples spanning six days in the previous week, valid matching coordinates, fresh source data and a matching current timestamp. Ties use midrank. This is short-window model abnormality, not a climatic percentile. It stays in the export pending operational soil calibration and does not alter the canonical soil score.

## Synthetic assumptions

The deterministic `location-season-weather-v2` method uses plant latitude/longitude, month, approximate solar local hour, a broad arid/maritime classification, and available current plant weather. It estimates temperature, humidity, wind, rainfall, moisture, instability and exposure context only where the canonical field is missing. These are transparent scenario heuristics, not fitted climate normals, calibrated forecasts, historical observations or model training labels. Each generated field lists its basis and the underlying source failure when available.

Scenario counts and absent alert flags are synthetic assumptions, never confirmed incident absence or official NWS findings. Missing event distances, timestamps, gauge heights, trends and fire power receive hypothetical values so all 34 preview fields are populated. Stable plant-ID variation makes the preview repeatable for the same plant, time and inputs. Synthetic zero-count lightning and wildlife scenarios place hypothetical events outside the corresponding time/radius window. A preview containing synthetic lightning event fields uses DEMO mode, while the original detector mode remains in `observed`. Site `riverScreening` is only a demo fallback for exposure; it is never presented as a FEMA determination. Missingness can reflect a service failure rather than absence of data in the world, so future refreshes always retry the real source.

## Operational boundary

The export has `usage: "DEMO_ONLY"` and deliberately does not implement `SiteObservationV1` or `SiteRiskSnapshot`. It never supplies the live scorers, policy, ML training or model evaluation. `/api/risk/atlas?completion=1` includes a compact `completion` companion beside each canonical snapshot. `/api/sites/:id/data-completion` returns that companion for the inspected Site intelligence plant. Both routes reuse normalized persisted source evidence and make no upstream HTTP requests. The companion omits duplicated observations and repeated per-field basis arrays; the full export retains them. Real provider updates continue through the canonical pipeline. Synthetic estimates therefore cannot create a detected-lightning hold, clear an independent restriction, or inflate operational coverage.

Source adapters and credentials are documented in [environmental providers](environment-providers.md). NASA's [published FIRMS downloads](https://firms.modaps.eosdis.nasa.gov/active_fire/) provide a keyless active-fire fallback. [Open-Meteo's variable documentation](https://open-meteo.com/en/docs) distinguishes modeled weather/soil estimates from site instruments. Verify the export's generation time before using it for a demo; it is a generated runtime artifact, not a maintained static dataset.

## Browser display

Conditions and Site intelligence enable **Fill gaps with demo estimates** by default when the companion is available. Each generated reading has a **Synthetic** label and expandable **DEMO ONLY** explanation. Turning the switch off exposes the original missing values. Known source values always take priority; derived source-only soil statistics retain their source explanation.

Only the condition inspector uses these values. Risk beacons, raw-data map layers, ranking, confidence, coverage, task decisions and all-clear timers continue to use the canonical snapshot. The sidebar can therefore show 34 populated preview fields while source coverage is low. The distinction is intentional and visible. An unavailable companion leaves the source-only view usable; an initial offline reload can have source-only data because the companion is not added to the workspace cache.
