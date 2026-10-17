# Reference-driven website design

Research date: October 17, 2026. This document records the references behind the PlanIT homepage and separates observed design choices from interpretations of their value.

## Award evidence

[Mr.Gridy](https://devpost.com/software/mr-gridy) and [UtiliTies](https://devpost.com/software/utilities-utility-coordination) are listed as ShellHacks 2026 Sperry Tech winners. The Odd Scout URL hosts ODDyssey, whose [Devpost submission](https://devpost.com/software/oddyssey) lists a **Waymo** win, rather than Sperry Tech.

[ShellHacks' published criteria](https://shellhacks-2026.devpost.com/) cover completion, originality, design, technology, and practicality. The Sperry challenge asks teams to compare utilities' public construction plans and identify geographic or scheduling overlaps. No judge commentary found in this research attributes these wins to particular visual choices.

## What the references contribute

| Reference | Observed design or documented behavior | Application to PlanIT |
| --- | --- | --- |
| [ODDyssey](https://odd-scout-web.vercel.app/) | An asymmetric headline sits beside a large city image with evidence annotations. Spacious chapters move from geographic comparisons to product previews and a dark section explaining evidence boundaries. | Pair the opening message with a geographic view, give each workflow room, and make provenance a visible part of the story. |
| [Mr.Gridy](https://mrgridy.miami/) and its [Crosswire view](https://mrgridy.miami/compare) | A real project map explains the product immediately. The working view combines a map, a ranked action list, and a timeline. Consistent utility colors connect those views; plain language describes the next task. | Use actual plant locations in the opening view, retain shared site selection, and provide direct routes into the atlas and working tools. |
| [UtiliTies](https://devpost.com/software/utilities-utility-coordination) | The submission describes progress streamed into a map and agent graph, figures linked to source evidence, and explicit assumptions. These are documented behaviors; the application interface was not independently inspected. | Explain how observations, models, and crew knowledge inform a decision. Keep evidence types and independent holds visible. |
| [Awwwards](https://www.awwwards.com/) and [Heron AI](https://www.awwwards.com/sites/heron-ai) | The award gallery gives projects large visual stages. Heron's [live site](https://heronaiapp.com/) uses a monochrome architectural scene, sparse orange issue markers, technical drawing details, and a compact two-line headline. Its award listing highlights storytelling and hero interaction. | Give the geographic canvas visual weight, limit decorative colors, and use motion to guide attention through the product. |

## Design interpretation

The strongest shared pattern is a short path from the problem to a visible working example. Mr.Gridy's map and timeline make the challenge's two dimensions readable together. UtiliTies' documented evidence links make its output easier to question. ODDyssey explains both the purpose and limits of its analysis before asking users to explore further. These are reasons the interfaces can support a persuasive demonstration, not claims about the judges' reasoning.

Awwwards' [evaluation system](https://www.awwwards.com/about-evaluation/) assigns 40% to design, 30% to usability, 20% to creativity, and 10% to content. PlanIT borrows visual hierarchy and purposeful motion while keeping field decisions accessible.

## PlanIT implementation

- The opening `NetworkPreview` SVG plots the repository's 285 actual EIA plant locations, with Alaska and Hawaii insets. A labeled native HTML selector shares the selected site with the workspace. The preview reads canonical risk and task evidence; missing, stale, or cached readings remain visibly unknown, while independent holds stay visible.
- Charcoal, mineral neutrals, and a lime accent establish the homepage palette. Geist carries headings and interface text. Hazard colors retain their semantic role in evidence displays.
- An expandable workflow strip links to the atlas, crew reports, and Model Lab. Landscape photography and decorative model curves are labeled illustrative.
- A dark evidence chapter explains provenance and independent holds. The existing hazard profile, weather outlook, and work-readiness figures remain connected to workspace data.
- Scoped GSAP effects reveal content, scrub the evidence statement, and pin the story heading on larger screens. Reduced-motion preferences and a pause control govern presentation. Animation does not change environmental readings, model results, or task policy.

## Access limits

ODDyssey, Mr.Gridy's homepage and comparison view, Awwwards, and Heron AI were inspected in a local Chrome browser. Their layouts are observations from that date and may change. Devpost's UtiliTies text was accessible through the web reader, but its browser page stopped at Cloudflare verification. The public demonstration thumbnail was visible; it is branding artwork and does not establish the application's layout. ODDyssey's award label was available in the indexed Devpost result when the full page failed to open.

## Browser captures

These captures use the existing local API without injected measurements. Source freshness differs by provider; visible unknowns and stale labels are intentional. Reduced motion was enabled to capture completed layouts. The mobile capture is Chrome at 390 × 844, not a physical iPhone test.

- [Desktop homepage](assets/reference-design/home-desktop.png)
- [Mobile homepage](assets/reference-design/home-mobile.png)
- [Evidence chapter](assets/reference-design/evidence-desktop.png)
- [Site intelligence](assets/reference-design/intelligence-desktop.png)
- [3D atlas](assets/reference-design/atlas-desktop.png)

## Verification

Final checks on October 17, 2026:

| Check | Result |
| --- | --- |
| `npm test` | 140 passed |
| `npm run test:e2e` | 37 passed in 4.0 minutes |
| Production build / TypeScript | Passed through the browser suite's `npm run build` step |
| Desktop / phone review | 1440, 390 and 320px widths; two-line headline, no horizontal overflow, working menu and Escape focus return |
| Contrast spot checks | Hero body 5.51:1, primary CTA 14.57:1, footer text 5.11:1, focus outline 6.12:1 against their backgrounds |
| Asset packaging | Manifest entries, local geography and Geist font present |
| Patch whitespace | `git diff --check` passed |

The first browser run exposed outdated homepage-title assertions and a crew/SSE test that assumed the first catalog plant had no provider cache. The latter now selects a plant whose canonical risk is actually unknown, preserving its unknown-to-crew-evidence assertion without clearing persisted provider records. The final full run passed after these corrections.

The existing large browser-ML chunk still produces Vite's size warning. Model Lab and the Three.js scene remain separate lazy chunks; the homepage preview does not load a Three.js renderer. Browser tests exercise an isolated runtime; they do not establish complete live-provider coverage or a physical-device accessibility certification.
