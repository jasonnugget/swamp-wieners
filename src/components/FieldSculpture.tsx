import { useEffect, useRef } from "react";

/** Abstract field lines; this artwork does not represent weather or site readings. */
export default function FieldSculpture({ paused }: { paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phase = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let width = 0;
    let height = 0;
    let visible = true;
    let time = phase.current;
    let last = 0;
    let pointerX = 0;
    let pointerY = 0;

    function draw() {
      context!.clearRect(0, 0, width, height);
      const scale = Math.min(width / 4.3, height / 3.7);
      const angle = -.38 + pointerX * .13;
      const cx = width * .51;
      const cy = height * .5;
      for (let strand = 0; strand < 112; strand++) {
        const v = (strand / 111) * Math.PI * 2;
        const shade = Math.sin(v + .7);
        context!.beginPath();
        for (let step = 0; step <= 170; step++) {
          const u = (step / 170) * Math.PI * 2;
          const twist = v + u * .5 + time * .1;
          const radius = 1.14 + .24 * Math.cos(twist * 3 + time * .25);
          const tube = .38 + .1 * Math.sin(u * 3 + time * .3);
          const x = (radius + tube * Math.cos(twist)) * Math.cos(u);
          const y = (radius + tube * Math.cos(twist)) * Math.sin(u);
          const z = tube * Math.sin(twist) + .27 * Math.sin(u * 2 + time * .15);
          const rx = x * Math.cos(angle) - y * Math.sin(angle);
          const ry = x * Math.sin(angle) + y * Math.cos(angle);
          const px = cx + (rx + z * .12) * scale;
          const py = cy + (ry * .65 - z * .95 + pointerY * .08) * scale;
          if (step === 0) context!.moveTo(px, py);
          else context!.lineTo(px, py);
        }
        context!.strokeStyle = shade > -.1
          ? `rgba(185, 64, 29, ${.21 + (shade + 1) * .15})`
          : `rgba(64, 46, 34, ${.12 + (1 - shade) * .08})`;
        context!.lineWidth = strand % 7 === 0 ? .95 : .55;
        context!.stroke();
      }
    }
    function tick(now: number) {
      frame = 0;
      if (!visible || document.hidden || paused || media.matches) return;
      if (now - last > 1000 / 30) {
        time += Math.min((now - (last || now)) / 1000, .05);
        phase.current = time;
        last = now;
        draw();
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      draw();
      if (visible && !document.hidden && !paused && !media.matches) frame = requestAnimationFrame(tick);
    }
    function resize() {
      const box = canvas!.getBoundingClientRect();
      width = box.width;
      height = box.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    }
    function pointer(event: PointerEvent) {
      if (media.matches || paused) return;
      const box = canvas!.getBoundingClientRect();
      pointerX = (event.clientX - box.left) / box.width - .5;
      pointerY = (event.clientY - box.top) / box.height - .5;
    }
    const resizeObserver = new ResizeObserver(resize);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    resizeObserver.observe(canvas);
    intersection.observe(canvas);
    canvas.addEventListener("pointermove", pointer, { passive: true });
    document.addEventListener("visibilitychange", sync);
    media.addEventListener("change", sync);
    resize();
    sync();
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      canvas.removeEventListener("pointermove", pointer);
      document.removeEventListener("visibilitychange", sync);
      media.removeEventListener("change", sync);
    };
  }, [paused]);

  return <canvas ref={canvasRef} className="field-sculpture" aria-hidden="true" />;
}
