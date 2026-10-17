import type { HazardReport, Site } from "../../../shared/types";
export interface MapCoordinate { latitude: number; longitude: number }
export interface SiteMapProps {
  site: Site;
  reports?: HazardReport[];
  pin?: MapCoordinate;
  onPin?(pin: MapCoordinate): void;
  height?: number;
  fullBleed?: boolean;
}
