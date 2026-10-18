# Site simulation: visual research and proposed art direction

Research date: October 17, 2026. This records the original design proposal and subsequent implementation status. It audits the initial `src/features/site-simulation/scene.ts`, simulator UI and all 34 fields in `OBSERVATION_GROUPS`. Existing source/simulation/policy boundaries continue to apply.

Implementation follow-up: the [Environment Studio](../src/features/site-simulation/README.md) now implements the architectural miniature direction with procedural site templates, material variation, shadows, atmospheric lighting, rain/snow/hail, clouds/fog, wind/gust trails, heat distortion, independent soil layers, a schematic channel/gauge and explicitly labeled fire/lightning demonstrations. Event cards retain unknown locations; source crew wildlife photos are shown separately when present. Static geometry is batched and the underlying atlas pauses while the modal is open. Imported glTF models, volumetric cloud raymarching, real terrain/footprints, measured local airflow and physical hazard solvers remain future work. The recommendations below preserve the original research context.

Production captures: [desktop storm](assets/environment-studio/desktop-storm.png), [phone](assets/environment-studio/mobile.png), [ground cutaway](assets/environment-studio/ground-cutaway.png), [heat study](assets/environment-studio/heat-study.png) and [fire demonstration](assets/environment-studio/fire-demonstration.png). These are labeled hypothetical scenarios with test source fixtures, not site observations.

## Recommended direction

Build an art-directed miniature environmental landscape: an industrial site set into a sculpted terrain tile, photographed from an oblique camera. Use warm concrete, galvanized metal, dark asphalt, muted vegetation and restrained atmospheric color. The site should feel like a carefully built architectural model. Keep measurement overlays crisp and readable above the scene.

This is a design recommendation based on the current product, not a result established by the sources. It suits the mineral/sage interface, remains legible on phones and can make schematic geometry appealing without suggesting surveyed accuracy.

| Direction | Strength | Cost / limitation | Fit |
| --- | --- | --- | --- |
| Architectural miniature | Clear shapes, good framing, consistent weather storytelling | Needs a coherent model/material kit and lighting | Recommended first |
| Photorealistic digital twin | Recognizable real surroundings | Requires georeferenced assets, coverage review, streaming and terrain; photographs do not supply hazard physics | Later, for selected sites |
| Scientific terrain/contour model | Strong spatial explanation and uncertainty display | Less immediately cinematic | Use as an optional evidence lens |

The scene should remain recognizable across conditions. A storm changes illumination, precipitation and surface response; it should not replace the site with a different illustration. A heat scenario should not make concrete glow like lava.

## What currently makes it look basic

- The same box-and-cylinder plant stands in for every facility, regardless of actual facility type. The current `Site` contract does not identify generator technology or carry building footprints.
- The flat rectangular ground has no relief, planting, drainage, surface breakup or fine scale cues.
- Broad hemisphere/directional lighting has no configured shadow rendering or ambient occlusion to anchor objects.
- Heat and moisture both tint the entire ground, so their visual meanings compete.
- Rain is a small set of dots; wind is a translated line group; fire is a cone; wildlife is a set of octahedra; lightning is a fixed zigzag.
- Marker placement is arbitrary. Nearest-event distances do not provide bearings or event coordinates, so those positions cannot be interpreted geographically.
- Most editable fields are context only. Better visual modelling needs a defined role for every input, rather than an effect for every number.
- The form and legend occupy a large share of the modal. Camera, presets and evidence can be arranged around a larger scene.
- The launch button's CSS currently arrives with the lazy simulator module. Before the first launch it can appear as an unstyled browser button, as in the supplied screenshot. Its styles should live with the launcher.

## Foundation before effects

