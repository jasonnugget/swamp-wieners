import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { categories, taskOptions, type CrewDraft } from "./report-input";

export interface CrewProfile { name: string; teamId: string; siteId: string; server: string }
export const storageKeys = { profile: "planit-crew-profile-v1", draft: "planit-crew-draft-v1", cache: "planit-crew-workspace-v1" };
export async function readStored<T>(key: string): Promise<T | undefined> {
  try { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) as T : undefined; } catch { return undefined; }
}
export function writeStored(key: string, value: unknown) { return AsyncStorage.setItem(key, JSON.stringify(value)); }
export async function readDraft(): Promise<CrewDraft | undefined> {
  const draft = await readStored<CrewDraft>(storageKeys.draft);
  if (!draft || ![draft.requestId, draft.siteId, draft.server, draft.teamId, draft.author, draft.description, draft.updatedAt].every(value => typeof value === "string") ||
    !categories.some(category => category.id === draft.category) || !Array.isArray(draft.tasks) || draft.tasks.some(task => !taskOptions.some(option => option.id === task)) ||
    !Number.isFinite(draft.latitude) || !Number.isFinite(draft.longitude) || Math.abs(draft.latitude) > 90 || Math.abs(draft.longitude) > 180 || typeof draft.pinConfirmed !== "boolean" ||
    (draft.photoUri !== undefined && typeof draft.photoUri !== "string")) return undefined;
  if (draft.photoUri) {
    try { if (!(await FileSystem.getInfoAsync(draft.photoUri)).exists) draft.photoUri = undefined; }
    catch { draft.photoUri = undefined; }
  }
  return draft;
}
export async function clearDraft(draft?: CrewDraft) {
  await AsyncStorage.removeItem(storageKeys.draft);
  if (draft?.photoUri) await FileSystem.deleteAsync(draft.photoUri, { idempotent: true }).catch(() => {});
}
