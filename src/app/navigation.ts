export type Page = "home" | "atlas" | "reports" | "briefings";

export const pageLabels: Record<Page, string> = {
  home: "Home",
  atlas: "3D Atlas",
  reports: "Crew reports",
  briefings: "Safety briefings",
};

export function readPage(): Page {
  const view = new URLSearchParams(location.search).get("view");
  // Site intelligence was folded into the atlas inspector; keep old links working.
  if (view === "intelligence") return "atlas";
  return view && Object.hasOwn(pageLabels, view) ? view as Page : "home";
}

export function pageHref(page: Page) {
  return page === "home" ? "/" : `/?view=${page}`;
}
