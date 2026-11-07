import { BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import type { Mode, Store } from "../shared/model.js";
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
  await window.webContents.executeJavaScript("[...document.querySelectorAll(\"button\")].find(b => b.textContent.trim() === \"Calculator\").click()"); await wait(400);
  for (const ch of "7*6") window.webContents.sendInputEvent({ type: "char", keyCode: ch }); window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" }); window.webContents.sendInputEvent({ type: "char", keyCode: "\r" }); window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" }); await wait(500);
  results.typingWorks = (await window.webContents.executeJavaScript("document.querySelector(\".workspace\").innerText.includes(\"42\")")) === true;
  const dims = () => BrowserWindow.getAllWindows().filter(w => w !== window && w.webContents.getURL().includes("blur.html") && w.isVisible());
  await wait(800); results.dimmedWhileOpen = dims().length > 0 && (await dims()[0].webContents.executeJavaScript("document.querySelector(\"img\").classList.contains(\"on\")")) === true;
  setMode("compact"); await wait(900);
  results.collapsed = state().mode === "compact";
  await wait(600); results.undimmedAfter = dims().length === 0;
  await window.webContents.executeJavaScript("window.island.timer(\"toggle\").then(() => window.island.timer(\"toggle\"))"); await wait(300);
  results.saved = existsSync(state().dataFile) && !state().store.timer.running;
  await window.webContents.executeJavaScript("window.island.save({ notes: [{ id: \"n1\", title: \"Hi\", body: \"x\", pinned: false, checklist: false, updatedAt: 1 }] }).then(() => window.island.stickyOpen(\"n1\", { x: 300, y: 300 }))"); await wait(1500);
  const notes = () => BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().includes("sticky=")); const sticky = notes()[0];
  results.stickyOpened = !!sticky && sticky.isVisible() && state().store.notes[0].sticky?.x === 260;
  if (sticky) { sticky.setPosition(500, 400); await wait(600); }
  results.stickyMoveSaved = state().store.notes[0].sticky?.x === 500;
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
  results.companionPage = (await (await fetch(local)).text()).includes("companion");
  console.log("DISPLAY phone=" + base);
  console.log("DISPLAY " + JSON.stringify(await window.webContents.executeJavaScript("window.island.display().then(r => r, e => String(e))")));
  console.log("SMOKE " + JSON.stringify(results));
  quit();
}
