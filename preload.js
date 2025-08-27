const { contextBridge, ipcRenderer } = require('electron');

let pathToFileURL;
try { ({ pathToFileURL } = require('url')); } catch (_) {}

function fallbackFileUrl(p) {
  const raw = String(p || '');
  let s = raw.replace(/\\/g, '/');
  if (process.platform === 'win32' && !s.startsWith('/')) s = '/' + s;
  return 'file://' + encodeURI(s);
}

function toFileUrl(p) {
  const raw = String(p || '');
  try {
    if (typeof pathToFileURL === 'function') {
      return pathToFileURL(raw).href; // 自动对中文/《》等做百分号编码
    }
  } catch (_) {}
  return fallbackFileUrl(raw);
}

contextBridge.exposeInMainWorld('api', {
  pickFolder:  () => ipcRenderer.invoke('pick-folder'),
  scanFolder:  (folder) => ipcRenderer.invoke('scan-folder', folder),
  openFile:    (p) => ipcRenderer.invoke('open-file', p),
  revealFile:  (p) => ipcRenderer.invoke('reveal-file', p),
  loadState:   () => ipcRenderer.invoke('load-state'),
  saveState:   (st) => ipcRenderer.invoke('save-state', st),
  toFileUrl:   (p) => toFileUrl(p),
});