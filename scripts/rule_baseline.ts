// Scores historical daily forecast rows with the production rule engine, so the
// learned models are compared with the actual shared scorer rather than a copy.
// Usage: tsx scripts/rule_baseline.ts <rows.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { calculateCompositeRisk, scoreChannels } from "../shared/risk-scoring";
import type { SiteObservationV1 } from "../shared/risk";
import { RISK_CONFIG } from "../shared/risk-config";

type Row = { siteId: string; date: string; heatIndexMaxF: number; tmaxF: number; rhMean: number; windMaxMph: number; gustMaxMph: number;
  rainMax1hMm: number; rainTotalMm: number; rainPrior7dMm: number; capeMax: number; groundcastP90: number; floodplain: boolean | null; soilThresholds: number[] };

function observation(r: Row): SiteObservationV1 {
  return {
    version: 1, siteId: r.siteId, validAt: `${r.date}T18:00:00.000Z`, fetchedAt: `${r.date}T00:00:00.000Z`,
    weather: { temperatureF: r.tmaxF, humidityPct: r.rhMean, heatIndexF: r.heatIndexMaxF, apparentTemperatureF: null, windMph: r.windMaxMph, gustMph: r.gustMaxMph,
      precipitation1hMm: r.rainMax1hMm, precipitation24hMm: r.rainTotalMm, precipitation7dMm: r.rainPrior7dMm + r.rainTotalMm, weatherCode: null, cape: r.capeMax },
    soil: { moistureSurface: r.groundcastP90, moistureRoot: null, historicalPercentile: null },
    lightning: { nearestStrikeMiles: null, latestStrikeAt: null, evidenceMode: "FORECAST", strikes10mi30m: null, forecastPotential: Math.min(1, r.capeMax / RISK_CONFIG.capeNormalizationJkg) },
    flood: { nearestGaugeMiles: null, stage: null, stagePercentile: null, stageTrend: null, floodAlert: null, floodplain: r.floodplain },
    wildfire: { nearestFireMiles: null, fireAgeMinutes: null, firePower: null, redFlagAlert: null },
    wildlife: { dangerousSightings24h: null, nearestSightingMiles: null, crewReports24h: 0, latestSightingAt: null, severity: null },
    coverage: { available: 1, expected: 1, percent: 100 },
    provenance: { mode: "forecast", source: "Archived 48h GFS daily aggregate", stale: false, error: null, fieldSources: {}, fieldEvidence: {}, providers: {} },
  };
}

const [input, output] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(input, "utf8")) as Row[];
const scored = rows.map(r => {
  const channels = scoreChannels(observation(r), { now: Date.parse(`${r.date}T18:00:00Z`), soilThresholds: r.soilThresholds });
  const by = Object.fromEntries(channels.map(c => [c.hazard, c.score]));
  return { ...by, composite: calculateCompositeRisk(channels) };
});
writeFileSync(output, JSON.stringify({ version: RISK_CONFIG.version, scores: scored }));
