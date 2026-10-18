import type { Site, WeatherScreening } from "../../shared/types";
import { heatIndex } from "../../shared/model";

const headers = {
  "User-Agent": "Threshold-Control (local field-safety prototype)",
  Accept: "application/geo+json",
};
async function get(url: string) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`NOAA/NWS HTTP ${response.status}`);
  return response.json();
}

type GridVariable = { uom: string; values: { validTime: string; value: number | null }[] };
function gridValue(variable: GridVariable | undefined, time: number): number | null {
  for (const value of variable?.values ?? []) {
    const [start, duration] = value.validTime.split("/");
    const match = duration?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!match) continue;
    const length = (Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0)) * 1000;
    if (time >= Date.parse(start) && time < Date.parse(start) + length)
      return typeof value.value === "number" && Number.isFinite(value.value) ? value.value : null;
  }
  return null;
}

async function fetchMarineGrid(site: Site, sourceUrl: string): Promise<WeatherScreening> {
  if (!sourceUrl?.startsWith("https://api.weather.gov/")) throw new Error("NOAA grid unavailable");
  const data = (await get(sourceUrl)).properties;
  if (!Number.isFinite(Date.parse(data?.updateTime))) throw new Error("NOAA forecast issue time unavailable");
  const hours: WeatherScreening["hours"] = [];
  const start = Math.floor(Date.now() / 3600000) * 3600000;
  for (let i = 0; i < 73; i++) {
    const time = start + i * 3600000;
    const temperature = gridValue(data.temperature, time), humidity = gridValue(data.relativeHumidity, time), wind = gridValue(data.windSpeed, time);
    const celsius = temperature === null ? null : data.temperature.uom === "wmoUnit:degC" ? temperature : data.temperature.uom === "wmoUnit:degF" ? (temperature - 32) * 5 / 9 : null;
    const windKmh = wind === null ? null : data.windSpeed.uom === "wmoUnit:km_h-1" ? wind : data.windSpeed.uom === "wmoUnit:m_s-1" ? wind * 3.6 : data.windSpeed.uom === "wmoUnit:kn" ? wind * 1.852 : null;
    hours.push({ time: new Date(time).toISOString(), heatIndex: celsius !== null && humidity !== null && humidity >= 0 && humidity <= 100 ? heatIndex(celsius, humidity) : null, windKmh });
  }
  if (!hours.some(h => h.heatIndex !== null || h.windKmh !== null)) throw new Error("NOAA marine grid has no usable weather");
  return { siteId: site.id, source: "NOAA/NWS", sourceUrl, fetchedAt: new Date().toISOString(), issuedAt: data.updateTime, hours };
}

// Deterministic provider forecasts have their own contract, never ML quantiles.
export async function fetchNwsScreening(site: Site): Promise<WeatherScreening> {
  const point = await get(`https://api.weather.gov/points/${site.latitude.toFixed(4)},${site.longitude.toFixed(4)}`);
  if (point.properties?.type === "marine") return fetchMarineGrid(site, point.properties.forecastGridData);
  const sourceUrl = point.properties?.forecastHourly;
  if (typeof sourceUrl !== "string" || !sourceUrl.startsWith("https://api.weather.gov/"))
    throw new Error("NOAA hourly forecast unavailable at this location");
  const data = await get(sourceUrl);
  const issuedAt = data.properties?.updateTime;
  if (!Number.isFinite(Date.parse(issuedAt))) throw new Error("NOAA forecast issue time unavailable");
  const hours: WeatherScreening["hours"] = (data.properties?.periods ?? []).flatMap((p: {
    startTime: string; temperature: number | null; temperatureUnit: string;
    relativeHumidity?: { value: number | null }; windSpeed?: string;
  }) => {
    if (!Number.isFinite(Date.parse(p.startTime))) return [];
    const humidity = p.relativeHumidity?.value;
    const temperature = typeof p.temperature === "number" && Number.isFinite(p.temperature)
      ? p.temperatureUnit === "F" ? (p.temperature - 32) * 5 / 9
        : p.temperatureUnit === "C" ? p.temperature : null
      : null;
    const wind = p.windSpeed?.match(/^(\d+(?:\.\d+)?)(?: to (\d+(?:\.\d+)?))? (mph|km\/h)$/);
    return [{
      time: p.startTime,
      heatIndex: temperature !== null && typeof humidity === "number" && Number.isFinite(humidity) && humidity >= 0 && humidity <= 100
        ? heatIndex(temperature, humidity) : null,
      windKmh: wind ? Math.max(Number(wind[1]), Number(wind[2] ?? wind[1])) * (wind[3] === "mph" ? 1.609344 : 1) : null,
    }];
  });
  if (!hours.length || !hours.some(h => h.heatIndex !== null || h.windKmh !== null))
    throw new Error("NOAA returned no usable hourly weather");
  return { siteId: site.id, source: "NOAA/NWS", sourceUrl, fetchedAt: new Date().toISOString(), issuedAt, hours };
}
