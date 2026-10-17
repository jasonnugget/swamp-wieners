import type { Site, Strike } from "../../shared/types";
import { evidence, mapConcurrent, MINUTE } from "../integrations/provider";
import type { Store } from "../store";
import { EnvironmentalProviders, PROVIDER_INTERVALS, type ProviderName, type StoredProviderRecord } from "./providers";

export class ProviderPoller {
  private pending = new Map<string, Promise<void>>();
  constructor(private store: Store, private sites: Site[], private providers: EnvironmentalProviders, private changed: () => void, private clock = Date.now) {}
  refresh(site: Site, provider: ProviderName, force = false): Promise<void> {
    const key = `${site.id}:${provider}`, running = this.pending.get(key); if (running) return running;
    const last = this.store.get<{ checkedAt: string; ok: boolean }>("feed", `${key}:provider`);
    if (!force && last && this.clock() - Date.parse(last.checkedAt) < (last.ok ? PROVIDER_INTERVALS[provider] : 5 * MINUTE)) return Promise.resolve();
    const job = (async () => {
      let record: StoredProviderRecord;
      try { record = await this.providers.collect(site, provider); }
      catch { record = { siteId: site.id, provider, evidence: evidence<never>(provider, null, this.clock(), 5 * MINUTE, { status: "error", error: "Provider unavailable or malformed response" }) } as StoredProviderRecord; }
      this.store.put("environment-provider", key, record);
      const checkedAt = new Date(this.clock()).toISOString();
      this.store.put("feed", `${key}:provider`, { id: `${key}:provider`, checkedAt: record.evidence.status === "ok" ? record.evidence.fetchedAt : checkedAt, ok: record.evidence.status === "ok", message: record.evidence.error ?? `${record.evidence.source} evidence loaded` });
      if (record.provider === "nws") {
        const successful = record.evidence.status === "ok" && record.evidence.data !== null;
        this.store.put("feed", `${site.id}:nws`, { id: `${site.id}:nws`, checkedAt: successful ? record.evidence.fetchedAt : checkedAt, ok: successful, message: record.evidence.error ?? "Official alert check completed" });
        if (successful) {
          this.store.db.prepare("DELETE FROM records WHERE kind='alert' AND json_extract(value, '$.siteId')=? AND json_extract(value, '$.mode')='live'").run(site.id);
          for (const alert of record.evidence.data!) this.store.put("alert", alert.id, alert);
        }
      }
      if (record.provider === "lightning" && record.evidence.mode === "LIVE" && record.evidence.status === "ok")
        for (const strike of record.evidence.data?.strikes ?? [])
          if (strike.mode === "live" && Date.parse(strike.time) <= this.clock()) this.store.insert("strike", strike.id, strike satisfies Strike);
      this.changed();
    })();
    this.pending.set(key, job);
    void job.finally(() => this.pending.delete(key)).catch(() => {});
    return job;
  }
  async refreshSite(site: Site) {
    await mapConcurrent(Object.keys(PROVIDER_INTERVALS) as ProviderName[], 3, provider => this.refresh(site, provider, true));
  }
  poll() {
    // Each origin has two in-flight site jobs; the HTTP layer additionally paces origins.
    for (const provider of Object.keys(PROVIDER_INTERVALS) as ProviderName[]) {
      if (provider === "lightning" && !["recorded", "demo"].includes(process.env.LIGHTNING_MODE ?? "")) continue;
      const active = [...this.pending.keys()].filter(k => k.endsWith(`:${provider}`)).length;
      const checked = (site: Site) => Date.parse(this.store.get<{ checkedAt: string }>("feed", `${site.id}:${provider}:provider`)?.checkedAt ?? "1970-01-01");
      const due = this.sites.filter(site => {
        if (this.pending.has(`${site.id}:${provider}`)) return false;
        const last = this.store.get<{ ok: boolean }>("feed", `${site.id}:${provider}:provider`);
        return this.clock() - checked(site) >= (last?.ok ? PROVIDER_INTERVALS[provider] : 5 * MINUTE);
      }).sort((a, b) => checked(a) - checked(b));
      for (const site of due.slice(0, Math.max(0, 2 - active))) void this.refresh(site, provider).catch(() => {});
    }
  }
}
