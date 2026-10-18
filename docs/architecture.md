# Architecture

## Repository layout

```text
src/
  main.tsx                 React entrypoint
  app/                     Editorial homepage, linked working views, and selected site
  components/              Shared Three.js map, chart, and work-window views
  features/
    reports/               Photo reporting, pinning, triage review, and history
  lib/                     API transport and browser snapshot cache
  styles/                  Application-wide visual rules
server/
  index.ts                 HTTP routes, validation, SSE, process lifecycle, pollers
  engine.ts                Snapshot assembly, injected clock, briefing scheduler
  store.ts                 SQLite JSON-record persistence
  integrations/            Environmental providers, fixed-lead models, and JEV
  pipeline/                Collection, normalization, enrichment, scoring, atlas frames
shared/                    Observation/risk/atlas contracts; pure scoring, policy and model math
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

The server loads plants, historical forecasts, a model bundle, and a demo scenario from `public/`. `Engine.snapshot()` combines that data with persisted reports, strikes, alerts, feed checks, and briefings. `shared/policy.ts` computes replay/forecast-period decisions; canonical live decisions use the normalized environment pipeline described below.

Reports are validated and persisted before the server broadcasts an SSE invalidation. The client fetches the complete snapshot after an event; SSE does not carry the entire workspace. Jev triage runs after report acceptance and does not delay the selected holds. A reviewer explicitly confirms suggestions. Resolution preserves evidence and clears only the resolved report's restrictions.

`Store` keeps JSON records in a SQLite table keyed by `(kind, id)`, with WAL enabled. Record kinds include `config`, `team`, `report`, `strike`, `alert`, `forecast`, `feed`, `briefing`, `weather-screening`, `environment-weather`, `environment-provider` and `provider-cache`. Photos live under the runtime upload directory. These are local process records, not public build assets.

## Time and external feeds

Demo time is stored in SQLite and advances explicitly. Real mode uses the system clock. Demo `decisions` select bundled forecasts and simulated events; canonical `siteRisks` and atlas frames always use actual system time and live evidence. Live responses cannot replace historical model inputs, and simulated strikes never become live detections.

A five-second worker checks briefing eligibility. At or after 6 PM local time, the engine stores one briefing for the next local date. The unique site/date record key prevents duplicate briefings after restart. Reports and decisions are copied into a briefing snapshot; later resolution does not rewrite an earlier briefing.

Independent two-second dispatchers collect batched Open-Meteo inputs and schedule source-specific provider jobs in both clock modes. Official NWS alert evidence has a five-minute target; USGS, FIRMS, wildlife and static exposure have their own intervals. NOAA heat/wind screening has a fifteen-minute schedule with up to three jobs. See [provider intervals and limits](environment-providers.md).

A compatibility ten-second dispatcher runs only in real mode, with up to five feed jobs. It checks alert eligibility after two minutes but delegates to the same cached five-minute NWS provider; it is not a separate alert engine. Fixed-lead model weather becomes due after fifteen minutes. These are scheduling targets, not freshness or latency guarantees. The process must remain running for collection, SSE and briefing generation.

## Offline state

The production build emits `asset-manifest.json`. The service worker precaches the app shell, Three.js scene chunks, fonts, data, and models. `src/lib/api.ts` stores the last snapshot in localStorage. Offline reload uses cached assets and snapshot data; it does not recreate a server or queue complete reports. A failed submission preserves the description only.

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

The regional view extrudes bundled state polygons on a local Mercator plane. Beacon height and color represent the selected canonical raw-data or risk layer; the extrusion is schematic, not terrain. Selected sites synchronize with the rest of the workspace. Orbit, zoom, focus, overhead, and expanded showcase controls affect presentation only.

Report maps use a top-down camera and raycast ground clicks back to latitude/longitude. Panning does not submit a pin. Open crew reports remain visible, and active lightning holds draw a geodesic ten-mile boundary. A flat interactive fallback preserves selection and pinning if WebGL cannot initialize. Renderer resources are disposed on unmount; animation respects reduced motion and pauses offscreen.

The national risk atlas reads `/api/risk/atlas?hour=0` through `src/lib/useRiskAtlas.ts`. Its map stays current. The selected-site inspector requests future hours with `siteId`, so the engine scores only that plant. Recent visited site/hour frames are cached for sixty seconds and invalidated by workspace updates or refresh. National responses contain every plant; scoped responses contain one. Current values reuse `Engine.snapshot().siteRisks`; future weather is normalized and scored on the backend with preserved source timestamps and explicit limits. Layers select measurements or scores from the same frame. There is no frontend-only weather risk engine or arbitrary-point weather request.

The plant catalog has 285 sites and the frozen historical model cohort remains fifty. Every site shares the operational pipeline. Catalog-only sites do not inherit historical forecasts. The scene retains its renderer, land and beacon geometry across value/layer updates; unknowns remain gray and ranking exposes insufficient evidence.

## Website navigation

The default view is an editorial homepage with decorative canvas artwork and scoped GSAP scroll effects. Query-string links select the dedicated fullscreen atlas, Site intelligence, Crew reports, and Safety briefings. Browser history and reload retain the chosen view. The atlas owns a current-risk inspector with Overview, Conditions and Sources views. Site intelligence shares the normalized observation/source components and owns the full site ranking; the homepage does not mount the atlas. Home animation is unrelated to operational weather and model state.

## Canonical operational environment

The operational path is:

```text
SITE → COLLECT → NORMALIZE → ENRICH → CHANNEL SCORES
     → COMPOSITE + INDEPENDENT POLICY → SITE RISK SNAPSHOT
     → /api/risk/atlas → 3D MAP
