import { test, expect } from "@playwright/test";

for (const legacy of ["before canonical risk", "before structured risk evidence"]) {
  test(`an old cache ${legacy} shows a recoverable connection screen instead of crashing`, async ({ page, request }) => {
    const cached = await (await request.get("/api/snapshot")).json();
    if (legacy === "before canonical risk") delete cached.siteRisks;
    else for (const risk of Object.values(cached.siteRisks) as { explanation?: unknown }[]) delete risk.explanation;
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(snapshot => {
      localStorage.setItem("planit-snapshot-v1", JSON.stringify(snapshot));
      localStorage.setItem("planit-crew-profile", JSON.stringify({ author: "Keep my profile" }));
    }, cached);
    await page.route("**/api/snapshot", route => route.fulfill({ status: 503, json: { error: "Snapshot temporarily unavailable" } }));
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText("Snapshot temporarily unavailable");
    await expect(page.getByRole("button", { name: "Retry connection" })).toBeVisible();
    expect(errors).toEqual([]);
    await page.unroute("**/api/snapshot");
    await page.getByRole("button", { name: "Retry connection" }).click();
    await expect(page.getByRole("heading", { name: "The field. In perspective." })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("planit-snapshot-v1")!).format)).toBe(2);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("planit-crew-profile")!).author)).toBe("Keep my profile");
    expect(errors).toEqual([]);
  });
}

test("browser cache quota failures do not discard successful live snapshot reads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "planit-snapshot-v1") throw new DOMException("Storage full", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The field. In perspective." })).toBeVisible();
  await expect(page.locator(".offline-banner")).toHaveCount(0);
  expect(errors).toEqual([]);
});
