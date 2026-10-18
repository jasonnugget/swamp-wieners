// Prototype screening calibration. Values are not regulatory exposure limits.
export const RISK_CONFIG = {
  version: "continuous-risk-5",
  // WMO codes are categorical: conditions supply floors, never ordinal code interpolation.
  weatherCodeFloors: { 45: 2, 48: 2, 56: 3, 57: 4, 65: 4, 66: 4, 67: 5, 82: 5, 86: 5, 95: 5, 96: 7, 99: 8 } as Record<number, number>,
  capeNormalizationJkg: 3000,
  soilAnchorScores: [1, 7, 9],
  floodplainExposure: 4,
  dryness: [[0, 10], [15, 8], [30, 5], [60, 1], [100, 0]],
  wildlifeRecency: { halfLifeHours: 24, minimumRetention: 0.1 },
  modelWindow: { fetchTtlHours: 3, lookbackHours: 1, horizonHours: 48 },
  confidence: { model: 0.65, soilTraining: 0.7, soilFallback: 0.35, apparent: 0.7, forecastLightning: 0.5, publicWildlife: 0.6 },
  semanticConfidenceCutoffs: { HIGH: 0.8, MEDIUM: 0.5 },
  heat: [[80, 0], [90, 2], [100, 4], [103, 6], [115, 8], [125, 10]],
  wind: [[10, 0], [20, 1], [30, 3], [40, 5], [50, 7], [65, 10]],
  rain1h: [[0, 0], [2, 1], [10, 4], [25, 7], [50, 10]],
  rain24h: [[0, 0], [10, 1], [25, 4], [50, 7], [100, 10]],
  rain7d: [[0, 0], [25, 1], [75, 4], [150, 7], [300, 10]],
  soilPercentile: [[0, 0], [0.5, 1], [0.7, 3], [0.8, 5], [0.9, 7], [0.95, 9], [0.99, 10]],
  soilFallback: [[0, 0], [0.1, 1], [0.25, 3], [0.4, 6], [0.6, 9], [1, 10]],
  gaugePercentile: [[0, 0], [0.5, 1], [0.75, 3], [0.9, 7], [0.99, 10]],
  gaugeTrend: [[-1, 0], [0, 1], [0.1, 3], [0.3, 6], [1, 10]], // meters/hour
  fireDistance: [[0, 10], [3, 9], [10, 6], [30, 3], [80, 1], [150, 0]],
  firePower: [[0, 0], [10, 2], [50, 5], [150, 8], [500, 10]], // MW
  detectionAge: [[0, 10], [60, 9], [360, 6], [1440, 2], [2880, 0]], // minutes
  strikeDistance: [[0, 9.5], [3, 9], [10, 8], [20, 5], [50, 1], [100, 0]],
  strikeCount: [[0, 0], [1, 7], [5, 8], [20, 9.5], [100, 10]],
  stormPotential: [[0, 0], [0.2, 1], [0.5, 3], [0.8, 5], [1, 6]],
  wildlifeCount: [[0, 0], [1, 4], [3, 6], [10, 9], [20, 10]],
  wildlifeDistance: [[0, 9], [0.1, 8], [1, 5], [5, 2], [20, 0]],
  severity: { INFORMATIONAL: 1, LOW: 2, MODERATE: 4, ELEVATED: 6, HIGH: 8, CRITICAL: 10 },
  semanticConfidence: { LOW: 0.35, MEDIUM: 0.6, HIGH: 0.85 },
  composite: { strength: 0.35, noiseFloor: 1 },
  reinforcement: 0.1,
  crew: { defaultSeverity: "MODERATE", defaultConfidence: 0.4, halfLifeHours: 24, minimumRetention: 0.5 },
  weights: {
    soil: [0.7, 0.3], weather: [0.4, 0.3, 0.2, 0.1], flood: [0.35, 0.45, 0.2],
    rain: [0.4, 0.4, 0.2], gauge: [0.8, 0.2], wildfire: [0.5, 0.2, 0.15, 0.1, 0.05], wildlife: [0.6, 0.4],
  },
  alertFloors: { watch: 4, advisory: 3, warning: 7, floodWarning: 8, flashFloodWarning: 9, redFlag: 6 },
  // HazardCast: learned next-day probabilities. Models only raise channel evidence.
  hazardModel: { fetchTtlHours: 3, confidence: 0.7 },
  // holdScore: an extreme channel or learned index forces HOLD on affected field tasks.
  policy: { holdScore: 9, restrictScore: 7, heatRestrictF: 103, windRestrictMph: 50 / 1.609344, rainRestrictMm: 25 },
} as const;
