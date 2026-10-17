# Photo → review → share

`useQuickReport.ts` opens the native camera directly from the home, map and history report actions. A saved draft with a photo resumes at review; cancellation or permission failure retains a camera/library path. Web preview opens the form without requesting a native camera.

`ReportComposer.tsx` uses one review screen for the photo, hazard type, optional note and editable map pin. The visible “Confirm pin & share hazard” action deliberately confirms the displayed coordinates and submits them together; there is no separate pin-confirmation page. Advanced coordinates must be applied before sharing. The affected-work summary is always visible, with controls expanded on request; at least one task remains required. Existing names are reused and new names are remembered after server acceptance.

`Page` provides the pinned share action so it remains reachable while reviewing. Reports without a note use only the selected category’s photo-report label, never an invented observation. Server rejection retains the draft and retry UUID. Only an accepted persisted report produces the success view. Its two-line title uses a JSX string expression so the newline renders correctly. Independent holds and the server clock remain authoritative.
