# Architecture

## Repository layout

```text
src/
  main.tsx                 React entrypoint
  app/                     Editorial homepage, linked working views, and selected site
  components/              Shared Three.js map, chart, and work-window views
  features/
    model-lab/             Browser inference, local training, and evaluation UI
    reports/               Photo reporting, pinning, triage review, and history
  lib/                     API transport and browser snapshot cache
  styles/                  Application-wide visual rules
server/
  index.ts                 HTTP routes, validation, SSE, process lifecycle, pollers
  engine.ts                Snapshot assembly, injected clock, briefing scheduler
  store.ts                 SQLite JSON-record persistence
  integrations/            Open-Meteo, NWS, and Jev adapters
shared/                    Contracts and pure model, policy, clock, window logic
scripts/                   Historical data preparation and base-model training
tests/
  unit/                    Data, policy, engine, and work-window checks
  e2e/                     Browser workflows and offline reload verification
public/
  data/                    Bundled historical inputs and scenario
  models/                  Frozen weights and evaluation results
  fonts/                   Local font assets and licenses
data/                      Ignored raw downloads and training intermediate
```

## State and decision flow

The server loads plants, historical forecasts, a model bundle, and a demo scenario from `public/`. `Engine.snapshot()` combines that data with persisted reports, strikes, alerts, feed checks, and briefings. `shared/policy.ts` computes the authoritative task decisions and hazard index.

Reports are validated and persisted before the server broadcasts an SSE invalidation. The client fetches the complete snapshot after an event; SSE does not carry the entire workspace. Jev triage runs after report acceptance and does not delay the selected holds. A reviewer explicitly confirms suggestions. Resolution preserves evidence and clears only the resolved report's restrictions.

`Store` keeps JSON records in a SQLite table keyed by `(kind, id)`, with WAL enabled. Record kinds include `config`, `report`, `strike`, `alert`, `forecast`, `feed`, and `briefing`. Photos live under the runtime upload directory. These are local process records, not public build assets.

## Time and external feeds

Demo time is stored in SQLite and advances explicitly. Real mode uses the system clock. Demo snapshots select bundled forecasts and exclude live alerts, so a delayed live response cannot replace replay inputs.

A five-second worker checks briefing eligibility. At or after 6 PM local time, the engine stores one briefing for the next local date. The unique site/date record key prevents duplicate briefings after restart. Reports and decisions are copied into a briefing snapshot; later resolution does not rewrite an earlier briefing.

In real mode, a ten-second dispatcher starts up to five feed refreshes in parallel. NWS checks become due after two minutes and weather checks after fifteen minutes. Network delays can extend these intervals. The process must remain running for polling, SSE, and scheduling.

## Browser ML and offline state

The Model Lab is lazy loaded. It loads frozen weights into TensorFlow.js and attempts WebGPU, WebGL, then CPU as needed. Local training fits a separate residual correction; operational server decisions continue using frozen weights. IndexedDB stores calibration candidates with site, target, model version, and training provenance.

The production build emits `asset-manifest.json`. The service worker precaches the app shell, lazy ML code, Three.js scene chunks, fonts, data, and models. `src/lib/api.ts` stores the last snapshot in localStorage. Offline reload uses cached assets and snapshot data; it does not recreate a server or queue complete reports. A failed submission preserves the description only.

## Generated and local directories

| Directory | Owner and purpose |
| --- | --- |
| `node_modules/`, `.venv/` | Package managers; local dependencies |
| `dist/` | Vite production build; includes copied public assets |
| `data/raw/`, `data/training.npz` | Python pipeline caches and aligned training data |
| `runtime/` | Server SQLite database and uploaded photos |
| `runtime/e2e/` | Isolated browser-test server records |
| `test-results/`, `playwright-report/` | Browser test artifacts |
| `__pycache__/` | Python bytecode caches |

These directories are ignored. Their context belongs here or in their maintained parent's README, not in generated files.

## 3D map interaction

The regional view extrudes bundled state polygons on a local Mercator plane. Risk beacons use the supplied hazard index for height and color; the extrusion is schematic, not terrain. Selected sites synchronize with the rest of the workspace. Orbit, zoom, focus, overhead, and expanded showcase controls affect presentation only.

Report maps use a top-down camera and raycast ground clicks back to latitude/longitude. Panning does not submit a pin. Open crew reports remain visible, and active lightning holds draw a geodesic ten-mile boundary. A flat interactive fallback preserves selection and pinning if WebGL cannot initialize. Renderer resources are disposed on unmount; animation respects reduced motion and pauses offscreen.

The 3D national weather atlas has a separate live-data path: `SiteMap` loads `/api/weather/atlas` and `/api/weather/point` in parallel through `useWeatherAtlas`, while `atlas-weather.ts` queries the free Open-Meteo Forecast API with a bounded fifteen-minute cache. Overview geometry covers all fifty states and weather samples cover one named point per state; land raycasting supports arbitrary point inspection. Layer/timeline state changes only the visualization, not the safety engine or its historical forecast inputs. Provider times and stale-cache labels stay visible.

The national site catalog has 285 plants while the frozen historical model cohort remains fifty plants. `scripts/expand_sites.py` preserves that cohort in `model-sites.json`, adds geographically distributed operating plants nationwide, and records catalog provenance. New sites have `catalogOnly: true`, no borrowed forecasts, unknown safety coverage, and normal report storage. Site weather inspection uses the independent atlas provider.

## Website navigation

The default view is an editorial homepage with decorative canvas artwork and scoped GSAP scroll effects. Query-string links select the dedicated fullscreen atlas, Site intelligence, Model Lab, Crew reports, and Safety briefings. Browser history and reload retain the chosen view. Site intelligence owns the evidence panels and ranking; the homepage does not mount a weather atlas. Home animation is unrelated to operational weather and model state.
