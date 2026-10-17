'use client';
import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

/** Original field-kit illustration. Not terrain, provider data or a crew photo. */
export default function FieldSculpture({ paused }: { paused: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      if (paused || !root.current) return;
      const loops = [
        gsap.to(".kit-camera", { y: -9, rotation: 2, duration: 3.8, repeat: -1, yoyo: true, ease: "sine.inOut", transformOrigin: "50% 50%" }),
        gsap.to(".kit-notebook", { y: 8, rotation: -2, duration: 4.5, repeat: -1, yoyo: true, ease: "sine.inOut", transformOrigin: "50% 50%" }),
        gsap.to(".kit-spark", { scale: .85, rotation: 12, duration: 2.8, repeat: -1, yoyo: true, ease: "sine.inOut", transformOrigin: "50% 50%" }),
      ];
      let visible = true;
      const sync = () => loops.forEach(tween => visible && !document.hidden ? tween.play() : tween.pause());
      const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); });
      observer.observe(root.current); document.addEventListener("visibilitychange", sync); sync();
      return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); loops.forEach(tween => tween.kill()); };
    });
    return () => media.revert();
  }, { scope: root, dependencies: [paused], revertOnUpdate: true });
  return <div className="field-sculpture field-kit" ref={root} aria-hidden="true">
    <svg viewBox="0 0 620 570" fill="none">
      <path d="M58 385c-55-35-48-86-15-78s40 75-10 89c-34 9-36 47-12 63 22 14 57-3 58-31M504 72l6-22m18 37 22-7m-27 29 17 12" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
      <g className="kit-notebook"><g transform="rotate(12 390 295)">
        <rect x="258" y="158" width="239" height="307" rx="16" fill="#202820"/>
        <rect x="250" y="148" width="239" height="307" rx="16" fill="#fafbf7" stroke="currentColor" strokeWidth="4"/>
        <path d="M281 153v297m-40-260h21m-21 35h21m-21 35h21m-21 35h21m-21 35h21m-21 35h21m-21 35h21" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
        <path d="m312 245 37-24 42 24 66-36v171l-58 31-51-26-36 27Z" fill="#e5ecd9" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
        <path d="M349 225v159m42-136 7 159m-69-50 32-60 35 29 44-59" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6 9"/>
        <path d="M434 279c0 20-25 37-25 37s-25-17-25-37a25 25 0 0 1 50 0Z" fill="#c3d99c" stroke="currentColor" strokeWidth="3"/><circle cx="409" cy="279" r="8" fill="#202820"/>
        <path d="M317 183h86m-86 13h52" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      </g></g>
      <g className="kit-camera"><g transform="rotate(-12 245 280)">
        <path d="m143 198 18-43h100l27 43" fill="#fafbf7" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/>
        <rect x="96" y="206" width="302" height="204" rx="39" fill="#202820"/>
        <rect x="84" y="192" width="302" height="204" rx="39" fill="#c3d99c" stroke="currentColor" strokeWidth="4"/>
        <path d="M85 251h300" stroke="currentColor" strokeWidth="4"/>
        <circle cx="238" cy="299" r="72" fill="#fafbf7" stroke="currentColor" strokeWidth="5"/>
        <circle cx="238" cy="299" r="47" fill="#202820"/>
        <path d="m219 283 27-11" stroke="#fafbf7" strokeWidth="10" strokeLinecap="round"/>
        <rect x="312" y="212" width="40" height="17" rx="6" fill="#202820"/><circle cx="124" cy="219" r="9" fill="#202820"/>
      </g></g>
      <path className="kit-spark" d="m463 96 10 29 30 4-23 20 5 30-27-16-27 14 7-30-21-22 30-2Z" fill="#fafbf7" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/>
      <path d="M144 108c-2-18 3-39 19-54m-48 48-9-21m69 37 20-11" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
    </svg>
  </div>;
}
