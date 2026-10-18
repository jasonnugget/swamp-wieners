import { z } from "zod";
import { providerMetadataSchema, fieldEvidenceSchema } from "./providers";
import { RISK_CONFIG } from "./risk-config";
import type { Category, Decision, HazardChannel, HazardKey, Task } from "./types";

const number = z.number().finite().nullable();
const positive = z.number().finite().nonnegative().nullable();
const fraction = z.number().finite().min(0).max(1).nullable();
const timestamp = z.string().datetime();
export const siteObservationV1Schema = z.object({
  version: z.literal(1), siteId: z.string(), validAt: timestamp.nullable(), fetchedAt: timestamp.nullable(),
  weather: z.object({
    temperatureF: number, humidityPct: z.number().min(0).max(100).nullable(), heatIndexF: number,
    apparentTemperatureF: number, windMph: positive, gustMph: positive,
    precipitation1hMm: positive, precipitation24hMm: positive, precipitation7dMm: positive,
    weatherCode: positive, cape: positive,
  }),
  soil: z.object({ moistureSurface: fraction, moistureRoot: fraction, historicalPercentile: fraction }),
  lightning: z.object({ nearestStrikeMiles: positive, latestStrikeAt: timestamp.nullable(), evidenceMode: z.enum(["LIVE", "DEMO", "FORECAST", "UNAVAILABLE"]).default("UNAVAILABLE"), strikes10mi30m: positive, forecastPotential: fraction }),
  flood: z.object({ nearestGaugeMiles: positive, stage: number, stagePercentile: fraction, stageTrend: number, floodAlert: z.boolean().nullable(), floodplain: z.boolean().nullable() }),
  wildfire: z.object({ nearestFireMiles: positive, fireAgeMinutes: positive, firePower: positive, redFlagAlert: z.boolean().nullable() }),
  wildlife: z.object({ dangerousSightings24h: positive, nearestSightingMiles: positive, crewReports24h: z.number().int().nonnegative(), latestSightingAt: timestamp.nullable().default(null), severity: z.enum(["INFORMATIONAL", "LOW", "MODERATE", "ELEVATED", "HIGH", "CRITICAL"]).nullable().default(null) }),
  coverage: z.object({ available: z.number().int().nonnegative(), expected: z.number().int().positive(), percent: z.number().min(0).max(100) }),
  provenance: z.object({
    mode: z.enum(["live", "forecast"]), source: z.string(), stale: z.boolean(), error: z.string().nullable(),
    fieldSources: z.record(z.string()),
    fieldEvidence: z.record(fieldEvidenceSchema).default({}),
    providers: z.record(providerMetadataSchema).default({}),
  }),
});
export type SiteObservationV1 = z.infer<typeof siteObservationV1Schema>;
export interface RiskFactor {
  key: string;
  score: number | null;
  weight: number;
  confidence: number;
  source: string;
  kind: "environment" | "forecast" | "official-alert" | "crew";
  mode: import("./types").DataMode | "crew";
  value: number | string | boolean | null;
  validFrom?: string;
  validTo?: string;
}
export interface RiskExplanation {
  formula: string;
  primary: { hazard: Category; score: number } | null;
  compounding: { hazard: Category; score: number; strength: number }[];
  secondaryStrength: number;
  uplift: number;
  // Present when OverallCast supplied the site index; the rule formula above is then the fallback.
  learned?: { model: string; date: string; probability: number; climatology: number; score: number; ruleComposite: number | null; contributions: Record<HazardKey, number> };
}
export interface HazardScore {
  hazard: Category;
  score: number | null;
  environmentScore?: number | null; // before crew evidence; drives the extreme-score hold guardrail
  confidence: number; // 0–1 completeness of channel inputs, not statistical probability
  evidence: string[];
  factors: RiskFactor[];
}
export interface SafetyOverride {
  id: string;
  hazard: Category;
  source: "crew" | "lightning" | "official-alert";
  state: "HOLD" | "RESTRICTED";
  tasks: Task[];
  reason: string;
  expiresAt: string | null;
}
export interface SiteRiskSnapshot {
  version: 1;
  siteId: string;
  generatedAt: string;
  policyVersion: string;
  scoringVersion: string;
  explanation: RiskExplanation;
  risk: number | null;
  confidence: number;
  channels: HazardScore[];
  observation: SiteObservationV1;
  tasks: Decision["tasks"];
  activeOverrides: SafetyOverride[];
  mlCoverage: { heatCast: boolean; groundCast: boolean; hazardCast: boolean };
}

export { calculateCompositeRisk as compositeRisk } from "./risk-scoring";
// Crew severity is excluded from the hold guardrail: crew holds apply only to the tasks the crew selected.
export function channelDecisions(scores: HazardScore[]): HazardChannel[] {
  return scores.map(c => {
    const environment = c.environmentScore === undefined ? c.score : c.environmentScore;
    const extreme = environment !== null && environment >= RISK_CONFIG.policy.holdScore;
    return {
      category: c.hazard, severity: c.score,
      status: c.score === null ? "UNKNOWN" : extreme ? "HOLD" : c.score >= RISK_CONFIG.policy.restrictScore ? "RESTRICTED" : "AVAILABLE",
      title: c.score === null ? "Coverage unavailable" : extreme ? `${c.score.toFixed(1)}/10 extreme screen · hold` : `${c.score.toFixed(1)}/10 environmental screen`,
      detail: c.evidence.join(" "), mode: "live", source: "Normalized site environment v1",
    };
  });
}
