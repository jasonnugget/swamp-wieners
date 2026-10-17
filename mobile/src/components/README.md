# Native views

`ui.tsx` owns the crew palette, Outfit typography, Phosphor icons, accessible touch controls and safe-area pages. `FieldHero.tsx` composes the primary capture action; `FieldArtwork.tsx` draws original decorative contours, never environmental evidence. `motion.tsx` owns reduced-motion-aware entrances and listens for preference changes. `SiteMap.tsx` uses native Apple Maps through react-native-maps, placing actual plant/report coordinates and an editable hazard pin. `ReportCard.tsx` reads only persisted server reports and uploaded photos. No sample hazard imagery or fabricated reports belong here.

Pull-to-refresh observes only the provider’s manual `refreshing` state. Background reads do not move the scroll view. The native site map is memoized; tab screens pass stable unresolved-report arrays so unchanged updates preserve the map view and camera position.

`SiteMap.types.ts` shares the view props across platforms. `SiteMap.web.tsx` is a labeled coordinate-grid presentation fallback; it does not load a live basemap. Native iOS retains Apple Maps and real-coordinate pin editing. Home report carousels render accepted reports only, with an explicit no-photo state instead of sample imagery.

`FieldHero` receives its report action from the home workflow so the primary button can open the camera directly. `Page` accepts an optional safe-area footer for the composer’s always-visible share action; other pages keep their existing scrolling layout.

`TodayHazards.tsx` presents selected-site current hazard screening and counts crew reports by the plant’s local date. Older unresolved reports are labeled carried forward. It links to the full conditions view; it never invents exact map pins for site-level model/provider screening.
