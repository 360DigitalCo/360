'use strict';

const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const detector = require('./game-detector');

const BASE_URL = 'https://360-search.com';

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: '360',

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },

    backgroundColor: '#050816',
    show: false,
  });

  win.loadURL(BASE_URL);

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(BASE_URL)) {
      return { action: 'allow' };
    }

    shell.openExternal(url);

    return { action: 'deny' };
  });
}

/* ── Game detector ── */

function startDetector() {
  detector.on('game-start', (game) => {
    win?.webContents.send('game-start', {
      name: game.name,
      slug: game.slug,
      platform: game.platform,
    });
  });

  detector.on('game-stop', (game) => {
    win?.webContents.send('game-stop', {
      name: game.name,
      slug: game.slug,
      platform: game.platform,
    });
  });

  detector.start();
}

/* ── Current game IPC ── */

ipcMain.on('game-current', (event) => {
  const g = detector.current;

  event.returnValue = g
    ? {
        name: g.name,
        slug: g.slug,
        platform: g.platform,
      }
    : null;
});

/* ── Lifecycle ── */

app.whenReady().then(() => {
  createWindow();
  startDetector();
});

app.on('window-all-closed', () => {
  detector.stop();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
