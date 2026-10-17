# Application styles

`global.css` defines the theme, application shell, component and workflow styles, responsive layouts, focus states, and reduced-motion behavior. `src/main.tsx` imports it once.

Keep shared colors and typography consistent with the existing CSS variables and locally bundled fonts. Preserve keyboard focus indicators, usable form controls, and the mobile report layout. `site-map.css`, imported by `SiteMap.tsx`, styles the Three.js map controls, projected markers, pinning view, and expanded showcase. Keep map-specific rules there.

Run `npm run build` after import or asset-path changes. Run the browser layout check for desktop and 390-pixel mobile widths; screenshots are generated under ignored `test-results/`.

`weather-atlas.css` defines the national explorer's dark surfaces, Barlow Condensed display font, layer toolbar, inspector, timeline, scales, and responsive layout. Scope these rules to the atlas so report pinning keeps its compact controls. The atlas lives in its own fullscreen view; site ranking belongs to Site intelligence.

## Editorial website theme

`site.css` is imported after the base stylesheet by `src/main.tsx`. It defines the warm paper surfaces, straight edges, Satoshi typography, minimal navigation, homepage sections, working-view styles, and loading sequence. The old command-center theme has been replaced. Homepage content has generous section spacing; working views keep compact evidence and form layouts. The dedicated atlas fills the viewport and retains its own dark map palette.

GSAP motion is scoped to `HomePage.tsx`. The field sculpture has its own canvas animation, pauses outside the viewport or in a hidden tab, and observes reduced motion. The stylesheet keeps text fully visible and removes transforms for reduced-motion users. Do not animate an ancestor of fullscreen maps or dialogs with transforms, which would change their fixed-position containing block.

The atlas inspector also contains canonical risk channels, coverage/confidence, task states, source details and stop-work controls. It scrolls within the map on desktop/mobile. Unknown beacons use the existing gray with a question mark; low-confidence known values also use dashed, translucent markers; continuous risk colors interpolate the existing lime/amber/coral palette.
