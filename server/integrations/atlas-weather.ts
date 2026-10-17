import type { WeatherLocation, WeatherPoint, WeatherReading } from "../../shared/weather";

const VARIABLES = "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code";
const TTL = 15 * 60 * 1000;
const cache = new Map<string, WeatherPoint>();
const pending = new Map<string, Promise<WeatherPoint[]>>();
const key = (p: WeatherLocation) => `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;
const numeric = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;

export function parseWeather(data: Record<string, any>, location: WeatherLocation, now: number): WeatherPoint {
  if (!data.current || !Array.isArray(data.hourly?.time)) throw new Error("Incomplete weather response");
  function reading(values: Record<string, unknown>, time: unknown): WeatherReading {
    const timestamp = typeof time === "number" ? new Date(time * 1000).toISOString() : "";
    if (!timestamp) throw new Error("Weather timestamp missing");
    return {
      time: timestamp,
      temperature: numeric(values.temperature_2m), apparent: numeric(values.apparent_temperature),
      rain: numeric(values.precipitation), wind: numeric(values.wind_speed_10m),
      direction: numeric(values.wind_direction_10m), clouds: numeric(values.cloud_cover), code: numeric(values.weather_code),
    };
  }
  const current = reading(data.current, data.current.time);
  current.rain = current.rain != null && typeof data.current.interval === "number" && data.current.interval > 0 ? current.rain * 3600 / data.current.interval : null;
  return {
    ...location, fetchedAt: new Date(now).toISOString(),
    current,
    hours: data.hourly.time.map((time: number, i: number) => reading(
      Object.fromEntries(VARIABLES.split(",").map((v) => [v, data.hourly[v]?.[i]])), time,
    )),
  };
}

// Coordinates share cache entries across atlas and inspection requests.
export async function loadWeather(locations: WeatherLocation[]): Promise<WeatherPoint[]> {
  const now = Date.now();
  const missing = locations.filter((p) => !cache.has(key(p)) || now - Date.parse(cache.get(key(p))!.fetchedAt) >= TTL);
  if (missing.length) {
    const batchKey = missing.map(key).sort().join(";");
    let job = pending.get(batchKey);
    if (!job) {
      job = (async () => {
        const params = new URLSearchParams({
          latitude: missing.map((p) => p.latitude).join(","),
          longitude: missing.map((p) => p.longitude).join(","),
          current: VARIABLES, hourly: VARIABLES, temperature_unit: "fahrenheit",
          wind_speed_unit: "mph", forecast_hours: "73", timeformat: "unixtime", timezone: "UTC",
        });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(18000) });
        if (!response.ok) throw new Error(`Weather provider HTTP ${response.status}`);
        const payload = await response.json();
        const rows = Array.isArray(payload) ? payload : [payload];
        if (rows.length !== missing.length) throw new Error("Weather location count mismatch");
        const points = rows.map((row, i) => parseWeather(row, missing[i], Date.now()));
        for (const point of points) cache.set(key(point), point);
        // Bound arbitrary map-point inspection storage.
        while (cache.size > 300) cache.delete(cache.keys().next().value!);
        return points;
      })();
      pending.set(batchKey, job);
      void job.finally(() => pending.delete(batchKey)).catch(() => {});
    }
    try { await job; } catch (error) {
      return locations.flatMap((p) => {
        const previous = cache.get(key(p));
        return previous ? [{ ...previous, ...p, stale: true, error: error instanceof Error ? error.message : String(error) }] : [];
      });
    }
  }
  return locations.flatMap((p) => {
    const point = cache.get(key(p));
    return point ? [{ ...point, ...p }] : [];
  });
}
