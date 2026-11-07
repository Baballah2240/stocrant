import { contextBridge, ipcRenderer } from "electron";
const invoke = (name: string, ...args: unknown[]) => ipcRenderer.invoke(name, ...args);
contextBridge.exposeInMainWorld("island", {
  snapshot: () => invoke("snapshot"), save: (patch: unknown) => invoke("content", patch), settings: (patch: unknown) => invoke("settings", patch),
  mode: (mode: string) => ipcRenderer.send("mode", mode), geometry: (rect: unknown) => ipcRenderer.send("geometry", rect),
  timer: (action: string) => invoke("timer", action), backupExport: () => invoke("export"), backupImport: () => invoke("import"),
  pick: (kind: string) => invoke("pick", kind), open: (shortcut: unknown) => invoke("open", shortcut), openData: () => invoke("open-data"), display: () => invoke("display-get"), setDisplay: (patch: unknown) => invoke("display-set", patch),
  stickyOpen: (id: string, at?: unknown) => invoke("sticky-open", id, at), stickyClose: (id: string) => invoke("sticky-close", id), notePatch: (id: string, patch: unknown) => invoke("note-patch", id, patch),
  media: () => invoke("media-get"), mediaCommand: (command: string) => invoke("media-command", command),
  companion: () => invoke("companion-info"), companionReset: () => invoke("companion-reset"),
  hide: () => ipcRenderer.send("hide"), quit: () => ipcRenderer.send("quit"),
  onEvent: (callback: (event: unknown) => void) => { const listener = (_event: unknown, payload: unknown) => callback(payload); ipcRenderer.on("desktop-event", listener); return () => ipcRenderer.removeListener("desktop-event", listener); },
});
