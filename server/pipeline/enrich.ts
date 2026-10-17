import type { Alert, HazardReport, Site, Strike } from "../../shared/types";
import type { SiteObservationV1, SafetyOverride } from "../../shared/risk";
import { distanceMiles, lightningUntil, TASKS } from "../../shared/policy";
import { crewTaskEffects } from "../../shared/crew-risk";
import { updateCoverage } from "./normalize";

export function enrich(o: SiteObservationV1, site: Site, reports: HazardReport[], strikes: Strike[], alerts: Alert[], now: number, alertCheckedAt?: string): SafetyOverride[] {
  const active = reports.filter(r => r.siteId === site.id && r.status === "open" && Date.parse(r.createdAt) <= now);
  o.wildlife.crewReports24h = reports.filter(r => r.siteId === site.id && r.category === "wildlife" && now >= Date.parse(r.createdAt) && now - Date.parse(r.createdAt) < 86400000).length;
  // Positive events are useful without claiming a complete live detector feed.
  const nearby = strikes.filter(s => s.mode === "live" && Date.parse(s.time) <= now && now - Date.parse(s.time) < 1800000)
    .map(s => ({ ...s, miles: distanceMiles(site, s) })).sort((a, b) => a.miles - b.miles);
  if (nearby.length) {
    o.lightning.evidenceMode = "LIVE";
    o.lightning.nearestStrikeMiles = nearby[0].miles;
    o.lightning.latestStrikeAt = new Date(Math.max(...nearby.map(s => Date.parse(s.time)))).toISOString();
    o.provenance.fieldSources["lightning.nearestStrikeMiles"] = "Live detected strike events; completeness unknown";
  }
  const official = alerts.filter(a => a.siteId === site.id && a.mode === "live" && Date.parse(a.expiresAt) > now);
  const freshCheck = alertCheckedAt && now >= Date.parse(alertCheckedAt) && now - Date.parse(alertCheckedAt) < 600000;
  // False requires a successful recent check. Failure does not erase unexpired alerts.
  if (freshCheck || official.some(a => a.category === "flood")) o.flood.floodAlert = official.some(a => a.category === "flood");
  if (freshCheck || official.some(a => a.category === "wildfire")) o.wildfire.redFlagAlert = official.some(a => a.category === "wildfire");
  for (const [field, value] of [["flood.floodAlert", o.flood.floodAlert], ["wildfire.redFlagAlert", o.wildfire.redFlagAlert]] as const)
    if (value !== null) {
      o.provenance.fieldSources[field] = `NWS active alerts; last successful check ${alertCheckedAt ?? "unknown"}`;
      o.provenance.fieldEvidence[field] = { source: "NOAA/NWS alerts", mode: "LIVE", fetchedAt: alertCheckedAt ?? null, observedAt: null, confidence: 1 };
    }
  const overrides: SafetyOverride[] = active.flatMap(r => crewTaskEffects(r, now).map((effect, i) => ({ id: i ? `${r.id}:semantic` : r.id, hazard: r.category, source: "crew" as const, state: effect.state, tasks: effect.tasks, reason: r.description, expiresAt: null })));
  const until = lightningUntil(site, strikes.filter(s => s.mode === "live"), now);
  if (until) overrides.push({ id: `lightning:${site.id}`, hazard: "lightning", source: "lightning", state: "HOLD", tasks: ["mobilization", "installation"], reason: "Detected strike within 10 miles; 30-minute outdoor hold", expiresAt: until });
  for (const a of official) overrides.push({ id: a.id, hazard: a.category, source: "official-alert", state: a.severity >= 10 ? "HOLD" : "RESTRICTED", tasks: TASKS.filter(t => t !== "preparation" && (a.category !== "soil" || t === "mobilization") && (a.category !== "heat" || t === "installation")), reason: a.title, expiresAt: a.expiresAt });
  updateCoverage(o);
  return overrides;
}
