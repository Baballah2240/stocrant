import { BrowserWindow, screen } from "electron";

/**
 * Spotlight: one black, click-through, non-focusable window per monitor that fades in behind
 * whatever the user is hovering (the island or a sticky note), dimming everything else.
 */
const LEVEL = 0.5, overlays = new Map<number, BrowserWindow>();
let current = 0, target = 0, animation: ReturnType<typeof setInterval> | undefined;

function ensure() {
  const displays = screen.getAllDisplays(), ids = new Set(displays.map(d => d.id));
  for (const [id, overlay] of overlays) if (!ids.has(id)) { overlay.destroy(); overlays.delete(id); }
  for (const display of displays) {
    let overlay = overlays.get(display.id);
    if (!overlay || overlay.isDestroyed()) {
      overlay = new BrowserWindow({ ...display.bounds, frame: false, transparent: false, backgroundColor: "#000000", hasShadow: false, resizable: false, movable: false, focusable: false, skipTaskbar: true, show: false, enableLargerThanScreen: true, title: "", webPreferences: { sandbox: true, contextIsolation: true } });
      overlay.setIgnoreMouseEvents(true); overlay.setAlwaysOnTop(true, "floating"); overlay.setOpacity(0);
      overlays.set(display.id, overlay);
    } else overlay.setBounds(display.bounds);
  }
}
function apply(opacity: number) {
  current = opacity;
  for (const overlay of overlays.values()) {
    if (overlay.isDestroyed()) continue;
    if (opacity <= 0.001) { if (overlay.isVisible()) overlay.hide(); continue; }
    overlay.setOpacity(opacity); if (!overlay.isVisible()) overlay.showInactive();
  }
}
/** `raise` holds the windows that must stay above the dim layer. */
export function spotlight(on: boolean, raise: BrowserWindow[], reducedMotion: boolean) {
  const next = on ? LEVEL : 0;
  if (next === target) { if (on) for (const w of raise) if (!w.isDestroyed()) w.moveTop(); return; }
  target = next;
  if (on) { ensure(); apply(Math.max(current, 0.01)); for (const w of raise) if (!w.isDestroyed()) w.moveTop(); }
  if (animation) clearInterval(animation);
  if (reducedMotion) { apply(target); return; }
  const start = current, began = Date.now(), ms = on ? 220 : 180;
  animation = setInterval(() => {
    const t = Math.min(1, (Date.now() - began) / ms), eased = 1 - (1 - t) ** 3;
    apply(start + (target - start) * eased);
    if (t >= 1 && animation) { clearInterval(animation); animation = undefined; }
  }, 16);
}
export function resetOverlays() { for (const overlay of overlays.values()) if (!overlay.isDestroyed()) overlay.destroy(); overlays.clear(); current = target = 0; }
