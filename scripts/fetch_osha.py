"""OSHA Severe Injury Reports: heat- and weather-related injuries in FL/LA/MS.

Used for validation only, not as training labels: locations are employer/incident
addresses geocoded by OSHA and outcomes are sparse. Reports keep their coordinates
where provided so evaluation can relate them to the nearest site's forecasts.
Output: data/labels/osha.csv
"""
import io
import json
import re
import zipfile

import numpy as np
import pandas as pd

from common import LABELS, ROOT, START, fetch, miles, model_sites

URL = 'https://www.osha.gov/sites/default/files/January2015toNovember2025.zip'
BROWSER = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'}
STATES = {'FLORIDA', 'LOUISIANA', 'MISSISSIPPI'}
# Narrative/event-title terms for environmental exposures relevant to field crews.
PATTERNS = {'heat': r'\bheat\b|heat stroke|heatstroke|heat exhaustion|hyperthermia|dehydrat',
            'lightning': r'lightning', 'wind': r'\bwind\b|gust|tornado|hurricane', 'flood': r'flood|drown', 'fire': r'wildfire|brush fire|forest fire'}


def main():
    raw = fetch(URL, kind='bytes', timeout=600, headers=BROWSER)
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(('.csv', '.xlsx')))
        with z.open(name) as f:
            df = pd.read_csv(f, encoding='latin-1', low_memory=False) if name.lower().endswith('.csv') else pd.read_excel(f)
    df.columns = [c.strip() for c in df.columns]
    print('Columns:', list(df.columns), flush=True)
    df = df[df.State.astype(str).str.upper().isin(STATES)].copy()
    df['date'] = pd.to_datetime(df.EventDate, errors='coerce').dt.strftime('%Y-%m-%d')
    df = df[df.date >= START]
    text = (df.get('Final Narrative', '').astype(str) + ' ' + df.get('EventTitle', '').astype(str)).str.lower()
    rows = []
    sites = model_sites()
    lat = pd.to_numeric(df.get('Latitude'), errors='coerce').to_numpy(); lon = pd.to_numeric(df.get('Longitude'), errors='coerce').to_numpy()
    for hazard, pattern in PATTERNS.items():
        hit = text.str.contains(pattern, regex=True).to_numpy()
        for i in np.flatnonzero(hit):
            d = miles(lat[i], lon[i], np.array([s['latitude'] for s in sites]), np.array([s['longitude'] for s in sites]))
            j = int(np.nanargmin(d)) if np.isfinite(d).any() else None
            rows.append(dict(date=df.date.iloc[i], hazard=hazard, state=df.State.iloc[i], city=df.get('City', pd.Series(['']*len(df))).iloc[i],
                             latitude=lat[i], longitude=lon[i], nearestSiteId=sites[j]['id'] if j is not None else None,
                             nearestMiles=round(float(d[j]), 1) if j is not None else None, hospitalized=df.get('Hospitalized', pd.Series([0]*len(df))).iloc[i]))
    out = pd.DataFrame(rows)
    out.to_csv(LABELS / 'osha.csv', index=False)
    counts = out.groupby('hazard').size().to_dict() if len(out) else {}
    print('OSHA environmental injuries since', START, counts, flush=True)
    path = ROOT / 'data/hazard-label-report.json'
    report = json.loads(path.read_text()) if path.exists() else {}
    report['osha'] = dict(source=URL, coverageEnd='2025-11-30', injuriesByHazard={k: int(v) for k, v in counts.items()}, use='validation only')
    path.write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
