'use client';
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "@phosphor-icons/react";
import type { Site, WeatherScreening } from "../../shared/types";
import { SignalFigure } from "./FieldSignals";

const HOUR = 3600000;
// Same freshness windows used by backend normalization, for raw NWS display only.
const fresh = (time: string, now: number, ttl: number) => now >= Date.parse(time) && now - Date.parse(time) < ttl;
export default function WeatherOutlook({ sites, screenings, paused, cached }: { sites: Site[]; screenings: Record<string, WeatherScreening>; paused: boolean; cached: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [chosen, setChosen] = useState<string | null>(null), [hour, setHour] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true), [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const now = Math.floor(Date.now() / HOUR) * HOUR;
  const candidates = useMemo(() => sites.flatMap(site => {
    const source = screenings[site.id];
    if (!source || !fresh(source.fetchedAt, Date.now(), 3 * HOUR) || !fresh(source.issuedAt, Date.now(), 24 * HOUR)) return [];
    const hours = Array.from({ length: 24 }, (_, i) => {
      const time = now + i * HOUR;
      const h = source.hours.find(h => Math.floor(Date.parse(h.time) / HOUR) * HOUR === time);
      return { time, heat: h?.heatIndex ?? null, wind: h?.windKmh == null ? null : h.windKmh / 1.609344 };
    });
    const heat = hours.flatMap(h => h.heat === null ? [] : [h.heat]);
    return heat.length ? [{ site, source, hours, peak: Math.max(...heat) }] : [];
  }).sort((a, b) => b.peak - a.peak || a.site.id.localeCompare(b.site.id)), [sites, screenings, now]);
  // Spotlight the warmest forecast automatically. Site selection is optional.
  const entry = candidates.find(c => c.site.id === chosen) ?? candidates[0];
  const peakIndex = entry ? entry.hours.findIndex(h => h.heat === entry.peak) : 0;
  const index = hour ?? Math.max(0, peakIndex), reading = entry?.hours[index];
  useEffect(() => { setHour(null); }, [entry?.site.id]);
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!playing || !visible || paused || reduced || cached || !entry) return;
    const timer = setInterval(() => setHour(h => ((h ?? peakIndex) + 1) % 24), 1600);
    return () => clearInterval(timer);
  }, [playing, visible, paused, reduced, cached, entry?.site.id, peakIndex]);
  const formatHour = (time: number) => new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: entry?.site.timezone, timeZoneName: "short" }).format(time);
  const values = entry?.hours.flatMap(h => h.heat === null ? [] : [h.heat]) ?? [];
  const low = values.length ? Math.floor((Math.min(...values) - 5) / 10) * 10 : 0;
  const high = values.length ? Math.max(low + 20, Math.ceil((Math.max(...values) + 5) / 10) * 10) : 100;
  const y = (heat: number) => 215 - (heat - low) / (high - low) * 175;
  const x = (i: number) => 36 + i * (408 / 23);
  const segments: { x: number; y: number }[][] = [];
  entry?.hours.forEach((h, i) => { if (h.heat === null) return; if (!i || entry.hours[i - 1].heat === null) segments.push([]); segments.at(-1)!.push({ x: x(i), y: y(h.heat) }); });
  const windMax = Math.max(10, Math.ceil(Math.max(0, ...(entry?.hours.map(h => h.wind ?? 0) ?? [])) / 5) * 5);
  const scrub = (value: number) => { setHour(value); setPlaying(false); };
  return <div ref={root}><SignalFigure label="Automatic 24-hour heat and wind outlook" paused={paused}>
    <figcaption><span>Find the hottest hour</span><span>NOAA/NWS · next 24 hours</span></figcaption>
    {entry ? <>
      <div className="outlook-place"><span>{chosen === entry.site.id ? "Plant outlook" : "Automatic spotlight"} / {entry.site.name}, {entry.site.state}</span><button type="button" className="outlook-play" aria-label={playing ? "Pause weather scan" : "Play weather scan"} aria-pressed={playing} disabled={paused || reduced || cached} onClick={() => setPlaying(!playing)}>{playing && !paused && !reduced && !cached ? <Pause size={14} weight="light" aria-hidden="true"/> : <Play size={14} weight="light" aria-hidden="true"/>}<span>Scan hours</span></button></div>
      <div className="outlook-readings"><div><strong>{reading?.heat == null ? "?" : reading.heat.toFixed(0)}<small>°F</small></strong><span>Heat index · {reading ? formatHour(reading.time) : "unknown"}</span></div><div><strong>{reading?.wind == null ? "?" : reading.wind.toFixed(1)}<small> mph</small></strong><span>Sustained wind</span></div></div>
      <svg className="outlook-chart" viewBox="0 0 480 342" role="img" aria-label={`${entry.site.name} hourly forecast. Peak heat index ${entry.peak.toFixed(0)} degrees Fahrenheit at ${formatHour(entry.hours[peakIndex].time)}. Wind uses a separate scale from 0 to ${windMax} mph.`} onPointerMove={e => { const rect = e.currentTarget.getBoundingClientRect(); scrub(Math.max(0, Math.min(23, Math.round(((e.clientX - rect.left) / rect.width * 480 - 36) / (408 / 23))))); }}>
        <defs><linearGradient id="outlook-heat-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{ stopColor: "var(--brand-strong)" }} stopOpacity=".38"/><stop offset="100%" style={{ stopColor: "var(--brand-strong)" }} stopOpacity=".015"/></linearGradient></defs>
        {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="36" x2="444" y1={40 + i * 43.75} y2={40 + i * 43.75}/><text x="28" y={44 + i * 43.75} textAnchor="end">{high - i * (high - low) / 4}°</text></g>)}
        {segments.map((points, i) => { const path = points.map((p, j) => `${j ? "L" : "M"}${p.x},${p.y}`).join(" "); return <g className="outlook-line" key={i}><path d={`${path} L${points.at(-1)!.x},215 L${points[0].x},215 Z`} fill="url(#outlook-heat-fill)"/><path d={path} className="outlook-curve"/>{points.length === 1 && <circle cx={points[0].x} cy={points[0].y} r="3" style={{ fill: "var(--brand-strong)" }}/>}</g>; })}
        <text x="36" y="25">HEAT INDEX · °F</text><text x="36" y="251">WIND · 0–{windMax} MPH</text>
        {entry.hours.map((h, i) => h.wind === null ? <line key={i} x1={x(i)} x2={x(i)} y1="292" y2="305" strokeDasharray="2 2"/> : <rect className="signal-rise outlook-wind" key={i} x={x(i) - 4} width="8" y={305 - h.wind / windMax * 42} height={h.wind / windMax * 42}/>)}
        <g className="outlook-cursor" style={{ transform: `translateX(${x(index)}px)` }}><line x1="0" x2="0" y1="35" y2="309"/>{reading?.heat != null && <circle cy={y(reading.heat)} r="5"/>}</g>
        {[0, 6, 12, 18, 23].map(i => <text key={i} x={x(i)} y="332" textAnchor="middle">{formatHour(entry.hours[i].time).replace(/ [A-Z]{2,4}$/, "")}</text>)}
      </svg>
      <input className="outlook-scrubber" type="range" min="0" max="23" value={index} aria-label="Inspect forecast hour" aria-valuetext={reading ? `${formatHour(reading.time)}, heat index ${reading.heat ?? "unknown"} degrees Fahrenheit, wind ${reading.wind?.toFixed(1) ?? "unknown"} mph` : "Unknown"} onChange={e => scrub(Number(e.target.value))}/>
      <p className="outlook-peak">Peak heat index <strong>{entry.peak.toFixed(0)}°F</strong> at {formatHour(entry.hours[peakIndex].time)}.</p>
      <label className="signal-site-select">Compare a plant<select value={entry.site.id} onChange={e => { setChosen(e.target.value); setHour(null); }}>{candidates.map(c => <option key={c.site.id} value={c.site.id}>{c.site.name} · {c.site.state}</option>)}</select></label>
      <p className="signal-footnote">{cached ? "Cached" : "Automatically collected"} NWS forecast, fetched {new Date(entry.source.fetchedAt).toLocaleString()}. {candidates.length}/{sites.length} plants have usable heat outlooks. Gaps stay unknown. Weather screening, not work authorization.</p>
    </> : <div className="outlook-empty"><strong>No fresh hourly outlook</strong><p>Automatic NWS collection has no usable heat forecast in this snapshot. The chart will populate when a fresh forecast arrives.</p></div>}
  </SignalFigure></div>;
}
