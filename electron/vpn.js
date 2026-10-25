'use strict';

const { app, session, ipcMain, dialog } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PAC_URL = 'https://360-search.com/vpn/proxy.pac';
const stateFile = () => path.join(app.getPath('userData'), 'vpn.json');

let state = { app: false, system: false, prev: null, want: 'off', configured: false };

function load() {
  try { state = Object.assign(state, JSON.parse(fs.readFileSync(stateFile(), 'utf8'))); } catch (_) {}
}

function save() {
  try { fs.writeFileSync(stateFile(), JSON.stringify(state)); } catch (_) {}
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 8000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(String(stdout).trim());
    });
  });
}

async function has(cmd) {
  try { await run(process.platform === 'win32' ? 'where' : 'which', [cmd]); return true; } catch (_) { return false; }
}

const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

const drivers = {
  async win32() {
    return {
      name: 'Windows internet settings',
      async read() {
        let url = '';
        try {
          const out = await run('reg', ['query', REG_KEY, '/v', 'AutoConfigURL']);
          const m = out.match(/AutoConfigURL\s+REG_SZ\s+(.+)/);
          if (m) url = m[1].trim();
        } catch (_) {}
        return { url };
      },
      async set(url) {
        await run('reg', ['add', REG_KEY, '/v', 'AutoConfigURL', '/t', 'REG_SZ', '/d', url, '/f']);
        await run('reg', ['add', REG_KEY, '/v', 'AutoDetect', '/t', 'REG_DWORD', '/d', '0', '/f']).catch(() => {});
      },
      async clear(prev) {
        if (prev && prev.url) await run('reg', ['add', REG_KEY, '/v', 'AutoConfigURL', '/t', 'REG_SZ', '/d', prev.url, '/f']);
        else await run('reg', ['delete', REG_KEY, '/v', 'AutoConfigURL', '/f']).catch(() => {});
      },
    };
  },

  async darwin() {
    const list = async () => (await run('networksetup', ['-listallnetworkservices']))
      .split('\n').slice(1).map((s) => s.trim()).filter((s) => s && !s.startsWith('*'));
    return {
      name: 'macOS network services',
      async read() {
        const out = {};
        for (const svc of await list()) {
          try {
            const t = await run('networksetup', ['-getautoproxyurl', svc]);
            const u = (t.match(/URL:\s*(.*)/) || [])[1] || '';
            out[svc] = { url: u === '(null)' ? '' : u, on: /Enabled:\s*Yes/i.test(t) };
          } catch (_) {}
        }
        return out;
      },
      async set(url) {
        for (const svc of await list()) await run('networksetup', ['-setautoproxyurl', svc, url]).catch(() => {});
      },
      async clear(prev) {
        for (const svc of await list()) {
          const p = prev && prev[svc];
          if (p && p.on && p.url) await run('networksetup', ['-setautoproxyurl', svc, p.url]).catch(() => {});
          else await run('networksetup', ['-setautoproxystate', svc, 'off']).catch(() => {});
        }
      },
    };
  },

  async linux() {
    if (!(await has('gsettings'))) return null;
    const get = (k) => run('gsettings', ['get', 'org.gnome.system.proxy', k]).catch(() => '');
    return {
      name: 'GNOME proxy settings',
      async read() {
        return { mode: (await get('mode')).replace(/'/g, ''), url: (await run('gsettings', ['get', 'org.gnome.system.proxy', 'autoconfig-url']).catch(() => '')).replace(/'/g, '') };
      },
      async set(url) {
        await run('gsettings', ['set', 'org.gnome.system.proxy', 'autoconfig-url', url]);
        await run('gsettings', ['set', 'org.gnome.system.proxy', 'mode', 'auto']);
      },
      async clear(prev) {
        await run('gsettings', ['set', 'org.gnome.system.proxy', 'mode', (prev && prev.mode && prev.mode !== 'auto') ? prev.mode : 'none']);
        if (prev && prev.url) await run('gsettings', ['set', 'org.gnome.system.proxy', 'autoconfig-url', prev.url]).catch(() => {});
      },
    };
  },
};

async function driver() {
  const make = drivers[process.platform];
  return make ? make() : null;
}

async function applyApp(on) {
  const cfg = on ? { mode: 'pac_script', pacScript: PAC_URL } : { mode: 'system' };
  await session.defaultSession.setProxy(cfg);
  await session.defaultSession.closeAllConnections().catch(() => {});
  state.app = on;
}

async function detect() {
  const d = await driver().catch(() => null);
  return {
    platform: process.platform,
    pacUrl: PAC_URL,
    appProxy: true,
    systemProxy: !!d,
    systemLabel: d ? d.name : null,
    mobile: false,
  };
}

async function status() {
  return Object.assign(await detect(), { appEnabled: state.app, systemEnabled: state.system });
}

async function enable(scope) {
  if (scope === 'system') {
    const d = await driver();
    if (!d) throw new Error('System-wide setup is not supported on this device');
    if (!state.system) state.prev = await d.read().catch(() => null);
    await d.set(PAC_URL);
    state.system = true;
  }
  await applyApp(true);
  state.want = scope === 'system' ? 'system' : 'app';
  state.configured = true;
  save();
  return status();
}

async function disable() {
  if (state.system) {
    const d = await driver();
    if (d) await d.clear(state.prev).catch(() => {});
    state.system = false;
    state.prev = null;
  }
  await applyApp(false);
  state.want = 'off';
  state.configured = true;
  save();
  return status();
}

async function firstRunPrompt(win) {
  const d = await driver().catch(() => null);
  const buttons = d ? ['Whole device', 'Only 360', 'Not now'] : ['Only 360', 'Not now'];
  const { response } = await dialog.showMessageBox(win || null, {
    type: 'question',
    title: '360 VPN',
    message: 'Turn on 360 VPN?',
    detail: d
      ? 'Route traffic through the 360 proxy. You can protect this whole device or just the 360 app, and change it any time from the VPN page.'
      : 'Route traffic in the 360 app through the 360 proxy. You can change it any time from the VPN page.',
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true,
  });
  const choice = buttons[response];
  if (choice === 'Whole device') await enable('system').catch(() => {});
  else if (choice === 'Only 360') await enable('app').catch(() => {});
  else { state.configured = true; save(); }
}

async function init() {
  load();
  ipcMain.handle('vpn:status', () => status());
  ipcMain.handle('vpn:enable', (_e, scope) => enable(scope === 'system' ? 'system' : 'app'));
  ipcMain.handle('vpn:disable', () => disable());
  if (state.want === 'system') await enable('system').catch(() => applyApp(true));
  else if (state.want === 'app') await applyApp(true).catch(() => {});
}

function onReady(win) {
  if (!state.configured) setTimeout(() => firstRunPrompt(win).catch(() => {}), 1200);
}

async function shutdown() {
  if (state.system) {
    const d = await driver();
    if (d) await d.clear(state.prev).catch(() => {});
    state.system = false;
    state.prev = null;
    save();
  }
}

module.exports = { init, onReady, shutdown, status, enable, disable, PAC_URL };
