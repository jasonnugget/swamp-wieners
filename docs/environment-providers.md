# Environmental providers

All 285 plants use the same provider interfaces, independent of model coverage. Providers return measurements, contextual records and official alerts. They never calculate the site risk index. `server/pipeline/providers.ts` merges usable fields into the canonical observation before enrichment and shared scoring. `provider-poller.ts` schedules each source independently and persists records under `environment-provider` in runtime SQLite.

## Implemented services

| Source | Evidence and normalized fields | Cache / target update interval |
| --- | --- | --- |
| Open-Meteo | Modeled temperature, humidity, apparent/heat index, wind/gusts, completed-hour rain accumulations, CAPE, surface/root-zone moisture and forecast lightning potential | Existing coordinate batches and 15-minute cache; current inputs expire by valid/fetch time |
| NOAA/NWS | Official watches, warnings and advisories with exact event names; flood/red-flag flags. Same-hour deterministic heat/wind remains a missing-field fallback | Five-minute alert cache and target poll interval; NWS forecast fallback retains its existing 15-minute schedule |
| USGS modern OGC API | `nearestGaugeMiles`, `stage` in meters, `stageTrend` in meters/hour, `stagePercentile` as rolling relative abnormality | Positive gauge associations 30 days, negative associations one day; local discovery one day; current stage/recent trend 30 minutes; baseline one day |
| NOAA NWPS | Fallback nearby gauge stage, same-gauge trend and available observed-product percentile when USGS is unavailable | Shared four-degree regional gauge lookups and station observed series cached 30 minutes |
| FEMA NFHL | `flood.floodplain`: mapped special-flood-hazard exposure, not current inundation | Point lookup cached 30 days; optional verified static file |
| NASA FIRMS | `nearestFireMiles`, `fireAgeMinutes`, `firePower` in MW; satellite thermal-detection details | One-hour cache; two shared keyless US/Alaska downloads, or regional area queries with a MAP_KEY |
| iNaturalist | Relevant recent public sightings: count, nearest distance, latest time; species, source URL and relevance labels in provider metadata | Shared regional queries cached six hours |
| Lightning interface | Swappable live/recorded/demo source; positive live distances/timestamps and verified counts where completeness exists | One-minute target when a source is selected; no live network detector configured by default |

These are refresh targets, not latency guarantees. Cold startup, network delays, shared request pacing and rate-limit backoff can extend a national sweep. Expired evidence becomes unknown while the next refresh waits. The selected-site refresh queues provider work alongside existing weather/model refresh; provider completion sends SSE invalidation, so one slow source does not have to delay the rest of the site's evidence.

NWS shares successful empty statewide checks across plants, retaining original fetch timestamps. If any state alerts exist, each site still uses a precise point query. Public wildlife requests are restricted to mammal/reptile classes and at most 100 regional records; species filtering and truncation metadata remain explicit. This avoids large irrelevant plant/insect payloads without claiming comprehensive wildlife detection.

## USGS selection and baselines

