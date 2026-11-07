import { app } from "electron";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type { Note, Store, Task } from "../shared/model.js";
import type { CompanionInfo, MediaState } from "../shared/bridge.js";

/**
 * Phone companion: a small web server on the local network that serves a mobile page and a JSON API.
 * Every API request must carry the pairing token. Nothing leaves your Wi-Fi.
 */
const here = dirname(fileURLToPath(import.meta.url));
const PORT = 47820;
const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/manifest+json", ".webmanifest": "application/manifest+json" };

export interface CompanionHost {
  store(): Store;
  media(): MediaState;
  /** Apply a validated change to notes/tasks/calculations, persist it, and notify every window. */
  change(patch: Partial<Pick<Store, "notes" | "tasks" | "calculations">>): void;
  timer(action: "toggle" | "reset" | "skip" | "work" | "break"): void;
  mediaCommand(command: "toggle" | "next" | "previous"): void;
}

let server: Server | undefined, token = "", port = PORT, host: CompanionHost | undefined;
const streams = new Set<ServerResponse>();
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function tokenFile() { return join(app.getPath("userData"), "companion-token.txt"); }
function loadToken() {
  try { const saved = readFileSync(tokenFile(), "utf8").trim(); if (/^[A-Za-z0-9_-]{32,}$/.test(saved)) return saved; } catch { /* create below */ }
  const fresh = randomBytes(24).toString("base64url"); writeFileSync(tokenFile(), fresh); return fresh;
}
export function resetToken() { token = randomBytes(24).toString("base64url"); writeFileSync(tokenFile(), token); for (const stream of streams) stream.end(); streams.clear(); }

function lanAddresses() {
  const found: string[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) for (const entry of list || []) {
    if (entry.family !== "IPv4" || entry.internal || entry.address.startsWith("169.254.")) continue;
    if (/vethernet|virtual|vmware|vbox|hyper-v|wsl|docker|loopback/i.test(name)) continue;
    found.push(entry.address);
  }
  return found.sort((a, b) => score(b) - score(a));
}
const score = (ip: string) => ip.startsWith("192.168.") ? 3 : ip.startsWith("10.") ? 2 : ip.startsWith("172.") ? 1 : 0;

export async function companionInfo(): Promise<CompanionInfo> {
  if (!server) return { running: false, url: "", qr: "", addresses: [] };
  const addresses = lanAddresses(); const url = addresses[0] ? `http://${addresses[0]}:${port}/#${token}` : "";
  return { running: true, url, addresses, qr: url ? await QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: "#000000", light: "#ffffff" } }) : "" };
}

export function startCompanion(next: CompanionHost) {
  host = next; if (server) return Promise.resolve();
  token ||= loadToken();
  return new Promise<void>((resolve, reject) => {
    const candidate = createServer(route);
    candidate.once("error", error => { server = undefined; reject(Error((error as NodeJS.ErrnoException).code === "EADDRINUSE" ? `Port ${port} is already in use by another app.` : "The phone companion could not start.")); });
    candidate.listen(port, "0.0.0.0", () => { server = candidate; resolve(); });
  });
}
export function stopCompanion() { for (const stream of streams) stream.end(); streams.clear(); server?.close(); server = undefined; }

/** Called whenever the desktop state changes; coalesces bursts into one push. */
export function companionChanged() {
  if (!server || !streams.size) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { const data = `data: ${JSON.stringify(state())}\n\n`; for (const stream of streams) stream.write(data); }, 120);
}

function state() {
  const store = host!.store();
  return { notes: store.notes.map(({ sticky: _sticky, ...note }) => note), tasks: store.tasks, calculations: store.calculations.slice(0, 30), timer: store.timer, settings: { workMinutes: store.settings.workMinutes, breakMinutes: store.settings.breakMinutes, longBreakMinutes: store.settings.longBreakMinutes }, media: host!.media(), serverTime: Date.now() };
}

function authorized(request: IncomingMessage, url: URL) {
  const given = String(request.headers.authorization || "").replace(/^Bearer /, "") || url.searchParams.get("t") || "";
  const a = Buffer.from(given), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(body));
}
function readJson(request: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 2_000_000) { reject(Error("Too large")); request.destroy(); } else chunks.push(chunk); });
    request.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(Error("Invalid JSON")); } });
  });
}

