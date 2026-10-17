import type { CrewWorkspace } from "../../../shared/crew";

/** Keep clock-only server ticks from replacing the map and report feed. */
export function reconcileWorkspace(previous: CrewWorkspace | undefined, next: CrewWorkspace): CrewWorkspace {
  if (!previous) return next;
  const sites = JSON.stringify(previous.sites) === JSON.stringify(next.sites) ? previous.sites : next.sites;
  const teams = JSON.stringify(previous.teams) === JSON.stringify(next.teams) ? previous.teams : next.teams;
  const reports = JSON.stringify(previous.reports) === JSON.stringify(next.reports) ? previous.reports : next.reports;
  if (previous.version === next.version && previous.siteId === next.siteId && previous.clockMode === next.clockMode &&
    sites === previous.sites && teams === previous.teams && reports === previous.reports) return previous;
  return { ...next, sites, teams, reports };
}

export type RefreshReason = "initial" | "manual" | "background";
export interface RefreshStatus { loading: boolean; refreshing: boolean }

/** One request at a time; a burst of invalidations needs at most one follow-up. */
export function createWorkspaceSync<T>({ load, onData, onError, onStatus }: {
  load(): Promise<T>;
  onData(value: T): void;
  onError(error: unknown): void;
  onStatus(status: RefreshStatus): void;
}) {
  let disposed = false, queued = false;
  let pending: Promise<void> | undefined;
  let status: RefreshStatus = { loading: false, refreshing: false };
  function setStatus(next: RefreshStatus) {
    if (status.loading !== next.loading || status.refreshing !== next.refreshing) { status = next; onStatus(next); }
  }
  function refresh(reason: RefreshReason = "background"): Promise<void> {
    if (disposed) return Promise.resolve();
    if (reason !== "background") setStatus({ loading: true, refreshing: reason === "manual" || status.refreshing });
    if (pending) { queued = true; return pending; }
    const run = async () => {
      do {
        queued = false;
        try { const value = await load(); if (!disposed) onData(value); }
        catch (error) { if (!disposed) onError(error); }
      } while (!disposed && queued);
    };
    pending = run().finally(() => {
      pending = undefined;
      if (!disposed) setStatus({ loading: false, refreshing: false });
    });
    return pending;
  }
  return { refresh, dispose() { disposed = true; queued = false; } };
}
