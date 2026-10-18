export type Category =
  | "weather"
  | "heat"
  | "lightning"
  | "flood"
  | "wildfire"
  | "soil"
  | "wildlife";
export type Task = "mobilization" | "installation" | "preparation";
export type TaskState = "AVAILABLE" | "RESTRICTED" | "HOLD" | "UNKNOWN";
export type DataMode = "historical" | "live" | "simulated";
export interface Site {
  id: string;
  name: string;
  state: string;
  county: string;
  utility: string;
  latitude: number;
  longitude: number;
  timezone: string;
  capacityMw: number;
  source: string;
  sourceDate: string;
  heldOut: boolean;
  catalogOnly?: boolean;
  riverScreening: boolean;
}
export interface Sample {
  time: string;
  issuedAt: string;
  availableAt: string;
  x: number[];
  heat: number;
  soil: number;
  baselineHeat: number;
  baselineSoil: number;
  split: "train" | "validation" | "calibration" | "test";
}
export interface ForecastHour {
  time: string;
  issuedAt: string;
  heat: number[];
  soil: number[];
  baselineHeat: number;
  precipitation: number;
  temperature: number;
  humidity: number;
  wind: number;
  x: number[];
}
export interface Forecast {
  siteId: string;
  mode: DataMode;
  fetchedAt: string;
  modelVersion: string;
  antecedentRain24?: number;
  hours: ForecastHour[];
}
export interface WeatherScreening {
  siteId: string;
  source: "NOAA/NWS";
  sourceUrl: string;
  fetchedAt: string;
  issuedAt: string;
  hours: {
    time: string;
    heatIndex: number | null;
    windKmh: number | null;
  }[];
}
export interface Layer {
  weights: number[][];
  bias: number[];
}
export interface Network {
  layers: Layer[];
  mean: number[];
  std: number[];
  targetScale: number;
  targetOffset: number;
  residual: boolean;
  intervalAdjustment: number;
}
export interface Metrics {
  mae: number;
  baselineMae: number;
  pinball: number;
  coverage: number;
  count: number;
  precision: number;
  recall: number;
}
export interface ModelBundle {
  version: string;
  features: string[];
  source: string;
  createdAt: string;
  heat: Network;
  soil: Network;
  evaluation: {
    heat: Metrics;
    soil: Metrics;
    unseenHeat: Metrics;
    unseenSoil: Metrics;
    counts: Record<string, number>;
    notes: string[];
    bySite: Record<string, { heat: Metrics; soil: Metrics }>;
  };
  soilThresholds: Record<string, number[]>;
}
export type HazardKey = "wind" | "flood" | "lightning" | "fire" | "heat";
export interface HazardNetwork {
  layers: Layer[];
  platt: [number, number];
  positiveWeight: number;
  labelSources: string[];
  labelEnd: string;
  climatology: number[]; // training-period monthly base rate, Jan..Dec
}
export interface HazardModelBundle {
  version: string;
  createdAt: string;
  features: string[];
  mean: number[];
  std: number[];
  scoreAnchors: [number, number][];
  hazards: Record<HazardKey, HazardNetwork>;
  overall: { inputs: HazardKey[]; coefficients: number[]; intercept: number; inputMean: number[]; labelSources: string[]; labelEnd: string; climatology: number[] };
  siteTraits: Record<string, number[]>;
  siteContext: Record<string, unknown>;
  evaluation: Record<string, unknown>;
  counts: Record<string, number>;
  samples: { siteId: string; date: string; x: number[]; probabilities: Record<HazardKey | "overall", number> }[];
  featureSamples: { siteId: string; date: string; soilP90: number; hours: HazardHour[]; priorRain: number[]; expected: number[] }[];
  notes: string[];
  source: string;
  ruleBaselineVersion: string;
}
// One hour of archived/live 48h-lead forecast plus frozen HeatCast/GroundCast upper quantiles.
export interface HazardHour {
  time: string;
  temperature: number;
  humidity: number;
  precipitation: number;
  wind: number;
  gust: number;
  cape: number;
  dewPoint: number;
  heatcastP90: number;
  groundcastP90: number;
}
export interface HazardDay {
  date: string; // site-local calendar date
  hazards: Record<HazardKey, { probability: number; score: number; climatology: number }>;
  overall: { probability: number; score: number; climatology: number; contributions: Record<HazardKey, number> };
}
export interface HazardForecast {
  siteId: string;
  mode: DataMode;
  fetchedAt: string;
  issuedAt: string;
  modelVersion: string;
  days: HazardDay[];
}
export interface CrewTeam {
  id: string;
  name: string;
  members: string[];
  siteIds: string[];
}
export interface HazardReport {
  id: string;
  siteId: string;
  category: Category;
  description: string;
  tasks: Task[];
  latitude: number;
  longitude: number;
  photoUrl?: string;
  author: string;
  teamId?: string;
  teamName?: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  triage?: {
    mode: "live" | "unavailable";
    model?: string;
    answers?: Record<string, unknown>;
    classification?: import("./crew-risk").CrewClassification;
    confirmedAt?: string;
    error?: string;
  };
}
export interface Strike {
  id: string;
  latitude: number;
  longitude: number;
  time: string;
  mode: DataMode;
}
export interface Alert {
  id: string;
  siteId: string;
  category: Category;
  title: string;
  event?: string;
  severity: number;
  expiresAt: string;
  mode: DataMode;
}
export interface HazardChannel {
  category: Category;
  severity: number | null;
  status: TaskState;
  title: string;
  detail: string;
  mode: DataMode | "crew";
  source: string;
}
export interface Decision {
  siteId: string;
  index: number | null;
  policyVersion: string;
  tasks: { task: Task; state: TaskState; reasons: string[] }[];
  channels: HazardChannel[];
  lightningUntil: string | null;
  unknownCount: number;
}
export interface Briefing {
  id: string;
  siteId: string;
  localDate: string;
  generatedAt: string;
  forecastMode: DataMode;
  decision: Decision;
  reportIds: string[];
  text: string;
}
export interface Snapshot {
  siteRisks: Record<string, import("./risk").SiteRiskSnapshot>;
  weatherScreenings?: Record<string, WeatherScreening>;
  teams: CrewTeam[];
  now: string;
  clockMode: "real" | "demo";
  sites: Site[];
  forecasts: Record<string, Forecast>;
  hazardForecasts?: Record<string, HazardForecast>; // at most today and tomorrow per site
  reports: HazardReport[];
  strikes: Strike[];
  alerts: Alert[];
  briefings: Briefing[];
  decisions: Record<string, Decision>;
  jevConfigured: boolean;
  feedStatus: Record<
    string,
    { checkedAt: string; ok: boolean; message: string }
  >;
}
