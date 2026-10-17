# Demonstration

## Current supervisor risk and crew handoff

1. Start the server with `npm run build` and `npm start`. Open **3D Atlas**. Current risk uses actual system time, even if Demo controls show a historical date. Allow background providers to populate the national catalog; selecting a site does not establish complete coverage.
2. Select a plant or use **Find a site**. Show risk, coverage and confidence together. Expand a channel to inspect its evidence and sources. Gray question marks mean unknown, and dashed known values indicate low confidence.
3. Switch between **Site risk**, **Temperature**, **Heat risk**, **Wind**, **Precipitation**, **Weather risk**, **Soil risk**, **Flood risk**, **Wildfire risk**, **Lightning risk** and **Wildlife risk**. Raw readings and scored channels come from the same backend frame. Wind labels whether it is showing gusts or a sustained-wind fallback.
4. Scrub or play the 72-hour slider, then use **Back to now**. Future frames are backend forecast screening, not future detected events or work authorization. Missing future evidence stays unknown. Alaska/Hawaii/All US change the camera; beacons and search select catalog plants, not arbitrary weather samples.
5. On another connected screen, open **Crew reports**, submit an access-road report with a photo and affected tasks, and pin the location. After server acceptance the supervisor receives the update through SSE. The relevant channel, composite, evidence and task holds update; an ordinary report does not automatically make risk 10.
6. If JEV access is configured, wait for its semantic suggestion and explicitly confirm it in the report history. Confirmation can change the hazard classification/severity and add controls. Without credentials, show the unavailable result and retained manual evidence. Resolving the report preserves history and cannot clear an independent hold.
7. Open **Site intelligence** to show canonical priority ranking: active holds first, then significant known risk, then insufficient evidence ahead of well-observed low-risk sites. Period-labeled forecast/replay detail panels remain distinct from current atlas snapshots.
8. Open **Showcase**, fit plants, orbit or switch to overhead, then exit with Escape. Site selection is shared across working views.

Weather and public feeds may be unavailable or rate-limited. Show their actual status. FIRMS uses keyless regional downloads by default; a server-side MAP_KEY enables area queries. No licensed live lightning detector is configured by default; recorded mode does not create events. A real detected lightning hold is displayed in the current inspector with its distance and countdown. The UI waits for backend confirmation before clearing it.

## Historical model, lightning replay and briefing demonstration

1. Open **Demo controls → Reset demo** only when intentionally clearing demonstration records. Turkey Point is the hero site. The bundled day was selected for its highest upper HeatCast prediction during July/August; it is not a representative random example.
2. Open **Model Lab**, run fresh inference, then **Learn this site**. Show measured loss and before/after MAE, including degradation if it occurs. Reveal reanalysis outcomes as modeled historical targets, not field observations.
3. In **Site intelligence**, inject a simulated strike within six miles. Advance ten minutes, then inject another. Replay outdoor task holds reset to thirty minutes. The current atlas does not promote these simulated events to live lightning evidence.
4. Run to 6 PM and open **Safety briefings**. The scheduler stores the next local day's briefing and carries unresolved reports. Resolution does not rewrite an earlier briefing or clear another hazard's hold.

Reset clears reports, strikes, alerts, briefings, model forecasts and feed status. It preserves teams, provider caches/records, environmental weather, screenings and uploaded files. It is not a report-resolution action. Provider collection continues independently.

## Offline demonstration

Use the production build; development mode does not register the service worker. Load the app and Model Lab once and wait for offline assets before disconnecting. Inference and saved calibration work with cached assets. The current atlas can fall back to the cached canonical workspace and labels failed refreshes stale; new forecast frames require the server. Reports are not queued offline, and JEV, live feeds and scheduling do not run in a disconnected browser.

See [browser verification](../tests/e2e/README.md), [API contracts](api.md) and [provider setup](environment-providers.md). Automated canonical-frame fixtures are test evidence, not live provider coverage.
