import { atlasColor } from "../../../shared/atlas";
import type { HazardScore, RiskFactor } from "../../../shared/risk";

// Readable driver names and units for the observation fields that feed hazard scores.
const FIELDS: Record<string, [label: string, unit?: string]> = {
  "weather.heatIndexF": ["Heat index", "°F"], "weather.apparentTemperatureF": ["Feels-like temperature", "°F"],
  "weather.windMph": ["Sustained wind", "mph"], "weather.gustMph": ["Wind gusts", "mph"], "weather.precipitation1hMm": ["Rain, last hour", "mm"],
  "weather.weatherCode": ["Weather condition code"], "weather.humidityPct": ["Relative humidity", "%"],
  "soil.moisture": ["Soil moisture"], "lightning.nearestStrikeMiles": ["Nearest strike", "mi"], "lightning.strikes10mi30m": ["Strikes within 10 mi (30 min)"],
  "lightning.forecastPotential": ["Storm potential"], "flood.rainfall": ["Rain, last 24 h", "mm"], "flood.gauge": ["River gauge stage", "pctl"],
  "flood.floodplain": ["Floodplain exposure"], "wildfire.nearestFireMiles": ["Nearest fire", "mi"], "wildfire.firePower": ["Fire radiative power", "MW"],
  "wildfire.fireAgeMinutes": ["Fire detection age", "min"], "wildfire.redFlagAlert": ["Red flag warning"],
  "wildlife.dangerousSightings24h": ["Dangerous sightings (24 h)"], "wildlife.nearestSightingMiles": ["Nearest sighting", "mi"],
  heatCast: ["HeatCast forecast", "°F"], groundCast: ["GroundCast forecast"],
  windCast: ["WindCast chance"], floodCast: ["FloodCast chance"], stormCast: ["StormCast chance"], fireCast: ["FireCast chance"], heatEventCast: ["HeatEventCast chance"],
};
// Learned hazard models report an event probability rather than a measurement.
const PROBABILITIES = new Set(["windCast", "floodCast", "stormCast", "fireCast", "heatEventCast"]);
const GROUPS: [RiskFactor["kind"], string][] = [["environment", "Observations"], ["forecast", "Forecasts & models"], ["official-alert", "Official alerts"], ["crew", "Crew reports"]];
const MODES: Record<string, string> = { live: "Live", historical: "Historical", simulated: "Simulated", crew: "Crew" };

function label(f: RiskFactor) {
  if (f.key.startsWith("alert:")) return "NWS alert";
  if (f.key.startsWith("crew:")) return "Crew report";
  return FIELDS[f.key]?.[0] ?? f.key.replace(/^[a-z]+\./, "").replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
}
function reading(f: RiskFactor) {
  if (f.value === null) return "No reading";
  if (typeof f.value === "boolean") return f.value ? "Yes" : "No";
  if (typeof f.value === "string") return f.value;
  if (PROBABILITIES.has(f.key)) return `${(f.value * 100).toFixed(0)}%`;
  const unit = FIELDS[f.key]?.[1];
  return `${Number.isInteger(f.value) ? f.value : f.value.toFixed(1)}${unit ? ` ${unit}` : ""}`;
}
const time = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function ChannelSources({ channel }: { channel: HazardScore }) {
  const factors = channel.factors.filter(f => f.score !== null);
  if (!factors.length) return <p className="channel-sources-empty">No scored sources for this driver.</p>;
  return <div className="channel-sources">
    <p className="channel-sources-confidence">Confidence {(channel.confidence * 100).toFixed(0)}%</p>
    {GROUPS.map(([kind, heading]) => {
      const group = factors.filter(f => f.kind === kind);
      return group.length > 0 && <section key={kind} className="channel-source-group">
        <h4>{heading}</h4>
        {group.map((f, i) => <article key={`${f.key}:${i}`} className="channel-source">
          <header><strong>{label(f)}</strong><span>{reading(f)}</span></header>
          <div className="channel-source-score"><span className="atlas-channel-meter" aria-hidden="true"><i style={{ width: `${f.score! * 10}%`, background: atlasColor(f.score) }}/></span><small>{f.score!.toFixed(1)} / 10</small></div>
          <dl>
            <div><dt>Source</dt><dd>{f.source}</dd></div>
            <div><dt>Type</dt><dd><span className="channel-source-badge" data-mode={f.mode}>{MODES[f.mode] ?? f.mode}</span></dd></div>
            {f.validFrom && <div><dt>{f.kind === "forecast" ? "Valid from" : "Observed"}</dt><dd>{time(f.validFrom)}</dd></div>}
            {f.validTo && <div><dt>Valid until</dt><dd>{time(f.validTo)}</dd></div>}
          </dl>
        </article>)}
      </section>;
    })}
  </div>;
}
