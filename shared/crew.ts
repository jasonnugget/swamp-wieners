import type { CrewTeam, HazardReport, Site } from "./types";

/** Small native-client contract; no national scoring or forecast payloads. */
export interface CrewWorkspace {
  version: 1;
  siteId: string;
  now: string;
  clockMode: "real" | "demo";
  sites: Site[];
  teams: CrewTeam[];
  reports: HazardReport[];
}
