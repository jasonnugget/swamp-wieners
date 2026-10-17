# Photo → pin → share

`ReportComposer.tsx` keeps the workflow in three explicit steps: photo/category, deliberate pin confirmation, then description/identity/task review. Camera and GPS permission failures retain a library/manual-pin path. Server rejection keeps the draft. Only an accepted persisted report produces the success view. Existing independent work restrictions remain authoritative.

The presentation uses a linear step indicator, a horizontal expanding category selector and keyed native panel entrances. These controls still edit the existing draft and use the existing validation/publish functions. Reduced Motion disables entrances; no animation controls report acceptance or advances a step.
