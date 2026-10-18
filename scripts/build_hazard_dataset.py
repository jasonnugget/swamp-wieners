"""Join daily forecast features, static site traits and hazard labels.

Each hazard label is the union of its listed sources and is defined only through
the earliest end of those sources' coverage, so the label means the same thing in
every split. Days after that end are unlabelled (NaN) for that hazard.
Output: data/hazards.npz
"""
import json

import numpy as np
import pandas as pd

from common import FEATURES, LABELS, ROOT, END, model_sites, split_of
from prepare_hazard_features import DAILY

# Source → last date with complete coverage (filled from the label report).
HAZARD_SOURCES = {
    'wind': ['storm_events', 'iem', 'asos'],
    'flood': ['storm_events', 'iem', 'tides'],
    # Severe thunderstorm near the site. Radar storm cells (~1 in 3 summer days) are an independent check, not labels.
    'lightning': ['storm_events', 'iem'],
    'fire': ['storm_events', 'iem', 'firms'],
    'heat': ['iem'],
    'overall': ['storm_events', 'iem'],
}
HAZARDS = list(HAZARD_SOURCES)
STATIC = ['fema_sfha_point', 'fema_sfha_1mi', 'fema_coastal_v_2mi', 'fema_known', 'leveed_area', 'levee_near_miles', 'boreholes_5mi_log', 'levee_known', 'tide_miles_log']
FEATURE_NAMES = DAILY + STATIC
GUST_MPH = 40


def coverage(report):
    months = sorted(report['stormEvents']['events2026ByMonth'])
    storm_end = (pd.Period(months[-1], freq='M').end_time.strftime('%Y-%m-%d')) if months else '2025-12-31'
    firms_years = [int(c.split(':')[1]) for c in report['firms']['covered'] if c.split(':')[0] in ('viirs-snpp', 'modis')]
    area = [c.split('..')[1] for c in report['firms']['covered'] if c.startswith('area-api')]
    firms_end = max(area) if area else f'{max(firms_years)}-12-31'
    return dict(storm_events=storm_end, iem=END, asos=END, tides=END, firms=firms_end)


def static_row(st):
    f, l, t = st['fema'], st['levees'], st['tide']
    known_f = f['sfhaPoint'] is not None
    known_l = l['leveedArea'] is not None
    return [float(bool(f['sfhaPoint'])), float(bool(f['sfha1mi'])), float(bool(f['coastalV2mi'])), float(known_f),
            float(bool(l['leveedArea'])), float(l['leveeBandMiles'] if l['leveeBandMiles'] is not None else 20.0),
            float(np.log1p(l['boreholes5mi'] or 0)), float(known_l), float(np.log1p(min(t['miles'], 200)))]


def label_days(report):
    sets = {}
    se = pd.read_csv(LABELS / 'storm_events.csv', dtype={'siteId': str})
    iem = pd.read_csv(LABELS / 'iem_warnings.csv', dtype={'siteId': str})
    for name, df in [('storm_events', se), ('iem', iem)]:
        for h in HAZARDS[:-1]:
            sets[(name, h)] = set(zip(df.siteId[df.hazard == h], df.date[df.hazard == h]))
        # Overall means warning-level evidence: Storm Events entries and NWS warnings, not advisories.
        severe = df if name == 'storm_events' else df[df['product'].str.endswith('.W')]
        sets[(name, 'overall')] = set(zip(severe.siteId, severe.date))
    asos = pd.read_csv(LABELS / 'asos_daily.csv', dtype={'siteId': str})
    sets[('asos', 'wind')] = set(zip(asos.siteId[asos.peakGustMph >= GUST_MPH], asos.date[asos.peakGustMph >= GUST_MPH]))
    tides = pd.read_csv(LABELS / 'tides.csv', dtype={'siteId': str})
    sets[('tides', 'flood')] = set(zip(tides.siteId, tides.date))
    firms = pd.read_csv(LABELS / 'firms.csv', dtype={'siteId': str})
    sets[('firms', 'fire')] = set(zip(firms.siteId, firms.date))
    return sets


def main():
    report = json.loads((ROOT / 'data/hazard-label-report.json').read_text())
    ends = coverage(report)
    label_end = {h: min(ends[s] for s in src) for h, src in HAZARD_SOURCES.items()}
    sites = model_sites(); held = {s['id'] for s in sites if s['heldOut']}
    static = json.loads((FEATURES / 'site_static.json').read_text())
    daily = pd.read_parquet(FEATURES / 'daily.parquet')
    daily['siteId'] = daily.siteId.astype(str)
    st = np.array([static_row(static[i]) for i in daily.siteId])
    x = np.column_stack([daily[DAILY].to_numpy(float), st]).astype(np.float32)
    sets = label_days(report)
    keys = list(zip(daily.siteId, daily.date))
    y = np.full((len(daily), len(HAZARDS)), np.nan, dtype=np.float32)
    sources = {}
    for j, h in enumerate(HAZARDS):
        hit = np.zeros(len(keys), dtype=bool)
        for s in HAZARD_SOURCES[h]:
            m = np.array([k in sets.get((s, h), ()) for k in keys])
            sources[f'{h}:{s}'] = m
            hit |= m
        defined = (daily.date <= label_end[h]).to_numpy()
        y[defined, j] = hit[defined]
    split = daily.date.map(split_of).to_numpy()
    np.savez_compressed(ROOT / 'data/hazards.npz', x=x, y=y, site=daily.siteId.to_numpy(), date=daily.date.to_numpy(), split=split,
                        heldOut=daily.siteId.isin(held).to_numpy(), features=np.array(FEATURE_NAMES), hazards=np.array(HAZARDS),
                        source_names=np.array(list(sources)), source_hits=np.column_stack(list(sources.values())))
    summary = {}
    for j, h in enumerate(HAZARDS):
        d = pd.DataFrame(dict(y=y[:, j], split=split, held=daily.siteId.isin(held)))
        d = d[d.y.notna()]
        summary[h] = dict(labelEnd=label_end[h], sources=HAZARD_SOURCES[h],
                          rate={f"{'heldOut' if k[1] else 'fitted'}|{k[0]}": dict(n=int(len(g)), positives=int(g.y.sum()), rate=round(float(g.y.mean()), 4)) for k, g in d.groupby(['split', 'held'])})
        print(h, label_end[h], {k: (v['positives'], v['n']) for k, v in summary[h]['rate'].items()}, flush=True)
    report['dataset'] = dict(rows=int(len(daily)), features=FEATURE_NAMES, coverageEnds=ends, hazards=summary)
    (ROOT / 'data/hazard-label-report.json').write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
