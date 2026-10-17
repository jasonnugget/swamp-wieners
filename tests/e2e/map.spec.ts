import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/demo/reset", { data: {} });
});

test("3D map selects real sites, orbits, zooms, and expands for a showcase", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/?view=atlas");
  const map = page.getByTestId("site-map");
  const canvas = map.locator(".three-map-canvas");
  await expect(canvas).toHaveAttribute("data-geography", "ready");
  await page.getByRole("button", { name: "Site risk", exact: true }).click();
  await expect(map.locator(".site-beacon")).toHaveCount(285);
  await map.locator('[data-site-id="55433"]').focus();
  await map.locator('[data-site-id="55433"]').press("Enter");
  await expect(page.getByLabel("Active site")).toHaveValue("55433");
  await expect(map.locator(".scene-site-card")).toContainText(
    "Bayou Cove Peaking Power",
  );
  await page.waitForTimeout(800);
  const before = await canvas.getAttribute("data-camera");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.46);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.55, {
    steps: 12,
  });
  await page.mouse.up();
  await expect.poll(() => canvas.getAttribute("data-camera")).not.toBe(before);
  await expect(page.getByLabel("Active site")).toHaveValue("55433");
  await page.waitForTimeout(400);
  const distance = Number(
    (await canvas.getAttribute("data-camera"))!.split(",")[2],
  );
  await map.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(async () =>
      Number((await canvas.getAttribute("data-camera"))!.split(",")[2]),
    )
    .toBeLessThan(distance);
  await map.getByRole("button", { name: "Use top-down view" }).click();
  await expect(
    map.getByRole("button", { name: "Use 3D perspective" }),
  ).toHaveAttribute("aria-pressed", "true");
  await map.getByRole("button", { name: "Open showcase mode" }).click();
  await expect(map).toHaveClass(/is-expanded/);
  await map.getByRole("button", { name: "Use 3D perspective" }).click();
  await map.getByRole("button", { name: "Fit all sites" }).click();
  await page.waitForTimeout(800);
  await map.getByRole("button", { name: "Rotate map automatically" }).click();
  await expect(
    map.getByRole("button", { name: "Pause map rotation" }),
  ).toHaveAttribute("aria-pressed", "true");
  const orbit = await canvas.getAttribute("data-camera");
  await expect.poll(() => canvas.getAttribute("data-camera")).not.toBe(orbit);
  await map.getByRole("button", { name: "Pause map rotation" }).click();
  await page.screenshot({ path: "test-results/three-map-showcase.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    map.getByRole("button", { name: "Rotate map automatically" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(map).not.toHaveClass(/is-expanded/);
  await expect(
    map.getByRole("button", { name: "Open showcase mode" }),
  ).toBeFocused();
  expect(errors).toEqual([]);
});

test("3D report map raycasts a pin to real coordinates and ignores pan and pinch gestures", async ({
  page,
  request,
  context,
}) => {
  await page.goto("/?view=atlas");
  await page
    .getByRole("button", { name: "Report hazard", exact: true })
    .first()
    .click();
  await page
    .getByLabel("What happened?")
    .fill("Mud has blocked the access road near the staging area.");
  const modal = page.getByRole("dialog");
  const canvas = modal.locator(".three-map-canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true");
  const coordinates = modal.locator(".coordinates");
  const original = await coordinates.textContent();
  const box = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: box.width * 0.65, y: box.height * 0.38 },
  });
  await expect(coordinates).not.toHaveText(original!);
  const pinned = await coordinates.textContent();
  const [latitude, longitude] = pinned!.split(",").map(Number);
  expect(latitude).toBeGreaterThan(25.2);
  expect(latitude).toBeLessThan(25.7);
  expect(longitude).toBeGreaterThan(-80.6);
  expect(longitude).toBeLessThan(-80.1);
  await page.mouse.move(box.x + box.width * 0.73, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.83, box.y + box.height * 0.72, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(coordinates).toHaveText(pinned!);
  const touch = await context.newCDPSession(page);
  const points = [
    { x: box.x + box.width * 0.35, y: box.y + box.height * 0.65, id: 1 },
    { x: box.x + box.width * 0.65, y: box.y + box.height * 0.65, id: 2 },
  ];
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points,
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { ...points[0], x: points[0].x - 15 },
      { ...points[1], x: points[1].x + 15 },
    ],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await touch.detach();
  await expect(coordinates).toHaveText(pinned!);
  await page.getByRole("button", { name: "Share report", exact: true }).click();
  await expect(modal).not.toBeVisible();
  const snapshot = await (await request.get("/api/snapshot")).json();
  expect(snapshot.reports[0].latitude).toBeCloseTo(latitude, 4);
  expect(snapshot.reports[0].longitude).toBeCloseTo(longitude, 4);
  await expect(page.locator(".scene-report-pin")).toHaveCount(1);
});

test("without WebGL, the flat fallback still selects sites and places hazard pins", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.includes("webgl")) return null;
      return Reflect.apply(getContext, this, [type, ...args]);
    } as typeof getContext;
  });
  await page.goto("/?view=atlas");
  await expect(page.getByTestId("flat-map")).toBeVisible();
  await expect(page.locator(".scene-warning")).toContainText("3D graphics unavailable");
  await page
    .getByRole("button", { name: /Bayou Cove Peaking Power, Site risk/ })
    .focus();
  await page
    .getByRole("button", { name: /Bayou Cove Peaking Power, Site risk/ })
    .press("Enter");
  await expect(page.getByLabel("Active site")).toHaveValue("55433");
  await page
    .getByRole("button", { name: "Report hazard", exact: true })
    .first()
    .click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByTestId("flat-map")).toBeVisible();
  const original = await modal.locator(".coordinates").textContent();
  const svg = modal.locator(".flat-map-surface"),
    box = (await svg.boundingBox())!;
  await svg.click({ position: { x: box.width * 0.65, y: box.height * 0.38 } });
  await expect(modal.locator(".coordinates")).not.toHaveText(original!);
});

test.describe("scene module failures", () => {
  // Route interception must reach the import instead of a service-worker cache.
  test.use({ serviceWorkers: "block" });

  test("a scene module loading failure is distinguished from unavailable graphics", async ({ page }) => {
    await page.route(/\/assets\/scene-[^/]+\.js$/, (route) => route.abort());
    await page.goto("/?view=atlas");
    await expect(page.getByTestId("flat-map")).toBeVisible();
    await expect(page.locator(".scene-warning")).toContainText("3D map files could not load");
    await expect(page.locator(".scene-warning")).not.toContainText("graphics unavailable");
  });
});
