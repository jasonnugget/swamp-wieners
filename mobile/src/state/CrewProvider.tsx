import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { randomUUID } from "expo-crypto";
import EventSource from "react-native-sse";
import type { CrewWorkspace } from "../../../shared/crew";
import type { HazardReport } from "../../../shared/types";
import { defaultServer, loadWorkspace, normalizeServer, shareReport } from "../lib/api";
import { readDraft, readStored, storageKeys, writeStored, type CrewProfile } from "../lib/storage";
import { reportPayload, type CrewDraft } from "../lib/report-input";
import { photoData } from "../lib/photos";
import { createWorkspaceSync, reconcileWorkspace, type RefreshReason } from "../lib/workspace-sync";

function useCrewState() {
  const [profile, setProfile] = useState<CrewProfile>({ name: "", teamId: "", siteId: "", server: defaultServer() });
  const [storedWorkspace, setWorkspace] = useState<CrewWorkspace>();
  const [workspaceServer, setWorkspaceServer] = useState("");
  const workspace = workspaceServer === profile.server ? storedWorkspace : undefined;
  const [draft, setDraft] = useState<CrewDraft>();
  const [ready, setReady] = useState(false), [loading, setLoading] = useState(false), [stale, setStale] = useState(true);
  const [error, setError] = useState(""), [storageError, setStorageError] = useState("");
  const [active, setActive] = useState(AppState.currentState === "active");
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const sync = useRef<{ refresh(reason?: RefreshReason): Promise<void> } | undefined>(undefined);
  const refresh = useCallback(() => { void sync.current?.refresh("manual"); }, []);
  const draftWrites = useRef(Promise.resolve());
  useEffect(() => {
    let alive = true;
    void Promise.all([readStored<CrewProfile>(storageKeys.profile), readStored<{ server: string; workspace: CrewWorkspace }>(storageKeys.cache), readDraft()])
      .then(([saved, cached, pending]) => {
        if (!alive) return;
        let next = profile;
        if (saved && [saved.server, saved.name, saved.siteId, saved.teamId].every(value => typeof value === "string")) {
          try { next = { ...saved, server: normalizeServer(saved.server) }; } catch { /* Use a valid local default if the saved address is damaged. */ }
        }
        setProfile(next);
        if (cached?.server === next.server && cached.workspace?.version === 1 && Array.isArray(cached.workspace.sites) && Array.isArray(cached.workspace.reports) && Array.isArray(cached.workspace.teams)) { setWorkspace(cached.workspace); setWorkspaceServer(cached.server); }
        setDraft(pending); setReady(true);
      });
    return () => { alive = false; };
    // Hydration must run once; subsequent profile changes are persisted below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ready) void writeStored(storageKeys.profile, profile).catch(() => setStorageError("Device storage is unavailable. Keep the app open until your report is shared."));
  }, [ready, profile]);
  useEffect(() => {
    if (!ready) return;
    draftWrites.current = draftWrites.current.catch(() => {}).then(() => draft ? writeStored(storageKeys.draft, draft) : AsyncStorage.removeItem(storageKeys.draft));
    void draftWrites.current.catch(() => setStorageError("Your draft could not be saved on this device. Keep the app open."));
  }, [ready, draft]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", state => { setActive(state === "active"); if (state === "active") setCurrentTime(Date.now()); });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!ready || !active) return;
    const abort = new AbortController();
    const updater = createWorkspaceSync({
      load: () => loadWorkspace(profile.server, profile.siteId || undefined, abort.signal),
      onData: next => {
        setCurrentTime(Date.now());
        setWorkspace(current => reconcileWorkspace(current, next)); setWorkspaceServer(profile.server); setStale(false); setError("");
        if (!profile.siteId) setProfile(p => ({ ...p, siteId: next.siteId }));
        void writeStored(storageKeys.cache, { server: profile.server, workspace: next }).catch(() => {});
      },
      onError: e => { setCurrentTime(Date.now()); setStale(true); setError(e instanceof Error ? e.message : "Cannot reach PlanIT. Check the server connection in Crew."); },
      onStatus: status => { setLoading(status.loading); setRefreshing(status.refreshing); },
    });
    sync.current = updater;
    void updater.refresh("initial");
    const stream = new EventSource(`${profile.server}/api/events`, { pollingInterval: 5000 });
    stream.addEventListener("message", () => { void updater.refresh(); });
    const timer = setInterval(() => { setCurrentTime(Date.now()); void updater.refresh(); }, 30000);
    return () => { sync.current = undefined; updater.dispose(); abort.abort(); stream.removeAllEventListeners(); stream.close(); clearInterval(timer); };
  }, [ready, active, profile.server, profile.siteId]);
  const site = workspace?.sites.find(s => s.id === profile.siteId) ?? workspace?.sites.find(s => s.id === workspace.siteId);
  const team = workspace?.teams.find(t => t.id === profile.teamId);
  const reports = useMemo(() => workspace?.reports.filter(r => r.siteId === site?.id) ?? [], [workspace?.reports, site?.id]);
  function startDraft() {
    if (draft) return draft;
    if (!site) throw new Error("Connect to PlanIT and choose your site first.");
    const next: CrewDraft = {
      requestId: randomUUID(), server: profile.server, siteId: site.id, teamId: team?.id ?? "", author: profile.name,
      category: "soil", description: "", tasks: ["mobilization"], latitude: site.latitude, longitude: site.longitude,
      pinConfirmed: false, updatedAt: new Date().toISOString(),
    };
    setDraft(next); return next;
  }
  function editDraft(patch: Partial<CrewDraft>) {
    setDraft(current => current ? { ...current, ...patch, requestId: randomUUID(), updatedAt: new Date().toISOString() } : current);
  }
  function discardDraft() {
    const old = draft; setDraft(undefined);
    if (old?.photoUri) void FileSystem.deleteAsync(old.photoUri, { idempotent: true }).catch(() => {});
  }
  async function publish({ confirmPin = false }: { confirmPin?: boolean } = {}): Promise<HazardReport> {
    if (!draft?.photoUri) throw new Error("Add a photo first.");
    if (draft.server !== profile.server) throw new Error("This draft belongs to a different PlanIT server. Reconnect to its server in Crew before sharing.");
    await draftWrites.current.catch(() => {});
    const accepted = await shareReport(profile.server, reportPayload({ ...draft, pinConfirmed: confirmPin || draft.pinConfirmed }, await photoData(draft.photoUri)));
    setWorkspace(current => current?.siteId === accepted.siteId ? { ...current, reports: [...current.reports.filter(r => r.id !== accepted.id), accepted] } : current);
    setProfile(current => current.server === draft.server ? { ...current, name: accepted.author } : current);
    discardDraft(); void sync.current?.refresh(); return accepted;
  }
  return { profile, setProfile, workspace, site, team, reports, draft, startDraft, editDraft, discardDraft, publish, ready, loading, refreshing, currentTime, stale: stale || workspace?.siteId !== site?.id, error, storageError, refresh };
}
const CrewContext = createContext<ReturnType<typeof useCrewState> | null>(null);
export function CrewProvider({ children }: { children: ReactNode }) { const value = useCrewState(); return <CrewContext.Provider value={value}>{children}</CrewContext.Provider>; }
export function useCrew() { const value = useContext(CrewContext); if (!value) throw new Error("CrewProvider is missing"); return value; }
