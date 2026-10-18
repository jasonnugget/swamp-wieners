# Working in Threshold Control

This repository contains a local field-safety prototype: a React client, Node API, shared decision logic, and a Python data/training pipeline. Start with [README.md](README.md) and [the architecture](docs/architecture.md). Read the README in the directory you change; it defines the local boundaries and relevant checks.

## Placement

- Application composition and navigation belong in `src/app/`.
- Reusable visual components belong in `src/components/`; workflow-specific UI and logic belong in `src/features/`.
- HTTP client and browser snapshot caching belong in `src/lib/`.
- Server lifecycle, validation, scheduling, and persistence belong in `server/`; external service adapters belong in `server/integrations/`.
- Browser/server contracts and pure calculations belong in `shared/`.
- Offline dataset preparation and base-model training belong in `scripts/`.
- Unit tests belong in `tests/unit/`; browser workflows belong in `tests/e2e/`.

## Invariants

Keep historical, live, simulated, and crew evidence distinguishable. Missing or stale data remains unknown. A lower prediction or resolved report cannot clear an independent hold. Preserve chronological splits, site exclusions, feature order, and training-only preprocessing. Do not invent model results or present reanalysis as site observations.

Keep credentials in the server environment. Everything in `public/` is browser-readable. Preserve SQLite history and local uploads; demo reset is an explicit user action. Do not edit generated weather/model JSON to change results; update the pipeline and regenerate the artifacts.

## Verification and documentation

Run commands from the repository root. Use `npm test` for shared/server behavior, `npm run build` for TypeScript and asset packaging, and `npm run test:e2e` for UI or offline changes. Python edits also need `python -m py_compile` using the project environment; training changes require regenerated evaluation evidence.

Update the nearest README when responsibilities, paths, or commands change. Update `docs/api.md` for endpoint contracts and `docs/models.md` for model semantics. Document generated directories from their maintained parent; do not add context files inside dependencies, caches, runtime records, or build output.
