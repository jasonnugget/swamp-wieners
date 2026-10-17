# Verified environmental data sources

The endpoint research below was recorded on October 17, 2026. It is historical verification evidence, not a list of currently connected adapters. All 285 sites now use one normalized provider/scoring pipeline and the supervisor reads canonical risk frames. The fifty-site model cohort and its validation remain unchanged.

## Current integration status

| Source | Application status |
| --- | --- |
| Open-Meteo Forecast API | Shared batched weather/soil/CAPE provider for canonical current and projected frames |
| NWS | Connected official alerts and deterministic hourly/marine-grid fallback; separate from the fixed-lead model feed |
| USGS OGC API | Connected nearby-stage/trend/rolling-abnormality adapter with cached associations |
| FEMA NFHL | Connected static point exposure, with an optional reviewed local-file strategy |
| iNaturalist | Connected sparse public context; crew reports remain primary operational authority |
| NASA FIRMS | Live keyless US/Alaska regional CSV downloads verified; optional authenticated area API requires MAP_KEY and remains unverified |
| Lightning | Swappable unavailable/recorded/demo interface; no licensed live network configured |
| NOAA NWPS | Connected keyless water-gauge fallback with verified local gauge/observed-series requests |
| NIFC WFIGS | Researched endpoint only; not a connected operational provider |

Later implementation checks reached USGS, FEMA, NWS and iNaturalist at a Louisiana catalog site. These checks are described in [environmental providers](environment-providers.md); they are distinct from the archived request hashes below. They do not establish national suitability or complete hazard detection.

[Live verification evidence](source-verification.json) records 16 successful HTTP requests with request URLs, check times, full-response SHA-256 hashes, and response excerpts. Forecast requests were tested at five actual catalog plants in FL, MS, CA, AK, and HI. This is a sample check, not an audit of all 285 locations. Excerpts are historical snapshots and must not be loaded as current readings.

## Sources evaluated in the original endpoint audit

