import { useCallback, useEffect, useRef, useState } from "react";
import type { RiskAtlas } from "../../shared/atlas";
import type { SiteRiskSnapshot } from "../../shared/risk";
import type { Site } from "../../shared/types";

export function useRiskAtlas(enabled: boolean, hour: number, sites: Site[], current: Record<string, SiteRiskSnapshot>, siteId?: string) {
  const [result, setResult] = useState<{ key: string; atlas: RiskAtlas }>();
  const [loading, setLoading] = useState(enabled), [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const cache = useRef(new Map<string, { atlas: RiskAtlas; expires: number }>());
  const key = `${siteId ?? "national"}:${hour}`;
  const refresh = useCallback(() => setRevision(v => v + 1), []);
  // Crew/SSE updates and explicit refresh invalidate previously visited hours.
  useEffect(() => { cache.current.clear(); }, [current, revision]);
  useEffect(() => {
    if (!enabled) return;
    const cached = cache.current.get(key);
    if (cached && cached.expires > Date.now()) {
      setResult({ key, atlas: cached.atlas }); setLoading(false); setError("");
      return;
    }
    const abort = new AbortController();
    setLoading(true); setError("");
    // Coalesce fast gestures; only the selected site is scored for future hours.
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ hour: String(hour), completion: "1", ...(siteId ? { siteId } : {}) });
      void fetch(`/api/risk/atlas?${query}`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(25000)]) })
        .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Risk atlas unavailable"); return data as RiskAtlas; })
        .then(data => {
          if (abort.signal.aborted) return;
          if (data.version !== 1 || data.hour !== hour || !Array.isArray(data.sites) ||
            (siteId && (data.sites.length !== 1 || data.sites[0].site.id !== siteId))) throw new Error("Invalid risk atlas response");
          if (cache.current.size >= 48) cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(key, { atlas: data, expires: Date.now() + 60000 });
          setResult({ key, atlas: data });
        })
        .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Risk atlas unavailable"); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [enabled, hour, siteId, key, current, revision]);
  // Current offline evidence reuses the workspace cache; forecasts never fall
  // back to current values or another site's/hour's result.
  const fallback: RiskAtlas = { version: 1, hour: 0, kind: "CURRENT", generatedAt: "", validAt: "", limitations: [], sites: sites.flatMap(site => current[site.id] ? [{ site, snapshot: current[site.id] }] : []) };
  return { atlas: result?.key === key ? result.atlas : hour === 0 ? fallback : undefined, loading: enabled && loading, error, stale: !!error, refresh };
}
