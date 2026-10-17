# Shared contracts and pure calculations

This directory is imported by the client, server, and unit tests. Keep it free of network calls, browser storage, filesystem access, React, and TensorFlow runtime dependencies.

| File | Responsibility |
| --- | --- |
| `types.ts` | Site, forecast, sample, model, evidence, decision, briefing, and snapshot contracts |
| `model.ts` | Feature construction, NOAA heat-index calculation, and portable dense-network inference |
| `policy.ts` | Severity scoring, geodesic strike checks, lightning timers, and task decisions |
| `clock.ts` | IANA-timezone local parts and next-date calculation |
| `windows.ts` | Consecutive task-specific daytime screening windows |

## Rules to preserve

- Keep the feature order synchronized with `scripts/train.py`. Quantile ordering, residual targets, scale/offset, clipping, and interval adjustment must match exports and browser inference.
- Unknown or stale evidence does not become zero risk. A low prediction cannot clear an existing report or lightning hold.
- Lightning holds last thirty minutes from the latest qualifying strike within ten miles. Ignore future timestamps; duplicate events must not extend the timer beyond their timestamp.
- Task-specific reports cannot hide another environmental restriction in the same hazard category. Resolution clears only that report's holds.
- Work-window bands represent model screening, not a site all-clear.

Change interfaces here before changing producers and consumers. Policy changes need a deliberate policy-version update and revised [data/policy context](../docs/data-and-policies.md). Run `npm test`; verify inference parity when modifying model math.
