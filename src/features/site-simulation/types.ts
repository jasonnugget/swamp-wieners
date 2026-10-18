import type { SiteObservationV1 } from "../../../shared/risk";

type Groups = Pick<SiteObservationV1, "weather" | "soil" | "lightning" | "flood" | "wildfire" | "wildlife">;
export type ScenarioValues = { [K in keyof Groups]: { [F in keyof Groups[K]]: Groups[K][F] | null } };
export type Lens = "weather" | "heat" | "soil" | "water" | "events";
export type Template = "campus" | "solar" | "substation";
export interface SceneSettings {
  lens: Lens;
  template: Template;
  quality: "balanced" | "high";
  windBearing: number;
  demonstration: "none" | "lightning" | "fire";
}
export const DEFAULT_SETTINGS: SceneSettings = {
  lens: "weather", template: "campus", quality: "balanced", windBearing: 225, demonstration: "none",
};
