import { test } from "node:test";
import assert from "node:assert/strict";
import { coalescedRefresh } from "../../src/lib/coalesced-refresh";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}
test("provider bursts share a follow-up read and never overlap workspace requests", async () => {
  const gates = [deferred(), deferred(), deferred()];
  let runs = 0, active = 0, maxActive = 0;
  const refresh = coalescedRefresh(async () => {
    const i = runs++; active++; maxActive = Math.max(maxActive, active);
    try { await gates[i].promise; } finally { active--; }
  });
  const first = refresh(); await Promise.resolve();
  const burst = Array.from({ length: 100 }, () => refresh());
  assert.equal(runs, 1); assert.ok(burst.every(p => p === burst[0]));
  gates[0].resolve(); await first; await Promise.resolve();
  assert.equal(runs, 2); assert.equal(maxActive, 1);
  const newer = refresh(); let newerReady = false;
  void newer.then(() => { newerReady = true; });
  gates[1].resolve(); await Promise.all(burst); await Promise.resolve();
  assert.equal(runs, 3); assert.equal(newerReady, false);
  gates[2].resolve(); await newer;
  assert.equal(maxActive, 1); assert.equal(newerReady, true);
});
test("a failed read releases the queue and queued/later callers still refresh", async () => {
  const gate = deferred(); let runs = 0;
  const refresh = coalescedRefresh(async () => { if (++runs === 1) { await gate.promise; throw new Error("Source failed"); } });
  const first = refresh(), next = refresh();
  const failure = assert.rejects(first, /Source failed/);
  gate.resolve(); await failure; await next;
  assert.equal(runs, 2);
  await refresh(); assert.equal(runs, 3);
});
