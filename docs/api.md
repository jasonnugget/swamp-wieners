# API contracts

The local Node server exposes JSON endpoints under `/api`. Run it from the repository root. The default address is `http://127.0.0.1:3001`; Vite proxies API and upload requests in development.

Workspace contracts live in [shared/types.ts](../shared/types.ts), observations and risk snapshots in [shared/risk.ts](../shared/risk.ts), provider metadata in [shared/providers.ts](../shared/providers.ts), and atlas frames in [shared/atlas.ts](../shared/atlas.ts). Request validation lives in [server/index.ts](../server/index.ts). The prototype has no account authentication. Writes with a supplied Origin must match the request host. Error responses use `{ "error": "message" }`.

## Read and event endpoints

| Method and path | Response |
| --- | --- |
| `GET /api/health` | `{ ok: true, version: string }` using the loaded model version |
| `GET /api/snapshot` | Complete `Snapshot`: clock, sites, teams, forecasts, screenings, reports, strikes, alerts, briefings, period decisions, canonical `siteRisks`, JEV configuration and feed status |
| `GET /api/sites/risks` | Canonical current risk snapshots keyed by site ID |
| `GET /api/sites/:id/risk` | One canonical current snapshot; 404 for an unknown site |
| `GET /api/risk/atlas?hour=0..72` | Current/forecast risk frame; optional `siteId` scopes scoring and response to one plant |
| `GET /api/events` | Server-sent events announcing connection or state invalidation; clients refetch the snapshot |

SSE messages are JSON in `data:` frames. Updates currently carry a timestamp rather than the full changed object. A comment heartbeat runs every twenty seconds. API responses are not service-worker cached; the client separately stores its last snapshot in localStorage.

## Crew report endpoints

### Save team assignments

`POST /api/teams` accepts `{ "name": "Access crew", "members": ["Alex Rivera", "Sam Chen"], "siteIds": ["621"] }`. Supply an existing UUID `id` to edit a team. Names contain 1 to 80 characters, the roster contains 1 to 100 names, and assignments contain 1 to 1,000 existing plant IDs. Repeated names and plant IDs are deduplicated. Team names must be unique ignoring case. Success returns the stored `CrewTeam` with HTTP 201 for creation or 200 for editing, then broadcasts an SSE invalidation. Missing edit targets return 404; duplicate team names return 409; invalid assignments return 400.

Snapshots include `teams`. Teams are shared SQLite records and survive restart and demo reset. The browser remembers the selected reporting team and name locally; this does not establish an authenticated identity.

### Create a report

`POST /api/reports` accepts:

```json
{
  "siteId": "621",
  "category": "soil",
  "description": "Standing water blocks the equipment access road.",
  "tasks": ["mobilization"],
  "latitude": 25.4356,
  "longitude": -80.3308,
  "author": "Field crew"
}
```

`photo` is optional and contains a base64 data URL for JPEG, PNG, or WebP. The decoded image limit is 4 MB. The overall JSON request limit is 6 MB. A description must contain 5 to 2,000 characters; the author must contain 1 to 80. Tasks must contain at least one supported value. Coordinates must be finite and within latitude/longitude bounds. The site must exist.

Optional `teamId` must identify a saved team with the author in its current roster and the plant in its current assignments. Invalid or outdated combinations return 400. The server records `teamId` and a snapshot of `teamName`; later roster or assignment edits do not change old reports. Reports without `teamId` remain supported.

Categories are `weather`, `heat`, `lightning`, `flood`, `wildfire`, `soil`, and `wildlife`. Tasks are `mobilization`, `installation`, and `preparation`.

Success returns HTTP 201 with the persisted `HazardReport`, including its ID, timestamp, open status, and optional upload URL. Selected task holds apply immediately. Jev triage runs asynchronously; a later SSE invalidation exposes its suggestion or unavailable result.

### Resolve a report

`POST /api/reports/:id/resolve` accepts `{ "author": "Supervisor", "resolution": "Access inspected; alternate road is usable." }`.

The reviewer name must contain 1 to 80 characters and the explanation 5 to 1,000. Success returns the report with resolution metadata. Resolving an already resolved report returns its existing record. The report history remains stored, and independent holds remain effective.

### Confirm a Jev suggestion

`POST /api/reports/:id/confirm-triage` takes no required body fields. It confirms a complete typed semantic classification, applies the suggested category and records the first confirmation time. It preserves selected task holds and can add semantic controls to other tasks. Incomplete suggestions return HTTP 400, resolved reports return 409 and missing reports return 404.

## Clock and demonstration endpoints

