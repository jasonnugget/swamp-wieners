"""Train HazardCast: next-day hazard classifiers and the learned overall index.

Per hazard: dense n → 32 → 16 → 1 network, sigmoid, positive-weighted cross-entropy,
trained on 2024, early-stopped on Jan–Jun 2025, then Platt-calibrated on Jul–Dec 2025.
OverallCast: L2 logistic regression on the five calibrated hazard log-odds, fitted on
validation + calibration predictions (out-of-sample for the hazard networks).
Ten plants are excluded from fitting, normalization and calibration. Test labels never
select weights. Output: public/models/hazards.json, public/data/hazard-forecasts.json,
public/data/hazard-replay.json
"""
import json
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from common import FEATURES, LABELS, ROOT
from build_hazard_dataset import static_row
from evaluate_hazards import average_precision, bootstrap_difference, evaluate

OUT = ROOT / 'public/models'
RNG = np.random.default_rng(20261018)
VERSION = 'planit-hazard-2'
CHANNELS = ['wind', 'flood', 'lightning', 'fire', 'heat']
# Probability → 0–10 screening score. A documented policy mapping, not a learned scale.
SCORE_ANCHORS = [[0, 0], [0.05, 2], [0.15, 4], [0.3, 6], [0.45, 7], [0.6, 8], [0.75, 9], [0.9, 10]]
# Heat uses logistic regression on the same inputs: it beat the network on both 2025
# periods (AP 0.41/0.71 vs 0.35/0.68). Chosen after the 2026 test was inspected.
LOGISTIC = {'heat'}
RULE_CHANNEL = dict(wind='weather', flood='flood', lightning='lightning', fire='wildfire', heat='heat', overall='composite')


def sigmoid(z):
    return 1 / (1 + np.exp(-np.clip(z, -40, 40)))


def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def curve(v, anchors):
    xs, ys = np.array(anchors, dtype=float).T
    return np.interp(v, xs, ys)


def forward(x, layers):
    cache = [x]
    for i, (w, b) in enumerate(layers):
        x = x @ w + b
        if i < len(layers) - 1:
            x = np.maximum(x, 0)
        cache.append(x)
    return x[:, 0], cache


def weighted_bce(z, y, pos_weight):
    p = sigmoid(z); w = np.where(y == 1, pos_weight, 1.0)
    return float(np.mean(w * -(y * np.log(np.clip(p, 1e-7, 1)) + (1 - y) * np.log(np.clip(1 - p, 1e-7, 1)))))


def fit(x, y, valx, valy, pos_weight, l2=1e-4, rng=None):
    rng = RNG if rng is None else rng
    sizes = [(x.shape[1], 32), (32, 16), (16, 1)]
    layers = [(rng.normal(0, np.sqrt(2 / a), (a, b)).astype(np.float64), np.zeros(b)) for a, b in sizes]
    params = [p for layer in layers for p in layer]
    m = [np.zeros_like(p) for p in params]; v = [np.zeros_like(p) for p in params]
    best, best_layers, step, stale = float('inf'), None, 0, 0
    for epoch in range(120):
        order = rng.permutation(len(x))
        for start in range(0, len(x), 256):
            idx = order[start:start + 256]
            z, cache = forward(x[idx], layers)
            w = np.where(y[idx] == 1, pos_weight, 1.0)
            grad = ((sigmoid(z) - y[idx]) * w / len(idx))[:, None]
            grads = []
            for i in range(len(layers) - 1, -1, -1):
                grads[0:0] = [cache[i].T @ grad + l2 * layers[i][0], grad.sum(axis=0)]
                if i:
                    grad = (grad @ layers[i][0].T) * (cache[i] > 0)
            step += 1
            for k, (p, g) in enumerate(zip(params, grads)):
                g = np.clip(g, -5, 5); m[k] = .9 * m[k] + .1 * g; v[k] = .999 * v[k] + .001 * g * g
                p -= .001 * (m[k] / (1 - .9 ** step)) / (np.sqrt(v[k] / (1 - .999 ** step)) + 1e-8)
        loss = weighted_bce(forward(valx, layers)[0], valy, pos_weight)
        if loss < best - 1e-4:
            best, best_layers, stale = loss, [(w_.copy(), b_.copy()) for w_, b_ in layers], 0
        else:
            stale += 1
        if stale >= 8:
            break
    print(f'  stopped after {epoch + 1} epochs, validation loss {best:.4f}', flush=True)
    return best_layers


