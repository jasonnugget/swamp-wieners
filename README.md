# PlanIT Control

Field safety intelligence for 50 actual power plants in Florida, Louisiana, and Mississippi. Two custom environmental models connect historical weather to work restrictions, while crew reports become persistent site knowledge for the next shift.

## Run locally

Requires Node.js 22.13 or later. Model weights, evaluation results, real plant locations, and historical demo data are already bundled. Python is only needed to rebuild the dataset or retrain the base models.

```bash
npm ci
npm run dev
```

Open http://localhost:5173. The API listens on port 3001. For the production build:

```bash
npm run build
npm start
```

Open http://127.0.0.1:3001. SQLite records and photos live in the ignored `runtime/` directory. The API binds to localhost by default. To try a phone on a trusted local network, set `HOST=0.0.0.0` and use the Vite development URL printed for that network. This hackathon prototype has no account authentication; keep it on a trusted network.

Copy `.env.example` to `.env` to configure optional Jev access. Set `TYPESAFE_API_KEY` server-side. The adapter calls the official `https://api.typesafe.ai/v1/systemone` endpoint. Jev classifies report text and affected tasks; it does not generate briefings or clear restrictions. No credential is bundled. Without a key, manual reporting remains fully functional and the interface says that Jev is unavailable.

## What is implemented

- Fifty EIA plant locations, a ranked supervisor map, seven visible hazard channels, and an evidence-backed 0–10 index.
- Equipment mobilization, outdoor installation, and sheltered preparation restrictions. Missing coverage stays unknown.
- Photo reports with map pins, immediate task holds, streaming updates to other screens, manual confirmation of Jev suggestions, and resolutions that preserve history.
- Lightning replay with the 10-mile rule and a 30-minute countdown reset by the latest qualifying strike. Strike timestamps persist in SQLite.
- A 6 PM site-local scheduler that stores next-day briefings, carries unresolved reports, and prevents duplicate site/date briefings across restarts. The Node process must remain running for scheduling and live updates.
- Real HeatCast and GroundCast neural model weights, reproducible NumPy training, chronological evaluation, and a separate ten-site geographic holdout.
- Browser inference, real local calibration training, loss curves, measured execution time, historical outcome reveal, and sensitivity controls.
- IndexedDB storage for local model candidates, plus a production service worker and cached workspace for offline model work.
- On-demand live 48-hour-lead weather and NWS alert adapters. Refresh switches the workspace to the real clock. After switching to the real clock, the server watches all fifty sites, staggering NWS checks approximately every two minutes and weather refreshes every fifteen minutes (network delays can extend polling).

## Three-minute demo

1. Open **Demo controls → Reset demo**. Turkey Point is the hero site. The weather replay uses real historical model output. The demo day was deliberately selected for the site’s highest upper HeatCast prediction during July–August, not as a representative random example.
2. Open **Model Lab**, run fresh browser inference, then **Learn this site**. Show the actual training loss and before/after MAE. Improvement is not guaranteed. Reveal reanalysis outcomes.
3. Submit a report saying the equipment access road is blocked, attach a photo, and pin it. A second connected screen immediately inherits the mobilization hold.
4. Inject a simulated strike within six miles, advance ten minutes, then inject another strike. The timer resets to thirty minutes.
5. Run to 6 PM and open **Safety briefings**. The real scheduler carries the unresolved report forward. Resolve the report in **Crew reports** and inspect its history; an independent lightning hold remains active.
6. With the production page and Model Lab loaded once, disconnect internet and run inference or calibration again. The app does not require external map tiles. Jev and live feeds require connectivity; report sharing requires the local server.

## Models and evaluation

Both base models are dense 11 → 64 → 32 → 3 networks with ReLU hidden layers and quantile loss at 0.1, 0.5, and 0.9. They are trained with Adam, a fixed random seed, a reproducible 120,000-hour training subsample, validation-based early stopping, and separate interval calibration. The complete joined dataset contains **1,173,000 actual aligned hourly records**.

HeatCast learns a residual correction to heat index calculated from archived GFS 48-hour forecasts. GroundCast predicts reanalysis surface soil moisture. Features are temperature, humidity, rainfall, wind, estimated antecedent seven-day rainfall, cyclical time/season, and coordinates. All rainfall features come from archived forecasts, not future observations.

