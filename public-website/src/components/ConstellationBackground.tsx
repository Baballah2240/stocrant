import { useEffect, useRef } from "react";

/** Decorative canvas: bounded particle count, 30fps, no input interception. */
export default function ConstellationBackground() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext("2d");
    if (!node || !context) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, previous = 0, width = 0, height = 0, time = 0;
    let stars: { x: number; y: number; radius: number; phase: number; speed: number; vx: number; vy: number }[] = [];
    let color = "65, 115, 145";
    function draw() {
      context!.clearRect(0, 0, width, height);
      const points = stars.map(star => ({ ...star,
        px: star.x + (motion.matches ? 0 : Math.sin(time * star.speed + star.phase) * 16),
        py: star.y + (motion.matches ? 0 : Math.cos(time * star.speed * .8 + star.phase) * 12),
        pulse: motion.matches ? .5 : .5 + .5 * Math.sin(time * star.speed * 2 + star.phase),
      }));
      const reach = width < 700 ? 145 : 195;
      for (let i = 0; i < points.length; i++) {
        const a = points[i]; let links = 0;
        for (let j = i + 1; j < points.length && links < 3; j++) {
          const b = points[j], distance = Math.hypot(a.px - b.px, a.py - b.py);
          if (distance >= reach) continue;
          context!.strokeStyle = `rgba(${color},${(1 - distance / reach) * (.13 + a.pulse * .1)})`;
          context!.lineWidth = .7; context!.beginPath(); context!.moveTo(a.px, a.py); context!.lineTo(b.px, b.py); context!.stroke(); links++;
        }
        const radius = a.radius * (.75 + a.pulse * .7);
        if (i % 7 === 0) {
          const glow = context!.createRadialGradient(a.px, a.py, 0, a.px, a.py, radius * 5);
          glow.addColorStop(0, `rgba(${color},${.12 + a.pulse * .12})`); glow.addColorStop(1, `rgba(${color},0)`);
          context!.fillStyle = glow; context!.beginPath(); context!.arc(a.px, a.py, radius * 5, 0, Math.PI * 2); context!.fill();
        }
        context!.fillStyle = `rgba(${color},${.23 + a.pulse * .48})`;
        context!.beginPath(); context!.arc(a.px, a.py, radius, 0, Math.PI * 2); context!.fill();
      }
    }
    function tick(now: number) {
      if (document.hidden || motion.matches) { frame = 0; return; }
      if (now - previous >= 32) {
        const elapsed = Math.min((now - (previous || now)) / 1000, .05); previous = now; time += elapsed;
        for (const star of stars) {
          star.x += star.vx * elapsed; star.y += star.vy * elapsed;
          if (star.x < -25) star.x = width + 25; if (star.x > width + 25) star.x = -25;
          if (star.y < -25) star.y = height + 25; if (star.y > height + 25) star.y = -25;
        }
        draw();
      }
      frame = requestAnimationFrame(tick);
    }
    function start() {
      cancelAnimationFrame(frame); frame = 0; previous = 0; draw();
      if (!motion.matches && !document.hidden) frame = requestAnimationFrame(tick);
    }
    function resize() {
      width = document.documentElement.clientWidth; height = window.innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      node!.width = Math.round(width * ratio); node!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      let seed = 157;
      const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      const count = Math.max(28, Math.min(95, Math.round(width * height / 15000)));
      stars = Array.from({ length: count }, () => ({ x: random() * width, y: random() * height, radius: .7 + random() * 1.4,
        phase: random() * Math.PI * 2, speed: .25 + random() * .4, vx: (random() - .5) * 6, vy: (random() - .5) * 5 }));
      start();
    }
    function appearance() { color = document.documentElement.dataset.theme === "dark" ? "148, 202, 235" : "65, 115, 145"; draw(); }
    const observer = new MutationObserver(appearance);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    appearance(); resize();
    window.addEventListener("resize", resize, { passive: true }); document.addEventListener("visibilitychange", start); motion.addEventListener("change", start);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", start); motion.removeEventListener("change", start); };
  }, []);
  return <canvas ref={canvas} className="constellation-background" aria-hidden="true" />;
}
