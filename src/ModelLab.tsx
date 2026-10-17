import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Cpu,
  Download,
  FlaskConical,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Forecast, ModelBundle, Sample, Site } from "../shared/types";
import { forecastSample, heatIndex } from "../shared/model";
import type { CalibrationResult } from "./browser-ml";
import ForecastChart from "./ForecastChart";

export default function ModelLab({
  site,
  bundle,
  forecast,
}: {
  site: Site;
  bundle: ModelBundle;
  forecast: Forecast;
}) {
  const [target, setTarget] = useState<"heat" | "soil">("heat"),
    [samples, setSamples] = useState<Sample[]>([]),
    [backend, setBackend] = useState("Checking device…"),
    [busy, setBusy] = useState(false),
    [epoch, setEpoch] = useState(0),
    [loss, setLoss] = useState<number[]>([]),
    [result, setResult] = useState<CalibrationResult>(),
    [error, setError] = useState(""),
    [reveal, setReveal] = useState(false),
    [inference, setInference] = useState<{
      elapsed: number;
      backend: string;
      maxDifference: number;
    }>(),
    [temp, setTemp] = useState(0),
    [rain, setRain] = useState(0);
  useEffect(() => {
    let active = true;
    setSamples([]);
    setResult(undefined);
    setEpoch(0);
    setLoss([]);
    setInference(undefined);
    setError("");
    fetch("/data/samples.json")
      .then((r) => r.json())
      .then((data: Record<string, Sample[]>) => {
        if (active) setSamples(data[site.id] ?? []);
      })
      .catch(() => {
        if (active)
          setError(
            "Historical samples are not cached. Reconnect once to download them.",
          );
      });
    import("./browser-ml")
      .then(async (ml) => {
        const b = await ml.initialize();
        const saved = await ml.loadCalibration(site.id, target);
        if (active) {
          setBackend(b.toUpperCase());
          if (saved?.modelVersion === bundle.version) setResult(saved);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [site.id, target, bundle.version]);
  async function train() {
    setBusy(true);
    setError("");
    setEpoch(0);
    setLoss([]);
    try {
      const ml = await import("./browser-ml");
      const r = await ml.calibrate(bundle, samples, site.id, target, (e, l) => {
        setEpoch(e);
        setLoss((v) => [...v, l]);
      });
      await ml.saveCalibration(r);
      setResult(r);
      setBackend(r.backend.toUpperCase());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function infer() {
    setBusy(true);
    setError("");
    try {
      const ml = await import("./browser-ml");
      const r = await ml.runBrowserInference(
        bundle[target],
        samples.filter((s) => s.split === "test"),
      );
      setInference(r);
      setBackend(r.backend.toUpperCase());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const metrics =
      target === "heat" ? bundle.evaluation.heat : bundle.evaluation.soil,
    unit = target === "heat" ? "°F" : "m³/m³";
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
  const improvement = result
    ? ((result.beforeMae - result.afterMae) /
        Math.max(0.000001, result.beforeMae)) *
      100
    : 0;
  return (
    <div className="lab-page">
      <div className="lab-intro">
        <div>
          <span className="eyebrow">
            <FlaskConical size={14} /> THE FIELD ML LAB
          </span>
          <h2>
            Forecast it. Test it. <em>Learn the site.</em>
          </h2>
          <p>
            Two custom models. Real historical data. A local correction trained
            on this device.
          </p>
        </div>
        <span className="backend">
          <Cpu size={15} />
          {backend}
        </span>
      </div>
      <div className="model-tabs">
        <button
          className={target === "heat" ? "active" : ""}
          onClick={() => {
            if (!busy) setTarget("heat");
          }}
          disabled={busy}
        >
          HeatCast <span>Heat exposure</span>
        </button>
        <button
          className={target === "soil" ? "active" : ""}
          onClick={() => {
            if (!busy) setTarget("soil");
          }}
          disabled={busy}
        >
          GroundCast <span>Surface wetness</span>
        </button>
        <span className="model-version">
          64 → 32 → 3 · quantile MLP · {bundle.version}
        </span>
      </div>
      <div className="metric-grid lab-metrics">
        <div className="metric">
          <span>Held-out model error</span>
          <strong>
            {metrics.mae.toFixed(target === "heat" ? 2 : 4)}{" "}
            <small>{unit}</small>
          </strong>
          <p>Median prediction MAE</p>
        </div>
        <div className="metric">
          <span>Baseline error</span>
          <strong>
            {metrics.baselineMae.toFixed(target === "heat" ? 2 : 4)}{" "}
            <small>{unit}</small>
          </strong>
          <p>
            {target === "heat"
              ? "Uncorrected public forecast"
              : "Training-period site median"}
          </p>
        </div>
        <div className="metric">
          <span>Interval coverage</span>
          <strong>
            {(metrics.coverage * 100).toFixed(1)}
            <small>%</small>
          </strong>
          <p>Nominal 80% prediction interval</p>
        </div>
        <div className="metric">
          <span>Test samples</span>
          <strong>{metrics.count.toLocaleString()}</strong>
          <p>Jan–Sep 2026 · fitted sites</p>
        </div>
      </div>
      <div className="lab-grid">
        <section className="panel training-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">LOCAL CALIBRATION</span>
              <h3>A model that learns {site.name}</h3>
            </div>
            <Sparkles size={20} />
          </div>
          <p className="muted">
            Fit a small residual correction to historical model errors. Test on
            later dates it never trained on. Operational restrictions keep using
            the frozen model.
          </p>
          <div className="split-timeline">
            <div>
              <i />
              Train<strong>2024</strong>
              <small>
                {samples.filter((s) => s.split === "train").length} samples
              </small>
            </div>
            <div>
              <i />
              Validate<strong>Jan–Jun ’25</strong>
              <small>
                {samples.filter((s) => s.split === "validation").length} samples
              </small>
            </div>
            <div>
              <i />
              Test<strong>Jan–Sep ’26</strong>
              <small>
                {samples.filter((s) => s.split === "test").length} samples
              </small>
            </div>
          </div>
          <button
            className="primary train-button"
            disabled={busy || !samples.length}
            onClick={train}
          >
            {busy ? (
              <RefreshCw size={16} className="spin" />
            ) : (
              <Play size={16} />
            )}{" "}
            {busy ? `Learning · epoch ${epoch} / 35` : "Learn this site"}
            <ArrowRight size={16} />
          </button>
          {(loss.length > 0 || result) && (
            <div className="training-progress">
              <div>
                <span>Actual training loss</span>
                <strong>
                  {(loss.at(-1) ?? result?.loss.at(-1))?.toFixed(5)}
                </strong>
              </div>
              <svg
                viewBox="0 0 400 64"
                role="img"
                aria-label="Actual browser training loss"
              >
                <path
                  d={(loss.length ? loss : result!.loss)
                    .map(
                      (v, i, a) =>
                        `${i ? "L" : "M"}${(i * 398) / Math.max(1, a.length - 1)},${58 - (v / Math.max(...a, 0.00001)) * 50}`,
                    )
                    .join(" ")}
                  stroke="#648543"
                  strokeWidth="2"
                  fill="none"
                />
              </svg>
            </div>
          )}
          {result && (
            <div className="calibration-result">
              <div className="result-heading">
                <Check size={16} />
                <strong>Trained and saved on this device</strong>
              </div>
              <div className="comparison">
                <div>
                  <span>Base MAE</span>
                  <strong>
                    {result.beforeMae.toFixed(target === "heat" ? 2 : 4)}
                  </strong>
                </div>
                <ArrowRight size={18} />
                <div>
                  <span>Local MAE</span>
                  <strong>
                    {result.afterMae.toFixed(target === "heat" ? 2 : 4)}
                  </strong>
                </div>
                <span
                  className={`pill ${improvement > 0 ? "safe" : "warning"}`}
                >
                  {improvement > 0
                    ? `${improvement.toFixed(1)}% lower error`
                    : `${Math.abs(improvement).toFixed(1)}% higher error`}
                </span>
              </div>
              <p>
                {result.trainingCount} training · {result.validationCount}{" "}
                validation · {result.testCount} test samples ·{" "}
                {(result.elapsedMs / 1000).toFixed(1)} seconds ·{" "}
                {result.backend.toUpperCase()}
              </p>
              <small>
                Experimental candidate. The test result is descriptive, not used
                to select weights or activate this model.
              </small>
            </div>
          )}
          {site.heldOut && (
            <p className="note">
              This plant was excluded from base-model fitting. Local calibration
              is a separate adaptation experiment.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
        <section className="panel proof-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">INSPECT THE MODEL</span>
              <h3>Evidence, not a mystery score</h3>
            </div>
            <ShieldCheck size={21} />
          </div>
          <dl className="model-facts">
            <div>
              <dt>Inputs</dt>
              <dd>
                48h forecast weather, antecedent estimated rainfall, time,
                location
              </dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>
                {target === "heat"
                  ? "Heat index calculated from ERA5-Land temperature and humidity"
                  : "ERA5-Land surface soil moisture at 0–7 cm"}
              </dd>
            </div>
            <div>
              <dt>Uncertainty</dt>
              <dd>
                10th / 50th / 90th quantiles; widened on a separate calibration
                period
              </dd>
            </div>
            <div>
              <dt>Unseen-site MAE</dt>
              <dd>
                {(target === "heat"
                  ? bundle.evaluation.unseenHeat
                  : bundle.evaluation.unseenSoil
                ).mae.toFixed(target === "heat" ? 2 : 4)}{" "}
                {unit} · ten excluded plants
              </dd>
            </div>
          </dl>
          <button
            className="secondary"
            onClick={infer}
            disabled={busy || !samples.length}
          >
            <Cpu size={15} />
            Run fresh browser inference
          </button>
          {inference && (
            <div className="inference-result">
              <Check size={15} />
              <div>
                <strong>
                  {inference.elapsed.toFixed(1)} ms ·{" "}
                  {inference.backend.toUpperCase()}
                </strong>
                <p>
                  Computed now, on this device. Maximum difference from
                  reference: {inference.maxDifference.toExponential(2)}.
                </p>
              </div>
            </div>
          )}
          <a className="text-link" href="/models/evaluation.json" download>
            <Download size={14} />
            Download evaluation results
          </a>
          <p className="note">
            Reanalysis is modeled environmental data, not a job-site sensor.
            GroundCast does not estimate bearing capacity or the probability a
            vehicle gets stuck.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">HISTORICAL REPLAY</span>
            <h3>What did the forecast get right?</h3>
          </div>
          <button className="secondary" onClick={() => setReveal(!reveal)}>
            {reveal ? "Hide outcomes" : "Reveal reanalysis outcomes"}
            <ArrowRight size={14} />
          </button>
        </div>
        <ForecastChart
          hours={displayHours}
          ground={target === "soil"}
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
      <div className="provenance-strip">
        <ShieldCheck size={16} />
        <span>
          Chronological splits · training-only normalization · ten excluded
          plants · frozen test set
        </span>
        <a href="/data/provenance.json" target="_blank" rel="noreferrer">
          Data provenance ↗
        </a>
      </div>
    </div>
  );
}
