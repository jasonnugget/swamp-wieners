# Data, policies, and limits

- **Locations:** [EIA-860M August 2026 operating inventory](https://www.eia.gov/electricity/data/eia860m/), deduplicated by plant ID. The national catalog has 285 plants across 50 states. The original model cohort remains 35 FL, 8 LA, 7 MS. These are actual plant locations used as demonstration job sites, not claimed active construction projects.
- **Forecasts:** [Open-Meteo Previous Runs API](https://open-meteo.com/en/docs/previous-runs-api), GFS at fixed 48-hour lead. A sample's lead time is recorded explicitly. This is a forecast-correction experiment, not a replacement weather prediction system.
- **Targets:** [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api), ERA5-Land; Stock Island uses ERA5 because its coastal ERA5-Land cell has no data. Reanalysis is modeled gridded environmental information, not on-site measurement.
- **Official alerts:** [NWS](https://www.weather.gov/documentation/services-web-alerts). Fire-weather alerts are distinguished from confirmed wildfire. NWS does not supply live strike detections here.
- **Map outlines:** [PublicaMundi US states GeoJSON](https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json), bundled for offline use.
- **Lightning:** a swappable provider with explicit unavailable, recorded-live and demo modes. No licensed live network is configured by default; forecast potential never counts as a detected strike.
- **Wildlife:** crew sightings plus sparse, filtered iNaturalist public context; no automated wildlife probability claim.
- **HazardCast labels** (training and evaluation only, never features):
  - [NOAA Storm Events](https://www.ncdc.noaa.gov/stormevents/) 2024 to June 2026.
  - [IEM](https://mesonet.agron.iastate.edu/) archives of NWS warnings, plus ASOS station gusts and temperatures.
  - [NOAA Tides & Currents](https://tidesandcurrents.noaa.gov/) high water against minor flood levels.
  - [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) fire detections through 2025.
- **HazardCast plant traits:** [FEMA NFHL](https://hazards.fema.gov/femaportal/wps/portal/NFHLWMS) zones and the [USACE National Levee Database](https://levees.sec.usace.army.mil/).
- **HazardCast validation only:** [OSHA severe injury reports](https://www.osha.gov/severe-injury-reports) and NOAA SWDI NEXRAD storm cells.
- **What labels mean:** official or observed hazard evidence near a plant, not confirmed on-site conditions or injuries. See [HazardCast](models.md#hazardcast-learned-next-day-hazards-and-site-index).
- **Flood screening:** legacy corridor replay screens plus USGS nearby-stage proxies, FEMA mapped exposure and official NWS alerts in the live pipeline. Legacy corridor flags do not establish flood exposure. FEMA supplies mapped static membership where available; nearest-gauge association does not verify hydrologic connectivity or predict inundation.

Policy `continuous-policy-5` uses shared continuous channel scores under `continuous-risk-5`. The site index is learned (OverallCast) where HazardCast covers the plant, and dominant-plus-compounding aggregation otherwise. Any environmental or learned channel score of 9 or more holds that channel's field tasks. Heat, wind, soil percentiles, flood factors/alert floors, lightning forecast/detection, wildfire and wildlife have separate deterministic screens. Crew evidence is classified semantically; ordinary reports no longer force severity 10. Numerical risk remains independent of crew-selected holds, official alert controls and the ten-mile/thirty-minute lightning rule. See [complete thresholds and formulas](risk-scoring.md).

NOAA hourly forecasts retain their freshness checks and explicit source labels. Marine plants use raw forecast grid intervals when land hourly products are unavailable. Model forecasts, current estimates and historical replay remain distinguishable. Real-clock briefings select the next local day's available periods. No chronological split, held-out exclusion, training preprocessing or frozen-model evaluation changed.

These are prototype screening policies. Heat index does not capture the full effects of direct sun, workload, clothing, or acclimatization. Soil moisture does not establish bearing capacity or predict truck immobilization. The UI preserves source mode, uncertainty, unknown coverage, and evidence so supervisors can review each decision.

The offline mode caches assets and the last server snapshot. Reports cannot sync without the server; a failed report submission preserves its description. Photos and other form fields are not automatically queued offline. Browser training and inference continue with previously cached data. Live alerts, Jev calls, and server scheduling are not claimed to run in a disconnected browser.

## Artifact ownership

Read [public/data](../public/data/README.md) for bundled artifact shapes and [data](../data/README.md) for local training intermediates. Source provenance is bundled in [provenance.json](../public/data/provenance.json). Workspace contracts are in [types.ts](../shared/types.ts), canonical observations/snapshots in [risk.ts](../shared/risk.ts), source metadata in [providers.ts](../shared/providers.ts), and map frames in [atlas.ts](../shared/atlas.ts).

## Live normalized policy

All 285 plants use the same collection and scoring pipeline. Live snapshots expose versioned scoring, structured drivers, field coverage and confidence, plus independent task overrides. Replay and newly generated briefings use the same numerical formulas over their own periods. Existing stored briefings retain their original policy version. See [the pipeline](environment-pipeline.md).

See [environmental providers](environment-providers.md) for source modes, freshness, credentials and limitations. USGS rolling relative stage is not a long-term flood probability; FEMA exposure is not current inundation; FIRMS thermal anomalies are not confirmed wildfire perimeters.

The supervisor map and priority list consume canonical current risk; raw and risk layers select fields from the same frame. The 72-hour slider asks the backend for one national forecast frame. Unknown future detections are not filled with current readings, and projected task states are not work authorization. See [atlas contracts](api.md#authoritative-supervisor-atlas).
