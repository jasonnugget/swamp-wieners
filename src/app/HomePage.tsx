import { useRef, useState, type MouseEvent } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Pause, Play } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import FieldSculpture from "../components/FieldSculpture";
import { pageHref, type Page } from "./navigation";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const features = [
  { title: "Read the landscape.", label: "Explore the 3D atlas", page: "atlas" as Page, image: "/images/wind-landscape.jpg", text: "Explore real power plant locations, inspect weather for the next 72 hours, and switch to site risk to see where supervisors should focus." },
  { title: "Keep the context.", label: "Open crew reports", page: "reports" as Page, image: "/images/forest-canopy.jpg", text: "A flooded access road. A wildlife sighting. Pin a photo report to the plant, hold the affected tasks, and leave a record for the next crew." },
  { title: "Question the forecast.", label: "Enter the Model Lab", page: "lab" as Page, image: "/images/wind-landscape.jpg", text: "Inspect HeatCast and GroundCast estimates for heat and ground wetness. Compare uncertainty and test local calibration without changing operational models." },
];
const statement = "The forecast shows the heat. The crew knows the access road. A better work decision needs both.";

export default function HomePage({ onNavigate }: {
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, page: Page) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      if (!paused) gsap.to(".signal-marquee-track", { xPercent: -50, duration: 30, ease: "none", repeat: -1 });
      gsap.fromTo(".reveal-word", { opacity: .18 }, {
        opacity: 1,
        stagger: .08,
        ease: "none",
        scrollTrigger: { trigger: ".home-statement", start: "top 80%", end: "bottom 45%", scrub: .7 },
      });
    });
    media.add("(min-width: 960px) and (prefers-reduced-motion: no-preference)", () => {
      ScrollTrigger.create({ trigger: ".story-layout", start: "top 120px", end: "bottom 70%", pin: ".story-heading", pinSpacing: false });
    });
    return () => media.revert();
  }, { scope: root, dependencies: [paused], revertOnUpdate: true });

  function link(event: MouseEvent<HTMLAnchorElement>, page: Page) { onNavigate(event, page); }
  return (
    <div ref={root} className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="hero-intro">Field safety for utility crews.</p>
          <h1 id="home-title" className="max-w-6xl">The field.<br /><span>In perspective.</span></h1>
          <p className="hero-description">Plan before the crew mobilizes.<br />Bring weather, ground conditions, and crew reports into one work decision.</p>
          <div className="hero-actions">
            <a className="editorial-link" href={pageHref("atlas")} onClick={e => link(e, "atlas")}>Explore the atlas <ArrowUpRight aria-hidden="true" size={21} /></a>
            <a className="quiet-link" href="#perspective">Discover PlanIT <ArrowDown aria-hidden="true" size={16} /></a>
          </div>
        </div>
        <div className="hero-art">
          <FieldSculpture paused={paused} />
          <div className="art-caption"><span>An ever-changing field.</span><span>Generative study / PlanIT</span></div>
        </div>
        <div className="hero-baseline"><span>For the crews building what comes next.</span><a href="#perspective">Scroll to explore <ArrowDown size={13} aria-hidden="true" /></a><button onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? "Resume ambient motion" : "Pause ambient motion"}>{paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}<span>{paused ? "Resume motion" : "Pause motion"}</span></button></div>
      </section>

      <section className="home-perspective" id="perspective" aria-labelledby="perspective-title">
        <p className="section-caption">Before the first truck rolls.</p>
        <div className="perspective-heading"><h2 id="perspective-title">Nothing happens<br />in <span className="inline-landscape"><img src="/images/wind-landscape.jpg" width="180" height="100" alt="" loading="lazy" /></span> isolation.</h2><p>At 6:45 AM, the crew needs more than a forecast. Heat, a waterlogged access road, or a gator sighting in a text message can all change the work ahead.</p></div>
        <div className="feature-accordion grid-flow-dense">
          {features.map((feature, i) => (
            <article key={feature.page} className="feature-panel" data-open={active === i} onPointerEnter={e => { if (e.pointerType === "mouse") setActive(i); }}>
              <img src={feature.image} width="1400" height="900" loading="lazy" alt="" />
              <button className="feature-trigger" aria-expanded={active === i} aria-controls={`feature-${feature.page}`} onClick={() => setActive(i)} onFocus={() => setActive(i)}><span>{feature.title}</span><ArrowUpRight size={24} aria-hidden="true" /></button>
              <div className="feature-detail" id={`feature-${feature.page}`} hidden={active !== i}><p>{feature.text}</p><a href={pageHref(feature.page)} onClick={e => link(e, feature.page)}>{feature.label}<ArrowRight size={17} aria-hidden="true" /></a></div>
            </article>
          ))}
        </div>
        <p className="photography-note">Illustrative landscape photography. Operational evidence is labeled inside the workspace.</p>
      </section>

      <section className="home-statement" aria-label={statement}>
        <p aria-hidden="true">{statement.split(" ").map((word, i) => <span className="reveal-word" key={`${word}-${i}`}>{word}{" "}</span>)}</p>
      </section>

      <section className="home-story" aria-labelledby="story-title">
        <div className="story-layout">
          <div className="story-heading"><p className="section-caption">From morning mobilization to the next handoff.</p><h2 id="story-title">Stay curious.<br />Stay prepared.</h2><a className="quiet-link" href={pageHref("intelligence")} onClick={e => link(e, "intelligence")}>See site intelligence <ArrowUpRight size={19} aria-hidden="true" /></a></div>
          <div className="story-chapters">
            <article><span className="chapter-word">Observe</span><h3>Know what changes the work.</h3><p>Review weather, heat, lightning, flooding, fire weather, ground wetness, and wildlife reports. Every channel shows its evidence; missing or stale coverage stays unknown.</p><div className="chapter-graphic observation-graphic" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ transform: `scaleY(${.18 + Math.sin(i * .55) ** 2 * .82})` }} />)}</div><p className="graphic-disclosure">Illustrative signal pattern.</p></article>
            <article><span className="chapter-word">Understand</span><h3>Turn a signal into a work decision.</h3><p>In lightning replay, each strike within 10 miles restarts the 30-minute hold on outdoor work. Review the hazard index and task restrictions together; independent holds stay in force.</p><div className="chapter-graphic uncertainty-graphic" aria-hidden="true"><i /><i /><i /><i /><span>Evidence before confidence.</span></div></article>
            <article><span className="chapter-word">Carry forward</span><h3>Leave the next crew a record.</h3><p>At 6 PM local time, PlanIT creates the next day’s safety briefing. Unresolved reports and work restrictions carry forward with source and coverage details.</p><a className="editorial-link" href={pageHref("briefings")} onClick={e => link(e, "briefings")}>View safety briefings <ArrowUpRight size={20} aria-hidden="true" /></a></article>
          </div>
        </div>
      </section>

      <div className="signal-marquee" aria-hidden="true"><div className="signal-marquee-track">{[0, 1].map(i => <span key={i}>Weather / Ground / People / Perspective /&nbsp;</span>)}</div></div>

      <section className="home-action" aria-labelledby="action-title"><p className="section-caption">Before the next crew heads out.</p><a href={pageHref("atlas")} onClick={e => link(e, "atlas")}><h2 id="action-title">See what’s<br />out there.</h2><ArrowUpRight aria-hidden="true" /></a><div className="action-bottom"><p>Find the site. Review the restrictions.<br />Carry local knowledge into the next shift.</p><a className="editorial-link" href={pageHref("reports")} onClick={e => link(e, "reports")}>Bring your field knowledge <ArrowRight size={20} aria-hidden="true" /></a></div></section>
      <footer className="home-footer"><a href={pageHref("home")} onClick={e => link(e, "home")} className="footer-wordmark">PlanIT<span>Utility field safety.</span></a><div><a href={pageHref("atlas")} onClick={e => link(e, "atlas")}>3D Atlas</a><a href={pageHref("lab")} onClick={e => link(e, "lab")}>Model Lab</a><a href="/data/provenance.json" target="_blank" rel="noreferrer">Sources & provenance <ArrowUpRight aria-hidden="true" size={13} /></a></div><p>PlanIT Control · Sperry Tech<br />SwampHacks field-safety prototype.</p></footer>
    </div>
  );
}
