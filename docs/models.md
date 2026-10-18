# Models and evaluation

Both base models are dense 11 → 64 → 32 → 3 networks with ReLU hidden layers and quantile loss at 0.1, 0.5, and 0.9. They are trained with Adam, a fixed random seed, a reproducible 120,000-hour training subsample, validation-based early stopping, and separate interval calibration. The complete joined dataset contains **1,173,000 actual aligned hourly records**.

HeatCast learns a residual correction to heat index calculated from archived GFS 48-hour forecasts. GroundCast predicts reanalysis surface soil moisture. Features are temperature, humidity, rainfall, wind, estimated antecedent seven-day rainfall, cyclical time/season, and coordinates. All rainfall features come from archived forecasts, not future observations.

The fixed partitions are 2024 training; January–June 2025 validation; July–December 2025 uncertainty calibration; and January–September 2026 test. Ten plants are excluded from base fitting, preprocessing, soil thresholds, and interval calibration. No random temporal split is used. Held-out local calibration is labeled a separate adaptation experiment.

| Test metric, fitted sites | HeatCast | GroundCast |
| --- | ---: | ---: |
| Median MAE | 2.42441°F | 0.04966 m³/m³ |
| Baseline MAE | 3.05682°F | 0.06255 m³/m³ |
| Nominal 80% interval coverage | 80.472% | 73.536% |
| Evaluated hours | 262,080 | 262,080 |

Heat baseline: uncorrected GFS heat index. Ground baseline: training-period site median, with the global training median for unseen sites. The soil baseline is intentionally simple; this evaluation does not establish superiority to public soil forecasts. GroundCast's interval undercovers on the test period. Per-site metrics, threshold precision/recall, and unseen-site results are bundled in `public/models/evaluation.json`.

Local browser calibration uses 240 training, 96 validation, and 192 test samples per site, capped for a quick demonstration. It learns a linear correction from the frozen median prediction and seasonal features. Validation selects weights; the final test set is used only to report results. Repeated runs on these bundled samples are demonstrations, not new independent evaluations. Candidates are saved locally and never promoted into operational safety decisions.

WebGPU inference and a complete optimizer update are attempted on the actual device. The interface reports the backend used. WebGL and CPU are explicit fallbacks. Browser capability detection alone is not evidence of successful GPU training.

The atlas [scenario lab](atlas-simulation.md) is a separate deterministic experiment. It uses user-assumed storm tracks, idealized wind/rain profiles and a rainfall-excess integral; it is not a trained hurricane, inundation or outage model. Scenario outputs never train, calibrate or replace HeatCast, GroundCast or canonical task decisions. The equations and their limitations are documented separately from the evaluated models above.

### Rebuild from sources

```bash
uv venv --python 3.12
uv pip install --python .venv/bin/python -r scripts/requirements.txt
npm run data:prepare
npm run ml:train
```

Downloads are cached under ignored `data/raw/`; rerunning resumes cached work. APIs can rate-limit bulk historical requests. No synthetic weather labels or invented evaluation metrics are generated.

## HazardCast: learned next-day hazards and site index

HazardCast (`planit-hazard-2`, `public/models/hazards.json`) adds five next-day event classifiers and a learned site index. Each answers: given the forecast issued 48 hours ahead, what is the chance that an official record shows this hazard near the plant on that local day?

| Model | Channel | Positive site-day (label sources) |
| --- | --- | --- |
| WindCast | weather | Storm Events wind/convective entry within 25 mi or same county/zone; NWS wind, tornado or tropical warning/advisory (IEM archive); nearest ASOS gust ≥ 40 mph |
| FloodCast | flood | Storm Events flood/flash/coastal flood/surge; NWS flood, flash-flood, coastal-flood or surge product; NOAA tide gauge within 15 mi above its minor flood level |
| StormCast | lightning | Storm Events thunderstorm/lightning/tornado/hail entry; NWS severe-thunderstorm or tornado warning |
| FireCast | wildfire | NASA FIRMS VIIRS/MODIS nominal/high-confidence detection within 10 mi; Storm Events wildfire; NWS red-flag warning |
| HeatEventCast | heat | NWS heat advisory, excessive-heat or extreme-heat warning covering the plant zone |
| OverallCast | site index | Any Storm Events entry or NWS **warning** (advisories excluded) |

