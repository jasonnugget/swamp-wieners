// A local Mercator plane keeps site coordinates and click-to-pin reversible.
// Scene units are schematic, not terrain elevation or survey coordinates.
const RADIUS = 6378137;
const UNIT_METERS = 180000;
const CENTER_LONGITUDE = -86.5;
const CENTER_LATITUDE = 29.5;
const radians = Math.PI / 180;
const mercatorY = (latitude: number) =>
  RADIUS * Math.log(Math.tan(Math.PI / 4 + (latitude * radians) / 2));
const centerY = mercatorY(CENTER_LATITUDE);

export function project(latitude: number, longitude: number) {
  return {
    x: (RADIUS * (longitude - CENTER_LONGITUDE) * radians) / UNIT_METERS,
    z:
      -(mercatorY(Math.max(-85, Math.min(85, latitude))) - centerY) /
      UNIT_METERS,
  };
}

export function unproject(x: number, z: number) {
  const longitude = CENTER_LONGITUDE + (x * UNIT_METERS) / RADIUS / radians;
  const latitude =
    (2 * Math.atan(Math.exp((centerY - z * UNIT_METERS) / RADIUS)) -
      Math.PI / 2) /
    radians;
  return { latitude, longitude };
}

export function projectUS(latitude: number, longitude: number) {
  return project(latitude, longitude > 0 ? longitude - 360 : longitude);
}
export function normalizeLongitude(longitude: number) {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

export { atlasColor as riskColor } from "../../../shared/atlas";

export const REGION = { west: -188, east: -65, south: 18, north: 72 };
export const LAND_TOP = 0.16;

export interface StateGeometry {
  features: {
    properties: { name: string };
    geometry:
      | { type: "Polygon"; coordinates: number[][][] }
      | { type: "MultiPolygon"; coordinates: number[][][][] };
  }[];
}

export function statePolygons(
  geometry: StateGeometry["features"][number]["geometry"],
) {
  return geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
}
