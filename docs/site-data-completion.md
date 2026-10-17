# Plant data collection and completion

Run `npm run data:complete` from the repository root to refresh environmental sources for all 285 plants and export `runtime/site-data/completion.json`. The command uses the same adapters, normalization, expiry checks and SQLite records as the application. It persists each weather batch and provider result, so interrupted runs can resume. Existing reports, uploads, model artifacts and history are preserved.

`runtime/site-data/coverage.csv` lists each plant's name, coordinates, source/synthetic/N/A field counts and actual observation coverage. Both exports use atomic replacement. They remain outside browser-readable public assets.

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
| `NOT_APPLICABLE` | The scenario has no corresponding event or identified physical gauge; a distance, timestamp or gauge datum would be invented |

The export includes source/synthetic/N/A counts per plant and a national `fieldSummary`. These counts are **not observation coverage**. The unchanged `observed.coverage` reports operational source completeness. A successful empty wildlife/fire query does not establish zero risk or an actual event distance.

The command reuses Open-Meteo's preceding hourly 9-27 cm root-zone moisture to calculate an empirical percentile where possible. It requires at least 144 unique hourly samples spanning six days in the previous week, valid matching coordinates, fresh source data and a matching current timestamp. Ties use midrank. This is short-window model abnormality, not a climatic percentile. It stays in the export pending operational soil calibration and does not alter the canonical soil score.

## Synthetic assumptions

The deterministic `location-season-weather-v1` method uses plant latitude/longitude, month, approximate solar local hour, a broad arid/maritime classification, and available current plant weather. It estimates temperature, humidity, wind, rainfall, moisture, instability and exposure context only where the canonical field is missing. These are transparent scenario heuristics, not fitted climate normals, calibrated forecasts, historical observations or model training labels. Each generated field lists its basis and the underlying source failure when available.

No-event scenario counts and absent alert flags are synthetic assumptions, never confirmed incident absence or official NWS findings. No physical gauge, detected strike, wildfire or public sighting is invented to produce a distance or event timestamp. Those fields are explicitly N/A when no such event exists in the scenario. Site `riverScreening` is only a demo fallback for exposure; it is never presented as a FEMA determination. Missingness can reflect a service failure rather than absence of data in the world, so future refreshes always retry the real source.

## Operational boundary

The export has `usage: "DEMO_ONLY"` and deliberately does not implement `SiteObservationV1` or `SiteRiskSnapshot`. It is not loaded by `/api/risk/atlas`, the live scorers, policy, ML training or model evaluation. Real provider updates flow into the map through the existing canonical pipeline; synthetic completion stays separate. Synthetic estimates therefore cannot create a detected-lightning hold, clear an independent restriction, or inflate operational coverage.

Source adapters and credentials are documented in [environmental providers](environment-providers.md). NASA's [published FIRMS downloads](https://firms.modaps.eosdis.nasa.gov/active_fire/) provide a keyless active-fire fallback. [Open-Meteo's variable documentation](https://open-meteo.com/en/docs) distinguishes modeled weather/soil estimates from site instruments. Verify the export's generation time before using it for a demo; it is a generated runtime artifact, not a maintained static dataset.
