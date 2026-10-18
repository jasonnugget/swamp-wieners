import { useState } from "react";
import { ArrowClockwise, FilePdf, Sparkle } from "@phosphor-icons/react";
import type { Snapshot } from "../../../shared/types";
import { TASK_LABELS } from "../../../shared/policy";
import { siteHazards } from "../../../shared/fleet-briefing";
import { request } from "../../lib/api";

/** Builds or rebuilds the latest fleet briefing PDF from the site briefings stored so far. */
export function FleetGenerateButton({ snapshot, onChange, onError }: { snapshot: Snapshot; onChange(): void; onError(message: string): void }) {
  const [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true);
    try { await request("/briefings/fleet/generate", {}); onChange(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return <button className="secondary fleet-generate" type="button" disabled={busy} onClick={() => void generate()} title="Brief every site for tomorrow using current conditions">
    <ArrowClockwise weight="light" size={14} aria-hidden="true"/>{busy ? "Generating…" : snapshot.fleetBriefings?.length ? "Regenerate PDF" : "Generate now"}
  </button>;
}

/** Fleet-wide next-day briefing cards with downloadable PDFs; renders nothing until one exists. */
export default function FleetBriefings({ snapshot, onSelectSite }: { snapshot: Snapshot; onSelectSite(id: string): void }) {
  const [open, setOpen] = useState<string | null>(null);
  const briefings = snapshot.fleetBriefings ?? [];
  if (!briefings.length) return null;
  return <>
    {briefings.map((b, i) => {
      const held = b.atRiskSites.filter(s => s.tasks.some(t => t.state === "HOLD")).length;
      const expanded = open === b.id || (open === null && i === 0);
      return <article key={b.id} className="panel fleet-card" data-testid="fleet-briefing">
        <header>
          <div>
            <span className="eyebrow">WORK DAY</span>
            <h3>{b.localDate}</h3>
          </div>
          <dl className="fleet-stats">
            <div><dt>At risk</dt><dd>{b.atRiskSites.length}<small>/{b.totalSites}</small></dd></div>
            <div><dt>On hold</dt><dd className={held ? "is-hold" : undefined}>{held}</dd></div>
          </dl>
        </header>
        <div className="fleet-summary">
          <span className={`fleet-mode fleet-mode-${b.summaryMode}`}>{b.summaryMode === "gemini" ? <><Sparkle size={12} weight="fill" aria-hidden="true"/>AI summary · {b.model}</> : "Template summary"}</span>
          <p>{b.summary}</p>
          {b.summaryMode === "template" && b.summaryError && snapshot.geminiConfigured && <small className="muted">Gemini unavailable: {b.summaryError}</small>}
        </div>
        {expanded && b.atRiskSites.length > 0 && <div className="fleet-table-wrap"><table className="fleet-table">
          <thead><tr><th scope="col">Site</th><th scope="col">Index</th>{b.atRiskSites[0].tasks.map(t => <th scope="col" key={t.task}>{TASK_LABELS[t.task].split(" ").at(-1)}</th>)}<th scope="col">Key reason</th></tr></thead>
          <tbody>{b.atRiskSites.map(s => <tr key={s.siteId}>
            <th scope="row"><button type="button" className="text-button" onClick={() => onSelectSite(s.siteId)}>{s.name}</button><small>{s.state}{siteHazards(s).length ? ` · ${siteHazards(s).join(", ")}` : ""}</small></th>
            <td>{s.index?.toFixed(1) ?? "—"}</td>
            {s.tasks.map(t => <td key={t.task}><span className={`task-state state-${t.state.toLowerCase()}`}>{t.state}</span></td>)}
            <td className="fleet-reason">{s.reasons[0] ?? ""}</td>
          </tr>)}</tbody>
        </table></div>}
        <footer>
          {b.atRiskSites.length > 0 && <button type="button" className="text-button" aria-expanded={expanded} onClick={() => setOpen(expanded ? "" : b.id)}>{expanded ? "Hide site list" : `Show ${b.atRiskSites.length} at-risk sites`}</button>}
          <span className="muted">Generated {new Date(b.generatedAt).toLocaleString()} · {b.policyVersion}</span>
          <a className="button-link" href={`/api/briefings/fleet/${b.localDate}/pdf`} download><FilePdf weight="light" size={15} aria-hidden="true"/>Download PDF</a>
        </footer>
      </article>;
    })}
  </>;
}
