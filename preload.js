const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  exportAll: (payload) => ipcRenderer.invoke("export-all", payload),
  autocorrectText: (text) => ipcRenderer.invoke("autocorrect-text", text)
});
