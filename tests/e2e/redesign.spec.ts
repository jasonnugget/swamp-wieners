import { test, expect } from "@playwright/test";
import { expectSite, pickSite } from "./atlas-site";

test("loading screen reports readiness, supports retry, and opens the editorial homepage", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/models/bundle.json", async route => {
    await gate;
    await route.fulfill({ status: 503, body: "Unavailable" });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "GET YOUR BEARINGS." })).toBeVisible();
  await expect(page.getByText("Site evidence", { exact: false })).toHaveAttribute("data-ready", "true");
  await page.screenshot({ path: "test-results/editorial-loading.png" });
  release();
  await expect(page.getByRole("alert")).toContainText("Model bundle unavailable");
  await page.unroute("**/models/bundle.json");
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(page.getByRole("heading", { name: "See the risk. Plan the work." })).toBeVisible();
  await expect(page.getByTestId("site-map")).toHaveCount(0);
  await expect(page.locator(".boot-screen")).toHaveCount(0);
});

test("homepage, dedicated atlas, history, and mobile navigation preserve working site selection", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const title = page.getByRole("heading", { name: "See the risk. Plan the work." });
  await expect(title).toBeVisible();
  const lineCount = await title.evaluate(el => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
  expect(lineCount).toBeLessThanOrEqual(2.1);
  await page.getByRole("button", { name: "Pause ambient motion" }).click();
  await expect(page.getByRole("button", { name: "Resume ambient motion" })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "test-results/editorial-home.png" });
  await page.getByRole("link", { name: "Explore the atlas", exact: true }).click();
  await expect(page).toHaveURL(/view=atlas/);
  const map = page.getByTestId("site-map");
  await expect(map).toBeVisible();
  const bounds = (await map.boundingBox())!;
  expect(bounds.x).toBe(0);
  expect(bounds.width).toBe(1440);
  expect(bounds.y + bounds.height).toBe(1000);
  await pickSite(page, "55433");
  await page.getByRole("navigation").getByRole("link", { name: "Safety briefings", exact: true }).click();
  await expect(page.getByLabel("Active site")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tomorrow starts with today." })).toBeVisible();
  await expect(map).toHaveCount(0);
  await page.goBack();
  await expect(map).toBeVisible();
  await expectSite(page, "55433");
  await page.getByRole("button", { name: "Open showcase mode" }).click();
  const expanded = (await map.boundingBox())!;
  expect(expanded.y).toBe(0);
  expect(expanded.height).toBe(1000);
  await page.keyboard.press("Escape");
  await page.getByRole("navigation").getByRole("link", { name: "Home", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(title).toBeVisible();
  expect(await title.evaluate(el => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))).toBeLessThanOrEqual(2.1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/editorial-home-mobile.png" });
  for (const name of ["3D Atlas", "Safety briefings", "Crew reports"]) {
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page.getByRole("navigation").getByRole("link", { name, exact: name !== "Crew reports" }).click();
    if (name === "3D Atlas") await expectSite(page, "55433");
    else await expect(page.getByLabel("Active site")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("reduced-motion homepage keeps scroll content visible and accordions keyboard accessible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "See the risk. Plan the work." })).toBeVisible();
  const reveal = page.locator(".reveal-word").first();
  await expect(reveal).toHaveCSS("opacity", "1");
  const trigger = page.getByRole("button", { name: "Keep the context.", exact: true });
  await trigger.focus();
  await trigger.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".feature-accordion").getByRole("link", { name: "Open crew reports", exact: true })).toBeVisible();
  await page.locator(".home-action").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("demo reset waits for confirmation and cancellation leaves records untouched", async ({ page, request }) => {
  const snapshot = await (await request.get("/api/snapshot")).json();
  let resets = 0;
  await page.route("**/api/demo/reset", async route => {
    resets++;
    await route.fulfill({ json: snapshot });
  });
  await page.goto("/?view=briefings");
  await page.getByRole("button", { name: "Demo controls", exact: true }).click();
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  expect(resets).toBe(0);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await expect.poll(() => resets).toBe(1);
});

test("homepage crew notes keep accepted evidence and report links scoped to the selected site", async ({ page, request }) => {
  await request.post("/api/demo/reset", { data: {} });
  const snapshot = await (await request.get("/api/snapshot")).json();
  for (const [siteId, description] of [["621", "Visual audit only: access road observation."], ["55433", "Visual audit only: observation from another site."]]) {
    const site = snapshot.sites.find((value: { id: string }) => value.id === siteId);
    const response = await request.post("/api/reports", { data: {
      siteId, category: "soil", description, author: "Visual audit crew", tasks: ["mobilization"], latitude: site.latitude, longitude: site.longitude,
      photo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=",
    } });
    expect(response.ok()).toBeTruthy();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const notes = page.locator(".crew-notes");
  await expect(notes.locator(".crew-note")).toHaveCount(1);
  await expect(notes).toContainText("Visual audit only: access road observation.");
  await expect(notes).not.toContainText("Visual audit only: observation from another site.");
  await expect(notes.getByRole("img", { name: "Original crew hazard photo" })).toHaveAttribute("src", /^\/uploads\//);
  await notes.getByRole("link", { name: "Open crew reports", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Visual audit only: access road observation.", exact: true })).toBeVisible();
  await page.goto("/?view=atlas");
  await pickSite(page, "55433");
  await page.getByRole("navigation").getByRole("link", { name: "Home", exact: true }).click();
  await expect(notes.locator(".crew-note")).toHaveCount(1);
  await expect(notes).toContainText("Visual audit only: observation from another site.");
});
