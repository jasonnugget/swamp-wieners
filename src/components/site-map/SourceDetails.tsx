import type { SiteRiskSnapshot } from "../../../shared/risk";
import type { Site } from "../../../shared/types";

export default function SourceDetails({ snapshot, site }: { snapshot: SiteRiskSnapshot; site: Site }) {
  const time = (value: string | null) => value ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: site.timezone }) : "Not collected";
  return <div className="source-details" aria-label="Evidence sources">
    <p className="observation-intro">Source health and timestamps for this frame. Model estimates, live detections, static exposure, and demo evidence retain their own labels.</p>
    <div className="source-provider-list">{Object.entries(snapshot.observation.provenance.providers).map(([id, source]) => <details className="source-provider" key={id}>
      <summary><span><i data-status={source.status}/>{source.source}</span><small data-status={source.status}>{source.status === "ok" ? "Connected" : source.status === "error" ? "Refresh failed" : "Unavailable"}</small></summary>
      <dl><div><dt>Evidence type</dt><dd>{source.mode}</dd></div><div><dt>Source confidence</dt><dd>{(source.confidence * 100).toFixed(0)}%</dd></div><div><dt>Observed</dt><dd>{time(source.observedAt)}</dd></div><div><dt>Fetched</dt><dd>{time(source.fetchedAt)}</dd></div><div><dt>Cache valid until</dt><dd>{time(source.validUntil)}</dd></div></dl>
      {source.error && <p className="source-error">{source.error}</p>}
    </details>)}</div>
    <section className="source-models"><h3>Model availability</h3><p>Models provide additional evidence for supported plants.</p><dl><div><dt>HeatCast</dt><dd>{snapshot.mlCoverage.heatCast ? "Supported" : "Outside model cohort"}</dd></div><div><dt>GroundCast</dt><dd>{snapshot.mlCoverage.groundCast ? "Supported" : "Outside model cohort"}</dd></div></dl></section>
    <section className="source-site"><h3>Plant record</h3><dl><div><dt>EIA plant ID</dt><dd>{site.id}</dd></div><div><dt>Nameplate capacity</dt><dd>{site.capacityMw.toLocaleString()} MW</dd></div><div><dt>Coordinates</dt><dd>{site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}</dd></div><div><dt>Time zone</dt><dd>{site.timezone}</dd></div><div><dt>Utility</dt><dd>{site.utility}</dd></div><div><dt>Catalog date</dt><dd>{site.sourceDate}</dd></div></dl></section>
    <p className="source-boundary">Conditions can fill gaps with labeled synthetic demo estimates. Operational risk and source coverage use only the available source evidence shown here.</p>
  </div>;
}
