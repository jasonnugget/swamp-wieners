# Atlas scenario lab

`useSimulation.ts` owns browser-local configuration, the 0–72 hour clock, layer selection and deliberate playback. It memoizes the pure calculations in `shared/simulation.ts`; changing a parameter or scrubbing pauses playback. Playback stops at the end, on tab hiding, when leaving scenario mode and with reduced motion. Manual scrubbing remains available.

`SimulationControls.tsx` provides three invented tracks, independent sustained wind and rain inputs, footprint size, duration, geographic shifts and a uniform drainage assumption. Site lists compare synthetic wind, rainfall and cumulative rainfall excess. Installed capacity identifies exposed assets, never lost generation. JSON exports contain assumptions, limitations, coordinates and calculated values. Scenarios stay in memory; reload starts a fresh scenario.

`SiteMap` connects the feature to shared plant selection and the optional Three.js overlay. Current canonical beacons remain separate. The selected-site current-controls panel uses the newer canonical workspace/atlas snapshot, retains independent holds, and suppresses stale or unavailable current scores. No scenario writes reports, provider records, policy, training data or briefings. No simulation API or external weather service is required.

Rainfall excess is the cumulative positive difference between local rain and assumed drainage. It is not remaining surface water, flood depth, inundation, storm surge, equipment damage or a safe-work decision. Read [the research and equations](../../../docs/atlas-simulation.md) before changing these semantics.

Verify with `npm test`, `npm run build` and `npm run test:e2e`. The simulation browser checks cover source separation, drainage comparison and export, mobile/keyboard/reduced-motion controls, flat fallback, a newer hold during atlas failure and offline calculation.