**Inputs** (fixed order in `HAZARD_FEATURES`, 30 in total):
- 21 daily aggregates of the 48h-lead GFS forecast: temperature, humidity, dew point, heat index, rain total/peak/hours, wind and gusts, CAPE, prior 3/7-day forecast rain, season and coordinates. These include the frozen HeatCast and GroundCast daily upper quantiles.
- Nine static plant traits:
  - FEMA flood zone at the plant, within 1 mi, and coastal V-zone within 2 mi.
  - USACE leveed area, nearest levee band and boreholes within 5 mi.
  - Distance to the nearest tide gauge.
  - Explicit known flags.
- Labels are never features.

**Training:**
- Wind, flood, thunderstorm and fire use a dense 30 → 32 → 16 → 1 network with positive-class weighting.
- Heat uses L2 logistic regression on the same 30 inputs (`architecture: "logistic"`, exported as one dense layer). On both 2025 periods the logistic model beat the network (AP 0.415 vs 0.348 on January–June, 0.706 vs 0.676 on July–December). This switch was made after the 2026 test had been inspected (see the process disclosure), so the choice rests on 2025 results only.
- Trained on 2024, early-stopped on January–June 2025, and Platt-calibrated on July–December 2025.
- OverallCast is an L2 logistic regression on the five calibrated log-odds, fitted on the 2025 validation and calibration predictions, which the networks never trained on.
- Of the 50 model plants, 39 are fitted and 10 are excluded throughout (fitting, normalization, calibration). Stock Island is the remaining plant (see below). Normalization uses fitted 2024 plants only.
- Each label is defined only through the earliest end of its sources (Storm Events: June 2026), so unlabelled days are never counted as test negatives.
- Stock Island has no valid GroundCast anchors and therefore no HazardCast features; it stays unknown.

**Scale:** calibrated probability maps to 0–10 through fixed policy anchors: 5% → 2, 15% → 4, 30% → 6, 45% → 7, 60% → 8, 75% → 9, 90% → 10. The anchors are documented policy, not learned. The UI also shows the ratio to the training-period monthly base rate ("× normal").

**Untouched 2026 test.**
- AP is average precision. Higher is better, and a random ranking scores the base rate.
- Rules means the production `continuous-risk` scorer applied to the same daily forecast, via `scripts/rule_baseline.ts`. It has no gauge stage, active NWS alert, fire detection or strike inputs, which the live pipeline does have. It is therefore a forecast-only rule screen, not the full operational system.
- Alternative means the other architecture on the same 30 inputs: L2 logistic regression for the network models, and the 30 → 32 → 16 → 1 network for HeatEventCast.
- Test windows differ: heat runs to September 2026. The others end in June 2026: Storm Events reporting may still be incomplete because NCEI publishes with a lag, and standard-processing FIRMS products end on 30 June 2026.

| Model | Site-days | Events (event days) | Base rate | AP | Rules AP | Alternative AP | Climatology AP | ROC-AUC | Brier skill |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| WindCast | 7,059 | 388 (82) | 5.5% | **0.353** | 0.258 | 0.342 | 0.051 | 0.854 | 0.152 |
| FloodCast | 7,059 | 195 (87) | 2.8% | **0.271** | 0.068 | 0.208 | 0.029 | 0.891 | 0.242 |
| StormCast | 7,059 | 314 (71) | 4.4% | **0.300** | 0.147 | 0.268 | 0.066 | 0.885 | 0.148 |
| FireCast | 7,059 | 782 (155) | 11.1% | **0.236** | — | 0.234 | 0.136 | 0.718 | 0.071 |
| HeatEventCast | 10,631 | 886 (78) | 8.3% | 0.649 | **0.654** | 0.602 | 0.305 | 0.955 | 0.288 |
| OverallCast | 7,059 | 638 (127) | 9.0% | **0.264** | 0.189 | — | 0.098 | 0.725 | 0.106 |

**How sure we are (day-clustered bootstrap, 95% interval for AP(model) − AP(rules)).** Storms and warnings hit many plants on the same day, so whole days are resampled. The independent sample size is the number of event days, not the number of positive site-days.

| Model | Fitted plants | Excluded plants | Excluded-plant AP (rules) |
| --- | --- | --- | ---: |
| WindCast | +0.007 to +0.177 | −0.067 to +0.086 (**not significant**) | 0.233 (0.223) |
| FloodCast | +0.146 to +0.262 | +0.036 to +0.337 (23 event days) | 0.257 (0.064) |
| StormCast | +0.072 to +0.239 | +0.043 to +0.226 | 0.256 (0.138) |
| HeatEventCast | −0.038 to +0.028 (**not significant**) | −0.118 to −0.004 (**worse**) | 0.675 (0.730) |
| OverallCast | +0.034 to +0.127 | +0.037 to +0.130 | 0.183 (0.107) |

