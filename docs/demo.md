# Demonstration

1. Open **Demo controls → Reset demo**. Turkey Point is the hero site. The weather replay uses real historical model output. The demo day was deliberately selected for the site’s highest upper HeatCast prediction during July–August, not as a representative random example.
2. Open **Model Lab**, run fresh browser inference, then **Learn this site**. Show the actual training loss and before/after MAE. Improvement is not guaranteed. Reveal reanalysis outcomes.
3. Submit a report saying the equipment access road is blocked, attach a photo, and pin it. A second connected screen immediately inherits the mobilization hold.
4. Inject a simulated strike within six miles, advance ten minutes, then inject another strike. The timer resets to thirty minutes.
5. Run to 6 PM and open **Safety briefings**. The real scheduler carries the unresolved report forward. Resolve the report in **Crew reports** and inspect its history; an independent lightning hold remains active.
6. Return to Overview and open **Showcase** on the 3D map. Fit the region, enable slow rotation, and reveal 285 real plant locations across fifty states. Click a beacon to inspect its risk, then use Escape to exit.
7. With the production page and Model Lab loaded once, disconnect internet and run inference or calibration again. The app does not require external map tiles. Jev and live feeds require connectivity; report sharing requires the local server.

Use `npm run build` and `npm start` for the offline demonstration; development mode does not register the service worker. Wait for the initial offline package download before disconnecting. Reset clears this prototype's demonstration records; it is not a report-resolution action. See [browser tests](../tests/e2e/README.md) for the automated version of the workflow.

For the national visualization, open Showcase, switch among temperature, precipitation, wind, and cloud cover, then scrub or play the next 72 hours. Use Alaska/Hawaii/All US to change coverage; click land or a weather sample to inspect its local forecast. The inspector shows provider-valid time and attribution. Weather uses actual provider time even while the safety workspace runs its historical demo. Overview colors/heights represent sampled local values, not radar or statewide conditions. A failed provider request shows an error and explicitly stale cached samples; use Site risk and Fit plants for the existing hazard map.
