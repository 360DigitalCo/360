'use strict';

/**
 * 360 Electron preload
 *
 * Exposes window.electronGames to the renderer (the 360 website)
 * via contextBridge — the only safe way to cross the sandbox boundary.
 *
 * API surface (intentionally minimal):
 *
 *   window.electronGames.onGameStart(cb)   — cb({ name, slug, platform })
 *   window.electronGames.onGameStop(cb)    — cb({ name, slug, platform })
 *   window.electronGames.getCurrent()      → { name, slug, platform } | null
 *   window.electronGames.removeListener(channel, cb)
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronGames', {
  onGameStart(cb) {
    ipcRenderer.on('game-start', (_event, game) => cb(game));
  },
  onGameStop(cb) {
    ipcRenderer.on('game-stop', (_event, game) => cb(game));
  },
  getCurrent() {
    /* Synchronous IPC — returns the current game or null immediately.
       Used on page load so presence is set even if you load chat
       while already in-game. */
    return ipcRenderer.sendSync('game-current');
  },
  removeListener(channel, cb) {
    ipcRenderer.removeListener(channel, cb);
  },
});
