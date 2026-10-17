import { test } from "node:test";
import assert from "node:assert/strict";
import type { CrewWorkspace } from "../../shared/crew";
import { createWorkspaceSync, reconcileWorkspace, type RefreshStatus } from "../../mobile/src/lib/workspace-sync";

const workspace: CrewWorkspace = {
  version: 1, siteId: "621", now: "2026-10-17T12:00:00Z", clockMode: "real",
  sites: [{ id: "621", name: "Turkey Point", state: "FL", county: "Miami-Dade", utility: "FPL", latitude: 25.43, longitude: -80.33, timezone: "America/New_York", capacityMw: 100, source: "EIA", sourceDate: "2026", heldOut: false, riverScreening: false }],
  teams: [{ id: "crew", name: "Access crew", members: ["Alex"], siteIds: ["621"] }],
  reports: [{ id: "hazard", siteId: "621", category: "soil", description: "Access road blocked", tasks: ["mobilization"], latitude: 25.431, longitude: -80.331, photoUrl: "/uploads/photo.jpg", author: "Alex", status: "open", createdAt: "2026-10-17T11:00:00Z" }],
};
const copy = () => structuredClone(workspace);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test("clock ticks retain the workspace, site and report identities used by native maps", () => {
  const tick = { ...copy(), now: "2026-10-17T12:00:30Z" };
  assert.equal(reconcileWorkspace(undefined, tick), tick);
  assert.equal(reconcileWorkspace(workspace, tick), workspace);
  const mode = reconcileWorkspace(workspace, { ...tick, clockMode: "demo" });
  assert.equal(mode.clockMode, "demo");
  assert.equal(mode.sites, workspace.sites);
  assert.equal(mode.reports, workspace.reports);
  assert.notEqual(mode, workspace);
});

test("new hazards, resolutions, roster changes and site changes remain visible", () => {
  const next = copy();
  next.reports[0] = { ...next.reports[0], status: "resolved", resolvedBy: "Reviewer", resolution: "Access restored" };
  const resolved = reconcileWorkspace(workspace, next);
  assert.equal(resolved.reports[0].status, "resolved");
  assert.equal(resolved.reports[0].photoUrl, workspace.reports[0].photoUrl);
  assert.equal(resolved.reports[0].latitude, workspace.reports[0].latitude);
  assert.equal(resolved.sites, workspace.sites);
  assert.equal(resolved.teams, workspace.teams);
  const added = copy(); added.reports.push({ ...added.reports[0], id: "second" });
  assert.equal(reconcileWorkspace(workspace, added).reports.length, 2);
  const team = copy(); team.teams[0].members.push("Sam");
  assert.deepEqual(reconcileWorkspace(workspace, team).teams[0].members, ["Alex", "Sam"]);
  const site = copy(); site.sites[0].name = "Updated plant name";
  assert.equal(reconcileWorkspace(workspace, site).sites[0].name, "Updated plant name");
  const elsewhere = { ...copy(), siteId: "627", reports: [] };
  assert.equal(reconcileWorkspace(workspace, elsewhere).siteId, "627");
  assert.equal(reconcileWorkspace(workspace, elsewhere).reports.length, 0);
});

test("background invalidations stay silent and coalesce while a request is in flight", async () => {
  const first = deferred<number>(), second = deferred<number>();
  const statuses: RefreshStatus[] = [], data: number[] = [];
  let requests = 0;
  const sync = createWorkspaceSync({ load: () => ++requests === 1 ? first.promise : second.promise, onData: value => data.push(value), onError: assert.fail, onStatus: value => statuses.push(value) });
  const pending = sync.refresh();
  void sync.refresh(); void sync.refresh(); void sync.refresh();
  assert.equal(requests, 1);
  assert.deepEqual(statuses, []);
  first.resolve(1); await Promise.resolve();
  assert.equal(requests, 2);
  second.resolve(2); await pending;
  assert.deepEqual(data, [1, 2]);
  assert.deepEqual(statuses, []);
});

test("only a manual refresh activates pull-to-refresh, including during background work", async () => {
  const first = deferred<number>(), second = deferred<number>();
  const statuses: RefreshStatus[] = [];
  let requests = 0;
  const sync = createWorkspaceSync({ load: () => ++requests === 1 ? first.promise : second.promise, onData: () => {}, onError: assert.fail, onStatus: value => statuses.push(value) });
  const pending = sync.refresh();
  void sync.refresh("manual");
  assert.deepEqual(statuses, [{ loading: true, refreshing: true }]);
  first.resolve(1); await Promise.resolve();
  assert.equal(requests, 2);
  assert.equal(statuses.length, 1);
  second.resolve(2); await pending;
  assert.deepEqual(statuses, [{ loading: true, refreshing: true }, { loading: false, refreshing: false }]);
  const initial: RefreshStatus[] = [];
  await createWorkspaceSync({ load: async () => 1, onData: () => {}, onError: assert.fail, onStatus: value => initial.push(value) }).refresh("initial");
  assert.deepEqual(initial, [{ loading: true, refreshing: false }, { loading: false, refreshing: false }]);
});

test("failed background reads report stale data and remain retryable without a spinner", async () => {
  const errors: unknown[] = [], data: number[] = [], statuses: RefreshStatus[] = [];
  let requests = 0;
  const sync = createWorkspaceSync({ load: async () => { if (++requests === 1) throw new Error("Offline"); return 2; }, onData: value => data.push(value), onError: error => errors.push(error), onStatus: value => statuses.push(value) });
  await sync.refresh(); await sync.refresh();
  assert.equal(errors.length, 1);
  assert.deepEqual(data, [2]);
  assert.deepEqual(statuses, []);
});

test("leaving a site or backgrounding cannot apply a late response or run a queued read", async () => {
  const first = deferred<number>(), data: number[] = [], errors: unknown[] = [], statuses: RefreshStatus[] = [];
  let requests = 0;
  const sync = createWorkspaceSync({ load: () => { requests++; return first.promise; }, onData: value => data.push(value), onError: error => errors.push(error), onStatus: value => statuses.push(value) });
  const pending = sync.refresh("manual"); void sync.refresh();
  sync.dispose(); first.resolve(1); await pending; await sync.refresh("manual");
  assert.equal(requests, 1);
  assert.deepEqual(data, []); assert.deepEqual(errors, []);
  assert.deepEqual(statuses, [{ loading: true, refreshing: true }]);
});
