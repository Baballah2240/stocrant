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
  setMode("compact"); await wait(900);
  results.collapsed = state().mode === "compact";
  await window.webContents.executeJavaScript("window.island.timer(\"toggle\").then(() => window.island.timer(\"toggle\"))"); await wait(300);
  results.saved = existsSync(state().dataFile) && !state().store.timer.running;
  await window.webContents.executeJavaScript("window.island.save({ notes: [{ id: \"n1\", title: \"Hi\", body: \"x\", pinned: false, checklist: false, updatedAt: 1 }] }).then(() => window.island.stickyOpen(\"n1\", { x: 300, y: 300 }))"); await wait(1500);
  const sticky = BrowserWindow.getAllWindows().find(w => w !== window);
  results.stickyOpened = !!sticky && sticky.isVisible() && state().store.notes[0].sticky?.x === 260;
  if (sticky) { sticky.setPosition(500, 400); await wait(600); }
  results.stickyMoveSaved = state().store.notes[0].sticky?.x === 500;
  await window.webContents.executeJavaScript("window.island.stickyClose(\"n1\")"); await wait(400);
  results.stickyDocked = BrowserWindow.getAllWindows().length === 1 && !state().store.notes[0].sticky;
  console.log("SMOKE " + JSON.stringify(results));
  quit();
}
