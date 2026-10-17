import { test, expect } from "@playwright/test";
import { atlasFrame, atlasSites } from "./risk-fixtures";
import { ATLAS_LAYERS, atlasValue, type RiskLayer } from "../../shared/atlas";

test.use({ actionTimeout: 15000 });
test("the evidence panel exposes all 34 fields, provenance, sources and usable mobile controls", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/sites/*/screening", r => r.fulfill({ status: 503, json: { error: "No fixture screening" } }));
  await page.route("**/api/risk/atlas?**", r => r.fulfill({ json: atlasFrame() }));
  await page.addInitScript(id => localStorage.setItem("planit-site", id), atlasSites[0].id);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?view=atlas");
  const panel = page.getByLabel("Site risk inspection");
  const canvas = page.locator(".weather-atlas .three-map-canvas");
  await expect(canvas).toHaveAttribute("data-geography", "ready", { timeout: 30000 });
  const mapBounds = (await canvas.boundingBox())!, panelBounds = (await panel.boundingBox())!;
  expect(mapBounds).toEqual({ x: 0, y: 0, width: 1440, height: 1000 });
  expect(panelBounds.x).toBeGreaterThan(1000);
  expect(panelBounds.y).toBeGreaterThan(80);
  await panel.getByRole("button", { name: "Conditions", exact: true }).click();
  await expect(panel.locator(".observation-field")).toHaveCount(34);
  const field = (path: string) => panel.locator(`[data-observation-field="${path}"]`);
  await expect(field("weather.precipitation1hMm").locator("summary")).toContainText("0.0 mm");
  await expect(field("weather.precipitation24hMm").locator("summary")).toContainText("Unknown");
  await field("weather.temperatureF").locator("summary").click();
  await expect(field("weather.temperatureF")).toContainText("Modeled / forecast");
  await expect(field("weather.temperatureF")).toContainText("Open-Meteo");
  await panel.getByRole("button", { name: "Sources", exact: true }).click();
  await expect(panel.locator(".source-provider").first()).toContainText("Open-Meteo");
  await expect(panel.locator(".source-site")).toContainText(atlasSites[0].utility);
  await page.getByLabel("Active site").selectOption(atlasSites[3].id);
  await expect(page.getByTestId("atlas-risk")).toHaveText("Unknown");
  await panel.getByRole("button", { name: "Conditions", exact: true }).click();
  await expect(field("weather.temperatureF").locator("summary")).toContainText("Unknown");
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByRole("button", { name: "Conditions", exact: true }).scrollIntoViewIfNeeded();
  await expect(panel.getByRole("button", { name: "Conditions", exact: true })).toBeInViewport();
  await panel.getByRole("button", { name: "Conditions", exact: true }).focus();
  await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
  await expect(panel.getByRole("button", { name: "Sources", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test("canonical atlas renders all risk ranges, unknowns, hazard layers, timeline, holds and stale state", async ({ page }) => {
  // Cache reuse is checked between invalidations. Keep the workspace's 15s
  // background poll from racing this long fixture workflow; the real crew/SSE
  // test below independently verifies cache invalidation and updated evidence.
  await page.addInitScript(() => {
    const schedule = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      schedule(handler, timeout === 15000 ? 600000 : timeout, ...args)) as typeof window.setInterval;
  });
  const errors: string[] = [], obsolete: string[] = [], requestedHours: number[] = [];
  const futureSites: string[] = [];
  let strikeAge: number | undefined;
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => { if (r.url().includes("/api/weather/")) obsolete.push(r.url()); });
  await page.route("**/api/sites/*/screening", r => r.fulfill({ status: 503, json: { error: "No fixture screening" } }));
  await page.route("**/api/risk/atlas?**", route => {
    const query = new URL(route.request().url()).searchParams;
    const hour = Number(query.get("hour")), siteId = query.get("siteId"); requestedHours.push(hour);
    if (hour > 0) { expect(siteId).toBeTruthy(); futureSites.push(siteId!); }
    const frame = atlasFrame(hour, strikeAge);
    if (siteId) frame.sites = frame.sites.filter(p => p.site.id === siteId);
    return route.fulfill({ json: frame });
  });
  await page.addInitScript(id => localStorage.setItem("planit-site", id), atlasSites[0].id);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?view=atlas");
  const canvas = page.locator(".weather-atlas .three-map-canvas");
  await expect(canvas).toHaveAttribute("data-states", "50", { timeout: 15000 });
  await expect(canvas).toHaveAttribute("data-risk-layer", "risk");
  await expect(page.locator(".site-beacon")).toHaveCount(285);
  await expect(page.getByLabel("Forecast hour")).toHaveCount(0);
  await page.locator(`.site-beacon[data-site-id="${atlasSites[0].id}"]`).press("Enter");
  await expect(page.getByLabel("Forecast hour")).toBeVisible();
  await expect(page.getByTestId("atlas-risk")).toHaveText(`${atlasFrame().sites[0].snapshot.risk!.toFixed(1)} / 10`);
  await expect(page.getByTestId("atlas-coverage")).not.toHaveText("0%");
  for (const i of [1, 2, 3]) {
    await page.getByLabel("Active site").selectOption(atlasSites[i].id);
    await expect(page.getByTestId("atlas-risk")).toHaveText(i === 3 ? "Unknown" : `${atlasFrame().sites[i].snapshot.risk!.toFixed(1)} / 10`);
  }
  await expect(page.locator(".site-beacon.is-selected")).toHaveText("?");
  await expect(page.locator(".site-beacon.is-selected")).toHaveClass(/is-unknown/);
  await expect(page.getByTestId("atlas-coverage")).toHaveText("0%");
  await page.getByLabel("Active site").selectOption(atlasSites[1].id);
  await expect(page.locator(".site-beacon.is-selected")).toHaveClass(/has-low-confidence/);
  const builds = await canvas.getAttribute("data-beacon-builds");
  for (const layer of Object.keys(ATLAS_LAYERS) as RiskLayer[]) {
    await page.getByRole("button", { name: ATLAS_LAYERS[layer].name, exact: true }).click();
    await expect(canvas).toHaveAttribute("data-risk-layer", layer);
    const value = atlasValue(atlasFrame().sites[1].snapshot, layer);
    await expect(page.getByTestId("atlas-layer-value")).toHaveText(`${value === null ? "?" : value.toFixed(1)}${ATLAS_LAYERS[layer].unit}`);
  }
  await expect(canvas).toHaveAttribute("data-beacon-builds", builds!);
  await page.getByLabel("Forecast hour").fill("24");
  await expect(canvas).toHaveAttribute("data-risk-hour", "0");
  await expect(page.locator(".atlas-inspector-top")).toContainText("+24 HOURS");
  await expect(page.getByTestId("atlas-risk")).toHaveText(`${atlasFrame(24).sites[1].snapshot.risk!.toFixed(1)} / 10`);
  await page.getByRole("button", { name: "Temperature", exact: true }).click();
  await expect(page.getByTestId("atlas-layer-value")).toHaveText("102.0°F");
  await page.getByRole("button", { name: "Precipitation", exact: true }).click();
  await expect(page.getByTestId("atlas-layer-value")).toHaveText("2.4mm/h");
  expect(requestedHours).toContain(24);
  expect(futureSites).toEqual([atlasSites[1].id]);
  // A different site loads only its own frame, and revisiting uses the cache.
  await page.getByLabel("Active site").selectOption(atlasSites[2].id);
  await expect(page.getByTestId("atlas-risk")).toHaveText(`${atlasFrame(24).sites[2].snapshot.risk!.toFixed(1)} / 10`);
  await page.getByLabel("Active site").selectOption(atlasSites[1].id);
  await expect(page.getByTestId("atlas-layer-value")).toHaveText("2.4mm/h");
  expect(futureSites).toEqual([atlasSites[1].id, atlasSites[2].id]);
  await page.getByRole("button", { name: "Play risk forecast" }).click();
  await page.getByRole("button", { name: "All US", exact: true }).click();
  await expect(page.getByLabel("Forecast hour")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-region", "all");
  await page.getByLabel("Active site").selectOption(atlasSites[1].id);
  await expect(page.getByLabel("Forecast hour")).toHaveValue("0");
  await expect(page.getByRole("button", { name: "Play risk forecast" })).toBeVisible();
  await page.getByRole("button", { name: "Fit all sites" }).click();
  await expect(page.getByLabel("Forecast hour")).toHaveCount(0);
  await page.getByRole("button", { name: "Focus selected site" }).click();
  await expect(page.getByLabel("Forecast hour")).toHaveValue("0");
  // Future request failure cannot masquerade as a current or another-hour frame.
  await page.route("**/api/risk/atlas?hour=25&**", route => route.fulfill({ status: 503, json: { error: "Selected forecast unavailable" } }));
  await page.getByLabel("Forecast hour").fill("25");
  await expect(page.getByTestId("atlas-risk")).toHaveText("Unknown");
  await expect(page.locator(".atlas-error")).toContainText("Selected forecast unavailable");
  await expect(canvas).toHaveAttribute("data-risk-hour", "0");
  await page.getByRole("button", { name: "Back to now" }).click();
  await page.getByRole("button", { name: "Alaska", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-region", "alaska");
  await expect(page.getByLabel("Forecast hour")).toHaveCount(0);
  await expect(page.getByLabel("Active site")).toHaveValue(atlasSites.find(s => s.state === "AK")!.id);
  await page.getByRole("button", { name: "Hawaii", exact: true }).click();
  await expect(page.getByLabel("Forecast hour")).toHaveCount(0);
  await expect(page.getByLabel("Active site")).toHaveValue(atlasSites.find(s => s.state === "HI")!.id);
  await page.getByRole("button", { name: "Lower 48", exact: true }).click();
  await page.getByLabel("Find a site", { exact: true }).fill(atlasSites[1].name);
  await page.locator(".atlas-search-results").getByRole("button", { name: atlasSites[1].name, exact: true }).click();
  await expect(page.getByLabel("Forecast hour")).toBeVisible();
  strikeAge = 5;
  await page.getByRole("button", { name: "Refresh risk atlas" }).click();
  await expect(page.getByLabel("Active policy overrides")).toContainText("STOP WORK");
  await expect(page.getByTestId("all-clear")).toHaveText(/24:5\d|25:00/);
  const before = await page.getByTestId("all-clear").textContent();
  await expect.poll(() => page.getByTestId("all-clear").textContent()).not.toBe(before);
  strikeAge = 0;
  await page.getByRole("button", { name: "Refresh risk atlas" }).click();
  await expect(page.getByTestId("all-clear")).toHaveText(/29:5\d|30:00/);
  await page.getByRole("button", { name: "Play risk forecast" }).click();
  await expect.poll(() => page.getByLabel("Forecast hour").inputValue()).not.toBe("0");
  await page.getByRole("button", { name: "Pause risk forecast" }).click();
  await page.getByRole("button", { name: "Back to now" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "Play risk forecast" })).toBeDisabled();
  await page.route("**/api/risk/atlas?**", route => route.fulfill({ status: 503, json: { error: "Risk atlas unavailable" } }));
  await expect(page.getByRole("button", { name: "Refresh risk atlas" })).toBeEnabled();
  await page.getByRole("button", { name: "Refresh risk atlas" }).click();
  await expect(page.locator(".atlas-error")).toContainText("Risk atlas unavailable");
  await expect(page.locator(".atlas-coverage")).toContainText("CACHED / STALE");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Forecast hour")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/canonical-risk-atlas-mobile.png" });
  expect(obsolete).toEqual([]); expect(errors).toEqual([]);
});

test("a real crew submission updates the supervisor beacon, evidence, tasks and priority queue through SSE", async ({ page, request, context }) => {
  await request.post("/api/demo/reset", { data: {} });
  const snapshot = await (await request.get("/api/snapshot")).json();
  // Earlier screening checks can leave real NOAA cache entries after demo reset.
  const site = snapshot.sites.find((s: { id: string; catalogOnly?: boolean }) => s.catalogOnly && snapshot.siteRisks[s.id]?.risk === null);
  expect(site).toBeDefined();
  await page.route("**/api/sites/*/screening", r => r.fulfill({ status: 503, json: { error: "No fixture screening" } }));
  await page.addInitScript(id => localStorage.setItem("planit-site", id), site.id);
  await page.goto("/?view=atlas");
  await expect(page.getByTestId("atlas-risk")).toHaveText("Unknown");
  const crew = await context.newPage();
  await crew.route("**/api/sites/*/screening", r => r.fulfill({ status: 503, json: { error: "No fixture screening" } }));
  await crew.goto("/?view=reports");
  await crew.getByRole("button", { name: "Report hazard", exact: true }).first().click();
  const dialog = crew.getByRole("dialog");
  await dialog.getByLabel("Report plant").selectOption(site.id);
  await dialog.getByLabel("What happened?").fill("Truck stuck near access road; ground becoming saturated.");
  await dialog.getByRole("button", { name: "Share report", exact: true }).click();
  await expect(dialog).not.toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("atlas-risk")).not.toHaveText("Unknown", { timeout: 30000 });
  const score = Number((await page.getByTestId("atlas-risk").textContent())!.split(" /")[0]);
  expect(score).toBeGreaterThan(0); expect(score).toBeLessThan(10);
  await expect(page.locator(`.site-beacon[data-site-id="${site.id}"]`)).not.toHaveText("?");
  await expect(page.getByLabel("Active policy overrides")).toContainText("Truck stuck near access road");
  await expect(page.getByLabel("Task decisions")).toContainText("HOLD");
  await page.getByRole("navigation").getByRole("link", { name: "Site intelligence", exact: true }).click();
  await expect(page.locator(".priority-row").first()).toContainText(site.name);
  await crew.close();
});
