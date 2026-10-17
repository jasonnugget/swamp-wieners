import { test, expect } from "@playwright/test";
import type { Snapshot } from "../../shared/types";
import { atlasFrame } from "./risk-fixtures";

test.use({ serviceWorkers: "block" });

test("homepage plant selection follows the crew into the atlas and survives a return home", async ({ page, request }) => {
  const snapshot: Snapshot = await (await request.get("/api/snapshot")).json();
  const hawaii = snapshot.sites.find(site => site.state === "HI")!;
  const alaska = snapshot.sites.find(site => site.state === "AK")!;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const preview = page.getByRole("region", { name: "National plant preview" });
  const selector = preview.getByRole("combobox", { name: "Explore a plant" });
  await expect(selector.locator("option")).toHaveCount(snapshot.sites.length);
  await selector.selectOption(hawaii.id);
  await expect(preview.locator(".network-selected-location strong")).toHaveText(hawaii.name);
  await expect(preview.getByRole("img")).toHaveAccessibleName(new RegExp(`${hawaii.state} selected`));

  await page.getByRole("link", { name: "Explore the atlas", exact: true }).click();
  await expect(page.getByLabel("Active site")).toHaveValue(hawaii.id);
  await page.getByLabel("Active site").selectOption(alaska.id);
  await page.getByRole("navigation").getByRole("link", { name: "Home", exact: true }).click();
  await expect(selector).toHaveValue(alaska.id);
  await expect(preview.locator(".network-selected-location strong")).toHaveText(alaska.name);
  await page.reload();
  await expect(selector).toHaveValue(alaska.id);
});

for (const mode of ["stale", "cached"] as const) {
  test(`${mode} preview evidence cannot authorize work or hide an independent hold`, async ({ page, request }) => {
    const snapshot: Snapshot = await (await request.get("/api/snapshot")).json();
    const entries = atlasFrame(0, 4).sites.slice(0, 2);
    snapshot.sites = entries.map(entry => entry.site);
    snapshot.reports = [];
    snapshot.siteRisks = Object.fromEntries(entries.map(({ site, snapshot: risk }, index) => {
      risk.observation.provenance.stale = mode === "stale";
      if (index === 0) {
        risk.tasks = risk.tasks.map(task => ({ ...task, state: "AVAILABLE", reasons: ["Previously available fixture evidence"] }));
        risk.activeOverrides = [];
      }
      return [site.id, risk];
    }));
    const held = entries[1];
    expect(held.snapshot.tasks.find(task => task.task === "installation")?.state).toBe("HOLD");
    const hold = held.snapshot.activeOverrides.find(override => override.state === "HOLD")!;
    expect(hold).toBeDefined();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(({ snapshot, cached }) => {
      localStorage.setItem("planit-site", snapshot.sites[0].id);
      if (cached) localStorage.setItem("planit-snapshot-v1", JSON.stringify({ format: 2, snapshot }));
    }, { snapshot, cached: mode === "cached" });
    await page.route("**/api/snapshot", route => mode === "cached"
      ? route.fulfill({ status: 503, json: { error: "Fixture connection unavailable" } })
      : route.fulfill({ json: snapshot }));
    await page.goto("/");
    const preview = page.getByRole("region", { name: "National plant preview" });
    await expect(preview.getByText(mode === "cached" ? "Cached evidence" : "Stale evidence", { exact: true })).toBeVisible();
    await expect(preview.locator(".network-selected-state strong")).toHaveText("UNKNOWN");
    await expect(preview).toContainText("Current risk is unknown.");
    await expect(preview.locator(".network-selected-readout")).not.toContainText("AVAILABLE");

    await preview.getByRole("combobox", { name: "Explore a plant" }).selectOption(held.site.id);
    await expect(preview.locator(".network-selected-state strong")).toHaveText("HOLD");
    await expect(preview).toContainText("Current risk is unknown.");
    await preview.getByText(/\d+ recorded holds?/, { exact: true }).click();
    await expect(preview.getByText(hold.reason, { exact: true })).toBeVisible();
    await expect(preview.getByText("Holds from the last snapshot remain in view. Refresh for current evidence.")).toBeVisible();
  });
}

test("unavailable local geography leaves plant evidence and selection usable on a narrow phone", async ({ page, request }) => {
  const snapshot: Snapshot = await (await request.get("/api/snapshot")).json();
  const site = snapshot.sites[1];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route("**/data/us-states.geojson", route => route.fulfill({ status: 503, body: "Fixture geography unavailable" }));
  await page.goto("/");
  const preview = page.getByRole("region", { name: "National plant preview" });
  await expect(preview.getByRole("status")).toHaveText("Map unavailable. Select a plant below to inspect its evidence.");
  await preview.getByRole("combobox", { name: "Explore a plant" }).selectOption(site.id);
  await expect(preview.locator(".network-selected-location strong")).toHaveText(site.name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
