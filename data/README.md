# Local pipeline data

This directory contains local inputs and intermediates for [the Python pipeline](../scripts/README.md). It is distinct from `public/data/`, which contains the smaller committed browser/demo exports.

| Path | Contents | Tracked? |
| --- | --- | --- |
| `raw/` | EIA workbook and hashed cached Open-Meteo JSON responses | No |
| `training.npz` | Full aligned NumPy arrays: features, targets, baseline, time, site ID | No |
| `README.md` | Context for these generated paths | Yes |

Run `npm run data:prepare` from the repository root to build the intermediate. Run `npm run ml:train` to consume it and produce public artifacts. Reusing raw caches avoids repeating successful bulk downloads after a service rate limit.

Do not move private uploads, environment credentials, or runtime records here. Do not commit raw downloads or the full training intermediate. See [data provenance and limits](../docs/data-and-policies.md).
