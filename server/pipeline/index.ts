import type { Alert, HazardReport, Site, Strike, WeatherScreening } from "../../shared/types";
import type { WeatherPoint } from "../../shared/weather";
import { siteObservationV1Schema, channelDecisions, applyPolicyLimits, compositeRisk, type SiteRiskSnapshot } from "../../shared/risk";
import { decide, POLICY_VERSION } from "../../shared/policy";
import { normalize } from "./normalize";
import { enrich } from "./enrich";
import { applyProviderEvidence, type StoredProviderRecord } from "./providers";
import { score } from "./score";
import { explainComposite, type ScoringContext } from "../../shared/risk-scoring";
import { RISK_CONFIG } from "../../shared/risk-config";
import { learnedIndex } from "../../shared/hazard-model";

export function siteRisk(site: Site, point: WeatherPoint | undefined, now: number,
  reports: HazardReport[], strikes: Strike[], alerts: Alert[], mlAvailable: boolean,
  screening?: WeatherScreening, alertCheckedAt?: string, collectionError?: string, modelContext?: Pick<ScoringContext, "forecast" | "soilThresholds" | "hazard">, providerRecords: StoredProviderRecord[] = [], sourceNow = now): { snapshot: SiteRiskSnapshot; decision: ReturnType<typeof decide> } {
  // Future frames (now > sourceNow) hold readings that have no hourly forecast at their
  // latest value: provider evidence, strikes, reports and alert checks age from sourceNow.
  const providerStrikes = providerRecords.flatMap(record => record.provider === "lightning" && record.siteId === site.id && record.evidence.mode === "LIVE" && record.evidence.status === "ok" &&
    Date.parse(record.evidence.fetchedAt) <= sourceNow && Date.parse(record.evidence.validUntil) > sourceNow ? record.evidence.data?.strikes.filter(s => s.mode === "live") ?? [] : []);
  const effectiveStrikes = [...new Map([...strikes, ...providerStrikes].map(strike => [strike.id, strike])).values()];
  const observation = normalize(site, point, now, screening, sourceNow);
  if (sourceNow !== now) observation.provenance.mode = "forecast";
  applyProviderEvidence(observation, site, providerRecords, sourceNow);
  // Official alerts carry their own expiry, so the target time still decides whether they apply.
  const unexpired = alerts.filter(a => Date.parse(a.expiresAt) > now);
  const activeOverrides = enrich(observation, site, reports, effectiveStrikes, unexpired, sourceNow, alertCheckedAt);
  if (collectionError) observation.provenance.error = collectionError;
  siteObservationV1Schema.parse(observation);
  const channels = score(observation, { now, sourceNow, reports, alerts, ...modelContext, forecast: mlAvailable ? modelContext?.forecast : undefined, hazard: mlAvailable ? modelContext?.hazard : undefined });
  const policyChannels = applyPolicyLimits(channelDecisions(channels), channels, observation.weather);
  const hazard = mlAvailable ? modelContext?.hazard ?? null : null;
  const decision = decide(site, undefined, reports.filter(r => Date.parse(r.createdAt) <= sourceNow), effectiveStrikes.filter(s => s.mode === "live"), unexpired.filter(a => a.mode === "live"), sourceNow,
    undefined, undefined, sourceNow, 24, policyChannels, hazard);
  const ruleRisk = compositeRisk(channels);
  const risk = learnedIndex(channels.map(c => c.score), hazard) ?? ruleRisk;
  const explanation = explainComposite(channels);
  if (hazard && risk !== null) explanation.learned = { model: `OverallCast ${hazard.modelVersion}`, date: hazard.day.date, probability: hazard.day.overall.probability,
    climatology: hazard.day.overall.climatology, score: hazard.day.overall.score, ruleComposite: ruleRisk, contributions: hazard.day.overall.contributions };
  decision.index = risk;
  decision.unknownCount = channels.filter(c => c.score === null).length;
  return { decision, snapshot: {
    version: 1, siteId: site.id, generatedAt: new Date(now).toISOString(), policyVersion: POLICY_VERSION, scoringVersion: RISK_CONFIG.version, explanation,
    risk, confidence: Math.min(observation.coverage.percent / 100, channels.reduce((sum, c) => sum + c.confidence * (1 + (c.score ?? 0)), 0) / channels.reduce((sum, c) => sum + 1 + (c.score ?? 0), 0)),
    channels, observation, tasks: decision.tasks, activeOverrides,
    // Coverage reports models that were applied, not models that merely exist.
    mlCoverage: { heatCast: channels.some(c => c.factors.some(f => f.key === "heatCast")), groundCast: channels.some(c => c.factors.some(f => f.key === "groundCast")), hazardCast: !!hazard },
  } };
}
