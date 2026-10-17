"""Fetch real EIA sites and time-aligned Open-Meteo forecasts/reanalysis.

Raw responses are cached and ignored by Git. No synthetic targets are generated.
All forecast features use a 48-hour lead; reanalysis is used only as a target.
"""
import concurrent.futures
import hashlib
import json
import math
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
PUBLIC = ROOT / 'public/data'
RAW.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)
SOURCE = 'https://www.eia.gov/electricity/data/eia860m/xls/august_generator2026.xlsx'
START, END = '2024-01-01', '2026-09-30'


def fetch(url, params=None):
    key = hashlib.sha256((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()[:20]
    path = RAW / f'{key}.json'
    if path.exists():
        return json.loads(path.read_text())
    for attempt in range(8):
        try:
            r = requests.get(url, params=params, timeout=150)
            if r.status_code in (429, 502, 503, 504):
                print(f'Retrying {r.status_code} ({attempt+1})', flush=True)
                time.sleep(min(65, 10 * (attempt+1)))
                continue
            r.raise_for_status()
            data = r.json()
            path.write_text(json.dumps(data))
            return data
        except requests.RequestException as e:
            if attempt == 7:
                raise
            print(str(e)[:180], flush=True)
            time.sleep(5)
    raise RuntimeError('Data service rate limit; rerun to resume cached downloads')


def make_sites():
    path = RAW / 'eia860m-2026-08.xlsx'
    if not path.exists():
        r = requests.get(SOURCE, timeout=90)
        r.raise_for_status()
        path.write_bytes(r.content)
    book = pd.ExcelFile(path)
    print('Sheets:', book.sheet_names, flush=True)
    sheet = next(s for s in book.sheet_names if 'operat' in s.lower())
    df = pd.read_excel(path, sheet_name=sheet, header=2)
    df.columns = [str(c).strip().replace('\n', ' ') for c in df.columns]
    print('Columns:', list(df.columns), flush=True)
    def col(*terms):
        return next(c for c in df.columns if all(t in c.lower() for t in terms))
    state, code, name = col('plant', 'state'), col('plant', 'id'), col('plant', 'name')
    lat, lon, cap = col('latitude'), col('longitude'), col('nameplate', 'capacity')
    utility, county = col('entity', 'name'), col('county')
    sites = []
    for region, count in [('FL', 35), ('LA', 8), ('MS', 7)]:
        sub = df[df[state] == region].dropna(subset=[code,lat,lon]).copy()
        sub[cap] = pd.to_numeric(sub[cap], errors='coerce').fillna(0)
        grouped = sub.groupby(code, sort=True)
        rows = []
        for plant_id, g in grouped:
            r = g.iloc[0]
            if not (24 <= float(r[lat]) <= 34 and -94 <= float(r[lon]) <= -79):
                continue
            rows.append(dict(id=str(int(plant_id)),name=str(r[name]),state=region,county=str(r[county]),utility=str(r[utility]),latitude=float(r[lat]),longitude=float(r[lon]),capacityMw=round(float(g[cap].sum()),1)))
        rows.sort(key=lambda r: -r['capacityMw'])
        # Keep substantial plants and distribute selection geographically.
        pool = rows[:max(count*3, count)]
        selected = [pool.pop(0)]
        while len(selected) < count:
            idx = max(range(len(pool)),key=lambda i:min((pool[i]['latitude']-s['latitude'])**2+(pool[i]['longitude']-s['longitude'])**2 for s in selected))
            selected.append(pool.pop(idx))
        for r in selected:
            r.update(timezone='America/New_York' if region=='FL' and r['longitude']>-85 else 'America/Chicago',source=SOURCE,sourceDate='2026-08',heldOut=False,riverScreening=r['id'] in {'1403','6462','6072','8054'})
        sites.extend(selected)
    sites.sort(key=lambda r:(r['state'],r['id']))
    for i,s in enumerate(sites):
        s['heldOut'] = i % 5 == 4
    # Turkey Point is the Florida hero site, if present.
    sites.sort(key=lambda s: (0 if 'turkey point' in s['name'].lower() else 1, s['state'], s['name']))
    assert len(sites)==50 and len({s['id'] for s in sites})==50
    (PUBLIC/'sites.json').write_text(json.dumps(sites,indent=2))
    return sites


def heat_index(t,r):
    t=np.asarray(t)*1.8+32; r=np.asarray(r)
    simple=.5*(t+61+(t-68)*1.2+r*.094)
    hi=-42.379+2.04901523*t+10.14333127*r-.22475541*t*r-.00683783*t*t-.05481717*r*r+.00122874*t*t*r+.00085282*t*r*r-.00000199*t*t*r*r
    hi-=np.where((r<13)&(t>=80)&(t<=112),(13-r)/4*np.sqrt(np.maximum(0,(17-np.abs(t-95))/17)),0)
    hi+=np.where((r>85)&(t>=80)&(t<=87),(r-85)/10*(87-t)/5,0)
    return np.where((simple+t)/2<80,simple,hi)


def site_data(site):
    params=dict(latitude=site['latitude'],longitude=site['longitude'],start_date='2023-12-24',end_date=END,timezone='UTC')
    forecast=fetch('https://previous-runs-api.open-meteo.com/v1/forecast',dict(params,hourly=','.join(f'{v}_previous_day2' for v in ['temperature_2m','relative_humidity_2m','precipitation','wind_speed_10m']),models='gfs_seamless'))
    actual=fetch('https://archive-api.open-meteo.com/v1/archive',dict(params,hourly='temperature_2m,relative_humidity_2m,soil_moisture_0_to_7cm',models='era5_land'))
    if not any(v is not None for v in actual['hourly']['temperature_2m']):
        # ERA5-Land can have no land cell at coastal coordinates. Use the
        # documented ERA5 reanalysis instead and record it in provenance.
        print(f'{site["name"]}: coastal ERA5-Land gap, using ERA5',flush=True)
        actual=fetch('https://archive-api.open-meteo.com/v1/archive',dict(params,hourly='temperature_2m,relative_humidity_2m,soil_moisture_0_to_7cm',models='era5'))
    f,a=forecast['hourly'],actual['hourly']
    ft=pd.DatetimeIndex(pd.to_datetime(f['time'],utc=True)); at=pd.DatetimeIndex(pd.to_datetime(a['time'],utc=True))
    inputs=pd.DataFrame({k: f[f'{k}_previous_day2'] for k in ['temperature_2m','relative_humidity_2m','precipitation','wind_speed_10m']},index=ft)
    targets=pd.DataFrame({k:a[k] for k in ['temperature_2m','relative_humidity_2m','soil_moisture_0_to_7cm']},index=at,dtype=float)
    rain7=inputs['precipitation'].shift(1).rolling(168,min_periods=168).sum()
    dates=ft.intersection(at)
    df=inputs.loc[dates].copy(); df['rain7']=rain7.loc[dates]
    df['heat']=heat_index(targets.loc[dates,'temperature_2m'],targets.loc[dates,'relative_humidity_2m'])
    df['soil']=targets.loc[dates,'soil_moisture_0_to_7cm']
    df=df.loc[START:END].dropna()
    assert len(df)>1000, f'Insufficient valid data for {site["id"]}'
    h=df.index.hour.to_numpy(); day=(df.index-pd.to_datetime(df.index.year.astype(str)+'-01-01',utc=True)).total_seconds().to_numpy()/86400
    x=np.column_stack([df['temperature_2m'],df['relative_humidity_2m'],df['precipitation'],df['wind_speed_10m'],df['rain7'],np.sin(2*np.pi*h/24),np.cos(2*np.pi*h/24),np.sin(2*np.pi*day/365.25),np.cos(2*np.pi*day/365.25),np.full(len(df),site['latitude']),np.full(len(df),site['longitude'])]).astype(np.float32)
    y=df[['heat','soil']].to_numpy(dtype=np.float32)
    baseline=heat_index(df['temperature_2m'],df['relative_humidity_2m']).astype(np.float32)
    t=df.index.strftime('%Y-%m-%dT%H:%M:%SZ').to_numpy()
    print(f'{site["name"]}: {len(t)} real aligned hours',flush=True)
    return x,y,baseline,t,np.full(len(df),site['id'])


if __name__=='__main__':
    sites=make_sites()
    # Sequential requests respect the free API; cached downloads make retries cheap.
    rows=[site_data(s) for s in sites]
    x,y,b,t,ids=[np.concatenate([r[i] for r in rows]) for i in range(5)]
    np.savez_compressed(ROOT/'data/training.npz',x=x,y=y,baseline=b,time=t,site=ids)
    (PUBLIC/'provenance.json').write_text(json.dumps(dict(sites=SOURCE,forecast='https://open-meteo.com/en/docs/previous-runs-api',target='https://open-meteo.com/en/docs/historical-weather-api',forecastLeadHours=48,targetDataset='ERA5-Land reanalysis; ERA5 fallback at Stock Island (coastal land-grid gap)',mapOutlines='https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json',start=START,end=END,rows=len(t),features='All inputs use archived 48-hour forecasts; rainfall history is an estimated antecedent, not observed rainfall.',limitations=['Soil moisture is a modeled grid-cell proxy, not bearing capacity.','Reanalysis heat targets are not on-site observations.','Four manually selected Mississippi corridor sites have demonstration rainfall screening; floodplain membership is not verified.','Demo day deliberately selected as the hero site’s highest upper HeatCast prediction during July–August; aggregate metrics cover the full test period.']),indent=2))
