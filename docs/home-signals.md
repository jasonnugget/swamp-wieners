# Homepage visualization audit

The “Stay curious. Stay prepared.” section now shows a hazard dial, an automatic hourly heat/wind outlook and a work-readiness tile board. The risk/coverage scatterplot and crew-report count chart were replaced because they did not answer a useful planning question without further interaction or manually entered reports.

All three views populate from the workspace snapshot already loaded by `App.tsx`. No extra source API requests, manual data entry, synthetic completion values or browser model inference are required. `FieldSignals.tsx` renders the dial and policy board; `WeatherOutlook.tsx` renders the hourly forecast. Styling lives in `field-signals.css`.

## 1. Environmental dial

Seven concentric tracks represent the seven backend hazard channels. Each track spans 270 degrees, with score 10 filling the track. The displayed value is the arithmetic mean of known scores across non-stale plants. Measured zero participates; unknown does not. Dashed tracks indicate unknown channels. The legend shows the known-site count and catalog denominator, so a mean from one plant cannot be mistaken for national coverage.

Selecting a legend entry highlights its ring and updates the central value. These means compare a channel across plants; they never become a composite site-risk calculation.

## 2. Automatic 24-hour outlook

The outlook uses `snapshot.weatherScreenings`, which the existing NWS collector populates automatically across the catalog. It spotlights the plant with the highest available next-24-hour heat index without requiring selection. The optional selector compares other plants with fresh hourly data. This local comparison does not alter workspace site selection.

Freshness follows the backend normalization windows: fetched within three hours, issued within 24 hours, and no future fetch/issue timestamps. Forecast slots begin at the current real-clock hour, independent of historical demo time. Each slot matches a source hour. Missing heat breaks the line and area fill; missing wind stays unknown. Zero wind remains zero. Wind converts from km/h to mph using 1.609344. Heat index is displayed in Fahrenheit as supplied by the backend NWS adapter.

The curve shows heat index; the bars below show sustained wind on a separate labeled scale. A moving cursor reads actual hourly records, and the hottest hour remains marked in text. Pointer scrubbing and a keyboard-operable range input inspect a specific hour. The display includes plant, timezone, source, fetch time and usable-site count. If no usable forecast exists, an empty state replaces the chart. A stale or unavailable source never produces a fabricated curve.

This is raw forecast screening, not a predicted work authorization or a separate risk engine. It does not use bundled historical forecasts, HeatCast/GroundCast quantiles, or demo estimates as current weather.

## 3. Work-readiness board

Each tile represents one catalog plant. Installation, mobilization and preparation controls select a task; tile colors and counts come directly from the canonical snapshot’s task decisions. Available, restricted, hold and unknown remain separate. Unknown is hatched and never included in the available count. Independent holds remain backend policy decisions, even when the environmental score is low.

The board populates from environmental screening and existing policy without requiring any crew report. Crew reports can still affect authoritative decisions through the normal backend workflow. Hovering a tile identifies the plant; the legend and accessible figure description expose all status counts without pointer interaction. The Site intelligence link opens the full working view.

## Motion and performance

GSAP/ScrollTrigger reveals the dial rings with staggered rotation/opacity, raises the wind bars and reveals the heat curve and plant tiles. These entrance effects do not change measured values. The forecast cursor advances through actual hourly records every 1.6 seconds. IntersectionObserver stops scanning offscreen. Scrubbing pauses scanning; the local playback button restarts it. The global ambient-motion control, reduced-motion preference and cached/offline mode also stop scanning. Reduced motion removes cursor interpolation.

Animation contexts, observers, media listeners and intervals clean up on unmount. There is no new Three.js scene, chart package, per-frame React loop, provider request or risk calculation. The normal workspace refresh supplies updated data. The page labels cached workspace state.

## Browser audit

Production captures use persisted provider records with background collection disabled in the capture process. They establish rendering and interaction, not current source connectivity or safety calibration. Captures use reduced motion for stable comparison. Desktop is 1440 × 1000; phone is 390 × 844.

[Environmental dial](assets/home-signals-profile.png) · [Hourly outlook](assets/home-signals-outlook.png) · [Work-readiness board](assets/home-signals-readiness.png) · [Phone outlook](assets/home-signals-mobile.png)

The final capture check found no horizontal overflow at either desktop or phone size, no JavaScript page errors, and exactly 285 plant tiles. It confirmed an automatically selected real NWS outlook and a populated policy board with zero crew reports. Unknown tiles and forecast-source labels were visible. These values can change as source evidence ages or refreshes.

`tests/e2e/home-signals.spec.ts` verifies measured zero versus unknown, stale exclusion, automatic forecast selection, expired/future source rejection, line gaps, wind conversion, keyboard scrubbing, policy counts without reports, task switching, empty forecasts, scan progression, pause, reduced motion and phone bounds. The broader suite covers navigation, reporting, models and offline behavior. Exact final results are in [tests/README.md](../tests/README.md). Unit tests remain skipped at the user’s request.

## Findings and limits

| Check | Finding |
| --- | --- |
| Manual-entry dependency | Removed from the section; all three views populate from collected forecasts and canonical decisions |
| Weather source | Existing NWS records, with source time and plant timezone visible |
| Unknown versus zero | Unknown rings/tiles and missing forecast slots stay distinct from measured zero |
| Independent policy | Task states are displayed directly; no chart clears a hold or invents an authorization |
| Accessibility | Channel/task buttons, native plant selector and keyboard forecast scrubber; reduced-motion and pause support |
| Performance | Existing snapshot only; scanning stops offscreen and all animation resources clean up |
| Responsive layout | Desktop and 390-pixel phone captures have no horizontal document overflow |

The dial is a descriptive network mean and can conceal an individual plant’s extreme value. Use the atlas/site detail for that plant’s evidence and restrictions. NWS values are model forecasts, not field instruments. The board represents current decisions, not forecast authorization. Stable screenshots do not establish animation frame rate on field hardware. Older source records can become unknown while collection retries; the UI does not complete these charts with synthetic data.

## Final verification · October 17, 2026

| Check | Result |
| --- | --- |
| Production build and TypeScript | Passed through `npm run test:e2e` |
| Full browser suite | 31 passed, 0 failed, 4.0 minutes; process exit 0 |
| Unit tests | Skipped at the user’s request |
| Lint | No configured lint script |
| Manual desktop/phone capture | No page errors or horizontal document overflow; 285 policy tiles rendered |
| Remaining build warning | Existing large browser-model chunk |

The initial focused run caught fixture typing and an incorrect test expectation for the playback button after scrubbing. Those were corrected before the passing full run. Scrubbing now has an explicit check that playback is paused and the control offers Play. No runtime records, source credentials, scoring formulas or policy rules were changed.