The fixed partitions are 2024 training; January–June 2025 validation; July–December 2025 uncertainty calibration; and January–September 2026 test. Ten plants are excluded from base fitting, preprocessing, soil thresholds, and interval calibration. No random temporal split is used. Held-out local calibration is labeled a separate adaptation experiment.

| Test metric, fitted sites | HeatCast | GroundCast |
| --- | ---: | ---: |
| Median MAE | 2.42441°F | 0.04966 m³/m³ |
| Baseline MAE | 3.05682°F | 0.06255 m³/m³ |
| Nominal 80% interval coverage | 80.472% | 73.536% |
| Evaluated hours | 262,080 | 262,080 |

Heat baseline: uncorrected GFS heat index. Ground baseline: training-period site median, with the global training median for unseen sites. The soil baseline is intentionally simple; this evaluation does not establish superiority to public soil forecasts. GroundCast's interval undercovers on the test period. Per-site metrics, threshold precision/recall, and unseen-site results are bundled in `public/models/evaluation.json`.

Local browser calibration uses 240 training, 96 validation, and 192 test samples per site, capped for a quick demonstration. It learns a linear correction from the frozen median prediction and seasonal features. Validation selects weights; the final test set is used only to report results. Repeated runs on these bundled samples are demonstrations, not new independent evaluations. Candidates are saved locally and never promoted into operational safety decisions.

WebGPU inference and a complete optimizer update are attempted on the actual device. The interface reports the backend used. WebGL and CPU are explicit fallbacks. Browser capability detection alone is not evidence of successful GPU training.

### Rebuild from sources

```bash
uv venv --python 3.12
uv pip install --python .venv/bin/python -r scripts/requirements.txt
npm run data:prepare
npm run ml:train
```

Downloads are cached under ignored `data/raw/`; rerunning resumes cached work. APIs can rate-limit bulk historical requests. No synthetic weather labels or invented evaluation metrics are generated.

## Data and limits

- **Locations:** [EIA-860M August 2026 operating inventory](https://www.eia.gov/electricity/data/eia860m/), deduplicated by plant ID. Regional counts are 35 FL, 8 LA, 7 MS. These are actual plant locations used as demonstration job sites, not claimed active construction projects.
- **Forecasts:** [Open-Meteo Previous Runs API](https://open-meteo.com/en/docs/previous-runs-api), GFS at fixed 48-hour lead. A sample's lead time is recorded explicitly. This is a forecast-correction experiment, not a replacement weather prediction system.
- **Targets:** [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api), ERA5-Land; Stock Island uses ERA5 because its coastal ERA5-Land cell has no data. Reanalysis is modeled gridded environmental information, not on-site measurement.
- **Official alerts:** [NWS](https://www.weather.gov/documentation/services-web-alerts). Fire-weather alerts are distinguished from confirmed wildfire. NWS does not supply live strike detections here.
- **Map outlines:** [PublicaMundi US states GeoJSON](https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json), bundled for offline use.
- **Lightning:** simulated events through a persistent replay adapter. There is no live lightning provider configured.
- **Wildlife:** crew sightings; no automated wildlife prediction.
- **Flood screening:** four manually selected Mississippi corridor demonstration sites and heavy-rain screening, plus official NWS alerts when connected. The selections do not establish verified river proximity, floodplain membership, or a river-stage forecast.

The index is the maximum of model-derived severity and active hazard/report severity. Heat severity interpolates 80/90/103/125°F to 0/3/7/10 using the upper estimate. Soil severity uses training-period 50th/90th/95th moisture percentiles. The 90th percentile requires ground inspection. Crew and lightning holds score 10. Unknown inputs never become zero. Resolving a crew report does not clear another hazard.

These are prototype screening policies. Heat index does not capture the full effects of direct sun, workload, clothing, or acclimatization. Soil moisture does not establish bearing capacity or predict truck immobilization. The UI preserves source mode, uncertainty, unknown coverage, and evidence so supervisors can review each decision.

The offline mode caches assets and the last server snapshot. Reports cannot sync without the server; a failed report submission preserves its description. Photos and other form fields are not automatically queued offline. Browser training and inference continue with previously cached data. Live alerts, Jev calls, and server scheduling are not claimed to run in a disconnected browser.

## Verification

```bash
npm test
npm run build
npm run test:e2e
```

Browser tests use installed Google Chrome. They cover the report handoff between screens, actual photo upload, lightning reset, briefing generation, resolution history, browser model inference and training, offline inference, and mobile layout. Screenshots are written to ignored `test-results/`.
