'use client';
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function AtlasEntrance({ root, enabled }: { root: RefObject<HTMLDivElement | null>; enabled: boolean }) {
  useGSAP(() => {
    if (!enabled) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(".atlas-finder, .atlas-layer-bar, .atlas-timeline", { opacity: 0, y: 16, scale: 0.985, duration: 1, stagger: 0.09, ease: "power3.out", clearProps: "transform,opacity" });
    });
    return () => media.revert();
  }, { scope: root, dependencies: [enabled], revertOnUpdate: true });
  return null;
}

export function EvidenceMotion({ root, view }: { root: RefObject<HTMLElement | null>; view: string }) {
  useGSAP(() => {
    if (!root.current) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const content = root.current!.querySelector(".atlas-detail-content:not([hidden])");
      if (content) gsap.from(content, { opacity: 0, y: 10, duration: 0.5, ease: "power3.out", clearProps: "transform,opacity" });
      if (view === "overview") root.current!.querySelectorAll(".atlas-channel-evidence").forEach(evidence => {
        gsap.from(evidence, { opacity: 0.4, y: 5, ease: "none", scrollTrigger: { trigger: evidence, scroller: root.current, start: "top 98%", end: "top 80%", scrub: 0.5 } });
      });
      const refresh = () => ScrollTrigger.refresh();
      const element = root.current!;
      element.addEventListener("toggle", refresh, true);
      return () => element.removeEventListener("toggle", refresh, true);
    });
    return () => media.revert();
  }, { scope: root, dependencies: [view], revertOnUpdate: true });
  return null;
}