| Endpoint | Payload | Result |
| --- | --- | --- |
| `POST /api/demo/strike` | `{ "siteId": "621", "distanceMiles": 6 }` | Persisted simulated `Strike`; requires demo mode. Distance defaults to 6 and accepts 0 to 50 miles |
| `POST /api/clock` | `{ "mode": "demo", "advanceMinutes": 10 }` | Updated snapshot after clock change and scheduler check. Mode is `demo` or `real`; optional advancement is 0 to 1,440 minutes |
| `POST /api/demo/reset` | `{}` | Clears demonstration reports, strikes, alerts, briefings, stored forecasts, and feed status, then restores the bundled demo clock |

Clock advancement affects stored demo time; real mode follows the system clock. The clock and reset endpoints affect the shared local workspace. Reset is not a substitute for resolving a real report. Teams, environmental weather, NOAA screenings, provider records/caches and uploaded files survive reset. Reset still clears stored strike/alert events, including any recorded live events in those record kinds; it is an explicit demonstration action.

## Live-source refresh

`POST /api/sites/:id/refresh` takes no required body fields. It switches to the real clock and prioritizes batched canonical weather collection. It also refreshes fixed-lead model features for eligible sites or NOAA screening for catalog-only sites, and reuses the official-alert provider. Independent environmental providers are queued alongside this work; slower completions arrive through SSE after the response. The endpoint returns the updated workspace snapshot with per-source feed status. A missing site returns HTTP 404; an in-progress refresh for that site returns HTTP 409.

A successful HTTP response does not imply every source succeeded. Inspect `feedStatus`, canonical provider status, coverage and confidence. Fixed-lead model forecasts and normalized current weather remain separate evidence types. Jev credentials are unrelated to weather access. [Integration context](../server/integrations/README.md) describes each adapter.

## Static resources

`/data/*` and `/models/*` expose bundled public artifacts. `/uploads/*` serves local report evidence with a no-sniff header. The production build also serves the application shell, local fonts, styles, JavaScript chunks, and offline asset manifest. These static resources are distinct from the SQLite record store.

## Compatibility weather APIs

`GET /api/sites/:id/screening` loads or returns a fifteen-minute-cached NOAA/NWS `WeatherScreening` with `siteId`, `source`, `sourceUrl`, `fetchedAt`, `issuedAt` and `hours[{time, heatIndex, windKmh}]`. Missing variables are null. Invalid plant IDs return 404; no available cached forecast returns 503. Failed refreshes preserve the old record; policy expires it after three hours or a provider issue age of 24 hours. This request does not change the safety clock. Snapshots include `weatherScreenings`; national additions also load automatically in the background. Period-specific compatibility decisions use the next 24 hours of screening; canonical current normalization fills only a matching-hour heat/wind gap. Both preserve independent hazards. These records are separate from custom-model `forecasts`.

`GET /api/weather/atlas` returns `{ source: "Open-Meteo", points: WeatherPoint[], unavailable: string[] }` for fifty named US sample locations. Partial results remain usable; no available points returns HTTP 503 with an error. `GET /api/weather/point?latitude=39.74&longitude=-104.99` returns that coordinate's `WeatherPoint`. Coordinates must be finite and within the US atlas bounds; invalid queries return 400. Provider failure without cached data returns 503.

Each point contains `current.time`, `fetchedAt`, current values, 168 past hours and up to 73 forecast hours. Temperatures are Fahrenheit, wind is mph, clouds are percent, and precipitation is equivalent mm/h. Current precipitation is converted from the provider's accumulation interval to an hourly rate. Missing variables stay null. Current conditions are model estimates, not sensor observations. Coordinates are cached to three decimals for fifteen minutes in a bounded server cache; identical pending requests share work. After a refresh failure, expired cached results include `stale: true` and an error. The supervisor browser caches canonical workspace snapshots rather than a separate weather-atlas dataset.

These compatibility responses use actual system/provider time and do not drive the supervisor atlas. The atlas consumes the canonical risk frames described below. It does not change safety decisions, the frozen ML models' forecasts, or existing holds. Read the [provider documentation](https://open-meteo.com/en/docs) and [free-tier terms](https://open-meteo.com/en/terms). Source attribution appears in the canonical map inspector.

## Canonical site risk

`GET /api/sites/risks` returns a site-ID map of `SiteRiskSnapshot`; `GET /api/sites/:id/risk` returns one snapshot or HTTP 404 for an unknown site. `GET /api/snapshot` adds the same map as `siteRisks`. These reads use persisted provider evidence immediately; unavailable evidence produces null scores rather than HTTP errors or invented zeros. Site refresh now also collects canonical environmental inputs.

