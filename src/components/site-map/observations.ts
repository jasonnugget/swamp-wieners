import type { SiteObservationV1 } from "../../../shared/risk";

type Group = "weather" | "soil" | "lightning" | "flood" | "wildfire" | "wildlife";
type Format = "number" | "percent" | "fraction" | "count" | "boolean" | "time" | "text" | "code";
type Field = { key: string; label: string; format?: Format; unit?: string; note?: string };
type FieldGroup = { [K in Group]: { id: K; name: string; note: string; fields: (Field & { key: keyof SiteObservationV1[K] })[] } }[Group];

export const OBSERVATION_GROUPS: FieldGroup[] = [
  { id: "weather", name: "Weather & heat", note: "Weather estimates and completed-hour rainfall.", fields: [
    { key: "temperatureF", label: "Air temperature", unit: "°F" },
    { key: "humidityPct", label: "Relative humidity", format: "percent" },
    { key: "heatIndexF", label: "Heat index", unit: "°F" },
    { key: "apparentTemperatureF", label: "Feels-like temperature", unit: "°F" },
    { key: "windMph", label: "Sustained wind", unit: "mph" },
    { key: "gustMph", label: "Wind gust", unit: "mph" },
    { key: "precipitation1hMm", label: "Rain · last hour", unit: "mm" },
    { key: "precipitation24hMm", label: "Rain · 24 hours", unit: "mm" },
    { key: "precipitation7dMm", label: "Rain · 7 days", unit: "mm" },
    { key: "weatherCode", label: "Weather condition", format: "code" },
    { key: "cape", label: "Storm instability", unit: "J/kg", note: "CAPE describes atmospheric instability. It does not establish detected lightning." },
  ] },
  { id: "soil", name: "Ground conditions", note: "Moisture is volumetric water content; percentile requires a site-specific baseline.", fields: [
    { key: "moistureSurface", label: "Surface moisture", format: "fraction" },
    { key: "moistureRoot", label: "Root-zone moisture", format: "fraction" },
    { key: "historicalPercentile", label: "Historical percentile", format: "fraction" },
  ] },
  { id: "lightning", name: "Lightning", note: "Detected events and forecast potential have separate source labels.", fields: [
    { key: "nearestStrikeMiles", label: "Nearest detected strike", unit: "mi" },
    { key: "latestStrikeAt", label: "Latest strike", format: "time" },
    { key: "strikes10mi30m", label: "Strikes · 10 mi / 30 min", format: "count" },
    { key: "forecastPotential", label: "Forecast potential", format: "fraction", note: "A forecast proxy, not a measured probability or detected strike." },
    { key: "evidenceMode", label: "Evidence mode", format: "text" },
  ] },
  { id: "flood", name: "Water & flood exposure", note: "Gauge height is measured at the gauge. Mapped exposure does not establish current flooding.", fields: [
    { key: "nearestGaugeMiles", label: "Nearest associated gauge", unit: "mi" },
    { key: "stage", label: "Gauge height", unit: "m" },
    { key: "stagePercentile", label: "Relative stage percentile", format: "fraction" },
    { key: "stageTrend", label: "Water-level trend", unit: "m/h" },
    { key: "floodAlert", label: "Official flood alert", format: "boolean" },
    { key: "floodplain", label: "Mapped floodplain", format: "boolean" },
  ] },
  { id: "wildfire", name: "Fire conditions", note: "Satellite thermal anomalies are potential fire evidence, not confirmed wildfire perimeters.", fields: [
    { key: "nearestFireMiles", label: "Nearest thermal detection", unit: "mi" },
    { key: "fireAgeMinutes", label: "Detection age", unit: "min" },
    { key: "firePower", label: "Fire radiative power", unit: "MW" },
    { key: "redFlagAlert", label: "Official red flag alert", format: "boolean" },
  ] },
  { id: "wildlife", name: "Wildlife & crew sightings", note: "Crew reports have priority. Sparse public sightings cannot establish absence of wildlife.", fields: [
    { key: "dangerousSightings24h", label: "Relevant sightings · 24 h", format: "count" },
    { key: "nearestSightingMiles", label: "Nearest sighting", unit: "mi" },
    { key: "latestSightingAt", label: "Latest sighting", format: "time" },
    { key: "crewReports24h", label: "Crew wildlife reports · 24 h", format: "count" },
    { key: "severity", label: "Incident classification", format: "text" },
  ] },
];

const conditions: Record<number, string> = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Rain showers", 81: "Rain showers", 82: "Heavy showers", 95: "Thunderstorm", 96: "Thunderstorm / hail", 99: "Thunderstorm / hail" };
export function formatObservation(value: unknown, field: Field, timezone?: string): string {
  if (value === null || value === undefined) return "Unknown";
  if (field.format === "boolean") return value === true ? "Yes" : "No";
  if (field.format === "time") {
    const date = new Date(String(value));
    return Number.isFinite(date.getTime()) ? date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone }) : "Unknown";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "Unknown";
    if (field.format === "code") return `${conditions[value] ?? "WMO code"} · ${value}`;
    const numeric = field.format === "fraction" ? value * 100 : value;
    const digits = field.format === "count" ? 0 : field.unit === "m/h" ? 2 : 1;
    const text = numeric.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return `${text}${field.format === "fraction" || field.format === "percent" ? "%" : field.unit ? ` ${field.unit}` : ""}`;
  }
  return String(value).replaceAll("_", " ");
}
