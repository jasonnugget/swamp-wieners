import { useRef, useState, type MouseEvent } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Pause, Play, MapTrifold, Camera, Fingerprint, GitBranch, ShieldCheck } from "@phosphor-icons/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { Forecast, ModelBundle, Snapshot, Site } from "../../shared/types";
import { HazardProfile, WorkReadiness } from "../components/FieldSignals";
import WeatherOutlook from "../components/WeatherOutlook";
import CrewNotes from "../components/CrewNotes";
import NetworkPreview from "../components/NetworkPreview";
import ForecastReplay from "../components/ForecastReplay";
import { pageHref, type Page } from "./navigation";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const features = [
  { title: "Read the landscape.", label: "Explore the 3D atlas", page: "atlas" as Page, icon: MapTrifold, image: "/images/wind-landscape.jpg", text: "Start with the map. Inspect environmental evidence, compare the next 72 hours, and find the sites that need a closer look." },
  { title: "Keep the context.", label: "Open crew reports", page: "reports" as Page, icon: Camera, image: "/images/forest-canopy.jpg", text: "A flooded access road. A wildlife sighting. Put a photo and a pin where the next crew can find them, with holds on the affected work." },
];
const statement = "The forecast shows the heat. The crew knows the access road. A better work decision needs both.";