FireCast has no rule comparison: the rule engine scores wildfire only from live FIRMS detections, not from a forecast. Against climatology its intervals are +0.073 to +0.133 at fitted plants and +0.143 to +0.257 at excluded plants (AP 0.367 vs 0.170).

**Continuation days.** NWS warnings label every day they are active, and Storm Events entries can span days, so many positives continue an event that was already under way the day before:

| Model | Positives that continue an ongoing event | Yesterday's label as the forecast (persistence AP) | Onset-only positives | Onset AP: model | rules | alternative | climatology |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| WindCast | 24% | 0.100 | 295 | **0.305** | 0.197 | 0.300 | 0.037 |
| FloodCast | 57% | 0.342 | 83 | **0.115** | 0.045 | 0.065 | 0.013 |
| StormCast | 17% | 0.066 | 261 | **0.261** | 0.118 | 0.222 | 0.054 |
| FireCast | 36% | 0.197 | 504 | 0.157 | — | **0.158** | 0.095 |
| HeatEventCast | 75% | 0.578 | 225 | 0.253 | **0.282** | 0.226 | 0.068 |
| OverallCast | 38% | 0.202 | 395 | **0.198** | 0.124 | — | 0.058 |

Persistence is an optimistic reference: the full previous-day record is not known at the 6 PM briefing, because Storm Events entries are published weeks later. Operationally, an active NWS product at briefing time plays that role, and the live pipeline scores it separately from HazardCast.

What the evidence supports:
- **StormCast** beats the rule screen, climatology and persistence at fitted and excluded plants (all intervals exclude zero), and keeps a higher AP on onset days. This is the strongest result.
- **OverallCast** beats the rule screen and climatology at fitted and excluded plants. Its edge over persistence is not significant (intervals −0.016 to +0.135 and 0.000 to +0.169).
- **FloodCast** clearly beats the rule screen, but most flood positives are continuing river-flood warnings. On onset days, AP is 0.115 vs 0.045. At excluded plants there are only 11 onset positives, too few for a claim.
- **WindCast** beats rules at fitted plants (marginally: the interval starts at +0.007). At excluded plants the difference is **not significant**.
- **The neural network adds little over a linear model.** The intervals against linear exclude zero only for flood at fitted plants, and wind, thunderstorm and fire at excluded plants.
- **HeatEventCast (logistic) ties the rule screen at fitted plants and is slightly worse at excluded plants.** It beats the network it replaced on the 2026 test (+0.022 to +0.069 at fitted plants, +0.103 to +0.192 at excluded plants). NWS heat products are issued from forecast heat-index thresholds, which the rule curve reads directly. Learned evidence can only raise a channel (`mergeEvidence`), so the rule score stays primary for heat.
- **FireCast beats climatology and persistence on its first independent test** (January–June 2026, 155 fire days), at fitted and excluded plants.
  - It is no better than a linear model at fitted plants, and its onset AP (0.157) matches linear.
  - Its probabilities stay low, so it never reaches score 7 on its own: it adds context and cannot restrict tasks by itself.
  - FIRMS detections include prescribed and agricultural burns, so FireCast measures nearby fire activity, not wildfire threat.

**Leakage control.** The same training on shuffled labels scores at or near the base rate (AP 0.053 vs base rate 0.055 for wind; 0.033 vs 0.028 for flood; 0.048 vs 0.045 for thunderstorm; 0.093 vs 0.083 for the heat logistic model). Splits are disjoint in time, normalization and climatology use fitted 2024 plants only, and no label exists after its source's coverage end.

**Excluded plants are not unseen geography.** The ten were chosen by catalog order (`i % 5 == 4`) for the original HeatCast/GroundCast split, which this repository preserves. Six of them are 24.5–30.7 mi from a fitted plant: inside the 25-mi Storm Events radius, and sharing county and zone warnings. Coordinates are model inputs. Read excluded-plant results as "plant not used in fitting", not as transfer to a new region.

**Florida plants only.** These use the same models, trained on all three states, scored only on Florida plants' 2026 days: 27 fitted and 7 excluded plants (Stock Island has no features). This view was added after the test results had been seen. It reports results and does not tune anything: the weights and every other number in this section are unchanged. Intervals are AP(model) − AP(comparator), day-clustered.

