import { test, expect } from "@playwright/test";

test("provider notification bursts keep one snapshot read in flight and retain the follow-up update", async ({ page, request }) => {
  const snapshot = await (await request.get("/api/snapshot")).json();
  const latest = new Date(Date.parse(snapshot.now) + 60000).toISOString();
  let releaseFirst!: () => void, releaseSecond!: () => void;
  const first = new Promise<void>(resolve => { releaseFirst = resolve; });
  const second = new Promise<void>(resolve => { releaseSecond = resolve; });
  let reads = 0, active = 0, maxActive = 0;
  await page.addInitScript(() => {
    const sources = new Set<{ onmessage: ((event: MessageEvent) => void) | null }>();
    Object.defineProperty(window, "EventSource", { value: class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { sources.add(this); }
      close() { sources.delete(this); }
    } });
    Object.defineProperty(window, "emitWorkspaceBurst", { value: () => { for (let i = 0; i < 100; i++) for (const source of sources) source.onmessage?.(new MessageEvent("message", { data: "{}" })); } });
  });
  await page.route("**/api/snapshot", async route => {
    const number = ++reads; active++; maxActive = Math.max(maxActive, active);
    if (number === 1) await first;
    if (number === 2) await second;
    active--;
    await route.fulfill({ json: { ...snapshot, now: number === 1 ? snapshot.now : latest } });
  });
  try {
    await page.goto("/");
    await expect.poll(() => reads).toBe(1);
    await page.evaluate(() => (window as typeof window & { emitWorkspaceBurst(): void }).emitWorkspaceBurst());
    await page.waitForTimeout(150);
    expect(reads).toBe(1);
    releaseFirst();
    await expect.poll(() => reads).toBe(2);
    expect(maxActive).toBe(1);
    releaseSecond();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("planit-snapshot-v1") ?? "null")?.snapshot?.now)).toBe(latest);
    expect(maxActive).toBe(1);
  } finally { releaseFirst(); releaseSecond(); }
});
