import { test, expect } from "@playwright/test";
import { atlasFrame, atlasSites } from "./risk-fixtures";
import { completeSiteData, siteDataPreview } from "../../shared/site-data";

test("completion APIs fill every plant while canonical unknowns, zeroes, risk and policy stay separate", async ({ request }) => {
  const raw = await (await request.get("/api/risk/atlas")).json();
  for (const hour of [0, 72]) {
    const response = await request.get(`/api/risk/atlas?hour=${hour}&completion=1`);
    expect(response.status()).toBe(200);
    const frame = await response.json();
    expect(frame.sites).toHaveLength(285);
    for (const entry of frame.sites) {
      const preview = entry.completion;
      expect(preview.usage).toBe("DEMO_ONLY");
      expect(Object.keys(preview.fields)).toHaveLength(34);
      for (const [group, fields] of Object.entries(preview.scenario) as [string, Record<string, unknown>][]) {
        for (const [field, value] of Object.entries(fields)) {
          expect(value, `${entry.site.id}: ${group}.${field}`).not.toBeNull();
          const observed = entry.snapshot.observation[group][field];
          if (observed !== null && `${group}.${field}` !== "lightning.evidenceMode") expect(value).toEqual(observed);
        }
      }
      if (hour === 0) {
        const prior = raw.sites.find((p: { site: { id: string } }) => p.site.id === entry.site.id).snapshot;
        expect(entry.snapshot.risk).toEqual(prior.risk);
        expect(entry.snapshot.tasks).toEqual(prior.tasks);
        expect(entry.snapshot.observation.coverage).toEqual(prior.observation.coverage);
      } else expect(entry.snapshot.observation.flood.stage).toBeNull();
    }
  }
  const single = await request.get(`/api/sites/${atlasSites[0].id}/data-completion`);
  expect(single.status()).toBe(200); expect((await single.json()).usage).toBe("DEMO_ONLY");
  expect((await request.get("/api/sites/missing/data-completion")).status()).toBe(404);
  expect((await request.get("/api/risk/atlas?completion=invalid")).status()).toBe(400);
  expect(raw.sites[0].completion).toBeUndefined();
});

test("synthetic gaps are labeled, reversible and available across sites, forecast hours and intelligence", async ({ page }) => {
  const errors: string[] = [], requests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => requests.push(request.url()));
  await page.route("**/api/sites/*/screening", r => r.fulfill({ status: 503, json: { error: "No fixture screening" } }));
  await page.route("**/api/risk/atlas?**", route => {
    const frame = atlasFrame(Number(new URL(route.request().url()).searchParams.get("hour")));
    for (const entry of frame.sites) entry.completion = siteDataPreview(completeSiteData(entry.site, entry.snapshot.observation, Date.parse(frame.validAt)));
    return route.fulfill({ json: frame });
  });
  await page.route("**/api/sites/*/data-completion", route => {
    const id = route.request().url().split("/").at(-2), entry = atlasFrame().sites.find(p => p.site.id === id)!;
    return route.fulfill({ json: siteDataPreview(completeSiteData(entry.site, entry.snapshot.observation, Date.now())) });
  });
  await page.addInitScript(id => localStorage.setItem("planit-site", id), atlasSites[3].id);
  await page.goto("/?view=atlas");
  const panel = page.getByLabel("Site risk inspection");
  await panel.getByRole("button", { name: "Conditions", exact: true }).click();
  const fill = panel.getByRole("checkbox", { name: "Fill gaps with demo estimates" });
  await expect(fill).toBeChecked();
  await expect(panel.locator('.observation-field[data-known="false"]')).toHaveCount(0);
  const temperature = panel.locator('[data-observation-field="weather.temperatureF"]');
  await expect(temperature).toHaveAttribute("data-origin", "synthetic");
  await temperature.locator("summary").click();
  await expect(temperature).toContainText("DEMO ONLY");
  await expect(page.getByTestId("atlas-risk")).toHaveText("Unknown");
  await expect(page.getByTestId("atlas-coverage")).toHaveText("0%");
  await fill.uncheck();
  await expect(temperature.locator("summary")).toContainText("Unknown");
  await expect(temperature).toHaveAttribute("data-origin", "unknown");
  await fill.check();
  await page.getByLabel("Active site").selectOption(atlasSites[0].id);
  await expect(temperature).toHaveAttribute("data-origin", "source");
  await expect(temperature.locator("summary")).toContainText("70.0 °F");
  await expect(panel.locator('[data-observation-field="weather.precipitation1hMm"] summary')).toContainText("0.0 mm");
  await page.getByLabel("Forecast hour").fill("72");
  await expect(temperature.locator("summary")).toContainText("88.0 °F");
  await expect(panel.locator('.observation-field[data-known="false"]')).toHaveCount(0);
  await page.getByRole("navigation").getByRole("link", { name: "Site intelligence", exact: true }).click();
  const evidence = page.getByLabel("Current environmental evidence");
  await expect(evidence.getByRole("checkbox", { name: "Fill gaps with demo estimates" })).toBeChecked();
  await expect(evidence.locator('.observation-field[data-known="false"]')).toHaveCount(0);
  expect(requests.some(url => url.includes("completion=1"))).toBe(true);
  expect(errors).toEqual([]);
});
