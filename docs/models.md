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

### Rebuild from sources

```bash
uv venv --python 3.12
uv pip install --python .venv/bin/python -r scripts/requirements.txt
npm run data:prepare
npm run ml:train
```

Downloads are cached under ignored `data/raw/`; rerunning resumes cached work. APIs can rate-limit bulk historical requests. No synthetic weather labels or invented evaluation metrics are generated.

## Implementation map

- Preparation and base training: [scripts](../scripts/README.md).
- Portable model contracts and CPU reference inference: [shared](../shared/README.md).
- Browser model loading, backend probing, and local calibration: [Model Lab](../src/features/model-lab/README.md).
- Frozen artifacts and evaluation: [public/models](../public/models/README.md).

The site catalog expansion adds 235 plants to the shared operational environmental pipeline, national visualization and crew reporting. These additions are marked `catalogOnly` and have no historical ML validation or bundled safety forecasts. The original fifty-site cohort is preserved in `model-sites.json`; model weights, samples, evaluation metrics, exclusions, and historical forecasts are unchanged. Model Lab is unavailable for catalog-only plants. These plants use the same live environmental collection and scoring pipeline; current provider forecasts also remain available in the atlas.

The operational environment pipeline now covers every site, including catalog additions. `mlCoverage` distinguishes HeatCast/GroundCast availability from environmental coverage. In real-clock mode, live risk combines normalized current conditions with fresh live fixed-lead model forecasts as separate heat/soil factors, tagged with model version and valid period. Historical forecasts cannot enter live scoring. Site-specific training soil anchors are distinguished from global held-out fallbacks. No model artifacts or training semantics changed. See [environment pipeline](environment-pipeline.md).

The supervisor timeline projects available hourly provider weather through the same scorers. It retains model-availability metadata but does not invent hourly HeatCast/GroundCast outputs. Current snapshots retain eligible live fixed-lead model evidence. See [atlas projection semantics](api.md#authoritative-supervisor-atlas).
