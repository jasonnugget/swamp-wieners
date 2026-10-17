'use client';
import { useEffect, useId, useMemo, useState } from "react";
import type { Site, TaskState } from "../../shared/types";
import type { SiteRiskSnapshot } from "../../shared/risk";
import { atlasColor } from "../../shared/atlas";
import { projectUS, statePolygons, type StateGeometry } from "./site-map/projection";
import "../styles/network-preview.css";

type Props = {
  sites: Site[];
  risks: Record<string, SiteRiskSnapshot>;
  selectedSite: Site;
  cached: boolean;
  onSelectSite: (id: string) => void;
};

const regions = {
  mainland: { west: -125, east: -66, north: 50, south: 24, x: 18, y: 16, width: 564, height: 292 },
  alaska: { west: -188, east: -129, north: 72, south: 51, x: 32, y: 299, width: 136, height: 91 },
  hawaii: { west: -161, east: -154, north: 23, south: 18, x: 191, y: 328, width: 80, height: 58 },
};
type Region = keyof typeof regions;
const riskGradient = `linear-gradient(90deg, ${[0, 2, 4, 6, 8, 10].map(value => atlasColor(value)).join(", ")})`;

function position(latitude: number, longitude: number, region: Region) {
  const bounds = regions[region];
  const northwest = projectUS(bounds.north, bounds.west);
  const southeast = projectUS(bounds.south, bounds.east);
  const point = projectUS(latitude, longitude);
  const scale = Math.min(bounds.width / (southeast.x - northwest.x), bounds.height / (southeast.z - northwest.z));
  return {
    x: bounds.x + (bounds.width - (southeast.x - northwest.x) * scale) / 2 + (point.x - northwest.x) * scale,
    y: bounds.y + (bounds.height - (southeast.z - northwest.z) * scale) / 2 + (point.z - northwest.z) * scale,
  };
}

function siteRegion(state: string): Region {
  return state === "AK" ? "alaska" : state === "HI" ? "hawaii" : "mainland";
}

function currentRisk(snapshot: SiteRiskSnapshot | undefined, cached: boolean) {
  return cached || snapshot?.observation.provenance.stale ? null : snapshot?.risk ?? null;
}

