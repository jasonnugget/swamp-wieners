import { test, expect } from "@playwright/test";
import { atlasFrame } from "./risk-fixtures";

test("homepage charts use known canonical scores, source coverage and actual report states", async ({ page, request }) => {
  const snapshot = await (await request.get("/api/snapshot")).json();
  const frames = atlasFrame().sites.slice(0, 4);
  snapshot.sites = frames.map(e => e.site);
  snapshot.siteRisks = Object.fromEntries(frames.map(({ site, snapshot: r }, i) => {
    r.risk = [0, 6, 9, null][i];
    r.observation.coverage.percent = [100, 35, 90, 0][i];
    r.observation.provenance.stale = i === 2;
    r.channels.forEach(c => { c.score = c.hazard === "heat" ? [0, 6, 10, null][i] : null; });
    return [site.id, r];
  }));
  const report = { siteId: frames[0].site.id, category: "soil", description: "Fixture access road report", tasks: ["mobilization"], latitude: 0, longitude: 0, author: "Fixture crew", createdAt: "2026-10-17T10:00:00.000Z" };
  snapshot.reports = [{ ...report, id: "open-fixture", status: "open" }, { ...report, id: "resolved-fixture", status: "resolved" }];
  await page.route("**/api/snapshot", r => r.fulfill({ json: snapshot }));
  await page.addInitScript(id => localStorage.setItem("planit-site", id), frames[0].site.id);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const profile = page.getByRole("figure", { name: "National hazard profile" });
  await profile.scrollIntoViewIfNeeded();
  await expect(profile.getByRole("button", { name: "Heat: 3.0 out of 10, 2 of 4 sites", exact: true })).toBeVisible();
  await expect(profile.getByRole("button", { name: /^Heat:/ }).locator(".signal-bar")).toHaveCSS("background-color", "rgb(157, 72, 45)");
  await expect(profile.getByRole("button", { name: /^Weather:/ }).locator(".signal-bar")).toHaveCSS("background-color", "rgb(125, 136, 104)");
  await profile.getByRole("button", { name: "Flood: unknown, 0 of 4 sites", exact: true }).click();
  await expect(profile.locator(".signal-readout > strong")).toContainText("?");
  await expect(profile.locator('[data-unknown="true"]')).toHaveCount(6);
  const scatter = page.getByRole("figure", { name: "Site risk compared with source coverage" });
  await expect(scatter.locator(".signal-point")).toHaveCount(2);
  await expect(scatter.locator(".signal-point").first()).toHaveAttribute("cy", "235");
  await scatter.getByLabel("Inspect a plant").selectOption(frames[1].site.id);
  await expect(scatter.locator(".signal-readout")).toContainText("35% source coverage");
  await expect(scatter.locator(".signal-readout > strong")).toContainText("6.0");
  const crew = page.getByRole("figure", { name: "Crew report handoff by hazard" });
  await expect(crew.locator(".signal-readout")).toContainText("2 total · 1 resolved");
  await expect(crew.locator(".signal-reports > div").filter({ hasText: "Soil" })).toContainText("1 / 1");
  await page.setViewportSize({ width: 390, height: 844 });
  await scatter.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(scatter.getByLabel("Inspect a plant")).toBeVisible();
});

test("homepage chart entrances pause and preserve readings when motion is disabled", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "The field. In perspective." }).waitFor();
  const profile = page.getByRole("figure", { name: "National hazard profile" });
  await profile.scrollIntoViewIfNeeded();
  await expect.poll(() => profile.locator(".signal-reveal").first().evaluate(el => getComputedStyle(el).transform)).toBe("matrix(1, 0, 0, 1, 0, 0)");
  const measurement = await profile.locator(".signal-bar").first().evaluate(el => getComputedStyle(el).transform);
  await page.getByRole("button", { name: "Pause ambient motion" }).click();
  await expect(profile.locator(".signal-reveal").first()).toHaveCSS("transform", "none");
  await expect(profile.locator(".signal-bar").first()).toHaveCSS("transform", measurement);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await profile.scrollIntoViewIfNeeded();
  await expect(profile.locator(".signal-readout")).toBeVisible();
});
