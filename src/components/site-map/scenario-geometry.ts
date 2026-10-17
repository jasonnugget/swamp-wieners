import type { ScenarioFrame } from "../../../shared/simulation";
import { projectUS } from "./projection";

export type SimulationLayer = "wind" | "rain" | "runoff";
export type GeographicPoint = { latitude: number; longitude: number };

export const SIMULATION_COLORS: Record<SimulationLayer, string> = {
  wind: "#c87538",
  rain: "#247f91",
  runoff: "#386fa4",
};

/** A spherical destination, used only to draw the scenario's distance footprint. */
export function scenarioDestination(center: GeographicPoint, distanceKm: number, bearing: number): GeographicPoint {
  const radians = Math.PI / 180;
  const latitude = center.latitude * radians, longitude = center.longitude * radians;
  const angular = distanceKm / 6371.0088;
  const nextLatitude = Math.asin(Math.sin(latitude) * Math.cos(angular) + Math.cos(latitude) * Math.sin(angular) * Math.cos(bearing));
  const nextLongitude = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude), Math.cos(angular) - Math.sin(latitude) * Math.sin(nextLatitude));
  return { latitude: nextLatitude / radians, longitude: nextLongitude / radians };
}

export function scenarioFootprint(center: GeographicPoint, radiusKm: number, segments = 96) {
  return Array.from({ length: segments + 1 }, (_, index) => scenarioDestination(center, radiusKm, index / segments * Math.PI * 2));
}

export function scenarioBounds(frame: ScenarioFrame) {
  let west = Infinity, east = -Infinity, north = Infinity, south = -Infinity;
  for (const point of frame.track) {
    for (const edge of scenarioFootprint(point, frame.config.radiusKm, 8)) {
      const projected = projectUS(edge.latitude, edge.longitude);
      west = Math.min(west, projected.x); east = Math.max(east, projected.x);
      north = Math.min(north, projected.z); south = Math.max(south, projected.z);
    }
  }
  return { west, east, north, south };
}
