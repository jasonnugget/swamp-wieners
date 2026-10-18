import type { Alert, Decision, Site, Strike } from "./types";
import type { SiteRiskSnapshot } from "./risk";
import { distanceMiles, TASK_LABELS } from "./policy";

export type UrgentKind = "lightning" | "thunderstorm" | "nws-warning" | "hold";
/** An escalation worth interrupting someone for. Ids are stable per underlying event. */
export interface UrgentAlert {
  id: string;
  siteId: string;
  siteName: string;
  kind: UrgentKind;
  title: string;
  detail: string;
  /** When PlanIT first detected it; kept across refreshes. */
  firedAt: string;
  expiresAt: string | null;
  mode: Strike["mode"] | "derived";
}
export type UrgentCandidate = Omit<UrgentAlert, "firedAt">;

export const URGENT_RADIUS_MILES = 10;
const STRIKE_WINDOW_MS = 30 * 60000;
const THUNDERSTORM_CODES = new Set([95, 96, 99]);
const KIND_ORDER: Record<UrgentKind, number> = { lightning: 0, thunderstorm: 1, "nws-warning": 2, hold: 3 };

export function detectUrgentHazards(sites: readonly Site[], input: {
  strikes: Strike[]; alerts: Alert[]; siteRisks: Record<string, SiteRiskSnapshot>; decisions: Record<string, Decision>;
}, now: number): UrgentCandidate[] {
  const found: UrgentCandidate[] = [];
  for (const site of sites) {
    const base = { siteId: site.id, siteName: site.name };
    const nearby = input.strikes
      .filter(s => Date.parse(s.time) <= now && now - Date.parse(s.time) < STRIKE_WINDOW_MS)
      .map(s => ({ strike: s, miles: distanceMiles(site, s) }))
      .filter(s => s.miles <= URGENT_RADIUS_MILES)
      .sort((a, b) => a.miles - b.miles);
    if (nearby.length) {
      // One alert per storm cell approach: keyed by the latest strike so a new strike re-notifies.
      const latest = nearby.reduce((a, b) => Date.parse(b.strike.time) > Date.parse(a.strike.time) ? b : a);
      found.push({ ...base, id: `${site.id}:lightning:${latest.strike.id}`, kind: "lightning",
        title: `Lightning ${nearby[0].miles.toFixed(1)} mi from ${site.name}`,
        detail: `${nearby.length} strike${nearby.length > 1 ? "s" : ""} within ${URGENT_RADIUS_MILES} mi in the last 30 minutes. Stop outdoor work and shelter for 30 minutes after the latest strike.`,
        expiresAt: new Date(Date.parse(latest.strike.time) + STRIKE_WINDOW_MS).toISOString(), mode: latest.strike.mode });
    }
    const siteAlerts = input.alerts.filter(a => a.siteId === site.id && Date.parse(a.expiresAt) > now);
    const storm = siteAlerts.find(a => /thunderstorm|tornado/i.test(a.event ?? a.title));
    const code = input.siteRisks[site.id]?.observation.weather.weatherCode;
    if (storm || (code != null && THUNDERSTORM_CODES.has(code))) {
      found.push({ ...base, id: storm ? `${site.id}:thunderstorm:${storm.id}` : `${site.id}:thunderstorm:wmo-${code}`, kind: "thunderstorm",
        title: `Thunderstorm at ${site.name}`,
        detail: storm ? `${storm.event ?? storm.title} in effect. Move crews to shelter and secure loose materials.`
          : `Current conditions report ${code === 95 ? "a thunderstorm" : "a thunderstorm with hail"} at the site. Move crews to shelter.`,
        expiresAt: storm?.expiresAt ?? null, mode: storm?.mode ?? "live" });
    }
    for (const alert of siteAlerts.filter(a => a.severity >= 7 && a !== storm))
      found.push({ ...base, id: `${site.id}:nws:${alert.id}`, kind: "nws-warning", title: `${alert.event ?? alert.title} · ${site.name}`,
        detail: `${alert.severity >= 10 ? "Extreme" : "Severe"} official alert. Review the NWS source and the site response plan.`, expiresAt: alert.expiresAt, mode: alert.mode });
    // One alert per site; a newly held task changes the id and re-notifies.
    const held = input.decisions[site.id]?.tasks.filter(t => t.state === "HOLD") ?? [];
    if (held.length)
      found.push({ ...base, id: `${site.id}:hold:${held.map(t => t.task).join("+")}`, kind: "hold", title: `Work on hold · ${site.name}`,
        detail: `${held.map(t => TASK_LABELS[t.task]).join(" and ")}: ${held[0].reasons[0] ?? "held under current evidence."}`, expiresAt: null, mode: "derived" });
  }
  return found.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}
