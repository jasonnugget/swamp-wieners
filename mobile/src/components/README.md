# Native views

`ui.tsx` owns the crew palette, accessible touch controls and safe-area pages. `SiteMap.tsx` uses native Apple Maps through react-native-maps, placing actual plant/report coordinates and an editable hazard pin. `ReportCard.tsx` reads only persisted server reports and uploaded photos. No sample hazard imagery or fabricated reports belong here.

Pull-to-refresh observes only the provider’s manual `refreshing` state. Background reads do not move the scroll view. The native site map is memoized; tab screens pass stable unresolved-report arrays so unchanged updates preserve the map view and camera position.
