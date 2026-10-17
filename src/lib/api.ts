import type { Snapshot } from "../../shared/types";
const CACHE = "planit-snapshot-v1";
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
    localStorage.setItem(CACHE, JSON.stringify(snapshot));
    return { snapshot, offline: false };
  } catch (e) {
    const stored = localStorage.getItem(CACHE);
    if (stored) return { snapshot: JSON.parse(stored), offline: true };
    throw e;
  }
}
export function readCachedSnapshot(): Snapshot | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? "null");
  } catch {
    return null;
  }
}
export async function cacheAssets() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  await navigator.serviceWorker.register("/sw.js");
}