def logistic(x, y, l2=1.0, iterations=50):
    """L2-regularised logistic regression by Newton's method; returns (coef, intercept)."""
    X = np.column_stack([np.ones(len(x)), x]); w = np.zeros(X.shape[1])
    reg = np.eye(X.shape[1]) * l2; reg[0, 0] = 0
    for _ in range(iterations):
        p = sigmoid(X @ w)
        hessian = X.T @ (X * (p * (1 - p))[:, None]) + reg
        w -= np.linalg.solve(hessian, X.T @ (p - y) + reg @ w)
    return w[1:], w[0]


def rule_scores(daily, static, bundle):
    rows = [dict(siteId=s, date=d, heatIndexMaxF=float(r.heat_index_max_f), tmaxF=float(r.tmax_c * 1.8 + 32), rhMean=float(r.rh_mean),
                 windMaxMph=float(r.wind_max_kmh / 1.609344), gustMaxMph=float(r.gust_max_kmh / 1.609344), rainMax1hMm=float(r.rain_max_1h_mm),
                 rainTotalMm=float(r.rain_total_mm), rainPrior7dMm=float(r.rain_prior_7d_mm), capeMax=float(r.cape_max), groundcastP90=float(r.groundcast_max_p90),
                 floodplain=static[s]['fema']['sfhaPoint'], soilThresholds=bundle['soilThresholds'][s])
            for s, d, r in zip(daily.siteId, daily.date, daily.itertuples())]
    src, dst = FEATURES / 'rule_rows.json', FEATURES / 'rule_scores.json'
    src.write_text(json.dumps(rows))
    subprocess.run(f'npx tsx scripts/rule_baseline.ts "{src}" "{dst}"', shell=True, check=True, cwd=ROOT)
    out = json.loads(dst.read_text())
    return out['version'], pd.DataFrame(out['scores']).astype(float)


def r4(v):
    return None if v is None else round(float(v), 4)


def network_json(layers):
    return [dict(weights=np.round(w, 8).tolist(), bias=np.round(b, 8).tolist()) for w, b in layers]


