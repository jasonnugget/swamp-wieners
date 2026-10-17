import { useEffect, useState } from "react";
import { ATLAS_LAYERS, atlasValue, atlasColor, type RiskLayer } from "../../../shared/atlas";
import type { SafetyOverride } from "../../../shared/risk";
import { TASK_LABELS } from "../../../shared/policy";
import type { MapRegion } from "../../../shared/weather";
import type { useRiskAtlas } from "../../lib/useRiskAtlas";

const names: Record<string, string> = { heat: "Heat", weather: "Weather", soil: "Soil", flood: "Flood", wildfire: "Wildfire", lightning: "Lightning", wildlife: "Wildlife" };
function AllClear({ override }: { override: SafetyOverride }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(override.expiresAt!) - now) / 1000));
  return <p>All-clear: <time data-testid="all-clear">{`${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`}</time>{seconds === 0 && " · awaiting backend confirmation"}</p>;
}
export default function RiskControls({ data, layer, hour, region, selected, reducedMotion, onLayer, onHour, onRegion, onSelect }: {
  data: ReturnType<typeof useRiskAtlas>; layer: RiskLayer; hour: number; region: MapRegion; selected: string; reducedMotion: boolean;
  onLayer(layer: RiskLayer): void; onHour(hour: number): void; onRegion(region: MapRegion): void; onSelect(id: string): void;
}) {
  const [playing, setPlaying] = useState(false), [search, setSearch] = useState("");
  useEffect(() => { if (reducedMotion) setPlaying(false); }, [reducedMotion]);
  useEffect(() => {
    if (!playing || reducedMotion || data.loading) return;
    const timer = setTimeout(() => { if (!document.hidden) onHour(hour >= 72 ? 0 : hour + 3); }, 2000);
    return () => clearTimeout(timer);
  }, [playing, reducedMotion, data.loading, hour, onHour]);
  const atlas = data.atlas, entry = atlas?.sites.find(p => p.site.id === selected), r = entry?.snapshot;
  const value = atlasValue(r, layer), matches = search.trim() ? atlas?.sites.filter(p => `${p.site.name} ${p.site.state} ${p.site.id}`.toLowerCase().includes(search.toLowerCase())).slice(0, 6) ?? [] : [];
  function selectRegion(next: MapRegion) {
    onRegion(next);
    const site = atlas?.sites.find(p => next === "alaska" ? p.site.state === "AK" : next === "hawaii" ? p.site.state === "HI" : !["AK", "HI"].includes(p.site.state))?.site;
    if (site) onSelect(site.id);
  }
  return <>
    <div className="atlas-layer-bar" role="group" aria-label="Environmental layers">{(Object.keys(ATLAS_LAYERS) as RiskLayer[]).map(id => <button type="button" key={id} aria-pressed={layer === id} onClick={() => onLayer(id)}>{ATLAS_LAYERS[id].name}</button>)}</div>
    <div className="atlas-regions" role="group" aria-label="Map regions">{([["mainland", "Lower 48"], ["alaska", "Alaska"], ["hawaii", "Hawaii"], ["all", "All US"]] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={region === id} onClick={() => selectRegion(id)}>{label}</button>)}</div>
    <aside className="atlas-inspector" aria-label="Site risk inspection" aria-busy={data.loading}>
      <div className="atlas-inspector-top"><span>{hour === 0 ? "CURRENT SITE RISK" : `FORECAST · +${hour} HOURS`}</span><button type="button" onClick={data.refresh} disabled={data.loading} aria-label="Refresh risk atlas">{data.loading ? "Syncing…" : "Refresh ↗"}</button></div>
      <h2 className="atlas-location-title">{entry?.site.name ?? "Select a site"}</h2>
      <p className="atlas-coordinate">{entry ? `${entry.site.county}, ${entry.site.state} · EIA ${entry.site.id}` : "No frame available"}</p>
      <div className="atlas-value" style={{ color: atlasColor(value, layer) }} data-testid="atlas-layer-value">{value == null ? "?" : value.toFixed(1)}<span>{ATLAS_LAYERS[layer].unit}</span></div>
      <p className="atlas-condition">{ATLAS_LAYERS[layer].name}{layer === "wind" && value !== null ? r?.observation.weather.gustMph === null ? " · sustained (gust unavailable)" : " · gust" : ""}{value === null ? " · Unknown / no data" : ""}</p>
      <dl className="atlas-metrics">
        <div><dt>Risk</dt><dd data-testid="atlas-risk">{r?.risk == null ? "Unknown" : `${r.risk.toFixed(1)} / 10`}</dd></div>
        <div><dt>Coverage</dt><dd data-testid="atlas-coverage">{r ? `${r.observation.coverage.percent.toFixed(0)}%` : "Unknown"}</dd></div>
        <div><dt>Confidence</dt><dd>{r ? `${(r.confidence * 100).toFixed(0)}%${r.confidence < 0.5 ? " · LOW CONFIDENCE" : ""}` : "Unknown"}</dd></div>
        <div><dt>Lightning source</dt><dd>{r?.observation.lightning.evidenceMode ?? "UNAVAILABLE"}</dd></div>
      </dl>
      <div className="atlas-channels" aria-label="Hazard channels">{r?.channels.map(c => <details key={c.hazard}><summary><span>{names[c.hazard]}</span><strong style={{ color: atlasColor(c.score) }} data-testid={`channel-${c.hazard}`}>{c.score === null ? "Unknown" : c.score.toFixed(1)}</strong></summary><p>Confidence {(c.confidence * 100).toFixed(0)}%</p>{c.evidence.map((e, i) => <p key={i}>{e}</p>)}{c.factors.filter(f => f.score !== null).map((f, i) => <p key={`${f.key}:${i}`}>{f.key}: {f.score?.toFixed(1)} · {f.source} · {f.kind}</p>)}</details>)}</div>
      <div className="atlas-drivers"><p>Primary driver: <strong>{r?.explanation.primary ? names[r.explanation.primary.hazard] : "Unknown"}</strong></p><p>Compounding: {r?.explanation.compounding.filter(c => c.strength > 0).map(c => names[c.hazard]).join(", ") || "None established"}</p></div>
      {!!r?.activeOverrides.length && <section className="atlas-overrides" aria-label="Active policy overrides">{r.activeOverrides.map(o => <div key={o.id}><strong>{o.state === "HOLD" ? "STOP WORK" : "RESTRICTED"}</strong><p>{o.reason}</p>{o.source === "lightning" && r.observation.lightning.nearestStrikeMiles !== null && <p>Detected strike {r.observation.lightning.nearestStrikeMiles.toFixed(1)} miles away.</p>}{hour === 0 && o.expiresAt && o.source === "lightning" && <AllClear override={o}/>}</div>)}</section>}
      <dl className="atlas-tasks" aria-label="Task decisions">{r?.tasks.map(t => <div key={t.task}><dt>{TASK_LABELS[t.task]}</dt><dd>{t.state}</dd></div>)}</dl>
      {atlas?.limitations.map(line => <p className="atlas-error" key={line}>{line}</p>)}
      <div className="atlas-search"><label htmlFor="atlas-place-search">Find a site</label><input id="atlas-place-search" type="search" value={search} placeholder="Plant, EIA ID or state" onChange={e => setSearch(e.target.value)} />{matches.length > 0 && <div className="atlas-search-results">{matches.map(p => <button type="button" key={p.site.id} onClick={() => { onSelect(p.site.id); setSearch(""); }}>{p.site.name}</button>)}</div>}</div>
      <p className="atlas-freshness">{data.stale ? "CACHED / STALE · " : ""}{atlas?.validAt ? `Valid ${new Date(atlas.validAt).toLocaleString()}` : "Waiting for frame"}</p>
      {data.error && <p className="atlas-error" role="status">{data.error}</p>}
      <details className="atlas-sources"><summary>Evidence sources</summary>{Object.entries(r?.observation.provenance.providers ?? {}).map(([id, p]) => <p key={id}>{p.source}: {p.status} · {p.mode} · fetched {p.fetchedAt ?? "never"}{p.error ? ` · ${p.error}` : ""}</p>)}</details>
    </aside>
    <div className="atlas-timeline"><div className="atlas-time-heading"><button type="button" disabled={reducedMotion} onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause risk forecast" : "Play risk forecast"}>{playing ? "Ⅱ" : "▷"}</button><div><span>{hour === 0 ? "Now" : `+${hour} hours`}</span><strong>{data.loading ? "Loading authoritative frame…" : atlas?.validAt ? new Date(atlas.validAt).toLocaleString() : "Risk frame unavailable"}</strong></div><button type="button" className="atlas-now" onClick={() => { onHour(0); setPlaying(false); }}>Back to now</button></div><input aria-label="Forecast hour" type="range" min={0} max={72} step={1} value={hour} onChange={e => { setPlaying(false); onHour(Number(e.target.value)); }} /><div className="atlas-time-ticks"><span>Now</span><span>+24h</span><span>+48h</span><span>+72h</span></div></div>
    <div className="atlas-scale"><span>{ATLAS_LAYERS[layer].name} · {ATLAS_LAYERS[layer].unit}</span><i data-layer={layer}/><div><span>{ATLAS_LAYERS[layer].low}</span><span>{ATLAS_LAYERS[layer].high}</span></div><small>Gray / ? = unknown</small></div>
    <p className="atlas-coverage">{atlas?.sites.length ?? 0} sites · one authoritative backend frame{data.stale ? " · CACHED / STALE" : ""}<br/>{hour ? "Forecast screening · unavailable future evidence stays unknown" : "Live environmental risk · coverage and task policy remain separate"}</p>
  </>;
}
