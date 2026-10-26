// @ts-check
'use strict';

/**
 * Desktop shell (Windows and Linux). Shows the same web app as Android, and
 * does the file work for it: one .json file per trip in the app's data
 * folder. The page gets no Node access and no general file access — only
 * the handful of calls in preload.cjs.
 *
 * Data folder:
 *   Windows  %APPDATA%\Trip Ledger\data
 *   Linux    ~/.config/Trip Ledger/data
 * Uninstalling leaves it in place.
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const KEY_RE = /^[a-z0-9-]{1,80}$/;

const dataDir = () => path.join(app.getPath('userData'), 'data');

/** @param {unknown} key */
function fileFor(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key)) throw new Error('Invalid storage key');
  return path.join(dataDir(), `${key}.json`);
}

/** @param {string} file */
async function readIfExists(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') return null;
    throw e;
  }
}

async function listKeys() {
  await fs.mkdir(dataDir(), { recursive: true });
  const names = await fs.readdir(dataDir());
  const keys = new Set();
  for (const n of names) {
    if (n.endsWith('.json')) keys.add(n.slice(0, -5));
    // A .tmp with no .json beside it is a write that crashed before its rename.
    else if (n.endsWith('.json.tmp') && !names.includes(n.slice(0, -4))) keys.add(n.slice(0, -9));
  }
  return [...keys].filter((k) => KEY_RE.test(k));
}

/** @param {unknown} key */
async function readKey(key) {
  const file = fileFor(key);
  return (await readIfExists(file)) ?? (await readIfExists(`${file}.tmp`));
}

/**
 * Atomic: write a temporary file, flush it to disk, then rename it over the
 * old one. A crash leaves either the old file or the new, never half of one.
 * @param {unknown} key @param {unknown} text
 */
async function writeKey(key, text) {
  if (typeof text !== 'string') throw new Error('Invalid data');
  const file = fileFor(key);
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(`${file}.tmp`, text, { encoding: 'utf8', flush: true });
  await fs.rename(`${file}.tmp`, file);
}

/** @param {unknown} key */
async function removeKey(key) {
  const file = fileFor(key);
  await fs.rm(file, { force: true });
  await fs.rm(`${file}.tmp`, { force: true });
}

/** @type {BrowserWindow | null} */
let win = null;

/** @param {unknown} fileName @param {unknown} text */
async function saveExport(fileName, text) {
  if (typeof fileName !== 'string' || typeof text !== 'string' || !win) throw new Error('Invalid export');
  const result = await dialog.showSaveDialog(win, {
    title: 'Save trip file',
    defaultPath: path.join(app.getPath('documents'), path.basename(fileName)),
    filters: [
      { name: 'Trip Ledger file', extensions: ['json'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) return 'cancelled';
  await fs.writeFile(result.filePath, text, 'utf8');
  return 'saved';
}

function createWindow() {
  win = new BrowserWindow({
    width: 520,
    height: 900,
    minWidth: 360,
    minHeight: 560,
    title: 'Trip Ledger',
    backgroundColor: '#EFEFE9',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  // The app never navigates or opens windows; refuse anything that tries.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => {
    win = null;
  });

  const devServer = process.env.TRIP_LEDGER_DEV_URL;
  if (devServer) void win.loadURL(devServer);
  else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

// One copy at a time, so two windows never write the same trip file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    ipcMain.handle('store:list', () => listKeys());
    ipcMain.handle('store:read', (_e, key) => readKey(key));
    ipcMain.handle('store:write', (_e, key, text) => writeKey(key, text));
    ipcMain.handle('store:remove', (_e, key) => removeKey(key));
    ipcMain.handle('export:save', (_e, fileName, text) => saveExport(fileName, text));
    ipcMain.handle('data:open', async () => {
      await fs.mkdir(dataDir(), { recursive: true });
      await shell.openPath(dataDir());
    });
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