| Model | Fitted FL: events (days) | AP (rules) | vs rules, 95% | vs climatology, 95% | Excluded FL: events (days) | AP (rules) | vs rules, 95% |
| --- | ---: | ---: | --- | --- | ---: | ---: | --- |
| WindCast | 264 (58) | 0.369 (0.287) | −0.052 to +0.189 (**not significant**) | +0.222 to +0.414 | 62 (34) | 0.249 (0.231) | −0.083 to +0.113 (**not significant**) |
| FloodCast | 29 (20) | 0.224 (0.050) | +0.076 to +0.325 | +0.113 to +0.379 | 11 (11) | 0.647 (0.143) | too few events |
| StormCast | 201 (53) | 0.306 (0.176) | +0.007 to +0.251 | +0.117 to +0.361 | 48 (34) | 0.230 (0.179) | −0.036 to +0.145 (**not significant**) |
| FireCast | 565 (143) | 0.231 (—) | — | +0.059 to +0.126 | 187 (105) | 0.400 (—) | — (vs climatology +0.134 to +0.254) |
| HeatEventCast | 538 (49) | 0.601 (0.580) | −0.026 to +0.068 (**not significant**) | +0.208 to +0.373 | 123 (30) | 0.639 (0.678) | −0.131 to +0.043 (**not significant**) |
| OverallCast | 362 (90) | 0.225 (0.158) | +0.011 to +0.143 | +0.070 to +0.246 | 78 (46) | 0.196 (0.135) | +0.009 to +0.131 |

Florida looks like the full test, with less certainty. StormCast, FloodCast and OverallCast still beat the rule screen at fitted Florida plants; WindCast's edge over rules is no longer significant. Florida has far fewer flood events (base rate 0.6% vs 2.8% across all plants), because most river-flood warnings are in Louisiana and Mississippi. `evaluation.<model>.floridaTest` and `.floridaUnseen` in `hazards.json` hold the full metrics, and the Model Lab has a "Florida only" toggle.

**Calibration and detection.** Probabilities are calibrated but rarely extreme.
- At score ≥ 7, detection is low (wind 2%, flood 4%, thunderstorm 3%), with false-alarm ratios of 22–47%.
- At score ≥ 4, the models detect 25–41% of events, with false-alarm ratios of 50–71%.
- The rule composite's ≥ 7 flag catches 76% of warning-level days, but with an 88% false-alarm ratio. OverallCast concentrates warnings into far fewer days.
- Same-day NWS warnings are issued on the day itself, so they are reported only as a reference (scored against non-warning labels), not as a forecast baseline.

Independent checks (never used in training):

- **HeatCast vs airport thermometers** (IEM ASOS, nearest station within 25 mi, 2026):
  - Across all hours, HeatCast is no better than the raw forecast: 3.96 vs 3.95 °F MAE at fitted plants, and 3.84 vs 3.62 °F at excluded plants.
  - At hours ≥ 90 °F it is better at fitted plants (5.18 vs 5.41 °F) but worse at excluded plants (4.50 vs 4.17 °F).
  - HeatCast was trained against ERA5-Land reanalysis. Its reanalysis gains do not transfer cleanly to station observations.
- **OSHA severe injury reports:**
  - There were 135 heat-injury days within 50 mi of a plant.
  - Heat injuries and heat forecasts both peak in summer, so the fair comparison is the same plants in the same months.
  - On injury days the median HeatEventCast probability was 11%, against 2.7% on same-month days (0.0% across all days).
  - 44% of injury days scored ≥ 4, against 30% of same-month days.
  - The same-month pool includes the injury days themselves, so this comparison is conservative.
  - The signal beyond season is modest. Employer addresses are not work locations, so this is descriptive only.
- **NEXRAD radar storm cells** (≥ 45 dBZ within 10 mi, any storm, not just severe):
  - These occurred on 41% of 2026 test site-days.
  - StormCast ranks them better than climatology: AP 0.713 vs 0.609 and ROC-AUC 0.816 vs 0.740 at fitted plants; AP 0.694 vs 0.591 at excluded plants.
  - When StormCast scored ≥ 4, radar showed a storm cell on 80% of those days.
  - Its probabilities are not calibrated for ordinary storms (Brier skill −0.74), because it was trained to predict severe storms.

Score ≥ 9 is rare on the 14,235 validation and calibration days (`evaluation.<hazard>.scoreShare`):

| Model | Share of days at score ≥ 9 | Share at ≥ 7 |
| --- | ---: | ---: |
| Wind | 0.08% | 0.52% |
| Flood | 0% | 0.15% |
| Thunderstorm | 0% | 0.33% |
| Fire | 0% | 0% |
| Heat | 1.31% | 3.08% |
| Site index | 0.01% | 0.63% |

So the hold guardrail rarely triggers in practice.

