import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { emptyPocket, reduce, tickPocket, type Action, type PocketData } from "../../shared/actions";
import type { MediaState } from "../../shared/bridge";

/** Running as the installed Android launcher (vs. the browser page the desktop serves). */
export const isLauncher = Capacitor.isNativePlatform();
export type State = PocketData & { media: MediaState; serverTime: number; serverId?: string };
export type Status = "connecting" | "live" | "offline" | "unpaired" | "local";
export interface Pairing { base: string; token: string; serverId?: string }

const read = <T,>(key: string, fallback: T): T => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };
export const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("");

export function loadPairing(): Pairing | null { return read<Pairing | null>("island-pairing", null); }
export function savePairing(pairing: Pairing | null) { if (pairing) write("island-pairing", pairing); else try { localStorage.removeItem("island-pairing"); } catch { /* ignore */ } }
export function parsePairLink(link: string): Pairing | null {
  try {
    const url = new URL(link);
    if (url.protocol === "islanddesk:") { const base = url.searchParams.get("u") || "", token = url.searchParams.get("t") || ""; return base && token ? { base: base.replace(/\/?$/, "/"), token } : null; }
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hash.length > 20) return { base: `${url.origin}/`, token: url.hash.slice(1) };
  } catch { /* not a link */ }
  return null;
}

/** Browser page served by the desktop: the desktop is the only copy. */
function webPairing(): Pairing | null {
  const fromHash = location.hash.slice(1);
  if (fromHash) { write("island-desk-token", fromHash); history.replaceState(null, "", "/"); }
  const token = fromHash || read<string>("island-desk-token", "");
  return token ? { base: "/", token } : null;
}

/** Native discovery, injected by the launcher so this file stays usable in the browser page. */
let discoverComputers: ((ms: number) => Promise<{ host: string; port: number; id: string }[]>) | null = null;
export function setDiscovery(fn: typeof discoverComputers) { discoverComputers = fn; }

export function usePocket(pairing: Pairing | null, onMoved?: (next: Pairing) => void) {
  const web = !isLauncher, link = web ? webPairing() : pairing;
  const [state, setState] = useState<State | null>(() => web ? null : { ...read<PocketData>("island-pocket", emptyPocket()), media: { active: false }, serverTime: Date.now() });
  const [status, setStatus] = useState<Status>(link ? "connecting" : web ? "unpaired" : "local");
  const queue = useRef<Action[]>(web ? [] : read<Action[]>("island-queue", [])), skew = useRef(0), busy = useRef(false), lastSearch = useRef(0);
  const stateRef = useRef(state); stateRef.current = state;

  const keep = (next: State) => { setState(next); if (!web) write("island-pocket", { notes: next.notes, tasks: next.tasks, calculations: next.calculations, timer: next.timer, settings: next.settings }); };
  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(link!.base + path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${link!.token}`, ...(init?.headers || {}) } });
    if (response.status === 401) { setStatus("unpaired"); throw Error("This phone was signed out. Pair it again from Island Desk on your computer."); }
    const body = await response.json(); if (!response.ok) throw Error(body.error || "That didn't save."); return body as State;
  };
  /** Send queued changes in order, then adopt the computer's copy. Stops quietly when offline. */
  const sync = async () => {
    if (!link || busy.current) return; busy.current = true;
    try {
      while (queue.current.length) { await request("api/action", { method: "POST", body: JSON.stringify(queue.current[0]) }); queue.current.shift(); write("island-queue", queue.current); }
      const next = await request("api/state"); skew.current = next.serverTime - Date.now(); keep(next); setStatus("live");
      if (next.serverId && link && link.serverId !== next.serverId) onMoved?.({ ...link, serverId: next.serverId });
    } catch (error) {
      if ((error as Error).message.includes("signed out")) throw error;
      setStatus("offline");
      // The computer may have a new address: listen for its beacon (at most every 15 s) and follow it.
      if (!web && link?.serverId && discoverComputers && Date.now() - lastSearch.current > 15000) {
        lastSearch.current = Date.now();
        const found = (await discoverComputers(2500).catch(() => [])).find(computer => computer.id === link.serverId);
        const base = found ? `http://${found.host}:${found.port}/` : "";
        if (base && base !== link.base) onMoved?.({ ...link, base });
      }
    }
    finally { busy.current = false; }
  };

  useEffect(() => {
    if (!link) return;
    if (web) {
      // Live push from the desktop over Server-Sent Events.
      let source: EventSource | undefined, retry: ReturnType<typeof setTimeout> | undefined, closed = false;
      const connect = () => {
        source = new EventSource(`/api/events?t=${encodeURIComponent(link.token)}`);
        source.onmessage = event => { const next = JSON.parse(event.data) as State; skew.current = next.serverTime - Date.now(); setState(next); setStatus("live"); };
        source.onerror = () => { source?.close(); if (closed) return; void fetch("/api/state", { headers: { authorization: `Bearer ${link.token}` } }).then(r => setStatus(r.status === 401 ? "unpaired" : "offline")).catch(() => setStatus("offline")); retry = setTimeout(connect, 3000); };
      };
      connect(); return () => { closed = true; source?.close(); if (retry) clearTimeout(retry); };
    }
    // Launcher: poll (works through the native HTTP bridge, over Wi-Fi or a USB cable).
    void sync().catch(() => undefined);
    const timer = setInterval(() => void sync().catch(() => undefined), 2500);
    const wake = () => { if (document.visibilityState === "visible") void sync().catch(() => undefined); };
    document.addEventListener("visibilitychange", wake);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", wake); };
  }, [link?.base, link?.token]);

  // On its own, the phone keeps the focus timer moving itself.
  useEffect(() => {
    if (web || (link && status === "live")) return;
    const timer = setInterval(() => { const current = stateRef.current; if (!current) return; const next = tickPocket(current, Date.now()); if (next) keep({ ...current, ...next }); }, 1000);
    return () => clearInterval(timer);
  }, [status, !!link]);

  async function run(action: Action) {
    if (web) { setState(await request("api/action", { method: "POST", body: JSON.stringify(action) })); return; }
    const current = stateRef.current!; const stamped = withIds(action);
    keep({ ...current, ...reduce(current, stamped, Date.now(), newId) });
    if (link) { queue.current.push(stamped); write("island-queue", queue.current); await sync(); }
  }
  /** When a phone that has been used on its own pairs for the first time, upload what it already has. */
  function adoptLocalData() {
    const current = stateRef.current; if (!current) return;
    for (const note of current.notes) queue.current.push({ type: "note-save", note });
    for (const task of current.tasks) queue.current.push({ type: "task-save", task });
    write("island-queue", queue.current);
  }
  return { state, status, run, skew, adoptLocalData };
}
/** New items get their id on the phone, so a queued change and its later edits refer to the same item. */
function withIds(action: Action): Action {
  if (action.type === "note-save" && !action.note.id) return { ...action, note: { ...action.note, id: newId() } };
  if (action.type === "task-save" && !action.task.id) return { ...action, task: { ...action.task, id: newId() } };
  if (action.type === "calc-add" && !action.id) return { ...action, id: newId() };
  return action;
}
