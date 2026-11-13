import { BrowserWindow, screen, dialog } from "electron";
import { createSocket } from "node:dgram";
import { existsSync, writeFileSync } from "node:fs";
import type { Mode, Store } from "../shared/model.js";
import { translationSmoke } from "./translation-smoke.js";
type State = () => { store: Store; mode: Mode; rect: { width: number; height: number }; ignoring: boolean; dataFile: string };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
/** Launch check: renders, expands, collapses, saves to disk, and keeps transparent area click-through. */
export async function runSmoke(window: BrowserWindow, state: State, setMode: (m: Mode) => void, quit: () => void) {
  const results: Record<string, boolean> = {};
  await wait(1500);
  results.rendered = (await window.webContents.executeJavaScript("document.querySelector('#root')?.children.length > 0")) as boolean;
  const compact = state().rect.width * state().rect.height;
  results.clickThrough = state().ignoring;
  setMode("expanded"); await wait(900);
  results.expanded = state().mode === "expanded" && state().rect.width * state().rect.height > compact;
  results.keyboardFocus = window.isFocused() && (await window.webContents.executeJavaScript("document.hasFocus()")) === true;
  await window.webContents.executeJavaScript("document.querySelector('button[aria-label=Settings]').click()"); await wait(400);
  results.settingsVisible = await window.webContents.executeJavaScript("(()=>{const c=document.querySelector('.content'),p=document.querySelector('.atmosphere'),r=c.getBoundingClientRect(),s=p.getBoundingClientRect();return r.height>120&&s.top>=r.top-2&&s.top<r.bottom&&c.scrollHeight>c.clientHeight&&!!document.querySelector('.preferences');})()");
  await window.webContents.executeJavaScript("(()=>{const s=document.querySelector('.atmosphere select');s.value='light';s.dispatchEvent(new Event('change',{bubbles:true}));})()");await wait(200);
  results.lightAppearance = await window.webContents.executeJavaScript("document.documentElement.dataset.appearance==='light'&&getComputedStyle(document.querySelector('.island')).color==='rgb(21, 32, 57)'");
  if(process.env.ISLAND_DESK_QA_SCREENSHOT)writeFileSync(process.env.ISLAND_DESK_QA_SCREENSHOT,(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript("(()=>{const s=document.querySelector('.atmosphere select');s.value='dark';s.dispatchEvent(new Event('change',{bubbles:true}));})()");await wait(100);

  await window.webContents.executeJavaScript("[...document.querySelectorAll(\"button\")].find(b => b.textContent.trim() === \"Calculator\").click()"); await wait(400);
  for (const ch of "7*6") window.webContents.sendInputEvent({ type: "char", keyCode: ch }); window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" }); window.webContents.sendInputEvent({ type: "char", keyCode: "\r" }); window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" }); await wait(500);
  results.typingWorks = (await window.webContents.executeJavaScript("document.querySelector(\".workspace\").innerText.includes(\"42\")")) === true;
  Object.assign(results, await translationSmoke(window));
  const dims = () => BrowserWindow.getAllWindows().filter(w => w !== window && w.webContents.getURL().includes("blur.html") && w.isVisible());
  await wait(800); results.dimmedWhileOpen = dims().length > 0 && (await dims()[0].webContents.executeJavaScript("document.querySelector(\"img\").classList.contains(\"on\")")) === true;
  setMode("compact"); await wait(900);
  results.collapsed = state().mode === "compact";
  await wait(600); results.undimmedAfter = dims().length === 0;
  // The blur must come back on every open, not just the first.
  setMode("expanded"); await wait(1700);
  results.dimmedSecondTime = dims().length > 0 && (await dims()[0].webContents.executeJavaScript("document.querySelector(\"img\").classList.contains(\"on\")")) === true;
  window.hide(); await wait(900);
  results.undimmedWhenHidden = dims().length === 0;
  setMode("compact"); await wait(900);
  await window.webContents.executeJavaScript("window.island.timer(\"toggle\").then(() => window.island.timer(\"toggle\"))"); await wait(300);
  results.saved = existsSync(state().dataFile) && !state().store.timer.running;
  await window.webContents.executeJavaScript("window.island.save({ notes: [{ id: \"n1\", title: \"Hi\", body: \"x\", pinned: false, checklist: false, updatedAt: 1 }] }).then(() => window.island.stickyOpen(\"n1\", { x: 300, y: 300 }))"); await wait(1500);
  const notes = () => BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().includes("sticky=")); const sticky = notes()[0];
  results.stickyOpened = !!sticky && sticky.isVisible() && state().store.notes[0].sticky?.x === 260;
  if (sticky) { sticky.setPosition(500, 400); await wait(600); }
  results.stickyMoveSaved = state().store.notes[0].sticky?.x === 500;
  if (sticky) {
    state().store.notes[0].sticky = { x: 25000, y: 25000, width: 260, height: 240 };
    screen.emit("display-removed", {}, screen.getPrimaryDisplay());
    const b = sticky.getBounds(), a = screen.getDisplayMatching(b).workArea;
    results.stickyRecoveredAfterDisplayRemoval = b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
  }
  await window.webContents.executeJavaScript("window.island.stickyClose(\"n1\")"); await wait(400);
  results.stickyDocked = notes().length === 0 && !state().store.notes[0].sticky;
  // Phone companion: pair, refuse strangers, sync a note from the "phone", serve the page.
  const info = await window.webContents.executeJavaScript("window.island.settings({ companion: true }).then(() => window.island.companion())") as { url: string; qr: string };
  const base = info.url.replace(/#.*/, ""), pairing = info.url.split("#")[1] || "";
  results.companionRunning = !!base && info.qr.startsWith("data:image/png");
  const local = "http://127.0.0.1:" + new URL(base).port + "/";
  results.companionRejectsStrangers = (await fetch(local + "api/state")).status === 401;
  const posted = await fetch(local + "api/action", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + pairing }, body: JSON.stringify({ type: "note-save", note: { title: "From phone", body: "hello" } }) });
  await wait(400);
  results.companionSyncsNotes = posted.ok && state().store.notes.some(note => note.title === "From phone");
  const timerRequest = () => fetch(local + "api/action", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + pairing }, body: JSON.stringify({ type: "timer", action: "toggle", requestId: "smoke-timer-123" }) });
  await timerRequest();
  const timerAfterFirst = JSON.stringify(state().store.timer);
  await timerRequest();
  results.timerRetryDeduplicated = state().store.timer.running && JSON.stringify(state().store.timer) === timerAfterFirst;
  results.timerReceiptSaved = (await import("node:fs")).readFileSync(state().dataFile, "utf8").includes("smoke-timer-123");
  await window.webContents.executeJavaScript('window.island.timer("reset")');
  results.companionPage = (await (await fetch(local)).text()).includes("companion");
  // Discovery: the beacon a phone listens for must name this computer.
  const stateId = ((await (await fetch(local + "api/state", { headers: { authorization: "Bearer " + pairing } })).json()) as { serverId?: string }).serverId || "";
  results.companionBeacon = await new Promise<boolean>(resolve => {
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    const done = (value: boolean) => { try { socket.close(); } catch { /* closed */ } resolve(value); };
    socket.on("message", data => { try { const beacon = JSON.parse(String(data)); if (beacon.app === "island-desk" && beacon.id === stateId && stateId) done(true); } catch { /* ignore */ } });
    socket.on("error", () => done(false));
    socket.bind(Number(process.env.ISLAND_DESK_BEACON_PORT));
    setTimeout(() => done(false), 5000);
  });
  // Wi-Fi pairing, phone notifications in the island, and the live announcement.
  const paired = await fetch(local + "api/pair-request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ device: "Test Phone" }) });
  const pairBody = await paired.json() as { token?: string };
  results.wifiPairing = paired.ok && pairBody.token === pairing;
  await wait(5600); // let the "Phone connected" announcement finish
  await fetch(local + "api/action", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + pairing }, body: JSON.stringify({ type: "phone-notifications", device: "Test Phone", items: [{ key: "k1", app: "Gmail", title: "Sara Ahmed", text: "The contract is ready to sign", time: Date.now(), icon: "" }] }) });
  await wait(700);
  const feed = await window.webContents.executeJavaScript("window.island.phone()") as { connected: boolean; items: unknown[] };
  results.phoneNotificationsOnDesktop = feed.connected && feed.items.length === 1;
  results.liveIslandReacts = (await window.webContents.executeJavaScript("(document.querySelector('.live-card')?.textContent || '').includes('Sara Ahmed')")) === true;
  if (process.env.SHOT) { const img = await window.webContents.capturePage(); const z = img.getSize(); (await import("node:fs")).writeFileSync(process.env.SHOT, img.crop({ x: Math.round(z.width * 0.28), y: 0, width: Math.round(z.width * 0.44), height: Math.round(z.height * 0.11) }).toPNG()); }
  const openDialog = dialog.showOpenDialog, messageDialog = dialog.showMessageBox;
  const backupFile = state().dataFile + ".test-import.json";
  try {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [backupFile] })) as typeof dialog.showOpenDialog;
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as typeof dialog.showMessageBox;
    const backup = JSON.parse(JSON.stringify(state().store)) as Store;
    backup.settings.companion = false;
    writeFileSync(backupFile, JSON.stringify(backup));
    await window.webContents.executeJavaScript("window.island.backupImport()");
    results.importStopsCompanion = (await window.webContents.executeJavaScript("window.island.companion()") as { running: boolean }).running === false;
    backup.settings.companion = true;
    writeFileSync(backupFile, JSON.stringify(backup));
    await window.webContents.executeJavaScript("window.island.backupImport()");
    results.importStartsCompanion = (await window.webContents.executeJavaScript("window.island.companion()") as { running: boolean }).running === true;
  } finally { dialog.showOpenDialog = openDialog; dialog.showMessageBox = messageDialog; }
  console.log("DISPLAY phone=" + base);
  console.log("DISPLAY " + JSON.stringify(await window.webContents.executeJavaScript("window.island.display().then(r => r, e => String(e))")));
  console.log("SMOKE " + JSON.stringify(results));
  quit();
}
