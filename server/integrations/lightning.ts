import type { Site, Strike } from "../../shared/types";
import type { ProviderEvidence } from "../../shared/providers";
import { distanceMiles } from "../../shared/policy";
import { MINUTE, evidence, unavailable } from "./provider";
export interface LightningObservation { strikes: Strike[]; complete: boolean }
export interface LightningProvider {
  nearbyStrikes(site: Site, radiusMiles: number, since: Date): Promise<ProviderEvidence<LightningObservation>>;
}
export class UnavailableLightningProvider implements LightningProvider {
  constructor(private clock = Date.now) {}
  async nearbyStrikes(): Promise<ProviderEvidence<LightningObservation>> {
    return unavailable("Lightning detector", this.clock(), MINUTE, "No licensed live strike provider configured");
  }
}
// Read recorded events from an adapter/store. DEMO is never promoted to LIVE.
// Completeness stays false unless a future licensed adapter can establish detector health.
export class RecordedLightningProvider implements LightningProvider {
  constructor(private read: () => Strike[], private mode: "LIVE" | "DEMO", private clock = Date.now) {}
  async nearbyStrikes(site: Site, radiusMiles: number, since: Date): Promise<ProviderEvidence<LightningObservation>> {
    const now = this.clock(), mode = this.mode === "LIVE" ? "live" : "simulated";
    const strikes = this.read().filter(s => s.mode === mode && Date.parse(s.time) >= since.getTime() && Date.parse(s.time) <= now && distanceMiles(site, s) <= radiusMiles);
    return evidence(this.mode === "LIVE" ? "Recorded live detector events" : "Demonstration strike replay", { strikes, complete: false }, now, MINUTE, { mode: this.mode,
      observedAt: strikes.length ? new Date(Math.max(...strikes.map(s => Date.parse(s.time)))).toISOString() : null, confidence: strikes.length ? 0.7 : 0,
      details: { radiusMiles, detectorCoverageVerified: false } });
  }
}
