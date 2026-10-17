import type { Category, Task } from "../../../shared/types";

export interface CrewDraft {
  requestId: string;
  siteId: string;
  server: string;
  teamId: string;
  author: string;
  category: Category;
  description: string;
  tasks: Task[];
  photoUri?: string;
  latitude: number;
  longitude: number;
  pinConfirmed: boolean;
  updatedAt: string;
}

export const categories: { id: Category; label: string; icon: string }[] = [
  { id: "soil", label: "Ground & access", icon: "layers" },
  { id: "flood", label: "Flooding", icon: "droplet" },
  { id: "weather", label: "Wind & weather", icon: "wind" },
  { id: "heat", label: "Heat", icon: "sun" },
  { id: "lightning", label: "Lightning", icon: "zap" },
  { id: "wildfire", label: "Fire & smoke", icon: "alert-triangle" },
  { id: "wildlife", label: "Wildlife", icon: "feather" },
];
export const taskOptions: { id: Task; label: string }[] = [
  { id: "mobilization", label: "Equipment & access" },
  { id: "installation", label: "Outdoor installation" },
  { id: "preparation", label: "Sheltered preparation" },
];
export function draftIssue(draft: CrewDraft): string | undefined {
  if (!draft.photoUri) return "Take or choose a photo of the hazard.";
  if (!draft.siteId) return "Choose the plant where you observed this hazard.";
  if (!draft.author.trim() || draft.author.trim().length > 80) return "Add your reporting name (up to 80 characters).";
  if (draft.description.trim().length < 5 || draft.description.trim().length > 2000) return "Describe what the crew needs to know (5–2,000 characters).";
  if (!categories.some(c => c.id === draft.category)) return "Choose a hazard type.";
  if (!draft.tasks.length || draft.tasks.some(t => !taskOptions.some(option => option.id === t))) return "Choose at least one affected task.";
  if (!draft.pinConfirmed || !Number.isFinite(draft.latitude) || !Number.isFinite(draft.longitude) || Math.abs(draft.latitude) > 90 || Math.abs(draft.longitude) > 180) return "Confirm the hazard's location on the map.";
}
export function reportPayload(draft: CrewDraft, photo: string) {
  const issue = draftIssue(draft);
  if (issue) throw new Error(issue);
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo)) throw new Error("The saved photo could not be read. Choose it again.");
  if (photo.length > 5_500_000) throw new Error("The photo is too large. Choose a smaller image.");
  return {
    clientRequestId: draft.requestId, siteId: draft.siteId, teamId: draft.teamId || undefined,
    author: draft.author.trim(), category: draft.category, description: draft.description.trim(),
    tasks: [...new Set(draft.tasks)], latitude: draft.latitude, longitude: draft.longitude, photo,
  };
}
