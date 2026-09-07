'use strict';

const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const detector = require('./game-detector');


const DISCORD_CLIENT_ID =
  process.env.DISCORD_CLIENT_ID || '1546601013014827118';

let rpc = null;

function initDiscordRPC() {
  try {
    const DiscordRPC = require('discord-rpc');

    DiscordRPC.register(DISCORD_CLIENT_ID);

    rpc = new DiscordRPC.Client({
      transport: 'ipc',
    });

    rpc.on('ready', () => {
      console.log(
        '[discord-rpc] connected as',
        rpc.user?.username
      );
    });

    rpc.login({
      clientId: DISCORD_CLIENT_ID,
    }).catch(err => {
      console.warn(
        '[discord-rpc] login failed (Discord not running?):',
        err.message
      );

      rpc = null;
    });
  } catch (err) {
    /* discord-rpc not installed — skip silently */
    console.warn(
      '[discord-rpc] not available:',
      err.message
    );

    rpc = null;
  }
}

/* ── IPC handlers for renderer → Discord RP ── */

ipcMain.on('rp-set', (_event, activity) => {
  if (!rpc) return;

  rpc.setActivity({
    details: activity.details,
    state: activity.state,
    startTimestamp: activity.startTimestamp,
    largeImageKey: activity.largeImageKey || 'logo',
    largeImageText:
      activity.largeImageText || '360 Platform',
    smallImageKey: activity.smallImageKey,
    smallImageText: activity.smallImageText,
    buttons: activity.buttons,
    instance: false,
  }).catch(() => {});
});

ipcMain.on('rp-clear', () => {
  if (!rpc) return;

  rpc.clearActivity().catch(() => {});
});

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
      return {
        action: 'allow',
      };
    }

    shell.openExternal(url);

    return {
      action: 'deny',
    };
  });
}

/* ── Game detector → renderer + Discord ── */

function startDetector() {
  detector.on('game-start', (game) => {
    /* Update Discord RP for detected desktop game */
    if (rpc) {
      rpc.setActivity({
        details: `Playing ${game.name}`,
        state: game.platform || 'PC',
        startTimestamp: Date.now(),
        largeImageKey: 'logo',
        largeImageText: '360 Platform',
        instance: false,
      }).catch(() => {});
    }

    win?.webContents.send('game-start', {
      name: game.name,
      slug: game.slug,
      platform: game.platform,
    });
  });

  detector.on('game-stop', (game) => {
    if (rpc) {
      rpc.clearActivity().catch(() => {});
    }

    win?.webContents.send('game-stop', {
      name: game.name,
      slug: game.slug,
      platform: game.platform,
    });
  });

  detector.start();
}

/* Sync IPC: renderer asks for current game on page load */

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
  initDiscordRPC();
  createWindow();
  startDetector();
});

app.on('window-all-closed', () => {
  detector.stop();

  if (rpc) {
    rpc.destroy().catch(() => {});
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
