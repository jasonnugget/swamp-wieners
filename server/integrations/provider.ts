import type { ProviderEvidence, ProviderMetadata } from "../../shared/providers";
import type { Site } from "../../shared/types";

export const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
export interface CacheStore {
  get<T>(kind: string, id: string): T | undefined;
  put(kind: string, id: string, value: unknown): void;
}
export class ProviderCache {
  private jobs = new Map<string, Promise<unknown>>();
  private memory = new Map<string, { at: number; value: unknown }>();
  constructor(private store?: CacheStore, private clock = Date.now) {}
  async get<T>(key: string, ttl: number | ((value: T) => number), loader: () => Promise<T>): Promise<T> {
    const previous = this.store?.get<{ at: number; value: T }>("provider-cache", key) ?? this.memory.get(key);
    if (previous && this.clock() >= previous.at && this.clock() - previous.at < (typeof ttl === "function" ? ttl(previous.value as T) : ttl)) return previous.value as T;
    const pending = this.jobs.get(key); if (pending) return pending as Promise<T>;
    const job = (async () => {
      const value = await loader(), record = { at: this.clock(), value };
      if (this.store) this.store.put("provider-cache", key, record);
      else { this.memory.set(key, record); while (this.memory.size > 1000) this.memory.delete(this.memory.keys().next().value!); }
      return value;
    })();
    this.jobs.set(key, job);
    try { return await job; } finally { this.jobs.delete(key); }
  }
}

// One queue per origin provides a shared pace/cooldown across all site requests.
// Credentials are headers or URL path segments; errors never echo request URLs.
export class ProviderHttp {
  private queues = new Map<string, Promise<void>>();
  private next = new Map<string, number>();
  private cooldown = new Map<string, number>();
  constructor(private transport: typeof fetch = fetch, private clock = Date.now, private spacingMs = 1100) {}
  async text(source: string, url: string, headers: Record<string, string> = {}): Promise<string> {
    const host = new URL(url).origin, prior = this.queues.get(host) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const tail = prior.catch(() => {}).then(() => gate); this.queues.set(host, tail);
    await prior.catch(() => {});
    try {
      if (this.clock() < (this.cooldown.get(host) ?? 0)) throw new Error(`${source} rate-limit/backoff active`);
      const delay = (this.next.get(host) ?? 0) - this.clock();
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      this.next.set(host, this.clock() + this.spacingMs);
      let response: Response;
      try { response = await this.transport(url, { headers: { "User-Agent": "PlanIT-Control/0.1 (field-safety prototype)", ...headers }, signal: AbortSignal.timeout(15000) }); }
      catch { this.cooldown.set(host, this.clock() + MINUTE); throw new Error(`${source} request failed or timed out`); }
      if (!response.ok) {
        const retry = response.headers.get("Retry-After"), seconds = retry === null ? NaN : Number(retry);
        const retryMs = Number.isFinite(seconds) ? seconds * 1000 : retry ? Date.parse(retry) - this.clock() : NaN;
        if (response.status === 429 || response.status >= 500) this.cooldown.set(host, this.clock() + Math.max(MINUTE, Number.isFinite(retryMs) ? Math.min(DAY, retryMs) : response.status === 429 ? HOUR : 5 * MINUTE));
        throw new Error(`${source} HTTP ${response.status}`);
      }
      if (response.headers.get("X-RateLimit-Remaining") === "0") this.cooldown.set(host, this.clock() + HOUR);
      const body = await response.text();
      if (body.length > 8_000_000) throw new Error(`${source} response exceeds bounded payload limit`);
      return body;
    } finally { release(); if (this.queues.get(host) === tail) this.queues.delete(host); }
  }
  async json(source: string, url: string, headers: Record<string, string> = {}): Promise<unknown> {
    try { return JSON.parse(await this.text(source, url, headers)); }
    catch (error) { if (error instanceof SyntaxError) throw new Error(`${source} malformed JSON response`); throw error; }
  }
}
export function evidence<T>(source: string, data: T | null, now: number, ttl: number, options: Partial<Omit<ProviderMetadata, "fetchedAt" | "validUntil">> & { fetchedAt?: string; validUntil?: string } = {}): ProviderEvidence<T> {
  return { source, data, status: data === null ? "unavailable" : "ok", mode: "LIVE", fetchedAt: new Date(now).toISOString(),
    observedAt: null, validUntil: new Date(now + ttl).toISOString(), confidence: data === null ? 0 : 0.6, error: null, details: {}, ...options };
}
export function unavailable<T>(source: string, now: number, ttl: number, error: string, mode: ProviderMetadata["mode"] = "LIVE"): ProviderEvidence<T> {
  return evidence<T>(source, null, now, ttl, { error, mode });
}
export async function safely<T>(source: string, now: number, ttl: number, work: () => Promise<ProviderEvidence<T>>): Promise<ProviderEvidence<T>> {
  try { return await work(); } catch (error) {
    return evidence<T>(source, null, now, ttl, { status: "error", error: error instanceof Error ? error.message : `${source} failure` });
  }
}
export function tile(site: Site, degrees: number, radiusMiles: number) {
  const west = Math.floor(site.longitude / degrees) * degrees, south = Math.floor(site.latitude / degrees) * degrees;
  const latPadding = radiusMiles / 69, lonPadding = latPadding / Math.max(0.2, Math.cos(Math.min(89, Math.max(Math.abs(south), Math.abs(south + degrees))) * Math.PI / 180));
  return { key: `${west},${south}`, bbox: [Math.max(-180, west - lonPadding), Math.max(-90, south - latPadding), Math.min(180, west + degrees + lonPadding), Math.min(90, south + degrees + latPadding)] };
}
export async function mapConcurrent<T, R>(items: T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length); let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) { const i = index++; output[i] = await work(items[i]); }
  }));
  return output;
}
