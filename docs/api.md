# API contracts

The local Node server exposes JSON endpoints under `/api`. Run it from the repository root. The default address is `http://127.0.0.1:3001`; Vite proxies API and upload requests in development.

Contracts live in [shared/types.ts](../shared/types.ts). Request validation lives in [server/index.ts](../server/index.ts). The prototype has no account authentication. Writes with a supplied Origin must match the request host. Error responses use `{ "error": "message" }`.

## Read and event endpoints

| Method and path | Response |
| --- | --- |
| `GET /api/health` | `{ ok: true, version: string }` using the loaded model version |
| `GET /api/snapshot` | Complete `Snapshot`: clock, sites, forecasts, reports, strikes, alerts, briefings, decisions, Jev configuration flag, and feed status |
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

`POST /api/reports/:id/confirm-triage` takes no required body fields. It applies a valid suggested category and unions the suggested task with the existing task list. It does not remove existing affected tasks. Incomplete or unsupported suggestions return HTTP 400. Missing reports return HTTP 404.

## Clock and demonstration endpoints

| Endpoint | Payload | Result |
| --- | --- | --- |
| `POST /api/demo/strike` | `{ "siteId": "621", "distanceMiles": 6 }` | Persisted simulated `Strike`; requires demo mode. Distance defaults to 6 and accepts 0 to 50 miles |
| `POST /api/clock` | `{ "mode": "demo", "advanceMinutes": 10 }` | Updated snapshot after clock change and scheduler check. Mode is `demo` or `real`; optional advancement is 0 to 1,440 minutes |
| `POST /api/demo/reset` | `{}` | Clears demonstration reports, strikes, alerts, briefings, stored forecasts, and feed status, then restores the bundled demo clock |

Clock advancement affects stored demo time; real mode follows the system clock. The clock and reset endpoints affect the shared local workspace. Reset is not a substitute for resolving a real report. Uploaded files are not removed by the record reset.

## Live-source refresh

`POST /api/sites/:id/refresh` takes no required body fields. It switches to the real clock, fetches weather and NWS alerts independently, records each result in feed status, and returns the updated snapshot. A missing site returns HTTP 404; an in-progress refresh for that site returns HTTP 409.

A successful HTTP response does not imply both providers succeeded. Inspect `feedStatus` for partial failures. Weather is a next-day fixed-48-hour-lead forecast processed by the frozen models. Jev credentials are unrelated to weather access. [Integration context](../server/integrations/README.md) describes each adapter.

## Static resources

`/data/*` and `/models/*` expose bundled public artifacts. `/uploads/*` serves local report evidence with a no-sniff header. The production build also serves the application shell, local fonts, styles, JavaScript chunks, and offline asset manifest. These static resources are distinct from the SQLite record store.

## National weather visualization

`GET /api/sites/:id/screening` loads or returns a fifteen-minute-cached NOAA/NWS `WeatherScreening` with `siteId`, `source`, `sourceUrl`, `fetchedAt`, `issuedAt` and `hours[{time, heatIndex, windKmh}]`. Missing variables are null. Invalid plant IDs return 404; no available cached forecast returns 503. Failed refreshes preserve the old record; policy expires it after three hours or a provider issue age of 24 hours. This request does not change the safety clock. Snapshots include `weatherScreenings`; national additions also load automatically in the background. Decisions use the next 24 hours of available screening as a partial heat/wind risk score, with independent hazards retained. These records are separate from custom-model `forecasts`.

`GET /api/weather/atlas` returns `{ source: "Open-Meteo", points: WeatherPoint[], unavailable: string[] }` for fifty named US sample locations. Partial results remain usable; no available points returns HTTP 503 with an error. `GET /api/weather/point?latitude=39.74&longitude=-104.99` returns that coordinate's `WeatherPoint`. Coordinates must be finite and within the US atlas bounds; invalid queries return 400. Provider failure without cached data returns 503.

Each point contains `current.time`, `fetchedAt`, current values, and 73 hourly forecast records. Temperatures are Fahrenheit, wind is mph, clouds are percent, and precipitation is equivalent mm/h. Current precipitation is converted from the provider's accumulation interval to an hourly rate. Missing variables stay null. Current conditions are model estimates, not sensor observations. Coordinates are cached to three decimals for fifteen minutes in a bounded server cache; identical pending requests share work. After a refresh failure, expired cached results include `stale: true` and an error. The browser preserves its last national snapshot with stale labels when offline.

This visualization uses actual system/provider time independently of the demo clock and site hazard index. It does not change safety decisions, the frozen ML models' forecasts, or existing holds. Read the [provider documentation](https://open-meteo.com/en/docs) and [free-tier terms](https://open-meteo.com/en/terms). Attribution appears in the map inspector.
