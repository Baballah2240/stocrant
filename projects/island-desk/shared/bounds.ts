import type { StickyBounds } from "./model.js";

/** Keep the title bar and resize edges reachable after a monitor or work area changes. */
export function fitSticky(bounds: StickyBounds, area: StickyBounds): StickyBounds {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))),
    width, height,
  };
}
