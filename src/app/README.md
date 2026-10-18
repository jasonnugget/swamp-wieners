# Workspace composition

`App.tsx` owns navigation, selected-site persistence, snapshot refresh, SSE subscription, demo controls, and top-level notices. It composes the overview, report workflow, briefing view, and report modal.

Snapshot reloads use `coalescedRefresh` from `../lib/`: SSE messages, reconnect errors, the fifteen-second poll and explicit actions share one active request plus one follow-up batch. Events arriving during a read still receive a later read; the UI does not issue a full national snapshot for every individual provider notification.

Keep page composition and workspace-wide state here. Reusable views belong in `../components/`; feature-specific logic belongs under `../features/`. Keep transport and snapshot caching in `../lib/api.ts` and policy calculations in `shared/`.

After a report is shared, select the plant returned by the report form so the workspace shows that report's site even when a crew assignment changed the form's default plant.

Clock changes and live-source refreshes are server actions; cached UI state is not authoritative.

Verify navigation, selected-site changes, and report handoff with the [browser tests](../../tests/e2e/README.md). Run commands from the repository root.

The national catalog includes plants with no historical model coverage. Selecting one requests its NOAA screening without changing the demo clock. Outside the atlas, the source pill distinguishes NOAA forecast screening from historical custom forecasts. The atlas labels its canonical live environmental data separately. Peak heat can use fresh NOAA screenings; charts do not invent model quantiles. Catalog-only sites show no historical replay instead of borrowed evaluation data. Counts come from the snapshot.

## Website and working views

The default `/` route is an editorial homepage. `HomePage.tsx` composes the geographic hero, horizontal feature accordion, evidence chapter, selected-site crew-evidence carousel, pinned explanation, word reveals, and footer. `NetworkPreview` plots bundled state geography and actual plant locations without mounting Three.js, and its native selector shares the active site with the working views. The homepage uses GSAP, ScrollTrigger, and `@gsap/react`; all scrolling effects have a static reduced-motion version. The ambient-motion control pauses homepage reveals, pinning and forecast scanning. `FieldSculpture.tsx` is an original SVG camera/notebook illustration, separate from weather and model evidence. The loading screen renders the illustration with motion paused.

`navigation.ts` defines the views and query-string links. `/?view=atlas` opens the national 3D atlas as a full-screen canvas beneath floating navigation and site selection. The homepage and other working views do not mount the atlas. The former `/?view=intelligence` link redirects to the atlas; Crew reports and Safety briefings have their own links. Native links support new tabs, reloads, and browser history. Selected plants remain shared across working views.

`LoadingScreen.tsx` presents an illustrated field-kit introduction and separate snapshot/model readiness indicators. The introduction lasts at most 1.6 seconds after assets become ready and can be skipped. Reduced-motion users enter when assets are ready. Failed loading exposes a retry action.

The website uses mineral surfaces, charcoal, muted lime and locally bundled Geist. The [reference design study](../../docs/reference-design.md) documents ODDyssey, Mr.Gridy, UtiliTies and Awwwards influences, award evidence, screenshots and checks. The [playful web audit](../../docs/web-playful-ui.md) preserves the previous iteration. Reference-site assets are not bundled.

Homepage and page-introduction copy follows the supplied Threshold Control SwampHacks brief: utility crew mobilization, environmental screening, task holds, and site knowledge passed to the next shift. Describe lightning as replay and briefings as created in the application; do not imply live strike detection, automatic email/SMS delivery, or a learned seven-hazard index. The learned OverallCast index covers five hazards at the original 50 model plants (Stock Island stays unknown); soil and wildlife are not learned, and other plants use the rule composite. The [frontend case study](../../docs/frontend-case-study.md) records the design and challenge-coverage audit of this iteration.

The atlas receives canonical `siteRisks` for immediate/offline state and refreshes current map conditions through `/api/risk/atlas`. Future inspection requests include `siteId` and affect only the selected-site panel. Workspace updates from report creation, triage confirmation and resolution invalidate the batched frame. The priority list uses the same current canonical scores, shows coverage/confidence, and places active holds first. Significant risk comes next; insufficient-data sites precede apparently safe, well-observed sites. Historical model and briefing panels keep their explicit replay/forecast labels.

The atlas route applies its own floating header, light Phosphor icons and animated menu lines. These are presentation changes only; native links, browser history, report actions and shared site selection remain the same. Other views keep the editorial page header.

The “Conditions change. Stay a step closer.” chapters use the existing snapshot for an interactive hazard dial, automatically collected NWS hourly heat/wind outlook, the historical forecast replay for the selected site (`../components/ForecastReplay.tsx`), and plant-by-plant task-readiness board, laid out as a 2×2 card grid. The outlook automatically spotlights the warmest usable forecast; optional comparison stays local. `WeatherOutlook.tsx` uses real time, preserves gaps and labels its source. It does not borrow historical model data. No extra provider requests or frontend hazard scoring are introduced. Motion controls pause entrances and forecast scanning. See [the homepage audit](../../docs/home-signals.md).

Home passes the selected site into `CrewNotes`. Its carousel shows accepted reports for that site only, so its report link retains the matching selected-site context. Empty state artwork is not a report, no fake testimonial or author is generated, and evidence photos remain unfiltered.

The atlas mode switch opens a browser-local scenario lab for invented hurricane and inland-rain tracks. Scenario selection shares the active plant with the workspace, but its weather assumptions, timeline and computed exposure never enter live scoring or report state. Returning to current evidence restores the inspector and keyboard focus. See [scenario responsibilities](../features/simulation/README.md).
