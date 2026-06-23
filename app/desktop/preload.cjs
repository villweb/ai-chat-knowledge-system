const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  getState: () => ipcRenderer.invoke("app:get-state"),
  chooseVault: () => ipcRenderer.invoke("vault:choose"),
  chooseImportFiles: (sourceApp) => ipcRenderer.invoke("import:choose-files", sourceApp),
  runImport: () => ipcRenderer.invoke("workflow:run-import"),
  runDaily: () => ipcRenderer.invoke("workflow:run-daily"),
  listAtoms: () => ipcRenderer.invoke("atoms:list"),
  updateAtom: (input) => ipcRenderer.invoke("atoms:update", input),
  listLogs: () => ipcRenderer.invoke("logs:list"),
  setConnectorEnabled: (input) => ipcRenderer.invoke("connectors:set-enabled", input),
  saveSessionConfig: (input) => ipcRenderer.invoke("settings:save-session-config", input)
});
