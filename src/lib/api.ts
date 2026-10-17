import type { Snapshot } from "../../shared/types";
const CACHE = "planit-snapshot-v1";
const CACHE_FORMAT = 2;
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
// The key predates canonical risk. Reject legacy/partial records before React
// reads fields that did not exist in the old workspace contract.
function compatibleSnapshot(value: unknown): value is Snapshot {
  if (!record(value) || !["sites", "teams", "reports", "strikes", "alerts", "briefings"].every(key => Array.isArray(value[key])) ||
    !["forecasts", "decisions", "siteRisks", "feedStatus"].every(key => record(value[key])) || !value.sites.length) return false;
  return value.sites.every((site: unknown) => {
    if (!record(site) || typeof site.id !== "string") return false;
    const decision = value.decisions[site.id], risk = value.siteRisks[site.id];
    return record(decision) && Array.isArray(decision.tasks) && Array.isArray(decision.channels) &&
      record(risk) && risk.version === 1 && risk.siteId === site.id && typeof risk.scoringVersion === "string" &&
      (risk.risk === null || typeof risk.risk === "number") && typeof risk.confidence === "number" &&
      record(risk.explanation) && Array.isArray(risk.explanation.compounding) &&
      Array.isArray(risk.channels) && risk.channels.length === 7 && risk.channels.every((channel: unknown) =>
        record(channel) && Array.isArray(channel.evidence) && Array.isArray(channel.factors)) &&
      Array.isArray(risk.tasks) && Array.isArray(risk.activeOverrides) &&
      record(risk.observation) && risk.observation.version === 1 && record(risk.observation.coverage) &&
      record(risk.observation.weather) && record(risk.observation.lightning) && record(risk.observation.provenance);
  });
}
export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(error.error ?? "Request failed");
  }
  return response.json();
}
export async function loadSnapshot(): Promise<{
  snapshot: Snapshot;
  offline: boolean;
}> {
  try {
    const snapshot = await request<Snapshot>("/snapshot");
    // Browser quota/privacy failures must not discard a successful API read.
    try { localStorage.setItem(CACHE, JSON.stringify({ format: CACHE_FORMAT, snapshot })); } catch { /* Live state remains usable without persistence. */ }
    return { snapshot, offline: false };
  } catch (e) {
    const stored = readCachedSnapshot();
    if (stored) return { snapshot: stored, offline: true };
    throw e;
  }
}
export function readCachedSnapshot(): Snapshot | null {
  try {
    const cached: unknown = JSON.parse(localStorage.getItem(CACHE) ?? "null");
    const snapshot = record(cached) && "format" in cached
      ? cached.format === CACHE_FORMAT ? cached.snapshot : null
      : cached;
    return compatibleSnapshot(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}
export async function cacheAssets() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  await navigator.serviceWorker.register("/sw.js");
}
