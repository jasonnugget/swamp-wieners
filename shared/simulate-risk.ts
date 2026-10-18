import type { Category, Decision, Site, TaskState } from "./types";
import type { HazardScore, SiteObservationV1, SiteRiskSnapshot } from "./risk";
import { applyPolicyLimits, channelDecisions } from "./risk";
import { calculateCompositeRisk, explainComposite, roundScore, scoreChannels } from "./risk-scoring";
import { decide } from "./policy";
import type { ScenarioFrame, ScenarioSiteImpact } from "./simulation";

/**
 * Hypothetical scores for one scenario hour. Never merged into canonical risk,
 * holds or policy: it answers "what would the screen say if this storm happened".
 */
export interface SimulatedRisk {
  mode: "SIMULATED";
  siteId: string;
  risk: number | null;
  /** Rule composite of today's canonical channels, the comparison point for `delta`. */
  baseline: number | null;
  delta: number | null;
  primary: { hazard: Category; score: number } | null;
  channels: { hazard: Category; score: number | null; baseline: number | null }[];
  tasks: Decision["tasks"];
}

// Channels the scenario's wind and rain feed; the rest keep today's evidence.
const DRIVEN: Category[] = ["weather", "flood", "wildfire"];
const GUST_FACTOR = 1.3;
const rank: Record<TaskState, number> = { AVAILABLE: 0, UNKNOWN: 1, RESTRICTED: 2, HOLD: 3 };

function neutralObservation(siteId: string): SiteObservationV1 {
  return {
    version: 1, siteId, validAt: null, fetchedAt: null,
    weather: { temperatureF: null, humidityPct: null, heatIndexF: null, apparentTemperatureF: null, windMph: null, gustMph: null,
      precipitation1hMm: null, precipitation24hMm: null, precipitation7dMm: null, weatherCode: null, cape: null },
    soil: { moistureSurface: null, moistureRoot: null, historicalPercentile: null },
    lightning: { nearestStrikeMiles: null, latestStrikeAt: null, evidenceMode: "UNAVAILABLE", strikes10mi30m: null, forecastPotential: null },
    flood: { nearestGaugeMiles: null, stage: null, stagePercentile: null, stageTrend: null, floodAlert: null, floodplain: null },
    wildfire: { nearestFireMiles: null, fireAgeMinutes: null, firePower: null, redFlagAlert: null },
    wildlife: { dangerousSightings24h: null, nearestSightingMiles: null, crewReports24h: 0, latestSightingAt: null, severity: null },
    coverage: { available: 0, expected: 1, percent: 0 },
    provenance: { mode: "forecast", source: "Simulated scenario", stale: false, error: null, fieldSources: {}, fieldEvidence: {}, providers: {} },
  };
}

/** Today's observation with the scenario's wind and rain laid over it. */
export function scenarioObservation(base: SiteObservationV1 | undefined, siteId: string, impact: ScenarioSiteImpact): SiteObservationV1 {
  const o = structuredClone(base ?? neutralObservation(siteId)), w = o.weather;
  const add = (value: number | null, extra: number) => (value ?? 0) + extra;
  w.windMph = Math.max(w.windMph ?? 0, impact.windMph);
  w.gustMph = Math.max(w.gustMph ?? 0, impact.windMph * GUST_FACTOR);
  w.precipitation1hMm = add(w.precipitation1hMm, impact.rainRateMmH);
  w.precipitation24hMm = add(w.precipitation24hMm, impact.rainLast24hMm);
  w.precipitation7dMm = add(w.precipitation7dMm, impact.accumulatedRainMm);
  // WMO 82 violent showers / 65 heavy rain; otherwise today's reported condition stands.
  if (impact.rainRateMmH >= 25) w.weatherCode = 82;
  else if (impact.rainRateMmH >= 7.6 && (w.weatherCode ?? 0) < 65) w.weatherCode = 65;
  o.provenance = { ...o.provenance, mode: "forecast", source: "Simulated scenario over current evidence" };
  return o;
}

export function simulateSiteRisk(site: Site, base: SiteRiskSnapshot | undefined, impact: ScenarioSiteImpact, now: number): SimulatedRisk {
  const observation = scenarioObservation(base?.observation, site.id, impact);
  const scored = scoreChannels(observation, { now });
  // A scenario can only add hazard: crew, alert and learned evidence in today's channels is kept.
  const channels: HazardScore[] = scored.map(sim => {
    const today = base?.channels.find(c => c.hazard === sim.hazard);
    if (!today) return sim;
    if (!DRIVEN.includes(sim.hazard) || (sim.score ?? -1) <= (today.score ?? -1)) return today;
    const environment = Math.max(sim.score ?? 0, today.environmentScore ?? today.score ?? 0);
    return { ...sim, score: sim.score, environmentScore: roundScore(environment) };
  });
  const policy = applyPolicyLimits(channelDecisions(channels), channels, observation.weather);
  const simulated = decide(site, undefined, [], [], [], now, undefined, undefined, now, 24, policy, null).tasks;
  const tasks = simulated.map(t => {
    const today = base?.tasks.find(b => b.task === t.task);
    if (!today || rank[today.state] <= rank[t.state]) return t;
    return { task: t.task, state: today.state, reasons: [...today.reasons, ...t.reasons] };
  });
  const risk = calculateCompositeRisk(channels);
  const baseline = base ? calculateCompositeRisk(base.channels) : null;
  return {
    mode: "SIMULATED", siteId: site.id, risk, baseline,
    delta: risk !== null && baseline !== null ? Math.round((risk - baseline) * 10) / 10 : null,
    primary: explainComposite(channels).primary,
    channels: channels.map(c => ({ hazard: c.hazard, score: c.score, baseline: base?.channels.find(b => b.hazard === c.hazard)?.score ?? null })),
    tasks,
  };
}

export function simulateFleet(frame: ScenarioFrame, sites: readonly Site[], risks: Record<string, SiteRiskSnapshot>, now = Date.now()): Record<string, SimulatedRisk> {
  return Object.fromEntries(sites.flatMap(site => {
    const impact = frame.impacts[site.id];
    return impact ? [[site.id, simulateSiteRisk(site, risks[site.id], impact, now)]] : [];
  }));
}

export const atRisk = (tasks: Decision["tasks"]) => tasks.some(t => t.state === "HOLD" || t.state === "RESTRICTED");
export const onHold = (tasks: Decision["tasks"]) => tasks.some(t => t.state === "HOLD");
