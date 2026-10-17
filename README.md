# PlanIT Control

Field safety intelligence for 285 actual power plants across all 50 US states. Two custom environmental models support the original fifty-site historical cohort; live atlas weather and crew reporting extend nationwide. Reports become persistent site knowledge for the next shift.

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

- 285 EIA plant locations across all fifty states, an interactive Three.js supervisor map with risk beacons and an expanded showcase, seven visible hazard channels, and an evidence-backed 0–10 index. Missing safety coverage stays unknown.
- Equipment mobilization, outdoor installation, and sheltered preparation restrictions. Missing coverage stays unknown.
- Photo reports with map pins, immediate task holds, streaming updates to other screens, manual confirmation of Jev suggestions, and resolutions that preserve history.
- Lightning replay with the 10-mile rule and a 30-minute countdown reset by the latest qualifying strike. Strike timestamps persist in SQLite.
- A 6 PM site-local scheduler that stores next-day briefings, carries unresolved reports, and prevents duplicate site/date briefings across restarts. The Node process must remain running for scheduling and live updates.
- Real HeatCast and GroundCast neural model weights, reproducible NumPy training, chronological evaluation, and a separate ten-site geographic holdout.
- Browser inference, real local calibration training, loss curves, measured execution time, historical outcome reveal, and sensitivity controls.
- IndexedDB storage for local model candidates, plus a production service worker and cached workspace for offline model work.
- On-demand live 48-hour-lead weather and NWS alert adapters. Refresh switches the workspace to the real clock. After switching to the real clock, the server watches all fifty sites, staggering NWS checks approximately every two minutes and weather refreshes every fifteen minutes (network delays can extend polling).

## Repository context

| Area | Context |
| --- | --- |
| Browser app | [src/README.md](src/README.md) |
| API, engine, and persistence | [server/README.md](server/README.md) |
| Shared contracts and decisions | [shared/README.md](shared/README.md) |
| Data preparation and training | [scripts/README.md](scripts/README.md) |
| Public assets | [public/README.md](public/README.md) |
| Local data intermediates | [data/README.md](data/README.md) |
| Verification | [tests/README.md](tests/README.md) |

Read [the architecture](docs/architecture.md) for the directory tree and data flow. The [documentation index](docs/README.md) links the API, models, data/policy context, and demonstration guide. [AGENTS.md](AGENTS.md) records contributor guidance and invariants. Every maintained directory has a local README; generated/dependency folders are documented by their parent.

## Verification

```bash
npm test
npm run build
npm run test:e2e
```

Browser tests use installed Google Chrome. They cover the report handoff between screens, actual photo upload, lightning reset, briefing generation, resolution history, browser model inference and training, offline inference, and mobile layout. Screenshots are written to ignored `test-results/`.

The 3D map includes a national weather atlas with all fifty states, current Open-Meteo model estimates, a 72-hour forecast timeline, four weather layers, and point inspection. No weather API key is required for the provider's free noncommercial endpoint. Source timestamps and stale-cache status are visible; live weather visualization is independent of the historical safety demonstration. See [API details](docs/api.md) and [map context](src/components/site-map/README.md).

Plant coverage is 285 operating EIA plants across all fifty states, with at least five per state. The original fifty historical/model sites are preserved. National additions automatically load NOAA/NWS hourly forecasts and show a partial heat/wind risk score, with source and freshness checks; they do not claim custom-model coverage. Other hazards remain unknown until independent evidence is available. Initial national loading runs in the background; selecting a plant prioritizes its forecast. Regenerate the catalog with `npm run data:catalog`.
