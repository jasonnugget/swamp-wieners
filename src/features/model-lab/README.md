# Model Lab

| File | Responsibility |
| --- | --- |
| `ModelLab.tsx` | Model selection, metrics, training controls, historical replay, and sensitivity UI |
| `browser-ml.ts` | TensorFlow model loading, measured inference, training probes, local calibration, and IndexedDB persistence |
| `tensorflow.ts` | TensorFlow core/layers exports and required backend/gradient registration |

Load the base networks from `public/models/bundle.json` and disjoint samples from `public/data/samples.json`. Feature order and preprocessing must match `shared/model.ts` and the Python export. The three outputs represent the 10th, 50th, and 90th percentiles.

A browser candidate fits a linear residual correction using base predictions and seasonal features. Training fits parameters, validation chooses weights, and the later test partition reports error. Never use test outcomes to choose weights or silently activate candidates in operational decisions. Display both improvement and degradation honestly.

Backend detection is not enough: `probeTraining()` executes an optimizer update before reporting training support. Label WebGL/CPU fallbacks accurately. Dispose tensors and optimizer state after runs. Saved candidates include site, target, base-model version, sample counts, weights, and timing; reject saved candidates with a mismatched version.

Run `npm run test:e2e` for actual inference, training, reference parity, IndexedDB persistence, and offline reload. [Model methodology](../../../docs/models.md) documents the base-model evaluation.
