import type { SiteObservationV1 } from "../../../shared/risk";
import { OBSERVATION_GROUPS, formatObservation } from "./observations";
import "../../styles/evidence.css";

export default function ObservationDetails({ observation, timezone }: { observation: SiteObservationV1; timezone?: string }) {
  return <div className="observation-details" aria-label="Environmental observations">
    <p className="observation-intro">34 environmental fields. Open a reading to inspect its source. Unavailable readings remain unknown.</p>
    {OBSERVATION_GROUPS.map(group => {
      const values = observation[group.id] as Record<string, unknown>;
      const available = group.fields.filter(f => values[f.key] !== null && values[f.key] !== undefined).length;
      return <details className="observation-group" key={group.id} open={group.id === "weather"}>
        <summary><span>{group.name}</span><small>{available}/{group.fields.length} recorded</small></summary>
        <p className="observation-note">{group.note}</p>
        {group.fields.map(field => {
          const path = `${group.id}.${field.key}`, value = values[field.key], known = value !== null && value !== undefined;
          const source = observation.provenance.fieldEvidence[path];
          const local = path === "wildlife.crewReports24h";
          const sourceLabel = source?.source ?? observation.provenance.fieldSources[path] ?? (local ? "Local crew report store" : "No usable current source value");
          return <details className="observation-field" key={path} data-observation-field={path} data-known={known}>
            <summary><span>{field.label}</span><strong>{formatObservation(value, field, timezone)}</strong></summary>
            <div className="observation-provenance">
              <p>{sourceLabel}</p>
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
