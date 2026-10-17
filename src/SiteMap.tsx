import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Decision, HazardReport, Site } from "../shared/types";
maplibregl.setWorkerUrl(workerUrl);
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
    map = useRef<maplibregl.Map | null>(null),
    markers = useRef<maplibregl.Marker[]>([]),
    callbacks = useRef({ onSelect, onPin }),
    previousSelected = useRef(selected);
  callbacks.current = { onSelect, onPin };
  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      center: [-84.5, 29.7],
      zoom: 4.6,
      maxZoom: 13,
      minZoom: 3,
      attributionControl: false,
      style: {
        version: 8,
        sources: { states: { type: "geojson", data: "/data/states.geojson" } },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#e3eae2" },
          },
          {
            id: "land",
            type: "fill",
            source: "states",
            paint: { "fill-color": "#f0f2e8" },
          },
          {
            id: "borders",
            type: "line",
            source: "states",
            paint: { "line-color": "#c3d0bd", "line-width": 1 },
          },
        ],
      },
    });
    if (sites.length > 1)
      m.fitBounds(
        [
          [-94, 24],
          [-79, 34],
        ],
        { padding: 30, duration: 0 },
      );
    else if (sites[0])
      m.jumpTo({ center: [sites[0].longitude, sites[0].latitude], zoom: 10 });
    m.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    m.on("click", (e) => callbacks.current.onPin?.(e.lngLat.lat, e.lngLat.lng));
    map.current = m;
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    for (const site of sites) {
      const value = decisions[site.id]?.index;
      const b = document.createElement("button");
      b.type = "button";
      b.className = `map-dot ${value === null || value === undefined ? "unknown" : value >= 8 ? "danger" : value >= 5 ? "warning" : "safe"} ${site.id === selected ? "selected" : ""}`;
      b.textContent = value?.toFixed(0) ?? "?";
      b.setAttribute("aria-label", `${site.name}, risk ${value ?? "unknown"}`);
      b.title = site.name;
      b.onclick = (e) => {
        e.stopPropagation();
        callbacks.current.onSelect(site.id);
      };
      markers.current.push(
        new maplibregl.Marker({ element: b })
          .setLngLat([site.longitude, site.latitude])
          .addTo(m),
      );
    }
    for (const report of reports.filter((r) => r.status === "open")) {
      const el = document.createElement("div");
      el.className = "report-pin";
      el.textContent = "!";
      el.title = report.description;
      markers.current.push(
        new maplibregl.Marker({ element: el })
          .setLngLat([report.longitude, report.latitude])
          .addTo(m),
      );
    }
    if (pin) {
      const el = document.createElement("div");
      el.className = "report-pin draft";
      el.textContent = "+";
      markers.current.push(
        new maplibregl.Marker({ element: el })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(m),
      );
    }
  }, [sites, decisions, selected, reports, pin]);
  useEffect(() => {
    if (previousSelected.current === selected) return;
    previousSelected.current = selected;
    const site = sites.find((s) => s.id === selected);
    if (site && map.current)
      map.current.easeTo({
        center: [site.longitude, Math.min(31, site.latitude + 1)],
        zoom: 5,
        duration: 600,
      });
  }, [selected, sites]);
  return (
    <div className="map-wrap">
      <div ref={container} className="site-map" />
      {sites.length > 1 && (
        <button
          className="map-fit"
          onClick={() =>
            map.current?.fitBounds(
              [
                [-94, 24],
                [-79, 34],
              ],
              { padding: 30, duration: 500 },
            )
          }
        >
          Fit all 50 sites ↗
        </button>
      )}
      <span className="map-label label-gulf">Gulf of Mexico</span>
      <div className="map-key">
        <span>
          <i className="green" />
          Lower
        </span>
        <span>
          <i className="orange" />
          Elevated
        </span>
        <span>
          <i className="red" />
          High
        </span>
      </div>
      <div className="map-credit">
        EIA plants · bundled state outlines · no tile connection needed
      </div>
    </div>
  );
}
