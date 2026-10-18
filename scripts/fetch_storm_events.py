"""NOAA Storm Events → per-site, per-local-day hazard labels.

An event labels a site-day when its begin/end point is within RADIUS_MI of the
site, or when its county/zone (CZ) code matches the site's NWS county or zone.
Every local calendar day the event spans (capped) is labelled.
Output: data/labels/storm_events.csv and a coverage report.
"""
import gzip
import io
import json
import re

import numpy as np
import pandas as pd

from common import FEATURES, LABELS, ROOT, START, END, fetch, miles, model_sites, split_of

BASE = 'https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/'
RADIUS_MI = 25
MAX_SPAN_DAYS = 7
STATES = {'FLORIDA': 'FL', 'LOUISIANA': 'LA', 'MISSISSIPPI': 'MS', 'ALABAMA': 'AL', 'GEORGIA': 'GA', 'TEXAS': 'TX', 'ARKANSAS': 'AR', 'TENNESSEE': 'TN'}
# Hazard channel for each land event type. Severe convective types also mark the
# thunderstorm (lightning) channel: a damaging storm implies an active thunderstorm.
HAZARDS = {
    'Thunderstorm Wind': ['wind', 'lightning'], 'Tornado': ['wind', 'lightning'], 'Hail': ['lightning'], 'Lightning': ['lightning'],
    'High Wind': ['wind'], 'Strong Wind': ['wind'], 'Tropical Storm': ['wind', 'flood'], 'Hurricane': ['wind', 'flood'], 'Hurricane (Typhoon)': ['wind', 'flood'],
    'Flood': ['flood'], 'Flash Flood': ['flood'], 'Coastal Flood': ['flood'], 'Storm Surge/Tide': ['flood'],
    'Wildfire': ['fire'], 'Heat': ['heat'], 'Excessive Heat': ['heat'], 'Extreme Heat': ['heat'],
}


def detail_files():
    listing = fetch(BASE, kind='text')
    years = range(int(START[:4]), int(END[:4]) + 1)
    names = sorted(set(re.findall(r'StormEvents_details-ftp_v1\.0_d(\d{4})_c(\d{8})\.csv\.gz', listing)))
    latest = {y: c for y, c in names}  # last creation stamp per year wins
    return {int(y): f'{BASE}StormEvents_details-ftp_v1.0_d{y}_c{c}.csv.gz' for y, c in latest.items() if int(y) in years}


def load_events():
    frames = []
    for year, url in detail_files().items():
        df = pd.read_csv(io.BytesIO(gzip.decompress(fetch(url, kind='bytes', timeout=300))), low_memory=False)
        df = df[df.STATE.isin(STATES) & df.EVENT_TYPE.isin(HAZARDS)].copy()
        print(year, url.rsplit('/', 1)[-1], len(df), 'relevant events', flush=True)
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    df['cz'] = df.STATE.map(STATES) + df.CZ_TYPE + df.CZ_FIPS.astype(int).map('{:03d}'.format)
    # BEGIN/END_YEARMONTH + DAY are local (CZ_TIMEZONE) calendar dates.
    ymd = lambda ym, d: pd.to_datetime(ym.astype(str) + d.astype(int).map('{:02d}'.format), format='%Y%m%d')
    df['begin'] = ymd(df.BEGIN_YEARMONTH, df.BEGIN_DAY)
    df['end'] = ymd(df.END_YEARMONTH, df.END_DAY).clip(upper=df['begin'] + pd.Timedelta(days=MAX_SPAN_DAYS - 1))
    return df


def match(df, sites, static):
    rows = []
    for s in sites:
        z = static[s['id']]['zones']
        codes = {z['county'], z['forecastZone'], z['fireZone']} - {None}
        d = np.fmin(miles(s['latitude'], s['longitude'], df.BEGIN_LAT.to_numpy(float), df.BEGIN_LON.to_numpy(float)),
                    miles(s['latitude'], s['longitude'], df.END_LAT.to_numpy(float), df.END_LON.to_numpy(float)))
        near = d <= RADIUS_MI
        zone = df.cz.isin(codes).to_numpy()
        for i in np.flatnonzero(near | zone):
            e = df.iloc[i]
            for day in pd.date_range(e.begin, e.end):
                for hazard in HAZARDS[e.EVENT_TYPE]:
                    rows.append(dict(siteId=s['id'], date=day.strftime('%Y-%m-%d'), hazard=hazard, eventType=e.EVENT_TYPE, eventId=int(e.EVENT_ID),
                                     match='distance' if near[i] else 'zone', miles=None if np.isnan(d[i]) else round(float(d[i]), 1),
                                     cz=e.cz, magnitude=None if pd.isna(e.MAGNITUDE) else float(e.MAGNITUDE)))
    out = pd.DataFrame(rows)
    return out[(out.date >= START) & (out.date <= END)]


def report(labels, df, sites):
    held = {s['id'] for s in sites if s['heldOut']}
    site_days = labels.drop_duplicates(['siteId', 'date', 'hazard']).copy()
    site_days['split'] = site_days.date.map(split_of)
    site_days['cohort'] = np.where(site_days.siteId.isin(held), 'heldOut', 'fitted')
    counts = site_days.groupby(['hazard', 'cohort', 'split']).size().unstack(fill_value=0)
    print(counts.to_string(), flush=True)
    monthly = df[df.begin >= '2026-01-01'].groupby(df.begin.dt.strftime('%Y-%m')).size()
    print('2026 relevant events by month (all matched states):', monthly.to_dict(), flush=True)
    return dict(radiusMiles=RADIUS_MI, maxSpanDays=MAX_SPAN_DAYS, positiveSiteDays={f'{h}|{c}|{s}': int(v) for (h, c), r in counts.iterrows() for s, v in r.items()},
                events2026ByMonth={k: int(v) for k, v in monthly.items()}, files=list(detail_files().values()))


def main():
    sites = model_sites()
    static = json.loads((FEATURES / 'site_static.json').read_text())
    df = load_events()
    labels = match(df, sites, static)
    labels.to_csv(LABELS / 'storm_events.csv', index=False)
    path = ROOT / 'data/hazard-label-report.json'
    existing = json.loads(path.read_text()) if path.exists() else {}
    existing['stormEvents'] = report(labels, df, sites)
    path.write_text(json.dumps(existing, indent=2))


if __name__ == '__main__':
    main()
