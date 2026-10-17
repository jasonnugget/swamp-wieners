# Native crew application

`app/` owns Expo Router screens and navigation. `state/` owns the connected crew workspace, remembered reporting identity and resumable report draft. `features/` contains the camera/pin/review workflow. `components/` contains native map, report and touch-control views. `lib/` owns HTTP/SSE, camera compression and on-device persistence. All operational report acceptance and task policy stay on the server.

Use native accessibility labels, Dynamic Type, safe areas and touch targets of at least 44 points. Pin gestures must store real coordinates and permit manual positioning after location permission is denied. Do not call a report shared before HTTP acceptance or silently upload a saved draft.
