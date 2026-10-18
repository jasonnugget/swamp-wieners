import { useEffect, useRef, useState } from "react";
import { Bell, CloudLightning, Lightning, Siren, StopCircle } from "@phosphor-icons/react";
import type { UrgentAlert, UrgentKind } from "../../shared/urgent";

const SEEN_KEY = "planit-alerts-seen-v1";
const icons: Record<UrgentKind, typeof Lightning> = { lightning: Lightning, thunderstorm: CloudLightning, "nws-warning": Siren, hold: StopCircle };

// Seen state is tracked by alert id; the demo clock can stand still or rewind, so times cannot order it.
function readSeen(): Set<string> | null {
  try { const raw = localStorage.getItem(SEEN_KEY); return raw ? new Set(JSON.parse(raw) as string[]) : null; } catch { return null; }
}
function writeSeen(ids: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-300))); } catch { /* Read state is a convenience only. */ }
}
const ago = (iso: string, now: number) => {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
};

/** Header bell with a tray of recent urgent alerts; alerts not yet shown in the tray count as unread. */
export default function NotificationTray({ history, active, now, onView }: {
  history: UrgentAlert[] | undefined; active: UrgentAlert[] | undefined; now: string; onView(siteId: string): void;
}) {
  const [open, setOpen] = useState(false);
  const items = history ?? [];
  // First visit: everything already on record counts as seen, so only new arrivals light the badge.
  const [seen, setSeen] = useState<Set<string> | null>(readSeen);
  // Dots mark what was unread when the tray opened, so they survive the open itself.
  const [dotted, setDotted] = useState<Set<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const activeIds = new Set((active ?? []).map(a => a.id));
  const unreadIds = seen ? items.filter(a => !seen.has(a.id)).map(a => a.id) : [];
  const unread = unreadIds.length;

  useEffect(() => {
    if (!seen && history) { const initial = new Set(history.map(a => a.id)); setSeen(initial); writeSeen(initial); }
  }, [seen, history]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  // While the tray is open, arrivals are seen as they land.
  const unreadKey = unreadIds.join("|");
  useEffect(() => {
    if (!open || !seen || !unreadKey) return;
    const next = new Set([...seen, ...unreadKey.split("|")]);
    setDotted(d => new Set([...d, ...unreadKey.split("|")]));
    setSeen(next); writeSeen(next);
  }, [open, seen, unreadKey]);

  return <div className="notification-tray" ref={root}>
    <button className="tray-toggle" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} aria-controls="notification-menu" onClick={() => { if (!open) setDotted(new Set(unreadIds)); setOpen(!open); }}>
      <Bell size={19} weight="light" aria-hidden="true"/>
      {unread > 0 && <span className="tray-count" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div className="tray-menu" id="notification-menu" role="region" aria-label="Notifications">
      <header><strong>Notifications</strong><small>{activeIds.size} active</small></header>
      {items.length ? <ul>{items.map(a => {
        const Icon = icons[a.kind], isNew = dotted.has(a.id), live = activeIds.has(a.id);
        return <li key={a.id} className={`tray-item tray-${a.kind}${live ? " is-active" : ""}`}>
          <button type="button" onClick={() => { setOpen(false); onView(a.siteId); }}>
            <span className="tray-icon"><Icon size={15} weight="fill" aria-hidden="true"/></span>
            <span className="tray-copy">
              <strong>{a.title}</strong>
              <span>{a.detail}</span>
              <small>{ago(a.firedAt, Date.parse(now))} · {live ? "active" : "cleared"}{a.mode !== "live" && a.mode !== "derived" ? ` · ${a.mode}` : ""}</small>
            </span>
            {isNew && <i className="tray-dot" aria-label="New"/>}
          </button>
        </li>;
      })}</ul> : <p className="tray-empty">No alerts yet. Lightning within 10 mi, thunderstorms, severe NWS alerts and new work holds appear here.</p>}
    </div>}
  </div>;
}
