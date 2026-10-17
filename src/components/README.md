# Shared visual components

| File | Purpose |
| --- | --- |
| `SiteMap.tsx` | MapLibre map, plant risk markers, report pins, and draft-pin selection |
| `ForecastChart.tsx` | Model median, uncertainty band, baseline, and optional reanalysis outcomes |
| `WorkWindows.tsx` | Task-specific model screening windows from shared calculations |

These components accept data and callbacks through props. They do not fetch snapshots, persist reports, call Jev, or change operational policy.

The map uses bundled state outlines and an explicitly imported MapLibre worker URL. Preserve worker packaging and avoid introducing a required external tile service into the offline demo. Forecast charts keep baseline and outcome lines distinguishable. Work windows are screening views; independent holds and unknown coverage still apply.

Run `npm run build` and the [browser tests](../../tests/e2e/README.md) after map or rendering changes. Window calculations are covered under `tests/unit/`.
