import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Forecast, ModelBundle, Sample, Site } from "../../shared/types";
import { forecastSample, heatIndex } from "../../shared/model";
import ForecastChart from "./ForecastChart";

export default function ForecastReplay({
  site,
  bundle,
  forecast,
  ground = false,
  className = "panel",
  heading = true,
}: {
  site: Site;
  bundle: ModelBundle;
  forecast: Forecast;
  ground?: boolean;
  className?: string;
  heading?: boolean;
}) {
  const [reveal, setReveal] = useState(false),
    [temp, setTemp] = useState(0),
    [rain, setRain] = useState(0);
  const scenario = forecast.hours.map((h) => {
    const x = [...h.x];
    x[0] += temp;
    x[2] += rain;
    x[4] += rain * 24;
    const sample: Sample = {
      time: h.time,
      issuedAt: h.issuedAt,
      availableAt: h.issuedAt,
      x,
      heat: 0,
      soil: 0,
      baselineHeat: heatIndex(x[0], x[1]),
      baselineSoil: 0,
      split: "test",
    };
    return { ...h, ...forecastSample(bundle, sample) };
  });
  const displayHours = temp || rain ? scenario : forecast.hours;
  const toggle = (
    <button className="secondary" onClick={() => setReveal(!reveal)}>
      {reveal ? "Hide outcomes" : "Reveal reanalysis outcomes"}
      <ArrowRight size={14} />
    </button>
  );
  return (
    <section className={className}>
      {heading ? (
        <div className="panel-heading">
          <div>
            <span className="eyebrow">HISTORICAL REPLAY</span>
            <h3>What did the forecast get right?</h3>
          </div>
          {toggle}
        </div>
      ) : (
        <div className="replay-toggle">{toggle}</div>
      )}
      <ForecastChart
        hours={displayHours}
        ground={ground}
        reveal={reveal && !temp && !rain}
        timezone={site.timezone}
      />
      <div className="scenario-controls">
        <label>
          Temperature sensitivity{" "}
          <strong>
            {temp > 0 ? "+" : ""}
            {temp}°C
          </strong>
          <input
            aria-label="Temperature sensitivity"
            type="range"
            min="-5"
            max="5"
            step=".5"
            value={temp}
            onChange={(e) => setTemp(Number(e.target.value))}
          />
        </label>
        <label>
          Hourly rainfall sensitivity <strong>+{rain} mm</strong>
          <input
            aria-label="Rainfall sensitivity"
            type="range"
            min="0"
            max="5"
            step=".5"
            value={rain}
            onChange={(e) => setRain(Number(e.target.value))}
          />
        </label>
        <p>
          Hypothetical input changes. These are sensitivity calculations, not
          causal forecasts. They do not change operational restrictions.
        </p>
      </div>
    </section>
  );
}
