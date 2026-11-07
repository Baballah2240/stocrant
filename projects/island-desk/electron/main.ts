import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, globalShortcut, dialog, Notification, shell, powerMonitor, type IpcMainInvokeEvent } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, copyFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { advanceTimer, defaults, duration, insideRoundedRect, timerAction, validateStore, type Store, type Settings, type Mode, type Shortcut, type Snapshot } from "../shared/model.js";
import { startCompanion, stopCompanion, companionChanged, companionInfo, resetToken } from "./companion.js";
import { startMedia, stopMedia, mediaCommand, media } from "./media.js";
import { spotlight, resetOverlays, prepareOverlays } from "./dim.js";
import { getBrightness, setBrightness, getNightLight, setNightLight } from "./system.js";
import type { ContentPatch, DesktopEvent } from "../shared/bridge.js";

const here = dirname(fileURLToPath(import.meta.url));
const testing = Boolean(process.env.ISLAND_DESK_TEST_DIR);
if (testing) app.setPath("userData", resolve(process.env.ISLAND_DESK_TEST_DIR!));
app.setAppUserModelId("studio.islanddesk.desktop");
let window: BrowserWindow, tray: Tray, store: Store = defaults(), mode: Mode = "compact", quitting = false, saveTimer: ReturnType<typeof setTimeout> | undefined, hitTimer: ReturnType<typeof setInterval>;
let rect = { x: 0, y: 0, width: 0, height: 0, radius: 30 }, ignoring = true, modalDepth = 0, pendingCollapse = false;
let dimWanted = false, dimShown = false, dimChangedAt = 0;
let dataFile = "", currentShortcut = "", trayTimer: ReturnType<typeof setInterval>;
const stickies = new Map<string, BrowserWindow>();
const emit = (event: DesktopEvent) => { if (event.type !== "error") companionChanged(); for (const target of [window, ...stickies.values()]) if (target && !target.isDestroyed()) target.webContents.send("desktop-event", event); };

