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
| [UI audit](ui-audit.md) | Reviewing the current supervisor layout, screenshots, field completeness and browser checks |
| [Site-data completion](site-data-completion.md) | Regenerating source-first, explicitly demo-only completion exports |
| [Demo](demo.md) | Rehearsing the report handoff and offline demonstration |

Directory READMEs describe the nearby files. These documents explain behavior that crosses directory boundaries. The [root README](../README.md) covers installation and verification.

`assets/frontend-*.jpg` are browser captures for the frontend case study. They document the audited iteration and are maintained with that report; their generated capture data belongs in this parent context.

`assets/supervisor-atlas-*.png` are production-build captures of the redesigned canonical atlas, maintained with [the current UI audit](ui-audit.md). They show persisted provider evidence without injected weather fixtures; the audit documents capture settings and limits.

`assets/supervisor-demo-completion.png` shows the subsequent demo gap-fill controls and synthetic reading labels, maintained with the UI audit.
