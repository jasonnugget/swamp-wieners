import type { SiteRiskSnapshot } from "./risk";
import type { SiteDataPreview } from "./site-data";
import type { Site } from "./types";

export interface RiskAtlas {
  version: 1;
  generatedAt: string;
  validAt: string;
  hour: number;
  kind: "CURRENT" | "FORECAST";
  limitations: string[];
  sites: { site: Site; snapshot: SiteRiskSnapshot; completion?: SiteDataPreview }[];
}
export const ATLAS_LAYERS = {
  risk: { name: "Site risk", unit: "/10", low: "0 · Low", high: "10 · Critical" },
  temperature: { name: "Temperature", unit: "°F", low: "20°", high: "100°" },
  heat: { name: "Heat risk", unit: "/10", low: "0", high: "10" },
  wind: { name: "Wind", unit: "mph", low: "0", high: "65+" },
  rain: { name: "Precipitation", unit: "mm/h", low: "0", high: "10+" },
  weather: { name: "Weather risk", unit: "/10", low: "0", high: "10" },
  soil: { name: "Soil risk", unit: "/10", low: "0", high: "10" },
  flood: { name: "Flood risk", unit: "/10", low: "0", high: "10" },
  wildfire: { name: "Wildfire risk", unit: "/10", low: "0", high: "10" },
  lightning: { name: "Lightning risk", unit: "/10", low: "0", high: "10" },
  wildlife: { name: "Wildlife risk", unit: "/10", low: "0", high: "10" },
} as const;
export type RiskLayer = keyof typeof ATLAS_LAYERS;
export function atlasValue(snapshot: SiteRiskSnapshot | undefined, layer: RiskLayer): number | null {
  if (!snapshot) return null;
  const o = snapshot.observation;
  if (layer === "risk") return snapshot.risk;
  if (layer === "temperature") return o.weather.temperatureF;
  if (layer === "wind") return o.weather.gustMph ?? o.weather.windMph;
  if (layer === "rain") return o.weather.precipitation1hMm;
  return snapshot.channels.find(c => c.hazard === layer)?.score ?? null;
}
export function atlasFraction(value: number, layer: RiskLayer): number {
  return Math.max(0, Math.min(1, layer === "temperature" ? (value - 20) / 80 : layer === "wind" ? value / 65 : value / 10));
}
// Continuous interpolation within the existing lime / amber / coral map palette.
export function atlasColor(value: number | null | undefined, layer: RiskLayer = "risk"): string {
  if (value == null || !Number.isFinite(value)) return "#9cabb4";
  const palette = layer === "temperature" ? ["#739bb8", "#a9c7bc", "#e8d09b", "#d98c68", "#bd655c"] : ["#c9ee8d", "#dce18b", "#f0c477", "#f4ab76", "#ff9676", "#df656c"];
  const scaled = atlasFraction(value, layer) * (palette.length - 1), i = Math.min(palette.length - 2, Math.floor(scaled)), t = scaled - i;
  const rgb = (hex: string) => [1, 3, 5].map(n => parseInt(hex.slice(n, n + 2), 16));
  const a = rgb(palette[i]), b = rgb(palette[i + 1]);
  return `#${a.map((v, n) => Math.round(v + (b[n] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
// 4 stop-work, 3 high risk, 2 insufficient evidence, 1 apparently safe.
export function sitePriority(r: SiteRiskSnapshot | undefined): number {
  if (r?.activeOverrides.some(o => o.state === "HOLD") || r?.tasks.some(t => t.state === "HOLD")) return 4;
  if (r?.risk !== null && r?.risk !== undefined && r.risk >= 4) return 3;
  // Insufficient evidence enters the review queue ahead of apparently safe sites.
  return !r || r.risk === null || r.confidence < 0.5 || r.observation.coverage.percent < 50 ? 2 : 1;
}
export function rankSites(sites: Site[], risks: Record<string, SiteRiskSnapshot>): Site[] {
  const priority = (s: Site) => sitePriority(risks[s.id]);
  return [...sites].sort((a, b) => priority(b) - priority(a) || (risks[b.id]?.risk ?? -1) - (risks[a.id]?.risk ?? -1) || (risks[a.id]?.confidence ?? 0) - (risks[b.id]?.confidence ?? 0) || a.name.localeCompare(b.name));
}