function readData() {
  dataFile = join(app.getPath("userData"), "island-desk.json");
  mkdirSync(dirname(dataFile), { recursive: true });
  if (!existsSync(dataFile)) return;
  try { store = validateStore(JSON.parse(readFileSync(dataFile, "utf8"))); }
  catch {
    const preserved = dataFile + ".unreadable-" + Date.now(); copyFileSync(dataFile, preserved);
    dialog.showErrorBox("Island Desk recovered safely", `Your previous data could not be read. It was preserved at:\n${preserved}\n\nA fresh workspace will open. You can restore an exported backup in Settings.`);
  }
}
function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = undefined; }
  const temporary = dataFile + ".tmp";
  writeFileSync(temporary, JSON.stringify(store, null, 2), "utf8");
  renameSync(temporary, dataFile);
  emit({ type: "saved" });
}
function save(immediate = false) {
  if (saveTimer) clearTimeout(saveTimer);
  if (immediate) return flush();
  saveTimer = setTimeout(() => { try { flush(); } catch { emit({ type: "error", message: "Could not save to disk. Export a backup and check disk space or folder permissions." }); } }, 150);
}
function snapshot(): Snapshot {
  const primary = screen.getPrimaryDisplay().id;
  return { store, displays: screen.getAllDisplays().map(display => ({ id: display.id, label: display.label || `Display ${display.id}`, primary: display.id === primary, width: display.workArea.width, height: display.workArea.height })), dataPath: dirname(dataFile), startupSupported: process.platform === "win32" && app.isPackaged, version: app.getVersion() };
}
function position() {
  const display = screen.getAllDisplays().find(display => display.id === store.settings.displayId) || screen.getPrimaryDisplay();
  const area = display.workArea, width = Math.min(1100, area.width), y = area.y + Math.min(store.settings.offsetY, Math.max(0, area.height - 360));
  const x = Math.round(Math.max(area.x, Math.min(area.x + area.width - width, area.x + (area.width - width) / 2 + store.settings.offsetX)));
  window.setBounds({ x, y, width, height: Math.min(820, area.y + area.height - y) });
  window.setAlwaysOnTop(store.settings.alwaysOnTop, "floating");
}
function setMode(next: Mode) {
  mode = next; pendingCollapse = false;
  if (!window.isVisible()) window.showInactive();
  emit({ type: "mode", mode });
  if (mode === "expanded") { window.show(); window.focus(); app.focus({ steal: true }); window.webContents.focus(); }
  // The island stays focusable: a click on it activates the window, so typing works immediately.
  // Changing focusability can drop the topmost flag on Windows; restore it and stay above the blur.
  if (store.settings.alwaysOnTop) window.setAlwaysOnTop(true, "floating"); window.moveTop();
}
function toggle() { if (mode === "expanded" && window.isVisible()) setMode("compact"); else { window.setFocusable(true); setMode("expanded"); } }
function registerShortcut(accelerator: string) {
  if (accelerator === currentShortcut) return;
  let registered = false;
  try { registered = globalShortcut.register(accelerator, toggle); } catch { /* Return a clear validation error. */ }
  if (!registered) throw Error("That shortcut is invalid or already used by another app. Try another combination.");
  if (currentShortcut) globalShortcut.unregister(currentShortcut);
  currentShortcut = accelerator;
}
function trayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Island Desk", click: () => { window.setFocusable(true); setMode("expanded"); } },
    { label: window.isVisible() ? "Hide island" : "Show island", click: () => window.isVisible() ? window.hide() : setMode("compact") },
    { type: "separator" }, { label: store.timer.running ? "Pause focus timer" : "Start focus timer", click: () => { timerAction(store, "toggle"); save(true); emit({ type: "timer", timer: store.timer }); trayMenu(); } },
    { label: "Always on top", type: "checkbox", checked: store.settings.alwaysOnTop, click: item => { store.settings.alwaysOnTop = item.checked; position(); for (const s of stickies.values()) if (!s.isDestroyed()) s.setAlwaysOnTop(item.checked); save(true); emit({ type: "replace", snapshot: snapshot() }); } },
    { type: "separator" }, { label: "Quit Island Desk", click: () => { quitting = true; app.quit(); } },
  ]));
}
function notify(title: string, body: string) {
  if (!store.settings.notifications || !Notification.isSupported()) return;
  const notification = new Notification({ title, body, silent: true });
  notification.on("click", () => { window.setFocusable(true); setMode("expanded"); }); notification.show();
}
function tick() {
  const phase = store.timer.phase;
  if (advanceTimer(store)) { save(true); emit({ type: "timer", timer: store.timer, completedPhase: phase }); notify(phase === "work" ? "A little space to breathe" : "Ready for a fresh start?", phase === "work" ? "Your focus session is complete. Start your break when you’re ready." : "Your break is complete. Start your next focus session."); trayMenu(); }
  let changed = false;
  for (const task of store.tasks) {
    if (!task.done && !task.notified && task.reminderAt && Date.parse(task.reminderAt) <= Date.now() && store.settings.notifications) { task.notified = true; changed = true; notify("A gentle reminder", task.text); }
  }
  if (changed) { save(); emit({ type: "replace", snapshot: snapshot() }); }
}
function trust(event: IpcMainInvokeEvent | Electron.IpcMainEvent) { const owner = [window, ...stickies.values()].find(w => !w.isDestroyed() && w.webContents === event.sender); if (!owner || event.senderFrame !== owner.webContents.mainFrame) throw Error("This request is not allowed."); }
function handle(name: string, fn: (value: any, extra?: any) => unknown) { ipcMain.handle(name, (event, value, extra) => { trust(event); return fn(value, extra); }); }
async function withDialog<T>(operation: () => Promise<T>) {
  modalDepth++; try { return await operation(); } finally { modalDepth--; window.show(); if (mode === "expanded") window.focus(); }
}
function installIpc() {
  handle("snapshot", snapshot);
  handle("content", (patch: ContentPatch) => {
    if (!patch || typeof patch !== "object" || Object.keys(patch).some(key => !["notes", "tasks", "calculations", "shortcuts"].includes(key))) throw Error("Invalid content update.");
    // Sticky placement is owned by the main process; keep it when the island sends a notes list.
    if (patch.notes) patch.notes = patch.notes.map(note => ({ ...note, sticky: store.notes.find(old => old.id === note.id)?.sticky ?? null }));
    store = validateStore({ ...store, ...patch }); save(); syncStickies(); if (patch.notes) emit({ type: "replace", snapshot: snapshot() });
  });
  handle("note-patch", (id: string, patch: Record<string, unknown>) => {
    const note = store.notes.find(item => item.id === id); if (!note || !patch || typeof patch !== "object") throw Error("That note no longer exists.");
    const next = { ...note, updatedAt: Date.now() } as Record<string, unknown>;
    for (const key of ["title", "body", "checklist"]) if (key in patch) next[key] = patch[key];
    store = validateStore({ ...store, notes: store.notes.map(item => item.id === id ? next : item) }); save(); emit({ type: "replace", snapshot: snapshot() });
  });
  handle("sticky-open", (id: string, at?: { x: number; y: number }) => {
    const note = store.notes.find(item => item.id === id); if (!note) throw Error("That note no longer exists.");
    const dropped = at && Number.isFinite(at.x) && Number.isFinite(at.y);
    const area = screen.getDisplayNearestPoint(dropped ? at : screen.getCursorScreenPoint()).workArea;
    const point = dropped ? { x: Math.round(at.x - 40), y: Math.round(at.y - 20) } : { x: area.x + area.width - 300, y: area.y + 120 + stickies.size * 30 };
    note.sticky = note.sticky && !dropped ? note.sticky : { ...point, width: 260, height: 240 }; save(); openSticky(note.id); emit({ type: "replace", snapshot: snapshot() });
  });
  handle("sticky-close", (id: string) => { const note = store.notes.find(item => item.id === id); if (note) note.sticky = null; save(); syncStickies(); emit({ type: "replace", snapshot: snapshot() }); });
  handle("settings", async (patch: Partial<Settings>) => {
    const next = validateStore({ ...store, settings: { ...store.settings, ...patch } }).settings;
    if (!testing && next.launchAtStartup !== store.settings.launchAtStartup) {
      if (!app.isPackaged || process.platform !== "win32") throw Error("Launch at startup is available in the installed Windows app.");
      app.setLoginItemSettings({ openAtLogin: next.launchAtStartup, path: process.execPath });
    }
    // Only a shortcut the user is changing must register; an unchanged one that another app holds must not block other settings.
    if (next.globalShortcut !== store.settings.globalShortcut) registerShortcut(next.globalShortcut); else try { registerShortcut(next.globalShortcut); } catch { /* still taken; keep using the tray */ }
    if (next.companion && !store.settings.companion) await startCompanion(companionHost); else if (!next.companion && store.settings.companion) stopCompanion();
    const oldDuration = duration(store.timer.phase, store.settings);
    store.settings = next;
    if (!store.timer.running && store.timer.remainingMs === oldDuration) store.timer.remainingMs = duration(store.timer.phase, next);
    position(); for (const s of stickies.values()) if (!s.isDestroyed()) s.setAlwaysOnTop(next.alwaysOnTop); save(true); trayMenu(); emit({ type: "timer", timer: store.timer }); return next;
  });
  handle("timer", action => { if (!["toggle", "reset", "skip", "work", "break"].includes(action)) throw Error("Invalid timer action."); advanceTimer(store); timerAction(store, action); save(true); emit({ type: "timer", timer: store.timer }); trayMenu(); return store.timer; });
  handle("export", () => withDialog(async () => {
    const result = await dialog.showSaveDialog(window, { title: "Export Island Desk backup", defaultPath: `Island-Desk-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "Island Desk backup", extensions: ["json"] }] });
    if (result.canceled || !result.filePath) return false;
    flush(); writeFileSync(result.filePath, JSON.stringify(store, null, 2)); return true;
  }));
  handle("import", () => withDialog(async () => {
    const result = await dialog.showOpenDialog(window, { title: "Restore an Island Desk backup", properties: ["openFile"], filters: [{ name: "Island Desk backup", extensions: ["json"] }] });
    if (result.canceled || !result.filePaths[0]) return false;
    if (statSync(result.filePaths[0]).size > 15 * 1024 * 1024) throw Error("Choose a backup smaller than 15 MB.");
    const imported = validateStore(JSON.parse(readFileSync(result.filePaths[0], "utf8")));
    const confirmation = await dialog.showMessageBox(window, { type: "warning", title: "Replace this workspace?", message: "Import replaces your notes, tasks, timer and shortcuts.", detail: "A recovery copy of the current workspace will be kept on this device. Display, startup and global shortcut settings stay unchanged.", buttons: ["Cancel", "Restore backup"], defaultId: 0, cancelId: 0 });
    if (confirmation.response !== 1) return false;
    flush(); copyFileSync(dataFile, dataFile + ".before-import-" + Date.now());
    imported.settings = { ...imported.settings, displayId: store.settings.displayId, offsetX: store.settings.offsetX, offsetY: store.settings.offsetY, scale: store.settings.scale, globalShortcut: store.settings.globalShortcut, launchAtStartup: store.settings.launchAtStartup };
    store = imported; position(); syncStickies(); save(true); trayMenu(); emit({ type: "replace", snapshot: snapshot() }); tick(); return true;
  }));
  handle("pick", kind => withDialog(async () => {
    if (kind !== "app" && kind !== "folder") throw Error("Choose an app or folder.");
    const result = await dialog.showOpenDialog(window, { title: kind === "app" ? "Choose an application" : "Choose a folder", properties: [kind === "folder" ? "openDirectory" : "openFile"], ...(kind === "app" ? { filters: [{ name: "Windows application", extensions: ["exe"] }] } : {}) });
    return result.canceled ? null : result.filePaths[0];
  }));
  handle("open", async (shortcut: Shortcut) => {
    const saved = store.shortcuts.find(item => item.id === shortcut?.id);
    if (!saved) throw Error("Save this shortcut before opening it.");
    if (saved.kind === "website") { const url = new URL(saved.target); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw Error("Use a normal https:// or http:// website address."); await shell.openExternal(url.toString()); }
    else { if (!/^[A-Za-z]:[\\/]/.test(saved.target) || !existsSync(saved.target)) throw Error("This local path no longer exists."); if (saved.kind === "app" && !saved.target.toLowerCase().endsWith(".exe")) throw Error("Choose an .exe application."); if (saved.kind === "folder" && !statSync(saved.target).isDirectory()) throw Error("Choose a folder."); const error = await shell.openPath(saved.target); if (error) throw Error(error); }
  });
  handle("companion-info", () => companionInfo());
  handle("companion-reset", () => { resetToken(); return companionInfo(); });
  handle("media-get", () => media);
  handle("media-command", (command: string) => mediaCommand(command));
  handle("display-get", () => displayState);
  handle("display-set", async (patch: { brightness?: unknown; nightLight?: unknown }) => {
    if (typeof patch?.brightness === "number" && Number.isFinite(patch.brightness)) await setBrightness(patch.brightness);
    if (typeof patch?.nightLight === "boolean") await setNightLight(patch.nightLight);
    if (typeof patch?.brightness === "number") displayState.brightness = Math.round(patch.brightness);
    if (typeof patch?.nightLight === "boolean") displayState.nightLight = patch.nightLight;
    void refreshDisplay(); return displayState;
  });
  handle("open-data", () => shell.openPath(dirname(dataFile)));
  ipcMain.on("mode", (event, next) => { trust(event); if (["compact", "preview", "expanded"].includes(next)) { if (next === "expanded") window.setFocusable(true); setMode(next); } });
  ipcMain.on("geometry", (event, value) => { trust(event); if (value && ["x", "y", "width", "height", "radius"].every(key => typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 5000)) rect = value; });
  ipcMain.on("hide", event => { trust(event); window.hide(); trayMenu(); });
  ipcMain.on("quit", event => { trust(event); quitting = true; app.quit(); });
}
function openSticky(id: string) {
  const note = store.notes.find(item => item.id === id); if (!note?.sticky) return;
  const existing = stickies.get(id); if (existing && !existing.isDestroyed()) { existing.setBounds(note.sticky); existing.showInactive(); return; }
  const area = screen.getDisplayMatching(note.sticky).workArea, b = note.sticky;
  // Keep a note reachable if the monitor it lived on was unplugged.
  const visible = b.x + 60 > area.x && b.x < area.x + area.width - 60 && b.y >= area.y - 10 && b.y < area.y + area.height - 40;
  const bounds = visible ? b : { ...b, x: area.x + area.width - b.width - 40, y: area.y + 100 };
  const sticky = new BrowserWindow({ ...bounds, minWidth: 180, minHeight: 140, frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false, resizable: true, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: store.settings.alwaysOnTop, show: false, title: "Island Desk note", webPreferences: { preload: join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true, devTools: !app.isPackaged } });
  stickies.set(id, sticky);
  sticky.webContents.setWindowOpenHandler(() => ({ action: "deny" })); sticky.webContents.on("will-navigate", event => event.preventDefault());
  let moveTimer: ReturnType<typeof setTimeout> | undefined;
  const remember = () => { if (moveTimer) clearTimeout(moveTimer); moveTimer = setTimeout(() => { const n = store.notes.find(item => item.id === id); if (n && n.sticky && !sticky.isDestroyed()) { n.sticky = sticky.getBounds(); save(); } }, 250); };
  sticky.on("move", remember); sticky.on("resize", remember);
  sticky.on("closed", () => { if (stickies.get(id) === sticky) stickies.delete(id); });
  sticky.once("ready-to-show", () => sticky.showInactive());
  const devUrl = process.env.ISLAND_DESK_DEV_URL;
  if (devUrl === "http://127.0.0.1:5178") void sticky.loadURL(devUrl + "/?sticky=" + encodeURIComponent(id)); else void sticky.loadFile(join(here, "../../dist/index.html"), { query: { sticky: id } });
}
/** Close sticky windows whose note was deleted or docked back, and open ones that should be showing. */
function syncStickies() {
  for (const [id, sticky] of stickies) if (!store.notes.some(note => note.id === id && note.sticky)) { stickies.delete(id); if (!sticky.isDestroyed()) sticky.destroy(); }
  for (const note of store.notes) if (note.sticky && !stickies.has(note.id)) openSticky(note.id);
}
// Reading brightness from Windows takes ~1s, so keep a cached copy the preview can show instantly.
let displayState: { brightness: number | null; nightLight: boolean | null } = { brightness: null, nightLight: null };
async function refreshDisplay() { const [brightness, nightLight] = await Promise.all([getBrightness(), getNightLight()]); displayState = { brightness, nightLight }; }
/** What the phone companion may read and change; every change goes through the same validation as the app. */
const companionHost = {
  store: () => store,
  media: () => media,
  change(patch: Partial<Pick<Store, "notes" | "tasks" | "calculations">>) { store = validateStore({ ...store, ...patch }); save(); syncStickies(); emit({ type: "replace", snapshot: snapshot() }); },
  timer(action: "toggle" | "reset" | "skip" | "work" | "break") { advanceTimer(store); timerAction(store, action); save(true); emit({ type: "timer", timer: store.timer }); trayMenu(); },
  mediaCommand: (command: "toggle" | "next" | "previous") => mediaCommand(command),
};
function createWindow() {
  window = new BrowserWindow({ width: 1100, height: 820, frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, show: false, title: "Island Desk", webPreferences: { preload: join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true, devTools: !app.isPackaged } });
  window.setIgnoreMouseEvents(true, { forward: true }); position();
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  window.on("blur", () => { if (mode === "expanded" && !modalDepth) setMode("compact"); });
  window.on("close", event => { if (!quitting) { event.preventDefault(); window.hide(); trayMenu(); } });
  window.once("ready-to-show", () => window.showInactive());
  const devUrl = process.env.ISLAND_DESK_DEV_URL;
  if (devUrl === "http://127.0.0.1:5178") void window.loadURL(devUrl); else void window.loadFile(join(here, "../../dist/index.html"));
  // Native cursor polling tests the live animated rounded rectangle, not the transparent canvas.
  hitTimer = setInterval(() => {
    if (window.isDestroyed() || !window.isVisible()) return;
    const point = screen.getCursorScreenPoint(), bounds = window.getBounds();
    const inside = insideRoundedRect(point.x - bounds.x, point.y - bounds.y, rect);
    if (ignoring === inside) { ignoring = !inside; window.setIgnoreMouseEvents(ignoring, { forward: true }); }
    if (!inside && mode === "preview" && !pendingCollapse) { pendingCollapse = true; setTimeout(() => { if (pendingCollapse && mode === "preview") setMode("compact"); }, 220); }
    if (inside) pendingCollapse = false;
    // Spotlight whatever is under the pointer: the island, or a sticky note on the desktop.
    const hoveredSticky = [...stickies.values()].find(s => { if (s.isDestroyed() || !s.isVisible()) return false; const b = s.getBounds(); return point.x >= b.x && point.x < b.x + b.width && point.y >= b.y && point.y < b.y + b.height; });
    const lit = store.settings.dimOnHover && modalDepth === 0 && (inside || mode === "expanded" || !!hoveredSticky);
    // Hysteresis: brief edge crossings and resize animations don't flash the dim on and off.
    const now = Date.now();
    if (lit !== dimWanted) { dimWanted = lit; dimChangedAt = now; }
    if (dimWanted !== dimShown && now - dimChangedAt >= (dimWanted ? 90 : 260)) dimShown = dimWanted;
    spotlight(dimShown, hoveredSticky ? [hoveredSticky] : [window], store.settings.reducedMotion);
  }, 24);
}
if (!app.requestSingleInstanceLock() && !testing) app.quit();
else {
  app.whenReady().then(() => {
    readData(); createWindow(); installIpc(); syncStickies(); setTimeout(prepareOverlays, 1500); startMedia(state => emit({ type: "media", media: state }));
    if (store.settings.companion) startCompanion(companionHost).catch(error => setTimeout(() => emit({ type: "error", message: "Phone companion: " + error.message }), 1500)); void refreshDisplay(); setInterval(() => void refreshDisplay(), 20000);
    const image = nativeImage.createFromDataURL("data:image/png;base64," + readFileSync(join(here, "../../dist/tray.png")).toString("base64"));
    tray = new Tray(image); tray.setToolTip("Island Desk · a little room for your day"); tray.on("click", toggle); trayMenu();
    try { registerShortcut(store.settings.globalShortcut); } catch (error) { setTimeout(() => emit({ type: "error", message: (error as Error).message + " Use the tray to open Settings." }), 1500); }
    screen.on("display-added", () => { resetOverlays(); position(); emit({ type: "replace", snapshot: snapshot() }); }); screen.on("display-removed", () => { resetOverlays(); position(); emit({ type: "replace", snapshot: snapshot() }); }); screen.on("display-metrics-changed", position);
    powerMonitor.on("resume", tick); trayTimer = setInterval(tick, 1000); tick();
    app.on("second-instance", () => { window.setFocusable(true); setMode("expanded"); });
    if (testing && process.argv.includes("--smoke")) void import("./smoke.js").then(module => module.runSmoke(window, () => ({ store, mode, rect, ignoring, dataFile }), setMode, () => { quitting = true; app.quit(); }));
  }).catch(error => { dialog.showErrorBox("Island Desk could not start", String(error)); app.quit(); });
}
app.on("before-quit", () => { quitting = true; stopCompanion(); stopMedia(); resetOverlays(); clearInterval(hitTimer); clearInterval(trayTimer); try { if (dataFile) flush(); } catch { /* Keep the last successfully saved file. */ } globalShortcut.unregisterAll(); });
app.on("window-all-closed", () => { if (quitting) app.quit(); });
