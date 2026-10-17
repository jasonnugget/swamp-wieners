# PlanIT Control

Field safety intelligence for 285 actual power plants across all 50 US states. Every site shares one normalized environmental-data and risk pipeline. HeatCast and GroundCast add model evidence for the original fifty-site historical cohort. Reports become persistent site knowledge for the next shift.

## Run locally

Requires Node.js 22.13 or later. Model weights, evaluation results, real plant locations, and historical demo data are already bundled. Python is only needed to rebuild the dataset or retrain the base models.

```bash
npm ci
npm run dev
```

Open http://localhost:5173. The API listens on port 3001. Vite waits for `/api/health` before accepting browser requests, preventing proxy connection errors during initial startup. If readiness fails within thirty seconds, check the API process output. For the production build:

```bash
npm run build
npm start
```

Open http://127.0.0.1:3001. SQLite records and photos live in the ignored `runtime/` directory. The API binds to localhost by default. To try a phone on a trusted local network, set `HOST=0.0.0.0` and use the Vite development URL printed for that network. This hackathon prototype has no account authentication; keep it on a trusted network.

Copy [.env.example](.env.example) to `.env` to configure optional providers and Jev access. NASA FIRMS uses keyless regional downloads by default; `FIRMS_MAP_KEY` enables smaller area queries; `USGS_API_KEY` is optional. FEMA and public wildlife queries need no key in the implemented adapters. Lightning defaults to unavailable until a trusted source is supplied. See [provider setup and limits](docs/environment-providers.md).

Run `npm run data:complete` to refresh all plants and write a field-by-field [data-completion export](docs/site-data-completion.md) under `runtime/site-data/`. Real values take priority. Missing values receive labeled demo estimates or explicit N/A event fields; synthetic completion never feeds live risk, task policy or model training. Use `npm run data:complete -- --offline` to rebuild the export from existing source records.

For optional JEV classification, set `TYPESAFE_API_KEY` server-side. The adapter calls the official `https://api.typesafe.ai/v1/systemone` endpoint. Jev classifies report text and affected tasks; it does not generate briefings or clear restrictions. No credential is bundled. Without a key, manual reporting remains fully functional and the interface says that Jev is unavailable.

## What is implemented

- 285 EIA plant locations across all fifty states, an interactive Three.js supervisor map with risk beacons and an expanded showcase, seven visible hazard channels, and an evidence-backed 0–10 index. Missing safety coverage stays unknown.
- Equipment mobilization, outdoor installation, and sheltered preparation restrictions. Missing coverage stays unknown.
- Photo reports with map pins, immediate task holds, streaming updates to other screens, manual confirmation of Jev suggestions, and resolutions that preserve history.
- Lightning replay with the 10-mile rule and a 30-minute countdown reset by the latest qualifying strike. Strike timestamps persist in SQLite.
- A 6 PM site-local scheduler that stores next-day briefings, carries unresolved reports, and prevents duplicate site/date briefings across restarts. The Node process must remain running for scheduling and live updates.
- Real HeatCast and GroundCast neural model weights, reproducible NumPy training, chronological evaluation, and a separate ten-site geographic holdout.
- Browser inference, real local calibration training, loss curves, measured execution time, historical outcome reveal, and sensitivity controls.
- IndexedDB storage for local model candidates, plus a production service worker and cached workspace for offline model work.
- Batched Open-Meteo weather/soil inputs, official NWS alerts, nearby USGS stages, FEMA exposure and public wildlife context for all sites. FIRMS supports keyless regional downloads and optional keyed area queries; lightning modes distinguish unavailable, recorded live events and replay. Source-specific caches, expiry and backoff preserve unknowns on failure.
- Continuous weather, heat, lightning, flood, wildfire, soil and wildlife channels; dominant risk plus bounded secondary compounding; separate task policy. Ordinary crew reports do not force risk to 10.
- An authoritative 3D risk atlas with eleven layers, site explanations, coverage/confidence, current overrides and a backend-scored 72-hour timeline loaded on demand for the selected plant.

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

## One operational data flow

```text
External providers + crew evidence
  → normalized SiteObservationV1
  → hazard enrichment and seven continuous scores
  → composite risk + independent task policy
  → SiteRiskSnapshot
  → /api/risk/atlas?hour=0..72
  → supervisor map and canonical site ranking
```

The atlas distinguishes raw temperature/rain/wind from scored hazard channels. Unknown values are gray question marks; low-confidence known values are dashed and translucent. The inspector’s Overview, Conditions and Sources views show risk, coverage, confidence, drivers, task decisions, all 34 normalized environmental fields, field provenance, provider health, model availability and plant metadata. Desktop uses a dedicated evidence panel beside the canvas; mobile stacks it below the map. Reports update connected supervisors through SSE; confirmed JEV classifications supply semantic evidence, never final site-risk numbers.

Current snapshots use actual system time even during the historical demo. Future frames reuse backend normalization/scoring over available hourly weather, with explicit assumptions for existing controls. Future gauge readings, fires, strikes and wildlife sightings remain unknown; forecast tasks are not work authorization. Historical model replay and stored briefings retain their labeled periods.

The catalog contains 285 operating EIA plants across all fifty states, with at least five per state. The original fifty-site model cohort is preserved; `catalogOnly` means no historical model coverage, not exclusion from environmental collection. Regenerate the catalog with `npm run data:catalog`.

Read [the architecture](docs/architecture.md), [pipeline contract](docs/environment-pipeline.md), [scoring formulas](docs/risk-scoring.md), [provider setup](docs/environment-providers.md), [atlas API](docs/api.md#authoritative-supervisor-atlas), and [current UI screenshots/audit](docs/ui-audit.md). Compatibility weather routes remain available, but the supervisor map does not call them.
