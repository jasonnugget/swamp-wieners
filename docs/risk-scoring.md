# Continuous hazard scoring

`continuous-risk-5` defines numerical scoring; `continuous-policy-5` defines task controls. Configuration lives in `shared/risk-config.ts`, pure scoring in `shared/risk-scoring.ts`, crew semantics in `shared/crew-risk.ts`, and task policy in `shared/policy.ts`. Live snapshots, historical replay and newly generated forecast-period briefings use the same numerical functions. Existing stored briefings are immutable and retain their original policy version.

## Composite

Sort known channel scores descending. Let `p` be the primary score and:

```text
S = sum((max(0, secondary - 1) / 9)²)
risk = p + (10 - p) × (1 - exp(-0.35 × S))
```

Round the composite to one decimal after aggregation. Returned channel scores also use one decimal; intermediate curves and evidence blends retain precision. A completely zero-scored site has no primary hazard driver. A single hazard retains its score; secondary hazards add a bounded share of remaining headroom. Values at or below 1 do not compound. Unknown channels are excluded. No known inputs produces null, while seven measured zero scores produce zero. The example `[7,6,5,3,1,0,2]` yields 7.5, compared with 7 for a single hazard. Seven scores of 5 remain below 8. Adding low scores never dilutes a severe hazard.

The snapshot returns `explanation.primary`, `compounding` entries with hazard/score/strength, `secondaryStrength`, `uplift`, and the formula. Consumers can identify drivers by category without parsing narrative evidence. Factors retain key, value, score, weight, confidence, source, kind, mode and forecast valid times where applicable. Factor weights describe confidence completeness and, for weighted channel blends, the local scoring mixture. Floor and reinforcement factors do not use an arithmetic weighted mean. There is no second site-wide weighted average.

## Channel calibration

All mappings use piecewise linear interpolation, clamp to 0 through 10 and preserve null. These are prototype screening assumptions, not regulatory exposure limits or validated outcome probabilities.

| Channel | Numerical behavior |
| --- | --- |
| Heat | Heat index 80/90/100/103/115/125°F maps to 0/2/4/6/8/10. Apparent temperature is a lower-confidence fallback. |
| Weather | Wind and gust speeds 10/20/30/40/50/65 mph map to 0/1/3/5/7/10. Hourly rain 0/2/10/25/50 mm maps to 0/1/4/7/10. Merge those screens with the evidence rule below. Categorical WMO thunderstorm/hail codes supply configured weather floors, without inventing lightning detection. Other valid codes (clear, cloudy, light rain) show as a 0 factor rather than unknown; they never set the channel score on their own. |
| Soil | Percentiles 0/50/70/80/90/95/99 map to 0/1/3/5/7/9/10. The record stores percentiles as fractions from 0 to 1. Prefer a supplied percentile, then surface training anchors, then a low-confidence absolute-moisture fallback. |
| Flood | Combine rainfall 35%, gauge 45%, mapped exposure 20%, renormalizing available components. Rain combines 1h/24h/7d screens at 40/40/20%. Gauge combines stage percentile and stage trend at 80/20%. Trend units are meters/hour. Floodplain membership supplies a static screen of 4; verified non-membership supplies 0. |
| Wildfire | Combine active-fire distance 50%, radiative power 20%, detection recency 15%, wind 10%, and dryness 5%, renormalizing available components. Distance alone maps 80/30/10/3/0 miles to 1/3/6/9/10, but the other factors change the result when available. A fire-specific score requires a located fire; weather alone does not establish one. |
| Lightning | CAPE-derived potential 0/.2/.5/.8/1 maps to 0/1/3/5/6. Detected-strike distance and count have separate curves. Forecast potential is never treated as detection or detector coverage. A strike at the site scores 9.5, independently of the outdoor hold. |
| Wildlife | Screened potentially relevant sightings and distance combine at 60/40%. Counts 0/1/3/10/20 map to 0/4/6/9/10. Proximity, supplied semantic severity and sighting age affect the score. Sighting evidence decays with a 24-hour half-life, retaining 10% at minimum. No sightings alone leaves risk null. Public species relevance does not establish a dangerous incident or create a severity floor; confirmed crew evidence is merged separately. |

The full rainfall, gauge, wildfire power/age/dryness, lightning and wildlife curves are in the configuration file. A recent empty NWS check establishes absence of an alert, not absence of the hazard. Named alert floors include Flood Warning 8, Flash Flood Warning 9, Red Flag Warning 6, other warnings 7, watches 4 and advisories 3. Exact NWS event names are stored separately from headlines. Older alerts without event names use bounded legacy severity floors up to 8. Unexpired alerts survive failed refreshes.

