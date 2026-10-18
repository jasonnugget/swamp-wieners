"""Shared helpers for the hazard pipeline: cached downloads, sites and geometry.

Raw responses are cached under ignored data/raw/ so reruns resume after rate limits.
"""
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
LABELS = ROOT / 'data/labels'
FEATURES = ROOT / 'data/features'
for p in (RAW, LABELS, FEATURES):
    p.mkdir(parents=True, exist_ok=True)
# Complete archived 48h GFS forecasts (incl. gusts/CAPE) begin mid-January 2024.
START, END = '2024-01-01', '2026-09-30'
# Chronological partitions shared with HeatCast/GroundCast (scripts/train.py).
SPLITS = [('train', '2024-01-01', '2025-01-01'), ('validation', '2025-01-01', '2025-07-01'),
          ('calibration', '2025-07-01', '2026-01-01'), ('test', '2026-01-01', '2027-01-01')]


def cache_path(url, params=None, suffix='json'):
    key = hashlib.sha256((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()[:20]
    return RAW / f'{key}.{suffix}'


def fetch(url, params=None, kind='json', timeout=150, attempts=8, headers=None):
    """GET with on-disk cache; kind is 'json', 'text' or 'bytes'."""
    path = cache_path(url, params, {'json': 'json', 'text': 'txt', 'bytes': 'bin'}[kind])
    if path.exists():
        return json.loads(path.read_text()) if kind == 'json' else path.read_text(encoding='utf-8') if kind == 'text' else path.read_bytes()
    for attempt in range(attempts):
        try:
            r = requests.get(url, params=params, timeout=timeout, headers=headers or {'User-Agent': 'Threshold-Control-hackathon-pipeline'})
            if r.status_code in (429, 502, 503, 504):
                print(f'Retrying {r.status_code} ({attempt+1})', flush=True)
                time.sleep(min(65, 10 * (attempt + 1)))
                continue
            r.raise_for_status()
            if kind == 'json':
                data = r.json(); path.write_text(json.dumps(data))
            elif kind == 'text':
                data = r.text; path.write_text(data, encoding='utf-8')
            else:
                data = r.content; path.write_bytes(data)
            return data
        except requests.RequestException as e:
            if attempt == attempts - 1:
                raise
            print(str(e)[:180], flush=True)
            time.sleep(5)
    raise RuntimeError('Data service rate limit; rerun to resume cached downloads')


def model_sites():
    """The fixed fifty-site model cohort, including the ten held-out plants."""
    return json.loads((ROOT / 'public/data/model-sites.json').read_text())


def miles(lat1, lon1, lat2, lon2):
    """Great-circle distance in miles; broadcasts over NumPy arrays."""
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 3958.8 * 2 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def split_of(date):
    """Chronological partition name for an ISO date string."""
    return next(name for name, start, end in SPLITS if start <= date < end)


def heat_index(t, r):
    """NWS Rothfusz heat index (°F) from temperature (°C) and relative humidity (%)."""
    t=np.asarray(t)*1.8+32; r=np.asarray(r)
    simple=.5*(t+61+(t-68)*1.2+r*.094)
    hi=-42.379+2.04901523*t+10.14333127*r-.22475541*t*r-.00683783*t*t-.05481717*r*r+.00122874*t*t*r+.00085282*t*r*r-.00000199*t*t*r*r
    hi-=np.where((r<13)&(t>=80)&(t<=112),(13-r)/4*np.sqrt(np.maximum(0,(17-np.abs(t-95))/17)),0)
    hi+=np.where((r>85)&(t>=80)&(t<=87),(r-85)/10*(87-t)/5,0)
    return np.where((simple+t)/2<80,simple,hi)


def quantile_predict(network, x, baseline=0):
    """NumPy mirror of shared/model.ts predict() for the frozen quantile networks."""
    v = (np.asarray(x, dtype=np.float64) - np.array(network['mean'])) / np.array(network['std'])
    for i, layer in enumerate(network['layers']):
        v = v @ np.array(layer['weights']) + np.array(layer['bias'])
        if i < len(network['layers']) - 1:
            v = np.maximum(v, 0)
    out = np.sort(v * network['targetScale'] + network['targetOffset'] + (np.asarray(baseline)[..., None] if network['residual'] else 0), axis=-1)
    out[..., 0] -= network['intervalAdjustment']; out[..., 2] += network['intervalAdjustment']
    return out
