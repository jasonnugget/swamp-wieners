# Crew workspace lifecycle

`CrewProvider.tsx` hydrates reporting defaults and a local draft, scopes cached history to its backend and selected site, and refreshes from SSE while active. Backgrounding closes live subscriptions; returning reconnects. Sharing requires server acceptance before the draft is cleared or success appears. An unchanged retry preserves its request UUID. Draft edits create a new UUID. Local persistence errors remain visible and do not discard a server acceptance.

Background SSE and fallback reads are silent. A separate `refreshing` flag belongs only to a user refresh; reconnecting/submitting does not restart the stream. `workspace-sync.ts` coalesces concurrent invalidations and ignores late replies after a site/server change or backgrounding. Clock-only ticks preserve workspace and map-data references; actual report, roster, catalog and clock-mode changes still update the UI.

The composer calls `publish({ confirmPin: true })` only from its explicit “Confirm pin & share hazard” action. Confirmation is applied to the submitted copy, preserving the same retry UUID for an unchanged retry. Reporting names are remembered only after acceptance; blank notes are converted by the payload helper into a category-only photo label.

Workspace refreshes also carry current conditions for the selected site. Condition or freshness changes update the daily summary while unchanged catalog/report references keep native maps steady; these reads remain silent background updates.

The shared client clock advances on foregrounding, completed reads and the existing thirty-second fallback timer, so local-date boundaries and cached-condition freshness can expire even when no report changes. It never changes the server’s reporting/demo clock.