## Soil and frozen models

The existing bundle contains training-period surface moisture quantiles at the 50th, 90th and 95th percentiles. Surface scores interpolate through those anchors at 1/7/9, with physical bounds 0 and 1 supplying endpoint scores 0 and 10. This is an approximation between sparse anchors, not a recovered full distribution. Root-zone depths differ from the model's surface target and do not use those surface anchors. Without calibration, absolute moisture uses a provisional low-confidence curve. Held-out plants do not claim site-specific calibration from the global thresholds bundled for those plants.

HeatCast and GroundCast remain frozen. In real-clock mode, the live engine accepts same-site live forecasts fetched within three hours, with valid hours between one hour ago and 48 hours ahead and issue times no later than now. Upper quantile predictions contribute additional heat/soil factors, tagged with model version, source mode and valid period. They do not overwrite current observations. Historical forecasts cannot enter live snapshots. Replay/briefing adapters use their explicitly selected forecast periods and the same channel scoring functions. Local browser candidates never become operational models. Training data, splits, weights and evaluation evidence are unchanged.

## Crew reports and JEV

Provisional MODERATE crew evidence starts at severity 4 with confidence 0.4 before age adjustment. It also preserves the crew's explicit selected-task holds. Age reduces numerical influence with a 24-hour half-life, retaining at least half for an unresolved report; it never expires the task hold. Report timestamps follow the workspace clock, while canonical current risk uses system time: a newly submitted historical-demo report can already be aged in current scoring, with its explicit hold still active.

JEV receives fixed semantic Choice questions for category, severity, immediacy and each affected task. It returns no final risk number. The adapter validates every required choice and the provider's confidence, then emits:

```json
{"category":"soil","severity":"HIGH","immediacy":"RESTRICT","affectedTasks":["mobilization"],"confidence":"HIGH","summary":"Truck stuck near access road"}
```

The summary is copied from the crew description because System One classifies choices rather than generating freeform prose. Confidence labels use the minimum provider confidence across required answers: HIGH at 0.8, MEDIUM at 0.5, otherwise LOW. Missing, invalid or uncertain classification and provider failures leave manual evidence operational and mark JEV unavailable. Tests use fixtures; no live authenticated JEV call was required.

A reviewer must confirm the classification before it changes operational numerical evidence or adds suggested task controls. The deterministic severity map is INFORMATIONAL 1, LOW 2, MODERATE 4, ELEVATED 6, HIGH 8, CRITICAL 10. Future confirmations cannot influence earlier states. Confirmed crew confidence starts at .35/.6/.85 by label and decays with report age.

Merge independent environmental/model/crew evidence as:

```text
high = max(a, b)
low = min(a, b)
merged = high + (10 - high) × 0.1 × (low / 10)²
```

This retains the stronger evidence with small bounded reinforcement. Environmental 4.3 plus crew HIGH 8 rounds to 8.0. Repeated reports in one channel use the strongest report floor instead of accumulating toward 10. Resolving a report removes its evidence and its own controls, preserving other sources. Public wildlife factors have confidence .6; confirmed high-confidence crew evidence has greater authority.

## Policy and confidence

A channel score of 7 is an explicit prototype restriction rule. An environmental or learned channel score of 9 or more holds that channel's field tasks (see [guardrails](#learned-hazards-and-guardrails)). Independent rules preserve heat controls at 103°F and wind controls at 50 km/h, even where the new continuous curve has a lower numerical score. Soil restrictions retain the training 90th-percentile screen. Named official alerts restrict affected outdoor tasks; legacy Extreme-alert evidence retains its existing hold rule. A ten-mile detected strike independently holds mobilization and installation until thirty minutes after the latest qualifying strike. Future or outside-radius strikes do not extend that timer. Preparation is available unless a report explicitly affects it.

Crew-selected tasks stay HOLD until resolution. Confirmed JEV MONITOR cannot release them; RESTRICT or HOLD can add controls to other affected tasks. The score alone never extends a lightning countdown or clears an override. Canonical decision channels retain mathematical severity, while their status can independently say HOLD.

Channel confidence reflects available factor weights, nested rain/gauge completeness and source quality. Apparent-temperature fallback is .7; soil training anchors .7; uncalibrated soil .35; frozen model evidence .65; forecast lightning .5. These are heuristic evidence weights, not statistically calibrated probabilities. Snapshot confidence is the lesser of field coverage and the channel-confidence mean weighted by `1 + channelScore`; unknown channels remain in the confidence denominator with weight 1. It therefore cannot claim high completeness when primary feeds are disconnected.

