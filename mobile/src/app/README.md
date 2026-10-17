# iOS navigation

Expo Router owns native tabs, modal report capture, site/team selection and saved-report details. The root layout loads the three bundled Outfit weights and supplies safe areas and the shared crew provider. Tabs use a floating olive navigation bar; the field-map tab places site and capture controls over the native map. Screen files compose native UI; HTTP, camera and draft persistence belong outside this directory. Run mobile lint, typecheck and iOS export after navigation changes.

`conditions.tsx` presents all seven current channels, independent holds, task states, source coverage/check times and today’s crew observations. Home exposes a compact daily summary and the field map links to the full conditions view. Forecast/model estimates remain distinguishable from detections and crew photos. Demo-date reports are not counted as today’s real-date observations.