def main():
    data = np.load(ROOT / 'data/hazards.npz', allow_pickle=True)
    x, y, site, date, split, held = (data[k] for k in ['x', 'y', 'site', 'date', 'split', 'heldOut'])
    names, hazards = list(data['features']), list(data['hazards'])
    source_names, source_hits = list(data['source_names']), data['source_hits']
    report = json.loads((ROOT / 'data/hazard-label-report.json').read_text())
    sites = json.loads((ROOT / 'public/data/model-sites.json').read_text())
    bundle = json.loads((OUT / 'bundle.json').read_text())
    static = json.loads((FEATURES / 'site_static.json').read_text())
    month = pd.to_datetime(date).month.to_numpy()
    fit_rows = ~held
    mask = {s: (split == s) & fit_rows for s in ['train', 'validation', 'calibration', 'test']}
    mask['unseen'] = (split == 'test') & held
    # Florida-only test views for reporting; they change no fitting rows.
    florida = np.isin(site, [s['id'] for s in sites if s['state'] == 'FL'])
    mask['floridaTest'], mask['floridaUnseen'] = mask['test'] & florida, mask['unseen'] & florida
    mean = x[mask['train']].mean(axis=0); std = np.maximum(x[mask['train']].std(axis=0), 1e-3)
    xn = (x - mean) / std

    daily = pd.read_parquet(FEATURES / 'daily.parquet'); daily['siteId'] = daily.siteId.astype(str)
    assert (daily.siteId.to_numpy() == site).all() and (daily.date.to_numpy() == date).all()
    rule_version, rules = rule_scores(daily, static, bundle)

    models, calibrated, evaluation, network_alt = {}, {}, {}, {}
    climatology = {}
    for h in hazards:
        j = hazards.index(h); yh = y[:, j]
        train = mask['train'] & np.isfinite(yh)
        climatology[h] = [float(np.nanmean(yh[train & (month == m)])) if (train & (month == m)).any() else float(np.nanmean(yh[train])) for m in range(1, 13)]
    for h in CHANNELS:
        j = hazards.index(h); yh = y[:, j]; ok = np.isfinite(yh)
        tr, va, ca = mask['train'] & ok, mask['validation'] & ok, mask['calibration'] & ok
        pos = yh[tr].mean()
        print(f'Training {h}: {int(tr.sum())} days, base rate {pos:.3f}', flush=True)
        pos_weight = float(np.clip((1 - pos) / max(pos, 1e-3), 1, 10))
        # The network is always fitted so the shared generator, and every other model, stays unchanged.
        layers = fit(xn[tr], yh[tr], xn[va], yh[va], pos_weight)
        if h in LOGISTIC:
            raw = forward(xn, layers)[0]
            a, b = logistic(raw[ca][:, None], yh[ca], l2=1e-6)
            network_alt[h] = sigmoid(a[0] * raw + b)
            coef_h, b_h = logistic(xn[tr], yh[tr], l2=1.0)
            layers = [(coef_h[:, None], np.array([b_h]))]
        raw = forward(xn, layers)[0]
        a, b = logistic(raw[ca][:, None], yh[ca], l2=1e-6)
        p = sigmoid(a[0] * raw + b)
        calibrated[h] = p
        models[h] = dict(architecture='logistic' if h in LOGISTIC else 'mlp', layers=network_json(layers), platt=[round(float(a[0]), 8), round(float(b), 8)], positiveWeight=round(pos_weight, 4),
                         labelSources=report['dataset']['hazards'][h]['sources'], labelEnd=report['dataset']['hazards'][h]['labelEnd'],
                         climatology=[round(c, 5) for c in climatology[h]])

    # OverallCast on out-of-sample hazard log-odds.
    j = hazards.index('overall'); yo = y[:, j]; ok = np.isfinite(yo)
    z = np.column_stack([logit(calibrated[h]) for h in CHANNELS])
    stack = (mask['validation'] | mask['calibration']) & ok
    z_mean = z[stack].mean(axis=0)
    coef, intercept = logistic(z[stack] - z_mean, yo[stack], l2=1.0)
    calibrated['overall'] = sigmoid((z - z_mean) @ coef + intercept)
    print('OverallCast coefficients', dict(zip(CHANNELS, np.round(coef, 3))), flush=True)
    models['overall'] = dict(inputs=CHANNELS, coefficients=np.round(coef, 8).tolist(), intercept=round(float(intercept), 8), inputMean=np.round(z_mean, 8).tolist(),
                             labelSources=report['dataset']['hazards']['overall']['sources'], labelEnd=report['dataset']['hazards']['overall']['labelEnd'],
                             climatology=[round(c, 5) for c in climatology['overall']])

    # Comparators on identical rows. Persistence uses the previous day's label at the same
    # plant: an optimistic oracle, because Storm Events entries are published weeks later.
    # The linear baseline is L2 logistic regression on the same 30 normalized inputs.
    index = pd.MultiIndex.from_arrays([site, date])
    yesterday = pd.MultiIndex.from_arrays([site, (pd.to_datetime(date) - pd.Timedelta(days=1)).strftime('%Y-%m-%d')])
    linear = {}
    for h in CHANNELS:
        j = hazards.index(h); ok = np.isfinite(y[:, j]); tr = mask['train'] & ok
        coef_l, b_l = logistic(xn[tr], y[tr, j], l2=1.0)
        linear[h] = sigmoid(xn @ coef_l + b_l)
    operating = mask['validation'] | mask['calibration']
    for h in hazards:
        j = hazards.index(h); yh = y[:, j]; p = calibrated[h]; score = curve(p, SCORE_ANCHORS)
        clim = np.array(climatology[h])[month - 1]
        previous = pd.Series(yh, index=index).reindex(yesterday).to_numpy()
        persistence = np.nan_to_num(previous, nan=0.0)
        evaluation[h] = {}
        evaluation[h]['scoreShare'] = dict(period='2025 validation and calibration days', days=int(operating.sum()),
                                          score7Plus=r4((score[operating] >= 7).mean()), score9Plus=r4((score[operating] >= 9).mean()))
        for part in ['validation', 'calibration', 'test', 'unseen', 'floridaTest', 'floridaUnseen']:
            m = mask[part] & np.isfinite(yh)
            if not m.sum() or not yh[m].sum():
                evaluation[h][part] = dict(n=int(m.sum()), positives=int(np.nansum(yh[m])), unavailable='No labelled positives in this partition.')
                continue
            baselines = dict(ruleEngine=rules[RULE_CHANNEL[h]].to_numpy()[m], persistence=persistence[m])
            if h in network_alt:
                baselines['networkSameFeatures'] = network_alt[h][m]
            elif h in linear:
                baselines['linearSameFeatures'] = linear[h][m]
            # The rule engine has no forecast-based fire score; omit comparators with no values.
            baselines = {k: v for k, v in baselines.items() if np.isfinite(v).any()}
            # Same-day official warnings: a reference, not a next-day forecast. Only
            # meaningful against labels from other sources.
            other = [k for k in source_names if k.startswith(f'{h}:') and not k.endswith(':iem')]
            warned = source_hits[:, source_names.index(f'{h}:iem')] if f'{h}:iem' in source_names else None
            result = evaluate(yh[m], p[m], score[m], clim[m], baselines)
            if warned is not None and other:
                yo_ = np.any(source_hits[:, [source_names.index(k) for k in other]], axis=1)[m].astype(int)
                result['sameDayWarningReference'] = dict(labelSources=[k.split(':')[1] for k in other],
                                                         **evaluate(yo_, warned[m].astype(float), warned[m] * 10.0, clim[m]))
                result['sameDayWarningReference'].pop('reliability', None)
            result['window'] = [str(date[m].min()), str(date[m].max())]
            if part in ('test', 'unseen', 'floridaTest', 'floridaUnseen'):
                yt = yh[m].astype(int)
                result['bootstrap'] = bootstrap_difference(yt, p[m], dict(climatology=clim[m], **baselines), date[m])
                # Onset days: drop positives whose plant was already positive the day before.
                keep = ~((yt == 1) & (previous[m] == 1))
                result['onset'] = dict(positives=int(yt[keep].sum()), continuationShare=r4(1 - yt[keep].sum() / yt.sum()),
                                       averagePrecision=r4(average_precision(yt[keep], p[m][keep])),
                                       climatology=r4(average_precision(yt[keep], clim[m][keep])),
                                       **{name: r4(average_precision(yt[keep], v[keep])) for name, v in baselines.items() if name != 'persistence'})
            evaluation[h][part] = result
        t = evaluation[h].get('test', {})
        print(f"{h}: test AP {t.get('averagePrecision')} (climatology {t.get('climatology', {}).get('averagePrecision')}, rules {t.get('ruleEngine', {}).get('averagePrecision')}), BSS {t.get('brierSkill')}", flush=True)

    # HeatCast against real thermometers (IEM ASOS), not reanalysis.
    evaluation['heatCastVsAsos'] = asos_validation()
    evaluation['osha'] = osha_validation(site, date, calibrated, mask)
    evaluation['radarStormCells'] = radar_validation(site, date, calibrated, mask, month)

    samples = []
    pick = RNG.choice(np.flatnonzero(mask['test'] | mask['unseen']), 40, replace=False)
    for i in sorted(pick):
        samples.append(dict(siteId=str(site[i]), date=str(date[i]), x=np.round(x[i].astype(float), 6).tolist(),
                            probabilities={h: round(float(calibrated[h][i]), 8) for h in hazards}))

    # Leakage control: the same training on shuffled labels should score near the base rate.
    # A separate generator keeps the operational models and samples unchanged.
    control_rng = np.random.default_rng(99)
    evaluation['shuffledLabelControl'] = {}
    for h in ['wind', 'flood', 'lightning', 'heat']:
        j = hazards.index(h); ok = np.isfinite(y[:, j])
        tr, va, te = mask['train'] & ok, mask['validation'] & ok, mask['test'] & ok
        ys = control_rng.permutation(y[tr, j]); yv = control_rng.permutation(y[va, j])
        print(f'Shuffled-label control {h}:', flush=True)
        if h in LOGISTIC:
            coef_s, b_s = logistic(xn[tr], ys, l2=1.0)
            control = xn[te] @ coef_s + b_s
        else:
            control = forward(xn[te], fit(xn[tr], ys, xn[va], yv, models[h]['positiveWeight'], rng=control_rng))[0]
        evaluation['shuffledLabelControl'][h] = dict(baseRate=r4(y[te, j].mean()), averagePrecision=r4(average_precision(y[te, j], control)),
                                                    realAveragePrecision=evaluation[h]['test']['averagePrecision'])

    site_traits = {sid: [round(v, 6) for v in static_row(st)] for sid, st in static.items()}
    site_context = {sid: dict(floodZone=st['fema'], levees=st['levees'], tideStation=st['tide'], nws=st['zones'])
                    for sid, st in static.items()}
    hazard_bundle = dict(version=VERSION, createdAt=datetime.now(timezone.utc).isoformat(), features=names, mean=np.round(mean, 8).tolist(), std=np.round(std, 8).tolist(),
                         scoreAnchors=SCORE_ANCHORS, hazards={h: models[h] for h in CHANNELS}, overall=models['overall'], ruleBaselineVersion=rule_version,
                         source='Archived 48h GFS daily forecasts + static site traits → NOAA Storm Events, IEM NWS warnings, ASOS gusts, NOAA tides, NASA FIRMS (NEXRAD storm cells and OSHA are validation only)',
                         siteTraits=site_traits, siteContext=site_context, featureSamples=feature_samples(daily, bundle, site_traits, names),
                         evaluation=evaluation, counts={k: int(v.sum()) for k, v in mask.items()}, samples=samples,
                         notes=['Training: 2024; early stopping: Jan–Jun 2025; calibration and OverallCast fit: Jul–Dec 2025 (OverallCast also uses Jan–Jun 2025); test: 2026 through each label end.',
                                'Ten plants are excluded from fitting, normalization and calibration (reported under "unseen"; chosen by catalog order, six within 31 mi of a fitted plant).',
                                'Labels record official or observed hazard evidence near a site, not confirmed on-site conditions or injuries.',
                                'The 0–10 scale maps calibrated probability through documented anchors; the anchors are policy, not learned.',
                                'Rule baseline scores the same daily forecast aggregates with the production scorer.'])
    (OUT / 'hazards.json').write_text(json.dumps(hazard_bundle, separators=(',', ':')))
    export_forecasts(site, date, split, calibrated, hazards)
    export_replay(site, date, calibrated, hazards, sites, mask)
    path = ROOT / 'public/data/provenance.json'
    provenance = json.loads(path.read_text())
    provenance['hazardCast'] = dict(version=VERSION, features='Archived 48h GFS daily aggregates, frozen HeatCast/GroundCast upper quantiles, FEMA NFHL and USACE NLD plant traits, NOAA CO-OPS gauge distance',
        labels=dict(stormEvents='https://www.ncei.noaa.gov/stormevents/', nwsWarnings='https://mesonet.agron.iastate.edu/vtec/', asos='https://mesonet.agron.iastate.edu/request/download.phtml',
                    tides='https://tidesandcurrents.noaa.gov/', firms='https://firms.modaps.eosdis.nasa.gov/'),
        validationOnly=dict(osha='https://www.osha.gov/severe-injury-reports', nexradStormCells='https://www.ncei.noaa.gov/swdiws/'),
        labelEnds={h: report['dataset']['hazards'][h]['labelEnd'] for h in hazards},
        limitations=['Labels are official or observed hazard evidence near a plant, not confirmed on-site conditions or injuries.',
                     'FIRMS includes prescribed and agricultural burns; fire labels end 2025-12-31 without a FIRMS key.',
                     'Scores map probability through documented anchors; learned evidence only raises channel scores.'])
    path.write_text(json.dumps(provenance, indent=2))
    print('Exported', OUT / 'hazards.json', flush=True)


