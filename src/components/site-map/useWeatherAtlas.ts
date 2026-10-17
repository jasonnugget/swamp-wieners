import { useCallback, useEffect, useState } from "react";
import type { WeatherAtlas, WeatherLocation, WeatherPoint } from "../../../shared/weather";

const CACHE = "planit-weather-atlas-v1";
function cachedAtlas(): WeatherAtlas | undefined {
  try {
    const data = JSON.parse(localStorage.getItem(CACHE) ?? "null");
    if (data?.source === "Open-Meteo" && Array.isArray(data.points) && data.points.every((p: WeatherPoint) => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Array.isArray(p.hours) && typeof p.current?.time === "string"))
      return { ...data, points: data.points.map((p: WeatherPoint) => ({ ...p, stale: true })) };
  } catch { /* A damaged local cache must not prevent live loading. */ }
}
async function get<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Weather request failed");
  return data;
}
export function useWeatherAtlas(enabled: boolean, location: WeatherLocation | undefined) {
  const [atlas, setAtlas] = useState<WeatherAtlas | undefined>(() => enabled ? cachedAtlas() : undefined);
  const [point, setPoint] = useState<WeatherPoint>();
  const [loading, setLoading] = useState(enabled), [pointLoading, setPointLoading] = useState(false);
  const [error, setError] = useState(""), [pointError, setPointError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [enabled, refresh]);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    setLoading(true);
    void get<WeatherAtlas>("/api/weather/atlas", abort.signal).then((data) => {
      if (abort.signal.aborted) return;
      setAtlas(data);
      setError(data.unavailable.length ? `${data.unavailable.length} sample locations unavailable.` : "");
      try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch { /* Live readings remain usable when storage is full. */ }
    }).catch((e) => {
      if (abort.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Unable to load live weather.");
      setAtlas((previous) => previous ? { ...previous, points: previous.points.map((p) => ({ ...p, stale: true })) } : undefined);
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [enabled, revision]);
  const latitude = location?.latitude, longitude = location?.longitude;
  useEffect(() => {
    if (!enabled || latitude == null || longitude == null) return;
    const abort = new AbortController();
    setPoint(undefined);
    setPointLoading(true);
    setPointError("");
    const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
    void get<WeatherPoint>(`/api/weather/point?${params}`, abort.signal).then((data) => {
      if (!abort.signal.aborted) setPoint(data);
    }).catch((e) => {
      if (!abort.signal.aborted) setPointError(e instanceof Error ? e.message : "Unable to load point forecast.");
    }).finally(() => { if (!abort.signal.aborted) setPointLoading(false); });
    return () => abort.abort();
  }, [enabled, latitude, longitude, revision]);
  return { atlas, point, loading, pointLoading, error, pointError, refresh };
}
