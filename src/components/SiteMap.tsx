import { useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Stack as Layers3,
  ArrowsOut as Maximize2,
  ArrowsIn as Minimize2,
  Minus,
  Pause,
  Play,
  Plus,
  ArrowCounterClockwise as RotateCcw,
  IconContext,
  Hurricane,
  GlobeHemisphereWest,
} from "@phosphor-icons/react";
import type { Decision, HazardReport, Site } from "../../shared/types";
import type { MapScene, SceneData } from "./site-map/scene";
import FlatMap from "./site-map/FlatMap";
import RiskControls from "./site-map/RiskControls";
import { AtlasEntrance } from "./site-map/AtlasMotion";
import { useRiskAtlas } from "../lib/useRiskAtlas";
import { atlasValue, atlasColor, atlasFraction, ATLAS_LAYERS, type RiskLayer } from "../../shared/atlas";
import type { SiteRiskSnapshot } from "../../shared/risk";
import type { MapRegion } from "../../shared/weather";
import { useSimulation } from "../features/simulation/useSimulation";
import SimulationControls from "../features/simulation/SimulationControls";
const EMPTY_RISKS: Record<string, SiteRiskSnapshot> = {};
import "../styles/site-map.css";
import "../styles/weather-atlas.css";
import "../styles/simulation.css";