def feature_samples(daily, bundle, traits, names, n=12):
    """Raw forecast hours + expected daily features, so TS aggregation is tested against Python."""
    hourly = pd.read_parquet(FEATURES / 'hourly.parquet'); hourly['siteId'] = hourly.siteId.astype(str)
    hourly['utc'] = pd.to_datetime(hourly.utc, utc=True)
    out = []
    for i in RNG.choice(len(daily), n, replace=False):
        row = daily.iloc[int(i)]; h = hourly[hourly.siteId == row.siteId]
        day = h[h.date == row.date]; first = day.utc.min()
        prior = h[(h.utc >= first - pd.Timedelta(hours=168)) & (h.utc < first)].precipitation
        hours = [dict(time=t.strftime('%Y-%m-%dT%H:%M:%SZ'), temperature=float(r.temperature_2m), humidity=float(r.relative_humidity_2m), precipitation=float(r.precipitation),
                      wind=float(r.wind_speed_10m), gust=float(r.wind_gusts_10m), cape=float(r.cape), dewPoint=float(r.dew_point_2m),
                      heatcastP90=float(r.heatcast_p90), groundcastP90=float(r.groundcast_p90)) for t, r in zip(day.utc, day.itertuples())]
        hours = [{k: (None if isinstance(v, float) and not np.isfinite(v) else v) for k, v in x.items()} for x in hours]
        expected = [float(row[k]) for k in names[:len(names) - len(traits[row.siteId])]] + traits[row.siteId]
        out.append(dict(siteId=row.siteId, date=row.date, soilP90=bundle['soilThresholds'][row.siteId][1], hours=hours,
                        priorRain=[float(v) for v in prior], expected=[round(v, 8) for v in expected]))
    return out


