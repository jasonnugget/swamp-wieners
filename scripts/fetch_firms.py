"""NASA FIRMS satellite fire detections → per-site, per-local-day fire labels.

Keyless yearly US archives exist for completed years. Later dates need a free
MAP_KEY (env FIRMS_MAP_KEY) and use the area API in 5-day windows (its maximum), up to the
earliest end of the standard-processing products (they lag months behind real time).
Only presumed vegetation fires (type 0) with nominal/high confidence count; static
industrial heat sources (power plants, flares) are excluded.
Output: data/labels/firms.csv
"""
import io
import json
import os
from datetime import date, timedelta

import numpy as np
import pandas as pd

from common import LABELS, ROOT, START, END, fetch, miles, model_sites, split_of

RADIUS_MI = 10
WINDOW = 5  # Days per area query; the API rejects longer ranges.
ARCHIVE = 'https://firms.modaps.eosdis.nasa.gov/data/country/{src}/{year}/{src}_{year}_United_States.csv'
AREA = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{src}/{box}/{WINDOW}/{day}'
AVAILABILITY = 'https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/{key}/{product}'
SOURCES = {'viirs-snpp': 'VIIRS_SNPP_SP', 'modis': 'MODIS_SP'}


def confident(df):
    c = df.confidence.astype(str).str.lower()
    numeric = pd.to_numeric(c, errors='coerce')
    return c.isin(['n', 'h', 'nominal', 'high']) | (numeric >= 50)


def box(sites, pad=0.5):
    lats = [s['latitude'] for s in sites]; lons = [s['longitude'] for s in sites]
    return min(lons) - pad, min(lats) - pad, max(lons) + pad, max(lats) + pad


def archive_years(sites):
    w, s, e, n = box(sites)
    frames, covered = [], []
    for year in range(int(START[:4]), int(END[:4]) + 1):
        for src in SOURCES:
            try:
                text = fetch(ARCHIVE.format(src=src, year=year), kind='text', timeout=600, attempts=2)
            except Exception as err:  # Current year is not published as a yearly archive.
                print(f'{src} {year}: no keyless archive ({str(err)[:80]})', flush=True)
                continue
            df = pd.read_csv(io.StringIO(text), low_memory=False)
            df = df[df.latitude.between(s, n) & df.longitude.between(w, e)]
            df['source'] = src
            frames.append(df); covered.append(f'{src}:{year}')
            print(f'{src} {year}: {len(df)} detections in region', flush=True)
    return frames, covered


def area_days(sites, start, end, key):
    w, s, e, n = box(sites)
    frames, day = [], start
    while day <= end:
        for src, product in SOURCES.items():
            # Standard-processing products match the yearly archives used for training.
            text = fetch(AREA.format(key=key, WINDOW=WINDOW, src=product, box=f'{w:.2f},{s:.2f},{e:.2f},{n:.2f}', day=day.isoformat()), kind='text')
            if text.strip() and not text.lower().startswith('invalid'):
                df = pd.read_csv(io.StringIO(text)); df['source'] = src
                frames.append(df[df.acq_date <= end.isoformat()])
        day += timedelta(days=WINDOW)
    return frames


def available_until(key, product):
    text = fetch(AVAILABILITY.format(key=key, product=product), kind='text')
    return date.fromisoformat(pd.read_csv(io.StringIO(text)).max_date.iloc[0])


def main():
    sites = model_sites()
    frames, covered = archive_years(sites)
    key = os.environ.get('FIRMS_MAP_KEY')
    last_archive = max((int(c.split(':')[1]) for c in covered), default=int(START[:4]) - 1)
    if key and last_archive < int(END[:4]):
        # Days past a product's end stay unlabelled rather than counting as fire-free.
        end = min([date.fromisoformat(END)] + [available_until(key, product) for product in SOURCES.values()])
        frames += area_days(sites, date(last_archive + 1, 1, 1), end, key)
        covered.append(f'area-api:{last_archive + 1}-01-01..{end}')
    df = pd.concat(frames, ignore_index=True)
    if 'type' in df:
        df = df[df['type'].fillna(0).astype(int) == 0]
    df = df[confident(df)].copy()
    hhmm = df.acq_time.astype(int).map('{:04d}'.format)
    df['utc'] = pd.to_datetime(df.acq_date + ' ' + hhmm, format='%Y-%m-%d %H%M', utc=True)
    rows = []
    for s in sites:
        d = miles(s['latitude'], s['longitude'], df.latitude.to_numpy(float), df.longitude.to_numpy(float))
        near = df[d <= RADIUS_MI].assign(miles=d[d <= RADIUS_MI])
        local = near.utc.dt.tz_convert(s['timezone']).dt.strftime('%Y-%m-%d')
        for (day, group) in near.groupby(local):
            rows.append(dict(siteId=s['id'], date=day, hazard='fire', detections=len(group), nearestMiles=round(float(group.miles.min()), 2),
                             maxFrp=float(group.frp.max()) if 'frp' in group else None))
    out = pd.DataFrame(rows)
    out = out[(out.date >= START) & (out.date <= END)]
    out.to_csv(LABELS / 'firms.csv', index=False)
    counts = out.assign(split=out.date.map(split_of)).groupby('split').size().to_dict()
    print('Fire site-days by split:', counts)
    path = ROOT / 'data/hazard-label-report.json'
    report = json.loads(path.read_text()) if path.exists() else {}
    report['firms'] = dict(radiusMiles=RADIUS_MI, covered=covered, positiveSiteDays={k: int(v) for k, v in counts.items()},
                           note='Without FIRMS_MAP_KEY, years lacking a keyless archive have no FIRMS labels.')
    path.write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
