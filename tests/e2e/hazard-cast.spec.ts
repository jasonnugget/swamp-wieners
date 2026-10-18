import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/demo/reset", { data: {} });
});

// Replay moves the shared demo clock; restore it so later specs start from the bundled scenario.
test.afterEach(async ({ request }) => {
  await request.post("/api/demo/reset", { data: {} });
});

test("learned hazard forecasts appear as historical evidence only for trained plants", async ({ request }) => {
  const snapshot = await (await request.get("/api/snapshot")).json();
  expect(snapshot.hazardForecasts["621"].mode).toBe("historical");
  // Catalog plants outside the trained cohort have no learned forecast.
  const catalog = snapshot.sites.find((s: { catalogOnly?: boolean }) => s.catalogOnly);
  expect(snapshot.hazardForecasts[catalog.id]).toBeUndefined();
});

test("replay rejects unknown events and keeps the clock in demo mode", async ({ request }) => {
  expect((await request.post("/api/demo/replay", { data: { event: 99 } })).status()).toBe(400);
  const replay = await (await request.post("/api/demo/replay", { data: { event: 0 } })).json();
  expect(replay.clockMode).toBe("demo");
  const briefing = replay.briefings.find((b: { text: string }) => /FloodCast/.test(b.text));
  expect(briefing.decision.policyVersion).toBe("continuous-policy-5");
});
