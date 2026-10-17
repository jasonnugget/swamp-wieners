import type { HazardReport, Site, Category } from "../../../shared/types";
import type { SiteRiskSnapshot, HazardScore } from "../../../shared/risk";
import { localParts } from "../../../shared/clock";
import { RISK_CONFIG } from "../../../shared/risk-config";
import { categories } from "./report-input";

export type HazardStatus = "HOLD" | "RESTRICTED" | "ELEVATED" | "UNKNOWN" | "SCREENED";
const priority: Record<HazardStatus, number> = { HOLD: 0, RESTRICTED: 1, ELEVATED: 2, UNKNOWN: 3, SCREENED: 4 };
export function siteDay(time: number, timezone: string) { return localParts(time, timezone).date; }
export function todayCrewReports(reports: HazardReport[], site: Site, now = Date.now()) {
  const today = siteDay(now, site.timezone);
  return reports.filter(report => report.siteId === site.id && Number.isFinite(Date.parse(report.createdAt)) &&
    Date.parse(report.createdAt) <= now && siteDay(Date.parse(report.createdAt), site.timezone) === today);
}
function evidenceLabels(channel: HazardScore | undefined, snapshot: SiteRiskSnapshot) {
  const labels = new Set<string>();
  for (const factor of channel?.factors ?? []) {
    if (factor.score === null) continue;
    const field = snapshot.observation.provenance.fieldEvidence?.[factor.key];
    if (factor.kind === "crew") labels.add("Crew evidence");
    else if (factor.mode === "simulated" || field?.mode === "DEMO") labels.add("Demo evidence");
    else if (factor.mode === "historical") labels.add("Historical model evidence");
    else if (factor.kind === "forecast" || field?.mode === "FORECAST" || /model estimate|forecast/i.test(factor.source)) labels.add("Forecast / model estimate");
    else if (factor.kind === "official-alert") labels.add("Official alert");
    else if (field?.mode === "STATIC") labels.add("Static exposure");
    else labels.add("Provider evidence");
  }
  return [...labels];
}
function reading(hazard: Category, snapshot: SiteRiskSnapshot) {
  const o = snapshot.observation;
  const number = (value: number) => value.toFixed(1).replace(/\.0$/, "");
  if (hazard === "heat") {
    if (o.weather.heatIndexF !== null) return `Heat index ${number(o.weather.heatIndexF)}°F`;
    if (o.weather.apparentTemperatureF !== null) return `Feels like ${number(o.weather.apparentTemperatureF)}°F`;
    if (o.weather.temperatureF !== null) return `Temperature ${number(o.weather.temperatureF)}°F`;
  }
  if (hazard === "weather") {
    const values = [o.weather.windMph === null ? "" : `Wind ${number(o.weather.windMph)} mph`, o.weather.gustMph === null ? "" : `gusts ${number(o.weather.gustMph)} mph`, o.weather.precipitation1hMm === null ? "" : `${number(o.weather.precipitation1hMm)} mm rain / hour`].filter(Boolean);
    if (values.length) return values.join(" · ");
  }
  if (hazard === "soil" && o.soil.moistureSurface !== null) return `Surface soil moisture ${number(o.soil.moistureSurface * 100)}%`;
  if (hazard === "flood") {
    if (o.flood.floodAlert === true) return "Active official flood alert";
    if (o.flood.stagePercentile !== null) return `Gauge stage at the ${number(o.flood.stagePercentile * 100)}th historical percentile`;
    if (o.flood.floodplain === true) return "Mapped floodplain exposure · not a current flood detection";
  }
  if (hazard === "lightning") {
    if (o.lightning.evidenceMode === "LIVE" && o.lightning.nearestStrikeMiles !== null) return `Detected strike ${number(o.lightning.nearestStrikeMiles)} miles away`;
    if (o.lightning.forecastPotential !== null) return `Forecast potential ${number(o.lightning.forecastPotential * 100)}% · no strike confirmed by this estimate`;
  }
  if (hazard === "wildfire") {
    if (o.wildfire.redFlagAlert === true) return "Active official red flag alert";
    if (o.wildfire.nearestFireMiles !== null) return `Fire detection ${number(o.wildfire.nearestFireMiles)} miles away`;
  }
  if (hazard === "wildlife" && o.wildlife.dangerousSightings24h !== null) return `${o.wildlife.dangerousSightings24h} reported wildlife sightings in the past 24 hours`;
  return undefined;
}

export function todaySiteHazards(site: Site, snapshot?: SiteRiskSnapshot, cached = false, now = Date.now()) {
  const matching = snapshot?.siteId === site.id ? snapshot : undefined;
  const generated = matching ? Date.parse(matching.generatedAt) : NaN;
  const current = !!matching && !cached && Number.isFinite(generated) && generated <= now && now - generated <= 120000 && siteDay(generated, site.timezone) === siteDay(now, site.timezone);
  const rows = categories.map(category => {
    const channel = matching?.channels.find(value => value.hazard === category.id);
    const overrides = matching?.activeOverrides.filter(value => value.hazard === category.id) ?? [];
    const score = current ? channel?.score ?? null : null;
    const status: HazardStatus = overrides.some(value => value.state === "HOLD") ? "HOLD" : overrides.length ? "RESTRICTED" : score === null ? "UNKNOWN" : score >= RISK_CONFIG.policy.restrictScore ? "ELEVATED" : "SCREENED";
    const labels = matching ? evidenceLabels(channel, matching) : [];
    return {
      hazard: category.id, title: category.label, status, score, confidence: current ? channel?.confidence ?? 0 : 0,
      detail: !current ? matching ? "Last-known record · reconnect for current conditions" : "Current site data has not loaded" :
        overrides[0]?.reason ?? (matching && reading(category.id, matching)) ?? (score === null ? "No fresh scoring evidence; this hazard remains unknown" : "Risk screening only · not a confirmed incident"),
      labels, evidence: channel?.evidence ?? [], overrides,
    };
  }).sort((a, b) => priority[a.status] - priority[b.status] || (b.score ?? -1) - (a.score ?? -1));
  return {
    date: siteDay(now, site.timezone), current, generatedAt: matching?.generatedAt,
    snapshot: matching, rows,
    flagged: rows.filter(row => ["HOLD", "RESTRICTED", "ELEVATED"].includes(row.status)).length,
    unknown: rows.filter(row => row.score === null).length,
    overrides: matching?.activeOverrides ?? [],
  };
}
