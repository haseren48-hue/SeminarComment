const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('seminar', {
  state: () => ipcRenderer.invoke('state'),
  action: (action, value) => ipcRenderer.invoke('action', action, value),
  onState: callback => ipcRenderer.on('state', (_, state) => callback(state)),
  onComment: callback => ipcRenderer.on('comment', (_, text) => callback(text)),
  onClear: callback => ipcRenderer.on('clear', () => callback()),
});
