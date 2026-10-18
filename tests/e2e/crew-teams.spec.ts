import { test, expect } from "@playwright/test";

test.use({ actionTimeout: 15000 });

test("team assignments speed reporting, persist defaults, and retain report history", async ({ page, request, context }) => {
  await request.post("/api/demo/reset", { data: {} });
  const name = `Access crew ${Date.now()}`;
  await page.goto("/");
  await page.getByRole("navigation").getByRole("link", { name: /Crew reports/ }).click();
  await page.getByText("Manage teams and plant assignments", { exact: false }).click();
  await page.getByLabel("Team name", { exact: true }).fill(name);
  await page.getByLabel("Crew members (one name per line)").fill("Alex Rivera\nSam Chen");
  await page.getByRole("checkbox", { name: "Turkey Point · FL", exact: true }).check();
  await page.getByRole("checkbox", { name: "Bayboro · FL", exact: true }).check();
  await page.getByRole("button", { name: "Save team assignments" }).click();
  await expect(page.getByText(`${name} assignments saved.`)).toBeVisible();
  const snapshot = await (await request.get("/api/snapshot")).json();
  const team = snapshot.teams.find((t: { name: string }) => t.name === name);
  expect(team.siteIds).toEqual(["621", "627"]);

  const second = await context.newPage();
  await second.goto("/");
  await second.getByRole("button", { name: "Report hazard", exact: true }).first().click();
  await expect(second.getByLabel("Crew team").locator("option", { hasText: name })).toHaveCount(1);
  await second.close();

  await page.getByRole("button", { name: "Report hazard", exact: true }).first().click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Crew team").selectOption(team.id);
  await expect(modal.getByLabel("Report plant").locator("option")).toHaveCount(2);
  await modal.getByLabel("Your name", { exact: true }).selectOption("Sam Chen");
  await modal.getByLabel("What happened?").fill("Turkey Point draft stays at this plant.");
  await modal.getByLabel("Report plant").selectOption("627");
  await expect(modal.getByLabel("What happened?")).toHaveValue("");
  await modal.getByLabel("What happened?").fill("Standing water blocks Bayboro access.");
  const plant = snapshot.sites.find((s: { id: string }) => s.id === "627");
  await expect(modal.locator(".coordinates")).toHaveText(`${plant.latitude.toFixed(5)}, ${plant.longitude.toFixed(5)}`);
  await modal.getByRole("button", { name: "Share report", exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.locator(".report-card").first()).toContainText("Bayboro");
  await expect(page.locator(".report-card").first()).toContainText(`Sam Chen · ${name}`);
  const saved = await (await request.get("/api/snapshot")).json();
  expect(saved.reports[0]).toMatchObject({ teamId: team.id, teamName: name, author: "Sam Chen", siteId: "627" });
  expect(saved.decisions["627"].tasks.find((t: { task: string }) => t.task === "mobilization").state).toBe("HOLD");

  await page.reload();
  await page.getByRole("button", { name: "Report hazard", exact: true }).first().click();
  await expect(modal.getByLabel("Crew team")).toHaveValue(team.id);
  await expect(modal.getByLabel("Your name", { exact: true })).toHaveValue("Sam Chen");
  await expect(modal.getByLabel("Report plant")).toHaveValue("627");
  await modal.getByRole("button", { name: "Close report" }).click();

  const body = { teamId: team.id, siteId: "621", author: "Not a member", category: "soil", tasks: ["mobilization"], description: "Unsafe access road", latitude: 25.4, longitude: -80.3 };
  expect((await request.post("/api/reports", { data: body })).status()).toBe(400);
  expect((await request.post("/api/reports", { data: { ...body, author: "Sam Chen", siteId: "7846" } })).status()).toBe(400);
  expect((await request.post("/api/teams", { data: { name: "Invalid plant", members: ["Alex"], siteIds: ["missing"] } })).status()).toBe(400);
  expect((await request.post("/api/teams", { data: { name, members: ["Alex"], siteIds: ["621"] } })).status()).toBe(409);

  const updated = await request.post("/api/teams", { data: { ...team, name: `${name} revised`, siteIds: ["621"], members: ["Alex Rivera"] } });
  expect(updated.status()).toBe(200);
  expect((await request.post("/api/reports", { data: { ...body, author: "Sam Chen", siteId: "627" } })).status()).toBe(400);
  const history = await (await request.get("/api/snapshot")).json();
  expect(history.reports[0].teamName).toBe(name);
  await page.reload();
  await page.getByRole("button", { name: "Report hazard", exact: true }).first().click();
  await expect(modal.getByLabel("Report plant")).toHaveValue("621");
  await expect(modal.getByLabel("Your name", { exact: true })).toHaveValue("Alex Rivera");
  await expect(modal.getByLabel("What happened?")).toHaveValue("Turkey Point draft stays at this plant.");
  await modal.getByRole("button", { name: "Close report" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("navigation").getByRole("link", { name: /Crew reports/ }).click();
  await page.getByText("Manage teams and plant assignments", { exact: false }).click();
  const editButton = page.getByRole("button", { name: `Edit ${name} revised`, exact: true });
  await expect(editButton).toBeVisible();
  const buttonBox = (await editButton.boundingBox())!;
  const cardBox = (await editButton.locator("..").boundingBox())!;
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/crew-teams-mobile.png", fullPage: true });
  await request.post("/api/demo/reset", { data: {} });
  const reset = await (await request.get("/api/snapshot")).json();
  expect(reset.teams.some((t: { id: string }) => t.id === team.id)).toBe(true);
});
