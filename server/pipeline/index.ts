import type { Alert, HazardReport, Site, Strike, WeatherScreening } from "../../shared/types";
import type { WeatherPoint } from "../../shared/weather";
import { siteObservationV1Schema, channelDecisions, compositeRisk, type SiteRiskSnapshot } from "../../shared/risk";
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
  const providerStrikes = providerRecords.flatMap(record => record.provider === "lightning" && record.siteId === site.id && record.evidence.mode === "LIVE" && record.evidence.status === "ok" &&
    Date.parse(record.evidence.fetchedAt) <= now && Date.parse(record.evidence.validUntil) > now ? record.evidence.data?.strikes.filter(s => s.mode === "live") ?? [] : []);
  const effectiveStrikes = [...new Map([...strikes, ...providerStrikes].map(strike => [strike.id, strike])).values()];
  const observation = normalize(site, point, now, screening, sourceNow);
  if (sourceNow !== now) observation.provenance.mode = "forecast";
  applyProviderEvidence(observation, site, providerRecords, now);
  const activeOverrides = enrich(observation, site, reports, effectiveStrikes, alerts, now, alertCheckedAt);
  if (collectionError) observation.provenance.error = collectionError;
  siteObservationV1Schema.parse(observation);
  const channels = score(observation, { now, reports, alerts, ...modelContext, forecast: mlAvailable ? modelContext?.forecast : undefined, hazard: mlAvailable ? modelContext?.hazard : undefined });
  const policyChannels = channelDecisions(channels);
  for (const c of policyChannels) {
    const modelHeat = channels.find(h => h.hazard === "heat")?.factors?.find(f => f.key === "heatCast");
    if (((c.category === "heat" && Math.max(observation.weather.heatIndexF ?? observation.weather.apparentTemperatureF ?? -Infinity, typeof modelHeat?.value === "number" ? modelHeat.value : -Infinity) >= RISK_CONFIG.policy.heatRestrictF) ||
      (c.category === "weather" && Math.max(observation.weather.windMph ?? -Infinity, observation.weather.gustMph ?? -Infinity) >= RISK_CONFIG.policy.windRestrictMph)) && c.status !== "HOLD") c.status = "RESTRICTED";
  }
  const hazard = mlAvailable ? modelContext?.hazard ?? null : null;
  const decision = decide(site, undefined, reports.filter(r => Date.parse(r.createdAt) <= now), effectiveStrikes.filter(s => s.mode === "live"), alerts.filter(a => a.mode === "live"), now,
    undefined, undefined, now, 24, policyChannels, hazard);
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
    mlCoverage: { heatCast: mlAvailable, groundCast: mlAvailable, hazardCast: !!hazard },
  } };
}