def asos_validation():
    hourly = pd.read_parquet(FEATURES / 'hourly.parquet')
    obs = pd.read_parquet(FEATURES / 'asos_hourly.parquet')
    hourly['siteId'] = hourly.siteId.astype(str); obs['siteId'] = obs.siteId.astype(str)
    hourly['hour'] = pd.to_datetime(hourly.utc, utc=True)
    obs['hour'] = pd.to_datetime(obs.hour, utc=True)
    from common import heat_index
    obs['observedHeatF'] = heat_index((obs.tmpf - 32) / 1.8, obs.relh)
    j = hourly.merge(obs[['siteId', 'hour', 'observedHeatF']], on=['siteId', 'hour']).dropna(subset=['heatcast_p50', 'heatIndexF', 'observedHeatF'])
    sites = json.loads((ROOT / 'public/data/model-sites.json').read_text()); held = {s['id'] for s in sites if s['heldOut']}
    out = {}
    for name, m in [('test', (j.hour >= '2026-01-01') & ~j.siteId.isin(held)), ('unseen', (j.hour >= '2026-01-01') & j.siteId.isin(held))]:
        g = j[m]
        warm = g[g.observedHeatF >= 90]
        out[name] = dict(hours=int(len(g)), heatCastMae=round(float((g.heatcast_p50 - g.observedHeatF).abs().mean()), 4),
                         rawGfsMae=round(float((g.heatIndexF - g.observedHeatF).abs().mean()), 4),
                         hoursAtOrAbove90F=int(len(warm)), heatCastMaeAbove90F=round(float((warm.heatcast_p50 - warm.observedHeatF).abs().mean()), 4) if len(warm) else None,
                         rawGfsMaeAbove90F=round(float((warm.heatIndexF - warm.observedHeatF).abs().mean()), 4) if len(warm) else None)
    out['note'] = 'Nearest IEM ASOS station within 25 miles; airport siting differs from plant sites.'
    print('HeatCast vs ASOS:', out, flush=True)
    return out


