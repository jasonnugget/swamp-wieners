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

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
// The Southeast is always drawn as regional context around the Gulf sites.
export const SOUTHEAST_CORNERS = [{ latitude: 24.5, longitude: -94.6 }, { latitude: 39.6, longitude: -75.3 }];
const SOUTHEAST = ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "SC", "TN", "VA", "WV"];
// Full state names (as the GeoJSON spells them) the atlas draws: the Southeast plus any state holding a site.
export function atlasStates(sites: { state: string }[]) {
  return new Set([...SOUTHEAST, ...sites.map((s) => s.state)].map((code) => STATE_NAMES[code]).filter(Boolean));
}

export function statePolygons(
  geometry: StateGeometry["features"][number]["geometry"],
) {
  return geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
}
