# Three.js map internals

`scene.ts` owns the Three.js renderer, extruded state geometry, camera controls, projected HTML markers, and pointer raycasting. `FlatMap.tsx` retains selection and pinning when WebGL is unavailable. `projection.ts` defines a reversible local Mercator projection and geographic bounds. `../SiteMap.tsx` connects the scene to React props and accessible controls.

State extrusion is schematic. Beacon height represents the supplied hazard index, not terrain elevation. Keep real site/report coordinates, unknown risk labels, and selected-site callbacks intact. A lightning boundary is geodesic and represents ten miles; decorative beacon halos are not distance buffers.

The report form uses a top-down camera. Ground clicks intersect the same projected plane used by the scene and convert back to latitude/longitude. Dragging and multi-touch gestures must not submit a pin. Risk markers select sites without changing report coordinates.

Use bundled geography and local packages so the production view works offline. Dispose renderer resources, controls, listeners, observers, fetches, and animation frames on unmount. Preserve reduced-motion handling and pause rendering when offscreen. Changes need `npm run build`, projection unit checks, and browser map/report/offline tests.

Vite explicitly prebundles Three.js and OrbitControls in `vite.config.ts` for the lazy scene import. If dependencies change while a development server is running, restart it to avoid stale optimized-module URLs. Module loading errors and renderer initialization errors have separate fallback messages; the browser console preserves the underlying error.
