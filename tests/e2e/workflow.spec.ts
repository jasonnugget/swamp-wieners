import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/demo/reset", { data: {} });
});

test("report changes another screen, survives the briefing, resolves with history, and preserves lightning holds", async ({
  page,
  context,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?view=reports");
  await expect(
    page.getByRole("heading", { name: "Local knowledge that stays." }),
  ).toBeVisible();
  await expect(page.getByLabel("Active site")).toHaveCount(0);
  const second = await context.newPage();
  await second.goto("/?view=atlas");
  await expect(second.getByRole("region", { name: "All sites by risk" })).toBeVisible();
  await page
    .getByRole("button", { name: "Report hazard", exact: true })
    .first()
    .click();
  await page
    .getByLabel("What happened?")
    .fill("Standing water blocks the equipment access road.");
  await page.getByLabel("Attach photo").setInputFiles({
    name: "hazard.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Share report", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    second.getByLabel("Active policy overrides"),
  ).toContainText("Standing water blocks the equipment access road.", { timeout: 10000 });
  await page.getByRole("button", { name: "Demo controls" }).click();
  await page.getByRole("button", { name: "Strike within 6 mi" }).click();
  await expect.poll(async () => (await (await request.get("/api/snapshot")).json()).decisions["621"].lightningUntil).not.toBeNull();
  await page.getByRole("button", { name: "+10 min", exact: true }).click();
  await page.getByRole("button", { name: "Strike within 6 mi" }).click();
  await page.getByRole("button", { name: "Run to 6 PM" }).click();
  await page
    .getByRole("link", { name: "Safety briefings", exact: true })
    .click();
  await expect(page.locator(".briefing-card")).toContainText(
    "Standing water blocks the equipment access road.",
  );
  await page.getByRole("navigation").getByRole("link", { name: /Crew reports/ }).click();
  await page.getByRole("button", { name: "Review and resolve" }).click();
  await page
    .getByLabel("What did you verify?")
    .fill("Access inspected; equipment can use the alternate road.");
  await page.getByRole("button", { name: "Record resolution" }).click();
  await page.getByRole("button", { name: /All history/ }).click();
  await expect(page.getByText("Cleared by Supervisor")).toBeVisible();
  const snap = await (await request.get("/api/snapshot")).json();
  expect(snap.reports[0].status).toBe("resolved");
  expect(snap.decisions["621"].lightningUntil).not.toBeNull();
  expect(errors).toEqual([]);
  await second.close();
});

test("atlas and mobile report are usable without horizontal overflow", async ({
  page,
}) => {
  const mapErrors: string[] = [];
  page.on("console", (msg) => {
    if (
      msg.type() === "error" &&
      /Worker failed|Failed to load resource/.test(msg.text())
    )
      mapErrors.push(msg.text());
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/?view=atlas");
  await expect(page.locator(".three-map-canvas")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30000 },
  );
  await expect(page.locator(".three-map-canvas")).toHaveAttribute(
    "data-geography",
    "ready",
    { timeout: 30000 },
  );
  await page.waitForTimeout(1500);
  expect(mapErrors).toEqual([]);
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Site risk, in perspective." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Report hazard", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-report.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
