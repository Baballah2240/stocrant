import { contextBridge, ipcRenderer } from "electron";
const invoke = (name: string, ...args: unknown[]) => ipcRenderer.invoke(name, ...args);
contextBridge.exposeInMainWorld("island", {
  snapshot: () => invoke("snapshot"), save: (patch: unknown) => invoke("content", patch), settings: (patch: unknown) => invoke("settings", patch),
  mode: (mode: string) => ipcRenderer.send("mode", mode), geometry: (rect: unknown) => ipcRenderer.send("geometry", rect),
  timer: (action: string) => invoke("timer", action), backupExport: () => invoke("export"), backupImport: () => invoke("import"),
  pick: (kind: string) => invoke("pick", kind), open: (shortcut: unknown) => invoke("open", shortcut), openData: () => invoke("open-data"), display: () => invoke("display-get"), setDisplay: (patch: unknown) => invoke("display-set", patch),
  hide: () => ipcRenderer.send("hide"), quit: () => ipcRenderer.send("quit"),
  onEvent: (callback: (event: unknown) => void) => { const listener = (_event: unknown, payload: unknown) => callback(payload); ipcRenderer.on("desktop-event", listener); return () => ipcRenderer.removeListener("desktop-event", listener); },
});
