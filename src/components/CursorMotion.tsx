import { useEffect } from "react";

/**
 * Adds a restrained cursor-following ambient light to fine-pointer devices.
 * Touch devices and people who prefer reduced motion keep a static interface.
 */
export default function CursorMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 3;

    const paint = () => {
      frameId = 0;
      root.style.setProperty("--cursor-x", `${x}px`);
      root.style.setProperty("--cursor-y", `${y}px`);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      x = event.clientX;
      y = event.clientY;
      if (!frameId) frameId = window.requestAnimationFrame(paint);
    };

    const updateAvailability = () => {
      const enabled = finePointer.matches && !reducedMotion.matches;
      root.toggleAttribute("data-cursor-motion", enabled);
      if (enabled) {
        paint();
      } else {
        if (frameId) window.cancelAnimationFrame(frameId);
        frameId = 0;
        root.style.removeProperty("--cursor-x");
        root.style.removeProperty("--cursor-y");
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    finePointer.addEventListener("change", updateAvailability);
    reducedMotion.addEventListener("change", updateAvailability);
    updateAvailability();

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      finePointer.removeEventListener("change", updateAvailability);
      reducedMotion.removeEventListener("change", updateAvailability);
      if (frameId) window.cancelAnimationFrame(frameId);
      root.removeAttribute("data-cursor-motion");
      root.style.removeProperty("--cursor-x");
      root.style.removeProperty("--cursor-y");
    };
  }, []);

  return null;
}