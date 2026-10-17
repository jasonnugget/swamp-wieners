import { useEffect, useState } from "react";
import type { Decision, HazardReport, Site } from "../../../shared/types";
import {
  projectUS as project,
  normalizeLongitude,
  REGION,
  riskColor,
  statePolygons,
  unproject,
  type StateGeometry,
} from "./projection";

export default function FlatMap({
  sites,
  decisions,
  selected,
  onSelect,
  reports,
  onPin,
  pin,
}: {
  sites: Site[];
  decisions: Record<string, Decision>;
  selected: string;
  onSelect(id: string): void;
  reports: HazardReport[];
  onPin?: (latitude: number, longitude: number) => void;
  pin?: { latitude: number; longitude: number };
}) {
  const [states, setStates] = useState<StateGeometry>();
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/data/us-states.geojson", { signal: abort.signal })
      .then((r) => r.json())
      .then(setStates)
      .catch(() => {});
    return () => abort.abort();
  }, []);
  const site = sites.find((s) => s.id === selected) ?? sites[0];
  const northwest =
    onPin && site
      ? project(site.latitude + 0.08, site.longitude - 0.1)
      : project(REGION.north, REGION.west);
  const southeast =
    onPin && site
      ? project(site.latitude - 0.08, site.longitude + 0.1)
      : project(REGION.south, REGION.east);
  const width = southeast.x - northwest.x,
    height = southeast.z - northwest.z;
  const position = (latitude: number, longitude: number) => {
    const p = project(latitude, longitude);
    return {
      left: `${((p.x - northwest.x) / width) * 100}%`,
      top: `${((p.z - northwest.z) / height) * 100}%`,
    };
  };
  return (
    <div className="flat-map" data-testid="flat-map">
      <svg
        className="flat-map-surface"
        aria-label="Flat map fallback"
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
        {states?.features.map((state, index) => (
          <path
            key={index}
            d={statePolygons(state.geometry)
              .map((polygon) =>
                polygon
                  .map(
                    (ring) =>
                      ring
                        .map(([longitude, latitude], i) => {
                          const p = project(latitude, longitude > 0 ? longitude - 360 : longitude);
                          return `${i ? "L" : "M"}${p.x},${p.z}`;
                        })
                        .join(" ") + "Z",
                  )
                  .join(" "),
              )
              .join(" ")}
            fill="#2d4b40"
            stroke="#799b7e"
            strokeWidth={onPin ? ".0003" : ".008"}
            fillRule="evenodd"
          />
        ))}
      </svg>
      {sites.map((s) => (
        <button
          type="button"
          key={s.id}
          className={`flat-beacon ${s.id === selected ? "is-selected" : ""}`}
          style={
            {
              ...position(s.latitude, s.longitude),
              "--beacon-color": riskColor(decisions[s.id]?.index),
            } as React.CSSProperties
          }
          aria-label={`${s.name}, risk ${decisions[s.id]?.index ?? "unknown"}`}
          onClick={() => onSelect(s.id)}
        >
          {decisions[s.id]?.index?.toFixed(0) ?? "?"}
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
