import { lazy, Suspense, useCallback, useEffect, useState, type MouseEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ClipboardList,
  Clock3,
  Download,
  Flame,
  Gauge,
  MapPin,
  Menu,
  X,
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
import type { Category, ModelBundle, Site, Snapshot } from "../../shared/types";
import { CATEGORY_LABELS, TASK_LABELS } from "../../shared/policy";
import { cacheAssets, loadSnapshot, readCachedSnapshot, request } from "../lib/api";
import SiteMap from "../components/SiteMap";
import ForecastChart from "../components/ForecastChart";
import WorkWindows from "../components/WorkWindows";
import LoadingScreen from "./LoadingScreen";
import HomePage from "./HomePage";
import { pageHref, pageLabels, readPage, type Page } from "./navigation";
import Reports, { ReportForm } from "../features/reports/Reports";
const ModelLab = lazy(() => import("../features/model-lab/ModelLab"));
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
    [introComplete, setIntroComplete] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    [selected, setSelected] = useState(
      localStorage.getItem("planit-site") ?? "",
    ),
    [page, setPage] = useState<Page>(readPage),
    [menuOpen, setMenuOpen] = useState(false),
    [offline, setOffline] = useState(false),
    [error, setError] = useState(""),
    [reportOpen, setReportOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [demoOpen, setDemoOpen] = useState(false),
    [notice, setNotice] = useState("");
  function navigate(next: Page) {
    if (next !== page) history.pushState(null, "", pageHref(next));
    setPage(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => document.getElementById("workspace-content")?.focus({ preventScroll: true }));
  }
  function navigateLink(event: MouseEvent<HTMLAnchorElement>, next: Page) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(next);
  }
  useEffect(() => {
    const pop = () => { setPage(readPage()); setMenuOpen(false); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    document.title = `${pageLabels[page]} | PlanIT Control`;
  }, [page]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        document.querySelector<HTMLButtonElement>(".menu-control")?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);
  useEffect(() => {
    const timer = setTimeout(() => setIntroComplete(true), 1600);
    return () => clearTimeout(timer);
  }, []);
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
    if (!selected || !snapshot?.sites.find(s => s.id === selected)?.catalogOnly || offline) return;
    const controller = new AbortController();
    void fetch(`/api/sites/${encodeURIComponent(selected)}/screening`, { signal: controller.signal })
      .then(r => { if (r.ok) return reload(); })
      .catch(() => { /* Missing official forecasts stay unknown; automatic refresh retries. */ });
    return () => controller.abort();
  }, [selected, snapshot?.sites.length, offline, reload]);
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
  if (!snapshot || !bundle || !introComplete)
    return <LoadingScreen snapshotReady={!!snapshot} modelReady={!!bundle} error={error} onEnter={snapshot && bundle ? () => setIntroComplete(true) : undefined} />;
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
  const officialHeat = decision.channels.find(c => c.category === "heat" && c.source.startsWith("NOAA/NWS"));
  const officialHours = officialHeat ? (snapshot.weatherScreenings?.[site.id]?.hours ?? []).filter(h => Date.parse(h.time) >= Date.now() - 3600000 && Date.parse(h.time) < Date.now() + 24 * 3600000).flatMap(h => h.heatIndex === null ? [] : [h.heatIndex]) : [];
  const weather = forecast?.hours ?? [],
    peak = weather.length ? Math.max(...weather.map((h) => h.heat[2])) : officialHours.length ? Math.max(...officialHours) : null,
    briefings = snapshot.briefings.filter((b) => b.siteId === site.id);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: site.timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(snapshot.now));
  return (
    <div className={`app-shell view-${page}`}>
      <a className="skip-link" href="#workspace-content">Skip to workspace</a>
      <header className="site-header">
        <a className="site-wordmark" href={pageHref("home")} onClick={e => navigateLink(e, "home")} aria-label="PlanIT home">PlanIT<span className="wordmark-cross" aria-hidden="true">+</span></a>
        <nav id="site-navigation" className={menuOpen ? "site-navigation is-open" : "site-navigation"} aria-label="Workspace navigation">
          {(Object.keys(pageLabels) as Page[]).map(item => <a key={item} href={pageHref(item)} onClick={e => navigateLink(e, item)} aria-current={page === item ? "page" : undefined}>{pageLabels[item]}{item === "reports" && openReports.length > 0 && <span className="report-count">{openReports.length}</span>}</a>)}
        </nav>
        <div className="site-header-actions">
          <button className="header-report" onClick={() => setReportOpen(true)}>Report hazard<ArrowUpRight size={17} aria-hidden="true" /></button>
          <button className="demo-control" aria-label="Demo controls" aria-expanded={demoOpen} onClick={() => setDemoOpen(!demoOpen)}><Radio size={17} aria-hidden="true" /></button>
          <button className="menu-control" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}</button>
        </div>
      </header>
      <div className="main-shell">
        <main id="workspace-content" className="overflow-x-hidden w-full max-w-full" tabIndex={-1}>
          {page === "home" && <HomePage onNavigate={navigateLink} />}
          {page !== "home" && page !== "atlas" && <div className="page-heading">
            <div><p className="section-caption">PlanIT / {pageLabels[page]}</p><h1>{page === "intelligence" ? "The work ahead." : page === "lab" ? "Know what your model knows." : page === "reports" ? "Local knowledge that stays." : "Tomorrow starts with today."}</h1><p>{page === "intelligence" ? "Review hazards, unknown coverage, and task restrictions before equipment mobilizes." : page === "lab" ? "Explore heat and ground-wetness estimates. Test local calibration without changing operational decisions." : page === "reports" ? "Pin what the crew sees, document affected tasks, and preserve the report for the next shift." : "Next-day conditions, task restrictions, and unresolved reports, prepared at 6 PM site-local time."}</p></div>
            <span className="workspace-connection">{offline ? "Cached workspace" : snapshot.clockMode === "demo" ? "Historical demo" : "Connected"}<span>{date}</span></span>
          </div>}
          {error && (
            <div className="error-banner" role="alert">
              <TriangleAlert aria-hidden="true" size={16} />
              {error}
              <button className="text-button" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {offline && (
            <div className="offline-banner">
              <WifiOff aria-hidden="true" size={16} />
              Showing the last saved workspace. Browser inference and training
              remain available with cached assets. Reconnect to share reports.
            </div>
          )}
          {page !== "home" && <div className="site-context">
            <div className="site-selector">
              <MapPin aria-hidden="true" size={18} />
              <div>
                <span>ACTIVE SITE</span>
                <select
                  aria-label="Active site"
                  name="active-site"
                  autoComplete="off"
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
              <ChevronDown aria-hidden="true" size={14} />
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
              {!forecast ? (decision.channels.some(c => c.source.startsWith("NOAA/NWS")) ? "NOAA forecast screening · partial coverage" : "NOAA forecast loading or unavailable") : forecast.mode === "historical"
                ? "Historical forecast replay"
                : "Live forecast"}
            </span>
          </div>}
          {demoOpen && (
            <section className="demo-panel" aria-label="Demonstration controls">
              <div>
                <Radio aria-hidden="true" size={16} />
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
                <button className="icon-button" aria-label="Close demo controls" onClick={() => {
                  setDemoOpen(false);
                  document.querySelector<HTMLButtonElement>(".demo-control")?.focus();
                }}><X size={17} aria-hidden="true" /></button>
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
                  <Zap aria-hidden="true" size={14} />
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
                  onClick={() => {
                    if (!window.confirm("Reset demonstration reports, alerts, and briefings? Crew teams will be kept.")) return;
                    void action(
                      "/demo/reset",
                      {},
                      "Demo reset. Demonstration reports, alerts, and briefings cleared.",
                    );
                  }}
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
          {(page === "atlas" || page === "intelligence") && (
            <>
              {page === "atlas" && <section className="atlas-workspace" aria-label="Fullscreen 3D atlas">
                <SiteMap standalone sites={snapshot.sites} decisions={snapshot.decisions} selected={site.id} onSelect={setSelected} reports={snapshot.reports} />
              </section>}
              {page === "intelligence" && <>
              <div className="network-summary">
                <div className="metric-grid">
                  <div className="metric">
                    <span>
                      <MapPin aria-hidden="true" size={14} />
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
                      <TriangleAlert aria-hidden="true" size={14} />
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
                      <Thermometer aria-hidden="true" size={14} />
                      Site peak heat index
                    </span>
                    <strong>
                      {peak === null ? "—" : Math.round(peak)}
                      <small>°F</small>
                    </strong>
                    <p>{officialHeat ? "NOAA forecast · next 24 hours" : "HeatCast upper forecast estimate"}</p>
                  </div>
                  <div className="metric">
                    <span>
                      <ClipboardList aria-hidden="true" size={14} />
                      Crew reports to carry
                    </span>
                    <strong>
                      {openReports.length}
                      <small>open</small>
                    </strong>
                    <p>Unresolved knowledge for the next shift</p>
                  </div>
                </div>
                <section className="panel priorities-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">WHERE TO FOCUS</span>
                      <h2 className="workspace-section-title">Site priorities</h2>
                    </div>
                    <ArrowDown aria-hidden="true" size={17} />
                  </div>
                  <label className="search">
                    <Search aria-hidden="true" size={15} />
                    <input
                      type="search"
                      aria-label="Search sites"
                      placeholder="Find a site or county…"
                      name="site-search"
                      autoComplete="off"
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
                    {filtered.length} of {snapshot.sites.length} sites
                    <span>EIA-860M · Aug 2026</span>
                  </div>
                </section>
              </div>
              <div className="detail-grid">
                <section className="panel forecast-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">PLAN BEFORE THE SHIFT</span>
                      <h2 className="workspace-section-title">Tomorrow’s heat window</h2>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => navigate("lab")}
                    >
                      Inspect in Model Lab
                      <ArrowUpRight aria-hidden="true" size={14} />
                    </button>
                  </div>
                  <ForecastChart hours={weather} timezone={site.timezone} />
                  {bundle.soilThresholds[site.id] && <WorkWindows
                    hours={weather}
                    timezone={site.timezone}
                    soilThreshold={bundle.soilThresholds[site.id][1]}
                  />}
                  <div className="forecast-footer">
                    <span>
                      <Clock3 aria-hidden="true" size={14} />
                      {weather[0] &&
                        new Date(weather[0].time).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        })}{" "}
                      · {forecast?.mode ?? "unavailable"} · {site.timezone}
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
                      <RefreshCw aria-hidden="true" size={13} className={busy ? "spin" : ""} />
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
                      <h2 className="workspace-section-title">What can the crew do?</h2>
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
                      <Zap aria-hidden="true" size={17} />
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
                    <h2 className="workspace-section-title">Seven hazards. Clear evidence.</h2>
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
                  <Sparkles aria-hidden="true" size={23} />
                </span>
                <div>
                  <span className="eyebrow">
                    KNOWLEDGE THAT OUTLASTS A SHIFT
                  </span>
                  <h2 className="workspace-section-title">A crew’s report becomes the next crew’s context.</h2>
                  <p>
                    Report it now. Change the work decision. Carry it into the 6
                    PM briefing.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => navigate("reports")}
                >
                  Open site memory
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
              </div>
              </>}
            </>
          )}
          {page === "lab" && (site.catalogOnly || !forecast ? (
            <section className="panel empty-state">
              <h2>No historical model coverage at this plant</h2>
              <p>The original 50 plants retain their historical training and evaluation data. Use the weather atlas for current conditions and forecasts at this location.</p>
            </section>
          ) : (
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
          ))}
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
                  <Clock3 aria-hidden="true" size={15} />
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
                          <h2 className="workspace-section-title">
                            {site.name} · {b.localDate}
                          </h2>
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
                          <Download aria-hidden="true" size={14} />
                          Download briefing
                        </button>
                      </div>
                    </section>
                  ))
              ) : (
                <section className="panel empty-state">
                  <ClipboardList aria-hidden="true" size={32} />
                  <h2 className="workspace-section-title">The next briefing runs at 6 PM</h2>
                  <p>
                    Use the demo clock to execute the real scheduler and see the
                    handoff.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => setDemoOpen(true)}
                  >
                    Open demo controls
                    <Clock3 aria-hidden="true" size={15} />
                  </button>
                </section>
              )}
            </>
          )}
          {page !== "home" && page !== "atlas" && <footer className="page-footer">
            <span>
              PlanIT Control<span>FIELD INTELLIGENCE</span>
            </span>
            <p>
              Historical replay and live sources are labeled. Prototype policies
              support supervisor review.
            </p>
            <a href="/data/provenance.json" target="_blank" rel="noreferrer">
              Sources & provenance
              <ArrowUpRight aria-hidden="true" size={12} />
            </a>
          </footer>}
        </main>
      </div>
      {reportOpen && (
        <ReportForm
          site={site}
          snapshot={snapshot}
          onClose={() => setReportOpen(false)}
          onSaved={(siteId) => {
            setSelected(siteId);
            void reload();
            setNotice(
              "Report shared. Selected tasks are on hold until reviewed.",
            );
          }}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          <ShieldCheck aria-hidden="true" size={17} />
          {notice}
        </div>
      )}
    </div>
  );
}
