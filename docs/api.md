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
