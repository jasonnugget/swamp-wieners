import type { Site, Strike, Alert } from "../../shared/types";
import type { ProviderEvidence, ProviderMetadata } from "../../shared/providers";
import type { SiteObservationV1 } from "../../shared/risk";
import { providerMetadataSchema } from "../../shared/providers";
import { ProviderCache, ProviderHttp, MINUTE, HOUR, DAY, evidence, unavailable } from "../integrations/provider";
import { UsgsWaterProvider, type FloodProvider, type FloodObservation } from "../integrations/usgs-water";
import { FirmsProvider, type FireProvider, type FireObservation } from "../integrations/firms";
import { FemaFloodplainProvider, type FloodplainProvider } from "../integrations/floodplain";
import { InaturalistProvider, type WildlifeProvider, type WildlifeObservation } from "../integrations/wildlife";
import { RecordedLightningProvider, UnavailableLightningProvider, type LightningProvider, type LightningObservation } from "../integrations/lightning";
import { nwsAlertProvider, type OfficialAlertProvider } from "../integrations/nws";
import type { Store } from "../store";
import { distanceMiles } from "../../shared/policy";
import { updateCoverage } from "./normalize";

export interface ProviderData {
  usgs: FloodObservation; firms: FireObservation; floodplain: { floodplain: boolean | null };
  wildlife: WildlifeObservation; lightning: LightningObservation; nws: Alert[];
}
export type ProviderName = keyof ProviderData;
export type StoredProviderRecord = { [K in ProviderName]: { siteId: string; provider: K; evidence: ProviderEvidence<ProviderData[K]> } }[ProviderName];
export const PROVIDER_INTERVALS: Record<ProviderName, number> = { usgs: 30 * MINUTE, firms: HOUR, floodplain: 30 * DAY, wildlife: 6 * HOUR, lightning: MINUTE, nws: 5 * MINUTE };
export class EnvironmentalProviders {
  constructor(public flood: FloodProvider, public fire: FireProvider, public floodplain: FloodplainProvider,
    public wildlife: WildlifeProvider, public lightning: LightningProvider, public nws: OfficialAlertProvider, private lightningClock = Date.now) {}
  async collect(site: Site, provider: ProviderName): Promise<StoredProviderRecord> {
    switch (provider) {
      case "usgs": return { siteId: site.id, provider, evidence: await this.flood.getFloodEvidence(site) };
      case "firms": return { siteId: site.id, provider, evidence: await this.fire.getFireEvidence(site) };
      case "floodplain": return { siteId: site.id, provider, evidence: await this.floodplain.getFloodplainEvidence(site) };
      case "wildlife": return { siteId: site.id, provider, evidence: await this.wildlife.getWildlifeEvidence(site) };
      case "nws": return { siteId: site.id, provider, evidence: await this.nws.getAlerts(site) };
      case "lightning": return { siteId: site.id, provider, evidence: await this.lightning.nearbyStrikes(site, 100, new Date(this.lightningClock() - 30 * MINUTE)) };
    }
  }
}
export function createProviders(store: Store, demoClock: () => number): EnvironmentalProviders {
  const cache = new ProviderCache(store), http = new ProviderHttp();
  const mode = process.env.LIGHTNING_MODE ?? "unavailable";
  return new EnvironmentalProviders(new UsgsWaterProvider(cache, http, process.env.USGS_API_KEY), new FirmsProvider(cache, http, process.env.FIRMS_MAP_KEY),
    new FemaFloodplainProvider(cache, http, process.env.FLOOD_EXPOSURE_FILE, process.env.FEMA_ENABLED !== "0"), new InaturalistProvider(cache, http),
    mode === "recorded" ? new RecordedLightningProvider(() => store.all<Strike>("strike"), "LIVE") : mode === "demo" ? new RecordedLightningProvider(() => store.all<Strike>("strike"), "DEMO", demoClock) : new UnavailableLightningProvider(), nwsAlertProvider, mode === "demo" ? demoClock : Date.now);
}
function active(record: StoredProviderRecord, now: number): boolean {
  return record.evidence.status === "ok" && record.evidence.data !== null && record.evidence.mode !== "DEMO" && Date.parse(record.evidence.fetchedAt) <= now && Date.parse(record.evidence.validUntil) > now;
}
export function applyProviderEvidence(o: SiteObservationV1, site: Site, records: StoredProviderRecord[], now: number): void {
  for (const provider of Object.keys(PROVIDER_INTERVALS) as ProviderName[])
    o.provenance.providers[provider] = { source: provider, status: "unavailable", mode: provider === "floodplain" ? "STATIC" : "LIVE", fetchedAt: null, observedAt: null,
      validUntil: null, confidence: 0, error: provider === "lightning" ? "No live detector evidence available" : "Provider evidence not yet collected", details: {} };
  for (const record of records.filter(r => r.siteId === site.id)) {
    const meta = providerMetadataSchema.parse(record.evidence), usable = active(record, now);
    o.provenance.providers[record.provider] = { ...meta, ...(meta.status === "ok" && !usable && meta.mode !== "DEMO" ? { status: "unavailable" as const, confidence: 0, error: "Provider evidence expired" } : {}) };
    if (!usable || meta.fetchedAt === null || meta.validUntil === null) continue;
    const set = (group: "flood" | "wildfire" | "lightning" | "wildlife", key: string, value: number | string | boolean | null) => {
      if (value === null) return;
      (o[group] as unknown as Record<string, unknown>)[key] = value;
      const path = `${group}.${key}`;
      o.provenance.fieldSources[path] = `${meta.source}; observed ${meta.observedAt ?? "unknown"}; fetched ${meta.fetchedAt}`;
      o.provenance.fieldEvidence[path] = { source: meta.source, observedAt: meta.observedAt, fetchedAt: meta.fetchedAt, mode: meta.mode, confidence: meta.confidence };
    };
    switch (record.provider) {
      case "usgs": {
        if (!record.evidence.data || !meta.observedAt || now - Date.parse(meta.observedAt) >= 2 * HOUR || Date.parse(meta.observedAt) > now) break;
        for (const [key, value] of Object.entries(record.evidence.data)) set("flood", key, value);
        break;
      }
      case "firms": {
        if (!record.evidence.data) break;
        for (const [key, value] of Object.entries(record.evidence.data)) set("wildfire", key, key === "fireAgeMinutes" && meta.observedAt ? (now - Date.parse(meta.observedAt)) / MINUTE : value);
        break;
      }
      case "floodplain": set("flood", "floodplain", record.evidence.data?.floodplain ?? null); break;
      case "wildlife": {
        const sightings = record.evidence.data?.sightings.filter(s => Date.parse(s.observedAt) <= now && now - Date.parse(s.observedAt) < DAY) ?? [];
        if (!sightings.length) break;
        set("wildlife", "dangerousSightings24h", sightings.length);
        set("wildlife", "nearestSightingMiles", Math.min(...sightings.map(s => s.distanceMiles)));
        set("wildlife", "latestSightingAt", new Date(Math.max(...sightings.map(s => Date.parse(s.observedAt)))).toISOString());
        // Taxonomic screening is not a verified incident-severity classification.
        // Keep species relevance in source metadata; crew/event evidence supplies severity floors.
        break;
      }
      case "lightning": {
        const data = record.evidence.data;
        if (!data || meta.mode !== "LIVE") break;
        const strikes = [...new Map(data.strikes.filter(s => s.mode === "live" && Date.parse(s.time) <= now && now - Date.parse(s.time) < 30 * MINUTE).map(s => [s.id, s])).values()];
        if (strikes.length || data.complete) { o.lightning.evidenceMode = "LIVE"; if (data.complete) set("lightning", "strikes10mi30m", strikes.filter(s => distanceMiles(site, s) <= 10).length); }
        break;
      }
      case "nws": break; // Persisted official alerts are enriched independently from continuous variables.
    }
  }
  updateCoverage(o);
}
