// The only bridge between the (sandboxed) UI and the app's powers. contextIsolation is on and
// nodeIntegration is off, so the renderer can ONLY call these named, typed channels.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agent", {
  // status / core
  getStatus: () => ipcRenderer.invoke("agent:getStatus"),
  scanNow: () => ipcRenderer.invoke("agent:scanNow"),
  pickWatchFolder: () => ipcRenderer.invoke("agent:pickWatchFolder"),
  openOutputFolder: () => ipcRenderer.invoke("agent:openOutputFolder"),
  openDeck: (dir) => ipcRenderer.invoke("agent:openDeck", dir),
  openExternal: (url) => ipcRenderer.invoke("agent:openExternal", url),
  // key / settings
  setApiKey: (key) => ipcRenderer.invoke("agent:setApiKey", key),
  clearApiKey: () => ipcRenderer.invoke("agent:clearApiKey"),
  setSetting: (patch) => ipcRenderer.invoke("agent:setSetting", patch),
  // views
  getBrief: () => ipcRenderer.invoke("agent:getBrief"),
  getCourses: () => ipcRenderer.invoke("agent:getCourses"),
  // portals
  savePortal: (p) => ipcRenderer.invoke("agent:savePortal", p),
  removePortal: (name) => ipcRenderer.invoke("agent:removePortal", name),
  connectPortal: (name) => ipcRenderer.invoke("agent:connectPortal", name),
  scanPortal: (name) => ipcRenderer.invoke("agent:scanPortal", name),
  syncAll: () => ipcRenderer.invoke("agent:syncAll"),
  // live updates
  onActivity: (cb) => {
    const handler = (_e, entry) => cb(entry);
    ipcRenderer.on("agent:activity", handler);
    return () => ipcRenderer.removeListener("agent:activity", handler);
  },
});
