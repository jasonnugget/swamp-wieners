import { useState } from "react";
import type { Decision, HazardForecast as Forecast, HazardKey } from "../../shared/types";
import { HAZARD_KEYS, HAZARD_NAMES } from "../../shared/hazard-model";
import { RISK_CONFIG } from "../../shared/risk-config";

const LABELS: Record<HazardKey, string> = { wind: "Damaging wind", flood: "Flooding", lightning: "Severe thunderstorm", fire: "Fire nearby", heat: "Heat advisory" };
// Guideline per learned score: the same thresholds the policy applies to channels.
const guideline = (score: number) => score >= RISK_CONFIG.policy.holdScore ? ["HOLD", "NO-GO"] : score >= RISK_CONFIG.policy.restrictScore ? ["RESTRICTED", "CAUTION"] : ["AVAILABLE", "GO"];
const pct = (v: number) => `${v < 0.01 ? "<1" : Math.round(v * 100)}%`;

export default function HazardForecast({ forecast, decision }: { forecast?: Forecast; decision?: Decision }) {
  const [index, setIndex] = useState(0);
  if (!forecast?.days.length)
    return <p className="muted">Learned next-day hazard forecasts are unavailable for this plant. HazardCast covers the original Florida, Louisiana and Mississippi model plants; other hazards remain on rule screens.</p>;
  const day = forecast.days[Math.min(index, forecast.days.length - 1)];
  const drivers = HAZARD_KEYS.map(k => [k, day.overall.contributions[k]] as const).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const guardrails = decision?.tasks.flatMap(t => t.reasons.filter(r => /extreme|OverallCast/.test(r)).map(r => `${t.task}: ${r}`)) ?? [];
  return (
    <div className="hazard-forecast-panel" data-testid="hazard-forecast">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">HAZARDCAST · {forecast.mode.toUpperCase()} LEARNED FORECAST · {forecast.modelVersion}</span>
          <h3>Overall {day.overall.score.toFixed(1)}/10 · {pct(day.overall.probability)} chance of warning-level weather</h3>
        </div>
        {forecast.days.length > 1 && <div className="segmented" role="group" aria-label="Forecast day">
          {forecast.days.map((d, i) => <button key={d.date} className={i === index ? "active" : ""} aria-pressed={i === index} onClick={() => setIndex(i)}>{d.date}</button>)}
        </div>}
      </div>
      <div className="hazard-forecast">
        {HAZARD_KEYS.map(key => {
          const h = day.hazards[key], [state, label] = guideline(h.score);
          return <div key={key} data-state={state}>
            <span>{HAZARD_NAMES[key]} · {LABELS[key]}</span>
            <strong>{h.score.toFixed(1)}<small>/10 · {label}</small></strong>
            <small>{pct(h.probability)} chance{h.climatology > 0 ? ` · ${(h.probability / h.climatology).toFixed(1)}× normal` : ""}</small>
          </div>;
        })}
      </div>
      <p className="muted">
        {drivers.length ? `Raising the overall index: ${drivers.map(([k, v]) => `${HAZARD_NAMES[k]} (+${v.toFixed(2)} log-odds)`).join(", ")}. ` : "No hazard is above its typical level. "}
        Scores ≥{RISK_CONFIG.policy.restrictScore} restrict and ≥{RISK_CONFIG.policy.holdScore} hold affected tasks. A low forecast never clears a strike, alert or crew hold, and unknown coverage stays unknown.
      </p>
      {guardrails.length > 0 && <p className="note" role="status">Guardrail: {guardrails.join(" ")}</p>}
    </div>
  );
}
