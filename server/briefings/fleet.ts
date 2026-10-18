import PDFDocument from "pdfkit";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Briefing, Site } from "../../shared/types";
import { atRiskFromBriefings, siteHazards, type FleetBriefing, type FleetSite } from "../../shared/fleet-briefing";
import { POLICY_VERSION, TASKS } from "../../shared/policy";
import { summarizeFleet } from "../integrations/gemini";
import type { Store } from "../store";

const INK = "#1d2420", MUTED = "#5f6b64", RULE = "#d4d9d5";
const STATE_COLOR = { HOLD: "#b3261e", RESTRICTED: "#a15c00", AVAILABLE: "#2f6b3f", UNKNOWN: "#5f6b64" } as const;
const TASK_SHORT = { mobilization: "Mobilize", installation: "Install", preparation: "Prep" } as const;

export const fleetPdfPath = (directory: string, date: string) => join(directory, "briefings", `fleet-${date}.pdf`);

export function writeFleetPdf(briefing: FleetBriefing, file: string): Promise<void> {
  mkdirSync(join(file, ".."), { recursive: true });
  const doc = new PDFDocument({ size: "LETTER", margin: 54, info: { Title: `PlanIT fleet safety briefing ${briefing.localDate}`, Author: "PlanIT" } });
  const done = new Promise<void>((resolve, reject) => { const out = createWriteStream(file); out.on("finish", resolve).on("error", reject); doc.pipe(out); });
  const width = doc.page.width - 108, left = 54;

  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(9).text("PLANIT · DAILY FLEET SAFETY BRIEFING", left, 54, { characterSpacing: 1 });
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(22).text(`Work day ${briefing.localDate}`, { paragraphGap: 2 });
  doc.fillColor(MUTED).font("Helvetica").fontSize(10).text(`Generated ${new Date(briefing.generatedAt).toUTCString()} · ${briefing.atRiskSites.length} of ${briefing.totalSites} plants restricted or on hold`);
  doc.moveDown(1);

  const boxTop = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text(briefing.summaryMode === "gemini" ? `AI-GENERATED SUMMARY · ${briefing.model ?? "Gemini"} · decisions below are authoritative` : "SUMMARY · deterministic template", left + 12, boxTop + 10, { width: width - 24 });
  doc.moveDown(0.4).font("Helvetica").fontSize(11).fillColor(INK).text(briefing.summary, { width: width - 24, lineGap: 2 });
  const boxBottom = doc.y + 10;
  doc.roundedRect(left, boxTop, width, boxBottom - boxTop, 6).lineWidth(0.8).strokeColor(RULE).stroke();
  doc.y = boxBottom + 18;

  doc.x = left;
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text("At-risk sites", left, doc.y);
  doc.moveDown(0.4);
  if (!briefing.atRiskSites.length) doc.font("Helvetica").fontSize(10).fillColor(MUTED).text("No plants have restricted or held tasks for this work day.");
  const cols = [{ label: "Site", w: 150 }, { label: "Index", w: 42 }, ...TASKS.map(t => ({ label: TASK_SHORT[t], w: 62 })), { label: "Key reason", w: width - 150 - 42 - 62 * 3 }];
  const header = () => {
    let x = left; const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
    for (const c of cols) { doc.text(c.label.toUpperCase(), x, y, { width: c.w - 6 }); x += c.w; }
    doc.moveTo(left, y + 12).lineTo(left + width, y + 12).lineWidth(0.6).strokeColor(RULE).stroke();
    doc.y = y + 17;
  };
  if (briefing.atRiskSites.length) header();
  for (const site of briefing.atRiskSites) row(site);

  function row(site: FleetSite) {
    const reason = site.reasons[0] ?? "", hazards = siteHazards(site).join(", ");
    doc.font("Helvetica").fontSize(8.5);
    const height = Math.max(doc.heightOfString(`${site.name}\n${site.state}${hazards ? ` · ${hazards}` : ""}`, { width: cols[0].w - 6 }), doc.heightOfString(reason, { width: cols[5].w - 6 })) + 8;
    if (doc.y + height > doc.page.height - 72) { doc.addPage(); doc.y = 54; header(); }
    const y = doc.y; let x = left;
    doc.font("Helvetica-Bold").fillColor(INK).text(site.name, x, y, { width: cols[0].w - 6, continued: false });
    doc.font("Helvetica").fillColor(MUTED).text(`${site.state}${hazards ? ` · ${hazards}` : ""}`, { width: cols[0].w - 6 });
    x += cols[0].w;
    doc.font("Helvetica-Bold").fillColor(INK).text(site.index === null ? "—" : site.index.toFixed(1), x, y, { width: cols[1].w - 6 });
    x += cols[1].w;
    for (const task of TASKS) {
      const state = site.tasks.find(t => t.task === task)?.state ?? "UNKNOWN";
      doc.font("Helvetica-Bold").fillColor(STATE_COLOR[state]).text(state, x, y, { width: 56 });
      x += 62;
    }
    doc.font("Helvetica").fillColor(INK).text(reason, x, y, { width: cols[5].w - 6 });
    doc.y = y + height;
    doc.moveTo(left, doc.y - 4).lineTo(left + width, doc.y - 4).lineWidth(0.3).strokeColor(RULE).stroke();
  }

  doc.moveDown(1.2).x = left;
  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(`Policy ${briefing.policyVersion}. Task states come from each site's 6 PM next-day briefing (forecast, NWS alerts, crew reports, HazardCast). Verify conditions on arrival; held tasks stay held until the hazard clears.`, left, doc.y, { width });
  doc.end();
  return done;
}