async function route(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url || "/", "http://local");
  try {
    if (!url.pathname.startsWith("/api/")) return serveFile(url.pathname, response);
    if (!authorized(request, url)) return send(response, 401, { error: "This phone isn't paired. Scan the QR code in Island Desk settings again." });
    if (url.pathname === "/api/state" && request.method === "GET") return send(response, 200, state());
    if (url.pathname === "/api/events" && request.method === "GET") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      response.write(`data: ${JSON.stringify(state())}\n\n`); streams.add(response);
      const ping = setInterval(() => response.write(": ping\n\n"), 20000);
      request.on("close", () => { clearInterval(ping); streams.delete(response); });
      return;
    }
    if (url.pathname === "/api/action" && request.method === "POST") {
      apply(await readJson(request));
      return send(response, 200, state());
    }
    send(response, 404, { error: "Not found" });
  } catch (error) { send(response, 400, { error: (error as Error).message || "That change couldn't be saved." }); }
}

const uid = () => randomBytes(12).toString("hex");
function apply(action: any) {
  const store = host!.store(), now = Date.now();
  switch (action?.type) {
    case "note-save": {
      const input = action.note || {}; const existing = store.notes.find(note => note.id === input.id);
      const note: Note = { id: existing?.id || uid(), title: String(input.title ?? existing?.title ?? ""), body: String(input.body ?? existing?.body ?? ""), pinned: Boolean(input.pinned ?? existing?.pinned ?? false), checklist: Boolean(input.checklist ?? existing?.checklist ?? false), updatedAt: now, sticky: existing?.sticky ?? null };
      return host!.change({ notes: existing ? store.notes.map(item => item.id === note.id ? note : item) : [note, ...store.notes] });
    }
    case "note-delete": return host!.change({ notes: store.notes.filter(note => note.id !== action.id) });
    case "task-save": {
      const input = action.task || {}; const existing = store.tasks.find(task => task.id === input.id);
      const task: Task = { id: existing?.id || uid(), text: String(input.text ?? existing?.text ?? "").slice(0, 2000), done: Boolean(input.done ?? existing?.done ?? false), priority: ["low", "medium", "high"].includes(input.priority) ? input.priority : existing?.priority || "medium", due: String(input.due ?? existing?.due ?? ""), reminderAt: String(input.reminderAt ?? existing?.reminderAt ?? ""), notified: existing && input.reminderAt === undefined ? existing.notified : false, createdAt: existing?.createdAt || now };
      if (!task.text.trim()) throw Error("A task needs some text.");
      return host!.change({ tasks: existing ? store.tasks.map(item => item.id === task.id ? task : item) : [task, ...store.tasks] });
    }
    case "task-delete": return host!.change({ tasks: store.tasks.filter(task => task.id !== action.id) });
    case "calc-add": return host!.change({ calculations: [{ id: uid(), expression: String(action.expression).slice(0, 500), result: String(action.result).slice(0, 100), at: now }, ...store.calculations].slice(0, 200) });
    case "timer": if (!["toggle", "reset", "skip", "work", "break"].includes(action.action)) throw Error("Unknown timer action."); return host!.timer(action.action);
    case "media": if (!["toggle", "next", "previous"].includes(action.command)) throw Error("Unknown media command."); return host!.mediaCommand(action.command);
    default: throw Error("Unknown action.");
  }
}

function serveFile(pathname: string, response: ServerResponse) {
  const root = join(here, "../../dist");
  const relative = pathname === "/" ? "companion.html" : normalize(decodeURIComponent(pathname)).replace(/^[\\/]+/, "");
  const file = join(root, relative);
  const allowed = relative === "companion.html" || relative.startsWith("assets") || relative === "companion.webmanifest" || relative === "companion-icon.png";
  if (!allowed || !file.startsWith(root) || !existsSync(file)) { response.writeHead(404); response.end("Not found"); return; }
  response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": relative === "companion.html" ? "no-cache" : "max-age=3600", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
  response.end(readFileSync(file));
}