export default function HomePage({ onNavigate, snapshot, cached, selectedSite, onSelectSite, bundle, forecast }: {
  snapshot: Snapshot;
  bundle: ModelBundle;
  forecast?: Forecast;
  cached: boolean;
  selectedSite: Site;
  onSelectSite: (id: string) => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, page: Page) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      if (paused) return;
      gsap.from(".hero-copy > *, .hero-network", { y: 25, opacity: 0, duration: 1, stagger: .09, ease: "power3.out", clearProps: "transform,opacity" });
      gsap.utils.toArray<HTMLElement>(".story-chapters > article").forEach(article => gsap.from(article, { y: 36, opacity: .35, duration: .9, ease: "power3.out", scrollTrigger: { trigger: article, start: "top 92%" } }));
      gsap.fromTo(".reveal-word", { opacity: .18 }, {
        opacity: 1,
        stagger: .08,
        ease: "none",
        scrollTrigger: { trigger: ".home-statement", start: "top 80%", end: "bottom 45%", scrub: .7 },
      });
    });
    return () => media.revert();
  }, { scope: root, dependencies: [paused], revertOnUpdate: true });

  function link(event: MouseEvent<HTMLAnchorElement>, page: Page) { onNavigate(event, page); }
  return (
    <div ref={root} className="home-page fieldwork-home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="hero-intro">Field intelligence. Shared perspective.</p>
          <h1 id="home-title" className="max-w-6xl">See the risk.<br /><span>Plan the work.</span></h1>
          <p className="hero-description">The weather changes. The work depends on it.<br className="desktop-break" /> Bring environmental signals and crew knowledge into view before the first truck rolls.</p>
          <div className="hero-actions">
            <a className="editorial-link" href={pageHref("atlas")} onClick={e => link(e, "atlas")}>Explore the atlas <i><ArrowUpRight aria-hidden="true" size={21} /></i></a>
            <a className="quiet-link" href="#perspective">How it works <ArrowDown aria-hidden="true" size={16} /></a>
          </div>
          <p className="hero-footnote">Built for the people keeping the power on.</p>
        </div>
        <div className="hero-network">
          <NetworkPreview sites={snapshot.sites} risks={snapshot.siteRisks} selectedSite={selectedSite} cached={cached} onSelectSite={onSelectSite} />
        </div>
        <div className="hero-baseline"><span>A wider view. A more informed shift.</span><button onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? "Resume ambient motion" : "Pause ambient motion"}>{paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}<span>{paused ? "Resume motion" : "Pause motion"}</span></button></div>
      </section>

      <section className="home-perspective" id="perspective" aria-labelledby="perspective-title">
        <p className="section-caption">From the map to the morning briefing.</p>
        <div className="perspective-heading"><h2 id="perspective-title">The big picture.<br />The <span className="inline-landscape"><img src="/images/forest-canopy.jpg" width="160" height="80" alt="" loading="lazy" /></span> local detail.</h2><p>A forecast can tell you about the heat. It can’t tell you the access road is underwater. Give both kinds of knowledge a place in the plan.</p></div>
        <div className="feature-accordion grid-flow-dense">
          {features.map((feature, i) => (
            <article key={feature.page} className="feature-panel" data-open={active === i} onPointerEnter={e => { if (e.pointerType === "mouse") setActive(i); }}>
              <img src={feature.image} width="1400" height="933" loading="lazy" alt="" />
              <div className="feature-symbol" aria-hidden="true"><feature.icon size={25} /></div>
              <button className="feature-trigger" aria-expanded={active === i} aria-controls={`feature-${feature.page}`} onClick={() => setActive(i)} onFocus={() => setActive(i)}><span>{feature.title}</span><ArrowUpRight size={24} aria-hidden="true" /></button>
              <div className="feature-detail" id={`feature-${feature.page}`} hidden={active !== i}><p>{feature.text}</p><a href={pageHref(feature.page)} onClick={e => link(e, feature.page)}>{feature.label}<ArrowRight size={17} aria-hidden="true" /></a></div>
            </article>
          ))}
        </div>
        <p className="photography-note">Landscape photography is illustrative. Open a tool for source-labeled evidence.</p>
      </section>

      <section className="home-statement" aria-label={statement}>
        <div className="statement-heading"><GitBranch size={30} aria-hidden="true" /><span>Different signals. A shared understanding.</span></div>
        <p aria-hidden="true">{statement.split(" ").map((word, i) => <span className="reveal-word" key={`${word}-${i}`}>{word}{" "}</span>)}</p>
        <div className="evidence-principles"><div><Fingerprint size={21} aria-hidden="true"/><h3>Know where it came from.</h3><p>Current conditions, historical models, replay events and crew reports stay distinguishable.</p></div><div><ShieldCheck size={21} aria-hidden="true"/><h3>Keep the hold in view.</h3><p>A lower prediction never clears an independent hold. Missing evidence stays unknown.</p></div></div>
      </section>

      <section className="home-story" aria-labelledby="story-title">
        <div className="story-layout">
          <div className="story-heading"><p className="section-caption">A working view of the network.</p><h2 id="story-title">Conditions change.<br /><span>Stay a step closer.</span></h2><p className="story-intro">Look across the network, follow the forecast, then review the work. These views use the same evidence as your workspace.</p><a className="editorial-link" href={pageHref("atlas")} onClick={e => link(e, "atlas")}>Follow the forecast <i><ArrowUpRight size={19} aria-hidden="true" /></i></a><p className="story-data-context">{cached ? "Cached workspace. Reconnect for current evidence." : "Connected workspace · current site risk."}<br/>Automatic environmental screening.</p></div>
          <div className="story-chapters">
            <article><span className="chapter-word">Observe</span><h3>Seven signals.<br/>One wider view.</h3><p>Compare the environmental channels across our plants. A low score only tells part of the story: check how many sites have usable evidence.</p><HazardProfile sites={snapshot.sites} risks={snapshot.siteRisks} paused={paused}/></article>
            <article><span className="chapter-word">Look ahead</span><h3>Find the hottest hour.<br/>See the wind change.</h3><p>A moving view of the next 24 hours. The warmest available plant is spotlighted automatically. Scrub the curve to inspect the heat and wind before planning the shift.</p><WeatherOutlook sites={snapshot.sites} screenings={snapshot.weatherScreenings ?? {}} paused={paused} cached={cached}/></article>
            <article><span className="chapter-word">Look back</span><h3>What did the forecast<br/>get right?</h3><p>Replay a past forecast for {selectedSite.name}. Reveal what actually happened, then nudge the inputs to see how sensitive the model is.</p>{forecast && !selectedSite.catalogOnly ? <ForecastReplay site={selectedSite} bundle={bundle} forecast={forecast} className="home-replay" heading={false}/> : <p className="replay-empty">No forecast replay for this site yet. Pick another plant above.</p>}</article>
            <article><span className="chapter-word">Get ready</span><h3>One tile.<br/>One crew’s move.</h3><p>Compare installation, mobilization and preparation across the network. Each plant shows its work decision, restrictions and unknowns.</p><WorkReadiness sites={snapshot.sites} risks={snapshot.siteRisks} paused={paused}/><a className="editorial-link" href={pageHref("atlas")} onClick={e => link(e, "atlas")}>Inspect site risk <i><ArrowUpRight size={19} aria-hidden="true" /></i></a></article>
          </div>
        </div>
      </section>

      <CrewNotes site={selectedSite} reports={snapshot.reports.filter(report => report.siteId === selectedSite.id)} onNavigate={onNavigate}/>

      <section className="home-action" aria-labelledby="action-title"><p className="section-caption">For the next shift. And the one after.</p><a href={pageHref("atlas")} onClick={e => link(e, "atlas")}><h2 id="action-title">Good work starts<br />with a clearer view.</h2><span className="action-arrow"><ArrowUpRight aria-hidden="true" /></span></a><div className="action-bottom"><p>Find your site. Review the evidence.<br />Bring the whole crew into the picture.</p><a className="editorial-link" href={pageHref("atlas")} onClick={e => link(e, "atlas")}>Open your workspace <i><ArrowUpRight size={20} aria-hidden="true" /></i></a></div></section>
      <footer className="home-footer"><a href={pageHref("home")} onClick={e => link(e, "home")} className="footer-wordmark">Threshold<span>A little foresight goes a long way.</span></a><div><a href={pageHref("atlas")} onClick={e => link(e, "atlas")}>3D Atlas</a><a href={pageHref("reports")} onClick={e => link(e, "reports")}>Crew reports</a><a href="/data/provenance.json" target="_blank" rel="noreferrer">Sources & provenance <ArrowUpRight aria-hidden="true" size={13} /></a></div><p>Threshold Control<br />Utility field-safety prototype.</p></footer>
    </div>
  );
}
