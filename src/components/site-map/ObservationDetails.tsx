import { useState } from "react";
import type { SiteObservationV1 } from "../../../shared/risk";
import type { SiteDataPreview } from "../../../shared/site-data";
import { OBSERVATION_GROUPS, formatObservation } from "./observations";
import "../../styles/evidence.css";

export default function ObservationDetails({ observation, timezone, completion }: { observation: SiteObservationV1; timezone?: string; completion?: SiteDataPreview }) {
  const [fillGaps, setFillGaps] = useState(true);
  const preview = fillGaps ? completion : undefined;
  return <div className="observation-details" aria-label="Environmental observations">
    <div className="observation-preview-controls">
      <p className="observation-intro">34 environmental fields. Open a reading to inspect its source.</p>
      {completion && <><label><input type="checkbox" name="demo-gap-fill" checked={fillGaps} onChange={e => setFillGaps(e.target.checked)}/>Fill gaps with demo estimates</label>
        <p className="observation-demo-notice">{fillGaps ? "Synthetic values are hypothetical, including event distances, times and gauge readings. They do not change risk, source coverage or work decisions." : "Source readings only. Missing observations remain unknown."}</p></>}
    </div>
    {OBSERVATION_GROUPS.map(group => {
      const values = observation[group.id] as Record<string, unknown>;
      const available = group.fields.filter(f => values[f.key] !== null && values[f.key] !== undefined).length;
      return <details className="observation-group" key={group.id} open={group.id === "weather"}>
        <summary><span>{group.name}</span><small>{available}/{group.fields.length} source fields</small></summary>
        <p className="observation-note">{group.note}</p>
        {group.fields.map(field => {
          const path = `${group.id}.${field.key}`, original = values[field.key];
          const metadata = preview?.fields[path];
          const usePreview = !!metadata && (original == null || path === "lightning.evidenceMode" && metadata.kind === "SYNTHETIC");
          const value = usePreview ? (preview!.scenario[group.id] as Record<string, unknown>)[field.key] : original;
          const synthetic = usePreview && metadata?.kind === "SYNTHETIC", known = value !== null && value !== undefined;
          const source = usePreview ? undefined : observation.provenance.fieldEvidence[path];
          const local = path === "wildlife.crewReports24h";
          const sourceLabel = usePreview ? metadata!.reason : source?.source ?? observation.provenance.fieldSources[path] ?? (local ? "Local crew report store" : "No usable current source value");
          return <details className="observation-field" key={path} data-observation-field={path} data-known={known} data-origin={synthetic ? "synthetic" : known ? "source" : "unknown"}>
            <summary><span>{field.label}{synthetic && <small className="observation-synthetic">Synthetic</small>}</span><strong>{formatObservation(value, field, timezone)}</strong></summary>
            <div className="observation-provenance">
              {synthetic && <p><strong>DEMO ONLY · Hypothetical value</strong></p>}
              <p>{sourceLabel}</p>
              {synthetic && <p>Method: {preview!.method}. Plant coordinates, season and available weather guide these uncalibrated assumptions. Event values are simulated, not detected.</p>}
              {source && <p>{source.mode === "FORECAST" ? "Modeled / forecast" : source.mode === "STATIC" ? "Static context" : source.mode === "DEMO" ? "Demo evidence" : "Live source"} · {(source.confidence * 100).toFixed(0)}% source confidence</p>}
              {source?.observedAt && <p>Observed {formatObservation(source.observedAt, { key: "time", label: "", format: "time" }, timezone)}</p>}
              {source?.fetchedAt && <p>Fetched {formatObservation(source.fetchedAt, { key: "time", label: "", format: "time" }, timezone)}</p>}
              {field.note && <p>{field.note}</p>}
            </div>
          </details>;
        })}
      </details>;
    })}
  </div>;
}
