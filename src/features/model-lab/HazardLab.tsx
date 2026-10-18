import { useEffect, useState } from "react";
import { CloudLightning, Download, History, ShieldCheck, Thermometer } from "lucide-react";
import type { HazardKey, Site } from "../../../shared/types";

type Threshold = { flagged: number; hits: number; pod: number; far: number };
type Part = {
  n: number; positives: number; unavailable?: string; baseRate?: number; averagePrecision?: number | null; rocAuc?: number | null;
  brierSkill?: number | null; window?: [string, string]; atScore7?: Threshold;
  climatology?: { averagePrecision: number | null }; ruleEngine?: { averagePrecision: number | null };
  reliability?: { lo: number; hi: number; n: number; predicted: number; observed: number }[];
  bootstrap?: { eventDays: number } & Partial<Record<"ruleEngine" | "climatology", { interval95: [number, number] }>>;
  onset?: { positives: number; averagePrecision: number | null; ruleEngine?: number | null };
};
type Bundle = {
  version: string; counts: Record<string, number>; notes: string[]; scoreAnchors: [number, number][];
  hazards: Record<HazardKey, { labelSources: string[]; labelEnd: string }>;
  overall: { labelSources: string[]; labelEnd: string; inputs: HazardKey[]; coefficients: number[] };
  evaluation: Record<HazardKey | "overall", Record<"validation" | "calibration" | "test" | "unseen", Part> & Partial<Record<"floridaTest" | "floridaUnseen", Part>>> & {
    heatCastVsAsos: Record<"test" | "unseen", { hours: number; heatCastMae: number; rawGfsMae: number; heatCastMaeAbove90F: number | null; rawGfsMaeAbove90F: number | null }> & { note: string };
    osha: { heatInjuries: number; matchedToForecastDays: number; medianHeatProbabilityOnInjuryDays: number | null; medianHeatProbabilitySameMonthDays?: number; shareInjuryDaysScore4Plus: number | null; shareSameMonthDaysScore4Plus?: number; note: string };
    radarStormCells: Record<"test" | "unseen", Part> & { note?: string; unavailable?: string };
  };
};
type Replay = { events: { hazard: HazardKey; siteId: string; siteName: string; date: string; eventType: string; eventMiles: number; heldOutSite: boolean; probabilities: Record<HazardKey | "overall", number>; source: string }[]; note: string };

const ROWS: [HazardKey | "overall", string, string][] = [
  ["wind", "WindCast", "Damaging wind"], ["flood", "FloodCast", "Flooding"], ["lightning", "StormCast", "Severe thunderstorm"],
  ["fire", "FireCast", "Fire detection"], ["heat", "HeatEventCast", "Heat advisory/warning"], ["overall", "OverallCast", "Any warning-level event"],
];
const SOURCE_NAMES: Record<string, string> = { storm_events: "NOAA Storm Events", iem: "IEM NWS warning archive", asos: "ASOS gusts ≥40 mph", tides: "NOAA tide gauges", firms: "NASA FIRMS" };
const pct = (v: number | null | undefined, digits = 0) => v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`;
const num = (v: number | null | undefined, digits = 2) => v === null || v === undefined ? "—" : v.toFixed(digits);
const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`;

