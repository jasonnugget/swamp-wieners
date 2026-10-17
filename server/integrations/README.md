# External service adapters

Adapters collect and validate evidence; they do not calculate the final site-risk index. Scheduling and persistence belong in [pipeline](../pipeline/README.md), engine lifecycle and routes in `server/index.ts`, and numerical scoring/policy in `shared/`.

| File | Source and responsibility |
| --- | --- |
| `open-meteo.ts` | Batched current/hourly model estimates: weather, soil moisture, rolling-rain inputs and CAPE |
| `atlas-weather.ts` | Compatibility re-export of the shared Open-Meteo provider |
| `nws.ts` | Official watches, warnings and advisories with exact event names; shared five-minute cache |
| `nws-screening.ts` | NOAA point/hourly and marine grid forecasts; deterministic heat-index/wind fallback |
| `usgs-water.ts` | Cached nearby-gauge associations, stage, trend and rolling abnormality percentile |
| `floodplain.ts` | FEMA NFHL point exposure or validated, reviewed local static records |
| `firms.ts` | Geographic NASA FIRMS thermal detections; unavailable without `FIRMS_MAP_KEY` |
| `wildlife.ts` | Filtered recent public iNaturalist sightings with low-confidence contextual relevance |
| `lightning.ts` | Swappable detector interface, unavailable default, explicitly recorded/live or demo events |
| `provider.ts` | Typed results, persistent cache, in-flight deduplication, HTTP pacing/timeouts/backoff |
| `feeds.ts` | Fixed-48-hour-lead model feature collection; official-alert compatibility re-export |
| `jev.ts` | Validated semantic crew classification or an explicit unavailable result |

## Environmental collection

Open-Meteo supplies current estimates plus 168 past hours and 73 forecast hours. Temperature is Fahrenheit, wind mph, and rain millimeters; current accumulation intervals are converted to equivalent hourly rates. Humidity, gusts, soil moisture and CAPE are requested consistently for all sites. These are gridded model estimates, not field instruments. Operational normalization checks completeness and freshness before computing rolling rainfall.

The coordinate cache holds up to 1,000 entries for fifteen minutes, deduplicates pending batches and preserves timestamps on stale fallback. HTTP 429 establishes a shared cooldown; `Retry-After` is bounded to one minute through one hour, with a fifteen-minute default. Persistent failed collections remain stale/unknown in scoring. The compatibility weather API still serves fifty sample coordinates; the supervisor map uses `/api/risk/atlas` and never calls those weather routes.

NWS official alerts are separate from continuous weather variables. `nws-screening.ts` resolves grids, converts supported units and preserves issue/fetch/valid times. Marine locations use raw grid duration intervals. These deterministic screenings are not custom-model quantiles. Canonical normalization uses only a fresh matching hour to fill missing heat/wind; replay/forecast-period adapters retain their own selected windows.

USGS, FEMA, FIRMS and wildlife return typed provider evidence with source, mode, confidence, timestamps and status. Missing, failed or expired evidence stays null. A nearby gauge does not verify watershed connectivity; static floodplain exposure does not establish current flooding; a thermal anomaly is not a verified wildfire. Public sightings cannot release crew holds or establish zero wildlife probability. Forecast lightning potential never establishes a detected strike.

See [provider setup, field mappings, TTLs and verified live checks](../../docs/environment-providers.md). Open-Meteo's [documentation](https://open-meteo.com/en/docs) and [terms](https://open-meteo.com/en/terms) describe its free noncommercial endpoint and attribution requirements. Credentials stay server-side.

## Frozen-model features and JEV

`feeds.ts` retains the fixed-lead GFS feature path used by frozen HeatCast/GroundCast. It does not substitute current atlas inputs into a model trained on 48-hour-lead features. Historical exports, preprocessing and evaluation remain unchanged.

JEV reads `TYPESAFE_API_KEY` and optional `JEV_MODEL` on the server and calls `https://api.typesafe.ai/v1/systemone`. It asks fixed Choice questions for category, semantic severity, immediacy and every affected task, validates required answers/confidence, and preserves the crew description as summary. It never returns a freely chosen site-risk number. Explicit confirmation activates deterministic semantic mapping and can add controls; existing crew-selected holds survive. Missing access and provider errors leave manual reporting functional.

Adapter changes need `npm test`, `npm run build` and relevant browser workflows. Mocked HTTP proves parsing/failure behavior, not authenticated live connectivity. See [scoring semantics](../../docs/risk-scoring.md), [model methodology](../../docs/models.md) and the [official JEV response contract](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/types.ts).
