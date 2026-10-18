# Environment Studio

Open **3D Atlas → select a plant → Open 3D simulation**. This lazy feature is an architectural miniature and environmental scenario sandbox, not surveyed geometry or a physical hazard model. It copies available current source readings once, preserves unknowns and replaces stale starting inputs with unknowns. All 34 fields remain editable. No scenario input is submitted, persisted, scored or used for policy; current task states and independent overrides appear separately.

| File | Responsibility |
| --- | --- |
| `SiteSimulation.tsx` | Native modal, five environmental lenses, six presets, field validation, source/event readouts, scene controls and independent current restrictions |
| `types.ts` | Nullable scenario fields, presentation-only lenses, templates and settings |
| `visualization-state.ts` | Pure artistic mappings and immutable hypothetical presets; no risk/policy calculations |
| `scene.ts` | WebGL renderer, camera, lighting/shadows, sky/fog, heat-distortion composition, lifecycle and resource disposal |
| `site-kit.ts` | Procedural industrial/solar/substation templates, terrain layers, road/drainage, transformers, fences, vegetation, vehicle, windsock and schematic channel/gauge |
| `effects.ts` | Shader-driven rain/snow/hail, wind/gust trails, cloud layers, splashes/runoff, heat contours, optional demonstration lightning/flames/smoke/embers |
| `simulation.css` | Scene-first desktop layout, scrolling advanced sidebar and stacked phone layout |

## Visual semantics

Atmosphere, Heat, Ground, Water and Nearby events select visual lenses. Clear skies, heat, storm, snow, wet-ground and fire demonstration presets reset from the original baseline and explicitly replace selected inputs. They never manufacture unrelated wildlife evidence. Weather codes select cloud/fog/precipitation categories. Humidity alone does not create fog, and CAPE never establishes a detected strike. Rainfall totals drive a labeled illustrative replay, not a current rain-rate measurement. Snow surface dusting is artistic, not a measured depth.

Heat shimmer/contours are separate from surface/root moisture materials. The cutaway reveals those two schematic layers independently. The water shader and gauge represent a contextual channel and relative stage; shaded banks do not establish site inundation. Hourly/daily/seven-day precipitation remain distinguishable. Alerts, classifications and timestamps retain their individual fields.

Nearby-event cards show distance, counts, time, FRP and classification. Distances have no bearing; we do not position real strikes, fires or animals without coordinates. Current inputs do not identify wildlife species. Source thermal detections never activate flames automatically. Fire and branching lightning effects require an explicit demonstration control/preset and display an arbitrary-position label. Lightning has no strobe. Forecast potential remains a proxy, separate from detected events.

In the event lens, the sidebar also shows up to three selected-site crew wildlife reports from existing workspace props, with original photos when present, authors, timestamps and open/resolved status. These are labeled source evidence and never rewritten by presets. Upload photos are not service-worker precache assets and may be unavailable offline.

Facility templates and wind travel direction are explicitly hypothetical art controls. Templates are not inferred from plant names, capacity or a missing fuel type. No terrain, site footprint, building layout, airflow field, fire perimeter or flood depth is claimed. The [research](../../../docs/simulation-visual-research.md) records sources and future data requirements.

## Rendering and lifecycle

All geometry, shader art and procedural texture generation are local. No remote model/texture service is required, and the build manifest includes the lazy chunks for offline reload. The atlas launcher style lives in `../../styles/weather-atlas.css` so it appears before this feature loads.

Static site parts are merged by material, fence posts are instanced, and particles use shared buffers/instanced shader geometry. Balanced/high detail changes resolution caps. A single shadow-casting light supplies depth; ambient sky fill and weather illumination remain coherent. Full volumetric weather/physical solvers are not included. Hardware frame-rate targets remain unmeasured; software-rendered browser tests establish functional rendering, not device performance.

Rendering pauses offscreen, in hidden tabs and when animation is paused. Reduced motion starts paused and switches running animation to paused. Camera buttons provide keyboard alternatives to drag/pinch and update on demand. `planit:site-simulation` pauses the underlying atlas renderer while the modal is open and restores it on close. Cleanup releases observers, listeners, frame loops, shared geometry/materials, procedural textures, instanced resources, shadow targets, compositor targets and renderer/context. WebGL failure retains the accessible field and restriction UI.

Overview/overhead camera distance adapts to narrow aspect ratios so the terrain tile fits on phones; ground detail remains an intentional close view. The header and close control sit outside the scrolling content, preserving access at the bottom of long forms.

## Verification

Run `npm test`, `npm run build` and `npm run test:e2e` from the root. Unit tests cover unknowns, heat/moisture independence, category semantics and preset immutability. Browser checks cover shader errors, all lenses/presets/templates, source isolation, reduced-motion rendering, reuse/open-close geometry counts, phone bounds, fallback and full offline reload. Captures are generated in ignored `test-results/simulation-*.png`; do not add context files to generated output.
