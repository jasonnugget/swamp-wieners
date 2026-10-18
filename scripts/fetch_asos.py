"""IEM ASOS airport observations near each site: real thermometer and wind records.

Used for (1) wind labels: observed peak gust >= GUST_MPH on a local day, and
(2) validating HeatCast against measured heat index rather than reanalysis.
Only stations within MAX_MILES that archive through the whole period are used.
Output: data/labels/asos_daily.csv, data/features/asos_hourly.parquet
"""
import io
import json

import numpy as np
import pandas as pd

from common import FEATURES, LABELS, ROOT, START, END, fetch, miles, model_sites, split_of

NETWORKS = ['FL_ASOS', 'LA_ASOS', 'MS_ASOS', 'AL_ASOS', 'GA_ASOS']
MAX_MILES = 25
GUST_MPH = 40
KT_TO_MPH = 1.15078


def stations():
    rows = []
    for net in NETWORKS:
        for f in fetch(f'https://mesonet.agron.iastate.edu/geojson/network/{net}.geojson')['features']:
            p = f['properties']; lon, lat = f['geometry']['coordinates']
            begin, end = p.get('archive_begin'), p.get('archive_end')
            if begin and begin <= START and (end is None or end >= END[:10]):
                rows.append(dict(id=f['id'], name=p['sname'], latitude=lat, longitude=lon))
    return pd.DataFrame(rows)


def observations(station):
    text = fetch('https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py',
                 dict(station=station, data=['tmpf', 'relh', 'sknt', 'gust'], tz='Etc/UTC', format='onlycomma', latlon='no', missing='empty',
                      trace='0.0001', report_type=['3', '4'], sts=f'{START}T00:00Z', ets=f'{END}T23:59Z'), kind='text', timeout=600)
    df = pd.read_csv(io.StringIO(text))
    df['utc'] = pd.to_datetime(df.valid, utc=True)
    return df


def main():
    st = stations()
    daily, hourly, chosen = [], [], {}
    for s in model_sites():
        d = miles(s['latitude'], s['longitude'], st.latitude.to_numpy(), st.longitude.to_numpy())
        if d.min() > MAX_MILES:
            print(f"{s['name']}: no ASOS within {MAX_MILES} mi", flush=True); continue
        best = st.iloc[int(np.argmin(d))]
        chosen[s['id']] = dict(station=best.id, name=best['name'], miles=round(float(d.min()), 1))
        obs = observations(best.id)
        obs['date'] = obs.utc.dt.tz_convert(s['timezone']).dt.strftime('%Y-%m-%d')
        peak = np.fmax(obs.gust.fillna(-1), obs.sknt.fillna(-1)) * KT_TO_MPH
        obs['peakMph'] = np.where(peak < 0, np.nan, peak)
        g = obs.groupby('date')
        day = pd.DataFrame(dict(peakGustMph=g.peakMph.max(), reports=g.size())).reset_index()
        daily.append(day.assign(siteId=s['id'], station=best.id))
        # Top-of-hour routine observations for thermometer validation.
        h = obs.dropna(subset=['tmpf', 'relh']).copy()
        h['hour'] = h.utc.dt.round('h')
        hourly.append(h.sort_values('utc').drop_duplicates('hour', keep='last')[['hour', 'tmpf', 'relh']].assign(siteId=s['id'], station=best.id))
        print(f"{s['name']}: {best.id} at {d.min():.1f} mi, {len(day)} days", flush=True)
    daily = pd.concat(daily, ignore_index=True)
    daily = daily[(daily.date >= START) & (daily.date <= END)]
    daily.to_csv(LABELS / 'asos_daily.csv', index=False)
    pd.concat(hourly, ignore_index=True).to_parquet(FEATURES / 'asos_hourly.parquet', index=False)
    windy = daily[daily.peakGustMph >= GUST_MPH]
    counts = windy.assign(split=windy.date.map(split_of)).groupby('split').size().to_dict()
    print('Gust >= 40 mph site-days:', counts)
    path = ROOT / 'data/hazard-label-report.json'
    report = json.loads(path.read_text()) if path.exists() else {}
    report['asos'] = dict(maxMiles=MAX_MILES, gustMph=GUST_MPH, stations=chosen, sitesWithoutStation=50 - len(chosen),
                          gustSiteDays={k: int(v) for k, v in counts.items()})
    path.write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
