import { test, expect } from "@playwright/test";
import { expectSite, pickSite } from "./atlas-site";
import type { Site } from "../../shared/types";

test("national catalog selects plants outside the model cohort and supports reporting without fabricated forecasts", async ({ page, request }) => {
  await request.post("/api/demo/reset", { data: {} });
  await page.route("**/api/sites/*/screening", route => route.fulfill({ status: 503, json: { error: "Offline fixture" } }));
  const snapshot = await (await request.get("/api/snapshot")).json();
  expect(snapshot.sites).toHaveLength(285);
  expect(new Set(snapshot.sites.map((s: Site) => s.state)).size).toBe(50);
  const california = snapshot.sites.find((s: Site) => s.state === "CA") as Site;
  expect(snapshot.forecasts[california.id]).toBeUndefined();
  expect(snapshot.decisions[california.id].index).toBeNull();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?view=atlas");
  await pickSite(page, california.id);
  await expect(page.locator(".atlas-location-title")).toContainText(california.name);
  await page.getByRole("button", { name: "Site risk", exact: true }).click();
  await expect(page.locator(".site-beacon")).toHaveCount(285);
  await expect(page.locator(".atlas-location-title")).toContainText(california.name);
  await page.getByRole("navigation").getByRole("link", { name: /Crew reports/ }).click();
  await page.getByRole("button", { name: "Report hazard", exact: true }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByLabel("Report plant")).toHaveValue(california.id);
  await modal.getByLabel("What happened?").fill("Access road blocked near this California plant.");
  await modal.getByRole("button", { name: "Share report", exact: true }).click();
  await expect(modal).not.toBeVisible();
  const saved = await (await request.get("/api/snapshot")).json();
  expect(saved.reports[0].siteId).toBe(california.id);
  expect(saved.decisions[california.id].tasks.find((t: { task: string }) => t.task === "mobilization").state).toBe("HOLD");
  await expect(page.locator(".report-card").first()).toContainText(california.name);
  await page.goto("/?view=atlas");
  for (const state of ["AK", "HI"]) {
    const plant = snapshot.sites.find((s: Site) => s.state === state) as Site;
    await pickSite(page, plant.id);
    await expectSite(page, plant.id);
  }
  expect(errors).toEqual([]);
});

test("official forecast screening gives CA, AK and HI numeric map risks and stale data stays unknown", async ({ page, request }) => {
  const { decide } = await import("../../shared/policy");
  const { siteRisk } = await import("../../server/pipeline");
  await request.post("/api/demo/reset", { data: {} });
  const snapshot = await (await request.get("/api/snapshot")).json();
  const plants = snapshot.sites.filter((s: Site) => ["CA", "AK", "HI"].includes(s.state)) as Site[];
  let stale = false;
  await page.route("**/api/sites/*/screening", route => route.fulfill({ json: {} }));
  await page.route("**/api/snapshot", route => {
    const now = Date.now();
    const weatherScreenings = Object.fromEntries(plants.map(plant => [plant.id, {
      siteId: plant.id, source: "NOAA/NWS" as const, sourceUrl: "https://api.weather.gov/gridpoints/test/1,1/forecast/hourly",
      fetchedAt: new Date(now - (stale ? 4 * 3600000 : 0)).toISOString(), issuedAt: new Date(now - 3600000).toISOString(),
      hours: [{ time: new Date(now - 60000).toISOString(), heatIndex: 104, windKmh: 55 }],
    }]));
    const decisions = { ...snapshot.decisions, ...Object.fromEntries(plants.map(plant => [plant.id, decide(plant, undefined, [], [], [], Date.parse(snapshot.now), undefined, weatherScreenings[plant.id], now)])) };
    const siteRisks = { ...snapshot.siteRisks, ...Object.fromEntries(plants.map(plant => [plant.id, siteRisk(plant, undefined, now, [], [], [], false, weatherScreenings[plant.id]).snapshot])) };
    return route.fulfill({ json: { ...snapshot, weatherScreenings, decisions, siteRisks } });
  });
  await page.route("**/api/risk/atlas?**", route => {
    const data = snapshot;
    const now = Date.now();
    const risks = Object.fromEntries(plants.map(plant => [plant.id, siteRisk(plant, undefined, now, [], [], [], false, { siteId: plant.id, source: "NOAA/NWS", sourceUrl: "https://api.weather.gov/test", fetchedAt: new Date(now - (stale ? 4 * 3600000 : 0)).toISOString(), issuedAt: new Date(now - 3600000).toISOString(), hours: [{ time: new Date(now - 60000).toISOString(), heatIndex: 104, windKmh: 55 }] }).snapshot]));
    return route.fulfill({ json: { version: 1, hour: 0, kind: "CURRENT", generatedAt: new Date(now).toISOString(), validAt: new Date(now).toISOString(), limitations: [], sites: data.sites.map((site: Site) => ({ site, snapshot: risks[site.id] ?? data.siteRisks[site.id] })) } });
  });
  await page.goto("/?view=atlas");
  await page.getByRole("button", { name: "Site risk", exact: true }).click();
  for (const state of ["CA", "AK", "HI"]) {
    const plant = plants.find(p => p.state === state)!;
    await pickSite(page, plant.id);
    await expect(page.locator(".atlas-location-title")).toContainText(plant.name);
    await expect(page.locator(".site-beacon.is-selected")).toHaveText("6.3");
  }
  stale = true;
  await page.reload();
  await expect(page.getByRole("region", { name: "All sites by risk" })).toBeVisible();
  await page.getByRole("button", { name: "Site risk", exact: true }).click();
  await expect(page.locator(".site-beacon.is-selected")).toHaveText("?");
});
