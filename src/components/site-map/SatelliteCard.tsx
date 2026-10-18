import { useEffect, useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import type { Site } from "../../../shared/types";

// Esri World Imagery needs no key; one export request returns the whole site frame.
const SPAN = 0.012;
function imageryUrl(site: Site) {
  const lonSpan = SPAN / Math.max(Math.cos(site.latitude * Math.PI / 180), 0.2);
  const bbox = [site.longitude - lonSpan, site.latitude - SPAN * 0.5625, site.longitude + lonSpan, site.latitude + SPAN * 0.5625].map(v => v.toFixed(5)).join(",");
  return `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=3857&size=512,288&format=jpg&f=image`;
}

export default function SatelliteCard({ site }: { site: Site }) {
  const [open, setOpen] = useState(true), [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const url = imageryUrl(site);
  useEffect(() => setState("loading"), [url]);
  return <section className="atlas-satellite" aria-label={`Satellite view of ${site.name}`} data-open={open}>
    <button type="button" className="atlas-satellite-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>Satellite · {site.name}</span>{open ? <CaretUp size={13} aria-hidden="true"/> : <CaretDown size={13} aria-hidden="true"/>}
    </button>
    {open && <div className="atlas-satellite-frame" data-state={state}>
      <img key={url} src={url} alt={`Satellite imagery around ${site.name}`} loading="lazy" onLoad={() => setState("ready")} onError={() => setState("error")}/>
      <i className="atlas-satellite-crosshair" aria-hidden="true"/>
      {state === "loading" && <p role="status">Loading imagery…</p>}
      {state === "error" && <p role="status">Satellite imagery unavailable.</p>}
      <small>Imagery © Esri, Maxar, Earthstar Geographics</small>
    </div>}
  </section>;
}
