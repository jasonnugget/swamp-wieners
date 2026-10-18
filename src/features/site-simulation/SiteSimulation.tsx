import { useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, ArrowsOut, CloudRain, Flame, Lightning, Mountains, Pause, PawPrint, Play, SunHorizon, Waves, Wind, X } from "@phosphor-icons/react";
import type { ZodTypeAny } from "zod";
import type { HazardReport, Site } from "../../../shared/types";
import { siteObservationV1Schema, type SiteRiskSnapshot } from "../../../shared/risk";
import { TASK_LABELS } from "../../../shared/policy";
import { OBSERVATION_GROUPS } from "../../components/site-map/observations";
import { createSiteScene, type SiteScene } from "./scene";
import { DEFAULT_SETTINGS, type Lens, type ScenarioValues, type SceneSettings } from "./types";
import { scenarioPreset, type Preset } from "./visualization-state";
import "./simulation.css";

function initialValues(snapshot?: SiteRiskSnapshot, stale = false): ScenarioValues {
  const unknown = stale || snapshot?.observation.provenance.stale;
  return Object.fromEntries(OBSERVATION_GROUPS.map(group => [group.id,
    Object.fromEntries(group.fields.map(field => [field.key, unknown ? null : (snapshot?.observation[group.id] as Record<string, unknown> | undefined)?.[field.key] ?? null])),
  ])) as unknown as ScenarioValues;
}
const lenses = [
  { id: "weather", label: "Atmosphere", Icon: CloudRain, title: "Weather, in motion.", note: "Clouds follow the weather code. Precipitation is an illustrative replay; hourly totals are not a measured current rain rate." },
  { id: "heat", label: "Heat", Icon: SunHorizon, title: "Feel the heat.", note: "Amber contours and shimmer illustrate heat stress. Heat index is not measured ground temperature." },
  { id: "soil", label: "Ground", Icon: Mountains, title: "Below the surface.", note: "Surface and root layers show site-average moisture separately. This cutaway is schematic, not a bearing-capacity model." },
  { id: "water", label: "Water", Icon: Waves, title: "Follow the water.", note: "The gauge shows relative stage in a schematic channel. Its waterline and shaded bank do not locate flooding at this plant." },
  { id: "events", label: "Nearby events", Icon: Lightning, title: "Keep evidence in view.", note: "Distances have no bearings. Event cards preserve unknown locations rather than placing invented strikes, fires or animals on the site." },
] as const;
const presets = [
  { id: "clear", label: "Clear skies", Icon: SunHorizon }, { id: "heat", label: "Try extreme heat", Icon: SunHorizon },
  { id: "storm", label: "Try a storm", Icon: CloudRain }, { id: "snow", label: "Snowfall", Icon: CloudRain },
  { id: "wet", label: "Wet ground", Icon: Waves }, { id: "fire", label: "Fire demonstration", Icon: Flame },
] as const;
const reading = (value: number | null | undefined, unit = "", digits = 0) => value == null ? "Unknown" : `${value.toFixed(digits)}${unit}`;
const booleanReading = (value: boolean | null) => value === null ? "Unknown" : value ? "Yes" : "No";
function ago(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Unknown time";
  return new Date(value).toLocaleString();
}
function ScenarioReadouts({ values: v, lens }: { values: ScenarioValues; lens: Lens }) {
  if (lens === "events") return <div className="simulation-event-cards" aria-label="Hypothetical event evidence">
    <div><Lightning weight="light"/><span>Lightning <small>Input mode: {v.lightning.evidenceMode ?? "Unknown"}</small></span><strong>{reading(v.lightning.nearestStrikeMiles, " mi", 1)}</strong><p>{reading(v.lightning.strikes10mi30m)} strikes / 30 min · {ago(v.lightning.latestStrikeAt)}</p><p>Forecast potential: {reading(v.lightning.forecastPotential == null ? null : v.lightning.forecastPotential * 100, "% proxy")}</p></div>
    <div><Flame weight="light"/><span>Thermal detection <small>Location / perimeter unknown</small></span><strong>{reading(v.wildfire.nearestFireMiles, " mi", 1)}</strong><p>{reading(v.wildfire.firePower, " MW FRP")} · {reading(v.wildfire.fireAgeMinutes, " min old")}</p><p>Red flag alert: {booleanReading(v.wildfire.redFlagAlert)}</p></div>
    <div><PawPrint weight="light"/><span>Wildlife sightings <small>Species / locations unknown</small></span><strong>{reading(v.wildlife.dangerousSightings24h)}</strong><p>{reading(v.wildlife.crewReports24h)} crew reports · {reading(v.wildlife.nearestSightingMiles, " mi", 1)}</p><p>{v.wildlife.severity ?? "Unknown classification"} · {ago(v.wildlife.latestSightingAt)}</p></div>
  </div>;
  const fields = lens === "heat" ? [["Heat index", reading(v.weather.heatIndexF, "°F")], ["Air", reading(v.weather.temperatureF, "°F")], ["Humidity", reading(v.weather.humidityPct, "%")]]
    : lens === "soil" ? [["Surface VWC", reading(v.soil.moistureSurface == null ? null : v.soil.moistureSurface * 100, "%")], ["Root VWC", reading(v.soil.moistureRoot == null ? null : v.soil.moistureRoot * 100, "%")], ["Historical percentile", reading(v.soil.historicalPercentile == null ? null : v.soil.historicalPercentile * 100, "%")]]
    : lens === "water" ? [["Gauge height", reading(v.flood.stage, " m", 2)], ["Relative stage", reading(v.flood.stagePercentile == null ? null : v.flood.stagePercentile * 100, "%")], ["Stage trend", reading(v.flood.stageTrend, " m/h", 2)]]
    : [["Air", reading(v.weather.temperatureF, "°F")], ["Wind / gust", `${reading(v.weather.windMph)} / ${reading(v.weather.gustMph)} mph`], ["Rain / past hour", reading(v.weather.precipitation1hMm, " mm", 1)]];
  return <dl className="simulation-readouts">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function ScenarioContext({ values: v, lens }: { values: ScenarioValues; lens: Lens }) {
  const fields = lens === "weather" ? [["Rain / 24 h", reading(v.weather.precipitation24hMm, " mm", 1)], ["Rain / 7 d", reading(v.weather.precipitation7dMm, " mm", 1)], ["CAPE", reading(v.weather.cape, " J/kg")], ["Weather code", reading(v.weather.weatherCode)]]
    : lens === "heat" ? [["Feels like", reading(v.weather.apparentTemperatureF, "°F")]]
    : lens === "water" ? [["Gauge distance", reading(v.flood.nearestGaugeMiles, " mi", 1)], ["Flood alert", booleanReading(v.flood.floodAlert)], ["Mapped exposure", booleanReading(v.flood.floodplain)]] : [];
  return fields.length ? <div className="simulation-context">{fields.map(([name, value]) => <span key={name}>{name} <strong>{value}</strong></span>)}</div> : null;
}

export default function SiteSimulation({ site, snapshot, stale, onClose, reports = [] }: {
  site: Site; snapshot?: SiteRiskSnapshot; stale: boolean; onClose(): void; reports?: HazardReport[];
}) {
  const dialog = useRef<HTMLDialogElement>(null), host = useRef<HTMLDivElement>(null), scene = useRef<SiteScene | null>(null);
  const [values, setValues] = useState(() => initialValues(snapshot, stale));
  const [settings, setSettings] = useState<SceneSettings>(DEFAULT_SETTINGS);
  const [paused, setPaused] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [graphicsError, setGraphicsError] = useState(false), [error, setError] = useState("");
  const [baseline] = useState(() => structuredClone(values));
  const [baselineTime] = useState(snapshot?.observation.validAt), [baselineStale] = useState(stale || snapshot?.observation.provenance.stale);
  const [preset, setPreset] = useState<Preset | null>(null);
  const activeLens = lenses.find(l => l.id === settings.lens)!;
  const known = OBSERVATION_GROUPS.flatMap(g => g.fields.map(f => (values[g.id] as Record<string, unknown>)[f.key])).filter(v => v != null).length;
  const wildlifeReports = reports.filter(r => r.siteId === site.id && r.category === "wildlife").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (!host.current) return;
    try { scene.current = createSiteScene(host.current); }
    catch (e) { console.error("Site simulation renderer unavailable", e); setGraphicsError(true); }
    return () => { scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.update(values, paused, settings); }, [values, paused, settings]);
  useEffect(() => {
    document.dispatchEvent(new CustomEvent("planit:site-simulation", { detail: true }));
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const reduce = () => { if (media.matches) setPaused(true); };
    media.addEventListener("change", reduce);
    return () => { media.removeEventListener("change", reduce); document.dispatchEvent(new CustomEvent("planit:site-simulation", { detail: false })); };
  }, []);
  function change(group: keyof ScenarioValues, key: string, value: unknown) {
    const shape: Record<string, ZodTypeAny> = siteObservationV1Schema.shape[group].shape;
    if (value !== null && !shape[key].safeParse(value).success) { setError("Value outside the accepted range. Fractions use 0–1; counts use whole numbers; dates use ISO UTC timestamps."); return; }
    setError(""); setPreset(null);
    setValues(previous => ({ ...previous, [group]: { ...previous[group], [key]: value } }));
  }
  function selectLens(lens: Lens) {
    setSettings(s => ({ ...s, lens }));
    if (lens === "soil") scene.current?.cameraView("detail");
    else scene.current?.cameraView("overview");
  }
  function applyPreset(id: Preset) {
    setError(""); setPreset(id); setValues(scenarioPreset(baseline, id));
    setSettings(s => ({ ...s, lens: id === "heat" ? "heat" : id === "wet" ? "soil" : id === "fire" ? "events" : "weather", demonstration: id === "fire" ? "fire" : id === "storm" ? "lightning" : "none" }));
    scene.current?.cameraView(id === "wet" ? "detail" : "overview");
  }
  function reset() { setValues(structuredClone(baseline)); setSettings(DEFAULT_SETTINGS); setPreset(null); setError(""); scene.current?.resetCamera(); }
  return <dialog ref={dialog} className="site-simulation" aria-labelledby="simulation-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <header className="simulation-header"><div className="simulation-identity"><span className="simulation-brand-mark"><Mountains weight="light" size={24}/></span><div><p className="simulation-eyebrow">PLANIT / ENVIRONMENT STUDIO</p><h2 id="simulation-title">{site.name} <span>/ 3D site</span></h2></div></div><div className="simulation-header-actions"><span className="simulation-mode"><i/>SIMULATED</span><button type="button" className="simulation-close" autoFocus onClick={onClose} aria-label="Close simulation"><X size={20} weight="light"/></button></div></header>
    <p className="simulation-notice">An illustrative landscape for exploring conditions. Plant geometry, wind direction and effects are hypothetical; current work restrictions stay separate.</p>
    <div className="simulation-layout"><section className="simulation-stage" aria-label="Schematic site visualization">
      <div className="simulation-lenses" role="group" aria-label="Environmental lenses">{lenses.map(({ id, label, Icon }) => <button type="button" key={id} aria-pressed={settings.lens === id} onClick={() => selectLens(id)}><Icon size={18} weight="light"/><span>{label}</span></button>)}</div>
      <div className="simulation-viewport"><div ref={host} className="simulation-canvas"/>
        <div className="simulation-scene-caption"><span>ILLUSTRATIVE SITE / {site.state}</span><p>{settings.template === "campus" ? "Industrial campus" : settings.template === "solar" ? "Solar field" : "Substation yard"}</p><small>Procedural model · not a surveyed layout</small></div>
        <div className="simulation-camera" role="group" aria-label="Site simulation camera"><button type="button" aria-label="Rotate left" onClick={() => scene.current?.orbit(-Math.PI / 8)}>↶</button><button type="button" aria-label="Rotate right" onClick={() => scene.current?.orbit(Math.PI / 8)}>↷</button><button type="button" aria-label="Zoom in" onClick={() => scene.current?.zoom(0.8)}>+</button><button type="button" aria-label="Zoom out" onClick={() => scene.current?.zoom(1.25)}>−</button><button type="button" aria-label="Reset camera" onClick={() => scene.current?.resetCamera()}><ArrowsOut size={16}/></button></div>
        <div className="simulation-view-buttons"><button type="button" onClick={() => scene.current?.cameraView("overview")}>Perspective</button><button type="button" onClick={() => scene.current?.cameraView("overhead")}>Overhead</button><button type="button" onClick={() => scene.current?.cameraView("detail")}>Ground detail</button></div>
        {graphicsError && <div className="simulation-graphics-error" role="status">3D graphics unavailable. Scenario inputs and current restrictions remain accessible.</div>}
        {settings.demonstration !== "none" && <p className="simulation-demo-label">{settings.demonstration === "fire" ? "Flame / smoke" : "Lightning"} demonstration · arbitrary position, not a detected event location</p>}
      </div>
      <div className="simulation-story"><div className="simulation-story-heading"><div><p className="simulation-eyebrow">{settings.lens.toUpperCase()} STUDY</p><h3>{activeLens.title}</h3></div><button type="button" className="simulation-motion" onClick={() => setPaused(!paused)} aria-label={paused ? "Play animation" : "Pause animation"}>{paused ? <Play weight="light" size={17}/> : <Pause weight="light" size={17}/>}<span>{paused ? "Play animation" : "Pause animation"}</span></button></div><ScenarioReadouts values={values} lens={settings.lens}/><ScenarioContext values={values} lens={settings.lens}/><p className="simulation-lens-note">{activeLens.note} Unknown readings stay unknown.</p></div>
      <div className="simulation-preset-bar"><div><span className="simulation-eyebrow">CHANGE THE CONDITIONS</span><small>Hypothetical presets</small></div><div className="simulation-presets" role="group" aria-label="Hypothetical scenario presets">{presets.map(({ id, label, Icon }) => <button key={id} type="button" aria-pressed={preset === id} onClick={() => applyPreset(id)}><Icon size={18} weight="light"/>{label}</button>)}</div></div>
      <p className="simulation-interaction-note">Drag to orbit · scroll or pinch to zoom. Animation moves effects, never forecast time or scenario inputs.</p>
    </section><aside className="simulation-sidebar" aria-label="Scenario variables">
      <div className="simulation-sidebar-intro"><div><p className="simulation-eyebrow">YOUR SCENARIO</p><h3>Make conditions visible.</h3></div><button type="button" className="simulation-reset" onClick={reset} aria-label="Reset inputs" title="Reset all inputs and presentation"><ArrowCounterClockwise size={18}/></button></div>
      <div className="simulation-input-coverage"><span>{known}<small> / 34 inputs</small></span><span>{34 - known} unknown</span></div>
      <p className="simulation-source-note">Starting inputs: {baselineStale ? "unknown because source data was stale" : "available source readings"}{!baselineStale && baselineTime ? ` · ${new Date(baselineTime).toLocaleString()}` : ""}. Edits are hypothetical. Reset restores this starting state.</p>
      <details className="simulation-art-controls"><summary>Scene & demonstration controls</summary><div>
        <label>Illustrative facility template<select aria-label="Illustrative facility template" value={settings.template} onChange={e => setSettings(s => ({ ...s, template: e.target.value as SceneSettings["template"] }))}><option value="campus">Industrial campus</option><option value="solar">Solar field</option><option value="substation">Substation yard</option></select></label>
        <label>Quality<select aria-label="Quality" value={settings.quality} onChange={e => setSettings(s => ({ ...s, quality: e.target.value as SceneSettings["quality"] }))}><option value="balanced">Balanced</option><option value="high">High detail</option></select></label>
        <label>Hypothetical wind travel direction · {settings.windBearing}°<input aria-label="Hypothetical wind direction" type="range" min="0" max="360" step="5" value={settings.windBearing} onChange={e => setSettings(s => ({ ...s, windBearing: Number(e.target.value) }))}/></label>
        <label>Demonstration effect<select aria-label="Demonstration effect" value={settings.demonstration} onChange={e => setSettings(s => ({ ...s, demonstration: e.target.value as SceneSettings["demonstration"] }))}><option value="none">None — event cards only</option><option value="lightning">Illustrative lightning</option><option value="fire">Illustrative flame / smoke</option></select></label>
        <p>Templates and direction are artistic controls. No facility type, airflow field, fire perimeter or event bearing is inferred.</p>
      </div></details>
      <div className="simulation-fields-heading"><h3>34 environmental variables</h3><p>Leave a field or press Tab to apply. Blank means unknown; no synthetic gap-fill is used.</p></div>
      {error && <p className="simulation-error" role="alert">{error}</p>}
      <div className="simulation-inputs">{OBSERVATION_GROUPS.map((group, index) => <details key={group.id} open={index === 0}><summary><span>{group.name}</span><small>{group.fields.length}</small></summary><fieldset><legend className="sr-only">{group.name}</legend><p className="simulation-group-note">{group.note}</p>{group.fields.map(field => {
        const value = (values[group.id] as Record<string, unknown>)[field.key];
        const options = field.format === "boolean" ? ["true", "false"] : field.key === "evidenceMode" ? ["LIVE", "DEMO", "FORECAST", "UNAVAILABLE"] : field.key === "severity" ? ["INFORMATIONAL", "LOW", "MODERATE", "ELEVATED", "HIGH", "CRITICAL"] : null;
        return <label key={field.key}><span>{field.label}{field.unit ? ` (${field.unit})` : field.format === "fraction" ? " (0–1)" : field.format === "percent" ? " (%)" : ""}</span>{options ? <select value={value == null ? "" : String(value)} onChange={e => change(group.id, field.key, e.target.value === "" ? null : field.format === "boolean" ? e.target.value === "true" : e.target.value)}><option value="">Unknown</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select> : <input key={`${group.id}-${field.key}-${value}`} type={field.format === "time" ? "text" : "number"} defaultValue={value == null ? "" : String(value)} placeholder={field.format === "time" ? "ISO UTC or unknown" : "Unknown"} step="any" onBlur={e => change(group.id, field.key, e.target.value.trim() === "" ? null : field.format === "time" ? e.target.value : Number(e.target.value))} />}</label>;
      })}</fieldset></details>)}</div>
      {settings.lens === "events" && <section className="simulation-crew-evidence" aria-label="Source crew wildlife evidence"><p className="simulation-eyebrow">SOURCE CREW EVIDENCE · NOT SIMULATED</p>{wildlifeReports.length ? wildlifeReports.map(report => <article key={report.id}>{report.photoUrl?.startsWith("/uploads/") && <img src={report.photoUrl} alt="Original crew wildlife observation; unavailable offline if not loaded" width="280" height="150" loading="lazy"/>}<strong>{report.status === "open" ? "Open observation" : "Resolved · retained history"}</strong><p>{report.description}</p><small>{report.author} · {new Date(report.createdAt).toLocaleString()}</small></article>) : <p>No loaded crew wildlife reports for this plant. This does not establish absence of wildlife.</p>}</section>}
      <section className="simulation-restrictions" aria-label="Current operational restrictions"><p className="simulation-eyebrow">CURRENT OPERATIONAL EVIDENCE</p><h3>Work restrictions</h3><p>{stale ? "Cached / stale snapshot" : "Source snapshot"} · separate from scenario</p>{snapshot ? snapshot.tasks.map(task => <div key={task.task}><span>{TASK_LABELS[task.task]}</span><strong data-state={task.state}>{task.state}</strong></div>) : <p>Unknown — current evidence unavailable.</p>}{snapshot?.activeOverrides.map(o => <p key={o.id}><strong>{o.state}</strong> · {o.reason}</p>)}<p>Scenario edits never clear restrictions. Recheck current evidence before work.</p></section>
    </aside></div>
  </dialog>;
}
