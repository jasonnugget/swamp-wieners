import type { ReactNode } from "react";
import { DownloadSimple as Download } from "@phosphor-icons/react";
import type { Briefing, Site } from "../../../shared/types";
import { TASK_LABELS } from "../../../shared/policy";

const severity = (b: Briefing) => b.decision.tasks.reduce((n, t) => n + (t.state === "HOLD" ? 2 : t.state === "RESTRICTED" ? 1 : 0), 0);

function download(b: Briefing) {
  const blob = new Blob([b.text], { type: "text/plain" }), url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url;
  a.download = `threshold-${b.siteId}-${b.localDate}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Every site's next-day briefing in one list, grouped by work day; held and restricted sites first. */
export default function SiteBriefingList({ briefings, sites, badge }: { briefings: Briefing[]; sites: readonly Site[]; badge(index: number | null): ReactNode }) {
  const byId = new Map(sites.map(s => [s.id, s]));
  const days = [...new Set(briefings.map(b => b.localDate))].sort().reverse();
  return <>{days.map(day => {
    const rows = briefings.filter(b => b.localDate === day && byId.has(b.siteId))
      .sort((a, b) => severity(b) - severity(a) || (b.decision.index ?? -1) - (a.decision.index ?? -1) || byId.get(a.siteId)!.name.localeCompare(byId.get(b.siteId)!.name));
    return <section key={day} className="panel site-briefing-day" aria-label={`Site briefings for ${day}`}>
      <header>
        <span className="eyebrow">SITE BRIEFINGS · {day}</span>
        <small className="muted">{rows.length} sites{rows.some(b => b.early) ? " · some made early by Generate now, replaced at 6 PM local" : ""}</small>
      </header>
      <ul>{rows.map(b => {
        const site = byId.get(b.siteId)!;
        return <li key={b.id}>
          <details>
            <summary>
              <span className="site-briefing-name"><strong>{site.name}</strong><small>{site.state}{b.early ? " · early" : ""}</small></span>
              <span className="site-briefing-tasks">{b.decision.tasks.map(t => <span key={t.task} className={`task-state state-${t.state.toLowerCase()}`} title={TASK_LABELS[t.task]}>{TASK_LABELS[t.task].split(" ").at(-1)} · {t.state}</span>)}</span>
              {badge(b.decision.index)}
            </summary>
            <pre>{b.text}</pre>
            <div className="briefing-meta">
              <span>{b.reportIds.length} unresolved reports carried forward · {b.decision.policyVersion}</span>
              <button className="secondary" type="button" onClick={() => download(b)}><Download weight="light" aria-hidden="true" size={14}/>Download briefing</button>
            </div>
          </details>
        </li>;
      })}</ul>
    </section>;
  })}</>;
}
