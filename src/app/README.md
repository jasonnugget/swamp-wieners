# Workspace composition

`App.tsx` owns navigation, selected-site persistence, snapshot refresh, SSE subscription, demo controls, and top-level notices. It composes the overview, report workflow, Model Lab, briefing view, and report modal.

Keep page composition and workspace-wide state here. Reusable views belong in `../components/`; feature-specific logic belongs under `../features/`. Keep transport and snapshot caching in `../lib/api.ts` and policy calculations in `shared/`.

After a report is shared, select the plant returned by the report form so the workspace shows that report's site even when a crew assignment changed the form's default plant.

The Model Lab is a lazy import. Preserve that boundary so normal website use does not eagerly initialize TensorFlow.js. Clock changes and live-source refreshes are server actions; cached UI state is not authoritative.

Verify navigation, selected-site changes, and report handoff with the [browser tests](../../tests/e2e/README.md). Run commands from the repository root.

The national catalog includes plants with no historical model coverage. Selecting one requests its NOAA screening without changing the demo clock. Outside the atlas, the source pill distinguishes NOAA forecast screening from historical custom forecasts. The atlas labels its canonical live environmental data separately. Peak heat can use fresh NOAA screenings; charts and Model Lab do not invent model quantiles. Catalog-only sites show a Model Lab empty state instead of borrowed evaluation data. Counts come from the snapshot.

## Website and working views

The default `/` route is an editorial homepage. `HomePage.tsx` composes the generative hero, horizontal feature accordion, pinned explanation, word reveals, and footer. It uses GSAP, ScrollTrigger, and `@gsap/react`; all scrolling effects have a static reduced-motion version. The ambient-motion control pauses the hero and marquee. `FieldSculpture.tsx` is decorative artwork, separate from weather and model evidence.

`navigation.ts` defines the views and query-string links. `/?view=atlas` opens the national 3D atlas in a viewport-sized workspace beneath the navigation and site selector. The homepage and other working views do not mount the atlas. `/?view=intelligence` contains site ranking, forecasts, restrictions, and hazard evidence; Model Lab, Crew reports, and Safety briefings have their own links. Native links support new tabs, reloads, and browser history. Selected plants remain shared across working views.

`LoadingScreen.tsx` presents an orbital introduction and separate snapshot/model readiness indicators. The introduction lasts at most 1.6 seconds after assets become ready and can be skipped. Reduced-motion users enter when assets are ready. Failed loading exposes a retry action.

Visual references are [Lusion](https://www.awwwards.com/sites/lusion) for real-time abstract imagery and [Active Theory V6](https://www.awwwards.com/sites/active-theory-v6) for open typography and immersive navigation. The field sculpture is original canvas artwork; reference-site assets are not bundled.

Homepage and page-introduction copy follows the supplied PlanIT Control SwampHacks brief: utility crew mobilization, environmental screening, task holds, and site knowledge passed to the next shift. Describe lightning as replay and briefings as created in the application; do not imply live strike detection, automatic email/SMS delivery, or a single learned seven-hazard index. The [frontend case study](../../docs/frontend-case-study.md) records the design and challenge-coverage audit of this iteration.

The atlas receives canonical `siteRisks` for immediate/offline state and refreshes through `/api/risk/atlas`. Workspace updates from report creation, triage confirmation and resolution invalidate the batched frame. The priority list uses the same current canonical scores, shows coverage/confidence, and places active holds first. Significant risk comes next; insufficient-data sites precede apparently safe, well-observed sites. Historical model and briefing panels keep their explicit replay/forecast labels.
