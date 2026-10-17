# Application styles

`global.css` defines the theme, application shell, component and workflow styles, responsive layouts, focus states, and reduced-motion behavior. `src/main.tsx` imports it once.

Keep shared colors and typography consistent with the existing CSS variables and locally bundled fonts. Preserve keyboard focus indicators, usable form controls, and the mobile report layout. `site-map.css`, imported by `SiteMap.tsx`, styles the Three.js map controls, projected markers, pinning view, and expanded showcase. Keep map-specific rules there.

Run `npm run build` after import or asset-path changes. Run the browser layout check for desktop and 390-pixel mobile widths; screenshots are generated under ignored `test-results/`.

`weather-atlas.css` defines the national explorer’s charcoal map, Satoshi typography, layer toolbar, dark evidence drawer, timeline, scales, and responsive layout. The canvas fills the viewport behind floating controls. The evidence drawer overlays the scene and has its own scroll area; on phones it starts closed. Scope these rules to the atlas so report pinning keeps its compact controls. The atlas includes a three-site priority preview; the full ranking remains in Site intelligence.

## Editorial website theme

`site.css` is imported after the base stylesheet by `src/main.tsx`. It defines the warm paper surfaces, straight edges, Satoshi typography, minimal navigation, homepage sections, working-view styles, and loading sequence. The old command-center theme has been replaced. Homepage content has generous section spacing; working views keep compact evidence and form layouts. The dedicated atlas fills the viewport and retains its own dark map palette.

Homepage GSAP motion is scoped to `HomePage.tsx`; atlas motion is isolated in `components/site-map/AtlasMotion.tsx`. The field sculpture has its own canvas animation, pauses outside the viewport or in a hidden tab, and observes reduced motion. The stylesheet keeps text fully visible and removes transforms for reduced-motion users. Do not animate an ancestor of fullscreen maps or dialogs with transforms, which would change their fixed-position containing block.

A forecast prompt occupies the lower control island in overview. The selected-site forecast filmstrip appears only while inspecting a plant; navigating the map restores current conditions. The atlas inspector also contains canonical risk channels, coverage/confidence, task states, source details and stop-work controls. Its contents scroll independently on both desktop and mobile. `evidence.css` styles the shared 34-field observation inspector and provider/model/plant details used by both the atlas and Site intelligence. Keep its source labels, units, unknown readings and native disclosure controls intact.

Unknown beacons use the existing gray with a question mark; low-confidence known values also use dashed, translucent markers; continuous risk colors interpolate the existing lime/amber/coral palette.

`evidence.css` also styles the demo gap-fill switch, synthetic reading badges and explanatory notice. Preserve the text labels so generated fields remain identifiable without relying on color.

The immersive atlas theme is scoped to `.view-atlas` and `.weather-atlas`. Shared observation/source components retain their paper appearance in Site intelligence. Navigation uses a single baseline; region and layer selections use underlines. The evidence drawer is opaque with straight edges. Camera controls share one rectangular rail, and task states remain plain colored text. Scrolling contents avoid backdrop filters. Motion changes opacity/transform and supports reduced motion.
