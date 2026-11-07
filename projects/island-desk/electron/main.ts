import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, globalShortcut, dialog, Notification, shell, powerMonitor, type IpcMainInvokeEvent } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, copyFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { advanceTimer, defaults, duration, insideRoundedRect, timerAction, validateStore, type Store, type Settings, type Mode, type Shortcut, type Snapshot } from "../shared/model.js";
import type { ContentPatch, DesktopEvent } from "../shared/bridge.js";

const here = dirname(fileURLToPath(import.meta.url));
const testing = Boolean(process.env.ISLAND_DESK_TEST_DIR);
if (testing) app.setPath("userData", resolve(process.env.ISLAND_DESK_TEST_DIR!));
app.setAppUserModelId("studio.islanddesk.desktop");
let window: BrowserWindow, tray: Tray, store: Store = defaults(), mode: Mode = "compact", quitting = false, saveTimer: ReturnType<typeof setTimeout> | undefined, hitTimer: ReturnType<typeof setInterval>;
let rect = { x: 0, y: 0, width: 0, height: 0, radius: 30 }, ignoring = true, modalDepth = 0, pendingCollapse = false;
let dataFile = "", currentShortcut = "", trayTimer: ReturnType<typeof setInterval>;
const emit = (event: DesktopEvent) => { if (window && !window.isDestroyed()) window.webContents.send("desktop-event", event); };

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
  if (mode === "expanded") { window.show(); window.focus(); }
  if (mode !== "expanded") window.setFocusable(false); else window.setFocusable(true);
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
    { label: "Always on top", type: "checkbox", checked: store.settings.alwaysOnTop, click: item => { store.settings.alwaysOnTop = item.checked; position(); save(true); emit({ type: "replace", snapshot: snapshot() }); } },
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
function trust(event: IpcMainInvokeEvent | Electron.IpcMainEvent) { if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw Error("This request is not allowed."); }
function handle(name: string, fn: (value: any) => unknown) { ipcMain.handle(name, (event, value) => { trust(event); return fn(value); }); }
async function withDialog<T>(operation: () => Promise<T>) {
  modalDepth++; try { return await operation(); } finally { modalDepth--; window.show(); if (mode === "expanded") window.focus(); }
}
function installIpc() {
  handle("snapshot", snapshot);
  handle("content", (patch: ContentPatch) => {
    if (!patch || typeof patch !== "object" || Object.keys(patch).some(key => !["notes", "tasks", "calculations", "shortcuts"].includes(key))) throw Error("Invalid content update.");
    store = validateStore({ ...store, ...patch }); save();
  });
  handle("settings", (patch: Partial<Settings>) => {
    const next = validateStore({ ...store, settings: { ...store.settings, ...patch } }).settings;
    if (!testing && next.launchAtStartup !== store.settings.launchAtStartup) {
      if (!app.isPackaged || process.platform !== "win32") throw Error("Launch at startup is available in the installed Windows app.");
      app.setLoginItemSettings({ openAtLogin: next.launchAtStartup, path: process.execPath });
    }
    registerShortcut(next.globalShortcut);
    const oldDuration = duration(store.timer.phase, store.settings);
    store.settings = next;
    if (!store.timer.running && store.timer.remainingMs === oldDuration) store.timer.remainingMs = duration(store.timer.phase, next);
    position(); save(true); trayMenu(); emit({ type: "timer", timer: store.timer }); return next;
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
    store = imported; position(); save(true); trayMenu(); emit({ type: "replace", snapshot: snapshot() }); tick(); return true;
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
  handle("open-data", () => shell.openPath(dirname(dataFile)));
  ipcMain.on("mode", (event, next) => { trust(event); if (["compact", "preview", "expanded"].includes(next)) { if (next === "expanded") window.setFocusable(true); setMode(next); } });
  ipcMain.on("geometry", (event, value) => { trust(event); if (value && ["x", "y", "width", "height", "radius"].every(key => typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 5000)) rect = value; });
  ipcMain.on("hide", event => { trust(event); window.hide(); trayMenu(); });
  ipcMain.on("quit", event => { trust(event); quitting = true; app.quit(); });
}
function createWindow() {
  window = new BrowserWindow({ width: 1100, height: 820, frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, show: false, title: "Island Desk", webPreferences: { preload: join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true, devTools: !app.isPackaged } });
  window.setIgnoreMouseEvents(true, { forward: true }); position();
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  window.on("blur", () => { if (mode === "expanded" && !modalDepth) setMode("compact"); });
  window.on("close", event => { if (!quitting) { event.preventDefault(); window.hide(); trayMenu(); } });
  window.once("ready-to-show", () => { window.showInactive(); window.setFocusable(false); });
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
  }, 24);
}
if (!app.requestSingleInstanceLock() && !testing) app.quit();
else {
  app.whenReady().then(() => {
    readData(); createWindow(); installIpc();
    const image = nativeImage.createFromDataURL("data:image/png;base64," + readFileSync(join(here, "../../dist/tray.png")).toString("base64"));
    tray = new Tray(image); tray.setToolTip("Island Desk · a little room for your day"); tray.on("click", toggle); trayMenu();
    try { registerShortcut(store.settings.globalShortcut); } catch (error) { setTimeout(() => emit({ type: "error", message: (error as Error).message + " Use the tray to open Settings." }), 1500); }
    screen.on("display-added", () => { position(); emit({ type: "replace", snapshot: snapshot() }); }); screen.on("display-removed", () => { position(); emit({ type: "replace", snapshot: snapshot() }); }); screen.on("display-metrics-changed", position);
    powerMonitor.on("resume", tick); trayTimer = setInterval(tick, 1000); tick();
    app.on("second-instance", () => { window.setFocusable(true); setMode("expanded"); });
    if (testing && process.argv.includes("--smoke")) void import("./smoke.js").then(module => module.runSmoke(window, () => ({ store, mode, rect, ignoring, dataFile }), setMode, () => { quitting = true; app.quit(); }));
  }).catch(error => { dialog.showErrorBox("Island Desk could not start", String(error)); app.quit(); });
}
app.on("before-quit", () => { quitting = true; clearInterval(hitTimer); clearInterval(trayTimer); try { if (dataFile) flush(); } catch { /* Keep the last successfully saved file. */ } globalShortcut.unregisterAll(); });
app.on("window-all-closed", () => { if (quitting) app.quit(); });