Snapshots include version, site ID, system-clock `generatedAt`, policy version, composite risk, confidence (0 to 1), seven channel scores/evidence, normalized observation with field coverage (0 to 100), task decisions, independent active overrides and ML availability. Observation `validAt`/`fetchedAt` are nullable when no weather was obtained. Observation provenance mode is `live` for current snapshots and `forecast` for projected atlas frames; per-source modes retain LIVE/DEMO/FORECAST/STATIC distinctions. Real-clock legacy decisions use canonical risk/tasks; demo decisions and forecast-period briefings retain compatibility behavior. Canonical live timestamps remain independent of the demo clock. See [contract details](environment-pipeline.md).

## Continuous scoring and report semantics

Canonical snapshots add `scoringVersion` and `explanation` (primary driver, compounding hazards, strengths and uplift). Every channel exposes structured `factors` with source kind/mode, value, score, confidence, local weight and model valid times. Formula and calibration details are in [risk scoring](risk-scoring.md). Newly generated replay and briefing decisions now use the same continuous numerical functions.

`HazardReport.triage` can include a validated `classification` with category, severity, immediacy, affectedTasks, confidence and summary. The summary copies the original description. Suggestions remain non-operational until `POST /api/reports/:id/confirm-triage`; this endpoint accepts only a complete live classification and records `confirmedAt`. Missing/invalid classification returns 400; a resolved report returns 409. Confirmation preserves crew-selected task holds and can add semantic controls. Provider failures preserve manual reporting. Existing reports without classification use a provisional moderate numeric screen and keep their explicit holds; legacy category/task-only suggestions cannot supply a new semantic severity.

`SiteObservationV1.wildlife` adds nullable `latestSightingAt` and semantic `severity`, defaulted to null for older provider caches. The public wildlife provider supplies recent relevant iNaturalist context; it does not assign species-based incident severity. No sightings remains unknown rather than a measured zero. Exact NWS event names are retained separately from alert headlines. Numerical alert floors do not replace operational alert rules.

## External source evidence

Canonical observations add `provenance.providers` and `provenance.fieldEvidence`. Provider metadata includes source, status, mode, fetchedAt, observedAt, validUntil, confidence, error and bounded details. Never-collected providers have null fetch/expiry timestamps. Field metadata names the source, source mode, timestamps and confidence for each populated normalized field. `lightning.evidenceMode` distinguishes LIVE, DEMO, FORECAST and UNAVAILABLE; demo detections never populate live risk inputs. Public wildlife details include species, time, distance and source links, with sampling limits.

`POST /api/sites/:id/refresh` also queues independent provider work. The response can precede slower source completion; SSE invalidation requests a new snapshot as results arrive. Reads do not fan out source HTTP requests. Existing routes remain available. See [field mappings, failure semantics and intervals](environment-providers.md).

JSON and static assets use negotiated compression when the client accepts it, with `Vary: Accept-Encoding`; decoded contracts are unchanged. `/api/events` bypasses compression so SSE updates flush immediately.

## Authoritative supervisor atlas

`GET /api/risk/atlas?hour=0` returns a `RiskAtlas` with `version: 1`, `generatedAt`, `validAt`, `hour`, `kind`, `limitations`, and `sites: [{site, snapshot}]`. Each snapshot is the shared `SiteRiskSnapshot`. The default hour is zero; invalid, fractional or out-of-range hours return HTTP 400. Optional `siteId` returns exactly one plant and scopes engine scoring to that site; an unknown ID returns HTTP 404. The map requests the current national frame, while its selected-site forecast slider uses `?hour=1..72&siteId=...`. Without `siteId`, national frames remain supported for compatibility. This endpoint reads persisted evidence and never fans out external HTTP requests.

Hour zero returns the same current snapshots as `/api/sites/risks` and `/api/snapshot.siteRisks`, using actual system time regardless of the historical demo clock. Hours 1 through 72 select a forecast frame aligned to the system hour, scoped to `siteId` when supplied. The server normalizes that hour's persisted Open-Meteo forecast and invokes the same channel scorers, composite formula and task policy. A full 73-frame payload is not downloaded. Responses contain one site when scoped, otherwise all sites; unavailable site/frame inputs remain null.

Source freshness is checked against actual request time, while forecast validity and policy expiry use the requested future time. Source fetch timestamps are preserved; a warning without an original successful check time retains a null fetch timestamp. Static flood exposure and still-valid official warnings may apply; unresolved crew controls are explicitly assumed to persist. Future gauge readings, fire detections, strikes and public sightings are not invented. Forecast task states are screening scenarios, not future work authorization. Current model evidence stays in current snapshots; this projection does not invent hourly HeatCast/GroundCast predictions.

