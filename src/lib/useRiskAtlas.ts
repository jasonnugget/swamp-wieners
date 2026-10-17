import { useCallback, useEffect, useState } from "react";
import type { RiskAtlas } from "../../shared/atlas";
import type { SiteRiskSnapshot } from "../../shared/risk";
import type { Site } from "../../shared/types";

export function useRiskAtlas(enabled: boolean, hour: number, sites: Site[], current: Record<string, SiteRiskSnapshot>) {
  const [atlas, setAtlas] = useState<RiskAtlas>();
  const [loading, setLoading] = useState(enabled), [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(v => v + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    setLoading(true); setError("");
    // Coalesce SSE bursts and fast slider gestures into one national request.
    const timer = setTimeout(() => {
      void fetch(`/api/risk/atlas?hour=${hour}`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(25000)]) })
        .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Risk atlas unavailable"); return data as RiskAtlas; })
        .then(data => { if (!abort.signal.aborted) { if (data.version !== 1 || data.hour !== hour || !Array.isArray(data.sites)) throw new Error("Invalid risk atlas response"); setAtlas(data); } })
        .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Risk atlas unavailable"); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, 175);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [enabled, hour, current, revision]);
  // The workspace cache is the same canonical contract, and avoids a second
  // multi-megabyte localStorage cache. It is explicitly stale after read failure.
  const fallback: RiskAtlas = { version: 1, hour: 0, kind: "CURRENT", generatedAt: "", validAt: "", limitations: [], sites: sites.flatMap(site => current[site.id] ? [{ site, snapshot: current[site.id] }] : []) };
  return { atlas: atlas?.hour === hour ? atlas : hour === 0 ? fallback : undefined, loading, error, stale: !!error, refresh };
}