1. Replace the generic block set with an authored, reusable model kit: roof seams, ventilation units, transformer banks, insulators, cable racks, fencing, access roads, gravel beds, drainage channels and vegetation. Choose details appropriate to a deliberately selected illustrative facility template. Do not infer plant technology from name or capacity alone.
2. Add small bevels to visible hard edges, distinct roughness for concrete/asphalt/metal, subtle surface variation and contact shadows. These will improve every scenario. Three.js supports roughness/metalness materials and glTF assets; its GTAO pass adds contact-depth cues with an additional rendering cost. [MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html), [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [GTAOPass](https://threejs.org/docs/pages/GTAOPass.html).
3. Use a controlled key light, soft sky fill and consistent exposure. Lighting presets should be labeled illustrative unless their inputs are sourced. Three.js has a WebGL atmospheric sky addon and separate WebGPU sky support. [Sky](https://threejs.org/docs/pages/Sky.html).
4. Start with a generous oblique view and offer overhead/evidence and ground-detail views. Smooth camera transitions should be optional; reduced motion should use immediate transitions.
5. Give the scene most of the desktop width. Show seven compact hazard controls and expandable advanced fields. Keep a fixed, explicit SIMULATED badge, visible unknown-state labels and access to current operational restrictions.

## Effects and art treatment

| Effect | Proposed appearance | Rendering approach | Evidence boundary |
| --- | --- | --- | --- |
| Heat | Slight near-ground shimmer, a restrained amber analytical overlay and a heat-index callout | Masked noise distortion of a scene render target; overlay rendered separately from surface materials | Heat index is a human heat-stress measure, not a thermal image or measured surface temperature. Shimmer is an illustrative cue, not predicted refraction |
| Wind | Fine flowing trails, a windsock and lightly moving foliage; short gust accents | Recycled particles/instanced ribbons, shader displacement for selected vegetation | Current fields contain speed/gust but no direction or local vector field. Direction must be a labeled scenario control until sourced; no claim of building-resolved airflow |
| Rain | Long, translucent drops, roof-edge runoff and localized ripples; wet asphalt catches sky light | Instanced streaks, pooled splash sprites, animated normal maps and a wetness material layer | One-hour accumulation is not an instantaneous rain rate. Replay/stylization must be labeled; accumulation does not establish puddle depth |
| Clouds / fog | Soft cloud forms, diffused shadows and reduced distant contrast | Sky gradient, noise-driven cloud layers; optional low-resolution volumetric clouds on stronger devices | Use weather-code categories or explicit scenario controls. High humidity alone is not fog or cloud coverage |
| Snow / hail | Recognizable particles distinct from rain, modest illustrative surface dusting | Separate particle presets and material masks | Weather codes can select conditions; current fields do not supply snowpack, accumulation depth or hail size |
| Soil | A cutaway edge revealing surface and root layers; surface roughness/wetness varies separately | Layered ground geometry and a moisture mask; percentile displayed as an analytical scale | Site-average moisture is not a measured spatial map or bearing-capacity calculation. Do not invent dry cracks or muddy vehicle ruts from moisture alone |
| Flood | A clearly readable gauge, rising/falling arrow and blue contextual water feature; optional hypothetical inundation lens | Water normal maps, restrained reflection, shoreline edge treatment; terrain intersection only in an explicitly hypothetical lens | Gauge height/percentile alone cannot locate site flooding. Accurate inundation needs compatible elevation/datum and hydraulic mapping |
| Lightning | A distance indicator, event age and count; a stylized branching bolt only in an explicit storm demonstration | Thin branching geometry, limited glow and optional brief low-intensity illumination | A nearby strike does not mean the plant was struck. Forecast potential remains separate from detections; avoid rapid flashes |
| Fire | An offsite thermal-detection callout in evidence mode; artfully layered flame/smoke only in a demonstration | Animated sprite sheets or procedural flame shaders; soft smoke particles and sparse embers | FIRMS detection/FRP is not a fire perimeter, smoke concentration, flame height or fire-spread forecast |
| Wildlife | Clearly designed sighting symbols, age/severity and counts, with photographs from real crew reports when available | Screen-facing markers and evidence cards; species models only for identified, appropriately located reports or explicit demos | Counts and nearest distance do not identify species, exact positions, travel paths or absence of wildlife |

Technical references: NVIDIA describes sprite-based fire/smoke and render-target heat distortion in [GPU Gems: Fire in the Vulcan Demo](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-6-fire-vulcan-demo). Three.js supplies working [rain](https://threejs.org/examples/webgpu_compute_particles_rain.html), [volumetric cloud](https://threejs.org/examples/webgl_volume_cloud.html), [flame](https://threejs.org/examples/webgpu_tsl_vfx_flames.html) and [water](https://threejs.org/examples/webgl_shaders_ocean.html) examples. These establish rendering approaches; their visual effects are not validated site hazard models. WebGPU examples require porting or an explicit renderer change from our current WebGL implementation.

For wind, [Earth Nullschool](https://earth.nullschool.net/about.html) is a useful reference for restrained particle trails paired with scalar overlays. Its global forecast fields should not be interpreted as local airflow around our plant geometry.

Scientific boundaries: [NWS heat-index guidance](https://www.weather.gov/dmx/dssheat) describes the temperature/humidity measure and shade/light-wind assumptions. [NWS fog formation](https://www.weather.gov/lmk/fog_tutorial) explains why humidity needs meteorological context. [USGS flood-impact mapping](https://www.usgs.gov/tools/real-time-flood-impact-map) relates gauges to surveyed impact elevations. [NASA FIRMS detection guidance](https://forum.earthdata.nasa.gov/viewtopic.php?t=5155) explains that detection pixels do not identify exact fire size/location.

## Every field needs a visual role

The following mapping covers the existing 34 inputs. Proposed render parameters are artistic mappings, not physical equations. Input provenance and unknown state must remain visible. A neutral render must not imply a zero reading.

| Field | Proposed visual role |
| --- | --- |
| `weather.temperatureF` | Air-temperature readout and optional scalar color overlay |
| `weather.humidityPct` | Humidity readout; explanatory heat context, without automatically generating fog |
| `weather.heatIndexF` | Heat-index overlay and explicit heat-stress callout; optional illustrative shimmer |
| `weather.apparentTemperatureF` | Separate feels-like readout; label any visual fallback explicitly |
| `weather.windMph` | Baseline trail speed / windsock demonstration |
| `weather.gustMph` | Distinct gust strength marker; illustrative gust accents, without inventing a measured gust time series |
| `weather.precipitation1hMm` | Completed-hour accumulation bar and optional labeled precipitation replay |
| `weather.precipitation24hMm` | Daily rainfall history/context bar; no automatic puddle depth |
| `weather.precipitation7dMm` | Antecedent rainfall context; no inferred site drainage or soil stability |
| `weather.weatherCode` | Categorical clear/cloud/fog/rain/snow/storm preset with source time |
| `weather.cape` | Atmospheric-instability scale; no detected strike icon derived from CAPE |
| `soil.moistureSurface` | Uniform schematic surface-layer moisture treatment |
| `soil.moistureRoot` | Independent subsurface layer in ground cutaway |
| `soil.historicalPercentile` | Relative-wetness scale, separate from absolute water content |
| `lightning.nearestStrikeMiles` | Distance band/readout with unknown bearing; no arbitrary point location |
| `lightning.latestStrikeAt` | Event-age indicator using source timestamps |
| `lightning.strikes10mi30m` | Count and labeled lookback window; no invented event timings |
| `lightning.forecastPotential` | Separate forecast-potential meter, not a probability or event count |
| `lightning.evidenceMode` | Visible live/demo/forecast/unavailable label beside lightning graphics |
| `flood.nearestGaugeMiles` | Gauge-distance annotation; no invented bearing |
| `flood.stage` | Gauge column with units; not depth over plant ground |
| `flood.stagePercentile` | Relative gauge stage scale; clearly schematic water feature if used |
| `flood.stageTrend` | Up/down/steady arrow and rate, not extrapolated flood arrival time |
| `flood.floodAlert` | Explicit alert state with unknown distinct from false |
| `flood.floodplain` | Site-level exposure badge; no floodplain polygon without geometry |
| `wildfire.nearestFireMiles` | Thermal-detection distance annotation; no assumed on-site flames |
| `wildfire.fireAgeMinutes` | Age/freshness marker; age alone does not establish extinguishment |
| `wildfire.firePower` | Numeric FRP and a labeled symbol scale, not flame size |
| `wildfire.redFlagAlert` | Weather-alert state; does not trigger a depicted active fire |
| `wildlife.dangerousSightings24h` | Count cluster with explicit 24-hour window |
| `wildlife.nearestSightingMiles` | Distance annotation, not a positioned animal |
| `wildlife.latestSightingAt` | Sighting-age label |
| `wildlife.crewReports24h` | Separate crew-evidence count; avoid summing possibly overlapping reports/sightings |
| `wildlife.severity` | Text/icon treatment and evidence emphasis; no invented species |

Do not recompute operational scores or restrictions in this visualization. A visually calm scenario cannot clear a crew hold. Source, historical, forecast and simulated values must remain distinguishable even when the art style is shared.

## Asset and renderer strategy

Keep Three.js and the current WebGL renderer for the first upgrade. A renderer migration is not required for better models, shadows, wet materials, sprite effects or heat distortion. Treat the WebGPU examples as references rather than drop-in modules. Evaluate a WebGPU path only after profiling a concrete effect that justifies it.

Use a small, authored glTF model kit or procedural equivalents with consistent proportions. Bundle local models/textures for offline use. If raster texture sheets or sprite atlases are created with image generation, use them as illustrative art assets, never as real site imagery. Preserve measured photos unchanged in crew evidence.

For site fidelity later, import real footprints, elevations and facility metadata into a common coordinate system. [USGS 3DEP](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services) provides DEMs/lidar. [Cesium](https://cesium.com/learn/) offers geospatial terrain/3D-content workflows. Neither supplies a validated plant flood/fire model simply by rendering realistic surroundings.

Suggested module responsibilities:

```text
site-simulation/
  SiteSimulation.tsx       scenario controls and source/current restrictions
  scene.ts                renderer, camera, composition and cleanup
  environment.ts          sky, lighting and shared material state
  site-kit.ts             authored/schematic plant and landscape composition
  effects/                rain, wind, heat, water, smoke and markers
  visualization-state.ts  pure, explicitly artistic mappings from scenario inputs
```

These are proposed paths, not newly implemented modules. Keep scenario state in this feature. Put transport in `src/lib/` only if future verified site assets require it; keep operational policy on its existing path.

## Implementation order and acceptance

**Pass 1 — make the site beautiful in clear weather.** Terrain composition, model details, materials, lighting/shadows, larger viewport and a properly styled launcher. Preserve existing controls and source labels. This should precede expensive particles because every weather preset benefits from it.

**Pass 2 — make weather feel coherent.** Cloudy illumination, layered rain/splashes, wetness, wind trails, separate gust treatment and an optional heat lens. Reuse one environmental state so rain, sky, reflections and wind agree. Include clear, heat, storm and wet-ground presets with clearly hypothetical values.

**Pass 3 — explain hazards spatially.** Soil cutaway, gauge view, distance/event markers, evidence cards and independent current holds. Add demonstration-only fire/lightning effects without manufacturing geospatial evidence.

Target 60 fps on an agreed desktop and 30 fps on an agreed phone, then measure rather than promise those rates. Use instancing for repeated plant parts/vegetation/particles; [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) reduces draw calls. Limit transparent overdraw and post-processing passes. Prefer small texture atlases and one primary shadow-casting light. Keep volumetric clouds, stronger reflections and ambient occlusion optional by quality tier.

Acceptance should include screenshots of the same camera/site under clear, heat, storm and unknown conditions; independent heat/soil visual changes; readable controls at 390px; reduced-motion static equivalents; zero API writes from scenario edits; unchanged operational decisions; offline reload; repeated open/close without growing GPU allocations; and graphics-failure fallback. Performance targets and new effects remain unverified until implemented and measured.
