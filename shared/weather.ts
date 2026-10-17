// The atlas uses current provider estimates, independently of the safety replay.
export type WeatherLayer = "risk" | "temperature" | "rain" | "wind" | "clouds";
export type MapRegion = "mainland" | "alaska" | "hawaii" | "all";
export interface WeatherLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}
export interface WeatherReading {
  time: string;
  temperature: number | null; // Fahrenheit
  apparent: number | null;
  rain: number | null; // millimeters per hour
  wind: number | null; // miles per hour
  direction: number | null; // meteorological direction, degrees from north
  clouds: number | null; // percent
  code: number | null; // WMO weather code
}
export interface WeatherPoint extends WeatherLocation {
  fetchedAt: string;
  current: WeatherReading;
  hours: WeatherReading[];
  stale?: boolean;
  error?: string;
}
export interface WeatherAtlas {
  points: WeatherPoint[];
  unavailable: string[];
  source: "Open-Meteo";
}
export const WEATHER_LAYERS = {
  risk: { name: "Site risk", unit: "/10", low: "Lower", high: "High" },
  temperature: { name: "Temperature", unit: "°F", low: "20°", high: "100°" },
  rain: { name: "Precipitation", unit: "mm/h", low: "0", high: "10+" },
  wind: { name: "Wind", unit: "mph", low: "0", high: "40+" },
  clouds: { name: "Cloud cover", unit: "%", low: "Clear", high: "Overcast" },
} as const;
export const REGION_BOUNDS = {
  mainland: { west: -125, east: -66, south: 24, north: 50 },
  alaska: { west: -180, east: -130, south: 51, north: 72 },
  hawaii: { west: -161, east: -154, south: 18.5, north: 22.5 },
  all: { west: -188, east: -65, south: 18, north: 72 },
} as const;
export function readingAt(point: WeatherPoint, hour: number): WeatherReading | undefined {
  if (hour === 0) return point.current;
  const target = Math.floor(Date.parse(point.current.time) / 3600000) * 3600000 + hour * 3600000;
  return point.hours.find((h) => Date.parse(h.time) === target);
}
export function weatherValue(reading: WeatherReading | undefined, layer: WeatherLayer) {
  if (!reading || layer === "risk") return null;
  return layer === "temperature" ? reading.temperature : layer === "rain" ? reading.rain : layer === "wind" ? reading.wind : reading.clouds;
}
export function weatherFraction(value: number, layer: WeatherLayer) {
  return Math.max(0, Math.min(1, layer === "temperature" ? (value - 20) / 80 : layer === "rain" ? value / 10 : layer === "wind" ? value / 40 : value / 100));
}
const PALETTES = {
  temperature: ["#739bb8", "#a9c7bc", "#e8d09b", "#d98c68", "#bd655c"],
  rain: ["#344c51", "#79a99b", "#9fc9b0", "#c9d6ad", "#ead09a"],
  wind: ["#4d6070", "#82aab7", "#b6cbd0", "#d5c8a5", "#d89b7d"],
  clouds: ["#2e454e", "#647a83", "#91a2aa", "#c0c8c9", "#e1e3da"],
} as const;
export function weatherColor(value: number | null, layer: WeatherLayer) {
  if (value == null || layer === "risk") return "#627078";
  return PALETTES[layer][Math.min(4, Math.floor(weatherFraction(value, layer) * 5))];
}
export function weatherSummary(code: number | null | undefined) {
  if (code == null) return "Condition unavailable";
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms";
}
