"""Metrics for calibrated next-day hazard probabilities (rare-event aware).

Accuracy is meaningless for rare events, so we report average precision (PR-AUC),
ROC-AUC, Brier score and skill against monthly climatology, reliability bins and
detection/false-alarm rates at operational score thresholds.
"""
import numpy as np
import pandas as pd

BINS = [0, .02, .05, .1, .2, .3, .5, .7, 1.0001]


def average_precision(y, s):
    """Step-wise AP over distinct score thresholds; tied scores form one step."""
    if y.sum() == 0:
        return None
    order = np.argsort(-s, kind='stable'); y, s = y[order], s[order]
    last = np.r_[np.flatnonzero(np.diff(s) != 0), len(s) - 1]
    tp = np.cumsum(y)[last]; precision = tp / (last + 1)
    recall = tp / y.sum()
    return float(np.sum(np.diff(np.r_[0, recall]) * precision))


def roc_auc(y, s):
    pos = y == 1
    if pos.all() or not pos.any():
        return None
    ranks = pd.Series(s).rank(method='average').to_numpy()
    return float((ranks[pos].sum() - pos.sum() * (pos.sum() + 1) / 2) / (pos.sum() * (~pos).sum()))


def reliability(y, p):
    out = []
    for lo, hi in zip(BINS[:-1], BINS[1:]):
        m = (p >= lo) & (p < hi)
        if m.sum():
            out.append(dict(lo=lo, hi=min(hi, 1.0), n=int(m.sum()), predicted=round(float(p[m].mean()), 4), observed=round(float(y[m].mean()), 4)))
    return out


def threshold(y, flagged):
    tp = int((flagged & (y == 1)).sum()); fp = int((flagged & (y == 0)).sum()); fn = int((~flagged & (y == 1)).sum())
    return dict(flagged=int(flagged.sum()), hits=tp, pod=round(tp / max(1, tp + fn), 4), far=round(fp / max(1, tp + fp), 4))


def r(v, n=4):
    return None if v is None else round(float(v), n)


def bootstrap_difference(y, p, baselines, days, n=1000, seed=7):
    """AP(model) − AP(baseline) with whole days resampled.

    Storms and warnings hit many plants on one day, so a day, not a site-day, is the
    independent unit. Returns the mean difference, its 95% interval and the share of
    resamples in which the model is not better.
    """
    rng = np.random.default_rng(seed)
    codes, _ = pd.factorize(days)
    groups = pd.Series(np.arange(len(codes))).groupby(codes).apply(np.asarray).to_list()
    diffs = {name: [] for name in baselines}
    for _ in range(n):
        ii = np.concatenate([groups[k] for k in rng.integers(0, len(groups), len(groups))])
        if y[ii].sum() == 0:
            continue
        model = average_precision(y[ii], p[ii])
        for name, s in baselines.items():
            diffs[name].append(model - average_precision(y[ii], s[ii]))
    out = dict(eventDays=int(len(set(days[y == 1]))), resamples=n)
    for name, d in diffs.items():
        d = np.asarray(d)
        out[name] = dict(meanApDifference=r(d.mean(), 3), interval95=[r(np.quantile(d, .025), 3), r(np.quantile(d, .975), 3)],
                         shareModelNotBetter=r((d <= 0).mean(), 3))
    return out


def evaluate(y, p, score, clim, baselines=None):
    """y binary, p calibrated probability, score 0–10, clim climatology probability."""
    y = y.astype(int)
    brier = float(np.mean((p - y) ** 2)); brier_c = float(np.mean((clim - y) ** 2))
    result = dict(n=int(len(y)), positives=int(y.sum()), baseRate=r(y.mean()), averagePrecision=r(average_precision(y, p)), rocAuc=r(roc_auc(y, p)),
                  brier=r(brier, 5), climatologyBrier=r(brier_c, 5), brierSkill=r(1 - brier / brier_c) if brier_c > 0 else None,
                  reliability=reliability(y, p), atScore4=threshold(y, score >= 4), atScore7=threshold(y, score >= 7),
                  climatology=dict(averagePrecision=r(average_precision(y, clim)), rocAuc=r(roc_auc(y, clim))))
    for name, s in (baselines or {}).items():
        ok = np.isfinite(s)
        result[name] = dict(n=int(ok.sum()), averagePrecision=r(average_precision(y[ok], s[ok])), rocAuc=r(roc_auc(y[ok], s[ok])),
                            atScore4=threshold(y[ok], s[ok] >= 4), atScore7=threshold(y[ok], s[ok] >= 7))
    return result
