// @ts-check
'use strict';

// The only calls the page can make into the desktop shell. Matches the
// TripLedgerNative interface in src/platform/desktop.ts.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tripLedgerNative', {
  list: () => ipcRenderer.invoke('store:list'),
  read: (key) => ipcRenderer.invoke('store:read', key),
  write: (key, text) => ipcRenderer.invoke('store:write', key, text),
  remove: (key) => ipcRenderer.invoke('store:remove', key),
  saveExport: (fileName, text) => ipcRenderer.invoke('export:save', fileName, text),
  openDataFolder: () => ipcRenderer.invoke('data:open'),
});
