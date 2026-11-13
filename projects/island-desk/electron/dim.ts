import { BrowserWindow, desktopCapturer, screen } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Focus spotlight: when the island or a sticky note is hovered, each monitor is captured once,
 * shown blurred in a click-through window behind it, and faded away when the pointer leaves.
 * Windows has no API for live-blurring other apps, so the background is a still snapshot.
 */
const here = dirname(fileURLToPath(import.meta.url));
const overlays = new Map<number, BrowserWindow>();
let on = false, token = 0, raised: BrowserWindow | undefined;

function ensure() {
  const displays = screen.getAllDisplays(), ids = new Set(displays.map(d => d.id));
  for (const [id, overlay] of overlays) if (!ids.has(id)) { overlay.destroy(); overlays.delete(id); }
  for (const display of displays) {
    let overlay = overlays.get(display.id);
    if (!overlay || overlay.isDestroyed()) {
      overlay = new BrowserWindow({ ...display.bounds, frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false, resizable: false, movable: false, focusable: false, skipTaskbar: true, show: false, enableLargerThanScreen: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
      // Not topmost: it sits above ordinary apps but always below the island and sticky notes.
      overlay.setIgnoreMouseEvents(true);
      overlay.webContents.on("will-navigate", event => event.preventDefault());
      void overlay.loadFile(join(here, "../../dist/blur.html"));
      overlays.set(display.id, overlay);
    } else overlay.setBounds(display.bounds);
  }
}
/** Build the overlays ahead of time so the first hover is fast. */
export function prepareOverlays() { ensure(); }

async function capture() {
  const displays = screen.getAllDisplays();
  // Half resolution is plenty for a blurred image and keeps capture quick.
  const largest = displays.reduce((size, d) => ({ width: Math.max(size.width, Math.round(d.bounds.width * d.scaleFactor / 2)), height: Math.max(size.height, Math.round(d.bounds.height * d.scaleFactor / 2)) }), { width: 0, height: 0 });
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: largest });
  return new Map(displays.map((d, index) => [d.id, (sources.find(s => s.display_id === String(d.id)) || sources[index])?.thumbnail]));
}

export function spotlight(want: boolean, raise: BrowserWindow[], reducedMotion: boolean) {
  const front = raise[0];
  if (want === on) {
    // Re-stack only when the spotlight moves to another window, never on every poll.
    if (on && front && front !== raised && !front.isDestroyed()) { const top=front.isAlwaysOnTop();front.moveTop();if(top)front.setAlwaysOnTop(true,process.platform === "win32" ? "screen-saver" : "floating"); raised = front; }
    return;
  }
  on = want; const mine = ++token;
  if (!want) {
    raised = undefined;
    for (const overlay of overlays.values()) if (!overlay.isDestroyed() && overlay.isVisible()) void overlay.webContents.executeJavaScript(`hideBlur(${reducedMotion})`).then(ms => setTimeout(() => { if (token === mine && !overlay.isDestroyed()) overlay.hide(); }, Number(ms) || 0)).catch(() => overlay.hide());
    return;
  }
  ensure();
  void capture().then(images => {
    if (token !== mine) return; // the pointer already left
    for (const [id, overlay] of overlays) {
      const image = images.get(id); if (!image || image.isEmpty() || overlay.isDestroyed()) continue;
      const url = "data:image/jpeg;base64," + image.toJPEG(72).toString("base64");
      // Show the window first, then fade in: a hidden window may never paint, so nothing may wait on it.
      void overlay.webContents.executeJavaScript(`setBlur(${JSON.stringify(url)})`).then(() => {
        if (token !== mine || overlay.isDestroyed()) return;
        overlay.showInactive(); overlay.moveTop();
        void overlay.webContents.executeJavaScript(`fadeIn(${reducedMotion})`).catch(() => undefined);
        for (const w of raise) if (!w.isDestroyed()) {const top=w.isAlwaysOnTop();w.moveTop();if(top)w.setAlwaysOnTop(true,process.platform === "win32" ? "screen-saver" : "floating");}
        raised = front;
      }).catch(() => undefined);
    }
  }).catch(() => undefined);
}
export function resetOverlays() { token++; on = false; raised = undefined; for (const overlay of overlays.values()) if (!overlay.isDestroyed()) overlay.destroy(); overlays.clear(); }
