# Local fonts

| Asset | Purpose | License |
| --- | --- | --- |
| `geist-latin-variable.woff2`, `geist-latin-ext-variable.woff2` | Current website variable typography, weights 100–900 | [SIL Open Font License](Geist-OFL.txt) |
| `satoshi-variable.woff2` | Retained asset for previous website shells | [ITF Free Font License](Satoshi-LICENSE.txt) |
| `InstrumentSans-Variable.ttf` | Retained legacy font asset | [SIL Open Font License](InstrumentSans-OFL.txt) |
| `SpaceGrotesk-Variable.ttf` | Retained font asset | [SIL Open Font License](SpaceGrotesk-OFL.txt) |
| `BarlowCondensed-SemiBold.ttf` | Retained legacy atlas font asset | [SIL Open Font License](BarlowCondensed-OFL.txt) |
| `dm-sans.woff2` | Retained font asset | [SIL Open Font License](dm-sans-OFL.txt) |
| `manrope.woff2` | Retained legacy font asset | [SIL Open Font License](manrope-OFL.txt) |

Satoshi comes from the [official Fontshare download](https://www.fontshare.com/fonts/satoshi). Its unmodified variable WOFF2 and accompanying license are retained for older shells; the current site uses Geist.

The other fonts came from Google Fonts: [Instrument Sans](https://github.com/google/fonts/tree/main/ofl/instrumentsans), [Space Grotesk](https://github.com/google/fonts/tree/main/ofl/spacegrotesk), and [Barlow Condensed](https://github.com/google/fonts/tree/main/ofl/barlowcondensed), alongside DM Sans and Manrope. Keep their license files with the assets.

When changing an asset URL, update the consuming stylesheet and `public/sw.js`. Verify the production build and offline layout; the website must not depend on a font CDN at runtime.

Geist comes from the official Google Fonts CSS service and its unmodified Latin/Latin-extended WOFF2 resources. `src/styles/site.css` declares the ranges; `index.html` preloads Latin. Both files are precached by `public/sw.js`; no font CDN is needed at runtime. Keep `Geist-OFL.txt` with the assets.
