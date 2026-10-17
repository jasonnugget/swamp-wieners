// Provider transport and compatibility weather API contracts. Map display uses atlas.ts.
export type MapRegion = "mainland" | "alaska" | "hawaii" | "all";
export interface WeatherLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}
export interface WeatherReading {
  time: string;
  humidity?: number | null;
  gust?: number | null;
  soilSurface?: number | null;
  soilRoot?: number | null;
  cape?: number | null;
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
export const REGION_BOUNDS = {
  mainland: { west: -125, east: -66, south: 24, north: 50 },
  alaska: { west: -180, east: -130, south: 51, north: 72 },
  hawaii: { west: -161, east: -154, south: 18.5, north: 22.5 },
  all: { west: -188, east: -65, south: 18, north: 72 },
} as const;
