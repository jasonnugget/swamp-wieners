import { useEffect, useState } from "react";
import {
  readingAt, weatherSummary, weatherValue, WEATHER_LAYERS,
  type MapRegion, type WeatherLayer, type WeatherLocation,
} from "../../../shared/weather";
import type { useWeatherAtlas } from "./useWeatherAtlas";

export default function WeatherControls({ weather, layer, hour, region, location, reducedMotion, onLayer, onHour, onRegion, onLocation }: {
  weather: ReturnType<typeof useWeatherAtlas>;
  layer: WeatherLayer;
  hour: number;
  region: MapRegion;
  location?: WeatherLocation;
  reducedMotion: boolean;
  onLayer(layer: WeatherLayer): void;
  onHour(hour: number): void;
  onRegion(region: MapRegion): void;
  onLocation(location: WeatherLocation): void;
}) {
  const [playing, setPlaying] = useState(false), [search, setSearch] = useState("");
  useEffect(() => { if (layer === "risk" || reducedMotion) setPlaying(false); }, [layer, reducedMotion]);
  useEffect(() => {
    if (!playing || reducedMotion || document.hidden || layer === "risk") return;
    const timer = setInterval(() => { if (!document.hidden) onHour(hour >= 72 ? 0 : hour + 3); }, 1400);
    return () => clearInterval(timer);
  }, [playing, reducedMotion, hour, onHour, layer]);
  const point = weather.point ?? weather.atlas?.points.find((p) => p.latitude === location?.latitude && p.longitude === location?.longitude);
  const reading = point ? readingAt(point, hour) : undefined;
  const value = weatherValue(reading, layer === "risk" ? "temperature" : layer);
  const reference = point ?? weather.atlas?.points[0];
  const time = reference ? readingAt(reference, hour)?.time : undefined;
  const stale = !!point && (point.stale || Date.now() - Date.parse(point.current.time) > 45 * 60000);
  const samples = weather.atlas?.points ?? [];
  const matches = search.trim() ? samples.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 6) : [];
  return <>
    <div className="atlas-layer-bar" role="group" aria-label="Weather layers">
      {(Object.keys(WEATHER_LAYERS) as WeatherLayer[]).map((id, i) => <button type="button" key={id} aria-pressed={layer === id} onClick={() => onLayer(id)}><small>0{i + 1}</small>{WEATHER_LAYERS[id].name}</button>)}
    </div>
    <div className="atlas-regions" role="group" aria-label="Map regions">
      {([['mainland', 'Lower 48'], ['alaska', 'Alaska'], ['hawaii', 'Hawaii'], ['all', 'All US']] as const).map(([id, name]) => <button type="button" key={id} aria-pressed={region === id} onClick={() => onRegion(id)}>{name}</button>)}
    </div>
    <aside className="atlas-inspector" aria-label="Weather inspection">
      <div className="atlas-inspector-top"><span>{hour === 0 ? "CURRENT ESTIMATE" : `FORECAST · +${hour} HOURS`}</span><button type="button" onClick={weather.refresh} disabled={weather.loading} aria-label="Refresh weather">{weather.loading ? "Syncing…" : "Refresh ↗"}</button></div>
      <h2 className="atlas-location-title">{location?.name ?? "Pick a place"}</h2>
      <p className="atlas-coordinate">{location ? `${location.latitude.toFixed(2)}° / ${location.longitude.toFixed(2)}°` : "Click the map to inspect any US location"}</p>
      {weather.pointLoading ? <div className="atlas-value is-loading" aria-label="Loading point weather">—</div> : <div className="atlas-value">{value == null ? "—" : value.toFixed(layer === "rain" ? 1 : 0)}<span>{WEATHER_LAYERS[layer === "risk" ? "temperature" : layer].unit}</span></div>}
      <p className="atlas-condition">{weather.pointLoading ? "Retrieving local forecast…" : reading ? weatherSummary(reading.code) : "No weather reading available"}</p>
      <dl className="atlas-metrics">
        <div><dt>Feels like</dt><dd>{reading?.apparent == null ? "—" : `${reading.apparent.toFixed(0)}°F`}</dd></div>
        <div><dt>Wind</dt><dd>{reading?.wind == null ? "—" : `${reading.wind.toFixed(0)} mph`}</dd></div>
        <div><dt>Precip.</dt><dd>{reading?.rain == null ? "—" : `${reading.rain.toFixed(1)} mm/h`}</dd></div>
        <div><dt>Clouds</dt><dd>{reading?.clouds == null ? "—" : `${reading.clouds.toFixed(0)}%`}</dd></div>
      </dl>
      <div className="atlas-search"><label htmlFor="atlas-place-search">Find a weather sample</label><input id="atlas-place-search" type="search" placeholder="City or state abbreviation" value={search} onChange={(e) => setSearch(e.target.value)} />
        {matches.length > 0 && <div className="atlas-search-results">{matches.map((p) => <button type="button" key={p.id} onClick={() => { onLocation(p); setSearch(""); }}>{p.name}<span>↗</span></button>)}</div>}
        {search && !matches.length && <p>No sample matches. Click the map to inspect a location.</p>}
      </div>
      <p className="atlas-freshness">{stale ? "STALE · " : ""}{point ? `Valid ${new Date(reading?.time ?? point.current.time).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}` : "Waiting for provider"}</p>
      {(weather.error || weather.pointError) && <p className="atlas-error" role="status">{weather.pointError || weather.error}</p>}
      <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather data by Open-Meteo ↗</a>
    </aside>
    <div className="atlas-timeline">
      <div className="atlas-time-heading"><button type="button" disabled={reducedMotion || !samples.length || layer === "risk"} onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause weather forecast" : "Play weather forecast"}>{playing ? "Ⅱ" : "▷"}</button><div><span>{hour === 0 ? "Now" : `+${hour} hours`}</span><strong>{time ? new Date(time).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric" }) : "Weather time unavailable"}</strong></div><button type="button" className="atlas-now" onClick={() => { onHour(0); setPlaying(false); }}>Back to now</button></div>
      <input aria-label="Forecast hour" type="range" min={0} max={72} step={1} value={hour} onChange={(e) => { setPlaying(false); onHour(Number(e.target.value)); }} disabled={layer === "risk" || !samples.length} />
      <div className="atlas-time-ticks"><span>Now</span><span>+24h</span><span>+48h</span><span>+72h</span></div>
    </div>
    <div className="atlas-scale"><span>{WEATHER_LAYERS[layer].name} {layer !== "risk" ? `· ${WEATHER_LAYERS[layer].unit}` : ""}</span><i data-layer={layer}/><div><span>{WEATHER_LAYERS[layer].low}</span><span>{WEATHER_LAYERS[layer].high}</span></div></div>
    <p className="atlas-coverage">{layer === "risk" ? "Site risk follows the safety workspace clock; weather time is independent." : `${samples.length}/50 sampled locations${samples.some((p) => p.stale) ? " · CACHED / STALE" : ""} · colors and height show local values, not statewide coverage.`}<br/>Current = model estimate · refreshes every 15 min · precipitation = interval-equivalent mm/h</p>
  </>;
}