export default function NetworkPreview({ sites, risks, selectedSite, cached, onSelectSite }: Props) {
  const selectId = useId();
  const [geography, setGeography] = useState<StateGeometry>();
  const [mapUnavailable, setMapUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/data/us-states.geojson", { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Plant geography unavailable");
        return response.json() as Promise<StateGeometry>;
      })
      .then(setGeography)
      .catch(() => {
        if (!controller.signal.aborted) setMapUnavailable(true);
      });
    return () => controller.abort();
  }, []);

  const paths = useMemo(() => geography?.features.map(state => {
    const region: Region = state.properties.name === "Alaska" ? "alaska" : state.properties.name === "Hawaii" ? "hawaii" : "mainland";
    const d = statePolygons(state.geometry).map(polygon => polygon.map(ring => ring.map(([longitude, latitude], index) => {
      const point = position(latitude, longitude, region);
      return `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    }).join(" ") + "Z").join(" ")).join(" ");
    return { name: state.properties.name, d };
  }), [geography]);
  const options = useMemo(() => [...sites].sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name)), [sites]);
  const snapshot = risks[selectedSite.id];
  const stale = cached || !snapshot || snapshot.observation.provenance.stale;
  const risk = currentRisk(snapshot, cached);
  const task = snapshot?.tasks.find(item => item.task === "installation");
  const taskState: TaskState = stale && task?.state !== "HOLD" && task?.state !== "RESTRICTED" ? "UNKNOWN" : task?.state ?? "UNKNOWN";
  const holds = snapshot?.activeOverrides.filter(override => override.state === "HOLD") ?? [];
  const selectedPosition = position(selectedSite.latitude, selectedSite.longitude, siteRegion(selectedSite.state));

  return <section className="network-preview" aria-label="National plant preview">
    <div className="network-preview-core">
      <header className="network-preview-heading">
        <h2>Plant locations</h2>
        <span className="network-evidence-label" data-cached={stale}><i aria-hidden="true" />{cached ? "Cached evidence" : !snapshot ? "Evidence unavailable" : stale ? "Stale evidence" : "Current evidence"}</span>
      </header>
      <div className="network-geography" aria-busy={!geography && !mapUnavailable}>
        {geography ? <svg viewBox="0 0 600 410" className="network-map" role="img" aria-label={`Power plants across all 50 states. ${selectedSite.name}, ${selectedSite.state} selected. Use the plant selector below to explore.`}>
          <g className="network-map-grid" aria-hidden="true">
            {[100, 200, 300, 400, 500].map(x => <path key={`x-${x}`} d={`M${x} 8V398`} />)}
            {[100, 200, 300].map(y => <path key={`y-${y}`} d={`M8 ${y}H592`} />)}
          </g>
          <g className="network-map-land" aria-hidden="true">{paths?.map(state => <path key={state.name} d={state.d} />)}</g>
          <g aria-hidden="true">{sites.filter(site => site.id !== selectedSite.id).map(site => {
            const point = position(site.latitude, site.longitude, siteRegion(site.state));
            const value = currentRisk(risks[site.id], cached);
            return <circle key={site.id} cx={point.x} cy={point.y} r="2.8" className="network-map-dot" data-unknown={value === null} data-low-confidence={value !== null && risks[site.id]?.confidence < .5} fill={value === null ? "#f5f6f2" : atlasColor(value)} />;
          })}</g>
          <g className="network-map-selected" aria-hidden="true">
            <circle cx={selectedPosition.x} cy={selectedPosition.y} r="15" className="network-map-selection-halo" />
            <circle cx={selectedPosition.x} cy={selectedPosition.y} r="8" className="network-map-selection-ring" />
            <circle cx={selectedPosition.x} cy={selectedPosition.y} r="4" fill={risk === null ? "#a1aaa3" : atlasColor(risk)} />
          </g>
          <g className="network-inset-labels" aria-hidden="true"><text x="34" y="404">ALASKA</text><text x="192" y="404">HAWAII</text><text x="567" y="404" textAnchor="end">Insets not to scale</text></g>
        </svg> : <div className="network-map-placeholder" role="status"><div aria-hidden="true" />{mapUnavailable ? "Map unavailable. Select a plant below to inspect its evidence." : "Loading plant geography…"}</div>}
      </div>
      <div className="network-map-key"><span><i className="network-key-risk" aria-hidden="true" style={{ background: riskGradient }} />Risk · 0 low / 10 critical</span><span><i className="network-key-unknown" aria-hidden="true" />Unknown</span><span>EIA plant locations</span></div>
      <div className="network-selected-plant">
        <div className="network-select-field"><label htmlFor={selectId}>Explore a plant</label><select id={selectId} name="preview-plant" autoComplete="off" value={selectedSite.id} onChange={event => onSelectSite(event.target.value)}>{options.map(site => <option key={site.id} value={site.id}>{site.name} · {site.state}</option>)}</select></div>
        <div className="network-selected-readout" aria-live="polite" aria-atomic="true">
          <div className="network-selected-location"><span>{selectedSite.county} County, {selectedSite.state}</span><strong>{selectedSite.name}</strong></div>
          <div className="network-selected-state"><span>Outdoor installation</span><strong data-state={taskState}>{taskState}</strong></div>
        </div>
        <p className="network-selected-note">{stale ? "Fresh evidence unavailable. Current risk is unknown." : `Site risk ${risk === null ? "unknown" : `${risk.toFixed(1)} / 10`}${snapshot.confidence < .5 ? " · low confidence" : ""}. Decisions include independent safety controls.`}</p>
        {holds.length > 0 ? <details className="network-active-holds"><summary>{holds.length} {stale ? "recorded" : "active"} {holds.length === 1 ? "hold" : "holds"}</summary>{stale ? <p>Holds from the last snapshot remain in view. Refresh for current evidence.</p> : null}<ul>{holds.map(hold => <li key={hold.id}>{hold.reason}</li>)}</ul></details> : null}
      </div>
    </div>
  </section>;
}
