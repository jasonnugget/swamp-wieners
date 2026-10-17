import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  Download,
  Flame,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  MapPin,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Thermometer,
  TriangleAlert,
  Waves,
  WifiOff,
  Wind,
  Zap,
} from "lucide-react";
import type { Category, ModelBundle, Site, Snapshot } from "../shared/types";
import { CATEGORY_LABELS, TASK_LABELS } from "../shared/policy";
import { cacheAssets, loadSnapshot, readCachedSnapshot, request } from "./api";
import SiteMap from "./SiteMap";
import ForecastChart from "./ForecastChart";
import WorkWindows from "./WorkWindows";
import Reports, { ReportForm } from "./Reports";
const ModelLab = lazy(() => import("./ModelLab"));
type Page = "dashboard" | "lab" | "reports" | "briefings";
const navigation = [
  { id: "dashboard" as Page, label: "Overview", icon: LayoutDashboard },
  { id: "lab" as Page, label: "Model Lab", icon: FlaskConical },
  { id: "reports" as Page, label: "Crew reports", icon: MapPin },
  { id: "briefings" as Page, label: "Safety briefings", icon: ClipboardList },
];
const icons: Record<Category, typeof Wind> = {
  weather: Wind,
  heat: Thermometer,
  lightning: Zap,
  flood: Waves,
  wildfire: Flame,
  soil: Gauge,
  wildlife: TriangleAlert,
};
const severityClass = (n: number | null | undefined) =>
  n == null ? "unknown" : n >= 8 ? "danger" : n >= 5 ? "warning" : "safe";