The adapter uses the [modern USGS APIs](https://api.waterdata.usgs.gov/docs/ogcapi/migration/), not the retiring legacy WaterServices endpoints. It discovers recent parameter `00065` stage records in bounded local tiles, then caches the nearest fresh station within 20 miles for each site. Tile results are shared by nearby plants; no nationwide nearest-station scan runs on every refresh. Truncated discovery responses do not establish a complete association. Sites without a suitable gauge remain unknown. Associations are proximity proxies: shared drainage/hydrologic connectivity to the site is not verified.

Stage must be no more than two hours old. Feet are converted to meters; negative relative gauge heights and actual measured zero are valid. Trend compares the latest reading to an observation one to six hours earlier from the same time series. Series identity prevents mixing different gauge datums or methods. If historical requests fail, the valid current stage remains usable while trend/percentile stay null.

The relative percentile compares current stage with hourly samples from the preceding 30 days, requiring at least 168 samples spanning seven days. Equal observations use midrank so a constant normal stage does not become the 100th percentile. This is short-window abnormality, not a permanent climatic flood percentile, flood stage threshold, or inundation probability. The cache key versions the method. Baselines refresh daily; model-training soil baselines are unrelated and unchanged.

`USGS_API_KEY` is optional. A key from [USGS/api.data.gov](https://api.waterdata.usgs.gov/signup/) enables higher limits. It is sent in the `X-Api-Key` header. National deployment should provision a key, inspect the endpoint's rate-limit headers, and review station associations. Cold startup requires discovery, latest stage, recent trend and baseline requests; shared gauges/tiles and persistent caches reduce later work.

The [NOAA NWPS API](https://api.water.noaa.gov/nwps/v1/docs/) supplies a real, keyless fallback when USGS returns unavailable/error evidence, including quota failures. Gauge discovery uses bounded regional requests in WGS84, shared across nearby plants. It chooses a stage gauge within 20 miles with observations under two hours old, rejects missing `-999` sentinels and flow-only units, and preserves measured zero and negative relative gauge heights. A same-station observed series supplies trend and a short-window midrank when enough history exists. Parameter/unit mismatches leave history fields unknown while retaining current stage. USGS and NWPS gauge datums are never mixed to fill individual fields. The existing `usgs` provider slot stores water evidence from either source; metadata and per-field sources identify the actual provider and retain the primary failure reason. NWPS does not promise a permanent historical archive or verified site/gauge drainage connectivity. Local stage/observed-series requests were verified on October 17, 2026.

## Floodplain exposure

The FEMA adapter queries the [NFHL flood-hazard area layer](https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28) at the plant's coordinates. `SFHA_TF=T` means mapped exposure; `F` means the point is in a mapped non-special-hazard polygon. No returned polygon, unsupported flags or truncated results mean unknown, not outside the floodplain. This context is not a legal flood determination or evidence of current flooding.

`FEMA_ENABLED=0` disables live queries. An optional server-side `FLOOD_EXPOSURE_FILE` can supply reviewed static records. The adapter validates this shape:

```json
{
  "version": 1,
  "sites": {
    "SITE_ID": {
      "latitude": 25.0,
      "longitude": -80.0,
      "floodplain": true,
      "sourceUrl": "https://hazards.fema.gov/",
      "verifiedAt": "2026-10-17T00:00:00.000Z"
    }
  }
}
```

The example is a schema illustration, not a supplied plant determination. No invented exposure dataset is bundled. Coordinates must match the plant and verification cannot be future-dated. Missing records fall back to FEMA when enabled; otherwise they remain unknown. File modification time participates in the cache key. After updating a file, request the site's refresh to load its new version. A malformed file is reported as a provider error rather than silently trusted.

## FIRMS and thermal anomalies

Without a key, the adapter uses NASA's [published active-fire downloads](https://firms.modaps.eosdis.nasa.gov/active_fire/): NOAA-20 VIIRS Collection 2, 48-hour CSV files for the conterminous US/Hawaii and Alaska. Each file is downloaded once per hour and shared across plants. These paths were verified against NASA's [download listing](https://firms.modaps.eosdis.nasa.gov/api/active_fire_files/all?format=json). A live US CSV request succeeded on October 17, 2026. This establishes real-source connectivity, not complete fire detection or confirmed wildfire boundaries.

Optionally set server-side `FIRMS_MAP_KEY` from [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/) for smaller `VIIRS_NOAA20_NRT` regional bounding-box queries. Both paths filter to detections no older than 48 hours and within 100 miles. No national/world download is repeated for each plant. CSV quoting, source times, confidence, power and coordinates are parsed explicitly. Low-confidence detections and classified industrial/static/volcanic sources are excluded when the product supplies that classification. Public downloads currently lack the type classification, so unclassified anomalies retain lower confidence.

A thermal anomaly is potential fire evidence, not a verified wildfire perimeter. This distinction matters around power plants and industrial sites. Unclassified thermal sources receive lower confidence. An empty regional response cannot establish zero wildfire risk. Age is recomputed from the source observation time as snapshots are assembled. Source fetch timestamps stay tied to the actual cached request.

The [FIRMS area API](https://firms.modaps.eosdis.nasa.gov/api/area/) documents a 5,000-transaction limit per ten-minute window; area/day size can cost multiple transactions. Geographic caching and pacing reduce requests but do not remove the need to size a deployment's quota. Keyless downloads also use bounded payloads, shared caching and HTTP backoff. Failures return unavailable/error evidence rather than simulated fire detections.

## Lightning modes and policy

`LightningProvider.nearbyStrikes(site, radiusMiles, since)` returns typed evidence with an explicit mode:

- `LIVE`: real detected events supplied by a live adapter or trusted recorded-event store.
- `DEMO`: replay events from the demo store/clock, never promoted to live.
- `FORECAST`: normalized weather-derived storm potential, not a detector observation.

The canonical lightning record also uses `UNAVAILABLE` when neither valid detections nor forecast potential exists. `provenance.providers.lightning` exposes adapter status/mode. A live request may be unavailable; mode alone does not assert detector coverage.

`LIGHTNING_MODE=unavailable` is the default. `demo` selects the existing replay records and clock; `recorded` reads events already marked live in SQLite. Selecting `recorded` does not connect to a commercial network or create detections. No licensed live network adapter is claimed or credential placeholder presented as a working integration. A future licensed adapter can implement the interface without changing scoring or policy.

Positive live events flow directly through normalization/enrichment and are persisted to preserve the ten-mile/thirty-minute hold across refresh failures and restarts. Every qualifying new timestamp resets the countdown; future/outside-radius events and identical duplicates do not extend it incorrectly. Strike counts remain null unless a live provider explicitly establishes complete detector coverage; only a successful complete query can supply measured zero. Demo events remain outside live risk, while their existing replay task policy continues to work.

## Wildlife and crew authority

Crew reports remain the primary operational source, with selected task holds and confirmed JEV severity as documented in [risk scoring](risk-scoring.md). Public observations never release those controls.

The iNaturalist adapter requests recent research-grade, non-captive, georeferenced observations in shared local tiles. It uses at most 200 results per region, identifies truncation, excludes obscured/private or imprecise locations, requires an actual timestamp with timezone, and filters to the last 24 hours within ten miles. A small deterministic scientific-name screening list selects potentially operationally relevant large animals and venomous snakes. Ordinary birds and other unmatched taxa are not declared dangerous. This list needs regional review and does not establish that an encounter is threatening.

Species relevance is retained in `provenance.providers.wildlife.details.sightings`, including source URL, observed time and distance. It does not become a verified incident-severity floor. The existing `dangerousSightings24h` field counts screened potentially relevant public sightings, not verified dangerous encounters; provider confidence is capped at 0.35. Positive counts/proximity contribute context through the shared scorer. No matching observations leaves count/distance null, not zero wildlife probability. Public sampling is sparse, seasonal and biased; truncation and absent observations cannot establish coverage. Public reads need no key in the implemented path. See [iNaturalist's supported API reference](https://api.inaturalist.org/v1/docs/).

## Failure, cache and source metadata

`ProviderEvidence<T>` contains source, status (`ok`, `unavailable`, `error`), source mode, fetched/observed/expiry times, confidence, error and bounded debug details. Normalized observations expose `provenance.providers` and `provenance.fieldEvidence`, while retaining older `fieldSources` strings. Never-collected provider statuses have null fetch/expiry times rather than invented request timestamps. Per-field evidence caps scoring confidence so a sparse public sighting or proximity gauge cannot become a fully verified source merely because a value exists.

SQLite preserves source caches, site/gauge associations and the latest provider records across restarts and demo reset. Failures replace that source's usable record with unknown evidence. They do not erase uploaded reports, stored strikes, prior briefings, or unexpired official alerts. Other sources continue to populate the same observation. An empty successful NWS check can establish absent alerts; a failed check cannot. No failed request becomes a numerical zero.

Each source has at most two background site jobs in flight. A shared per-origin HTTP queue starts requests at least 1.1 seconds apart, uses 15-second request timeouts and bounds response text at 8 MB. HTTP 429 honors `Retry-After` within conservative bounds; exhausted quota headers pause that origin for an hour. Network failures and upstream 5xx responses back off that source, while point-specific 4xx failures do not block unrelated sites. Failed site attempts retry after five minutes; successful attempts use source intervals. In-flight cache loads share work. Selected-site refreshes share running jobs and reuse valid caches.

`DISABLE_EXTERNAL_PROVIDERS=1` disables background polling for isolated tests or offline development. Explicit site refresh still queues provider work. HTTP credentials stay in the server environment and never appear in returned errors or source URLs. No new browser configuration or UI redesign is required.

## Verification evidence

Mocked tests cover success, missing/malformed data, timeout, non-200, cache hits/expiry/persistence, absent credentials, modes, batch bounds, normalization and independent hold preservation. Live checks on October 17, 2026 reached USGS, FEMA, NWS and iNaturalist at a Louisiana catalog site: stage/trend/rolling baseline, a mapped Zone X result, an active Wind Advisory, and a recent public research-grade sighting were returned. Those checks establish connectivity and parsing for those examples, not nationwide hydrologic suitability or detection completeness. FIRMS authenticated connectivity was not tested without a MAP_KEY. Lightning remains an explicit unavailable/recorded/demo abstraction pending a licensed feed.
