# Historical data and base-model pipeline

Run these scripts from the repository root using the project Python environment. Existing browser artifacts are bundled, so app startup does not require these downloads.

| File | Inputs | Outputs |
| --- | --- | --- |
| `prepare_data.py` | EIA workbook, archived 48h GFS forecasts, reanalysis targets | Local aligned `data/training.npz`, public sites and provenance |
| `train.py` | Aligned data and selected sites | Model weights/evaluation, browser samples, historical forecasts, scenario |
| `requirements.txt` | NumPy, pandas, openpyxl, requests | Python dependency specification |

```bash
uv venv --python 3.12
uv pip install --python .venv/bin/python -r scripts/requirements.txt
npm run data:prepare
npm run ml:train
```

Raw responses are cached under ignored `data/raw/`. Downloads retry selected temporary failures and can be resumed using existing cache files. Do not generate synthetic targets to fill missing records. Stock Island uses the documented ERA5 coastal fallback.

Preserve chronological partitions, ten excluded sites, training-only scaling and thresholds, fixed feature order, and nominal forecast lead times. Test labels cannot select model weights. The deliberately selected high-forecast demo day is a scenario, not a representative evaluation sample.

Update artifact version/provenance when model semantics change. Regenerate public outputs together so site IDs, weights, samples, metrics, and forecast quantiles remain consistent. Check Python syntax, then run `npm test` for exported-data and inference parity checks. See [model methodology](../docs/models.md).