The existing 17-field coverage contract remains separate from confidence. Additional ML and crew scoring factors do not inflate environmental observation coverage; usable normalized provider forecast fields count as inputs. Consumers must present risk, coverage/confidence, drivers and operational overrides together. USGS, FEMA and public wildlife now supply provider evidence; FIRMS has keyless regional downloads and optional keyed area queries; live lightning network access remains unavailable by default. Provider expiry and per-field source confidence constrain scoring. See [source integration details](environment-providers.md). No fabricated readings fill unavailable sources.

## Learned hazards and guardrails

HazardCast (`shared/hazard-model.ts`, [model evaluation](models.md#hazardcast-learned-next-day-hazards-and-site-index)) supplies calibrated next-day probabilities for wind, flood, thunderstorm, fire activity and heat events at the original 50 model plants (39 fitted, 10 excluded from fitting, and Stock Island, which has no features and stays unknown).

**Channel factors.** Each probability becomes a 0–10 score through `scoreAnchors` and is added as a `forecast` factor to its channel:

| Factor | Channel |
| --- | --- |
| `windCast` | weather |
| `floodCast` | flood |
| `stormCast` | lightning |
| `fireCast` | wildfire |
| `heatEventCast` | heat |

- The factor is merged with `mergeEvidence`, so a learned score can raise a channel but never lower rule, observation or alert evidence.
- Live evidence must be fetched within `hazardModel.fetchTtlHours` (3 h), issued before now, and cover the site-local date. Factor confidence is 0.7.
- Historical predictions enter only demo decisions and briefings, labelled `historical`. They never enter live scoring.
- Soil remains GroundCast. Wildlife remains crew and public evidence.

**Learned site index.** When fresh OverallCast evidence exists, the site `risk` is `max(OverallCast score, highest channel score)`.
- `explanation.learned` carries the probability, the monthly base rate, per-hazard log-odds contributions and the rule composite.
- The learned index never sits below the worst single channel.
- Without HazardCast evidence (catalog plants, stale or missing forecasts), the dominant-plus-compounding formula above remains the fallback.

**Guardrails** (`policy.holdScore` 9) can only tighten decisions:

- An environmental or learned channel score ≥ 9 sets that channel to HOLD for its usual tasks: heat stops installation, soil stops mobilization, other channels stop both. Preparation stays available.
- OverallCast index ≥ 9 holds mobilization and installation.
- Crew severity is excluded from the score guardrail (`HazardScore.environmentScore`). Crew holds still apply only to the tasks the crew selected.
- A low prediction never clears a detected-strike countdown, an official alert, a crew hold, or UNKNOWN coverage. A learned score can raise a channel's status, but cannot change UNKNOWN to AVAILABLE.
- Score ≥ 7 restricts, as before. The UI labels AVAILABLE/RESTRICTED/HOLD as GO/CAUTION/NO-GO.

On 2025 validation and calibration days, learned scores ≥ 9 occurred on 0.08% of wind days, 1.31% of heat days and 0.01% of site-index days, and never for flood, thunderstorm or fire (`evaluation.<hazard>.scoreShare`). A rule-only consequence of the new hold is that a flash-flood warning floor (9) and soil at the training 95th percentile anchor (9) now hold.

## Supervisor presentation

The map reads these scores and structured explanations through `/api/risk/atlas`, with no frontend numerical risk engine. Raw temperature/rain/wind remain separate layers from channel scores. Missing values use a gray question mark; known low-confidence values are dashed and translucent. Current ranking puts active holds first, then known risk at least 4, then insufficient evidence before observed low-risk sites. A site is insufficiently observed when risk is null, confidence is below 0.5 or coverage is below 50%. These review priorities do not change numerical risk.

Forecast frames apply the same scorer, model context and soil calibration as the current snapshot to available hourly weather. Actual source fetch times are retained and source and model freshness are checked at request time. Inputs with no hourly forecast (gauge stages, fire detections, detected strikes and their holds, sightings, alert checks, open reports) are held at their latest reading; official alerts still expire at their stated time. A day's HazardCast output applies to every hour of that day, and the latest issued day stands in beyond the model horizon. After a failed weather refresh, the last hourly forecast stands in for up to six hours at reduced confidence and is marked stale. See [the atlas API](api.md#authoritative-supervisor-atlas).
