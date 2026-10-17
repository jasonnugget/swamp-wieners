# Shared contracts and pure calculations

This directory is imported by the client, server, and unit tests. Keep it free of network calls, browser storage, filesystem access, React, and TensorFlow runtime dependencies.

| File | Responsibility |
| --- | --- |
| `types.ts` | Site, forecast, sample, model, evidence, decision, briefing, and snapshot contracts |
| `model.ts` | Feature construction, NOAA heat-index calculation, and portable dense-network inference |
| `policy.ts` | Independent task rules, geodesic strike checks, lightning timers and period adapters |
| `risk.ts`, `providers.ts` | Versioned observations/snapshots, structured evidence and runtime metadata validation |
| `risk-config.ts`, `risk-scoring.ts` | Continuous channel curves, evidence merge, confidence and dominant-plus-compounding risk |
| `crew-risk.ts` | Confirmed semantic classifications, report aging and explicit task controls |
| `atlas.ts` | Batched risk-frame contract, display selectors/colors and supervisor ranking |
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

`weather.ts` contains provider transport contracts and US camera bounds. The provider readings also supply the canonical live environmental pipeline; compatibility weather routes retain their transport shapes; atlas display contracts live in `atlas.ts`. Preserve null readings and provider timestamps.

`Site.catalogOnly` identifies national catalog additions outside the historical model cohort. Their safety coverage must not inherit another plant's forecast or appear in historical model evaluation. `WeatherScreening` carries separate NOAA/NWS deterministic hourly heat-index and wind estimates. Period-specific compatibility decisions use these when custom forecasts are unavailable, over the next 24 hours. Canonical current normalization uses only the matching hour as a missing-field fallback. Fetches expire after three hours; provider issue times expire after 24 hours. Unknown hazards stay unknown, and independent holds take priority. During a demo, these screenings use actual system time and are labeled live, while reports and replay strikes use the demo clock. Real-clock briefings select the next local day's screening hours.

`risk.ts` defines the observation validator, site snapshot, structured drivers and evidence factors. `risk-config.ts` centralizes continuous thresholds and evidence weights; `risk-scoring.ts` contains the pure channel functions, evidence merge and dominant-plus-compounding composite. `crew-risk.ts` validates semantic crew classifications and preserves explicit task selections. `policy.ts` uses these same numerical functions for replay/briefing adapters and independently applies task rules. See [formulas and calibration assumptions](../docs/risk-scoring.md).

`providers.ts` defines runtime-validated source and field metadata. Canonical observations include provider statuses/expiry and per-field confidence/timestamps; lightning distinguishes LIVE, DEMO, FORECAST and UNAVAILABLE. Per-field confidence caps apply in shared scoring. See [provider semantics](../docs/environment-providers.md).

`atlas.ts` defines the canonical national risk-frame response, layer field selectors, continuous display palette and supervisor ranking. Display selectors never calculate hazard scores. Ranking puts active holds first, then significant known risk, then insufficient evidence ahead of observed low-risk sites. `weather.ts` retains provider transport contracts and region bounds; map layers read the canonical snapshot, with no browser hazard scoring.