export default function SiteMap({
  sites,
  decisions,
  risks = EMPTY_RISKS,
  selected,
  onSelect,
  reports = [],
  onPin,
  pin,
  standalone = false,
}: {
  sites: Site[];
  decisions: Record<string, Decision>;
  risks?: Record<string, SiteRiskSnapshot>;
  selected: string;
  onSelect: (id: string) => void;
  reports?: HazardReport[];
  onPin?: (latitude: number, longitude: number) => void;
  pin?: { latitude: number; longitude: number };
  standalone?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    container = useRef<HTMLDivElement>(null),
    labels = useRef<HTMLDivElement>(null),
    showcaseButton = useRef<HTMLButtonElement>(null),
    scene = useRef<MapScene | null>(null);
  const [ready, setReady] = useState(false),
    [fallback, setFallback] = useState(false),
    [moduleError, setModuleError] = useState(false),
    [geographyError, setGeographyError] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth > 760);
  const [expanded, setExpanded] = useState(false),
    [rotating, setRotating] = useState(false),
    [top, setTop] = useState(!!onPin),
    [hovered, setHovered] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const previousSelected = useRef(selected),
    callbacks = useRef({ onSelect, onPin });
  const [layer, setLayer] = useState<RiskLayer>("risk"),
    [hour, setHour] = useState(0),
    [region, setRegion] = useState<MapRegion>("mainland");
  const simulation = useSimulation(sites, reducedMotion);
  const [simulationInspection, setSimulationInspection] = useState(0);
  const atlas = useRiskAtlas(!onPin, 0, sites, risks);
  const forecast = useRiskAtlas(!onPin && !simulation.enabled && hour > 0, hour, sites, risks, selected);
  const inspection = hour > 0 ? forecast : atlas;
  const mapDecisions = useMemo(() => onPin ? decisions : Object.fromEntries((atlas.atlas?.sites ?? []).map(({ site, snapshot: r }) => [site.id, {
    index: r.risk, tasks: r.tasks, unknownCount: r.channels.filter(c => c.score === null).length,
    lightningUntil: r.activeOverrides.find(o => o.source === "lightning" && o.state === "HOLD")?.expiresAt ?? null,
  }])), [onPin, decisions, atlas.atlas]);
  const visuals = useMemo(() => {
    if (onPin) return undefined;
    const frames = new Map(atlas.atlas?.sites.map(p => [p.site.id, p.snapshot]) ?? []);
    return Object.fromEntries(sites.map(site => {
      const frame = frames.get(site.id), value = atlasValue(frame, layer);
      return [site.id, { value, color: atlasColor(value, layer), fraction: value === null ? 0 : atlasFraction(value, layer), confidence: frame?.confidence ?? 0, unit: ATLAS_LAYERS[layer].unit, label: ATLAS_LAYERS[layer].name }];
    }));
  }, [onPin, sites, atlas.atlas, layer]);
  const currentRisks = useMemo(() => {
    const latest = Object.fromEntries((atlas.atlas?.sites ?? []).map(p => [p.site.id, p.snapshot]));
    // SSE can deliver a new hold before the separate atlas request succeeds.
    for (const [id, risk] of Object.entries(risks)) {
      if (!latest[id] || Date.parse(risk.generatedAt) > Date.parse(latest[id].generatedAt)) latest[id] = risk;
    }
    return latest;
  }, [atlas.atlas, risks]);
  const data = useRef<SceneData>({ sites, decisions: mapDecisions, selected, reports, pin, visuals, hour: 0, layer });
  callbacks.current = { onSelect: inspectSite, onPin };
  data.current = { sites, decisions: mapDecisions, selected, reports, pin, visuals, hour: 0, layer, simulation: simulation.frame, simulationLayer: simulation.layer, simulationPlaying: simulation.playing };
  const active = sites.find((s) => s.id === (hovered ?? selected)) ?? sites[0];

  useEffect(() => {
    let cancelled = false;
    void import("./site-map/scene")
      .then(({ createMapScene }) => {
        if (cancelled || !container.current || !labels.current) return;
        try {
          scene.current = createMapScene(
            container.current,
            labels.current,
            data.current,
            {
              select(id) {
                previousSelected.current = id;
                const site = data.current.sites.find((s) => s.id === id);
                if (site) scene.current?.focus(site);
                setRotating(false);
                scene.current?.rotate(false);
                callbacks.current.onSelect(id);
                setInspectorOpen(true);
              },
              ...(callbacks.current.onPin
                ? {
                    pin: (latitude: number, longitude: number) =>
                      callbacks.current.onPin?.(latitude, longitude),
                  }
                : {}),
              hover: setHovered,
              interact: () => { setRotating(false); leaveSite(); },
              ready: () => {
                if (!cancelled) setReady(true);
              },
              geographyError: () => {
                if (!cancelled) setGeographyError(true);
              },
            },
          );
        } catch (error) {
          console.error("Unable to initialize the 3D site map", error);
          container.current.replaceChildren();
          setFallback(true);
          setReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Unable to load the 3D site map module", error);
          setModuleError(true);
          setFallback(true);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  useEffect(() => {
    scene.current?.update(data.current);
  }, [sites, mapDecisions, selected, reports, pin, visuals, layer, ready, simulation.frame, simulation.layer, simulation.playing]);
  useEffect(() => {
    if (simulation.enabled && data.current.simulation) scene.current?.frameScenario(data.current.simulation);
  }, [simulation.enabled, simulation.config.presetId, simulation.config.latitudeOffset, simulation.config.longitudeOffset, simulation.config.radiusKm, ready]);
  useEffect(() => {
    if (previousSelected.current === selected) return;
    previousSelected.current = selected;
    if (!onPin) setInspectorOpen(true);
    const site = sites.find((s) => s.id === selected);
    if (site) {
      scene.current?.focus(site);
      scene.current?.rotate(false);
      setRotating(false);
    }
  }, [selected, sites]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      setReducedMotion(media.matches);
      if (media.matches) {
        setRotating(false);
        scene.current?.rotate(false);
      }
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        setRotating(false);
        scene.current?.rotate(false);
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", escape);
      showcaseButton.current?.focus({ preventScroll: true });
    };
  }, [expanded]);

  function inspectSite(id: string) {
    if (simulation.enabled) setSimulationInspection(value => value + 1);
    setInspectorOpen(true);
    onSelect(id);
  }
  function leaveSite() {
    setHour(0);
  }
  function selectRegion(next: MapRegion) {
    leaveSite();
    setRegion(next);
    setRotating(false);
    scene.current?.rotate(false);
    const site = sites.find(s => next === "alaska" ? s.state === "AK" : next === "hawaii" ? s.state === "HI" : !["AK", "HI"].includes(s.state));
    if (site) {
      // Region navigation updates workspace context without focusing a plant.
      previousSelected.current = site.id;
      onSelect(site.id);
    }
    scene.current?.region(next);
  }
  function reset() {
    leaveSite();
    scene.current?.rotate(false);
    setRotating(false);
    scene.current?.fit();
  }
  function changeTop() {
    const value = !top;
    setTop(value);
    setRotating(false);
    scene.current?.rotate(false);
    scene.current?.topDown(value);
  }
  function changeRotation() {
    if (top) {
      setTop(false);
      scene.current?.topDown(false);
    }
    const value = !rotating;
    if (value) leaveSite();
    setRotating(value);
    scene.current?.rotate(value);
  }
  function setSimulationMode(enabled: boolean) {
    leaveSite();
    setRotating(false);
    scene.current?.rotate(false);
    simulation.setEnabled(enabled);
    setSimulationInspection(0);
    if (!enabled) scene.current?.region(region);
  }
  return (
    <IconContext.Provider value={{ weight: "light" }}>
    <div
      ref={root}
      className={`map-wrap command-map ${onPin ? "is-pinning" : "weather-atlas"} ${simulation.enabled ? "is-simulating" : ""} ${expanded ? "is-expanded" : ""}`}
      data-testid="site-map"
      aria-label={onPin ? "Hazard location map" : "Site risk map"}
    >
      {!onPin && <AtlasEntrance root={root} enabled={ready}/>}
      <div className={onPin ? "pin-viewport" : "atlas-map-region"}>
      <div className="scene-vignette" />
      <div ref={container} className="site-map scene-surface" />
      <div ref={labels} className="scene-labels" />
      {fallback && (
        <FlatMap
          sites={sites}
          decisions={mapDecisions}
          visuals={visuals}
          selected={selected}
          onSelect={inspectSite}
          reports={reports}
          onPin={onPin}
          pin={pin}
          simulation={simulation.frame}
          simulationLayer={simulation.layer}
          simulationPlaying={simulation.playing}
        />
      )}
      {!ready && (
        <div className="scene-loading">
          <Layers3 aria-hidden="true" size={24} />
          <span className="visually-hidden">Building your national view…</span>
        </div>
      )}
      </div>
      {!onPin && (
        <>
          <div className="atlas-mode-switch" role="group" aria-label="Atlas mode">
            <button type="button" aria-pressed={!simulation.enabled} onClick={() => setSimulationMode(false)}><GlobeHemisphereWest size={16} aria-hidden="true"/>Current conditions</button>
            <button type="button" aria-pressed={simulation.enabled} onClick={() => setSimulationMode(true)}><Hurricane size={17} aria-hidden="true"/>Simulate</button>
          </div>
          {standalone && <h1 className="visually-hidden">{simulation.enabled ? "What if the storm shifts?" : "Site risk, in perspective."}</h1>}
          <div className="scene-top-actions">
            <button
              type="button"
              onClick={() => simulation.frame ? scene.current?.frameScenario(simulation.frame) : reset()}
              disabled={!ready || fallback}
              aria-label={simulation.enabled ? "Fit storm track" : "Fit all sites"}
              title="Fit the region"
            >
              <RotateCcw aria-hidden="true" size={13} />
              <span>{simulation.enabled ? "Fit storm" : "Fit plants"}</span>
            </button>
            <button
              ref={showcaseButton}
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-label={
                expanded ? "Exit showcase mode" : "Open showcase mode"
              }
              title={
                expanded ? "Exit showcase · Esc" : "Expand for presentation"
              }
            >
              {expanded ? <Minimize2 aria-hidden="true" size={14} /> : <Maximize2 aria-hidden="true" size={14} />}
              <span>{expanded ? "Exit showcase" : "Showcase"}</span>
            </button>
          </div>
        </>
      )}
      <div className="scene-controls" aria-label="Map camera controls">
        {!onPin && (
          <>
            <button
              type="button"
              onClick={changeTop}
              disabled={!ready || fallback}
              aria-label={top ? "Use 3D perspective" : "Use top-down view"}
              aria-pressed={top}
              title="Toggle overhead / perspective"
            >
              <Layers3 aria-hidden="true" size={15} />
            </button>
            <button
              type="button"
              onClick={changeRotation}
              disabled={!ready || fallback || reducedMotion}
              aria-label={
                rotating ? "Pause map rotation" : "Rotate map automatically"
              }
              aria-pressed={rotating}
              title={
                reducedMotion
                  ? "Automatic rotation follows your reduced-motion preference"
                  : "Slow presentation orbit"
              }
            >
              {rotating ? <Pause aria-hidden="true" size={15} /> : <Play aria-hidden="true" size={15} />}
            </button>
            <span />
          </>
        )}
        <button
          type="button"
          disabled={!ready || fallback}
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => scene.current?.zoom(0.75)}
        >
          <Plus aria-hidden="true" size={16} />
        </button>
        <button
          type="button"
          disabled={!ready || fallback}
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => { leaveSite(); scene.current?.zoom(1.33); }}
        >
          <Minus aria-hidden="true" size={16} />
        </button>
        {!onPin && (
          <button
            type="button"
            disabled={!ready || fallback || !active}
            aria-label="Focus selected site"
            title="Fly to selected site"
            onClick={() => {
              if (active) { inspectSite(active.id); scene.current?.focus(active); }
            }}
          >
            <Crosshair aria-hidden="true" size={15} />
          </button>
        )}
      </div>
      {!onPin && !simulation.enabled && <RiskControls
        reports={reports}
        data={inspection} currentData={atlas} sites={sites} layer={layer} hour={hour} region={region} selected={selected} reducedMotion={reducedMotion}
        onLayer={setLayer} onHour={setHour}
        onRegion={selectRegion}
        onSelect={inspectSite}
        inspectorOpen={inspectorOpen} onInspector={open => { if (open) inspectSite(selected); else setInspectorOpen(false); }}
      />}
      {!onPin && simulation.enabled && <SimulationControls simulation={simulation} sites={sites} selected={selected} risks={currentRisks} stale={atlas.stale} reducedMotion={reducedMotion} inspectRequest={simulationInspection} onSelect={inspectSite} onFrame={() => simulation.frame && scene.current?.frameScenario(simulation.frame)} onCurrent={() => {
        setSimulationMode(false); inspectSite(selected);
        requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(".atlas-inspector-close")?.focus());
      }}/ >}
      {onPin && <div className="scene-disclosure">Top-down · drag to pan · click to pin</div>}
      {(fallback || geographyError) && (
        <div className="scene-warning" role="status">
          {fallback
            ? moduleError
              ? "3D map files could not load. Reload to retry. Selection and pinning remain available in 2D."
              : "3D graphics unavailable. Selection and pinning remain available in 2D."
            : "State outlines unavailable. Site coordinates and risk markers remain active."}
        </div>
      )}
    </div>
    </IconContext.Provider>
  );
}
