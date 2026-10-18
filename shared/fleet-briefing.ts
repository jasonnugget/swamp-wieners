import type { Briefing, Decision, Site } from "./types";
import { CATEGORY_LABELS, TASK_LABELS } from "./policy";

export interface FleetSite {
  siteId: string;
  name: string;
  state: string;
  index: number | null;
  tasks: Decision["tasks"];
  /** Channels driving the restriction, e.g. "Lightning". */
  hazards: string[];
  /** Short policy reasons for restricted or held tasks, strongest first. */
  reasons: string[];
  openReports: number;
}
/** One fleet-wide next-day briefing; the PDF is rendered from this record. */
export interface FleetBriefing {
  id: string;
  localDate: string;
  generatedAt: string;
  summary: string;
  /** "gemini" text is AI-generated from the listed records; "template" is deterministic. */
  summaryMode: "gemini" | "template";
  model?: string;
  summaryError?: string;
  totalSites: number;
  atRiskSites: FleetSite[];
  policyVersion: string;
}

const restricted = (t: Decision["tasks"][number]) => t.state === "HOLD" || t.state === "RESTRICTED";
const holds = (s: FleetSite) => s.tasks.filter(t => t.state === "HOLD").length;

export function atRiskFromBriefings(briefings: Briefing[], sites: readonly Site[]): FleetSite[] {
  const byId = new Map(sites.map(s => [s.id, s]));
  return briefings.flatMap(b => {
    const site = byId.get(b.siteId);
    if (!site || !b.decision.tasks.some(restricted)) return [];
    // Unknown-coverage channels also add task reasons; only restricting channels explain the restriction.
    const channels = b.decision.channels.filter(c => c.status === "HOLD" || c.status === "RESTRICTED")
      .sort((x, y) => Number(y.status === "HOLD") - Number(x.status === "HOLD") || (y.severity ?? 0) - (x.severity ?? 0));
    const labels = Object.values(CATEGORY_LABELS);
    const other = b.decision.tasks.filter(restricted).flatMap(t => t.reasons).filter(r => !labels.some(l => r.startsWith(`${l}:`)));
    const reasons = [...new Set([...channels.map(c => `${CATEGORY_LABELS[c.category]}: ${c.title}`), ...other])].slice(0, 4);
    return [{ siteId: site.id, name: site.name, state: site.state, index: b.decision.index, tasks: b.decision.tasks,
      hazards: [...new Set(channels.map(c => CATEGORY_LABELS[c.category]))], reasons, openReports: b.reportIds.length }];
  }).sort((a, b) => holds(b) - holds(a) || (b.index ?? -1) - (a.index ?? -1) || a.name.localeCompare(b.name));
}

/** Hazard names driving a site's restriction; crew-only restrictions have none. */
export function siteHazards(site: FleetSite): string[] {
  return site.hazards ?? [];
}

export function templateSummary(localDate: string, sites: FleetSite[], totalSites: number): string {
  if (!sites.length) return `No plants have restricted or held field work for ${localDate} across ${totalSites} briefed sites. Keep standard checks in place and verify conditions on arrival.`;
  const held = sites.filter(s => holds(s) > 0);
  const lead = sites.slice(0, 3).map(s => `${s.name} (${s.state}${s.index !== null ? `, index ${s.index.toFixed(1)}` : ""}${siteHazards(s).length ? `, ${siteHazards(s).join(" and ").toLowerCase()}` : ""})`);
  return [
    `${sites.length} of ${totalSites} plants have restricted or held work for ${localDate}; ${held.length} ${held.length === 1 ? "has" : "have"} at least one task on hold.`,
    `Highest priority: ${lead.join("; ")}.`,
    `Review each listed site before crews mobilize; held tasks stay held until the hazard clears.`,
  ].join(" ");
}

export function taskLine(site: FleetSite): string {
  return site.tasks.map(t => `${TASK_LABELS[t.task]}: ${t.state}`).join(" · ");
}