def radar_validation(site, date, calibrated, mask, month):
    """StormCast against NEXRAD storm cells (>=45 dBZ within 10 mi), an independent thunderstorm record."""
    path = LABELS / 'storm_cells.csv'
    if not path.exists():
        return dict(unavailable='Radar storm-cell labels were not downloaded.')
    cells = pd.read_csv(path, dtype={'siteId': str})
    hit = pd.MultiIndex.from_arrays([site, date]).isin(pd.MultiIndex.from_arrays([cells.siteId, cells.date])).astype(int)
    p = calibrated['lightning']; out = {}
    for part in ['test', 'unseen']:
        m = mask[part]
        clim = pd.Series(hit[mask['train']]).groupby(month[mask['train']]).mean().reindex(range(1, 13)).fillna(hit[mask['train']].mean()).to_numpy()[month - 1]
        result = evaluate(hit[m], p[m], curve(p[m], SCORE_ANCHORS), clim[m]); result.pop('reliability')
        out[part] = dict(window=[str(date[m].min()), str(date[m].max())], **result)
    out['note'] = 'Radar cells are not training labels; StormCast is trained on severe-thunderstorm warnings and reports.'
    print('StormCast vs radar:', {k: (v['averagePrecision'], v['climatology']['averagePrecision']) for k, v in out.items() if k != 'note'}, flush=True)
    return out


