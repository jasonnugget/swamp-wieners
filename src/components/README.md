# Shared visual components

| File | Purpose |
| --- | --- |
| `FieldSculpture.tsx` | Decorative animated field-line artwork for the homepage; never operational evidence |
| `SiteMap.tsx` | Three.js authoritative risk atlas, environmental layers, showcase controls, and report pinning |
| `ForecastChart.tsx` | Model median, uncertainty band, baseline, and optional reanalysis outcomes |
| `WorkWindows.tsx` | Task-specific model screening windows from shared calculations |

These components accept data and callbacks through props. They do not persist reports, call Jev, or change operational policy. SiteMap uses the shared transport hook for batched canonical frames.

The map uses bundled state outlines with schematic Three.js extrusion and beacons scaled to the selected canonical measurement/risk layer. [Map internals](site-map/README.md) cover the scene, reversible projection, and flat fallback. Keep site selection, report pinning, and the offline view functional; avoid required external tiles. Forecast charts keep baseline and outcome lines distinguishable. Work windows are screening views; independent holds and unknown coverage still apply.

Run `npm run build` and the [browser tests](../../tests/e2e/README.md) after map or rendering changes. Window calculations are covered under `tests/unit/`.
