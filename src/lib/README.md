# Client transport and caching

`api.ts` sends relative `/api` requests, parses server errors, caches the last snapshot in localStorage, and registers the service worker in production.

`loadSnapshot()` returns both a snapshot and an offline flag. A cached fallback is historical workspace state, not a successful fresh read. Writes require the server; this helper does not queue or retry full reports.

Keep credentials out of this directory and all browser bundles. Jev and external feed calls belong in `server/integrations/`. Use the server-side contracts in [docs/api.md](../../docs/api.md).

Production offline behavior depends on `public/sw.js` and the asset manifest emitted by `vite.config.ts`. Verify changes with `npm run test:e2e`, including a reload with browser networking disabled.

`useRiskAtlas.ts` loads one canonical national frame per requested hour, debounces slider/SSE bursts and cancels superseded requests. Current offline fallback comes from the already-cached workspace `siteRisks`, avoiding a duplicate multi-megabyte localStorage copy. Failed reads label retained evidence stale; forecast errors never relabel another hour as the requested frame. No browser hazard scoring or source-provider requests occur here.

The workspace cache uses a format-2 envelope under the existing storage key. Compatible unwrapped snapshots remain readable offline; snapshots lacking canonical risk/evidence fields are ignored before React renders. Invalid JSON or unavailable browser storage returns no cached snapshot. Cache-write quota/privacy errors never discard a successful API response. This recovery does not clear site selection, crew profiles, server records or uploads.

The atlas adds `completion=1` to its existing batch, obtaining labeled demo conditions alongside authoritative snapshots. `useSiteDataPreview.ts` fetches only the inspected Site intelligence plant’s companion, cancels superseded requests and drops another plant’s response during selection changes. Neither hook generates synthetic values or recalculates scores in the browser. Preview failure leaves source readings available.
