import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, ArrowUpRight, CloudRain, DownloadSimple, Hurricane, Pause, Play, SlidersHorizontal, Waves, Wind, X } from "@phosphor-icons/react";
import { buildScenarioFrame, SCENARIO_PRESETS, scenarioWindCategory, type ScenarioConfig, type ScenarioFrame } from "../../../shared/simulation";
import { atRisk, onHold, simulateFleet, simulateSiteRisk, type SimulatedRisk } from "../../../shared/simulate-risk";
import type { Site } from "../../../shared/types";
import type { SiteRiskSnapshot } from "../../../shared/risk";
import { CATEGORY_LABELS, TASK_LABELS } from "../../../shared/policy";
import type { SimulationState, SimulationLayer } from "./useSimulation";

const layers: { id: SimulationLayer; label: string; icon: typeof Wind }[] = [
  { id: "wind", label: "Wind field", icon: Wind },
  { id: "rain", label: "Rainfall", icon: CloudRain },
  { id: "runoff", label: "Rainfall excess", icon: Waves },
];
const number = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits });

function ScenarioSlider({ label, value, unit, min, max, step = 1, onChange }: {
  label: string; value: number; unit: string; min: number; max: number; step?: number; onChange(value: number): void;
}) {
  const id = useId();
  return <label className="scenario-slider" htmlFor={id}><span>{label}<output htmlFor={id}>{number(value, 1)} <small>{unit}</small></output></span>
    <input id={id} type="range" name={label.toLowerCase().replaceAll(" ", "-")} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}/>
  </label>;
}

const SIM_CHANNELS = ["weather", "flood", "wildfire", "lightning"] as const;
const tone = (score: number | null | undefined) => score == null ? "unknown" : score >= 9 ? "hold" : score >= 7 ? "restricted" : score >= 4 ? "elevated" : "low";

/** Simulated composite across the timeline for one plant; a marker shows the scrubbed hour. */
function RiskSparkline({ config, site, base, hour }: { config: ScenarioConfig; site: Site; base: SiteRiskSnapshot | undefined; hour: number }) {
  const points = useMemo(() => {
    const now = Date.now();
    return Array.from({ length: 37 }, (_, i) => {
      const h = i * 2, impact = buildScenarioFrame(config, h, [site]).impacts[site.id];
      return { h, risk: simulateSiteRisk(site, base, impact, now).risk ?? 0 };
    });
  }, [config, site, base]);
  const x = (h: number) => (h / 72) * 240, y = (r: number) => 56 - (r / 10) * 52;
  const peak = points.reduce((a, b) => b.risk > a.risk ? b : a);
  return <figure className="sim-spark" aria-label={`Simulated risk over 72 hours, peaking at ${peak.risk.toFixed(1)} at +${peak.h}h`}>
    <svg viewBox="0 0 240 60" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="240" y1={y(7)} y2={y(7)} className="sim-spark-band"/>
      <line x1="0" x2="240" y1={y(9)} y2={y(9)} className="sim-spark-band is-hold"/>
      <polyline points={points.map(p => `${x(p.h)},${y(p.risk)}`).join(" ")} className="sim-spark-line"/>
      <line x1={x(hour)} x2={x(hour)} y1="0" y2="60" className="sim-spark-now"/>
    </svg>
    <figcaption><span>0h</span><span>Peak {peak.risk.toFixed(1)} at +{peak.h}h · dashed lines = restrict 7 / hold 9</span><span>72h</span></figcaption>
  </figure>;
}

