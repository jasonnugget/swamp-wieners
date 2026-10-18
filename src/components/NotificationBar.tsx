import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CaretDown, CloudLightning, Lightning, Siren, StopCircle, X } from "@phosphor-icons/react";
import type { UrgentAlert, UrgentKind } from "../../shared/urgent";

const STORAGE_KEY = "planit-dismissed-alerts";
const icons: Record<UrgentKind, typeof Lightning> = { lightning: Lightning, thunderstorm: CloudLightning, "nws-warning": Siren, hold: StopCircle };
const kindLabel: Record<UrgentKind, string> = { lightning: "LIGHTNING ≤10 MI", thunderstorm: "THUNDERSTORM", "nws-warning": "OFFICIAL WARNING", hold: "WORK HOLD" };

function readDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function writeDismissed(ids: string[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-200))); } catch { /* Dismissal is a convenience only. */ }
}
const ago = (iso: string, now: number) => {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};

/** Interrupting bar for escalations; shown on every page until dismissed or cleared. */
export default function NotificationBar({ alerts: incoming, now, onView }: { alerts: UrgentAlert[] | undefined; now: string; onView(siteId: string): void }) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [expanded, setExpanded] = useState(false);
  const [fresh, setFresh] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  // Holds already in effect when the page opened are the status quo, not news; new ones interrupt.
  const baseline = useRef<Set<string> | null>(null);
  if (incoming && !baseline.current) baseline.current = new Set(incoming.filter(a => a.kind === "hold").map(a => a.id));
  const alerts = useMemo(() => (incoming ?? []).filter(a => a.kind !== "hold" || !baseline.current?.has(a.id)), [incoming]);
  // Newest first; holds are informative, so new lightning or storms lead.
  const visible = useMemo(() => alerts.filter(a => !dismissed.includes(a.id))
    .sort((a, b) => Number(b.kind !== "hold") - Number(a.kind !== "hold") || Date.parse(b.firedAt) - Date.parse(a.firedAt)), [alerts, dismissed]);
  useEffect(() => {
    const ids = new Set(alerts.map(a => a.id));
    if (seen.current && [...ids].some(id => !seen.current!.has(id))) {
      setFresh(true);
      const timer = setTimeout(() => setFresh(false), 1200);
      seen.current = ids;
      return () => clearTimeout(timer);
    }
    seen.current = ids;
  }, [alerts]);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = visible.length ? `(${visible.length}) ${base}` : base;
  }, [visible.length]);
  if (!visible.length) return null;
  const [lead, ...rest] = visible, Icon = icons[lead.kind];
  function dismiss(ids: string[]) { const next = [...dismissed, ...ids]; setDismissed(next); writeDismissed(next); if (ids.length > 1) setExpanded(false); }

  return <aside className={`urgent-bar urgent-${lead.kind}${fresh ? " is-fresh" : ""}`} role="alert" aria-live="assertive" data-testid="urgent-bar">
    <div className="urgent-lead">
      <span className="urgent-icon"><Icon size={20} weight="fill" aria-hidden="true"/></span>
      <div className="urgent-copy">
        <span className="urgent-kind">{kindLabel[lead.kind]} · {ago(lead.firedAt, Date.parse(now))}</span>
        <strong>{lead.title}</strong>
        <p>{lead.detail}</p>
      </div>
      <div className="urgent-actions">
        <button type="button" className="urgent-view" onClick={() => onView(lead.siteId)}>View site<ArrowUpRight size={14} aria-hidden="true"/></button>
        <button type="button" className="urgent-close" aria-label="Dismiss alert" onClick={() => dismiss([lead.id])}><X size={16} aria-hidden="true"/></button>
      </div>
    </div>
    {rest.length > 0 && <>
      <div className="urgent-more-row">
        <button type="button" className="urgent-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>+{rest.length} more alert{rest.length > 1 ? "s" : ""}<CaretDown size={12} aria-hidden="true"/></button>
        <button type="button" className="urgent-more" onClick={() => dismiss(visible.map(a => a.id))}>Dismiss all</button>
      </div>
      {expanded && <ul className="urgent-list">{rest.slice(0, 30).map(a => {
        const ItemIcon = icons[a.kind];
        return <li key={a.id}><ItemIcon size={14} weight="fill" aria-hidden="true"/><button type="button" onClick={() => onView(a.siteId)}>{a.title}</button><small>{ago(a.firedAt, Date.parse(now))}</small></li>;
      })}</ul>}
    </>}
  </aside>;
}
