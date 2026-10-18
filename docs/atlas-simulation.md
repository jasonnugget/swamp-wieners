# Atlas scenarios: research and limits

Research date: October 17, 2026. The atlas scenario lab computes hypothetical wind, rainfall, and cumulative rainfall excess for real plant coordinates. Its browser-local calculations are separate from operational forecasts and task decisions. This document records the implemented equations and their limits; it does not establish meteorological or hydraulic validation.

## Challenge context

The [Sperry Tech SwampHacks brief](https://sperrytech.ai/events/swamphacks) requests at least 50 real plant locations, seven environmental hazard channels, a ranked supervisor map, and a historically trained 0 to 10 hazard index. It also calls for a restarting 30-minute hold after lightning within 10 miles, next-day briefings at 6 PM local time, and persistent crew photos and map pins. Its own animated storm is labeled illustrative, with geographically scaled lightning boundaries.

Hurricane scenarios extend the planning view. They do not replace the brief's reporting, alerts, historical modeling, or independent task controls. The brief's ambition to anticipate hazards does not establish that every hazard is observable or predictable; Threshold retains unknown evidence.

## Primary-source findings

| Evidence | Implication for the interface and model |
| --- | --- |
| [NHC hurricane wind scale](https://www.nhc.noaa.gov/aboutsshws.php?lv=true) classifies maximum sustained wind. Category thresholds in mph are 74, 96, 111, 130, and 157. | Category describes the scenario's peak sustained wind. Keep it separate from gust readings, local wind exposure, rainfall, and flood severity. |
| [NHC hurricane hazards](https://www.nhc.noaa.gov/prepare/hazards.php) explains that rainfall depends on storm speed, size, and geography rather than simply cyclone strength. | Rain intensity, footprint, and duration need their own assumptions. Do not assign rainfall totals from category alone. |
| [NHC storm surge overview](https://www.nhc.noaa.gov/surge/) describes the roles of storm motion, size, coastal shape, and bathymetry. | A circular flood patch or rising water plane cannot represent a computed coastal storm surge. |
| [NHC potential surge products](https://www.nhc.noaa.gov/surge/products.php) use an ensemble of SLOSH simulations around the official forecast. The [inundation example](https://www.nhc.noaa.gov/surge/inundation/interactive_example/) distinguishes its hypothetical data from current forecasts and excludes rainfall flooding. | Keep an illustrative flood scenario distinct from NHC surge products and inland rainfall flooding. Do not invent exceedance probabilities. |
| [NHC's forecast cone definition](https://www.nhc.noaa.gov/aboutcone.shtml) concerns uncertainty in the cyclone center's track. [NHC training material](https://www.nhc.noaa.gov/outreach/presentations/K0311_Student_Manual_2025.pdf) explains that hazards can extend outside it. | An adjustable corridor is a scenario path envelope, not an official forecast cone or a boundary of hazardous conditions. |
| [NWS flash-flood guidance](https://www.weather.gov/lmk/flash-flood101) identifies terrain, preceding soil/stream conditions, and storm movement as relevant factors. | Rainfall accumulation alone does not determine water depth, runoff, road access, or ground-bearing capacity. |
| [USGS inundation mapping](https://www.usgs.gov/mission-areas/water-resources/science/flood-inundation-mapping-science) combines modeled water surfaces with detailed ground elevation. [USGS gage-height guidance](https://waterdata.usgs.gov/blog/gage_height/) defines stage relative to a station's datum. | Real inundation depth requires compatible elevation data and a water-surface model. Nearby gage height is not site flood depth. |

## Implemented scenario model

[shared/simulation.ts](../shared/simulation.ts) owns the pure calculations. [useSimulation.ts](../src/features/simulation/useSimulation.ts) owns the local controls and playback, while [SimulationControls.tsx](../src/features/simulation/SimulationControls.tsx) presents site exposure and separate current evidence. These equations are custom idealizations, not NOAA models or trained predictions. The sources above establish which hazards must remain distinct; they do not validate the numerical profiles below.

**Tracks and time.** Florida crossing, Gulf landfall, and Inland rain corridor are invented waypoint routes. The center follows great-circle segments at constant speed, calculated from total route length divided by the selected 12 to 72 hour duration. Latitude and longitude offsets can each shift the route by up to five degrees. Distances use a spherical Earth radius of 6,371.0088 km.

The scenario clock spans 0 to 72 hours. Wind and rain stop when the selected track duration ends; the center stays at the last waypoint and accumulated exposure is retained. Maximum intensity remains constant along the route, including over land. There is no modeled weakening, forecast uncertainty, or continuation after the final waypoint. Scrubbing recomputes a frame from its inputs rather than advancing the current evidence clock or depending on animation history.

**Wind and rain fields.** Let `d` be distance from the center, `R` the selected footprint radius, `f = d / R`, `Vmax` the selected sustained wind in mph, and `Q` the selected rain rate in mm/hour. Both instantaneous fields are zero outside `R` and after the track ends. Inside the footprint, hurricane wind uses:

```text
W = Vmax × f / 0.16                                  when 0 ≤ f ≤ 0.16
W = Vmax × (0.16 / f)^0.7 × [1 - ((f - 0.16)/0.84)^2] when 0.16 < f < 1
```

The peak lies at an assumed eyewall radius of `0.16 × R`. The rainfall-only preset instead uses `W = Vmax × (1 - f)^2`. All presets use the independent rain profile `r = Q × (1 - f²)^2`. The configurable radius is 40 to 400 km; wind is bounded to 0 to 200 mph and rain to 0 to 80 mm/hour. These bounds are interface limits, not climatological estimates. The fields omit gusts, directional asymmetry, buildings, terrain, and soil conditions.

**Accumulation.** Each plant is sampled at fixed quarter-hour interval midpoints. A partially elapsed final interval uses the same midpoint with only its elapsed time as the weight. The calculation ends at the earlier of the selected time or track completion:

```text
Total rain (mm)        = sum(local rain rate × elapsed hours)
Rainfall excess (mm)   = sum(max(0, local rain rate - drainage rate) × elapsed hours)
Wind exposure (mph h) = sum(local wind × elapsed hours)
```

Drainage is a uniform, user-selected removal assumption from 0 to 50 mm/hour. Rainfall excess is cumulative excess generated during the scenario. It is not water currently stored on the ground: the calculation has no storage, later drainage, river routing, flood footprint, or inundation depth. After the storm ends, totals remain fixed. Wind exposure is an integrated scenario quantity, not a damage metric.

Peak wind is calculated separately over the continuously traveled route. For each great-circle segment, the engine finds the closest and farthest center-to-site distances and checks whether that range crosses the assumed eyewall. This avoids losing a peak between time samples. It is the maximum of the idealized wind profile along the elapsed route, not a claim about actual local wind.

**Comparison filters.** The site list uses peak wind of at least 39 mph, total rain of at least 25 mm, or rainfall excess of at least 25 mm, according to the selected layer. The 25 mm values are comparison filters chosen for the interface, not official flood or work thresholds. Summed installed capacity describes assets at those sites and does not estimate generation loss. Exported JSON includes scenario inputs, per-site values, and limitations.

## Simulated risk per timeline step

`shared/simulate-risk.ts` translates each frame into the numbers a supervisor acts on. For every plant it clones the current `SiteObservationV1` and lays the scenario over it:

- Wind becomes the larger of today's and the scenario's, with gusts set to wind × 1.3.
- The scenario's rain rate is added to the 1 h total.
- The new trailing-window rain (`rainLast24hMm`) is added to the 24 h total.
- Accumulated rain is added to the 7 d total.
- Heavy rain sets WMO code 65 or 82.

It then re-runs the same `scoreChannels` → `channelDecisions` → `applyPolicyLimits` → `decide` path that the server uses. From that it reports a rule-based composite, the channel scores, the task states, and the change against today's rule composite.

Weather, flood and fire-weather channels take the higher of the simulated and current score. Every other channel keeps current evidence. Current task holds carry through. A scenario can therefore only add hazard, and it never clears a hold.

The result is labelled `SIMULATED`. It is held in component state, included in the JSON export, and never merged into `siteRisks`, decisions or briefings. The learned OverallCast index is not applied to hypothetical weather.

## Evidence and presentation boundaries

- Scenario controls, elapsed time, assumptions, and derived exposures carry hypothetical/simulated labels. None of the presets represents a loaded historical hurricane or an official forecast.
- Canonical current readings, forecast frames, crew reports, and simulated quantities remain in separate state and contracts. Scenarios do not write provider records, alter training data, create real alerts, or enter stored safety briefings.
- Current and crew holds remain independent. Zero simulated exposure does not mean safe work, and missing current coverage does not become low risk. Scenario exposure is not the operational hazard index.
- Plant colors retain canonical evidence. Separate rings show scenario intensity: instantaneous wind or rain in those layers, and cumulative rainfall excess in the excess layer. Ring size is schematic and does not delimit flooded land. The moving outer footprint has a geographic radius; cloud height, state extrusion, and beacon height do not represent terrain or water elevation.
- Decorative particles and vortex movement do not supply numerical evidence. Playback can be paused and is disabled under reduced-motion preferences; manual time inspection remains available. No physical damage, outage, restoration, or storm-surge estimate is produced.

## Research access

The challenge page was read in local Chrome after the web text reader failed to load its client-rendered route. Its rendered text and public application bundle agreed. NOAA/NHC and USGS findings above were checked through their official indexed pages; some direct fetches returned access errors. No hurricane calibration, hydraulic validation, or field-performance evidence is claimed by this research.

## Browser captures

These screenshots use a separate local API with external collection disabled and the bundled real plant catalog. Current missing evidence stays unknown. Storm tracks, weather and exposures are explicitly hypothetical. Reduced motion is enabled for stable captures; phone screenshots use Chrome emulation, not an iPhone device.

- [Hurricane controls and geographic footprint](assets/atlas-simulation/hurricane-desktop.png)
- [Rainfall-excess exposure and separate current evidence](assets/atlas-simulation/rainfall-exposure.png)
- [Phone map and timeline](assets/atlas-simulation/hurricane-mobile.png)
- [Phone scenario controls](assets/atlas-simulation/controls-mobile.png)

## Implementation verification

Final checks on October 17, 2026:

| Check | Result |
| --- | --- |
| `npm test` | 149 passed, including nine scenario-model checks |
| `npm run test:e2e` | 41 passed in 4.7 minutes, exit 0 |
| TypeScript and production packaging | Passed through the browser suite's build step |
| Scenario regressions | Current beacon/hold separation; no operational writes; drainage comparison/export; phone, keyboard, reduced motion and flat fallback; new holds during atlas failure; offline reload |
| Manual browser review | 320, 390, 768 and 1440px widths; no document overflow or captured page errors |
| Patch whitespace | `git diff --check` passed |

Development checks caught a missing explicit slider-label association, an offline banner covering the mode switch, and lost focus when returning to current evidence. Those were corrected before the final full run. An earlier full-run attempt encountered a connection reset in an unchanged report test; that workflow passed in the final run.

Browser and unit tests verify implementation behavior, not meteorological accuracy, hydraulic validation, live-provider coverage or physical-device GPU performance.