| Data | Official source and access | Appropriate map use | Important limits |
| --- | --- | --- | --- |
| Plant locations | [EIA-860M](https://www.eia.gov/electricity/data/eia860m/), downloadable workbook | Existing 285-plant catalog, coordinates and plant identity | August 2026 is the latest workbook listed at this check. Monthly capacities are preliminary. Plant coordinates are not surveyed construction boundaries. |
| Hourly forecasts | [NOAA/NWS API](https://www.weather.gov/documentation/services-web-api), free, no API key currently; send an identifying User-Agent | Temperature, humidity, wind, rain probability and forecast timeline | Forecasts are approximately 2.5 km grid products. Probability of precipitation is not rainfall amount. Use raw grid data for quantitative precipitation. |
| Weather observations | NWS point response links to nearby observation stations | Station readings with station name, distance and observation time | A nearby station is not an on-site instrument. Keep null readings missing; station coverage and update times vary. Observation endpoints were not tested in this audit. |
| Official warnings | [NWS alerts](https://www.weather.gov/documentation/services-web-alerts), free | Warning areas and site-specific alert details | Preserve issue, onset, expiry, severity and instructions. Some alerts use zones instead of polygon geometry. An empty response means no matching active warning, not safe conditions. |
| River stage and forecast | [NOAA National Water Prediction Service](https://api.water.noaa.gov/about/api), public JSON | Observed and forecast hydrographs with gauge flood thresholds | Match the river reach or watershed before associating a gauge with a plant. Gauge height is relative to its datum, not water depth at the plant. |
| River sensor readings | [USGS Water Data APIs](https://api.waterdata.usgs.gov/docs/), tested without a key | Recent stage and flow, sensor locations, observation history | Preserve approval status; the tested reading is provisional. USGS observations are not a forecast. |
| Reported wildfires | [NIFC WFIGS](https://data-nifc.opendata.arcgis.com/pages/d6ef1367fadc4405b5f09c98e52ed972), public ArcGIS REST | Incident points, names, containment and update time | Reports can lag. Points do not describe the burning boundary. Check modification time, fire-out fields and incident category. Prescribed burns have a separate category. |

## Tested endpoints

For each plant, resolve its coordinates through `/points` rather than hardcoding a forecast grid forever:

```text
GET https://api.weather.gov/points/25.4356,-80.3308
GET https://api.weather.gov/gridpoints/MFL/106,35/forecast/hourly
GET https://api.weather.gov/alerts/active?point=25.4356,-80.3308
```

The point response supplies `forecastHourly`, `forecastGridData`, and `observationStations`. NOAA recommends periodically refreshing grid mappings. Coastal marine locations may require raw grid forecasts. All five tested hourly endpoints returned 156 periods; inspect each response's actual coverage rather than promising a fixed number.

| Catalog plant | State | EIA ID | Verified hourly grid |
| --- | --- | --- | --- |
| Turkey Point | FL | 621 | MFL/106,35 |
| Attala | MS | 55220 | JAN/93,95 |
| Diablo Canyon | CA | 6099 | LOX/70,113 |
| Fairbanks | AK | 6286 | AFG/492,120 |
| Auwahi Wind Energy Hybrid | HI | 57996 | HFO/219,113 |

River endpoints tested at Baton Rouge:

```text
GET https://api.water.noaa.gov/nwps/v1/gauges/BTRL1
GET https://api.water.noaa.gov/nwps/v1/gauges/BTRL1/stageflow
GET https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items?f=json&monitoring_location_id=USGS-07374000&parameter_code=00065&limit=5
```

USGS returned stage **11.83 ft at 06:15 UTC**, marked **Provisional**. NWPS returned **11.64 ft at 06:00 UTC** on the same date. These have different observation times. NWPS flow contained missing-value sentinels `-999` and `-9999`; neither is a real flow reading. Filter forecast records by valid time before drawing a future curve.

NIFC service and example query:

```text
GET https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0?f=json
GET https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query?f=json&where=IncidentTypeCategory%3D%27WF%27&outFields=IncidentName,IncidentTypeCategory,ModifiedOnDateTime_dt,FireOutDateTime,ActiveFireCandidate,PercentContained,POOState&returnGeometry=true&outSR=4326&resultRecordCount=2
```

The query returned real incident coordinates in Texas and California. `ModifiedOnDateTime_dt` is the actual modification field in this service; `ModifiedOnDateTime` was omitted from results. ArcGIS may return HTTP 200 with a JSON error, so check both. The sample deliberately limits results to two and returns `exceededTransferLimit: true`; production ingestion needs pagination and coverage checks. Never interpret these two incidents as the national total.

## Useful sources that need more work

| Layer | Source | Remaining work |
| --- | --- | --- |
| Animated observed rain | [NOAA radar OGC services](https://opengeo.ncep.noaa.gov/) linked by the NWS API documentation | Inspect capabilities, layer geography, frame times and browser texture loading. This audit checked the documentation, not working radar tiles. Radar reflects observed conditions; it is separate from future rain forecasts. |
| Satellite soil moisture | [NASA SMAP SPL3SMP_E version 6](https://nsidc.org/data/spl3smp_e/versions/6), daily 9 km product | Earthdata access, quality flags and spatial sampling. Documentation checked; no authenticated download tested. Grid soil moisture does not establish equipment bearing capacity at a construction site. |
| Satellite fire detections | [NASA FIRMS area API](https://firms.modaps.eosdis.nasa.gov/api/area/) | The adapter handles CSV, quality filters, age and distance, with verified keyless US regional downloads. MAP_KEY is needed only for the optional authenticated area API; no authenticated query was verified. A thermal anomaly is not a confirmed wildfire. |
| Lightning awareness | [NOAA GOES GLM](https://www.nesdis.noaa.gov/our-satellites/currently-flying/goes-east-west/geostationary-lightning-mapper-glm?page=1) | Satellite product ingestion, latency and coverage checks. GLM measures total lightning, including in-cloud flashes. Do not describe it as verified cloud-to-ground strike locations or assume coverage of all Alaska. Documentation checked; no product ingestion tested. |

## Integration boundaries

The supervisor atlas reads `/api/risk/atlas`, not these providers directly. Current source evidence is normalized before shared deterministic scoring. The slider selects backend-scored forecast frames, with future detections left unknown. Compatibility weather endpoints remain available without a map consumer.

USGS is connected. NWPS forecast hydrographs and NIFC incident enrichment remain optional future work, not dependencies of the implemented pipeline. Keep source timestamps, units, freshness and provenance on every record. An old successful request proves connectivity only at its recorded time. Do not replay archived excerpts as live data.

Heat index may be calculated from official forecast temperature and humidity using a documented method and labeled as a derived forecast. Do not fabricate quantile uncertainty by copying a deterministic forecast into the custom model's three quantile slots. Recalibration and held-out evaluation are needed before claiming national custom-model performance.

Retain crew reports for wildlife and local ground hazards. Independent lightning, wildlife and access-road holds must survive provider changes, lower forecasts and missing data.
