# Data, policies, and limits

- **Locations:** [EIA-860M August 2026 operating inventory](https://www.eia.gov/electricity/data/eia860m/), deduplicated by plant ID. The national catalog has 285 plants across 50 states. The original model cohort remains 35 FL, 8 LA, 7 MS. These are actual plant locations used as demonstration job sites, not claimed active construction projects.
- **Forecasts:** [Open-Meteo Previous Runs API](https://open-meteo.com/en/docs/previous-runs-api), GFS at fixed 48-hour lead. A sample's lead time is recorded explicitly. This is a forecast-correction experiment, not a replacement weather prediction system.
- **Targets:** [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api), ERA5-Land; Stock Island uses ERA5 because its coastal ERA5-Land cell has no data. Reanalysis is modeled gridded environmental information, not on-site measurement.
- **Official alerts:** [NWS](https://www.weather.gov/documentation/services-web-alerts). Fire-weather alerts are distinguished from confirmed wildfire. NWS does not supply live strike detections here.
- **Map outlines:** [PublicaMundi US states GeoJSON](https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json), bundled for offline use.
- **Lightning:** simulated events through a persistent replay adapter. There is no live lightning provider configured.
- **Wildlife:** crew sightings; no automated wildlife prediction.
- **Flood screening:** four manually selected Mississippi corridor demonstration sites and heavy-rain screening, plus official NWS alerts when connected. The selections do not establish verified river proximity, floodplain membership, or a river-stage forecast.

The index is the maximum of available model, official forecast screening, and active hazard/report severity. Heat severity interpolates 80/90/103/125°F to 0/3/7/10 using the model upper estimate or a separately labeled deterministic NOAA forecast where custom forecasts are unavailable. Soil severity uses training-period 50th/90th/95th moisture percentiles. The 90th percentile requires ground inspection. Crew and lightning holds score 10. Unknown inputs never become zero. Resolving a crew report does not clear another hazard.

Policy `demo-policy-2` adds separate NOAA/NWS heat and wind screening for national catalog plants. It uses future hourly periods over the next 24 hours, expires fetches after three hours and forecast issue times after 24 hours, and keeps the other five hazard channels unknown unless independent evidence exists. Wind uses 30/50 km/h thresholds for severity 3/7. Marine plants use official raw forecast grid intervals because land hourly products are unavailable there. These screenings use system time, including when the original cohort is displayed as a historical replay. They do not fabricate ML quantiles or claim national model validation. Real-clock briefings select the next local day's available periods. See [verified sources](verified-data-sources.md).

These are prototype screening policies. Heat index does not capture the full effects of direct sun, workload, clothing, or acclimatization. Soil moisture does not establish bearing capacity or predict truck immobilization. The UI preserves source mode, uncertainty, unknown coverage, and evidence so supervisors can review each decision.

The offline mode caches assets and the last server snapshot. Reports cannot sync without the server; a failed report submission preserves its description. Photos and other form fields are not automatically queued offline. Browser training and inference continue with previously cached data. Live alerts, Jev calls, and server scheduling are not claimed to run in a disconnected browser.

## Artifact ownership

Read [public/data](../public/data/README.md) for bundled artifact shapes and [data](../data/README.md) for local training intermediates. Source provenance is bundled in [provenance.json](../public/data/provenance.json). Shared contracts are defined in [types.ts](../shared/types.ts).
