import { useMemo, useEffect, useState, type MouseEvent } from "react";
import {
  MapPinSimple as AtlasPin,
  ArrowUpRight,
  ArrowUpRight as AtlasArrow,
  Broadcast as AtlasBroadcast,
  ClipboardText as ClipboardList,
  Clock as Clock3,
  DownloadSimple as Download,
  X,
  Broadcast as Radio,
  ShieldCheck,
  Warning as TriangleAlert,
  WifiSlash as WifiOff,
  Lightning as Zap,
} from "@phosphor-icons/react";
import type { ModelBundle, Snapshot } from "../../shared/types";
import { cacheAssets, loadSnapshot, readCachedSnapshot, request } from "../lib/api";
import { coalescedRefresh } from "../lib/coalesced-refresh";
import SiteMap from "../components/SiteMap";
import LoadingScreen from "./LoadingScreen";
import HomePage from "./HomePage";
import { pageHref, pageLabels, readPage, type Page } from "./navigation";
import Reports, { ReportForm } from "../features/reports/Reports";
import AccentPicker from "../components/AccentPicker";
import NotificationBar from "../components/NotificationBar";
import FleetBriefings, { FleetGenerateButton } from "../features/briefings/FleetBriefings";
import SiteBriefingList from "../features/briefings/SiteBriefingList";
import NotificationTray from "../components/NotificationTray";
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
    document.title = `${pageLabels[page]} | Threshold Control`;
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
  const reload = useMemo(() => coalescedRefresh(async () => {
    try {
      const result = await loadSnapshot();
      setSnapshot(result.snapshot);
      setOffline(result.offline);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }), []);
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
  const openReports = snapshot.reports.filter((r) => r.status === "open");
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
        <a className="site-wordmark" href={pageHref("home")} onClick={e => navigateLink(e, "home")} aria-label="Threshold home">Threshold<span className="wordmark-cross" aria-hidden="true"><AtlasPin size={18} weight="light"/></span></a>
        <nav id="site-navigation" className={menuOpen ? "site-navigation is-open" : "site-navigation"} aria-label="Workspace navigation">
          {(Object.keys(pageLabels) as Page[]).map(item => <a key={item} href={pageHref(item)} onClick={e => navigateLink(e, item)} aria-current={page === item ? "page" : undefined}>{pageLabels[item]}{item === "reports" && openReports.length > 0 && <span className="report-count">{openReports.length}</span>}</a>)}
        </nav>
        <div className="site-header-actions">
          <button className="header-report" onClick={() => setReportOpen(true)}>Report hazard<i><AtlasArrow size={17} weight="light" aria-hidden="true"/></i></button>
          <NotificationTray history={snapshot.alertHistory} active={snapshot.urgentAlerts} now={snapshot.now} onView={siteId => { setSelected(siteId); navigate("atlas"); }} />
          <AccentPicker />
          <button className="demo-control" aria-label="Demo controls" aria-expanded={demoOpen} onClick={() => setDemoOpen(!demoOpen)}><AtlasBroadcast size={19} weight="light" aria-hidden="true"/></button>
          <button className="menu-control" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen(!menuOpen)}><span className="atlas-menu-lines" data-open={menuOpen} aria-hidden="true"><i/><i/></span></button>
        </div>
      </header>
      <NotificationBar alerts={snapshot.urgentAlerts} now={snapshot.now} onView={siteId => { setSelected(siteId); navigate("atlas"); }} />
      <div className="main-shell">
        <main id="workspace-content" className="overflow-x-hidden w-full max-w-full" tabIndex={-1}>
          {page === "home" && <HomePage onNavigate={navigateLink} snapshot={snapshot} cached={offline} selectedSite={site} onSelectSite={setSelected} bundle={bundle} forecast={forecast} />}
          {page !== "home" && page !== "atlas" && <div className="page-heading">
            <div><p className="section-caption">Threshold / {pageLabels[page]}</p><h1>{page === "reports" ? "Local knowledge that stays." : "Tomorrow starts with today."}</h1><p>{page === "reports" ? "Pin what the crew sees, document affected tasks, and preserve the report for the next shift." : "Next-day conditions, task restrictions, and unresolved reports, prepared at 6 PM site-local time."}</p></div>
            <span className="workspace-connection">{offline ? "Cached workspace" : snapshot.clockMode === "demo" ? "Historical demo" : "Connected"}<span>{date}</span></span>
          </div>}
          {error && (
            <div className="error-banner" role="alert">
              <TriangleAlert weight="light" aria-hidden="true" size={16} />
              {error}
              <button className="text-button" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {offline && (
            <div className="offline-banner" role="status">
              <WifiOff weight="light" aria-hidden="true" size={16} />
              {page === "atlas" ? "Offline · saved evidence. Verify conditions before work." : "Showing the last saved workspace. Reconnect to share reports."}
            </div>
          )}
          {/* The atlas picks sites from its own ranked list, so it has no site dropdown. */}
          {demoOpen && (
            <section className="demo-panel" aria-label="Demonstration controls">
              <div>
                <Radio weight="light" aria-hidden="true" size={16} />
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
                }}><X weight="light" size={17} aria-hidden="true" /></button>
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
                  <Zap weight="light" aria-hidden="true" size={14} />
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
          {page === "atlas" && <section className="atlas-workspace" aria-label="Fullscreen 3D atlas">
            <SiteMap standalone sites={snapshot.sites} decisions={snapshot.decisions} risks={snapshot.siteRisks} selected={site.id} onSelect={setSelected} reports={snapshot.reports} />
          </section>}
          {page === "reports" && (
            <Reports
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
                <div className="section-title-actions">
                  <span className="backend">
                    <Clock3 weight="light" aria-hidden="true" size={15} />
                    6:00 PM local
                  </span>
                  <FleetGenerateButton snapshot={snapshot} onChange={() => void reload()} onError={setError} />
                </div>
              </div>
              <FleetBriefings snapshot={snapshot} onSelectSite={setSelected} />
              {snapshot.briefings.length ? (
                <SiteBriefingList briefings={snapshot.briefings} sites={snapshot.sites} badge={(value) => <Badge value={value} />} />
              ) : !snapshot.fleetBriefings?.length && (
                <section className="panel empty-state">
                  <ClipboardList weight="light" aria-hidden="true" size={32} />
                  <h2 className="workspace-section-title">No briefings yet</h2>
                  <p>
                    Sites brief automatically at 6 PM local time. Press Generate
                    now to brief every site for tomorrow right away.
                  </p>
                </section>
              )}
            </>
          )}
          {page !== "home" && page !== "atlas" && <footer className="page-footer">
            <span>
              Threshold Control<span>FIELD INTELLIGENCE</span>
            </span>
            <p>
              Historical replay and live sources are labeled. Prototype policies
              support supervisor review.
            </p>
            <a href="/data/provenance.json" target="_blank" rel="noreferrer">
              Sources & provenance
              <ArrowUpRight weight="light" aria-hidden="true" size={12} />
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
          <ShieldCheck weight="light" aria-hidden="true" size={17} />
          {notice}
        </div>
      )}
    </div>
  );
}
