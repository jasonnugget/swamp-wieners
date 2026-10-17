import { useEffect, useRef, useState } from "react";
import {
  Compass,
  Crosshair,
  Layers3,
  Maximize2,
  Minimize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
} from "lucide-react";
import type { Decision, HazardReport, Site } from "../../shared/types";
import { TASK_LABELS } from "../../shared/policy";
import { riskColor } from "./site-map/projection";
import type { MapScene, SceneData } from "./site-map/scene";
import FlatMap from "./site-map/FlatMap";
import "../styles/site-map.css";

export default function SiteMap({
  sites,
  decisions,
  selected,
  onSelect,
  reports = [],
  onPin,
  pin,
}: {
  sites: Site[];
  decisions: Record<string, Decision>;
  selected: string;
  onSelect: (id: string) => void;
  reports?: HazardReport[];
  onPin?: (latitude: number, longitude: number) => void;
  pin?: { latitude: number; longitude: number };
}) {
  const container = useRef<HTMLDivElement>(null),
    labels = useRef<HTMLDivElement>(null),
    showcaseButton = useRef<HTMLButtonElement>(null),
    scene = useRef<MapScene | null>(null);
  const [ready, setReady] = useState(false),
    [fallback, setFallback] = useState(false),
    [moduleError, setModuleError] = useState(false),
    [geographyError, setGeographyError] = useState(false);
  const [expanded, setExpanded] = useState(false),
    [rotating, setRotating] = useState(false),
    [top, setTop] = useState(!!onPin),
    [hovered, setHovered] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const previousSelected = useRef(selected),
    callbacks = useRef({ onSelect, onPin });
  const data = useRef<SceneData>({ sites, decisions, selected, reports, pin });
  callbacks.current = { onSelect, onPin };
  data.current = { sites, decisions, selected, reports, pin };
  const active = sites.find((s) => s.id === (hovered ?? selected)) ?? sites[0],
    decision = active ? decisions[active.id] : undefined;
  const heldTasks = decision?.tasks.filter((t) => t.state === "HOLD") ?? [];

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
              },
              ...(callbacks.current.onPin
                ? {
                    pin: (latitude: number, longitude: number) =>
                      callbacks.current.onPin?.(latitude, longitude),
                  }
                : {}),
              hover: setHovered,
              interact: () => setRotating(false),
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
  }, [sites, decisions, selected, reports, pin, ready]);
  useEffect(() => {
    if (previousSelected.current === selected) return;
    previousSelected.current = selected;
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

  function reset() {
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
    setRotating(value);
    scene.current?.rotate(value);
  }
  return (
    <div
      className={`map-wrap command-map ${onPin ? "is-pinning" : ""} ${expanded ? "is-expanded" : ""}`}
      data-testid="site-map"
      aria-label={onPin ? "Hazard location map" : "Site risk map"}
    >
      <div className="scene-vignette" />
      <div ref={container} className="site-map scene-surface" />
      <div ref={labels} className="scene-labels" />
      {fallback && (
        <FlatMap
          sites={sites}
          decisions={decisions}
          selected={selected}
          onSelect={onSelect}
          reports={reports}
          onPin={onPin}
          pin={pin}
        />
      )}
      {!ready && (
        <div className="scene-loading">
          <Layers3 size={24} />
          <span>Building your regional view…</span>
        </div>
      )}
      {!onPin && (
        <>
          <div className="scene-heading">
            <span className="scene-mode">
              <span />
              {fallback ? "2D SITE MAP" : "FIELD INTELLIGENCE · 3D VIEW"}
            </span>
            <h4>Southeast command view</h4>
            <p>{sites.length} actual plants · one connected risk picture</p>
          </div>
          <div className="scene-top-actions">
            <button
              type="button"
              onClick={reset}
              disabled={!ready || fallback}
              aria-label="Fit all sites"
              title="Fit the region"
            >
              <RotateCcw size={13} />
              <span>Fit region</span>
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
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
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
              <Layers3 size={15} />
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
              {rotating ? <Pause size={15} /> : <Play size={15} />}
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
          <Plus size={16} />
        </button>
        <button
          type="button"
          disabled={!ready || fallback}
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => scene.current?.zoom(1.33)}
        >
          <Minus size={16} />
        </button>
        {!onPin && (
          <button
            type="button"
            disabled={!ready || fallback || !active}
            aria-label="Focus selected site"
            title="Fly to selected site"
            onClick={() => {
              if (active) scene.current?.focus(active);
            }}
          >
            <Crosshair size={15} />
          </button>
        )}
      </div>
      {!onPin && active && (
        <div
          className="scene-site-card"
          style={
            {
              "--active-risk": riskColor(decision?.index),
            } as React.CSSProperties
          }
        >
          <div className="scene-site-icon">
            <MapBeacon />
          </div>
          <div>
            <span>
              {hovered ? "INSPECT SITE" : "SELECTED SITE"} · EIA {active.id}
            </span>
            <strong>{active.name}</strong>
            <p>
              {heldTasks.length
                ? heldTasks.map((t) => TASK_LABELS[t.task]).join(", ") +
                  " on hold"
                : `${active.county}, ${active.state} · ${decision?.unknownCount ?? 7} channels need verification`}
            </p>
          </div>
          <div className="scene-site-score">
            {decision?.index?.toFixed(1) ?? "?"}
            <small>/ 10</small>
          </div>
        </div>
      )}
      {!onPin && (
        <div className="scene-bottom">
          <div className="scene-legend">
            <span>
              <i style={{ background: "#c9ee8d" }} />
              Lower
            </span>
            <span>
              <i style={{ background: "#f0c477" }} />
              Elevated
            </span>
            <span>
              <i style={{ background: "#ff9676" }} />
              High
            </span>
            <span>
              <i style={{ background: "#9cabb4" }} />
              Unknown
            </span>
          </div>
          <span className="scene-help">
            <Compass size={12} />
            Drag to orbit · scroll to zoom
          </span>
        </div>
      )}
      <div className="scene-disclosure">
        {onPin
          ? "Top-down · drag to pan · click to pin"
          : "Height = risk · schematic state relief · bundled geography"}
      </div>
      {(fallback || geographyError) && (
        <div className="scene-warning" role="status">
          {fallback
            ? moduleError
              ? "3D map files could not load. Reload to retry. Selection and pinning remain available in 2D."
              : "3D graphics unavailable. Selection and pinning remain available in 2D."
            : "State outlines unavailable. Site coordinates and risk markers remain active."}
        </div>
      )}
      {expanded && (
        <div className="scene-showcase-caption">
          <span>PLANIT CONTROL</span>
          <strong>
            Know the ground.
            <br />
            Plan the next shift.
          </strong>
          <p>
            Forecast signals, active restrictions, and crew knowledge at every
            location.
          </p>
        </div>
      )}
    </div>
  );
}
function MapBeacon() {
  return (
    <svg
      width="18"
      height="22"
      viewBox="0 0 18 22"
      fill="none"
      aria-hidden="true"
    >
      <path d="M9 2v15M5 19h8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 21h14" stroke="currentColor" opacity=".4" />
    </svg>
  );
}
