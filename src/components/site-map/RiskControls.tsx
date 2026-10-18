import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CaretRight as ChevronRight, Pause, Play, ArrowClockwise as RefreshCw, MagnifyingGlass as Search, X, SidebarSimple, Thermometer, Wind, CloudRain, SunHorizon, Lightning, Waves, Flame, Mountains, PawPrint, ShieldCheck, CloudLightning, ClockCountdown } from "@phosphor-icons/react";
import { EvidenceMotion } from "./AtlasMotion";
import { ATLAS_LAYERS, atlasValue, atlasColor, rankSites, type RiskLayer } from "../../../shared/atlas";
import type { HazardReport, Site } from "../../../shared/types";
import type { SafetyOverride } from "../../../shared/risk";
import { TASK_LABELS } from "../../../shared/policy";
import type { MapRegion } from "../../../shared/weather";
import type { useRiskAtlas } from "../../lib/useRiskAtlas";
import ObservationDetails from "./ObservationDetails";
import SourceDetails from "./SourceDetails";
const SiteSimulation = lazy(() => import("../../features/site-simulation/SiteSimulation"));

const layerIcons = { risk: ShieldCheck, temperature: Thermometer, heat: SunHorizon, wind: Wind, rain: CloudRain, weather: CloudLightning, soil: Mountains, flood: Waves, wildfire: Flame, lightning: Lightning, wildlife: PawPrint };
const names: Record<string, string> = { heat: "Heat", weather: "Weather", soil: "Soil", flood: "Flood", wildfire: "Wildfire", lightning: "Lightning", wildlife: "Wildlife" };
function AllClear({ override }: { override: SafetyOverride }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(override.expiresAt!) - now) / 1000));
  return <p>All-clear: <time data-testid="all-clear">{`${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`}</time>{seconds === 0 && " · awaiting backend confirmation"}</p>;
}
export default function RiskControls({ data, currentData, showTimeline, sites, layer, hour, region, selected, reducedMotion, onLayer, onHour, onRegion, onSelect, inspectorOpen, onInspector, reports = [] }: {
  reports?: HazardReport[];
  inspectorOpen: boolean; onInspector(open: boolean): void;
  data: ReturnType<typeof useRiskAtlas>; currentData: ReturnType<typeof useRiskAtlas>; showTimeline: boolean; sites: Site[]; layer: RiskLayer; hour: number; region: MapRegion; selected: string; reducedMotion: boolean;
  onLayer(layer: RiskLayer): void; onHour(hour: number): void; onRegion(region: MapRegion): void; onSelect(id: string): void;
}) {
  const panel = useRef<HTMLElement>(null), showInspector = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false), [search, setSearch] = useState("");
  const [view, setView] = useState<"overview" | "conditions" | "sources">("overview");
  const [simulationOpen, setSimulationOpen] = useState(false);
  const simulationButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    document.dispatchEvent(new CustomEvent("planit:site-simulation", { detail: simulationOpen }));
    return () => { document.dispatchEvent(new CustomEvent("planit:site-simulation", { detail: false })); };
  }, [simulationOpen]);
  useEffect(() => { if (reducedMotion || !showTimeline) setPlaying(false); }, [reducedMotion, showTimeline]);
  useEffect(() => {
    if (!showTimeline || !playing || reducedMotion || data.loading) return;
    const timer = setTimeout(() => { if (!document.hidden) onHour(hour >= 72 ? 0 : hour + 3); }, 2000);
    return () => clearTimeout(timer);
  }, [showTimeline, playing, reducedMotion, data.loading, hour, onHour]);
  const atlas = data.atlas, entry = atlas?.sites.find(p => p.site.id === selected), r = entry?.snapshot;
  const site = sites.find(s => s.id === selected);
  const value = atlasValue(r, layer), matches = search.trim() ? sites.filter(p => `${p.name} ${p.state} ${p.id}`.toLowerCase().includes(search.toLowerCase())).slice(0, 6) : [];
  const network = useMemo(() => {
    const frames = currentData.atlas?.sites ?? [], risks = Object.fromEntries(frames.map(p => [p.site.id, p.snapshot]));
    return {
      holds: frames.filter(p => p.snapshot.tasks.some(t => t.state === "HOLD")).length,
      limited: frames.filter(p => p.snapshot.risk === null || p.snapshot.confidence < 0.5 || p.snapshot.observation.coverage.percent < 50).length,
      priority: rankSites(frames.map(p => p.site), risks).slice(0, 3).map(site => ({ site, risk: risks[site.id] })),
    };
  }, [currentData.atlas]);
  return <>
    <div className="atlas-layer-bar" role="group" aria-label="Environmental layers">{(Object.keys(ATLAS_LAYERS) as RiskLayer[]).map(id => <button type="button" key={id} aria-label={ATLAS_LAYERS[id].name} aria-pressed={layer === id} data-kind={["temperature", "wind", "rain"].includes(id) ? "measurement" : "risk"} onClick={() => onLayer(id)}>{(() => { const Icon = layerIcons[id]; return <Icon size={17} aria-hidden="true"/>; })()}<span>{ATLAS_LAYERS[id].name}</span></button>)}</div>
    <div className="atlas-regions" role="group" aria-label="Map regions">{([["mainland", "Lower 48"], ["alaska", "Alaska"], ["hawaii", "Hawaii"], ["all", "All US"]] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={region === id} onClick={() => onRegion(id)}>{label}</button>)}</div>
    <div className="atlas-network-status" aria-label="Network status" aria-live="polite"><span><i/>{sites.length} plants</span><span>{network.holds} stop-work</span><span>{network.limited} need verification</span></div>
    <button type="button" ref={showInspector} className="atlas-inspector-open" aria-label="Show site details" aria-expanded={inspectorOpen} hidden={inspectorOpen} aria-controls="atlas-site-details" onClick={() => { onInspector(true); requestAnimationFrame(() => panel.current?.parentElement?.querySelector<HTMLButtonElement>(".atlas-inspector-close")?.focus()); }}><SidebarSimple size={18} aria-hidden="true"/>Site details</button>
    <div className="atlas-inspector-shell" data-open={inspectorOpen} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onInspector(false); requestAnimationFrame(() => showInspector.current?.focus()); } }} inert={!inspectorOpen}>
      <button type="button" className="atlas-inspector-close" aria-label="Hide site details" onClick={() => { onInspector(false); requestAnimationFrame(() => showInspector.current?.focus()); }}><X size={17} aria-hidden="true"/></button>
    <aside id="atlas-site-details" ref={panel} className="atlas-inspector" aria-label="Site risk inspection" aria-busy={data.loading}>
      <EvidenceMotion root={panel} view={view}/>
      <div className="atlas-inspector-top"><span>{hour === 0 ? "CURRENT SITE RISK" : `FORECAST · +${hour} HOURS`}</span><button type="button" onClick={data.refresh} disabled={data.loading} aria-label="Refresh risk atlas"><RefreshCw size={14} aria-hidden="true" className={data.loading ? "spin" : ""}/>{data.loading ? "Syncing…" : "Refresh"}</button></div>
      <div className="atlas-search"><Search size={15} aria-hidden="true"/><label className="atlas-search-label" htmlFor="atlas-place-search">Find a site</label><input id="atlas-place-search" type="search" value={search} placeholder="e.g., Turkey Point or FL…" name="atlas-site-search" autoComplete="off" onChange={e => setSearch(e.target.value)} />{matches.length > 0 && <div className="atlas-search-results">{matches.map(p => <button type="button" key={p.id} onClick={() => { onSelect(p.id); setSearch(""); }}>{p.name}</button>)}</div>}</div>
      <div className="atlas-site-heading"><p className="atlas-site-id">{site ? `${site.state} / EIA ${site.id}` : "SITE RECORD"}</p><h2 className="atlas-location-title">{site?.name ?? "Select a site"}</h2><p className="atlas-coordinate">{site ? `${site.county}, ${site.state} · ${site.capacityMw.toLocaleString()} MW` : "No frame available"}</p></div>
      <button ref={simulationButton} type="button" className="site-simulation-launch" onClick={() => { setPlaying(false); setSimulationOpen(true); }}>Open 3D simulation</button>
      <div className="atlas-risk-hero"><div><span>Composite site risk</span><strong data-testid="atlas-risk">{r?.risk == null ? "Unknown" : <>{r.risk.toFixed(1)}<small> / 10</small></>}</strong></div><div className="atlas-risk-mark" style={{ borderColor: atlasColor(r?.risk) }} aria-hidden="true"><span style={{ background: atlasColor(r?.risk) }}/></div></div>
      <div className="atlas-layer-reading" data-layer={layer}><span>{hour > 0 ? "Forecast value" : "Map layer"} · {ATLAS_LAYERS[layer].name}{layer === "wind" && value !== null ? r?.observation.weather.gustMph === null ? " · sustained" : " · gust" : ""}</span><strong data-testid="atlas-layer-value">{value == null ? "?" : value.toFixed(1)}<small>{ATLAS_LAYERS[layer].unit}</small></strong>{value === null && <p>Unknown / no data</p>}</div>
      <dl className="atlas-metrics"><div><dt>Data coverage</dt><dd data-testid="atlas-coverage">{r ? `${r.observation.coverage.percent.toFixed(0)}%` : "Unknown"}</dd><small>{r ? `${r.observation.coverage.available} of ${r.observation.coverage.expected} primary inputs` : "Waiting for inputs"}</small></div><div><dt>Evidence confidence</dt><dd>{r ? `${(r.confidence * 100).toFixed(0)}%` : "Unknown"}</dd><small>{r && r.confidence < 0.5 ? "LOW CONFIDENCE" : "Screening evidence"}</small></div></dl>
      {!!r?.activeOverrides.length && <section className="atlas-overrides" aria-label="Active policy overrides">{r.activeOverrides.map(o => <div key={o.id}><strong>{o.state === "HOLD" ? "STOP WORK" : "RESTRICTED"}</strong><p>{o.reason}</p>{o.source === "lightning" && r.observation.lightning.nearestStrikeMiles !== null && <p>Detected strike {r.observation.lightning.nearestStrikeMiles.toFixed(1)} miles away.</p>}{hour === 0 && o.expiresAt && o.source === "lightning" && <AllClear override={o}/>}</div>)}</section>}
      <div className="atlas-detail-views" role="group" aria-label="Site detail views">{([ ["overview", "Overview"], ["conditions", "Conditions"], ["sources", "Sources"] ] as const).map(([id, label]) => <button key={id} type="button" aria-label={label} aria-pressed={view === id} onClick={() => setView(id)}>{label}{id === "conditions" && <small aria-hidden="true">34</small>}</button>)}</div>
      <div hidden={view !== "overview"} className="atlas-detail-content">
        <section className="atlas-drivers"><span className="atlas-section-label">Primary driver</span><p><strong>{r?.explanation.primary ? r.explanation.primary.hazard === "lightning" && r.observation.lightning.evidenceMode === "FORECAST" ? "Forecast lightning potential" : names[r.explanation.primary.hazard] : "Insufficient evidence"}</strong></p><p>Compounding: {r?.explanation.compounding.filter(c => c.strength > 0).map(c => names[c.hazard]).join(", ") || "None established"}</p></section>
        <div className="atlas-channels" aria-label="Hazard channels">{r?.channels.map(c => <details key={c.hazard}><summary><span>{names[c.hazard]}</span><span className="atlas-channel-meter" aria-hidden="true"><i style={{ width: `${(c.score ?? 0) * 10}%`, background: atlasColor(c.score) }}/></span><strong data-testid={`channel-${c.hazard}`}>{c.score === null ? "Unknown" : c.score.toFixed(1)}</strong><ChevronRight size={12} aria-hidden="true"/></summary><div className="atlas-channel-evidence"><p>Confidence {(c.confidence * 100).toFixed(0)}%</p>{c.evidence.map((e, i) => <p key={i}>{e}</p>)}{c.factors.filter(f => f.score !== null).map((f, i) => <p key={`${f.key}:${i}`}>{f.key}: {f.score?.toFixed(1)} · {f.source} · {f.kind}</p>)}</div></details>)}</div>
        <section className="atlas-work-decisions"><h3>Work decisions</h3><dl className="atlas-tasks" aria-label="Task decisions">{r?.tasks.map(t => <div key={t.task}><dt>{TASK_LABELS[t.task]}</dt><dd data-state={t.state}>{t.state}</dd></div>)}</dl></section>
        <section className="atlas-priorities"><div className="atlas-section-heading"><h3>Review next</h3><ArrowUpRight size={15} aria-hidden="true"/></div>{network.priority.map(({ site, risk }) => <button type="button" key={site.id} onClick={() => onSelect(site.id)}><span>{site.name}<small>{site.state} · {risk.observation.coverage.percent.toFixed(0)}% coverage{risk.tasks.some(t => t.state === "HOLD") ? " · STOP WORK" : ""}</small></span><strong>{risk.risk?.toFixed(1) ?? "?"}</strong></button>)}</section>
      </div>
      <div hidden={view !== "conditions"} className="atlas-detail-content">{r && <ObservationDetails observation={r.observation} timezone={site?.timezone} completion={entry?.completion}/>}</div>
      <div hidden={view !== "sources"} className="atlas-detail-content atlas-sources">{r && site && <SourceDetails snapshot={r} site={site}/>}</div>
      {atlas?.limitations.map(line => <p className="atlas-limitation" key={line}>{line}</p>)}
      <p className="atlas-freshness">{data.stale ? "CACHED / STALE · " : ""}{atlas?.validAt ? `Valid ${new Date(atlas.validAt).toLocaleString()}` : "Waiting for frame"}</p>
      {data.error && <p className="atlas-error" role="status">{data.error}</p>}
    </aside>
    </div>
    {simulationOpen && site && <Suspense fallback={<p role="status" className="site-simulation-loading">Loading site simulator…</p>}><SiteSimulation key={site.id} site={site} reports={reports} snapshot={currentData.atlas?.sites.find(p => p.site.id === selected)?.snapshot} stale={currentData.stale} onClose={() => { setSimulationOpen(false); requestAnimationFrame(() => simulationButton.current?.focus()); }}/></Suspense>}
    {!showTimeline && <button type="button" className="atlas-timeline-prompt" aria-label="Explore selected site forecast" onClick={() => onSelect(selected)}><ClockCountdown size={24} aria-hidden="true"/><span><small>72-hour risk outlook</small><strong>Explore {site?.name ?? "the selected site"}</strong></span><i><ArrowUpRight size={19} aria-hidden="true"/></i></button>}
    {showTimeline && <div className="atlas-timeline"><div className="atlas-time-heading"><button type="button" disabled={reducedMotion} onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause risk forecast" : "Play risk forecast"}>{playing ? <Pause size={15} aria-hidden="true"/> : <Play size={15} aria-hidden="true"/>}</button><div><span>{site?.name ?? "Select a site"} · 72-hour outlook <b>{hour === 0 ? "Now" : `+${hour}h`}</b></span><strong>{data.loading ? "Loading selected site…" : atlas?.validAt ? new Date(atlas.validAt).toLocaleString() : "Risk frame unavailable"}</strong></div><button type="button" className="atlas-now" onClick={() => { onHour(0); setPlaying(false); }}>Back to now</button></div><div className="atlas-forecast-track" aria-hidden="true">{Array.from({ length: 25 }, (_, i) => <i key={i} data-active={i * 3 <= hour}/>)}</div><input aria-label="Forecast hour" name="forecast-hour" type="range" min={0} max={72} step={1} value={hour} onChange={e => { setPlaying(false); onHour(Number(e.target.value)); }} /><div className="atlas-time-ticks"><span>Now</span><span>+24h</span><span>+48h</span><span>+72h</span></div></div>}
    <div className="atlas-scale"><span>{ATLAS_LAYERS[layer].name} · {ATLAS_LAYERS[layer].unit}</span><i data-layer={layer}/><div><span>{ATLAS_LAYERS[layer].low}</span><span>{ATLAS_LAYERS[layer].high}</span></div><small>Gray / ? = unknown</small></div>
    <p className="atlas-coverage">{sites.length} sites · map shows current conditions{data.stale ? " · CACHED / STALE" : ""}<span>{hour ? "Selected-site forecast · future detections remain unknown" : "Current conditions · independent work decisions"}</span></p>
  </>;
}
