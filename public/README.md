# Public browser assets

Vite serves this directory at the URL root during development and copies it into `dist/` for production. The Node server also exposes data/models directly. Files here are intentionally browser-readable.

| Path | Purpose |
| --- | --- |
| [data](data/README.md) | Committed historical demo records and map outlines |
| [models](models/README.md) | Frozen model weights and evaluation artifacts |
| [fonts](fonts/README.md) | Local fonts and their redistribution licenses |
| `images/` | Locally bundled illustrative homepage photographs |
| `favicon.svg` | Application icon |
| `sw.js` | Production offline precaching and fetch fallback |

Keep credentials, uploaded crew photos, raw downloads, and SQLite records outside this directory. Avoid renaming asset URLs without updating consumers, the service worker's core list, and any Python exporters.

The service worker consumes the build-generated `asset-manifest.json` to cache initial and lazy JavaScript, CSS, and worker assets. It excludes API requests and uploaded photos. Build and run the offline reload browser check after asset or caching changes.

Homepage photographs are downloaded from Unsplash: [wind landscape](https://images.unsplash.com/photo-1466611653911-95081537e5b7) and [forest canopy](https://images.unsplash.com/photo-1473448912268-2022ce9509d8). They are labeled as illustration, never site observations. Both are precached for offline use. The homepage preview uses bundled state geography and actual plant coordinates. The loading screen retains an original SVG field-kit illustration. Neither requires an image service. Geist font files are local and precached with the application.

The field-intelligence redesign increments the service-worker asset cache so existing installations prepare the new homepage and shared theme for offline use. Snapshot storage, model candidates, server records and uploaded evidence keep their existing persistence.
