import { useEffect, useState } from "react";
import type { SiteDataPreview } from "../../shared/site-data";
import type { SiteObservationV1 } from "../../shared/risk";

// Only the inspected intelligence panel requests a preview; map markers use
// the companion already included in the national atlas batch.
export function useSiteDataPreview(siteId: string, observation: SiteObservationV1) {
  const [result, setResult] = useState<{ siteId: string; data: SiteDataPreview }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    setError("");
    void fetch(`/api/sites/${encodeURIComponent(siteId)}/data-completion`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(25000)]) })
      .then(async response => {
        if (!response.ok) throw new Error("Demo estimates unavailable; showing source readings only.");
        const data = await response.json() as SiteDataPreview;
        if (data.usage !== "DEMO_ONLY" || !data.scenario || !data.fields) throw new Error("Invalid demo preview response.");
        if (!abort.signal.aborted) setResult({ siteId, data });
      })
      .catch(e => { if (!abort.signal.aborted) { setResult(undefined); setError(e instanceof Error ? e.message : "Demo estimates unavailable."); } });
    return () => abort.abort();
  }, [siteId, observation]);
  return { completion: result?.siteId === siteId ? result.data : undefined, error };
}
