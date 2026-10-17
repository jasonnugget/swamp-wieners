# Crew reports and site memory

`Reports.tsx` exports the report form and the site-history view. It handles photo selection, draft descriptions, map pins, affected tasks, Jev suggestion review, and report resolution. It uses shared visual components and the central API helper.

Submit reports through the server. The server validates and persists a report before asynchronous Jev triage. Crew-selected tasks apply immediately. Confirming a suggestion preserves existing task holds. Resolution requires a reviewer and explanation; history remains available.

The form accepts JPEG, PNG, and WebP images up to 4 MB. A failed submission preserves the description in localStorage, not the full report or photo. Do not imply offline synchronization or successful sharing before server acceptance.

Run the [report handoff browser test](../../../tests/e2e/README.md) after changes. Read [API contracts](../../../docs/api.md) for payloads and server-side validation.
