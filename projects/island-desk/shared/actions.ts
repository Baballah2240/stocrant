import { advanceTimer, defaults, timerAction, type Calculation, type Note, type Settings, type Store, type Task, type Timer } from "./model.js";

/**
 * One set of rules for every change made outside the desktop window. The desktop companion server
 * and the phone launcher (when offline) both run these, so a change queued on the phone and replayed
 * later lands exactly as it would have live.
 */
export interface PocketData { notes: Note[]; tasks: Task[]; calculations: Calculation[]; timer: Timer; settings: Pick<Settings, "workMinutes" | "breakMinutes" | "longBreakMinutes" | "longBreakEvery"> }
export type Action =
  | { type: "note-save"; note: Partial<Note> & { id?: string } }
  | { type: "note-delete"; id: string }
  | { type: "task-save"; task: Partial<Task> & { id?: string } }
  | { type: "task-delete"; id: string }
  | { type: "calc-add"; expression: string; result: string; id?: string }
  | { type: "timer"; action: "toggle" | "reset" | "skip" | "work" | "break" }
  | { type: "media"; command: "toggle" | "next" | "previous" };

const validId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{6,100}$/.test(value);
export const emptyPocket = (): PocketData => { const base = defaults(); return { notes: [], tasks: [], calculations: [], timer: base.timer, settings: { workMinutes: base.settings.workMinutes, breakMinutes: base.settings.breakMinutes, longBreakMinutes: base.settings.longBreakMinutes, longBreakEvery: base.settings.longBreakEvery } }; };

export function reduce(data: PocketData, action: Action, now: number, newId: () => string): PocketData {
  switch (action?.type) {
    case "note-save": {
      const input = action.note || {}, existing = data.notes.find(note => note.id === input.id);
      const note: Note = { id: existing?.id || (validId(input.id) ? input.id! : newId()), title: String(input.title ?? existing?.title ?? "").slice(0, 300), body: String(input.body ?? existing?.body ?? "").slice(0, 200000), pinned: Boolean(input.pinned ?? existing?.pinned ?? false), checklist: Boolean(input.checklist ?? existing?.checklist ?? false), updatedAt: now, sticky: existing?.sticky ?? null };
      return { ...data, notes: existing ? data.notes.map(item => item.id === note.id ? note : item) : [note, ...data.notes] };
    }
    case "note-delete": return { ...data, notes: data.notes.filter(note => note.id !== action.id) };
    case "task-save": {
      const input = action.task || {}, existing = data.tasks.find(task => task.id === input.id);
      const priority = ["low", "medium", "high"].includes(input.priority as string) ? input.priority! : existing?.priority || "medium";
      const task: Task = { id: existing?.id || (validId(input.id) ? input.id! : newId()), text: String(input.text ?? existing?.text ?? "").slice(0, 2000), done: Boolean(input.done ?? existing?.done ?? false), priority, due: String(input.due ?? existing?.due ?? "").slice(0, 10), reminderAt: String(input.reminderAt ?? existing?.reminderAt ?? "").slice(0, 30), notified: existing && input.reminderAt === undefined ? existing.notified : false, createdAt: existing?.createdAt || now };
      if (!task.text.trim()) throw Error("A task needs some text.");
      return { ...data, tasks: existing ? data.tasks.map(item => item.id === task.id ? task : item) : [task, ...data.tasks] };
    }
    case "task-delete": return { ...data, tasks: data.tasks.filter(task => task.id !== action.id) };
    case "calc-add": {
      const id = validId(action.id) ? action.id! : newId();
      if (data.calculations.some(item => item.id === id)) return data;
      return { ...data, calculations: [{ id, expression: String(action.expression).slice(0, 500), result: String(action.result).slice(0, 100), at: now }, ...data.calculations].slice(0, 200) };
    }
    case "timer": {
      if (!["toggle", "reset", "skip", "work", "break"].includes(action.action)) throw Error("Unknown timer action.");
      const shadow = { timer: { ...data.timer }, settings: data.settings } as unknown as Store;
      advanceTimer(shadow, now); timerAction(shadow, action.action, now);
      return { ...data, timer: shadow.timer };
    }
    case "media": return data;
    default: throw Error("Unknown action.");
  }
}
/** Keep a running timer honest while the phone is on its own. */
export function tickPocket(data: PocketData, now: number): PocketData | null {
  const shadow = { timer: { ...data.timer }, settings: data.settings } as unknown as Store;
  return advanceTimer(shadow, now) ? { ...data, timer: shadow.timer } : null;
}
