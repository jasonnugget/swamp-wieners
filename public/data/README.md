# Bundled historical data

| File | Contents and consumer |
| --- | --- |
| `sites.json` | National EIA plant catalog, coordinates, utility, timezone, historical coverage, and screening flags |
| `forecasts.json` | Site-keyed local-day forecasts with quantiles, weather features, and replay outcomes |
| `samples.json` | Site-keyed capped historical partitions for browser calibration and evaluation |
| `scenario.json` | Demo clock start, forecast date, and hero plant ID |
| `provenance.json` | Source references, coverage, feature interpretation, and limitations |
| `states.geojson` | Bundled state outlines used by the offline map |

`prepare_data.py` writes sites/provenance; `train.py` writes forecasts/samples/scenario. Keep these exports aligned with `../models/bundle.json`. The GeoJSON is a separately sourced static map asset; its source is recorded in provenance.

Heat values are Fahrenheit; input temperature is Celsius, rainfall millimeters, wind km/h, and soil moisture m³/m³. Timestamps describe valid time and nominal forecast issuance. Sample partitions must remain disjoint in time. Forecast replay outcomes exist for inspection, not as inference inputs.

Do not hand-edit values to improve a score or stage a result. Rebuild through [the pipeline](../../scripts/README.md) and run `npm test`. Read [data limitations](../../docs/data-and-policies.md) before treating these modeled values as field measurements.

The national visualization uses `us-states.geojson`, containing all fifty state outlines from [PublicaMundi's US states dataset](https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json), retaining state names and geometry. `weather-stations.json` contains fifty named query coordinates for the compatibility weather API, one per state; the supervisor atlas uses the EIA plant catalog instead. These are sample locations, not physical weather stations or additional utility plants. They are separate from EIA and model training data. Live readings come from the server and are never written into historical exports.

The plant catalog now contains 285 real operating EIA plants across all fifty states, with at least five per state. `model-sites.json` preserves the original fifty-site historical cohort exactly; `sites.json` adds 235 `catalogOnly` plants without bundled safety forecasts or historical ML validation. `site-catalog.json` records the source, selection method, and cohort IDs. Run `npm run data:catalog` to rebuild the expansion from the cached EIA workbook. Existing IDs and report links remain valid.
