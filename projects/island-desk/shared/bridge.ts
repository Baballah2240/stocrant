import type { TranslationRequest, TranslationResult } from "./translation.js";
import type { Note, Store, Settings, Snapshot, Mode, Timer, Shortcut } from "./model.js";
export type ContentPatch = Partial<Pick<Store, "notes" | "tasks" | "calculations" | "shortcuts">>;
export interface BatteryState { level: number; charging: boolean; onAC: boolean }
export type CaptureKind = "note" | "task";
export type DesktopEvent = { type: "capture"; kind: CaptureKind } | { type: "battery"; battery: BatteryState | null } | { type: "mode"; mode: Mode } | { type: "timer"; timer: Timer; completedPhase?: string } | { type: "replace"; snapshot: Snapshot } | { type: "saved" } | { type: "error"; message: string } | { type: "media"; media: MediaState } | { type: "phone"; phone: PhoneFeed } | { type: "activity"; activity: Activity } | { type: "stats"; stats: Stats } | { type: "weather"; weather: Weather | null };
/** Notifications forwarded by the paired phone over Wi-Fi. Kept in memory only. */
export interface Stats { cpu: number; ramUsed: number; ramTotal: number; disk: number | null; gpu: number | null; up: number | null; down: number | null }
export interface Weather { temp: number; code: number; isDay: boolean; city: string; at: number }
export interface PhoneItem { key: string; app: string; title: string; text: string; time: number; icon: string }
export interface PhoneFeed { connected: boolean; device: string; items: PhoneItem[]; at: number }
/** Something the island should briefly announce, Dynamic Island style. */
export interface Activity { kind: "music" | "phone" | "timer" | "reminder" | "connected"; title: string; text: string; icon?: string }
export type MediaState = { active: false } | { active: true; title: string; artist: string; album: string; app: string; playing: boolean; canNext: boolean; canPrevious: boolean; canToggle: boolean; positionMs: number; durationMs: number; updatedAt: number; art: string };
export interface DesktopBridge {
  battery(): Promise<BatteryState | null>;
  translate(request: TranslationRequest): Promise<TranslationResult>;
  cancelTranslation(): Promise<void>;
  copyText(text: string): Promise<void>;
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
  phone(): Promise<PhoneFeed>;
  weather(): Promise<Weather | null>;
  watchStats(on: boolean): void;
  mediaCommand(command: "toggle" | "next" | "previous"): Promise<void>;
  companion(): Promise<CompanionInfo>;
  companionReset(): Promise<CompanionInfo>;
  onEvent(callback: (event: DesktopEvent) => void): () => void;
}
export interface DisplayState { brightness: number | null; nightLight: boolean | null }
export interface CompanionInfo { running: boolean; url: string; qr: string; addresses: string[] }
