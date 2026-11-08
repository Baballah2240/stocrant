export type Tab = "notes" | "tasks" | "calculator" | "focus" | "tools" | "shortcuts" | "settings";
export type Mode = "compact" | "preview" | "expanded";
export interface StickyBounds { x: number; y: number; width: number; height: number }
export interface Note { id: string; title: string; body: string; pinned: boolean; checklist: boolean; updatedAt: number; sticky?: StickyBounds | null }
export interface Task { id: string; text: string; done: boolean; priority: "low" | "medium" | "high"; due: string; reminderAt: string; notified: boolean; createdAt: number }
export interface Calculation { id: string; expression: string; result: string; at: number }
export interface Shortcut { id: string; name: string; target: string; kind: "website" | "app" | "folder" }
export interface Settings { alwaysOnTop: boolean; launchAtStartup: boolean; reducedMotion: boolean; displayId: number | null; offsetX: number; offsetY: number; scale: number; globalShortcut: string; workMinutes: number; breakMinutes: number; longBreakMinutes: number; longBreakEvery: number; sound: boolean; notifications: boolean; dimOnHover: boolean; companion: boolean; weatherCity: string }
export interface Timer { phase: "work" | "break" | "longBreak"; running: boolean; endAt: number | null; remainingMs: number; sessions: number; completed: number; lastCompletedAt: number | null }
export interface Store { version: 1; notes: Note[]; tasks: Task[]; calculations: Calculation[]; shortcuts: Shortcut[]; settings: Settings; timer: Timer }
export interface DisplayInfo { id: number; label: string; primary: boolean; width: number; height: number }
export interface Snapshot { store: Store; displays: DisplayInfo[]; dataPath: string; startupSupported: boolean; version: string }
export const defaults = (): Store => ({ version: 1, notes: [], tasks: [], calculations: [], shortcuts: [], settings: { alwaysOnTop: true, launchAtStartup: false, reducedMotion: false, displayId: null, offsetX: 0, offsetY: 16, scale: 1, globalShortcut: "CommandOrControl+Shift+Space", workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4, sound: true, notifications: true, dimOnHover: true, companion: true, weatherCity: "" }, timer: { phase: "work", running: false, endAt: null, remainingMs: 25 * 60000, sessions: 0, completed: 0, lastCompletedAt: null } });
export const duration = (phase: Timer["phase"], settings: Settings) => (phase === "work" ? settings.workMinutes : phase === "break" ? settings.breakMinutes : settings.longBreakMinutes) * 60000;
export const remaining = (timer: Timer, now = Date.now()) => Math.max(0, timer.running && timer.endAt !== null ? timer.endAt - now : timer.remainingMs);
export function advanceTimer(store: Store, now = Date.now()): boolean {
  const timer = store.timer;
  if (!timer.running || timer.endAt === null || timer.endAt > now) return false;
  const finished = timer.phase;
  if (finished === "work") { timer.sessions++; timer.completed++; }
  timer.phase = finished === "work" ? timer.sessions % store.settings.longBreakEvery === 0 ? "longBreak" : "break" : "work";
  timer.running = false; timer.endAt = null; timer.remainingMs = duration(timer.phase, store.settings); timer.lastCompletedAt = now;
  return true;
}
export function timerAction(store: Store, action: "toggle" | "reset" | "skip" | "work" | "break", now = Date.now()) {
  const timer = store.timer;
  if (action === "toggle") {
    if (timer.running) { timer.remainingMs = remaining(timer, now); timer.running = false; timer.endAt = null; }
    else { timer.running = true; timer.endAt = now + timer.remainingMs; }
  } else {
    if (action === "skip") timer.phase = timer.phase === "work" ? "break" : "work";
    if (action === "work" || action === "break") timer.phase = action;
    timer.running = false; timer.endAt = null; timer.remainingMs = duration(timer.phase, store.settings);
  }
}
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const timeText = (ms: number) => { const seconds = Math.ceil(Math.max(0, ms) / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; };
export function insideRoundedRect(x: number, y: number, r: { x: number; y: number; width: number; height: number; radius: number }) {
  if (x < r.x || y < r.y || x > r.x + r.width || y > r.y + r.height) return false;
  const radius = Math.min(r.radius, r.width / 2, r.height / 2);
  const dx = Math.max(r.x + radius - x, 0, x - (r.x + r.width - radius));
  const dy = Math.max(r.y + radius - y, 0, y - (r.y + r.height - radius));
  return dx * dx + dy * dy <= radius * radius;
}

/** Backups are data, never executable configuration. Reject unknown shapes and oversized content. */
export function validateStore(input: unknown): Store {
  const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("The backup contains invalid data."); return value as Record<string, unknown>; };
  const text = (value: unknown, max: number) => { if (typeof value !== "string" || value.length > max || value.includes("\0")) throw Error("The backup contains invalid text."); return value; };
  const bool = (value: unknown) => { if (typeof value !== "boolean") throw Error("The backup contains an invalid option."); return value; };
  const number = (value: unknown, min: number, max: number) => { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw Error("The backup contains an invalid number."); return value; };
  const list = (value: unknown, max: number) => { if (!Array.isArray(value) || value.length > max) throw Error("The backup contains too many items."); return value.map(object); };
  const choice = <T extends string>(value: unknown, choices: readonly T[]): T => { if (!choices.includes(value as T)) throw Error("The backup contains an invalid choice."); return value as T; };
  const row = object(input); if (row.version !== 1) throw Error("This backup version is not supported.");
  const s = object(row.settings), t = object(row.timer);
  const settings: Settings = { alwaysOnTop: bool(s.alwaysOnTop), launchAtStartup: bool(s.launchAtStartup), reducedMotion: bool(s.reducedMotion), displayId: s.displayId === null ? null : number(s.displayId, -2147483648, 2147483647), offsetX: number(s.offsetX, -3000, 3000), offsetY: number(s.offsetY, 0, 2000), scale: number(s.scale, 0.8, 1.15), globalShortcut: text(s.globalShortcut, 100), workMinutes: number(s.workMinutes, 1, 180), breakMinutes: number(s.breakMinutes, 1, 60), longBreakMinutes: number(s.longBreakMinutes, 1, 120), longBreakEvery: number(s.longBreakEvery, 2, 12), sound: bool(s.sound), notifications: bool(s.notifications), dimOnHover: s.dimOnHover === undefined ? true : bool(s.dimOnHover), companion: s.companion === undefined ? true : bool(s.companion), weatherCity: s.weatherCity === undefined ? "" : text(s.weatherCity, 80) };
  if (!settings.globalShortcut.trim()) throw Error("A global shortcut is required.");
  const result: Store = { version: 1, settings,
    timer: { phase: choice(t.phase, ["work", "break", "longBreak"]), running: bool(t.running), endAt: t.endAt === null ? null : number(t.endAt, 0, 1e14), remainingMs: number(t.remainingMs, 0, 180 * 60000), sessions: number(t.sessions, 0, 1e9), completed: number(t.completed, 0, 1e9), lastCompletedAt: t.lastCompletedAt === null ? null : number(t.lastCompletedAt, 0, 1e14) },
    notes: list(row.notes, 10000).map(n => ({ id: text(n.id, 100), title: text(n.title, 300), body: text(n.body, 200000), pinned: bool(n.pinned), checklist: bool(n.checklist), updatedAt: number(n.updatedAt, 0, 1e14), sticky: n.sticky == null ? null : (b => ({ x: number(b.x, -20000, 20000), y: number(b.y, -20000, 20000), width: number(b.width, 160, 2000), height: number(b.height, 120, 2000) }))(object(n.sticky)) })),
    tasks: list(row.tasks, 10000).map(n => ({ id: text(n.id, 100), text: text(n.text, 2000), done: bool(n.done), priority: choice(n.priority, ["low", "medium", "high"]), due: text(n.due, 10), reminderAt: text(n.reminderAt, 30), notified: bool(n.notified), createdAt: number(n.createdAt, 0, 1e14) })),
    calculations: list(row.calculations, 200).map(n => ({ id: text(n.id, 100), expression: text(n.expression, 500), result: text(n.result, 100), at: number(n.at, 0, 1e14) })),
    shortcuts: list(row.shortcuts, 100).map(n => ({ id: text(n.id, 100), name: text(n.name, 100), target: text(n.target, 2000), kind: choice(n.kind, ["website", "app", "folder"]) })) };
  for (const key of ["notes", "tasks", "calculations", "shortcuts"] as const) if (new Set(result[key].map(item => item.id)).size !== result[key].length) throw Error("The backup contains duplicate item IDs.");
  if (result.timer.running && result.timer.endAt === null) throw Error("The backup timer is invalid.");
  return result;
}