function Badge({ value }: { value: number | null | undefined }) {
  return (
    <span className={`risk-badge ${severityClass(value)}`}>
      {value == null ? "—" : value.toFixed(1)}
    </span>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(readCachedSnapshot),
    [bundle, setBundle] = useState<ModelBundle>(),
    [selected, setSelected] = useState(
      localStorage.getItem("planit-site") ?? "",
    ),
    [page, setPage] = useState<Page>("dashboard"),
    [offline, setOffline] = useState(false),
    [error, setError] = useState(""),
    [reportOpen, setReportOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [demoOpen, setDemoOpen] = useState(false),
    [notice, setNotice] = useState("");
  const reload = useCallback(async () => {
    try {
      const result = await loadSnapshot();
      setSnapshot(result.snapshot);
      setOffline(result.offline);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, []);
  useEffect(() => {
    void reload();
    fetch("/models/bundle.json")
      .then((r) => r.json())
      .then(setBundle)
      .catch(() =>
        setError("Model bundle unavailable. Check the server and data files."),
      );
    void cacheAssets().catch(() =>
      setNotice(
        "The offline package could not be prepared. Keep the local server connected.",
      ),
    );
    const stream = new EventSource("/api/events");
    stream.onmessage = () => void reload();
    stream.onerror = () => void reload();
    const timer = setInterval(() => void reload(), 15000);
    return () => {
      stream.close();
      clearInterval(timer);
    };
  }, [reload]);
  useEffect(() => {
    if (selected) localStorage.setItem("planit-site", selected);
  }, [selected]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function action(path: string, body: unknown, success: string) {
    setBusy(true);
    setError("");
    try {
      const result = await request<Snapshot>(path, body);
      if (result.sites) setSnapshot(result);
      else await reload();
      setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!snapshot || !bundle)
    return (
      <div className="loading-screen">
        <div className="brand-mark">
          <Zap size={28} fill="currentColor" />
        </div>
        <h1>
          PlanIT<span>Control</span>
        </h1>
        <p>Connecting field intelligence…</p>
        {error && (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <button className="primary" onClick={() => location.reload()}>
              Retry connection
            </button>
          </>
        )}
      </div>
    );
  const site =
      snapshot.sites.find((s) => s.id === selected) ?? snapshot.sites[0],
    decision = snapshot.decisions[site.id],
    forecast = snapshot.forecasts[site.id];
  const ranked = [...snapshot.sites].sort(
    (a, b) =>
      (snapshot.decisions[b.id].index ?? -1) -
        (snapshot.decisions[a.id].index ?? -1) ||
      snapshot.decisions[b.id].tasks.filter((t) => t.state === "HOLD").length -
        snapshot.decisions[a.id].tasks.filter((t) => t.state === "HOLD").length,
  );
  const filtered = ranked.filter((s) =>
    `${s.name} ${s.state} ${s.county}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const openReports = snapshot.reports.filter((r) => r.status === "open"),
    holds = Object.values(snapshot.decisions).filter((d) =>
      d.tasks.some((t) => t.state === "HOLD"),
    ).length;
  const weather = forecast?.hours ?? [],
    peak = weather.length ? Math.max(...weather.map((h) => h.heat[2])) : null,
    briefings = snapshot.briefings.filter((b) => b.siteId === site.id);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: site.timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(snapshot.now));
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("dashboard");
          }}
        >
          <span className="brand-mark">
            <Zap size={24} fill="currentColor" />
          </span>
          <span>
            PlanIT<span className="brand-sub">CONTROL</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">S</span>
          <div>
            Sperry field operations<small>Southeast region</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={18} />
              {item.label}
              {item.id === "reports" && openReports.length > 0 && (
                <span className="nav-count">{openReports.length}</span>
              )}
              {item.id === "lab" && <span className="new-tag">ML</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="field-note">
            <span className="small-icon">
              <ShieldCheck size={18} />
            </span>
            <strong>Built for the next shift.</strong>
            <p>Every condition. Every report. One clearer work decision.</p>
            <span>
              <i />
              50 real power plants
            </span>
          </div>
          <button
            className="demo-toggle"
            onClick={() => setDemoOpen(!demoOpen)}
          >
            <Radio size={16} />
            Demo controls
            <ChevronRight size={14} />
          </button>
          <div className="profile">
            <span>SC</span>
            <div>
              Site supervisor<small>Hackathon workspace</small>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={13} />
            <strong>{navigation.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="connection">
              {offline ? <WifiOff size={13} /> : <span className="live-dot" />}
              {offline
                ? "Cached workspace"
                : snapshot.clockMode === "demo"
                  ? "Historical demo"
                  : "Connected"}
            </span>
            <span className="top-divider" />
            <span className="top-date">{date}</span>
            <button
              className="notification-button"
              aria-label="View alerts"
              onClick={() => {
                setPage("dashboard");
                document
                  .getElementById("hazard-channels")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <Bell size={18} />
              {holds > 0 && <i />}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">FIELD INTELLIGENCE, IN FOCUS</span>
              <h1>
                {page === "dashboard"
                  ? "A clearer picture. A safer shift."
                  : page === "lab"
                    ? "Know what your model knows."
                    : page === "reports"
                      ? "Local knowledge that stays."
                      : "Tomorrow starts with today."}
              </h1>
              <p>
                {page === "dashboard"
                  ? "Environmental signals and crew knowledge, brought together before work begins."
                  : page === "lab"
                    ? "Train locally. Test honestly. Keep every prediction connected to evidence."
                    : page === "reports"
                      ? "Give the next crew the context that never makes it into a weather forecast."
                      : "Site conditions, work restrictions, and unresolved reports in one handoff."}
              </p>
            </div>
            <button className="primary" onClick={() => setReportOpen(true)}>
              <Plus size={16} />
              Report hazard
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={16} />
              {error}
              <button className="text-button" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {offline && (
            <div className="offline-banner">
              <WifiOff size={16} />
              Showing the last saved workspace. Browser inference and training
              remain available with cached assets. Reconnect to share reports.
            </div>
          )}
          <div className="site-context">
            <div className="site-selector">
              <MapPin size={18} />
              <div>
                <span>ACTIVE SITE</span>
                <select
                  aria-label="Active site"
                  value={site.id}
                  onChange={(e) => {
                    if (!busy) setSelected(e.target.value);
                  }}
                  disabled={busy}
                >
                  {snapshot.sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.state}
                    </option>
                  ))}
                </select>
              </div>
              <ChevronDown size={14} />
            </div>
            <div className="site-meta">
              <span>
                {site.county} County, {site.state}
              </span>
              <i />
              EIA #{site.id}
              <i />
              {site.capacityMw.toLocaleString()} MW
            </div>
            <span className="source-pill">
              <span className="live-dot" />
              {forecast.mode === "historical"
                ? "Historical forecast replay"
                : "Live forecast"}
            </span>
          </div>
          {demoOpen && (
            <section className="demo-panel">
              <div>
                <Radio size={16} />
                <strong>Demonstration controls</strong>
                <span>
                  Clock:{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone: site.timezone,
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(snapshot.now))}{" "}
                  · {site.timezone}
                </span>
              </div>
              <div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    action(
                      "/demo/strike",
                      { siteId: site.id, distanceMiles: 6 },
                      "Simulated strike recorded; outdoor work is on hold.",
                    )
                  }
                >
                  <Zap size={14} />
                  Strike within 6 mi
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    action(
                      "/clock",
                      { mode: "demo", advanceMinutes: 10 },
                      "Demo clock advanced by ten minutes.",
                    )
                  }
                >
                  +10 min
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    const parts = new Intl.DateTimeFormat("en-US", {
                      timeZone: site.timezone,
                      hour: "2-digit",
                      minute: "2-digit",
                      hourCycle: "h23",
                    }).formatToParts(new Date(snapshot.now));
                    const p = Object.fromEntries(
                      parts.map((x) => [x.type, x.value]),
                    );
                    const advance =
                      (18 * 60 -
                        Number(p.hour) * 60 -
                        Number(p.minute) +
                        1440) %
                      1440;
                    void action(
                      "/clock",
                      { mode: "demo", advanceMinutes: advance || 1440 },
                      "6 PM scheduler executed; next-day briefings are ready.",
                    );
                  }}
                >
                  Run to 6 PM
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    action(
                      "/clock",
                      { mode: "real" },
                      "Real-time clock enabled. Historical data remains labeled.",
                    )
                  }
                >
                  Use real clock
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    action(
                      "/demo/reset",
                      {},
                      "Demo reset. Demonstration reports, alerts, and briefings cleared.",
                    )
                  }
                >
                  Reset demo
                </button>
              </div>
              <p>
                Reset clears this prototype’s demonstration records. Lightning
                inputs are simulated; weather and model outcomes are real
                historical records.
              </p>
            </section>
          )}
          {page === "dashboard" && (
            <>
              <div className="metric-grid">
                <div className="metric">
                  <span>
                    <MapPin size={14} />
                    Sites monitored
                  </span>
                  <strong>
                    {snapshot.sites.length}
                    <small>sites</small>
                  </strong>
                  <p>
                    <span className="tiny-green" />
                    Actual EIA plant locations
                  </p>
                </div>
                <div className="metric">
                  <span>
                    <TriangleAlert size={14} />
                    Sites with active holds
                  </span>
                  <strong>
                    {holds}
                    <small>/ {snapshot.sites.length}</small>
                  </strong>
                  <p>
                    {holds
                      ? "Crew or lightning restrictions in effect"
                      : "No active hard holds in this replay"}
                  </p>
                </div>
                <div className="metric">
                  <span>
                    <Thermometer size={14} />
                    Site peak heat index
                  </span>
                  <strong>
                    {peak === null ? "—" : Math.round(peak)}
                    <small>°F</small>
                  </strong>
                  <p>HeatCast upper forecast estimate</p>
                </div>
                <div className="metric">
                  <span>
                    <ClipboardList size={14} />
                    Crew reports to carry
                  </span>
                  <strong>
                    {openReports.length}
                    <small>open</small>
                  </strong>
                  <p>Unresolved knowledge for the next shift</p>
                </div>
              </div>
              <div className="overview-grid">
                <section className="panel map-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">SUPERVISOR VIEW</span>
                      <h3>One region. Every site.</h3>
                    </div>
                    <span className="subtle-pill">
                      <span className="live-dot" />
                      {snapshot.sites.length} sites
                    </span>
                  </div>
                  <SiteMap
                    sites={snapshot.sites}
                    decisions={snapshot.decisions}
                    selected={site.id}
                    onSelect={setSelected}
                    reports={snapshot.reports}
                  />
                  <div className="map-footer">
                    <ShieldCheck size={14} />
                    Ranked by the highest active hazard. Unknown coverage stays
                    visible.<span>0–10 hazard index</span>
                  </div>
                </section>
                <section className="panel priorities-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">WHERE TO FOCUS</span>
                      <h3>Site priorities</h3>
                    </div>
                    <ArrowDown size={17} />
                  </div>
                  <label className="search">
                    <Search size={15} />
                    <input
                      aria-label="Search sites"
                      placeholder="Find a site or county"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <div className="priority-list">
                    {filtered.map((s, i) => (
                      <button
                        key={s.id}
                        className={`priority-row ${s.id === site.id ? "selected" : ""}`}
                        onClick={() => setSelected(s.id)}
                      >
                        <span className="site-rank">
                          {i + 1 < 10 ? "0" : ""}
                          {i + 1}
                        </span>
                        <span className="priority-name">
                          <strong>{s.name}</strong>
                          <small>
                            {s.county}, {s.state} ·{" "}
                            {snapshot.decisions[s.id].unknownCount} unknown
                          </small>
                        </span>
                        <Badge value={snapshot.decisions[s.id].index} />
                      </button>
                    ))}
                    {!filtered.length && (
                      <p className="empty">No matching sites.</p>
                    )}
                  </div>
                  <div className="priority-footer">
                    {filtered.length} of 50 sites
                    <span>EIA-860M · Aug 2026</span>
                  </div>
                </section>
              </div>
              <div className="detail-grid">
                <section className="panel forecast-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">PLAN BEFORE THE SHIFT</span>
                      <h3>Tomorrow’s heat window</h3>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => setPage("lab")}
                    >
                      Inspect in Model Lab
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <ForecastChart hours={weather} timezone={site.timezone} />
                  <WorkWindows
                    hours={weather}
                    timezone={site.timezone}
                    soilThreshold={bundle.soilThresholds[site.id][1]}
                  />
                  <div className="forecast-footer">
                    <span>
                      <Clock3 size={14} />
                      {weather[0] &&
                        new Date(weather[0].time).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        })}{" "}
                      · {forecast.mode} · {site.timezone}
                    </span>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        action(
                          `/sites/${site.id}/refresh`,
                          {},
                          "Real clock enabled. Feed refresh completed; inspect any unavailable sources.",
                        )
                      }
                    >
                      <RefreshCw size={13} className={busy ? "spin" : ""} />
                      Connect live sources
                    </button>
                  </div>
                  {Object.entries(snapshot.feedStatus)
                    .filter(([id]) => id.startsWith(site.id + ":"))
                    .map(([id, status]) => (
                      <p
                        className={`feed-status ${status.ok ? "" : "error"}`}
                        key={id}
                      >
                        {status.ok ? "✓" : "!"} {status.message} ·{" "}
                        {new Date(status.checkedAt).toLocaleTimeString()}
                      </p>
                    ))}
                </section>
                <section className="panel work-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">THE WORK DECISION</span>
                      <h3>What can the crew do?</h3>
                    </div>
                    <Badge value={decision.index} />
                  </div>
                  {decision.tasks.map((t) => (
                    <div className="task-row" key={t.task}>
                      <div>
                        <span
                          className={`status-dot ${t.state.toLowerCase()}`}
                        />
                        <strong>{TASK_LABELS[t.task]}</strong>
                        <span
                          className={`pill ${t.state === "HOLD" ? "danger" : t.state === "RESTRICTED" ? "warning" : t.state === "UNKNOWN" ? "unknown" : "safe"}`}
                        >
                          {t.state}
                        </span>
                      </div>
                      <p>
                        {t.reasons.length
                          ? t.reasons.slice(0, 2).join(" · ")
                          : "No applicable restrictions in the loaded evidence."}
                      </p>
                    </div>
                  ))}
                  {decision.lightningUntil && (
                    <div className="lightning-countdown">
                      <Zap size={17} />
                      <div>
                        <strong>Lightning all-clear countdown</strong>
                        <p>
                          {Math.ceil(
                            (Date.parse(decision.lightningUntil) -
                              Date.parse(snapshot.now)) /
                              60000,
                          )}{" "}
                          minutes remaining · resets with every strike
                        </p>
                      </div>
                    </div>
                  )}
                  <p className="work-footnote">
                    {decision.policyVersion} · prototype screening rules.
                    Available means no applicable restriction in loaded data.
                  </p>
                </section>
              </div>
              <section className="panel hazards-panel" id="hazard-channels">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">ONE COMBINED RISK PICTURE</span>
                    <h3>Seven hazards. Clear evidence.</h3>
                  </div>
                  <span className="muted">
                    {decision.unknownCount} channels need verification
                  </span>
                </div>
                <div className="hazard-grid">
                  {decision.channels.map((channel) => {
                    const Icon = icons[channel.category];
                    return (
                      <article
                        key={channel.category}
                        className={`hazard-card ${severityClass(channel.severity)}`}
                      >
                        <div>
                          <Icon size={18} />
                          <span>{CATEGORY_LABELS[channel.category]}</span>
                          <span className="hazard-number">
                            {channel.severity?.toFixed(1) ?? "?"}
                          </span>
                        </div>
                        <strong>{channel.title}</strong>
                        <p>{channel.detail}</p>
                        <small>
                          {channel.mode} · {channel.source}
                        </small>
                      </article>
                    );
                  })}
                </div>
              </section>
              <div className="handoff-callout">
                <span className="callout-icon">
                  <Sparkles size={23} />
                </span>
                <div>
                  <span className="eyebrow">
                    KNOWLEDGE THAT OUTLASTS A SHIFT
                  </span>
                  <h3>A crew’s report becomes the next crew’s context.</h3>
                  <p>
                    Report it now. Change the work decision. Carry it into the 6
                    PM briefing.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => setPage("reports")}
                >
                  Open site memory
                  <ArrowRight size={15} />
                </button>
              </div>
            </>
          )}
          {page === "lab" && (
            <Suspense
              fallback={
                <section className="panel empty-state">
                  Loading the browser ML runtime…
                </section>
              }
            >
              <ModelLab
                key={site.id}
                site={site}
                bundle={bundle}
                forecast={forecast}
              />
            </Suspense>
          )}
          {page === "reports" && (
            <Reports
              site={site}
              snapshot={snapshot}
              onReport={() => setReportOpen(true)}
              onChange={reload}
            />
          )}
          {page === "briefings" && (
            <>
              <div className="section-title">
                <div>
                  <span className="eyebrow">THE NEXT SHIFT HANDOFF</span>
                  <h2>Daily safety briefings</h2>
                  <p className="muted">
                    Created at 6 PM in each site’s timezone. Unresolved reports
                    travel with the location.
                  </p>
                </div>
                <span className="backend">
                  <Clock3 size={15} />
                  6:00 PM local
                </span>
              </div>
              {briefings.length ? (
                briefings
                  .slice()
                  .reverse()
                  .map((b) => (
                    <section key={b.id} className="panel briefing-card">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">
                            {b.forecastMode.toUpperCase()} · GENERATED BY THE
                            SCHEDULER
                          </span>
                          <h3>
                            {site.name} · {b.localDate}
                          </h3>
                        </div>
                        <Badge value={b.decision.index} />
                      </div>
                      <pre>{b.text}</pre>
                      <div className="briefing-meta">
                        <span>
                          {b.reportIds.length} unresolved reports carried
                          forward · {b.decision.policyVersion}
                        </span>
                        <button
                          className="secondary"
                          onClick={() => {
                            const blob = new Blob([b.text], {
                                type: "text/plain",
                              }),
                              url = URL.createObjectURL(blob),
                              a = document.createElement("a");
                            a.href = url;
                            a.download = `planit-${site.id}-${b.localDate}.txt`;
                            a.click();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                          }}
                        >
                          <Download size={14} />
                          Download briefing
                        </button>
                      </div>
                    </section>
                  ))
              ) : (
                <section className="panel empty-state">
                  <ClipboardList size={32} />
                  <h3>The next briefing runs at 6 PM</h3>
                  <p>
                    Use the demo clock to execute the real scheduler and see the
                    handoff.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => setDemoOpen(true)}
                  >
                    Open demo controls
                    <Clock3 size={15} />
                  </button>
                </section>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              PlanIT Control<span>FIELD INTELLIGENCE</span>
            </span>
            <p>
              Historical replay and live sources are labeled. Prototype policies
              support supervisor review.
            </p>
            <a href="/data/provenance.json" target="_blank" rel="noreferrer">
              Sources & provenance
              <ArrowUpRight size={12} />
            </a>
          </footer>
        </main>
      </div>
      {reportOpen && (
        <ReportForm
          site={site}
          snapshot={snapshot}
          onClose={() => setReportOpen(false)}
          onSaved={() => {
            void reload();
            setNotice(
              "Report shared. Selected tasks are on hold until reviewed.",
            );
          }}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          <ShieldCheck size={17} />
          {notice}
        </div>
      )}
    </div>
  );
}
