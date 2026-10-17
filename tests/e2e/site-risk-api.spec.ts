import { test, expect } from "@playwright/test";
import type { Snapshot } from "../../shared/types";
import { siteObservationV1Schema } from "../../shared/risk";

test("canonical risk API covers every plant and preserves compatibility endpoints", async ({ request }) => {
  const response = await request.get("/api/snapshot");
  expect(response.ok()).toBeTruthy();
  const snapshot: Snapshot = await response.json();
  const risks = await (await request.get("/api/sites/risks")).json();
  expect(Object.keys(risks).sort()).toEqual(snapshot.sites.map(s => s.id).sort());
  for (const site of snapshot.sites) {
    expect(siteObservationV1Schema.safeParse(risks[site.id].observation).success).toBeTruthy();
    expect(risks[site.id].channels).toHaveLength(7);
    expect(["LIVE", "DEMO", "FORECAST", "UNAVAILABLE"]).toContain(risks[site.id].observation.lightning.evidenceMode);
    for (const provider of ["usgs", "firms", "floodplain", "wildlife", "lightning", "nws"]) {
      expect(["ok", "error", "unavailable"]).toContain(risks[site.id].observation.provenance.providers[provider].status);
      expect(risks[site.id].observation.provenance.providers[provider]).toHaveProperty("fetchedAt");
      expect(risks[site.id].observation.provenance.providers[provider]).toHaveProperty("validUntil");
    }
    expect(risks[site.id].scoringVersion).toBe("continuous-risk-4");
    expect(risks[site.id].explanation).toHaveProperty("primary");
    expect(risks[site.id].explanation.compounding).toBeInstanceOf(Array);
    for (const channel of risks[site.id].channels) {
      expect(channel.confidence).toBeGreaterThanOrEqual(0);
      expect(channel.confidence).toBeLessThanOrEqual(1);
      if (channel.score !== null) {
        expect(channel.score).toBeGreaterThanOrEqual(0);
        expect(channel.score).toBeLessThanOrEqual(10);
      }
      expect(channel.factors).toBeInstanceOf(Array);
    }
    expect(risks[site.id].observation.coverage.percent).toBeGreaterThanOrEqual(0);
    expect(risks[site.id].mlCoverage.heatCast).toBe(!site.catalogOnly);
  }
  const id = snapshot.sites[0].id;
  const single = await request.get(`/api/sites/${id}/risk`);
  expect(single.status()).toBe(200);
  expect((await single.json()).observation).toEqual(risks[id].observation);
  expect((await request.get("/api/sites/nonexistent/risk")).status()).toBe(404);
});

test("ordinary crew reports have a bounded risk contribution and an independent explicit hold", async ({ request }) => {
  await request.post("/api/demo/reset", { data: {} });
  const snapshot: Snapshot = await (await request.get("/api/snapshot")).json();
  const site = snapshot.sites.find(s => s.catalogOnly)!;
  const response = await request.post("/api/reports", { data: { siteId: site.id, category: "soil", description: "Access road becoming difficult", tasks: ["mobilization"], latitude: site.latitude, longitude: site.longitude, author: "Test crew" } });
  expect(response.status()).toBe(201);
  const saved = await (await request.get("/api/snapshot")).json();
  expect(saved.decisions[site.id].index).toBe(4);
  expect(saved.decisions[site.id].channels.find((c: {category: string}) => c.category === "soil").severity).toBe(4);
  expect(saved.decisions[site.id].tasks.find((t: {task: string}) => t.task === "mobilization").state).toBe("HOLD");
});

test("risk atlas batches every site, preserves current parity, and validates the 72-hour frame contract", async ({ request }) => {
  const current = await request.get("/api/risk/atlas");
  expect(current.status()).toBe(200);
  const atlas = await current.json();
  expect(atlas.kind).toBe("CURRENT"); expect(atlas.hour).toBe(0); expect(atlas.sites).toHaveLength(285);
  const risks = await (await request.get("/api/sites/risks")).json();
  for (const entry of atlas.sites) {
    expect(entry.snapshot.observation).toEqual(risks[entry.site.id].observation);
    expect(entry.snapshot.risk).toEqual(risks[entry.site.id].risk);
  }
  const future = await (await request.get("/api/risk/atlas?hour=72")).json();
  expect(future.kind).toBe("FORECAST"); expect(future.hour).toBe(72); expect(future.sites).toHaveLength(285);
  expect(future.limitations.length).toBeGreaterThan(0);
  for (const entry of future.sites) {
    expect(siteObservationV1Schema.safeParse(entry.snapshot.observation).success).toBeTruthy();
    expect(entry.snapshot.observation.provenance.mode).toBe("forecast");
    expect(entry.snapshot.observation.flood.stage).toBeNull();
    expect(entry.snapshot.observation.lightning.strikes10mi30m).toBeNull();
  }
  for (const hour of ["-1", "73", "1.5", "invalid"])
    expect((await request.get(`/api/risk/atlas?hour=${hour}`)).status()).toBe(400);
});


test("selected-site forecast returns one site and rejects unknown sites", async ({ request }) => {
  const snapshot: Snapshot = await (await request.get("/api/snapshot")).json();
  for (const hour of [0, 24, 72]) {
    const response = await request.get(`/api/risk/atlas?hour=${hour}&siteId=${snapshot.sites[0].id}`);
    expect(response.status()).toBe(200);
    const frame = await response.json();
    expect(frame.hour).toBe(hour);
    expect(frame.sites).toHaveLength(1);
    expect(frame.sites[0].site.id).toBe(snapshot.sites[0].id);
    expect(siteObservationV1Schema.safeParse(frame.sites[0].snapshot.observation).success).toBeTruthy();
  }
  expect((await request.get("/api/risk/atlas?hour=24&siteId=nonexistent")).status()).toBe(404);
});