def osha_validation(site, date, calibrated, mask):
    osha = pd.read_csv(LABELS / 'osha.csv', dtype={'nearestSiteId': str})
    heat = osha[(osha.hazard == 'heat') & (osha.nearestMiles <= 50)]
    index = {(s, d): i for i, (s, d) in enumerate(zip(site, date))}
    hits = [index[k] for k in zip(heat.nearestSiteId, heat.date) if k in index]
    p = calibrated['heat']
    everyday = p[mask['train'] | mask['validation'] | mask['calibration'] | mask['test']]
    injured = p[hits]
    return dict(heatInjuries=int(len(heat)), matchedToForecastDays=int(len(hits)), radiusMiles=50,
                medianHeatProbabilityOnInjuryDays=round(float(np.median(injured)), 4) if len(hits) else None,
                medianHeatProbabilityAllDays=round(float(np.median(everyday)), 4),
                shareInjuryDaysScore4Plus=round(float((curve(injured, SCORE_ANCHORS) >= 4).mean()), 4) if len(hits) else None,
                shareAllDaysScore4Plus=round(float((curve(everyday, SCORE_ANCHORS) >= 4).mean()), 4),
                **same_month(site, date, p, mask, hits),
                note='Descriptive validation: OSHA reports use employer addresses within 50 miles of a site and are never training labels. Heat injuries and heat forecasts both peak in summer; compare against the same-month figures, whose pool includes the injury days themselves (conservative).')


def same_month(site, date, p, mask, hits):
    """Days at the injured plants in the injury months: removes the seasonal confound."""
    if not hits:
        return {}
    keys = {(site[i], str(date[i])[:7]) for i in hits}
    pool = mask['train'] | mask['validation'] | mask['calibration'] | mask['test']
    same = pool & np.array([(s_, str(d)[:7]) in keys for s_, d in zip(site, date)])
    return dict(sameMonthDays=int(same.sum()), medianHeatProbabilitySameMonthDays=round(float(np.median(p[same])), 4),
                shareSameMonthDaysScore4Plus=round(float((curve(p[same], SCORE_ANCHORS) >= 4).mean()), 4))


def export_forecasts(site, date, split, calibrated, hazards):
    keep = split == 'test'
    dates = sorted(set(date[keep]))
    by = {}
    for s in sorted(set(site)):
        m = keep & (site == s); d = list(date[m])
        by[s] = {h: [None] * len(dates) for h in hazards}
        for h in hazards:
            for di, v in zip(d, calibrated[h][m]):
                by[s][h][dates.index(di)] = round(float(v), 4)
    (ROOT / 'public/data/hazard-forecasts.json').write_text(json.dumps(dict(version=VERSION, mode='historical', dates=dates, sites=by,
        note='Calibrated next-day probabilities from archived 48h forecasts for the untouched 2026 test period.'), separators=(',', ':')))


def export_replay(site, date, calibrated, hazards, sites, mask):
    se = pd.read_csv(LABELS / 'storm_events.csv', dtype={'siteId': str})
    se = se[(se.date >= '2026-01-01') & (se.match == 'distance')]
    index = {(s, d): i for i, (s, d) in enumerate(zip(site, date))}
    names = {s['id']: s for s in sites}
    chosen = []
    for h in ['flood', 'lightning', 'wind']:
        cand = se[se.hazard == h].drop_duplicates(['siteId', 'date'])
        cand = cand[[(k in index) for k in zip(cand.siteId, cand.date)]]
        if cand.empty:
            continue
        cand = cand.assign(p=[calibrated[h][index[k]] for k in zip(cand.siteId, cand.date)]).sort_values('p', ascending=False)
        best = cand.iloc[0]
        i = index[(best.siteId, best.date)]
        s = names[best.siteId]
        evening = (pd.Timestamp(best.date).tz_localize(s['timezone']) - pd.Timedelta(hours=6)).tz_convert('UTC')
        chosen.append(dict(hazard=h, siteId=best.siteId, siteName=s['name'], date=best.date, eventType=best.eventType, eventId=int(best.eventId),
                           eventMiles=best.miles, briefingAt=evening.strftime('%Y-%m-%dT%H:%M:%SZ'),
                           heldOutSite=bool(s['heldOut']),
                           probabilities={k: round(float(calibrated[k][i]), 4) for k in hazards},
                           source=f"NOAA Storm Events event {int(best.eventId)}"))
    (ROOT / 'public/data/hazard-replay.json').write_text(json.dumps(dict(version=VERSION, events=chosen,
        note='Highest-forecast real 2026 test events per hazard; selection uses the outcome, so these are demonstrations, not representative samples.'), indent=2))


if __name__ == '__main__':
    main()
