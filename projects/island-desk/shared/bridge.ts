import type { Note, Store, Settings, Snapshot, Mode, Timer, Shortcut } from "./model.js";
export type ContentPatch = Partial<Pick<Store, "notes" | "tasks" | "calculations" | "shortcuts">>;
export type DesktopEvent = { type: "mode"; mode: Mode } | { type: "timer"; timer: Timer; completedPhase?: string } | { type: "replace"; snapshot: Snapshot } | { type: "saved" } | { type: "error"; message: string } | { type: "media"; media: MediaState };
export type MediaState = { active: false } | { active: true; title: string; artist: string; album: string; app: string; playing: boolean; canNext: boolean; canPrevious: boolean; canToggle: boolean; positionMs: number; durationMs: number; updatedAt: number; art: string };
export interface DesktopBridge {
  snapshot(): Promise<Snapshot>;
  save(patch: ContentPatch): Promise<void>;
  settings(patch: Partial<Settings>): Promise<Settings>;
  mode(mode: Mode): void;
  geometry(rect: { x: number; y: number; width: number; height: number; radius: number }): void;
  timer(action: "toggle" | "reset" | "skip" | "work" | "break"): Promise<Timer>;
  backupExport(): Promise<boolean>;
  backupImport(): Promise<boolean>;
  pick(kind: "app" | "folder"): Promise<string | null>;
  open(shortcut: Shortcut): Promise<void>;
  openData(): Promise<void>;
  display(): Promise<DisplayState>;
  setDisplay(patch: Partial<{ brightness: number; nightLight: boolean }>): Promise<DisplayState>;
  hide(): void;
  quit(): void;
  stickyOpen(id: string, at?: { x: number; y: number }): Promise<void>;
  stickyClose(id: string): Promise<void>;
  notePatch(id: string, patch: Partial<Pick<Note, "title" | "body" | "checklist">>): Promise<void>;
  media(): Promise<MediaState>;
  mediaCommand(command: "toggle" | "next" | "previous"): Promise<void>;
  companion(): Promise<CompanionInfo>;
  companionReset(): Promise<CompanionInfo>;
  onEvent(callback: (event: DesktopEvent) => void): () => void;
}
export interface DisplayState { brightness: number | null; nightLight: boolean | null }
export interface CompanionInfo { running: boolean; url: string; qr: string; addresses: string[] }