The browser keeps a current national map and fetches only the selected plant per forecast hour. It debounces scrubbing, cancels superseded reads, and caches up to 48 visited site/hour results for sixty seconds. Workspace/SSE updates and refresh invalidate those cached results. Layer changes select fields from the existing frame and make no HTTP request. A failed refresh marks retained evidence `CACHED / STALE`; initial offline current data can use the cached canonical workspace. The inspector exposes scores, coverage, confidence, structured drivers, task states, overrides and source metadata.

Map layers select values without recalculating risk:

| Layer | Canonical field | Unit |
| --- | --- | --- |
| Site risk | `snapshot.risk` | 0–10 |
| Temperature | `observation.weather.temperatureF` | °F |
| Wind | `observation.weather.gustMph`, else `windMph` with an explicit fallback label | mph |
| Precipitation | `observation.weather.precipitation1hMm` | mm per hour |
| Heat / Weather / Soil / Flood / Wildfire / Lightning / Wildlife risk | Matching `snapshot.channels[].score` by hazard | 0–10 |

Unknown values use gray question marks. Known values below 50% confidence use dashed/translucent markers. Display color is continuous; coverage, confidence and task state remain separate. Supervisor ranking uses current snapshots: active HOLD first, then known risk at least 4, then insufficient evidence (null risk, confidence below 0.5 or coverage below 50%), then observed low risk. Within each tier, higher risk leads, followed by lower confidence and name.

The compatibility `/api/weather/atlas` and `/api/weather/point` routes remain available for external consumers. The supervisor map no longer calls either route, and arbitrary land clicks no longer create a separate weather truth. Historical replay, Model Lab and immutable briefing views retain their labeled periods.

## Demo data completion

`GET /api/risk/atlas?hour=0..72&completion=1` adds `completion` beside each `{site, snapshot}`. Omit the parameter or use `completion=0` for the unchanged canonical response. Other completion values return HTTP 400. The browser atlas requests the companion in the existing national batch.

`GET /api/sites/:id/data-completion` returns one compact companion or HTTP 404 for an unknown plant. Site intelligence requests only its inspected plant and cancels superseded reads. These read-only endpoints use persisted evidence and do not query providers.

A companion has `usage: "DEMO_ONLY"`, `method: "location-season-weather-v2"`, `scenario` (all 34 environmental values), `fields` (SOURCE/SYNTHETIC kind, reason and confidence per path), and `completeness` counts. Synthetic confidence is zero. Existing source zero/false values are preserved. Event/gauge fallback values are hypothetical; they are not live provider records. Full CLI exports also retain `observed`, plant identity, generation time and per-field basis arrays.

Completion never mutates `snapshot`, source coverage, numerical risk, channel evidence, task decisions or overrides. The UI uses it only for explicitly labeled condition previews. Map layers and ranking continue to select canonical values. Future synthetic preview values do not establish future observations or authorize work. See [completion assumptions](site-data-completion.md).

## Native crew app

`GET /api/crew/workspace?siteId=<plant>` returns `CrewWorkspace` (`version: 1`): all catalog `sites`, current `teams`, the selected `siteId`, server-clock `now`/`clockMode`, and only that plant’s `reports`, including resolved history. The additive optional `conditions` field carries that plant’s canonical `SiteRiskSnapshot` (seven channels, normalized observations, source provenance, active overrides and task states). Current conditions use system time even when crew reporting uses the demonstration clock; historical/demo inputs are not substituted for live site conditions. Older cached native workspaces without this field remain readable with conditions marked unavailable. Omitted `siteId` selects the first catalog plant; empty/invalid queries return 400 and unknown sites return 404. This read scores only the selected plant from persisted evidence; it does not assemble national risk snapshots, future frames or synthetic completion values. Native clients reuse `/api/events` for active-app updates.

`POST /api/reports` additionally accepts optional UUID `clientRequestId`. Repeating an unchanged accepted request returns HTTP 201 with its existing report, without a second upload, record or triage job. Reusing the same ID for different details returns 409. The report and request receipt commit in one SQLite transaction. Editing a native draft creates a new request ID; an unchanged retry preserves it. Demo reset clears receipt records with reports. Existing web clients may omit this field.

The iOS client compresses photographs to JPEG, explicitly confirms the pin and submits the existing report contract. It does not claim a share succeeded before HTTP acceptance, silently queue offline uploads, or turn a resolved report into an independent all-clear. Its sandbox drafts and cached records are not operational server evidence.
