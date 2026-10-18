"""Per-site static traits for labels and flood features.

- NWS county/forecast/fire zone codes (zone-based label matching).
- FEMA NFHL: special flood hazard area at the point, within 1 mile, coastal V zone within 2 miles.
- USACE National Levee Database: inside a leveed area, nearest embankment/floodwall band, boreholes within 5 miles.
- NOAA CO-OPS: nearest water-level station (tide labels) and its distance (coastal proxy).
Unknown lookups stay null; training adds explicit known/unknown indicators.
Output: data/features/site_static.json keyed by site ID.
"""
import json

import numpy as np

from common import FEATURES, fetch, miles, model_sites

FEMA = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query'
NLD = 'https://geospatial.sec.usace.army.mil/dls/rest/services/NLD/Public/FeatureServer/{layer}/query'
COOPS = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json'
METERS_PER_MILE = 1609.344
LEVEE_BANDS = [0.5, 1, 3, 10]


def zones(site):
    p = fetch(f"https://api.weather.gov/points/{site['latitude']:.4f},{site['longitude']:.4f}")['properties']
    tail = lambda url: url.rsplit('/', 1)[-1] if url else None
    return dict(county=tail(p.get('county')), forecastZone=tail(p.get('forecastZone')),
                fireZone=tail(p.get('fireWeatherZone')), cwa=p.get('cwa'))


def point_query(url, site, radius_mi=0, **extra):
    params = dict(f='json', geometry=f"{site['longitude']},{site['latitude']}", geometryType='esriGeometryPoint', inSR='4326',
                  spatialRel='esriSpatialRelIntersects', returnGeometry='false', **extra)
    if radius_mi:
        params.update(distance=round(radius_mi * METERS_PER_MILE), units='esriSRUnit_Meter')
    data = fetch(url, params, timeout=90, attempts=4)
    if 'error' in data:
        raise RuntimeError(str(data['error'])[:200])
    return data


def fema(site):
    try:
        at = point_query(FEMA, site, outFields='FLD_ZONE,SFHA_TF')['features']
        near = point_query(FEMA, site, 1, outFields='FLD_ZONE,SFHA_TF')['features']
        coast = point_query(FEMA, site, 2, outFields='FLD_ZONE', where="FLD_ZONE IN ('V','VE')")['features']
    except Exception as e:
        print(f"  FEMA unavailable for {site['name']}: {e}", flush=True)
        return dict(sfhaPoint=None, sfha1mi=None, coastalV2mi=None, zones=[])
    flags = [f['attributes']['SFHA_TF'] for f in at]
    point = True if 'T' in flags else False if flags and all(v == 'F' for v in flags) else None
    return dict(sfhaPoint=point, sfha1mi=any(f['attributes']['SFHA_TF'] == 'T' for f in near) if near else None,
                coastalV2mi=bool(coast), zones=sorted({f['attributes']['FLD_ZONE'] for f in at if f['attributes']['FLD_ZONE']}))


def levees(site):
    count = lambda layer, r=0: point_query(NLD.format(layer=layer), site, r, returnCountOnly='true')['count']
    try:
        inside = count(16) > 0
        band = next((r for r in LEVEE_BANDS if count(11, r) + count(12, r) > 0), None)
        boreholes = count(0, 5)
    except Exception as e:
        print(f"  NLD unavailable for {site['name']}: {e}", flush=True)
        return dict(leveedArea=None, leveeBandMiles=None, boreholes5mi=None)
    return dict(leveedArea=inside, leveeBandMiles=band, boreholes5mi=boreholes)


def tide_stations():
    stations = fetch(COOPS, dict(type='waterlevels'))['stations']
    return [s for s in stations if s.get('state') in ('FL', 'LA', 'MS', 'AL', 'TX', 'GA')]


def main():
    tides = tide_stations()
    lat = np.array([float(t['lat']) for t in tides]); lon = np.array([float(t['lng']) for t in tides])
    out = {}
    for s in model_sites():
        d = miles(s['latitude'], s['longitude'], lat, lon); i = int(np.argmin(d))
        out[s['id']] = dict(zones=zones(s), fema=fema(s), levees=levees(s),
                            tide=dict(station=tides[i]['id'], name=tides[i]['name'], miles=round(float(d[i]), 1)))
        print(s['name'], out[s['id']]['fema'], out[s['id']]['levees'], out[s['id']]['tide'], flush=True)
    (FEATURES / 'site_static.json').write_text(json.dumps(out, indent=2))


if __name__ == '__main__':
    main()
