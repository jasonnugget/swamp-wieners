# Three.js map internals

`scene.ts` owns the Three.js renderer, extruded state geometry, camera controls, projected HTML markers, and pointer raycasting. `FlatMap.tsx` retains selection and pinning when WebGL is unavailable. `projection.ts` defines a reversible local Mercator projection and geographic bounds. `../SiteMap.tsx` connects the scene to React props and accessible controls.

State extrusion is schematic. Beacon height represents the supplied hazard index, not terrain elevation. Keep real site/report coordinates, unknown risk labels, and selected-site callbacks intact. A lightning boundary is geodesic and represents ten miles; decorative beacon halos are not distance buffers.

The report form uses a top-down camera. Ground clicks intersect the same projected plane used by the scene and convert back to latitude/longitude. Dragging and multi-touch gestures must not submit a pin. Risk markers select sites without changing report coordinates.

Use bundled geography and local packages so the production view works offline. Dispose renderer resources, controls, listeners, observers, fetches, and animation frames on unmount. Preserve reduced-motion handling and pause rendering when offscreen. Changes need `npm run build`, projection unit checks, and browser map/report/offline tests.

Vite explicitly prebundles Three.js and OrbitControls in `vite.config.ts` for the lazy scene import. If dependencies change while a development server is running, restart it to avoid stale optimized-module URLs. Module loading errors and renderer initialization errors have separate fallback messages; the browser console preserves the underlying error.

## National weather atlas

`WeatherControls.tsx` owns the inspector, five layers, region shortcuts, search, and 72-hour timeline. `useWeatherAtlas.ts` loads national samples and point forecasts in parallel, refreshes every fifteen minutes while visible, and marks the saved national cache stale after a failed request. `weather-field.ts` renders sampled-value columns, wind vectors, precipitation particles, and schematic cloud volumes. Animation stays outside React. Dispose all field resources on a layer change or unmount. Styling lives in `../../styles/weather-atlas.css`.

The atlas loads `/data/us-states.geojson` for all fifty states, including Alaska and Hawaii. Region cameras use real Mercator coordinates; Aleutian longitudes are unwrapped across the antimeridian. Click land to inspect weather at the raycast location. Overview samples represent one actual location per state, not statewide averages or radar. Weather column height represents the selected variable; plant beacon height retains the workspace hazard index. Missing readings never become zero.

Provider forecasts use actual system/provider time independently of the safety replay and frozen ML models. Scrubbing weather does not change work holds. The local font and geometry are precached for offline use; cached weather remains explicitly stale. Verify layer changes, forecasts, point inspection, reduced motion, and mobile controls with `weather-atlas.spec.ts`, plus the existing map/pinning tests.

Plant beacons use the national EIA catalog, currently 285 sites across fifty states. Catalog-only plants have unknown safety risk; weather inspection remains available at their actual coordinates. Fit plants includes Alaska and Hawaii. US display coordinates unwrap Aleutian longitudes; outgoing report pins normalize back to the standard longitude range.

The website mounts the national atlas only in `/?view=atlas`. `SiteMap` accepts `standalone` to use a page-level heading there; report pinning retains its compact embedded presentation. The atlas fills the viewport below the site navigation and selection strip. Showcase mode can cover those controls too, and Escape restores the normal atlas view.

The standalone atlas uses an `h1` for its page title and an `h2` with the `atlas-location-title` class for the inspected location. Styles and tests target that class rather than a fixed heading level.
