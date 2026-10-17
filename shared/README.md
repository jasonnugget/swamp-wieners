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

`CrewTeam` ties a roster of reporting names to plant IDs. Snapshots include teams. Report team IDs and names are optional so existing and unassigned reports remain valid; a stored report's team name is historical context.

- Keep the feature order synchronized with `scripts/train.py`. Quantile ordering, residual targets, scale/offset, clipping, and interval adjustment must match exports and browser inference.
- Unknown or stale evidence does not become zero risk. A low prediction cannot clear an existing report or lightning hold.
- Lightning holds last thirty minutes from the latest qualifying strike within ten miles. Ignore future timestamps; duplicate events must not extend the timer beyond their timestamp.
- Task-specific reports cannot hide another environmental restriction in the same hazard category. Resolution clears only that report's holds.
- Work-window bands represent model screening, not a site all-clear.

Change interfaces here before changing producers and consumers. Policy changes need a deliberate policy-version update and revised [data/policy context](../docs/data-and-policies.md). Run `npm test`; verify inference parity when modifying model math.

`weather.ts` contains atlas contracts, display scales, US camera bounds, WMO descriptions, and forecast valid-time selection. This display data is separate from the existing `Forecast` and `Decision` safety contracts. Preserve null readings and provider timestamps.

`Site.catalogOnly` identifies national catalog additions outside the historical model cohort. Their safety coverage must not inherit another plant's forecast or appear in historical model evaluation. `WeatherScreening` carries separate NOAA/NWS deterministic hourly heat-index and wind estimates. Policy version `demo-policy-2` uses these when custom forecasts are unavailable, over the next 24 hours. Fetches expire after three hours; provider issue times expire after 24 hours. Unknown hazards stay unknown, and independent holds take priority. During a demo, these screenings use actual system time and are labeled live, while reports and replay strikes use the demo clock. Real-clock briefings select the next local day's screening hours.
