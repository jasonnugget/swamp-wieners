"""NOAA Tides & Currents: coastal high water above the station's minor flood level.

Only sites within MAX_MILES of a CO-OPS water-level station are labelled. A local
day is positive when any observed high tide (station datum, feet) reaches the NWS
minor flood level (NOS level when NWS is unset).
Output: data/labels/tides.csv
"""
import json

import pandas as pd

from common import FEATURES, LABELS, ROOT, START, END, fetch, model_sites, split_of

API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
LEVELS = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/{id}/floodlevels.json'
MAX_MILES = 15


def highs(station):
    frames = []
    for year in range(int(START[:4]), int(END[:4]) + 1):
        data = fetch(API, dict(product='high_low', station=station, begin_date=f'{year}0101', end_date=min(f'{year}1231', END.replace('-', '')),
                               datum='STND', units='english', time_zone='gmt', format='json', application='threshold-control'))
        if 'data' in data:
            frames.append(pd.DataFrame(data['data']))
    if not frames:
        return pd.DataFrame(columns=['utc', 'feet'])
    df = pd.concat(frames)
    df = df[df.ty.str.strip().str.startswith('H')]
    return pd.DataFrame(dict(utc=pd.to_datetime(df.t, utc=True), feet=pd.to_numeric(df.v, errors='coerce'))).dropna()


def main():
    static = json.loads((FEATURES / 'site_static.json').read_text())
    rows, used = [], {}
    for s in model_sites():
        tide = static[s['id']]['tide']
        if tide['miles'] > MAX_MILES:
            continue
        levels = fetch(LEVELS.format(id=tide['station']))
        minor = levels.get('nws_minor') or levels.get('nos_minor')
        if not minor:
            print(f"{s['name']}: {tide['station']} has no flood level", flush=True); continue
        df = highs(tide['station'])
        if df.empty:
            print(f"{s['name']}: {tide['station']} returned no high-water data", flush=True); continue
        df['date'] = df.utc.dt.tz_convert(s['timezone']).dt.strftime('%Y-%m-%d')
        daily = df.groupby('date').feet.max()
        used[s['id']] = dict(station=tide['station'], minorFeet=minor, days=len(daily))
        for day, feet in daily[daily >= minor].items():
            rows.append(dict(siteId=s['id'], date=day, hazard='flood', station=tide['station'], highFeet=feet, minorFeet=minor))
        print(f"{s['name']}: {tide['station']} minor {minor} ft, {int((daily >= minor).sum())} flood days of {len(daily)}", flush=True)
    out = pd.DataFrame(rows, columns=['siteId', 'date', 'hazard', 'station', 'highFeet', 'minorFeet'])
    out = out[(out.date >= START) & (out.date <= END)]
    out.to_csv(LABELS / 'tides.csv', index=False)
    path = ROOT / 'data/hazard-label-report.json'
    report = json.loads(path.read_text()) if path.exists() else {}
    report['tides'] = dict(maxMiles=MAX_MILES, sites=used, positiveSiteDays=out.assign(split=out.date.map(split_of)).groupby('split').size().to_dict() if len(out) else {})
    path.write_text(json.dumps(report, indent=2, default=int))


if __name__ == '__main__':
    main()
