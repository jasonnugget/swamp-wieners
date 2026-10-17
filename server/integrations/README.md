# External service adapters

| File | Service | Returned application data |
| --- | --- | --- |
| `feeds.ts` | Open-Meteo Previous Runs API | Next-day forecast with frozen-model predictions and source timestamps |
| `feeds.ts` | NWS active alerts | Site-linked official weather, flood, heat, and fire-weather alerts |
| `jev.ts` | TypeSafe System One API | Typed report category/task suggestions or an explicit unavailable result |

Keep external response handling, timeouts, and conversions here. Scheduling, persistence, and SSE belong in `server/index.ts`; task policy belongs in `shared/policy.ts`.

Weather uses fixed 48-hour-lead GFS features, including estimated antecedent rainfall. NWS fire-weather alerts do not establish a confirmed nearby wildfire. This application has no live lightning detector.

Jev reads `TYPESAFE_API_KEY` only on the server and calls `https://api.typesafe.ai/v1/systemone`. Missing access or failed calls leave manual reporting functional. Return suggestions with model and uncertainty fields; do not clear holds or generate briefing prose here. Confirm the official request/response contract when changing this adapter.

The root [data context](../../docs/data-and-policies.md) records provider limits. Run `npm run build` and relevant tests after adapter changes; distinguish stubbed behavior from a verified live request.
