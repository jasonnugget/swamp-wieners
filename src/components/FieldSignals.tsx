'use client';
import { useMemo, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { Category, HazardReport, Site } from "../../shared/types";
import type { SiteRiskSnapshot } from "../../shared/risk";
import "../styles/field-signals.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);
const hazards: [Category, string][] = [["weather", "Weather"], ["heat", "Heat"], ["lightning", "Lightning"], ["flood", "Flood"], ["wildfire", "Wildfire"], ["soil", "Soil"], ["wildlife", "Wildlife"]];
type RiskData = { sites: Site[]; risks: Record<string, SiteRiskSnapshot> };

function SignalFigure({ label, paused, children }: { label: string; paused: boolean; children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      if (paused) return;
      gsap.from(".signal-reveal", { scaleX: 0, duration: 1.25, stagger: .06, ease: "power3.out", scrollTrigger: { trigger: root.current, start: "top 88%", once: true } });
      gsap.from(".signal-point", { opacity: 0, scale: .25, transformOrigin: "center", duration: .8, stagger: .006, ease: "power3.out", clearProps: "opacity,transform", scrollTrigger: { trigger: root.current, start: "top 85%", once: true } });
    });
    return () => media.revert();
  }, { scope: root, dependencies: [paused], revertOnUpdate: true });
  return <figure ref={root} className="field-signal" aria-label={label} data-paused={paused}>{children}</figure>;
}

export function HazardProfile({ sites, risks, paused }: RiskData & { paused: boolean }) {
  const [selected, setSelected] = useState<Category>("heat");
  const profile = useMemo(() => hazards.map(([hazard, label]) => {
    const known = sites.flatMap(site => {
      const r = risks[site.id];
      const channel = r?.channels.find(c => c.hazard === hazard);
      return r && !r.observation.provenance.stale && channel?.score != null ? [channel.score] : [];
    });
    return { hazard, label, count: known.length, mean: known.length ? known.reduce((a, b) => a + b, 0) / known.length : null };
  }), [sites, risks]);
  const active = profile.find(p => p.hazard === selected)!;
  return <SignalFigure label="National hazard profile" paused={paused}>
    <figcaption><span>01 / Environmental signals</span><span>{sites.length} plants</span></figcaption>
    <div className="signal-readout" aria-live="polite"><strong>{active.mean === null ? "?" : active.mean.toFixed(1)}<small> / 10</small></strong><span>{active.label}<br/><small>Mean of {active.count} known sites</small></span></div>
    <div className="signal-hazards">{profile.map(p => <button key={p.hazard} type="button" aria-pressed={selected === p.hazard} onClick={() => setSelected(p.hazard)} aria-label={`${p.label}: ${p.mean === null ? "unknown" : p.mean.toFixed(1) + " out of 10"}, ${p.count} of ${sites.length} sites`}><span>{p.label}</span><span className="signal-track signal-reveal" data-unknown={p.mean === null}><i className="signal-bar" style={{ transform: `scaleX(${(p.mean ?? 0) / 10})` }}/></span><strong>{p.mean === null ? "?" : p.mean.toFixed(1)}</strong><small>{p.count}/{sites.length}</small></button>)}</div>
    <p className="signal-footnote">Current backend scores. Each mean excludes unknown and stale observations. Select a channel to inspect its coverage.</p>
  </SignalFigure>;
}

