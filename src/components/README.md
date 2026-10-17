# Shared visual components

| File | Purpose |
| --- | --- |
| `SiteMap.tsx` | Three.js regional view, risk beacons, showcase controls, and report pinning |
| `ForecastChart.tsx` | Model median, uncertainty band, baseline, and optional reanalysis outcomes |
| `WorkWindows.tsx` | Task-specific model screening windows from shared calculations |

These components accept data and callbacks through props. They do not fetch snapshots, persist reports, call Jev, or change operational policy.

The map uses bundled state outlines with schematic Three.js extrusion and risk-height beacons. [Map internals](site-map/README.md) cover the scene, reversible projection, and flat fallback. Keep site selection, report pinning, and the offline view functional; avoid required external tiles. Forecast charts keep baseline and outcome lines distinguishable. Work windows are screening views; independent holds and unknown coverage still apply.

Run `npm run build` and the [browser tests](../../tests/e2e/README.md) after map or rendering changes. Window calculations are covered under `tests/unit/`.
