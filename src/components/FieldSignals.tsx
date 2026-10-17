'use client';
import { useMemo, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { Category, Site, Task, TaskState } from "../../shared/types";
import { TASK_LABELS } from "../../shared/policy";
import type { SiteRiskSnapshot } from "../../shared/risk";
import "../styles/field-signals.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);
const hazards: [Category, string][] = [["weather", "Weather"], ["heat", "Heat"], ["lightning", "Lightning"], ["flood", "Flood"], ["wildfire", "Wildfire"], ["soil", "Soil"], ["wildlife", "Wildlife"]];
type RiskData = { sites: Site[]; risks: Record<string, SiteRiskSnapshot> };

export function SignalFigure({ label, paused, children }: { label: string; paused: boolean; children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      if (paused) return;
      gsap.from(".signal-orbit", { opacity: 0, rotation: -45, scale: .9, transformOrigin: "210px 210px", duration: 1.6, stagger: .08, ease: "power3.out", clearProps: "opacity,transform", scrollTrigger: { trigger: root.current, start: "top 88%", once: true } });
      gsap.from(".signal-rise", { scaleY: 0, transformOrigin: "center bottom", duration: 1.2, stagger: .025, ease: "power3.out", clearProps: "transform", scrollTrigger: { trigger: root.current, start: "top 85%", once: true } });
      gsap.from(".outlook-line", { opacity: 0, y: 15, duration: 1.4, ease: "power3.out", clearProps: "opacity,transform", scrollTrigger: { trigger: root.current, start: "top 85%", once: true } });
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
    <svg className="signal-dial" viewBox="0 0 420 398" role="img" aria-label={`${active.label}: ${active.mean === null ? "unknown" : active.mean.toFixed(1) + " out of 10"}, mean of ${active.count} known plants`}>
      {profile.map((p, i) => <g className="signal-orbit" key={p.hazard} data-active={p.hazard === selected} data-unknown={p.mean === null}>
        <circle cx="210" cy="210" r={174 - i * 18} pathLength="100" transform="rotate(135 210 210)" className="dial-track" strokeDasharray="75 25"/>
        {p.mean !== null && <circle cx="210" cy="210" r={174 - i * 18} pathLength="100" transform="rotate(135 210 210)" className="dial-value" strokeDasharray={`${p.mean * 7.5} 100`}/>}
      </g>)}
      <text x="210" y="204" className="dial-number" textAnchor="middle">{active.mean === null ? "?" : active.mean.toFixed(1)}</text>
      <text x="210" y="230" className="dial-label" textAnchor="middle">{active.label} / 10</text>
      <text x="210" y="360" className="dial-scale" textAnchor="middle">SEVEN CHANNELS · 0–10</text>
    </svg>
    <div className="signal-hazards">{profile.map(p => <button key={p.hazard} type="button" aria-pressed={selected === p.hazard} onClick={() => setSelected(p.hazard)} aria-label={`${p.label}: ${p.mean === null ? "unknown" : p.mean.toFixed(1) + " out of 10"}, ${p.count} of ${sites.length} sites`}><i aria-hidden="true" data-unknown={p.mean === null}/><span>{p.label}</span><strong>{p.mean === null ? "?" : p.mean.toFixed(1)}</strong><small>{p.count}/{sites.length} sites</small></button>)}</div>
    <p className="signal-footnote">Current backend scores. Each mean excludes unknown and stale observations. Select a channel to inspect its coverage.</p>
  </SignalFigure>;
}


export function WorkReadiness({ sites, risks, paused }: RiskData & { paused: boolean }) {
  const [task, setTask] = useState<Task>("installation");
  const [hovered, setHovered] = useState<string | null>(null);
  const states: TaskState[] = ["AVAILABLE", "RESTRICTED", "HOLD", "UNKNOWN"];
  const rows = sites.map(site => ({ site, state: risks[site.id]?.tasks.find(t => t.task === task)?.state ?? "UNKNOWN" }));
  const counts = Object.fromEntries(states.map(state => [state, rows.filter(r => r.state === state).length]));
  const active = rows.find(r => r.site.id === hovered);
  return <SignalFigure label="Automatic site work-readiness board" paused={paused}>
    <figcaption><span>03 / Plan the work</span><span>{sites.length} plants · work decisions</span></figcaption>
    <div className="signal-readout"><strong>{counts.AVAILABLE}</strong><span>Available for {TASK_LABELS[task].toLowerCase()}<br/><small>{counts.HOLD} on hold · {counts.RESTRICTED} restricted · {counts.UNKNOWN} unknown</small></span></div>
    <div className="signal-task-tabs" role="group" aria-label="Compare work types">{(["mobilization", "installation", "preparation"] as Task[]).map(t => <button type="button" key={t} aria-pressed={task === t} onClick={() => { setTask(t); setHovered(null); }}>{TASK_LABELS[t]}</button>)}</div>
    <div className="signal-board" role="img" aria-label={`${TASK_LABELS[task]}: ${counts.AVAILABLE} available, ${counts.RESTRICTED} restricted, ${counts.HOLD} hold, ${counts.UNKNOWN} unknown`} onPointerLeave={() => setHovered(null)}>{rows.map(({ site, state }) => <span className="signal-point" key={site.id} data-state={state} onPointerEnter={() => setHovered(site.id)} title={`${site.name} · ${state}`} />)}</div>
    <div className="signal-board-legend">{states.map(state => <span key={state}><i data-state={state}/>{counts[state]} {state.toLowerCase()}</span>)}</div>
    <p className="signal-board-focus">{active ? `${active.site.name} · ${active.state}` : "One tile = one plant. Hover to identify it."}</p>
    <p className="signal-footnote">The same work decisions as the atlas, updated as environmental evidence arrives. Unknown is not available, and active holds remain independent of the risk score.</p>
  </SignalFigure>;
}
