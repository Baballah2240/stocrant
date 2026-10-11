import { useEffect, type RefObject } from "react";

export function useWebsiteMotion(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const site = ref.current;
    if (!site) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    let frame = 0;
    const elements = site.querySelectorAll<HTMLElement>("main section, .public-feature-grid article, .public-how li");
    const configure = () => {
      observer?.disconnect();
      elements.forEach(element => element.classList.remove("reveal-ready", "is-visible"));
      if (reduced.matches || !window.IntersectionObserver) return;
      observer = new IntersectionObserver(entries => entries.forEach(entry => entry.target.classList.toggle("is-visible", entry.isIntersecting)), { threshold: 0.04, rootMargin: "0px 0px -24px 0px" });
      elements.forEach((element, index) => {
        element.classList.add("reveal-ready");
        element.style.setProperty("--reveal-delay", `${element.tagName === "SECTION" ? 0 : index % 3 * 65}ms`);
        observer!.observe(element);
      });
    };
    const paint = () => {
      frame = 0;
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      site.style.setProperty("--scroll-progress", String(distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
    configure(); paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    reduced.addEventListener("change", configure);
    return () => { observer?.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); reduced.removeEventListener("change", configure); elements.forEach(element => element.classList.remove("reveal-ready", "is-visible")); };
  }, [ref]);
}