function downloadScenario(frame: ScenarioFrame, sites: Site[], simulated?: Record<string, SimulatedRisk>) {
  const file = new Blob([JSON.stringify({
    version: 1, model: "Threshold idealized storm / rainfall-excess scenario", exportedAt: new Date().toISOString(),
    ...frame, simulatedRisk: simulated, limitations: [...frame.limitations, "Installed capacity identifies exposed assets; it is not lost generation.", "Simulated risk re-runs the rule-based screen on hypothetical weather; it never changes current holds."],
    sites: sites.map(({ id, name, state, latitude, longitude, capacityMw }) => ({ id, name, state, latitude, longitude, capacityMw })),
  }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file), link = document.createElement("a");
  link.href = url; link.download = `threshold-simulated-${frame.config.presetId}-${frame.hour}h.json`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SimulationControls({ simulation, sites, selected, risks, stale, reducedMotion, inspectRequest, onSelect, onFrame, onCurrent }: {
  simulation: SimulationState; sites: Site[]; selected: string; risks: Record<string, SiteRiskSnapshot>; stale: boolean; reducedMotion: boolean;
  inspectRequest: number; onSelect(id: string): void; onFrame(): void; onCurrent(): void;
}) {
  const { frame, config, hour, layer } = simulation;
  const [open, setOpen] = useState(() => window.innerWidth > 760);
  const [tab, setTab] = useState<"scenario" | "effects">("scenario");
  const [rankBy, setRankBy] = useState<"risk" | "exposure">("risk");
  const closeRef = useRef<HTMLButtonElement>(null), openRef = useRef<HTMLButtonElement>(null), panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (inspectRequest > 0) {
      setTab("effects"); setOpen(true);
      if (panelRef.current) panelRef.current.scrollTop = 0;
    }
  }, [inspectRequest]);
  const preset = SCENARIO_PRESETS.find(p => p.id === config.presetId)!;
  const site = sites.find(s => s.id === selected);
  const impact = frame?.impacts[selected], current = risks[selected];
  const currentStale = stale || current?.observation.provenance.stale;
  const ranked = useMemo(() => frame ? sites.filter(s => {
    const effect = frame.impacts[s.id];
    return layer === "wind" ? effect.peakWindMph >= 39 : layer === "rain" ? effect.accumulatedRainMm >= 25 : effect.runoffMm >= 25;
  }).sort((a, b) => {
    const key = layer === "wind" ? "peakWindMph" : layer === "rain" ? "accumulatedRainMm" : "runoffMm";
    return frame.impacts[b.id][key] - frame.impacts[a.id][key];
  }) : [], [frame, sites, layer]);
  const capacity = ranked.reduce((sum, s) => sum + s.capacityMw, 0);
  // Re-scored every timeline step from the scenario's weather laid over today's evidence.
  const simulated = useMemo(() => frame ? simulateFleet(frame, sites, risks) : {}, [frame, sites, risks]);
  const riskRanked = useMemo(() => sites.filter(s => simulated[s.id] && atRisk(simulated[s.id].tasks))
    .sort((a, b) => Number(onHold(simulated[b.id].tasks)) - Number(onHold(simulated[a.id].tasks)) || (simulated[b.id].risk ?? 0) - (simulated[a.id].risk ?? 0)), [sites, simulated]);
  const heldCount = riskRanked.filter(s => onHold(simulated[s.id].tasks)).length;
  const riskCapacity = riskRanked.reduce((sum, s) => sum + s.capacityMw, 0);
  const currentAtRisk = useMemo(() => sites.filter(s => risks[s.id] && atRisk(risks[s.id].tasks)).length, [sites, risks]);
  const sim = simulated[selected];
  if (!frame) return null;
  function update(key: keyof ScenarioConfig, value: number) { simulation.updateConfig({ ...config, [key]: value }); }
  function close() { setOpen(false); requestAnimationFrame(() => openRef.current?.focus()); }
  function reveal() { setOpen(true); requestAnimationFrame(() => closeRef.current?.focus()); }
  function choose(id: string) { onSelect(id); setTab("effects"); setOpen(true); }
  const threshold = layer === "wind" ? "Peak wind ≥39 mph" : layer === "rain" ? "Accumulated rain ≥25 mm" : "Rainfall excess ≥25 mm";
  const currentHolds = current?.tasks.filter(t => t.state === "HOLD" || t.state === "RESTRICTED") ?? [];

  return <>
    <div className="scenario-summary" aria-label="Scenario exposure summary">
      <span className="scenario-tag"><Hurricane size={14} aria-hidden="true"/>Hypothetical scenario</span>
      <div><strong data-testid="scenario-at-risk-count">{riskRanked.length}</strong><p>plants would be<br/>restricted or on hold</p></div>
      <small>Simulated at +{number(hour, 1)}h · {heldCount} on hold · {currentAtRisk} today</small>
      <p>{number(riskCapacity)} MW installed at these sites<br/><span>Asset context, not predicted generation loss.</span></p>
      <small className="scenario-band-line"><span data-testid="scenario-exposed-count">{ranked.length}</span> in the {threshold.toLowerCase()} band · {number(capacity)} MW</small>
    </div>
    <button ref={openRef} type="button" className="scenario-panel-open" aria-label="Show scenario controls" aria-expanded={open} aria-controls="scenario-controls" hidden={open} onClick={reveal}><SlidersHorizontal size={17} aria-hidden="true"/>Scenario controls</button>
    <section className="scenario-shell" data-open={open} inert={!open} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
      <div className="scenario-panel-heading"><span>SCENARIO LAB <i>LOCAL</i></span><button ref={closeRef} type="button" aria-label="Hide scenario controls" onClick={close}><X size={19} aria-hidden="true"/></button></div>
      <div className="scenario-panel" ref={panelRef} id="scenario-controls" aria-label="Storm simulation controls">
        <div className="scenario-tabs" role="group" aria-label="Simulation views"><button type="button" aria-pressed={tab === "scenario"} onClick={() => setTab("scenario")}>Build a scenario</button><button type="button" aria-pressed={tab === "effects"} onClick={() => setTab("effects")}>Site effects <ArrowUpRight size={14} aria-hidden="true"/></button></div>
        <div hidden={tab !== "scenario"}>
          <label className="scenario-select">Storm track<select aria-label="Storm track" name="storm-track" value={config.presetId} onChange={e => {
            const next = SCENARIO_PRESETS.find(p => p.id === e.target.value)!;
            simulation.updateConfig({ ...next.defaults }); simulation.scrub(24); simulation.setLayer(next.kind === "rainfall" ? "runoff" : "wind");
          }}>{SCENARIO_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <p className="scenario-description">{preset.description}</p>
          <div className="scenario-strength"><strong>{preset.kind === "rainfall" ? "Rainfall experiment" : scenarioWindCategory(config.maxWindMph)}</strong><span>{preset.kind === "rainfall" ? "Idealized moving rain field" : "Wind category only · rain varies independently"}</span></div>
          <ScenarioSlider label="Maximum sustained wind" value={config.maxWindMph} unit="mph" min={0} max={200} onChange={v => update("maxWindMph", v)}/>
          <ScenarioSlider label="Peak rainfall rate" value={config.rainRateMmH} unit="mm/h" min={0} max={80} onChange={v => update("rainRateMmH", v)}/>
          <ScenarioSlider label="Storm radius" value={config.radiusKm} unit="km" min={40} max={400} step={10} onChange={v => update("radiusKm", v)}/>
          <ScenarioSlider label="Track duration" value={config.durationHours} unit="hours" min={12} max={72} onChange={v => update("durationHours", v)}/>
          <div className="scenario-drainage"><ScenarioSlider label="Drainage assumption" value={config.drainageMmH} unit="mm/h" min={0} max={50} onChange={v => update("drainageMmH", v)}/><p>Raise this to compare less rainfall excess. Uniform removal is an assumption, not measured drainage capacity.</p></div>
          <details className="scenario-details"><summary>Move the storm track</summary><ScenarioSlider label="Shift north" value={config.latitudeOffset ?? 0} unit="° latitude" min={-5} max={5} step={0.1} onChange={v => update("latitudeOffset", v)}/><ScenarioSlider label="Shift east" value={config.longitudeOffset ?? 0} unit="° longitude" min={-5} max={5} step={0.1} onChange={v => update("longitudeOffset", v)}/><button type="button" onClick={onFrame}>Fit storm track <ArrowUpRight size={15} aria-hidden="true"/></button></details>
          <div className="scenario-actions"><button type="button" onClick={() => { simulation.updateConfig({ ...preset.defaults }); simulation.scrub(0); }}><ArrowCounterClockwise size={16} aria-hidden="true"/>Reset scenario</button><button type="button" onClick={() => downloadScenario(frame, sites, simulated)}><DownloadSimple size={16} aria-hidden="true"/>Export JSON</button></div>
        </div>
        <div hidden={tab !== "effects"}>
          <label className="scenario-select">Inspect plant<select aria-label="Simulation plant" name="simulation-plant" value={selected} onChange={e => onSelect(e.target.value)}>{sites.map(s => <option value={s.id} key={s.id}>{s.name} · {s.state}</option>)}</select></label>
          <h2 className="scenario-site-name">{site?.name ?? "Choose a plant"}</h2>
          <p className="scenario-description">What the safety screen would say at +{number(hour, 1)}h if this storm happened. No estimate of physical damage.</p>
          {sim && <section className="sim-risk" aria-label="Simulated risk" data-testid="sim-risk">
            <div className="sim-risk-head"><span className="scenario-tag">SIMULATED RISK · +{number(hour, 1)}h</span></div>
            <div className="sim-risk-score">
              <strong className={`sim-tone-${tone(sim.risk)}`} data-testid="sim-risk-score">{sim.risk == null ? "—" : sim.risk.toFixed(1)}<small>/10</small></strong>
              {sim.delta != null && <span className={sim.delta > 0.05 ? "sim-delta is-up" : "sim-delta"}>{sim.delta > 0.05 ? `▲ +${sim.delta.toFixed(1)}` : "no change"} vs today ({sim.baseline?.toFixed(1)})</span>}
              <p>{sim.primary ? `Driven by ${CATEGORY_LABELS[sim.primary.hazard].toLowerCase()} at ${sim.primary.score.toFixed(1)}/10` : "No scored hazard at this hour"}</p>
            </div>
            <ul className="sim-channels">{SIM_CHANNELS.map(h => {
              const c = sim.channels.find(x => x.hazard === h);
              return <li key={h}><span>{CATEGORY_LABELS[h]}</span><i><b className={`sim-tone-${tone(c?.score)}`} style={{ width: `${(c?.score ?? 0) * 10}%` }}/>{c?.baseline != null && <em style={{ left: `${c.baseline * 10}%` }} title="Today"/>}</i><strong>{c?.score == null ? "—" : c.score.toFixed(1)}</strong></li>;
            })}</ul>
            <ul className="sim-tasks">{sim.tasks.map(t => <li key={t.task} title={t.reasons.join(" ")}><span className={`task-state state-${t.state.toLowerCase()}`}>{t.state}</span><b>{TASK_LABELS[t.task]}</b>{t.reasons[0] && <small>{t.reasons[0]}</small>}</li>)}</ul>
            {site && <RiskSparkline config={config} site={site} base={current} hour={hour}/>}
          </section>}
          <h3 className="sim-inputs-title">Storm inputs at this site</h3>
          {impact && <dl className="scenario-site-metrics" data-testid="scenario-site-effects"><div><dt>Wind now / peak</dt><dd>{number(impact.windMph)} / {number(impact.peakWindMph)} <small>mph</small></dd></div><div><dt>Total rainfall</dt><dd data-testid="scenario-rain">{number(impact.accumulatedRainMm, 1)} <small>mm</small></dd></div><div><dt>Rain, last 24 h</dt><dd>{number(impact.rainLast24hMm, 1)} <small>mm</small></dd></div><div><dt>Rainfall excess</dt><dd data-testid="scenario-runoff">{number(impact.runoffMm, 1)} <small>mm</small></dd></div></dl>}
          <p className="scenario-excess-note">Rainfall excess is cumulative water generated above the assumed drainage rate, not water remaining on the ground. It is <strong>not flood depth</strong>. Terrain, rivers, tides and surge are not modeled.</p>
          {impact && <ul className="scenario-implications"><li>{impact.peakWindMph >= 39 ? "Wind exposure: review equipment limits and outdoor installation plans." : "Below this scenario’s 39 mph wind band; other hazards remain independent."}</li><li>{impact.runoffMm >= 25 ? "Rainfall excess: inspect access routes and drainage before mobilization." : "Below this scenario’s 25 mm excess band; this does not establish flood safety."}</li></ul>}
          <section className="scenario-current" aria-label="Independent current controls"><span>CURRENT EVIDENCE · SEPARATE FROM SIMULATION</span><strong>{currentStale || current?.risk == null ? "Current risk unknown" : `Current risk ${current.risk.toFixed(1)} / 10`}</strong>{currentStale && <p>Cached / stale evidence. Verify before work.</p>}{currentHolds.map(t => <p key={t.task}><b>{t.state}</b> · {TASK_LABELS[t.task]}</p>)}{current?.activeOverrides.map(o => <p key={o.id}><b>{o.state}</b> · {o.reason}</p>)}<p>Scenarios never clear a hold or authorize work.</p><button type="button" onClick={onCurrent}>Open current evidence <ArrowUpRight size={15} aria-hidden="true"/></button></section>
        </div>
        <section className="scenario-ranked"><div><h3>Sites to review</h3><div className="sim-rank-toggle" role="group" aria-label="Rank sites by"><button type="button" aria-pressed={rankBy === "risk"} onClick={() => setRankBy("risk")}>Simulated risk</button><button type="button" aria-pressed={rankBy === "exposure"} onClick={() => setRankBy("exposure")}>Exposure</button></div></div>
          {rankBy === "risk" && <>{riskRanked.slice(0, 8).map(s => { const r = simulated[s.id]; return <button type="button" key={s.id} aria-pressed={selected === s.id} onClick={() => choose(s.id)}><span>{s.name}<small>{s.state} · {onHold(r.tasks) ? "HOLD" : "RESTRICTED"} · {r.primary ? CATEGORY_LABELS[r.primary.hazard] : "—"}</small></span><strong className={`sim-tone-${tone(r.risk)}`}>{r.risk?.toFixed(1) ?? "—"}<small>/10</small></strong></button>; })}{!riskRanked.length && <p>No plant would be restricted or held at this hour. Move the timeline or strengthen the storm.</p>}</>}
          {rankBy === "exposure" && <><small>{threshold}</small>{ranked.slice(0, 6).map(s => <button type="button" key={s.id} aria-pressed={selected === s.id} onClick={() => choose(s.id)}><span>{s.name}<small>{s.state} · {number(s.capacityMw)} MW installed</small></span><strong>{number(layer === "wind" ? frame.impacts[s.id].peakWindMph : layer === "rain" ? frame.impacts[s.id].accumulatedRainMm : frame.impacts[s.id].runoffMm)}<small>{layer === "wind" ? "mph" : "mm"}</small></strong></button>)}{!ranked.length && <p>No plants in this screening band at this time. Move the timeline or change the assumptions.</p>}</>}</section>
        <details className="scenario-details scenario-assumptions"><summary>How to read this simulation</summary><p>Every track and weather input here is hypothetical. Wind uses an idealized eye and radial decay; the maximum stays constant along the route. Rain integrates along that route. Rainfall excess sums rain above the drainage assumption.</p><p>Simulated risk lays the scenario's wind (gusts ×1.3) and rain over each plant's current evidence and re-runs the same rule-based screen and task policy. It can only add hazard: today's holds, crew reports and alerts carry through, and nothing here changes them.</p><p>The 25 mm bands are comparison filters, not official flood or work thresholds. There is no terrain routing, storm surge, levee, river, damage or outage model. Plant markers still show canonical current evidence.</p><p><a href="https://www.nhc.noaa.gov/aboutsshws.php" target="_blank" rel="noreferrer">NHC wind categories</a><a href="https://www.nhc.noaa.gov/surge/" target="_blank" rel="noreferrer">Why surge needs a separate model</a></p></details>
      </div>
    </section>
    <div className="scenario-transport">
      <div className="scenario-layers" role="group" aria-label="Simulation layers">{layers.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={layer === id} onClick={() => simulation.setLayer(id)}><Icon size={17} aria-hidden="true"/>{label}</button>)}</div>
      <div className="scenario-time-head"><button type="button" className="scenario-play" disabled={reducedMotion} aria-label={simulation.playing ? "Pause simulation" : "Play simulation"} onClick={simulation.togglePlayback}>{simulation.playing ? <Pause size={18} aria-hidden="true"/> : <Play size={18} aria-hidden="true"/>}</button><div><span>SIMULATED TIME <strong data-testid="scenario-hour">+{number(hour, 1)}h</strong></span><small>{hour >= config.durationHours ? "Track complete · accumulated exposure retained" : `${number(frame.travelSpeedKmh)} km/h travel · ${number(frame.progress * 100)}% of track`}</small></div><button type="button" className="scenario-rewind" aria-label="Rewind simulation" onClick={() => simulation.scrub(0)}><ArrowCounterClockwise size={19} aria-hidden="true"/></button></div>
      <label className="scenario-time-range"><span className="sr-only">Simulation hour</span><input type="range" name="simulation-hour" min={0} max={72} step={0.5} value={hour} onChange={e => simulation.scrub(Number(e.target.value))}/></label>
      <div className="scenario-time-ticks"><span>Start</span><span>+24h</span><span>+48h</span><span>+72h</span></div>
    </div>
    <p className="scenario-map-key">{layer === "wind" ? "Storm field + assumed track" : layer === "rain" ? "Moving rainfall field + site totals" : "Site rainfall excess · schematic rings"}<span>Plant colors = current evidence · scenario is not a forecast</span></p>
  </>;
}
