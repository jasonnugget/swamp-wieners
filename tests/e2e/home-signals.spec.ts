import { test, expect } from "@playwright/test";
import { atlasFrame } from "./risk-fixtures";

test("automatic charts use backend scores, fresh hourly forecasts and policy without crew input", async ({ page, request }) => {
  const snapshot = await (await request.get("/api/snapshot")).json();
  const frames = atlasFrame().sites.slice(0, 4), now = Date.now(), hour = 3600000, start = Math.floor(now / hour) * hour;
  snapshot.sites = frames.map(e => e.site);
  snapshot.reports = [];
  snapshot.siteRisks = Object.fromEntries(frames.map(({ site, snapshot: r }, i) => {
    r.observation.provenance.stale = i === 2;
    r.channels.forEach(c => { c.score = c.hazard === "heat" ? [0, 6, 10, null][i] : null; });
    r.tasks = (["mobilization", "installation", "preparation"] as const).map(task => ({ task, state: task === "preparation" ? "AVAILABLE" : (["AVAILABLE", "HOLD", "RESTRICTED", "UNKNOWN"] as const)[i], reasons: ["Backend fixture decision"] }));
    return [site.id, r];
  }));
  snapshot.weatherScreenings = Object.fromEntries(frames.map(({ site }, i) => [site.id, {
    siteId: site.id, source: "NOAA/NWS", sourceUrl: "https://api.weather.gov/fixture",
    issuedAt: new Date(now - 1000).toISOString(), fetchedAt: new Date(i === 2 ? now - 4 * hour : i === 3 ? now + hour : now - 1000).toISOString(),
    hours: Array.from({ length: 24 }, (_, h) => ({ time: new Date(start + h * hour).toISOString(), heatIndex: i === 1 && h === 2 ? null : h === (i === 1 ? 5 : 2) ? [100, 110, 180, 200][i] : 80, windKmh: h === 0 ? 0 : h === 4 ? null : 16.09344 })),
  }]));
  await page.route("**/api/snapshot", r => r.fulfill({ json: snapshot }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const profile = page.getByRole("figure", { name: "National hazard profile" });
  await profile.scrollIntoViewIfNeeded();
  await expect(profile.getByRole("button", { name: "Heat: 3.0 out of 10, 2 of 4 sites", exact: true })).toBeVisible();
  await expect(profile.locator(".dial-value")).toHaveCount(1);
  await profile.getByRole("button", { name: "Flood: unknown, 0 of 4 sites", exact: true }).click();
  await expect(profile.locator(".dial-number")).toHaveText("?");
  const outlook = page.getByRole("figure", { name: "Automatic 24-hour heat and wind outlook" });
  await outlook.scrollIntoViewIfNeeded();
  await expect(outlook.locator(".outlook-place")).toContainText(frames[1].site.name);
  await expect(outlook.locator(".outlook-peak")).toContainText("110°F");
  await expect(outlook.getByRole("combobox")).toHaveValue(frames[1].site.id);
  await expect(outlook.getByRole("combobox").locator("option")).toHaveCount(2);
  await expect(outlook.locator(".outlook-curve")).toHaveCount(2);
  const slider = outlook.getByRole("slider", { name: "Inspect forecast hour" });
  await slider.focus(); await slider.press("Home");
  await expect(outlook.locator(".outlook-readings")).toContainText("0.0 mph");
  for (let i = 0; i < 4; i++) await slider.press("ArrowRight");
  await expect(outlook.locator(".outlook-readings > div").nth(1)).toContainText("? mph");
  await expect(outlook.getByRole("button", { name: "Play weather scan" })).toBeDisabled();
  const board = page.getByRole("figure", { name: "Automatic site work-readiness board" });
  await expect(board.getByRole("img")).toHaveAttribute("aria-label", /1 available, 1 restricted, 1 hold, 1 unknown/);
  await board.getByRole("button", { name: "Sheltered preparation" }).click();
  await expect(board.getByRole("img")).toHaveAttribute("aria-label", /4 available, 0 restricted, 0 hold, 0 unknown/);
  await page.setViewportSize({ width: 390, height: 844 });
  await outlook.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("missing forecasts show an empty state instead of a manufactured curve", async ({ page, request }) => {
  const snapshot = await (await request.get("/api/snapshot")).json(); snapshot.weatherScreenings = {};
  await page.route("**/api/snapshot", r => r.fulfill({ json: snapshot }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const outlook = page.getByRole("figure", { name: "Automatic 24-hour heat and wind outlook" });
  await expect(outlook).toContainText("No fresh hourly outlook");
  await expect(outlook.locator(".outlook-curve")).toHaveCount(0);
});

test("animated forecast scans actual hours and pauses with the ambient control", async ({ page, request }) => {
  const snapshot = await (await request.get("/api/snapshot")).json(), site = snapshot.sites[0], now = Date.now(), start = Math.floor(now / 3600000) * 3600000;
  snapshot.weatherScreenings = { [site.id]: { siteId: site.id, source: "NOAA/NWS", sourceUrl: "https://api.weather.gov/fixture", fetchedAt: new Date(now - 1000).toISOString(), issuedAt: new Date(now - 1000).toISOString(), hours: Array.from({ length: 24 }, (_, h) => ({ time: new Date(start + h * 3600000).toISOString(), heatIndex: 80 + h, windKmh: 10 })) } };
  await page.route("**/api/snapshot", r => r.fulfill({ json: snapshot }));
  await page.goto("/");
  const outlook = page.getByRole("figure", { name: "Automatic 24-hour heat and wind outlook" });
  await outlook.scrollIntoViewIfNeeded();
  const slider = outlook.getByRole("slider"), first = await slider.inputValue();
  await expect.poll(() => slider.inputValue()).not.toBe(first);
  await page.getByRole("button", { name: "Pause ambient motion" }).click();
  const stopped = await slider.inputValue();
  await page.waitForTimeout(1800);
  await expect(slider).toHaveValue(stopped);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(outlook.getByRole("button", { name: "Pause weather scan" })).toBeDisabled();
});
