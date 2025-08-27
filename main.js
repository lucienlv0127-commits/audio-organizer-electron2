const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fssync = require('fs');

// ★ 不再 require('music-metadata')，改用动态 import（兼容 ESM 包）
let _mm;
async function readDuration(fullPath) {
  try {
    if (!_mm) _mm = await import('music-metadata'); // ESM 动态加载
    const meta = await _mm.parseFile(fullPath, { duration: true });
    return meta.format.duration || 0;
  } catch {
    return 0;
  }
}

const SUPPORTED = new Set(['mp3','wav','m4a','aac','ogg','opus','flac']); // 稳定可播格式

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('renderer.html');
  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---- 持久化 ----
function statePath() { return path.join(app.getPath('userData'), 'state.json'); }
async function loadState() {
  try { return JSON.parse(await fs.readFile(statePath(), 'utf8')); } catch { return null; }
}
async function saveState(state) {
  await fs.mkdir(path.dirname(statePath()), { recursive: true });
  await fs.writeFile(statePath(), JSON.stringify(state, null, 2), 'utf8');
}

// ---- 扫描目录（读取文件名 + 时长）----
async function scanDir(root, keepMap) {
  const list = [];
  async function walk(dir) {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(full); continue; }
      const ext = e.name.split('.').pop()?.toLowerCase() || '';
      if (!SUPPORTED.has(ext)) continue;

      let durationSeconds = 0;
      try {
        if (fssync.statSync(full).size > 0) {
          durationSeconds = await readDuration(full); // ★ 这里用动态 import 的读取
        }
      } catch { /* 忽略异常，保持为 0 */ }

      const existed = keepMap.get(full);
      if (existed) {
        existed.fileName = e.name;
        existed.durationSeconds = durationSeconds || existed.durationSeconds || 0;
        list.push(existed);
      } else {
        list.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          path: full,
          fileName: e.name,
          durationSeconds,
          category: 'Uncategorized',
          tags: []
        });
      }
    }
  }
  await walk(root);
  return list.sort((a, b) => a.fileName.localeCompare(b.fileName, 'zh-Hans-CN', { numeric: true }));
}

// ---- IPC ----
ipcMain.handle('pick-folder', async () => {
  const ret = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return ret.canceled ? null : ret.filePaths[0];
});

ipcMain.handle('scan-folder', async (_evt, folderPath) => {
  if (!folderPath) return [];
  const prev = (await loadState()) || { items: [] };
  const keepMap = new Map(prev.items.map(it => [it.path, it]));
  const list = await scanDir(folderPath, keepMap);
  await saveState({ folderPath, items: list });
  return list;
});

ipcMain.handle('load-state', async () => {
  return await loadState();
});

ipcMain.handle('save-state', async (_evt, state) => {
  await saveState(state);
  return true;
});

ipcMain.handle('open-file', async (_evt, p) => { await shell.openPath(p); return true; });
ipcMain.handle('reveal-file', async (_evt, p) => { shell.showItemInFolder(p); return true; });

