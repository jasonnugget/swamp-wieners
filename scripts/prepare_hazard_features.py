"""Daily next-day hazard features per site from archived 48h GFS forecasts.

Every feature is computed from forecasts issued ~48h before the valid hour, so a
6 PM briefing the evening before could have known it. Frozen HeatCast/GroundCast
outputs are stacked as features. shared/hazard-model.ts implements the same daily
aggregation for live inference; parity is checked by tests/unit/hazard-model.test.ts.
Output: data/features/daily.parquet and data/features/hourly.parquet
"""
import json

import numpy as np
import pandas as pd

from common import FEATURES, ROOT, START, END, fetch, heat_index, model_sites, quantile_predict

URL = 'https://previous-runs-api.open-meteo.com/v1/forecast'
HOURLY = ['temperature_2m', 'relative_humidity_2m', 'precipitation', 'wind_speed_10m', 'wind_gusts_10m', 'cape', 'dew_point_2m']
MIN_HOURS = 20
# Fixed order; shared/hazard-model.ts HAZARD_FEATURES must match exactly.
DAILY = ['tmax_c', 'tmin_c', 'rh_mean', 'dewpoint_max_c', 'heat_index_max_f', 'rain_total_mm', 'rain_max_1h_mm', 'rain_hours',
         'wind_max_kmh', 'gust_max_kmh', 'cape_max', 'cape_mean', 'rain_prior_3d_mm', 'rain_prior_7d_mm',
         'season_sin', 'season_cos', 'latitude', 'longitude', 'heatcast_max_p90', 'groundcast_max_p90', 'groundcast_ratio_p90']


def hourly(site, bundle):
    data = fetch(URL, dict(latitude=site['latitude'], longitude=site['longitude'], start_date='2023-12-24', end_date=END, timezone='UTC',
                           hourly=','.join(f'{v}_previous_day2' for v in HOURLY), models='gfs_seamless'))
    h = data['hourly']
    df = pd.DataFrame({v: pd.to_numeric(pd.Series(h[f'{v}_previous_day2']), errors='coerce') for v in HOURLY})
    df.index = pd.DatetimeIndex(pd.to_datetime(h['time'], utc=True), name='utc')
    # Antecedent rain uses only earlier forecast hours, as scripts/prepare_data.py does.
    df['rain7'] = df.precipitation.shift(1).rolling(168, min_periods=168).sum()
    hour = df.index.hour.to_numpy()
    day = (df.index - pd.to_datetime(df.index.year.astype(str) + '-01-01', utc=True)).total_seconds().to_numpy() / 86400
    x = np.column_stack([df.temperature_2m, df.relative_humidity_2m, df.precipitation, df.wind_speed_10m, df.rain7,
                         np.sin(2 * np.pi * hour / 24), np.cos(2 * np.pi * hour / 24), np.sin(2 * np.pi * day / 365.25), np.cos(2 * np.pi * day / 365.25),
                         np.full(len(df), site['latitude']), np.full(len(df), site['longitude'])])
    ok = np.isfinite(x).all(axis=1)
    df['heatIndexF'] = heat_index(df.temperature_2m, df.relative_humidity_2m)
    df['heatcast_p50'] = np.nan; df['heatcast_p90'] = np.nan; df['groundcast_p90'] = np.nan
    heat = quantile_predict(bundle['heat'], x[ok], df.heatIndexF.to_numpy()[ok])
    df.loc[ok, 'heatcast_p50'] = heat[:, 1]; df.loc[ok, 'heatcast_p90'] = heat[:, 2]
    df.loc[ok, 'groundcast_p90'] = np.clip(quantile_predict(bundle['soil'], x[ok]), 0, 1)[:, 2]
    df['local'] = df.index.tz_convert(site['timezone'])
    df['date'] = df.local.dt.strftime('%Y-%m-%d')
    return df


def daily(site, df, soil_p90):
    complete = df[HOURLY + ['heatcast_p90', 'groundcast_p90']].notna().all(axis=1)
    g = df[complete].groupby('date')
    out = pd.DataFrame(dict(
        n_hours=g.size(), tmax_c=g.temperature_2m.max(), tmin_c=g.temperature_2m.min(), rh_mean=g.relative_humidity_2m.mean(),
        dewpoint_max_c=g.dew_point_2m.max(), heat_index_max_f=g.heatIndexF.max(), rain_total_mm=g.precipitation.sum(),
        rain_max_1h_mm=g.precipitation.max(), rain_hours=g.precipitation.apply(lambda s: int((s >= 0.5).sum())),
        wind_max_kmh=g.wind_speed_10m.max(), gust_max_kmh=g.wind_gusts_10m.max(), cape_max=g.cape.max(), cape_mean=g.cape.mean(),
        heatcast_max_p90=g.heatcast_p90.max(), groundcast_max_p90=g.groundcast_p90.max()))
    # Prior rain: forecast rain in the 72/168 hours before local midnight of the day.
    first = df.groupby('date').apply(lambda s: s.index.min())
    rain = df.precipitation
    prior = lambda hours: first.map(lambda t: rain[(rain.index >= t - pd.Timedelta(hours=hours)) & (rain.index < t)])
    p3, p7 = prior(72), prior(168)
    out['rain_prior_3d_mm'] = p3.map(lambda s: s.sum() if len(s) == 72 and s.notna().all() else np.nan)
    out['rain_prior_7d_mm'] = p7.map(lambda s: s.sum() if len(s) == 168 and s.notna().all() else np.nan)
    doy = pd.to_datetime(out.index).dayofyear.to_numpy() - 1
    out['season_sin'] = np.sin(2 * np.pi * doy / 365.25); out['season_cos'] = np.cos(2 * np.pi * doy / 365.25)
    out['latitude'] = site['latitude']; out['longitude'] = site['longitude']
    # A site without valid GroundCast anchors (e.g. a water-dominated cell) has no ratio; its days stay unknown.
    out['groundcast_ratio_p90'] = out.groundcast_max_p90 / soil_p90 if soil_p90 > 0 else np.nan
    out = out[(out.n_hours >= MIN_HOURS)].dropna(subset=DAILY)
    out.index.name = 'date'
    return out.reset_index().assign(siteId=site['id'])


def main():
    bundle = json.loads((ROOT / 'public/models/bundle.json').read_text())
    days, hours = [], []
    for s in model_sites():
        df = hourly(s, bundle)
        d = daily(s, df, bundle['soilThresholds'][s['id']][1])
        d = d[(d.date >= START) & (d.date <= END)]
        days.append(d)
        hours.append(df.drop(columns=['local']).reset_index().assign(siteId=s['id']))
        print(f"{s['name']}: {len(d)} complete forecast days", flush=True)
    pd.concat(days, ignore_index=True)[['siteId', 'date', 'n_hours'] + DAILY].to_parquet(FEATURES / 'daily.parquet', index=False)
    pd.concat(hours, ignore_index=True).to_parquet(FEATURES / 'hourly.parquet', index=False)


if __name__ == '__main__':
    main()
