# Crew workspace lifecycle

`CrewProvider.tsx` hydrates reporting defaults and a local draft, scopes cached history to its backend and selected site, and refreshes from SSE while active. Backgrounding closes live subscriptions; returning reconnects. Sharing requires server acceptance before the draft is cleared or success appears. An unchanged retry preserves its request UUID. Draft edits create a new UUID. Local persistence errors remain visible and do not discard a server acceptance.

Background SSE and fallback reads are silent. A separate `refreshing` flag belongs only to a user refresh; reconnecting/submitting does not restart the stream. `workspace-sync.ts` coalesces concurrent invalidations and ignores late replies after a site/server change or backgrounding. Clock-only ticks preserve workspace and map-data references; actual report, roster, catalog and clock-mode changes still update the UI.
