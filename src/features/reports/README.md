# Crew reports and site memory

`Reports.tsx` exports the report form and the site-history view. It handles photo selection, draft descriptions, map pins, affected tasks, Jev suggestion review, and report resolution. It uses shared visual components and the central API helper.

`CrewTeams.tsx` manages shared team rosters and plant assignments, styled by `crew-teams.css`. Team records are stored on the server. `crew-profile.ts` remembers the reporting team and name on this device. These are reporting defaults, not authenticated accounts. The report form limits a selected team's plant and name choices to its assignments; unassigned reporting remains available. Changing plants resets the pin and photo and restores that plant's description draft. Reports retain the team name at submission even after a team is edited. Demo reset preserves teams.

Submit reports through the server. The server validates and persists a report before asynchronous Jev triage. Crew-selected tasks apply immediately. Confirming a suggestion preserves existing task holds. Resolution requires a reviewer and explanation; history remains available.

The form accepts JPEG, PNG, and WebP images up to 4 MB. A failed submission preserves the description in localStorage, not the full report or photo. Do not imply offline synchronization or successful sharing before server acceptance.

Run the [report handoff browser test](../../../tests/e2e/README.md) after changes. Read [API contracts](../../../docs/api.md) for payloads and server-side validation.
