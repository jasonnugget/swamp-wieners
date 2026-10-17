# Homepage field signals

The “Stay curious. Stay prepared.” section uses the workspace snapshot already loaded by `App.tsx`. It adds no HTTP requests and does not mount the 3D map or browser models. `FieldSignals.tsx` owns the charts; `field-signals.css` defines their paper-and-copper presentation.

## What each chart means

The national hazard profile shows a separate arithmetic mean for each of the seven backend hazard channels. A channel includes only sites with a non-null score and a non-stale observation. A measured zero participates in the mean; unknowns do not. Each row includes its known-site count and the catalog denominator. Selecting a row updates the headline reading. This is a comparison across plants, not a new site-risk formula.

The risk/coverage plot places each plant’s authoritative composite risk on the vertical axis and its source coverage on the horizontal axis. Unknown-risk and stale plants are omitted with an explicit count. They remain available in the native plant selector, where their reading is unknown. Hovering a point previews it; clicking a point or selecting a plant updates the shared site selection used by the rest of the app. The shaded left half marks less observed sites; it is not an operational confidence threshold. The plot labels both axes and provides a text reading and keyboard-operable selector.

The crew chart counts open and resolved reports by hazard across all stored history. Copper marks unresolved reports; muted sage marks resolved reports. Bars share the same count scale, normalized to the largest category total. Counts include persisted demonstration reports and are not wildlife probabilities, hazard severities or task authorization. An empty store shows zero reports and an explanation. The latest submission timestamp comes from stored report creation dates.

The section labels cached workspace data when offline. Synthetic completion companions never enter these charts. Risk, source coverage, report state and task policy retain their backend meaning.

## Motion

Scoped GSAP/ScrollTrigger entrances reveal the bar tracks and stagger the site points when each figure enters the viewport. Animation wrappers are separate from the transforms representing measured values, so pausing or reverting animation cannot overwrite a reading. A subtle halo marks the selected plant without changing its position. The existing ambient-motion button disables entrances and the halo, and the reduced-motion preference shows the static figures. Contexts and media listeners are cleaned up on unmount. Numeric values are never randomized or animated through fabricated readings.

## Captures and checks

Production captures use existing source records and stored reports, with background collection disabled for the capture process. They establish layout and source labeling, not live provider availability or field-safety calibration.

[Hazard profile](assets/home-signals-profile.png) · [Risk/coverage plot](assets/home-signals-coverage.png) · [Crew reports](assets/home-signals-reports.png) · [Phone layout](assets/home-signals-mobile.png)

`tests/e2e/home-signals.spec.ts` checks measured zero, unknown/stale exclusion, channel selection, shared plant selection, report state counts, animation pause, reduced motion and phone overflow. The broader browser suite covers workspace updates, navigation, reporting, offline behavior and models. Recorded run results are in [tests/README.md](../tests/README.md). Unit tests are skipped for this iteration at the user’s request.
