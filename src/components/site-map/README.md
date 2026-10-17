# Three.js map internals

`scene.ts` owns the Three.js renderer, extruded state geometry, camera controls, projected HTML markers, and pointer raycasting. `FlatMap.tsx` retains selection and pinning when WebGL is unavailable. `projection.ts` defines a reversible local Mercator projection and geographic bounds. `../SiteMap.tsx` connects the scene to React props and accessible controls.

State extrusion is schematic. Beacon height represents the selected canonical measurement/risk scale, not terrain elevation. The report-pinning view retains its period-specific decision context. Keep real site/report coordinates, unknown risk labels, and selected-site callbacks intact. A lightning boundary is geodesic and represents ten miles; decorative beacon halos are not distance buffers.

The report form uses a top-down camera. Ground clicks intersect the same projected plane used by the scene and convert back to latitude/longitude. Dragging and multi-touch gestures must not submit a pin. Risk markers select sites without changing report coordinates.

Use bundled geography and local packages so the production view works offline. Dispose renderer resources, controls, listeners, observers, fetches, and animation frames on unmount. Preserve reduced-motion handling and pause rendering when offscreen. Changes need `npm run build`, projection unit checks, and browser map/report/offline tests.

Vite explicitly prebundles Three.js and OrbitControls in `vite.config.ts` for the lazy scene import. If dependencies change while a development server is running, restart it to avoid stale optimized-module URLs. Module loading errors and renderer initialization errors have separate fallback messages; the browser console preserves the underlying error.

## Authoritative risk atlas

`RiskControls.tsx` presents eleven layers, site inspection, evidence sources, search, region shortcuts and the 72-hour risk slider. `src/lib/useRiskAtlas.ts` fetches `/api/risk/atlas?hour=0..72` in one national batch. The slider requests a backend risk frame, not a separate weather object. Layers select raw observation fields or scored channels from that same snapshot. Temperature is Fahrenheit; heat/soil/flood/fire/lightning/wildlife/weather layers are 0–10 risk. Gray markers and question marks indicate unknown data. Known low-confidence values retain their scale color with a dashed, translucent marker. Wind prefers gusts and labels a sustained-wind fallback explicitly.

The panel includes composite risk, coverage, confidence, structured drivers, expandable channel evidence, task decisions and independent overrides. A live lightning hold has a local one-second countdown; reaching zero waits for backend confirmation. This timer does not rerender the scene. Public, forecast, static and live source metadata remain visible. A failed atlas refresh labels retained evidence stale; offline current data can use the saved canonical workspace.

The atlas covers every catalog plant, including sites without custom models. Geography remains bundled for all fifty states. Alaska and Hawaii use their actual coordinates; outgoing report pins retain standard longitude normalization. Arbitrary land clicks do not request unrelated weather. Site markers and region/search controls select catalog plants.

Scene geometry persists across value, selection and layer updates. Each beacon caches its display inputs; unchanged beacons receive no material/text mutations. Report-pin topology or lightning-boundary changes rebuild dynamic objects; land, renderer and camera persist. Forecast gestures debounce and cancel superseded national reads. Layer switches perform no network calls. The old weather hook, inspector and sampled weather field were removed; compatibility weather APIs remain on the server.

Current risk uses actual system time. Future frames are backend forecast screening with explicit limitations: unavailable future gauge, fire, strike and wildlife evidence stays unknown, while unresolved crew controls are assumed to persist. Historical replay is labeled separately in the other working views.

The website mounts the national atlas only in `/?view=atlas`. `SiteMap` accepts `standalone` to use a page-level heading there; report pinning retains its compact embedded presentation. The atlas fills the viewport below the site navigation and selection strip. Showcase mode can cover those controls too, and Escape restores the normal atlas view.

The standalone atlas uses an `h1` for its page title and an `h2` with the `atlas-location-title` class for the inspected location. Styles and tests target that class rather than a fixed heading level.
