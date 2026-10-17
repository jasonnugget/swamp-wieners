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
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A clearer picture. A safer shift." }),
  ).toBeVisible();
  await expect(page.getByLabel("Active site")).toHaveValue("621");
  const second = await context.newPage();
  await second.goto("/");
  await expect(
    second.getByRole("heading", { name: "What can the crew do?" }),
  ).toBeVisible();
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
    second
      .locator(".task-row")
      .filter({ hasText: "Equipment mobilization" })
      .getByText("HOLD", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Demo controls" }).click();
  await page.getByRole("button", { name: "Strike within 6 mi" }).click();
  await expect(
    page.getByText("30 minutes remaining · resets with every strike"),
  ).toBeVisible();
  await page.getByRole("button", { name: "+10 min", exact: true }).click();
  await expect(
    page.getByText("20 minutes remaining · resets with every strike"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Strike within 6 mi" }).click();
  await expect(
    page.getByText("30 minutes remaining · resets with every strike"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run to 6 PM" }).click();
  await page
    .getByRole("button", { name: "Safety briefings", exact: true })
    .click();
  await expect(page.locator(".briefing-card")).toContainText(
    "Standing water blocks the equipment access road.",
  );
  await page.getByRole("button", { name: /Crew reports/ }).click();
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

test("models run and calibration trains real weights in browser, including offline inference", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: /Model Lab/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Learn this site" }),
  ).toBeEnabled({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Run fresh browser inference" })
    .click();
  await expect(page.locator(".inference-result")).toContainText(
    "Computed now, on this device",
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "Learn this site" }).click();
  await expect(page.getByText("Trained and saved on this device")).toBeVisible({
    timeout: 90000,
  });
  await expect(page.locator(".calibration-result")).toContainText(
    "240 training",
  );
  await page
    .getByRole("button", { name: "Reveal reanalysis outcomes" })
    .click();
  await expect(
    page.getByText("Reanalysis outcome", { exact: true }),
  ).toBeVisible();
  await page.getByRole("slider", { name: "Temperature sensitivity" }).fill("3");
  await expect(page.getByText("+3°C", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/model-lab.png", fullPage: true });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".three-map-canvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator(".three-map-canvas")).toHaveAttribute(
    "data-geography",
    "ready",
  );
  await expect(
    page.getByRole("heading", { name: "A clearer picture. A safer shift." }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: /Model Lab/ })
    .click();
  await expect(
    page.getByText("Trained and saved on this device"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Run fresh browser inference" })
    .click();
  await expect(page.locator(".inference-result")).toContainText(
    "Computed now, on this device",
  );
  expect(errors).toEqual([]);
  await context.setOffline(false);
});

test("dashboard and mobile report are usable without horizontal overflow", async ({
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
  await page.goto("/");
  await expect(page.locator(".three-map-canvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator(".three-map-canvas")).toHaveAttribute(
    "data-geography",
    "ready",
  );
  await page.waitForTimeout(1500);
  expect(mapErrors).toEqual([]);
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "A clearer picture. A safer shift." }),
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
