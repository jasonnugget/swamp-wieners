# Bundled historical data

| File | Contents and consumer |
| --- | --- |
| `sites.json` | Fifty EIA plants, coordinates, utility, timezone, held-out flags, and screening flags |
| `forecasts.json` | Site-keyed local-day forecasts with quantiles, weather features, and replay outcomes |
| `samples.json` | Site-keyed capped historical partitions for browser calibration and evaluation |
| `scenario.json` | Demo clock start, forecast date, and hero plant ID |
| `provenance.json` | Source references, coverage, feature interpretation, and limitations |
| `states.geojson` | Bundled state outlines used by the offline map |

`prepare_data.py` writes sites/provenance; `train.py` writes forecasts/samples/scenario. Keep these exports aligned with `../models/bundle.json`. The GeoJSON is a separately sourced static map asset; its source is recorded in provenance.

Heat values are Fahrenheit; input temperature is Celsius, rainfall millimeters, wind km/h, and soil moisture m³/m³. Timestamps describe valid time and nominal forecast issuance. Sample partitions must remain disjoint in time. Forecast replay outcomes exist for inspection, not as inference inputs.

Do not hand-edit values to improve a score or stage a result. Rebuild through [the pipeline](../../scripts/README.md) and run `npm test`. Read [data limitations](../../docs/data-and-policies.md) before treating these modeled values as field measurements.