export default function HazardLab({ site, onReplay }: { site: Site; onReplay?: (event: number, siteId: string) => void }) {
  const [bundle, setBundle] = useState<Bundle>(), [replay, setReplay] = useState<Replay>(), [error, setError] = useState(""),
    [selected, setSelected] = useState<HazardKey | "overall">("flood"), [part, setPart] = useState<"test" | "unseen">("test"),
    [florida, setFlorida] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/models/hazards.json").then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(b => { if (active) setBundle(b); }).catch(() => { if (active) setError("HazardCast results are unavailable. Run npm run ml:hazards or reconnect once to cache them."); });
    fetch("/data/hazard-replay.json").then(r => r.ok ? r.json() : undefined).then(r => { if (active) setReplay(r); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  if (error) return <section className="panel empty-state" role="alert">{error}</section>;
  if (!bundle) return <section className="panel empty-state">Loading HazardCast evaluation…</section>;
  const e = bundle.evaluation;
  // Florida-only views use the same models, scored on Florida plants' test days only.
  const view = florida ? (part === "test" ? "floridaTest" : "floridaUnseen") : part;
  const scored = (key: HazardKey | "overall") => e[key][view] ?? e[key][part];
  // When a hazard has no test labels, its scorecard falls back to the calibration period.
  const row = (key: HazardKey | "overall") => scored(key).unavailable && part === "test" ? { ...e[key].calibration, fallback: true } : { ...scored(key), fallback: false };
  // A win counts only when the day-clustered 95% interval excludes zero against both baselines.
  const beats = ROWS.filter(([k]) => { const b = row(k).bootstrap; return !!b?.ruleEngine && !!b.climatology && b.ruleEngine.interval95[0] > 0 && b.climatology.interval95[0] > 0; });
  const chosen = row(selected), asos = e.heatCastVsAsos, osha = e.osha, radar = e.radarStormCells;
  return (
    <div className="hazard-lab" data-testid="hazard-lab">
      <div className="metric-grid lab-metrics">
        <div className="metric"><span>Beats rules and climatology</span><strong>{beats.length}<small>/{ROWS.length}</small></strong><p>{part === "test" ? "Fitted" : "Excluded"} {florida ? "Florida " : ""}plants, 2026 test, 95% interval above zero</p></div>
        <div className="metric"><span>OverallCast precision</span><strong>{num(row("overall").averagePrecision)}</strong><p>Rules {num(row("overall").ruleEngine?.averagePrecision)} · climatology {num(row("overall").climatology?.averagePrecision)}</p></div>
        <div className="metric"><span>Test site-days</span><strong>{(bundle.counts[florida ? "floridaTest" : "test"] ?? bundle.counts.test).toLocaleString()}</strong><p>{(bundle.counts[florida ? "floridaUnseen" : "unseen"] ?? bundle.counts.unseen).toLocaleString()} more at {florida ? "seven excluded Florida" : "ten excluded"} plants</p></div>
        <div className="metric"><span>Training site-days</span><strong>{bundle.counts.train.toLocaleString()}</strong><p>2024 · forecasts issued 48 hours ahead</p></div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">LEARNED HAZARD SCORECARD</span><h3>Did it warn before the event?</h3></div>
          <div className="segmented" role="group" aria-label="Evaluation sites">
            <button className={part === "test" ? "active" : ""} aria-pressed={part === "test"} onClick={() => setPart("test")}>Fitted plants</button>
            <button className={part === "unseen" ? "active" : ""} aria-pressed={part === "unseen"} onClick={() => setPart("unseen")}>Excluded plants</button>
            {e.overall.floridaTest && <button className={florida ? "active" : ""} aria-pressed={florida} onClick={() => setFlorida(!florida)}>Florida only</button>}
          </div>
        </div>
        <p className="muted">Each model predicts the chance of an officially recorded event near the plant on the next local day. Average precision rewards ranking real event days first; a random guess scores the base rate. Rules = the production 0–10 scorer applied to the same forecast, without live gauge, alert or strike inputs. The interval is AP(model) − AP(rules) with whole days resampled. Onset AP drops days that continue an event already under way the day before.</p>
        <div className="table-scroll">
          <table className="hazard-table">
            <thead><tr><th>Model</th><th>Event</th><th>Base rate</th><th>Model AP</th><th>Rules AP</th><th>vs rules, 95%</th><th>Onset AP (rules)</th><th>Climatology AP</th><th>Brier skill</th><th>Caught at ≥7</th></tr></thead>
            <tbody>{ROWS.map(([key, name, event]) => {
              const r = row(key);
              return <tr key={key} className={selected === key ? "selected" : ""} onClick={() => setSelected(key)}>
                <th scope="row"><button className="link-button" onClick={() => setSelected(key)} aria-pressed={selected === key}>{name}</button>{r.fallback && <small> calibration period</small>}</th>
                <td>{event}</td><td>{pct(r.baseRate, 1)}</td><td><strong>{num(r.averagePrecision)}</strong></td><td>{num(r.ruleEngine?.averagePrecision)}</td>
                <td>{r.bootstrap?.ruleEngine ? `${signed(r.bootstrap.ruleEngine.interval95[0])} to ${signed(r.bootstrap.ruleEngine.interval95[1])}` : "—"}</td>
                <td>{r.onset ? `${num(r.onset.averagePrecision)} (${num(r.onset.ruleEngine)})` : "—"}</td>
                <td>{num(r.climatology?.averagePrecision)}</td><td>{num(r.brierSkill)}</td><td>{r.atScore7 ? `${pct(r.atScore7.pod)} · ${pct(r.atScore7.far)} false` : "—"}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {florida && <p className="note">Florida only: the same models (trained on all three states), scored on Florida plants' 2026 days. This view was added after the test results were seen; it reports, it does not tune.</p>}
        {part === "unseen" && <p className="note">Excluded plants were chosen by catalog order, not region: six are 25–31 miles from a fitted plant and share county warnings, so these results show a plant left out of fitting, not a new region.</p>}
        {row("fire").fallback && <p className="note">FireCast has no 2026 labels: keyless NASA FIRMS archives end in 2025. Its row reports Jul–Dec 2025, which was also used for calibration, so it is not an independent test.</p>}
      </section>
      <div className="lab-grid">
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">RELIABILITY · {ROWS.find(r => r[0] === selected)![1].toUpperCase()}</span><h3>When it says 30%, does it happen 30%?</h3></div></div>
          <Reliability bins={chosen.reliability ?? []} />
          <p className="muted">{chosen.positives} events in {chosen.n.toLocaleString()} site-days{chosen.window ? ` · ${chosen.window[0]} to ${chosen.window[1]}` : ""}. Label sources: {(selected === "overall" ? bundle.overall : bundle.hazards[selected]).labelSources.map(s => SOURCE_NAMES[s] ?? s).join(", ")}.</p>
        </section>
        <section className="panel proof-panel">
          <div className="panel-heading"><div><span className="eyebrow">INDEPENDENT CHECKS{florida ? " · ALL PLANTS" : ""}</span><h3>Evidence outside the labels</h3></div><ShieldCheck size={21} /></div>
          <dl className="model-facts">
            <div><dt><Thermometer size={14} /> HeatCast vs airport thermometers</dt><dd>{num(asos.test.heatCastMae)} °F vs raw forecast {num(asos.test.rawGfsMae)} °F · hours ≥90 °F: {num(asos.test.heatCastMaeAbove90F)} vs {num(asos.test.rawGfsMaeAbove90F)} · excluded plants {num(asos.unseen.heatCastMae)} vs {num(asos.unseen.rawGfsMae)}</dd></div>
            <div><dt>OSHA heat injuries (never used in training)</dt><dd>{osha.matchedToForecastDays} injury days within 50 mi: median heat chance {pct(osha.medianHeatProbabilityOnInjuryDays, 1)} vs {pct(osha.medianHeatProbabilitySameMonthDays, 1)} on same-plant, same-month days; {pct(osha.shareInjuryDaysScore4Plus)} scored ≥4 vs {pct(osha.shareSameMonthDaysScore4Plus)}. Most of the raw contrast is season.</dd></div>
            <div><dt><CloudLightning size={14} /> StormCast vs NEXRAD storm cells</dt><dd>{radar.unavailable ?? `Radar ≥45 dBZ within 10 mi: AP ${num(radar.test.averagePrecision)} vs climatology ${num(radar.test.climatology?.averagePrecision)} (base rate ${pct(radar.test.baseRate)})`}</dd></div>
          </dl>
          <a className="text-link" href="/models/hazards.json" download><Download size={14} /> Download HazardCast evaluation</a>
          <p className="note">Labels are official warnings and reports near a plant, not confirmed on-site conditions. Airport stations and OSHA employer addresses differ from plant locations.</p>
        </section>
      </div>
      {replay?.events.length ? <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">REPLAY A REAL EVENT</span><h3>The briefing the evening before</h3></div><History size={20} /></div>
        <div className="replay-list">{replay.events.map((event, i) => <article key={`${event.siteId}-${event.date}`} className="replay-card">
          <span className="eyebrow">{event.date} · {event.siteName}{event.heldOutSite ? " · excluded plant" : ""}</span>
          <strong>{event.eventType} {event.eventMiles.toFixed(0)} mi away</strong>
          <p>Predicted the evening before: {pct(event.probabilities[event.hazard])} {ROWS.find(r => r[0] === event.hazard)![1]} · {pct(event.probabilities.overall)} overall.</p>
          <small>{event.source}</small>
          {onReplay && <button className="secondary" onClick={() => onReplay(i, event.siteId)}>Open 6 PM briefing</button>}
        </article>)}</div>
        <p className="note">{replay.note}</p>
      </section> : null}
      <div className="provenance-strip"><ShieldCheck size={16} /><span>{bundle.version} · train 2024 · early stop Jan–Jun 2025 · calibrate Jul–Dec 2025 · test 2026 · {site.heldOut ? "this plant was excluded from fitting" : "ten excluded plants"}</span></div>
    </div>
  );
}

function Reliability({ bins }: { bins: { predicted: number; observed: number; n: number }[] }) {
  const max = Math.max(0.1, ...bins.flatMap(b => [b.predicted, b.observed]));
  const x = (v: number) => 30 + (v / max) * 260, y = (v: number) => 170 - (v / max) * 150;
  return <svg className="reliability" viewBox="0 0 300 190" role="img" aria-label="Predicted probability against observed event rate">
    <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} className="diagonal" />
    <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(0)} className="axis" /><line x1={x(0)} y1={y(0)} x2={x(0)} y2={y(max)} className="axis" />
    <path d={bins.map((b, i) => `${i ? "L" : "M"}${x(b.predicted)},${y(b.observed)}`).join(" ")} className="observed" />
    {bins.map(b => <circle key={b.predicted} cx={x(b.predicted)} cy={y(b.observed)} r={2.5 + Math.min(5, Math.log10(b.n + 1))}><title>{`${b.n} site-days · predicted ${(b.predicted * 100).toFixed(1)}% · observed ${(b.observed * 100).toFixed(1)}%`}</title></circle>)}
    <text x={x(max / 2)} y={188} textAnchor="middle">predicted</text><text x={8} y={y(max / 2)} transform={`rotate(-90 8 ${y(max / 2)})`} textAnchor="middle">observed</text>
  </svg>;
}
