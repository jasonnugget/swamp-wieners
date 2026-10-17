# Device services

`api.ts` selects an editable local API origin, bounds requests and validates compact crew responses. `photos.ts` requests the native camera/library UI, normalizes photos to size-bounded JPEGs and copies drafts into the app sandbox. `storage.ts` remembers crew defaults, the last workspace and one unshared draft. `report-input.ts` validates the pure report payload and keeps its retry UUID stable when details are unchanged. Do not persist credentials in EXPO_PUBLIC variables or claim cached data is fresh.

`workspace-sync.ts` owns request coalescing, user-only refresh indicators, disposed-request guards and structural sharing for unchanged workspace data. Server `now` ticks alone do not replace the visible workspace; refreshed clock mode and report timestamps remain authoritative. Connection success/failure is tracked separately so identical data can become fresh or stale without changing its map identity.
