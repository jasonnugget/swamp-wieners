# Application styles

`global.css` defines the theme, application shell, component and workflow styles, responsive layouts, focus states, and reduced-motion behavior. `src/main.tsx` imports it once.

Keep shared colors and typography consistent with the existing CSS variables and locally bundled fonts. Preserve keyboard focus indicators, usable form controls, and the mobile report layout. MapLibre also imports its own package stylesheet from `SiteMap.tsx`.

Run `npm run build` after import or asset-path changes. Run the browser layout check for desktop and 390-pixel mobile widths; screenshots are generated under ignored `test-results/`.
