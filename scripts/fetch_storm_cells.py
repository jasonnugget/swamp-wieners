"""NEXRAD storm cells (NOAA SWDI nx3structure) → thunderstorm-within-10-miles labels.

A local day is positive when a radar-identified storm cell with maximum
reflectivity >= MIN_DBZ is within RADIUS_MI of the site. Reflectivity of about
45 dBZ is a standard radar proxy for lightning-producing convection; this is not
a lightning detector record. Raw satellite GLM flashes were evaluated but are too
large to download for every site-day (see docs/models.md).
Output: data/labels/storm_cells.csv
"""
import io
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import numpy as np
import pandas as pd

from common import LABELS, ROOT, START, END, fetch, miles, model_sites, split_of

URL = 'https://www.ncei.noaa.gov/swdiws/csv/nx3structure/{start}:{end}'
RADIUS_MI = 10
MIN_DBZ = 45
WORKERS = 8


def months():
    for p in pd.period_range(START[:7], END[:7], freq='M'):
        yield p.start_time.strftime('%Y%m%d'), min(p.end_time.date(), date.fromisoformat(END)).strftime('%Y%m%d')


def cells(site):
    dlat = RADIUS_MI / 69.0; dlon = dlat / np.cos(np.radians(site['latitude']))
    bbox = f"{site['longitude']-dlon:.3f},{site['latitude']-dlat:.3f},{site['longitude']+dlon:.3f},{site['latitude']+dlat:.3f}"
    def month(span):
        text = fetch(URL.format(start=span[0], end=span[1]), dict(bbox=bbox), kind='text', timeout=300)
        return pd.read_csv(io.StringIO(text.split('\nsummary')[0]))
    with ThreadPoolExecutor(WORKERS) as pool:
        frames = [df for df in pool.map(month, list(months())) if len(df)]
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=['ZTIME', 'MAX_REFLECT', 'LAT', 'LON'])


def main():
    rows = []
    for s in model_sites():
        df = cells(s)
        df = df[pd.to_numeric(df.MAX_REFLECT, errors='coerce') >= MIN_DBZ].copy()
        d = miles(s['latitude'], s['longitude'], df.LAT.to_numpy(float), df.LON.to_numpy(float))
        df = df[d <= RADIUS_MI].assign(miles=d[d <= RADIUS_MI])
        df['date'] = pd.to_datetime(df.ZTIME, utc=True).dt.tz_convert(s['timezone']).dt.strftime('%Y-%m-%d')
        for day, g in df.groupby('date'):
            rows.append(dict(siteId=s['id'], date=day, hazard='lightning', cells=len(g), maxDbz=int(g.MAX_REFLECT.max()), nearestMiles=round(float(g.miles.min()), 1)))
        print(f"{s['name']}: {df.date.nunique()} convective days", flush=True)
    out = pd.DataFrame(rows)
    out = out[(out.date >= START) & (out.date <= END)]
    out.to_csv(LABELS / 'storm_cells.csv', index=False)
    counts = out.assign(split=out.date.map(split_of)).groupby('split').size().to_dict()
    print('Convective site-days:', counts)
    path = ROOT / 'data/hazard-label-report.json'
    report = json.loads(path.read_text()) if path.exists() else {}
    report['stormCells'] = dict(radiusMiles=RADIUS_MI, minDbz=MIN_DBZ, positiveSiteDays={k: int(v) for k, v in counts.items()})
    path.write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
