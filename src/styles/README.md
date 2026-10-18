# Application styles

`global.css` defines the theme, application shell, component and workflow styles, responsive layouts, focus states, and reduced-motion behavior. `src/main.tsx` imports it once.

Keep shared colors and typography consistent with the existing CSS variables and locally bundled fonts. Preserve keyboard focus indicators, usable form controls, and the mobile report layout. `site-map.css`, imported by `SiteMap.tsx`, styles the Three.js map controls, projected markers, pinning view, and expanded showcase. Keep map-specific rules there.

Run `npm run build` after import or asset-path changes. Run the browser layout check for desktop and 390-pixel mobile widths; screenshots are generated under ignored `test-results/`.

`weather-atlas.css` defines the national explorer’s mineral map, Geist typography, layer toolbar, light evidence drawer, timeline, scales, and responsive layout. The canvas fills the viewport behind floating controls. The evidence drawer overlays the scene and has its own scroll area; on phones it starts closed. Scope these rules to the atlas so report pinning keeps its compact controls. The atlas floats a site search above up to five stop-work or high-risk priority sites; the full ranking remains in Site intelligence.

## Website theme

`site.css` is imported after the base stylesheet by `src/main.tsx`. It defines the mineral surfaces, lime actions, rounded enclosures, Geist typography, detached navigation, working-view styles, and loading sequence. `fieldwork.css` loads afterward and scopes the geographic homepage, dark evidence chapter and responsive editorial sections to `.fieldwork-home`. `network-preview.css` belongs to the lightweight SVG preview, including loading/error states, readable source status and the native site selector. The old command-center theme has been replaced. Homepage content has generous section spacing; working views keep compact evidence and form layouts. The dedicated atlas fills the viewport with a matching light map and mineral controls. Report pinning retains its compact dark map treatment.

Homepage GSAP motion is scoped to `HomePage.tsx` with a pause control and reduced-motion static state; atlas motion is isolated in `components/site-map/AtlasMotion.tsx`. The field-kit illustration uses isolated GSAP transform animations, pauses outside the viewport or in a hidden tab, and observes reduced motion. The stylesheet keeps text fully visible and removes transforms for reduced-motion users. Do not animate an ancestor of fullscreen maps or dialogs with transforms, which would change their fixed-position containing block.

A forecast prompt occupies the lower control island in overview. The selected-site forecast filmstrip appears only while inspecting a plant; navigating the map restores current conditions. The atlas inspector also contains canonical risk channels, coverage/confidence, task states, source details and stop-work controls. Its contents scroll independently on both desktop and mobile. `evidence.css` styles the shared 34-field observation inspector and provider/model/plant details used by both the atlas and Site intelligence. Keep its source labels, units, unknown readings and native disclosure controls intact.

Unknown beacons use the existing gray with a question mark; low-confidence known values also use dashed, translucent markers; continuous risk colors interpolate the existing lime/amber/coral palette.

`evidence.css` also styles the demo gap-fill switch, synthetic reading badges and explanatory notice. Preserve the text labels so generated fields remain identifiable without relying on color.

The immersive atlas theme is scoped to `.view-atlas` and `.weather-atlas`. Navigation uses a single baseline; region and layer selections use underlines. The evidence drawer is opaque, rounded and independently scrollable. Camera controls share one rectangular rail, and task states remain plain colored text. Scrolling contents avoid backdrop filters. Motion changes opacity/transform and supports reduced motion.

`field-signals.css` styles the homepage’s concentric hazard dial, NWS heat/wind curve and plant task-readiness board. GSAP animates ring entrances, curve opacity, wind bars and tile reveals. The forecast cursor moves between actual hourly records; global pause, reduced motion, cached mode and offscreen visibility stop scanning. Unknown rings are dashed and unknown tiles hatched. No chart uses synthetic completion values.

The final theme rules in `site.css` cover the shared brand and responsive layout; the matching atlas rules live in `weather-atlas.css`. Operational risk gradients, unknown/low-confidence markers, task colors and source distinctions remain separate from lime brand selection. Do not use brand styling to imply a risk value. The [reference design study](../../docs/reference-design.md) records the current direction and checks; the [playful web audit](../../docs/web-playful-ui.md) preserves the previous iteration.

`simulation.css` adds the atlas mode switch, dark scenario-control enclosure, exposure summary and manual/playable timeline. It scopes scenario presentation to `.is-simulating`; the compact report map retains its existing layout. On phones the controls start closed, open above the timeline and return focus on Escape. The simulated overlay has its own legend; canonical marker colors remain current evidence.
