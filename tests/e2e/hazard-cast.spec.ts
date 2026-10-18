import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/demo/reset", { data: {} });
});

// Replay moves the shared demo clock; restore it so later specs start from the bundled scenario.
test.afterEach(async ({ request }) => {
  await request.post("/api/demo/reset", { data: {} });
});

test("learned hazard forecasts appear as historical evidence, the scorecard loads, and a real event replays the evening-before briefing", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  const snapshot = await (await request.get("/api/snapshot")).json();
  expect(snapshot.hazardForecasts["621"].mode).toBe("historical");
  // Catalog plants outside the trained cohort have no learned forecast.
  const catalog = snapshot.sites.find((s: { catalogOnly?: boolean }) => s.catalogOnly);
  expect(snapshot.hazardForecasts[catalog.id]).toBeUndefined();

  await page.goto("/?view=intelligence");
  await expect(page.getByRole("heading", { name: "The work ahead." })).toBeVisible({ timeout: 30000 });
  const panel = page.getByTestId("hazard-forecast");
  await expect(panel).toContainText("HISTORICAL LEARNED FORECAST");
  await expect(panel).toContainText("FloodCast");
  await expect(panel).toContainText("× normal");

  await page.goto("/?view=lab");
  await expect(page.getByRole("heading", { name: "Know what your model knows." })).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: /HazardCast/ }).click();
  const lab = page.getByTestId("hazard-lab");
  await expect(lab.locator(".hazard-table tbody tr")).toHaveCount(6);
  await expect(lab).toContainText("OSHA heat injuries");
  await expect(lab.locator(".hazard-table thead")).toContainText("vs rules, 95%");
  await lab.getByRole("button", { name: "Excluded plants" }).click();
  await expect(lab.getByRole("button", { name: "Excluded plants" })).toHaveAttribute("aria-pressed", "true");
  await lab.getByRole("button", { name: "Florida only" }).click();
  await expect(lab).toContainText("Florida only: the same models");
  await expect(lab).toContainText("seven excluded Florida plants");
  await expect(lab.locator(".hazard-table tbody tr")).toHaveCount(6);
  await lab.getByRole("button", { name: "Open 6 PM briefing" }).first().click();
  await expect(page).toHaveURL(/view=briefings/, { timeout: 30000 });
  await expect(page.locator(".briefing-card").first()).toContainText("OverallCast");
  await expect(page.locator(".briefing-card").first()).toContainText("historical learned forecast");
  expect(errors).toEqual([]);
});

test("replay rejects unknown events and keeps the clock in demo mode", async ({ request }) => {
  expect((await request.post("/api/demo/replay", { data: { event: 99 } })).status()).toBe(400);
  const replay = await (await request.post("/api/demo/replay", { data: { event: 0 } })).json();
  expect(replay.clockMode).toBe("demo");
  const briefing = replay.briefings.find((b: { text: string }) => /FloodCast/.test(b.text));
  expect(briefing.decision.policyVersion).toBe("continuous-policy-5");
});