export function RiskCoverage({ sites, risks, paused, selectedSite, onSelect }: RiskData & { paused: boolean; selectedSite: string; onSelect: (id: string) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const current = sites.find(s => s.id === (hovered ?? selectedSite)) ?? sites[0];
  const risk = current ? risks[current.id] : undefined;
  const points = sites.flatMap(site => {
    const r = risks[site.id];
    return r?.risk != null && !r.observation.provenance.stale ? [{ site, risk: r }] : [];
  });
  return <SignalFigure label="Site risk compared with source coverage" paused={paused}>
    <figcaption><span>02 / Risk needs context</span><span>{points.length} scored sites</span></figcaption>
    <div className="signal-readout"><strong>{risk?.risk == null || risk.observation.provenance.stale ? "?" : risk.risk.toFixed(1)}<small> / 10</small></strong><span>{current?.name ?? "No site available"}<br/><small>{risk ? `${risk.observation.coverage.percent.toFixed(0)}% source coverage${risk.observation.provenance.stale ? " · stale" : ""}` : "Evidence unavailable"}</small></span></div>
    <div className="signal-axes"><span>Risk / 10 ↑</span><span>Source coverage →</span></div>
    <svg className="signal-scatter" viewBox="0 0 480 270" role="img" aria-label={`Risk from 0 to 10 plotted against coverage from 0 to 100 percent. ${points.length} known sites; ${sites.length - points.length} unknown or stale sites omitted.`} onPointerLeave={() => setHovered(null)}>
      <rect x="38" y="15" width="206" height="220" className="signal-low-coverage"/>
      {[0, 2, 4, 6, 8, 10].map(n => <g key={n}><line x1="38" x2="450" y1={235 - n * 22} y2={235 - n * 22}/><text x="22" y={239 - n * 22}>{n}</text></g>)}
      {[0, 25, 50, 75, 100].map(n => <g key={n}><line x1={38 + n * 4.12} x2={38 + n * 4.12} y1="15" y2="235"/><text x={38 + n * 4.12} y="257" textAnchor="middle">{n}%</text></g>)}
      <text x="48" y="29" className="signal-axis-note">LESS OBSERVED</text>
      {points.map(({ site, risk: r }) => <circle key={site.id} className="signal-point" data-selected={current?.id === site.id} cx={38 + r.observation.coverage.percent * 4.12} cy={235 - r.risk! * 22} r={current?.id === site.id ? 6 : 3.2} onPointerEnter={() => setHovered(site.id)} onClick={() => onSelect(site.id)}><title>{site.name}: {r.risk!.toFixed(1)}/10, {r.observation.coverage.percent.toFixed(0)}% coverage</title></circle>)}
      {risk?.risk != null && !risk.observation.provenance.stale && <circle className="signal-selected-ring" cx={38 + risk.observation.coverage.percent * 4.12} cy={235 - risk.risk * 22} r="10"/>}
    </svg>
    <label className="signal-site-select">Inspect a plant<select value={selectedSite} onChange={e => { setHovered(null); onSelect(e.target.value); }}>{sites.map(s => <option value={s.id} key={s.id}>{s.name} · {s.state}</option>)}</select></label>
    <p className="signal-footnote">Higher means greater risk. Further right means more source data. {sites.length - points.length} unknown or stale sites are omitted, never plotted as safe. Hover a point or choose a plant.</p>
  </SignalFigure>;
}

export function CrewCarryover({ reports, paused }: { reports: HazardReport[]; paused: boolean }) {
  const rows = hazards.map(([category, label]) => ({ category, label, open: reports.filter(r => r.category === category && r.status === "open").length, resolved: reports.filter(r => r.category === category && r.status === "resolved").length }));
  const open = reports.filter(r => r.status === "open").length;
  const largest = Math.max(1, ...rows.map(r => r.open + r.resolved));
  const latest = reports.reduce<string | null>((last, r) => !last || Date.parse(r.createdAt) > Date.parse(last) ? r.createdAt : last, null);
  return <SignalFigure label="Crew report handoff by hazard" paused={paused}>
    <figcaption><span>03 / Field knowledge</span><span>Stored crew reports</span></figcaption>
    <div className="signal-readout"><strong>{open}</strong><span>Unresolved reports<br/><small>{reports.length} total · {reports.length - open} resolved</small></span></div>
    <div className="signal-report-legend"><span><i/>Open</span><span><i/>Resolved</span></div>
    <div className="signal-reports">{rows.map(row => <div key={row.category}><span>{row.label}</span><span className="signal-report-track signal-reveal"><i className="signal-bar" style={{ transform: `scaleX(${(row.open + row.resolved) / largest})` }}><b style={{ width: `${row.open + row.resolved ? row.open / (row.open + row.resolved) * 100 : 0}%` }}/></i></span><strong>{row.open}<small> / {row.resolved}</small></strong></div>)}</div>
    <p className="signal-footnote">{reports.length ? `Latest submission: ${latest ? new Date(latest).toLocaleString() : "unknown"}. Counts cover all stored history, including demo reports. Resolution retains the record.` : "No crew reports are stored yet. A submitted report will appear here after the workspace updates."} Report counts are not hazard probabilities.</p>
  </SignalFigure>;
}