const pending = new Map<string, Promise<FleetBriefing>>();
/** Builds the fleet briefing for one work day from the per-site briefings already stored. */
export function buildFleetBriefing(store: Store, directory: string, sites: Site[], date: string, now: number): Promise<FleetBriefing> {
  const running = pending.get(date);
  if (running) return running;
  const job = (async () => {
    const known = new Set(sites.map(s => s.id));
    const briefings = store.all<Briefing>("briefing").filter(b => b.localDate === date && known.has(b.siteId));
    const atRiskSites = atRiskFromBriefings(briefings, sites);
    const summary = await summarizeFleet(date, atRiskSites, briefings.length);
    const briefing: FleetBriefing = {
      id: date, localDate: date, generatedAt: new Date(now).toISOString(), summary: summary.text, summaryMode: summary.mode,
      ...(summary.model ? { model: summary.model } : {}), ...(summary.error ? { summaryError: summary.error } : {}),
      totalSites: briefings.length, atRiskSites, policyVersion: POLICY_VERSION,
    };
    await writeFleetPdf(briefing, fleetPdfPath(directory, date));
    store.put("fleet-briefing", date, briefing);
    return briefing;
  })().finally(() => pending.delete(date));
  pending.set(date, job);
  return job;
}

/**
 * The latest work day whose fleet briefing is missing or older than its site briefings.
 * Time zones reach 6 PM at different hours, so a day is rebuilt as western sites brief.
 */
export function dueFleetDate(store: Store, sites: Site[]): string | undefined {
  const known = new Set(sites.map(s => s.id)), dates = new Map<string, number>();
  for (const b of store.all<Briefing>("briefing")) if (known.has(b.siteId)) dates.set(b.localDate, (dates.get(b.localDate) ?? 0) + 1);
  const latest = [...dates.keys()].sort().at(-1);
  if (!latest || pending.has(latest)) return undefined;
  const built = store.get<FleetBriefing>("fleet-briefing", latest);
  if (!built || built.totalSites < dates.get(latest)!) return latest;
  // Rebuild when the 6 PM run replaces early briefings made by "Generate now".
  const newest = Math.max(...store.all<Briefing>("briefing").filter(b => b.localDate === latest).map(b => Date.parse(b.generatedAt)));
  return newest > Date.parse(built.generatedAt) ? latest : undefined;
}
