'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/* window.electronGames — game detection events from the OS process list */
contextBridge.exposeInMainWorld('electronGames', {
  onGameStart(cb)  { ipcRenderer.on('game-start', (_e, g) => cb(g)); },
  onGameStop(cb)   { ipcRenderer.on('game-stop',  (_e, g) => cb(g)); },
  getCurrent()     { return ipcRenderer.sendSync('game-current'); },
  removeListener(ch, cb) { ipcRenderer.removeListener(ch, cb); },
});

/* window.electronRP — Discord Rich Presence via the local Discord client.
   Calls are fire-and-forget; errors are swallowed in the main process. */
contextBridge.exposeInMainWorld('electronRP', {
  setActivity(activity) { ipcRenderer.send('rp-set', activity); },
  clearActivity()       { ipcRenderer.send('rp-clear'); },
});