```

All plants pass through `server/pipeline/`: batched collection, normalization, hazard enrichment, continuous channel scores, shared task policy and dominant-plus-compounding aggregation. `shared/risk.ts` defines the versioned observation and site snapshot. `Engine.snapshot().siteRisks` is the live source of truth, independent of demo time. Real-clock `decisions` adapt it for compatibility consumers; supervisor beacons read the canonical atlas directly. The atlas consumes these canonical snapshots and their coverage through the batched risk API; compatibility weather routes remain available without a map consumer. See [audited flow and contract](environment-pipeline.md).

Numerical scoring is shared across live, replay and briefing adapters through `shared/risk-scoring.ts`. JEV classifications require confirmation before supplying semantic severity floors; selected crew holds remain independent. [Scoring details](risk-scoring.md) record the formulas and assumptions.

The atlas presentation uses a viewport-filling renderer with floating navigation, region controls, layer dock, forecast filmstrip and a collapsible evidence drawer. Drawer state and motion stay local to map components. GSAP handles scoped visual transitions; it does not change environmental values or the scene’s update pipeline. Details and screenshots are in the [immersive atlas audit](immersive-atlas.md).

## Hypothetical atlas scenarios

The separate simulation mode is browser-local. `shared/simulation.ts` computes idealized moving wind/rain fields, accumulated rainfall and cumulative excess above an assumed drainage rate for actual plant coordinates. `src/features/simulation/` owns configuration, playback, site comparisons and JSON export. `site-map/simulation-scene.ts` owns reusable Three.js overlays; `scenario-geometry.ts` supplies geographic footprints and framing for both renderers. The flat fallback keeps the scenario usable without WebGL.

The scenario contract never enters `SiteRiskSnapshot`, provider records or task policy. Canonical beacons stay current while overlays show hypothetical effects; the inspector presents the newest available workspace/atlas controls separately. A new workspace hold remains visible even if the atlas refresh fails. The simulation does not model terrain, flood depth, storm surge, damage, generation loss or restoration. [Equations and research](atlas-simulation.md) explain the numerical assumptions.
