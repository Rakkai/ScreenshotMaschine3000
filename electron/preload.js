const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screenshotApp', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  saveConfig: (payload) => ipcRenderer.invoke('config:save', payload),
  startMonitor: () => ipcRenderer.invoke('monitor:start'),
  stopMonitor: () => ipcRenderer.invoke('monitor:stop'),
  restartMonitor: () => ipcRenderer.invoke('monitor:restart'),
  refreshContacts: () => ipcRenderer.invoke('contacts:refresh'),
  chooseFolder: (currentPath) => ipcRenderer.invoke('folder:choose', currentPath),
  openPath: (targetPath) => ipcRenderer.invoke('path:open', targetPath),
  onEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:event', listener);
    return () => ipcRenderer.removeListener('app:event', listener);
  },
});
