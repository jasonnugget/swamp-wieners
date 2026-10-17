# Local fonts

| Asset | Purpose | License |
| --- | --- | --- |
| `satoshi-variable.woff2` | Editorial website typography and controls | [ITF Free Font License](Satoshi-LICENSE.txt) |
| `InstrumentSans-Variable.ttf` | Base stylesheet references | [SIL Open Font License](InstrumentSans-OFL.txt) |
| `SpaceGrotesk-Variable.ttf` | Retained font asset | [SIL Open Font License](SpaceGrotesk-OFL.txt) |
| `BarlowCondensed-SemiBold.ttf` | Base atlas stylesheet references | [SIL Open Font License](BarlowCondensed-OFL.txt) |
| `dm-sans.woff2` | Retained font asset | [SIL Open Font License](dm-sans-OFL.txt) |
| `manrope.woff2` | Base stylesheet references | [SIL Open Font License](manrope-OFL.txt) |

Satoshi comes from the [official Fontshare download](https://www.fontshare.com/fonts/satoshi). The unmodified variable WOFF2 is loaded by `src/styles/site.css`, preloaded by `index.html`, and included in the production service-worker precache. Keep its accompanying license.

The other fonts came from Google Fonts: [Instrument Sans](https://github.com/google/fonts/tree/main/ofl/instrumentsans), [Space Grotesk](https://github.com/google/fonts/tree/main/ofl/spacegrotesk), and [Barlow Condensed](https://github.com/google/fonts/tree/main/ofl/barlowcondensed), alongside DM Sans and Manrope. Keep their license files with the assets.

When changing an asset URL, update the consuming stylesheet and `public/sw.js`. Verify the production build and offline layout; the website must not depend on a font CDN at runtime.
