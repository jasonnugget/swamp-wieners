# External service adapters

| File | Service | Returned application data |
| --- | --- | --- |
| `feeds.ts` | Open-Meteo Previous Runs API | Next-day forecast with frozen-model predictions and source timestamps |
| `feeds.ts` | NWS active alerts | Site-linked official weather, flood, heat, and fire-weather alerts |
| `nws-screening.ts` | NWS point lookup and hourly forecasts | Deterministic heat-index and wind screening for plants without custom model coverage |
| `jev.ts` | TypeSafe System One API | Typed report category/task suggestions or an explicit unavailable result |

Keep external response handling, timeouts, and conversions here. Scheduling, persistence, and SSE belong in `server/index.ts`; task policy belongs in `shared/policy.ts`.

Weather uses fixed 48-hour-lead GFS features, including estimated antecedent rainfall. NWS fire-weather alerts do not establish a confirmed nearby wildfire. This application has no live lightning detector.

Jev reads `TYPESAFE_API_KEY` only on the server and calls `https://api.typesafe.ai/v1/systemone`. Missing access or failed calls leave manual reporting functional. Return suggestions with model and uncertainty fields; do not clear holds or generate briefing prose here. Confirm the official request/response contract when changing this adapter.

The root [data context](../../docs/data-and-policies.md) records provider limits. Run `npm run build` and relevant tests after adapter changes; distinguish stubbed behavior from a verified live request.

`atlas-weather.ts` uses the Open-Meteo Forecast API for the visualization, separately from the fixed-lead safety feed. It returns current model estimates and 73 hourly records, requests Fahrenheit and mph, converts current accumulation intervals to equivalent precipitation rates in mm/h, and preserves missing values as null. Fifty overview coordinates are loaded in five parallel batches of ten. A bounded coordinate cache lasts fifteen minutes and shares identical pending batches; expired results returned after a refresh failure remain explicitly stale. This cache is in memory and does not alter historical exports.

Current estimates come from 15-minute model data, not field instruments. The free noncommercial endpoint requires no key and requires attribution. Read the [provider documentation](https://open-meteo.com/en/docs) and [terms](https://open-meteo.com/en/terms) before changing usage or deploying commercially. The inspector links to the provider.

`nws-screening.ts` resolves each plant's NOAA forecast grid and requests hourly forecasts with an identifying User-Agent, without credentials. Fahrenheit/Celsius temperatures and humidity feed the existing NOAA heat-index calculation; wind ranges use their upper speed converted to km/h. Missing values remain null. Provider issue time, fetch time and source URL are preserved. These are deterministic forecasts, not HeatCast/GroundCast predictions or quantile intervals.

For marine coordinates, it reads the official raw grid instead of land hourly forecasts. ISO duration intervals are sampled only where they cover each hour; missing intervals and unsupported units stay null. Live checks confirmed this path for Vineyard Wind 1 and Block Island Wind Farm.
