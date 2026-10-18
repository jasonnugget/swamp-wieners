import { useEffect, useMemo, useRef, useState } from "react";
import type { Decision, HazardReport, Site } from "../../../shared/types";
import type { ScenarioFrame } from "../../../shared/simulation";
import { scenarioBounds, scenarioDestination, scenarioFootprint, SIMULATION_COLORS, type GeographicPoint, type SimulationLayer } from "./scenario-geometry";
import {
  projectUS as project,
  normalizeLongitude,
  REGION,
  riskColor,
  atlasStates,
  statePolygons,
  unproject,
  type StateGeometry,
} from "./projection";

export default function FlatMap({
  sites,
  decisions,
  visuals,
  selected,
  onSelect,
  reports,
  onPin,
  pin,
  simulation,
  simulationLayer = "wind",
}: {
  sites: Site[];
  decisions: Record<string, Pick<Decision, "index" | "tasks" | "lightningUntil">>;
  visuals?: import("./scene").SceneData["visuals"];
  selected: string;
  onSelect(id: string): void;
  reports: HazardReport[];
  onPin?: (latitude: number, longitude: number) => void;
  pin?: { latitude: number; longitude: number };
  simulation?: ScenarioFrame;
  simulationLayer?: SimulationLayer;
  simulationPlaying?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [viewportRatio, setViewportRatio] = useState(1);
  const [states, setStates] = useState<StateGeometry>();
  useEffect(() => {
    if (!simulation || !container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) setViewportRatio(entry.contentRect.width / entry.contentRect.height);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [!!simulation]);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/data/us-states.geojson", { signal: abort.signal })
      .then((r) => r.json())
      .then(setStates)
      .catch(() => {});
    return () => abort.abort();
  }, []);
  const stateKey = onPin ? "*" : [...atlasStates(sites)].sort().join();
  // The atlas draws the Southeast plus states holding a site; the pin map keeps every state.
  const statePaths = useMemo(() => states?.features.filter(state => stateKey === "*" || stateKey.split(",").includes(state.properties.name)).map(state => statePolygons(state.geometry)
    .map(polygon => polygon.map(ring => ring.map(([longitude, latitude], index) => {
      const point = project(latitude, longitude > 0 ? longitude - 360 : longitude);
      return `${index ? "L" : "M"}${point.x},${point.z}`;
    }).join(" ") + "Z").join(" ")).join(" ")), [states, stateKey]);
  const site = sites.find((s) => s.id === selected) ?? sites[0];
  const simulationBounds = simulation && !onPin ? scenarioBounds(simulation) : undefined;
  const northwest =
    onPin && site
      ? project(site.latitude + 0.08, site.longitude - 0.1)
      : simulationBounds ? { x: simulationBounds.west - .5, z: simulationBounds.north - .5 } : project(REGION.north, REGION.west);
  const southeast =
    onPin && site
      ? project(site.latitude - 0.08, site.longitude + 0.1)
      : simulationBounds ? { x: simulationBounds.east + .5, z: simulationBounds.south + .5 } : project(REGION.south, REGION.east);
  if (simulationBounds) {
    const projectedWidth = southeast.x - northwest.x, projectedHeight = southeast.z - northwest.z;
    if (projectedWidth / projectedHeight < viewportRatio) {
      const padding = (projectedHeight * viewportRatio - projectedWidth) / 2;
      northwest.x -= padding; southeast.x += padding;
    } else {
      const padding = (projectedWidth / viewportRatio - projectedHeight) / 2;
      northwest.z -= padding; southeast.z += padding;
    }
  }
  const width = southeast.x - northwest.x,
    height = southeast.z - northwest.z;
  const position = (latitude: number, longitude: number) => {
    const p = project(latitude, longitude);
    return {
      left: `${((p.x - northwest.x) / width) * 100}%`,
      top: `${((p.z - northwest.z) / height) * 100}%`,
    };
  };
  const path = (points: GeographicPoint[]) => points.map((point, index) => {
    const projected = project(point.latitude, point.longitude);
    return `${index ? "L" : "M"}${projected.x},${projected.z}`;
  }).join(" ");
  const scenarioColor = SIMULATION_COLORS[simulationLayer];
  const stormCenter = simulation ? project(simulation.center.latitude, simulation.center.longitude) : undefined;
  return (
    <div ref={container} className="flat-map" data-testid="flat-map" data-simulation={!!simulation}>
      <svg
        className="flat-map-surface"
        aria-label={simulation ? "Flat map fallback with a simulated storm track and schematic exposure footprint. Canonical plant markers retain current evidence." : "Flat map fallback"}
        viewBox={`${northwest.x} ${northwest.z} ${width} ${height}`}
        preserveAspectRatio="none"
        onClick={(event) => {
          if (!onPin) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const p = unproject(
            northwest.x +
              ((event.clientX - bounds.left) / bounds.width) * width,
            northwest.z +
              ((event.clientY - bounds.top) / bounds.height) * height,
          );
          onPin(p.latitude, normalizeLongitude(p.longitude));
        }}
      >
        {statePaths?.map((statePath, index) => (
          <path
            key={index}
            d={statePath}
            style={{ fill: "var(--tone-22)", stroke: "var(--tone-50)" }}
            strokeWidth={onPin ? ".0003" : ".008"}
            fillRule="evenodd"
          />
        ))}
        {simulation && stormCenter ? <g className="flat-scenario-overlay" aria-hidden="true" pointerEvents="none">
          <path d={path(simulation.track)} fill="none" stroke="#c5b6a1" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
          <path d={path(simulation.traveledTrack)} fill="none" stroke="#e9aa6c" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          {simulation.active ? <>
            <path d={`${path(scenarioFootprint(simulation.center, simulation.config.radiusKm))}Z`} fill={scenarioColor} fillOpacity=".12" stroke="#e9aa6c" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            {simulation.kind === "hurricane" ? [0, 1, 2].map(arm => <path key={arm} d={path(Array.from({ length: 70 }, (_, index) => scenarioDestination(simulation.center, simulation.config.radiusKm * (.16 + index / 69 * .8), arm / 3 * Math.PI * 2 + index / 69 * Math.PI * 1.76 - simulation.progress * Math.PI * 2)))} fill="none" stroke="#e9aa6c" strokeOpacity=".7" strokeWidth="5" vectorEffect="non-scaling-stroke" />) : [.35, .65].map(radius => <path key={radius} d={`${path(scenarioFootprint(simulation.center, simulation.config.radiusKm * radius))}Z`} fill="none" stroke="#79c6cc" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
            <circle cx={stormCenter.x} cy={stormCenter.z} r={Math.max(width, height) * .009} style={{ fill: "var(--tone-15)" }} stroke="#fff1d8" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </> : null}
          {simulationLayer === "runoff" ? sites.map(site => {
            const runoff = simulation.impacts[site.id]?.runoffMm ?? 0;
            if (runoff < 3) return null;
            const point = project(site.latitude, site.longitude);
            return <circle key={site.id} cx={point.x} cy={point.z} r={.1 + Math.min(runoff / 120, 1) * .22} fill="none" stroke="#79c6cc" strokeWidth="3" strokeOpacity=".7" vectorEffect="non-scaling-stroke" />;
          }) : null}
        </g> : null}
      </svg>
      {simulation ? <div className="scenario-map-label" style={{ ...position(simulation.center.latitude, simulation.center.longitude), transform: "translate(-50%, -150%)" }}>SIMULATED · {simulation.active ? simulation.kind === "hurricane" ? "Hurricane" : "Rainfall" : "Track complete"}</div> : null}
      {sites.map((s) => (
        <button
          type="button"
          key={s.id}
          className={`flat-beacon ${s.id === selected ? "is-selected" : ""} ${visuals && visuals[s.id]?.confidence < 0.5 ? "has-low-confidence" : ""}`}
          style={
            {
              ...position(s.latitude, s.longitude),
              "--beacon-color": visuals?.[s.id]?.color ?? riskColor(decisions[s.id]?.index),
            } as React.CSSProperties
          }
          aria-label={`${s.name}, ${visuals?.[s.id]?.label ?? "risk"} ${visuals ? visuals[s.id]?.value ?? "unknown" : decisions[s.id]?.index ?? "unknown"}`}
          onClick={() => onSelect(s.id)}
        >
          {(visuals ? visuals[s.id]?.value : decisions[s.id]?.index)?.toFixed(1) ?? "?"}
        </button>
      ))}
      {reports
        .filter((r) => r.status === "open")
        .map((r) => (
          <button
            type="button"
            key={r.id}
            className="flat-report"
            style={position(r.latitude, r.longitude)}
            aria-label={`Crew report: ${r.description}`}
            onClick={() => onSelect(r.siteId)}
          >
            !
          </button>
        ))}
      {pin && (
        <span
          className="flat-report is-draft"
          style={position(pin.latitude, pin.longitude)}
        >
          +
        </span>
      )}
    </div>
  );
}
