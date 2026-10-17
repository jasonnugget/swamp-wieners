# Local fonts

| Asset | Family | License |
| --- | --- | --- |
| `dm-sans.woff2` | DM Sans | [SIL Open Font License](dm-sans-OFL.txt) |
| `manrope.woff2` | Manrope | [SIL Open Font License](manrope-OFL.txt) |

These fonts were downloaded from Google Fonts and are referenced by `src/styles/global.css`. Keep the license files with redistributed assets. The service worker precaches both fonts so the production demo does not need a font CDN.

When changing a filename or font, update the stylesheet and `public/sw.js` together. Check the production build and offline browser layout.
