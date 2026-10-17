import { z } from "zod";
import type { HazardReport } from "./types";
import { RISK_CONFIG } from "./risk-config";

export const crewClassificationSchema = z.object({
  category: z.enum(["weather", "heat", "lightning", "flood", "wildfire", "soil", "wildlife"]),
  severity: z.enum(["INFORMATIONAL", "LOW", "MODERATE", "ELEVATED", "HIGH", "CRITICAL"]),
  immediacy: z.enum(["MONITOR", "RESTRICT", "HOLD"]),
  affectedTasks: z.array(z.enum(["mobilization", "installation", "preparation"])).min(1),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  summary: z.string().min(1).max(2000),
});
export type CrewClassification = z.infer<typeof crewClassificationSchema>;
export function confirmedClassification(report: HazardReport, now?: number): CrewClassification | null {
  const parsed = crewClassificationSchema.safeParse(report.triage?.classification);
  const confirmedAt = Date.parse(report.triage?.confirmedAt ?? "");
  return report.triage?.mode === "live" && Number.isFinite(confirmedAt) && (now === undefined || confirmedAt <= now) && parsed.success ? parsed.data : null;
}
export function crewEvidence(report: HazardReport, now: number) {
  const classification = confirmedClassification(report, now);
  const ageHours = Math.max(0, now - Date.parse(report.createdAt)) / 3600000;
  const retention = Math.max(RISK_CONFIG.crew.minimumRetention, 2 ** (-ageHours / RISK_CONFIG.crew.halfLifeHours));
  const severity = classification?.severity ?? RISK_CONFIG.crew.defaultSeverity;
  return { score: RISK_CONFIG.severity[severity] * retention,
    confidence: classification ? RISK_CONFIG.semanticConfidence[classification.confidence] * retention : RISK_CONFIG.crew.defaultConfidence * retention,
    classification, severity };
}

// Explicit crew-selected tasks remain held until resolution. Semantic suggestions
// can add controls after confirmation, but never release those existing selections.
export function crewTaskEffects(report: HazardReport, now?: number) {
  const effects: { tasks: HazardReport["tasks"]; state: "HOLD" | "RESTRICTED" }[] = [{ tasks: report.tasks, state: "HOLD" }];
  const c = confirmedClassification(report, now);
  if (c && c.immediacy !== "MONITOR") {
    const extra = c.affectedTasks.filter(t => !report.tasks.includes(t));
    if (extra.length) effects.push({ tasks: extra, state: c.immediacy === "HOLD" ? "HOLD" : "RESTRICTED" });
  }
  return effects;
}
