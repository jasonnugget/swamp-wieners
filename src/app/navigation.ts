export type Page = "home" | "atlas" | "intelligence" | "lab" | "reports" | "briefings";

export const pageLabels: Record<Page, string> = {
  home: "Home",
  atlas: "3D Atlas",
  intelligence: "Site intelligence",
  lab: "Model Lab",
  reports: "Crew reports",
  briefings: "Safety briefings",
};

export function readPage(): Page {
  const view = new URLSearchParams(location.search).get("view");
  return view && Object.hasOwn(pageLabels, view) ? view as Page : "home";
}

export function pageHref(page: Page) {
  return page === "home" ? "/" : `/?view=${page}`;
}
