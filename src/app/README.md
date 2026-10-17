# Workspace composition

`App.tsx` owns navigation, selected-site persistence, snapshot refresh, SSE subscription, demo controls, and top-level notices. It composes the overview, report workflow, Model Lab, briefing view, and report modal.

Keep page composition and workspace-wide state here. Reusable views belong in `../components/`; feature-specific logic belongs under `../features/`. Keep transport and snapshot caching in `../lib/api.ts` and policy calculations in `shared/`.

The Model Lab is a lazy import. Preserve that boundary so normal dashboard use does not eagerly initialize TensorFlow.js. Clock changes and live-source refreshes are server actions; cached UI state is not authoritative.

Verify navigation, selected-site changes, and report handoff with the [browser tests](../../tests/e2e/README.md). Run commands from the repository root.
