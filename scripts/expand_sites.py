"""Expand the plant catalog from EIA-860M without changing the model cohort."""
import json
import math
from pathlib import Path

import pandas as pd
import requests
from timezonefinder import TimezoneFinder

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/data'
SOURCE = 'https://www.eia.gov/electricity/data/eia860m/xls/august_generator2026.xlsx'


def expand_sites(cohort=None):
    cohort_path = PUBLIC / 'model-sites.json'
    if cohort is None:
        if cohort_path.exists():
            cohort = json.loads(cohort_path.read_text())
        else:
            sites = json.loads((PUBLIC / 'sites.json').read_text())
            model_ids = set(json.loads((PUBLIC / 'forecasts.json').read_text()))
            cohort = [s for s in sites if s['id'] in model_ids]
    assert len(cohort) == 50, 'Keep the original fifty-site model cohort intact'
    path = ROOT / 'data/raw/eia860m-2026-08.xlsx'
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        response = requests.get(SOURCE, timeout=90)
        response.raise_for_status()
        path.write_bytes(response.content)
    df = pd.read_excel(path, sheet_name='Operating', header=2)
    df.columns = [str(c).strip().replace('\n', ' ') for c in df.columns]
    states = {p['id'] for p in json.loads((PUBLIC / 'weather-stations.json').read_text())}
    df = df[df['Plant State'].isin(states)].dropna(subset=['Plant ID', 'Latitude', 'Longitude'])
    df['Nameplate Capacity (MW)'] = pd.to_numeric(df['Nameplate Capacity (MW)'], errors='coerce').fillna(0)
    finder = TimezoneFinder()
    additions = []
    existing_ids = {s['id'] for s in cohort}
    for state in sorted(states):
        preserved = [s for s in cohort if s['state'] == state]
        if len(preserved) >= 5:
            continue
        candidates = []
        for plant_id, generators in df[df['Plant State'] == state].groupby('Plant ID', sort=True):
            row = generators.iloc[0]
            latitude, longitude = float(row['Latitude']), float(row['Longitude'])
            capacity = float(generators['Nameplate Capacity (MW)'].sum())
            if not (math.isfinite(latitude) and math.isfinite(longitude) and 18 <= latitude <= 72 and (-180 <= longitude <= -65 or 170 <= longitude <= 180)):
                continue
            if str(int(plant_id)) in existing_ids or capacity <= 0:
                continue
            candidates.append(dict(id=str(int(plant_id)), name=str(row['Plant Name']), state=state,
                county=str(row['County']) if pd.notna(row['County']) else 'Unknown', utility=str(row['Entity Name']),
                latitude=latitude, longitude=longitude, capacityMw=round(capacity, 1)))
        candidates.sort(key=lambda p: (-p['capacityMw'], p['id']))
        # Start with the largest plant, then spread substantial plants geographically.
        pool = candidates[:30]
        selected = []
        while len(preserved) + len(selected) < 5:
            assert pool, f'Not enough operating plants for {state}'
            anchors = preserved + selected
            index = 0 if not anchors else max(range(len(pool)), key=lambda i: min(
                (pool[i]['latitude'] - p['latitude']) ** 2 + ((pool[i]['longitude'] - p['longitude']) * math.cos(math.radians(pool[i]['latitude']))) ** 2 for p in anchors))
            plant = pool.pop(index)
            timezone = finder.timezone_at(lat=plant['latitude'], lng=plant['longitude'])
            assert timezone, f'Timezone missing for {plant["id"]}'
            plant.update(timezone=timezone, source=SOURCE, sourceDate='2026-08', heldOut=False, riverScreening=False, catalogOnly=True)
            selected.append(plant)
        additions.extend(selected)
    sites = cohort + sorted(additions, key=lambda p: (p['state'], p['name'], p['id']))
    assert len({p['id'] for p in sites}) == len(sites)
    assert {p['state'] for p in sites} == states
    cohort_path.write_text(json.dumps(cohort, indent=2))
    (PUBLIC / 'sites.json').write_text(json.dumps(sites, indent=2))
    (PUBLIC / 'site-catalog.json').write_text(json.dumps(dict(source=SOURCE, sourceDate='2026-08',
        total=len(sites), states=len(states), modelCohortIds=[s['id'] for s in cohort],
        selection='Preserve original fifty sites; add five substantial, geographically distributed operating plants per remaining state.',
        limitations=['New catalog plants have no bundled safety forecasts or historical model validation.', 'Atlas weather uses separate current provider forecasts.', 'Capacity is summed generator nameplate capacity from the EIA operating sheet.']), indent=2))
    print(f'{len(sites)} real plants across {len(states)} states; {len(cohort)} original model sites preserved')
    return sites


if __name__ == '__main__':
    expand_sites()
