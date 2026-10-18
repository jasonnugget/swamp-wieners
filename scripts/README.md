# Historical data and base-model pipeline

Run these scripts from the repository root using the project Python environment. Existing browser artifacts are bundled, so app startup does not require these downloads.

| File | Inputs | Outputs |
| --- | --- | --- |
| `prepare_data.py` | EIA workbook, archived 48h GFS forecasts, reanalysis targets | Local aligned `data/training.npz`, public sites and provenance |
| `train.py` | Aligned data and selected sites | Model weights/evaluation, browser samples, historical forecasts, scenario |
| `requirements.txt` | NumPy, pandas, openpyxl, requests, pyarrow | Python dependency specification |
| `common.py` | Shared paths, cached/retried HTTP, splits, heat index, NumPy quantile inference | Imported by the HazardCast scripts and `prepare_data.py` |
| `fetch_static.py` | NWS zones, FEMA NFHL, USACE NLD, NOAA CO-OPS stations | `data/features/site_static.json` |
| `fetch_storm_events.py`, `fetch_iem.py` | NOAA Storm Events details; IEM NWS warning archive | `data/labels/storm_events.csv`, `iem_warnings.csv` |
| `fetch_asos.py`, `fetch_tides.py`, `fetch_firms.py` | IEM ASOS, CO-OPS high water, NASA FIRMS (optional `FIRMS_MAP_KEY`) | Gust, tide and fire labels; hourly ASOS for validation |
| `fetch_osha.py`, `fetch_storm_cells.py` | OSHA severe injuries; SWDI NEXRAD storm cells | Validation-only records |
| `prepare_hazard_features.py` | Archived 48h GFS hourly fields + frozen bundle | `data/features/daily.parquet`, `hourly.parquet` |
| `build_hazard_dataset.py` | Features, static traits, labels | `data/hazards.npz`, dataset summary in `data/hazard-label-report.json` |
| `train_hazards.py`, `evaluate_hazards.py`, `rule_baseline.ts` | HazardCast dataset; production TS scorer as baseline | `public/models/hazards.json`, `public/data/hazard-forecasts.json`, `hazard-replay.json`, provenance `hazardCast` |

```bash
uv venv --python 3.12
uv pip install --python .venv/bin/python -r scripts/requirements.txt
npm run data:prepare
npm run ml:train
```

HazardCast: `npm run data:hazards` then `npm run ml:hazards` (Windows: run each script with `.venv/Scripts/python.exe`). Run `ml:hazards` after `data:prepare`, which rewrites provenance. Labels are defined only through each source's coverage end; never use them as features. Evaluation also exports day-clustered bootstrap intervals, persistence, onset-only and same-feature logistic baselines, and a shuffled-label control; the model is frozen, so treat these as checks, not targets to tune against. The daily feature order in `prepare_hazard_features.py` must match `HAZARD_FEATURES` in `shared/hazard-model.ts`; `tests/unit/hazard-model.test.ts` checks both feature and probability parity. See [HazardCast](../docs/models.md#hazardcast-learned-next-day-hazards-and-site-index).

Raw responses are cached under ignored `data/raw/`. Downloads retry selected temporary failures and can be resumed using existing cache files. Do not generate synthetic targets to fill missing records. Stock Island uses the documented ERA5 coastal fallback.

Preserve chronological partitions, ten excluded sites, training-only scaling and thresholds, fixed feature order, and nominal forecast lead times. Test labels cannot select model weights. The deliberately selected high-forecast demo day is a scenario, not a representative evaluation sample.

Update artifact version/provenance when model semantics change. Regenerate public outputs together so site IDs, weights, samples, metrics, and forecast quantiles remain consistent. Check Python syntax, then run `npm test` for exported-data and inference parity checks. See [model methodology](../docs/models.md).

`expand_sites.py` builds the national catalog from the same EIA-860M operating-generator workbook: preserve the original fifty plants, then choose five substantial, geographically spread plants in each other state. Generator nameplate capacities are summed per EIA plant ID. TimezoneFinder resolves IANA zones from actual coordinates. Run `npm run data:catalog` to regenerate `sites.json`, `model-sites.json`, and `site-catalog.json` without weather downloads or retraining. The historical pipeline still downloads/trains only the original fifty-site cohort; `prepare_data.py` also regenerates the expanded catalog and `train.py` reads `model-sites.json`. Do not treat added catalog locations as model validation sites.
