# Project context

| Document | Read it when |
| --- | --- |
| [Architecture](architecture.md) | Tracing module boundaries, state, scheduling, or offline behavior |
| [API](api.md) | Changing requests, validation, events, or server responses |
| [Models](models.md) | Training, evaluating, exporting, or running model calibration |
| [Data and policies](data-and-policies.md) | Interpreting provenance, hazard scores, and coverage limits |
| [Environmental pipeline](environment-pipeline.md) | Understanding normalization, coverage, live/replay separation and canonical snapshots |
| [Risk scoring](risk-scoring.md) | Reviewing continuous thresholds, compounding, confidence, crew semantics and policy |
| [Environmental providers](environment-providers.md) | Source contracts, caching, credentials, live checks and fallbacks |
| [Verified data sources](verified-data-sources.md) | Distinguishing implemented adapters from historical endpoint research and verification evidence |
| [Frontend case study](frontend-case-study.md) | Reviewing the visual design, current challenge coverage, historical captures and open UX findings |
| [Reference-driven design](reference-design.md) | Reviewing the homepage references, verified awards, design decisions and research limits |
| [Immersive atlas](immersive-atlas.md) | Reviewing the full-screen map, floating controls, mobile drawer and current screenshots |
| [Atlas simulation](atlas-simulation.md) | SwampHacks context, hurricane/rainfall scenario equations, source separation and flood-model limits |
| [Playful web UI](web-playful-ui.md) | Reviewing the shared web/mobile visual direction, web screenshots, evidence boundaries and browser checks |
| [UI audit](ui-audit.md) | Reviewing the current supervisor layout, screenshots, field completeness and browser checks |
| [Site-data completion](site-data-completion.md) | Regenerating source-first, explicitly demo-only completion exports |
| [Simulation visual research](simulation-visual-research.md) | Proposed site art direction, weather/VFX techniques, all 34 field mappings, evidence limits and implementation order |
| [Demo](demo.md) | Rehearsing the report handoff and offline demonstration |

Directory READMEs describe the nearby files. These documents explain behavior that crosses directory boundaries. The [root README](../README.md) covers installation and verification.

`assets/frontend-*.jpg` are browser captures for the frontend case study. They document the audited iteration and are maintained with that report; their generated capture data belongs in this parent context.

`assets/supervisor-atlas-*.png` are production-build captures of the redesigned canonical atlas, maintained with [the current UI audit](ui-audit.md). They show persisted provider evidence without injected weather fixtures; the audit documents capture settings and limits.

`assets/supervisor-demo-completion.png` shows the subsequent demo gap-fill controls and synthetic reading labels, maintained with the UI audit.

`assets/atlas-immersive-*.png` document the full-screen map iteration and are maintained with the immersive atlas audit. Earlier screenshots remain historical captures of their documented layouts.

[Homepage field signals](home-signals.md) documents the concentric hazard dial, automatic NWS hourly outlook, task-readiness board and motion boundaries.

`assets/environment-studio/` contains production browser captures of the [Environment Studio](../src/features/site-simulation/README.md): desktop storm, phone, heat, ground cutaway and fire demonstration. They use explicitly hypothetical presets and deterministic test source fixtures. The miniature geometry, weather art and demonstration locations are illustrative; these images do not establish surveyed layouts or field hazard accuracy.

`assets/web-playful/` holds the current desktop/phone homepage, atlas and working-view captures. Its audit describes the isolated runtime and unavailable live-feed coverage; the images do not claim active provider connectivity. Earlier website captures remain historical.

`assets/reference-design/` contains homepage, evidence, atlas and working-view captures for the [reference design study](reference-design.md). They use existing local provider records with visible freshness limits and do not establish complete live coverage.

`assets/atlas-simulation/` documents the separate hurricane/rainfall scenario mode on desktop and phone. These captures use an isolated API with external collection disabled; scenario values are hypothetical and current missing evidence stays unknown. [The simulation study](atlas-simulation.md) records equations and limits.
