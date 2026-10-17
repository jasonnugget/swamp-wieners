import Constants from "expo-constants";
import type { CrewWorkspace } from "../../../shared/crew";
import type { HazardReport } from "../../../shared/types";

export function normalizeServer(value: string) {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Enter an http:// or https:// server address without credentials or query parameters.");
  return url.toString().replace(/\/+$/, "");
}
export function defaultServer() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    try { return normalizeServer(process.env.EXPO_PUBLIC_API_URL); } catch { /* Show editable local default. */ }
  }
  const host = Constants.expoConfig?.hostUri;
  if (host) {
    try { return `http://${new URL(`http://${host}`).hostname}:3001`; } catch { /* Simulator default. */ }
  }
  return "http://127.0.0.1:3001";
}
export async function api<T>(server: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const forward = () => controller.abort();
  signal?.addEventListener("abort", forward);
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${server}/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `The server returned ${response.status}.`);
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The connection timed out. Your draft is still on this device. Check your connection and retry.");
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", forward); }
}
export async function loadWorkspace(server: string, siteId?: string, signal?: AbortSignal) {
  const data = await api<CrewWorkspace>(server, `/crew/workspace${siteId ? `?siteId=${encodeURIComponent(siteId)}` : ""}`, undefined, signal);
  if (data.version !== 1 || !Array.isArray(data.sites) || !Array.isArray(data.teams) || !Array.isArray(data.reports) || !data.sites.some(s => s.id === data.siteId)) throw new Error("This server does not support the crew app. Start the updated PlanIT API.");
  if (data.conditions && (data.conditions.siteId !== data.siteId || !Array.isArray(data.conditions.channels) || !Array.isArray(data.conditions.activeOverrides) || !Array.isArray(data.conditions.tasks) || !data.conditions.observation?.provenance)) throw new Error("The site hazard response is incomplete. Refresh or update the PlanIT API.");
  return data;
}
export function shareReport(server: string, body: unknown) { return api<HazardReport>(server, "/reports", body); }
export function photoUrl(server: string, path: string) {
  return path.startsWith("/uploads/") ? `${server}${path}` : undefined;
}
