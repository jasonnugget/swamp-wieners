"""Iowa Environmental Mesonet: historical NWS warnings at each site → hazard labels.

IEM's by-point query returns VTEC events whose storm-based polygon or county/zone
contains the site. Each local calendar day overlapping [issue, expire) is labelled.
Warnings are labels only; they never become model features.
Output: data/labels/iem_warnings.csv
"""
import json
from datetime import timedelta
from zoneinfo import ZoneInfo

import pandas as pd

from common import LABELS, ROOT, START, END, fetch, model_sites, split_of

URL = 'https://mesonet.agron.iastate.edu/json/vtec_events_bypoint.py'
MAX_SPAN_DAYS = 7
# Warning-level products (plus the heat advisory, the operational heat trigger).
# Flood advisories (FA.Y) and statements are minor and excluded.
HAZARDS = {
    'HT.Y': ['heat'], 'EH.W': ['heat'], 'XH.W': ['heat'],
    'SV.W': ['lightning'], 'TO.W': ['lightning', 'wind'],
    'FF.W': ['flood'], 'FA.W': ['flood'], 'FL.W': ['flood'], 'CF.W': ['flood'], 'SS.W': ['flood'],
    'WI.Y': ['wind'], 'HW.W': ['wind'], 'EW.W': ['wind'], 'TR.W': ['wind', 'flood'], 'HU.W': ['wind', 'flood'],
    'FW.W': ['fire'],
}


def site_events(site):
    return fetch(URL, dict(lat=round(site['latitude'], 4), lon=round(site['longitude'], 4), sdate=START, edate=END))['events']


def main():
    rows = []
    for s in model_sites():
        tz = ZoneInfo(s['timezone'])
        events = site_events(s)
        for e in events:
            code = f"{e['phenomena']}.{e['significance']}"
            if code not in HAZARDS:
                continue
            issue = pd.Timestamp(e['issue']).tz_convert(tz)
            expire = pd.Timestamp(e['expire']).tz_convert(tz) - timedelta(seconds=1)
            last = min(expire.date(), issue.date() + timedelta(days=MAX_SPAN_DAYS - 1))
            for day in pd.date_range(issue.date(), last):
                for hazard in HAZARDS[code]:
                    rows.append(dict(siteId=s['id'], date=day.strftime('%Y-%m-%d'), hazard=hazard, product=code, name=e['name'], ugc=e['ugc'], wfo=e['wfo'], eventid=e['eventid']))
        print(s['name'], len(events), 'events', flush=True)
    out = pd.DataFrame(rows)
    out = out[(out.date >= START) & (out.date <= END)]
    out.to_csv(LABELS / 'iem_warnings.csv', index=False)
    days = out.drop_duplicates(['siteId', 'date', 'hazard']).copy()
    days['split'] = days.date.map(split_of)
    counts = days.groupby(['hazard', 'split']).size().unstack(fill_value=0)
    print(counts.to_string())
    path = ROOT / 'data/hazard-label-report.json'
    report = json.loads(path.read_text()) if path.exists() else {}
    report['iemWarnings'] = dict(products=HAZARDS, positiveSiteDays={f'{h}|{s}': int(v) for h, r in counts.iterrows() for s, v in r.items()})
    path.write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
