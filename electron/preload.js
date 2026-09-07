'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/* window.electronGames — exposes OS game detection to the renderer.
   Main process scans running processes every 5s via game-detector.js
   and sends IPC events when a known game starts or stops. */
contextBridge.exposeInMainWorld('electronGames', {
  onGameStart(cb)        { ipcRenderer.on('game-start', (_e, g) => cb(g)); },
  onGameStop(cb)         { ipcRenderer.on('game-stop',  (_e, g) => cb(g)); },
  getCurrent()           { return ipcRenderer.sendSync('game-current'); },
  removeListener(ch, cb) { ipcRenderer.removeListener(ch, cb); },
});