**Process disclosure.** Test metrics were printed on every training run. The lightning label definition changed after test results had been seen (an earlier NWS-warnings-only label was replaced with Storm Events plus NWS warnings, and radar cells were moved to validation). Architecture, seed, score anchors and early stopping were fixed and not tuned on 2026. The comparisons above were added after `planit-hazard-1` was frozen. `planit-hazard-2` then made two changes with knowledge of the 2026 test:
- HeatEventCast switched to logistic regression, chosen on 2025 results.
- FireCast gained 2026 FIRMS labels (area API with `FIRMS_MAP_KEY`, same standard-processing products as training). No training, validation or calibration label changed, and the other four networks are byte-identical.

OverallCast was refitted because its heat input changed. Its weights are fitted on 2025 only. Heat's coefficient is slightly negative (−0.02), because heat advisories are not part of the warning-level overall label and heat-advisory days tend to be calm. The learned index still cannot lower a heat channel score or hold.

The Florida-only groups were added later, for reporting only. A rerun with the same seeds reproduced every weight, sample, forecast and existing metric byte for byte.

**Live and demo inference:**
- Live forecasts request `previous_day2` fields with three forecast days. If tomorrow has fewer than 20 complete hours at briefing time, its learned forecast is unavailable rather than computed from a shorter lead.
- Live inference (`server/integrations/feeds.ts`) uses the same 48h-lead fields and the shared `dailyHazardFeatures` aggregation.
- Unit tests check feature parity against raw forecast hours exported from Python, and probability parity within 1e-4.
- Catalog-only plants have no plant traits, so their learned hazards stay unknown.
- Demo mode uses `public/data/hazard-forecasts.json`, which holds test-period predictions marked `mode: historical`.
- `public/data/hazard-replay.json` lists the highest-forecast real 2026 events. They were chosen using the outcome, so they are demonstrations, not evaluation samples.

**Label sources that were not used:**
- **GOES GLM lightning flashes:** evaluated, but the files need several gigabytes per day at the measured 0.7 MB/s.
- **NOAA SWDI NLDN summaries:** not publicly served.
- **NEXRAD storm cells (≥ 45 dBZ within 10 mi):** these occur on 41% of 2026 site-days. As StormCast labels they would push it to hold most summer afternoons, so they serve as an independent check instead.

### Rebuild HazardCast

```bash
uv pip install --python .venv/bin/python -r scripts/requirements.txt
npm run data:hazards   # fetchers, daily features, data/hazards.npz
npm run ml:hazards     # train, evaluate, export hazards.json, hazard-forecasts.json, hazard-replay.json
```

On Windows, run the same steps with `.venv/Scripts/python.exe`. The 2026 fire labels need `FIRMS_MAP_KEY` in the shell or the git-ignored `.env`; without it, `fetch_firms.py` leaves 2026 fire days unlabelled and FireCast reports the calibration period instead.

## Implementation map

- Preparation and base training: [scripts](../scripts/README.md).
- Portable model contracts and CPU reference inference: [shared](../shared/README.md).
- Browser model loading, backend probing, and local calibration: [Model Lab](../src/features/model-lab/README.md).
- Frozen artifacts and evaluation: [public/models](../public/models/README.md).
- HazardCast inference and guardrails: `shared/hazard-model.ts`, `shared/policy.ts`, [risk scoring](risk-scoring.md#learned-hazards-and-guardrails).

The site catalog expansion adds 235 plants to the shared operational environmental pipeline, national visualization and crew reporting. These additions are marked `catalogOnly` and have no historical ML validation or bundled safety forecasts. The original fifty-site cohort is preserved in `model-sites.json`; model weights, samples, evaluation metrics, exclusions, and historical forecasts are unchanged. Model Lab is unavailable for catalog-only plants. These plants use the same live environmental collection and scoring pipeline; current provider forecasts also remain available in the atlas.

The operational environment pipeline now covers every site, including catalog additions. `mlCoverage` distinguishes HeatCast/GroundCast availability from environmental coverage. In real-clock mode, live risk combines normalized current conditions with fresh live fixed-lead model forecasts as separate heat/soil factors, tagged with model version and valid period. Historical forecasts cannot enter live scoring. Site-specific training soil anchors are distinguished from global held-out fallbacks. No model artifacts or training semantics changed. See [environment pipeline](environment-pipeline.md).

The supervisor timeline projects available hourly provider weather through the same scorers. It retains model-availability metadata but does not invent hourly HeatCast/GroundCast outputs. Current snapshots retain eligible live fixed-lead model evidence. See [atlas projection semantics](api.md#authoritative-supervisor-atlas).
