# Product workflows

| Feature | Responsibility |
| --- | --- |
| [model-lab](model-lab/README.md) | Historical evaluation, browser inference, local calibration, and sensitivity exploration |
| [reports](reports/README.md) | Hazard submission, photo evidence, map pinning, triage review, and resolution history |
| [simulation](simulation/README.md) | Isolated hurricane/rainfall scenarios, time playback, hypothetical plant exposure and assumption exports |

Keep a workflow's UI and specialized logic together. Shared visuals belong in `../components/`; transport belongs in `../lib/`. `../app/App.tsx` connects features to workspace state and navigation.

Features can display or explore decisions, but shared policy and server snapshots remain the source of operational restrictions.
