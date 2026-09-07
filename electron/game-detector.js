'use strict';

/**
 * 360 Game Detector
 *
 * Polls the OS process list every POLL_MS milliseconds, matches running
 * executables against a known game database, and emits events:
 *
 *   detector.on('game-start', { name, slug, platform, exe })
 *   detector.on('game-stop',  { name, slug, platform, exe })
 *
 * Works on Windows (tasklist), macOS (ps), Linux (ps).
 * Runs entirely in the main process — never touches the renderer.
 */

const { execFile } = require('child_process');
const { EventEmitter } = require('events');

const POLL_MS = 5000;

/* ── Game database ────────────────────────────────────────────────────
   exe: the process name as it appears in tasklist/ps output (no path).
   Windows: include .exe suffix. macOS/Linux: omit it or add both.
   slug: used as the activity key in presence.
   platform: label shown in chat ("Steam", "Epic", "Roblox", …).
   ──────────────────────────────────────────────────────────────────── */
const GAMES = [
  /* ── Roblox ── */
  { exe: ['RobloxPlayerBeta.exe', 'RobloxPlayer.exe', 'RobloxPlayerLauncher.exe'], name: 'Roblox',           slug: 'roblox',          platform: 'Roblox' },

  /* ── Minecraft ── */
  { exe: ['javaw.exe', 'java'],                                                    name: 'Minecraft',        slug: 'minecraft',       platform: 'Minecraft', cmdMatch: 'minecraft' },
  { exe: ['Minecraft.exe', 'MinecraftLauncher.exe'],                               name: 'Minecraft',        slug: 'minecraft',       platform: 'Minecraft' },

  /* ── Fortnite ── */
  { exe: ['FortniteClient-Win64-Shipping.exe', 'FortniteClient-Mac-Shipping'],     name: 'Fortnite',         slug: 'fortnite',        platform: 'Epic Games' },

  /* ── Valorant ── */
  { exe: ['VALORANT-Win64-Shipping.exe'],                                          name: 'Valorant',         slug: 'valorant',        platform: 'Riot' },

  /* ── League of Legends ── */
  { exe: ['League of Legends.exe', 'LeagueClient.exe', 'League of Legends'],      name: 'League of Legends',slug: 'league',          platform: 'Riot' },

  /* ── CS2 / CS:GO ── */
  { exe: ['cs2.exe', 'csgo.exe', 'cs2'],                                          name: 'Counter-Strike 2', slug: 'cs2',             platform: 'Steam' },

  /* ── Apex Legends ── */
  { exe: ['r5apex.exe', 'r5apex'],                                                 name: 'Apex Legends',     slug: 'apex',            platform: 'EA' },

  /* ── Call of Duty ── */
  { exe: ['cod.exe', 'BlackOpsColdWar.exe', 'ModernWarfare.exe', 'cod'],          name: 'Call of Duty',     slug: 'cod',             platform: 'Battle.net' },

  /* ── Overwatch 2 ── */
  { exe: ['Overwatch.exe', 'Overwatch'],                                           name: 'Overwatch 2',      slug: 'overwatch',       platform: 'Battle.net' },

  /* ── GTA V ── */
  { exe: ['GTA5.exe', 'PlayGTAV.exe', 'GTA5'],                                   name: 'GTA V',            slug: 'gtav',            platform: 'Steam / Rockstar' },

  /* ── Genshin Impact ── */
  { exe: ['GenshinImpact.exe', 'GenshinImpact'],                                  name: 'Genshin Impact',   slug: 'genshin',         platform: 'HoYoverse' },

  /* ── Honkai: Star Rail ── */
  { exe: ['StarRail.exe', 'StarRail'],                                             name: 'Honkai: Star Rail', slug: 'starrail',       platform: 'HoYoverse' },

  /* ── Elden Ring ── */
  { exe: ['eldenring.exe', 'eldenring'],                                           name: 'Elden Ring',       slug: 'eldenring',       platform: 'Steam' },

  /* ── Rocket League ── */
  { exe: ['RocketLeague.exe', 'RocketLeague'],                                     name: 'Rocket League',    slug: 'rocketleague',    platform: 'Epic Games' },

  /* ── FIFA / EA Sports FC ── */
  { exe: ['FIFA23.exe','FIFA24.exe','FC24.exe','FC25.exe','EASFC25.exe'],          name: 'EA Sports FC',     slug: 'easfc',           platform: 'EA' },

  /* ── Dota 2 ── */
  { exe: ['dota2.exe', 'dota2'],                                                   name: 'Dota 2',           slug: 'dota2',           platform: 'Steam' },

  /* ── Warframe ── */
  { exe: ['Warframe.x64.exe', 'Warframe.exe', 'Warframe'],                        name: 'Warframe',         slug: 'warframe',        platform: 'Steam' },

  /* ── Terraria ── */
  { exe: ['Terraria.exe', 'Terraria'],                                             name: 'Terraria',         slug: 'terraria',        platform: 'Steam' },

  /* ── Among Us ── */
  { exe: ['Among Us.exe', 'Among Us'],                                             name: 'Among Us',         slug: 'amongus',         platform: 'Steam' },

  /* ── Stardew Valley ── */
  { exe: ['StardewValley.exe', 'StardewValley'],                                  name: 'Stardew Valley',   slug: 'stardew',         platform: 'Steam' },

  /* ── Hollow Knight ── */
  { exe: ['hollow_knight.exe', 'hollow_knight'],                                   name: 'Hollow Knight',    slug: 'hollowknight',    platform: 'Steam' },

  /* ── Cyberpunk 2077 ── */
  { exe: ['Cyberpunk2077.exe', 'Cyberpunk2077'],                                  name: 'Cyberpunk 2077',   slug: 'cyberpunk',       platform: 'Steam / GOG' },

  /* ── Palworld ── */
  { exe: ['Pal-Win64-Shipping.exe'],                                               name: 'Palworld',         slug: 'palworld',        platform: 'Steam' },

  /* ── Steam itself (fallback when game isn't listed) ── */
  { exe: ['steam.exe', 'steam'],                                                   name: 'Steam',            slug: 'steam',           platform: 'Steam', fallback: true },
];

/* Flatten to a fast lookup map: lowercase exe → game entry */
const EXE_MAP = new Map();
for (const game of GAMES) {
  for (const exe of game.exe) {
    EXE_MAP.set(exe.toLowerCase(), game);
  }
}


/* ── OS process scanner ─────────────────────────────────────────────── */

function scanWindows() {
  return new Promise((resolve) => {
    /* tasklist /FO CSV /NH gives: "name.exe","pid","session","#","mem" */
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 4000 }, (err, stdout) => {
      if (err) return resolve([]);
      const names = [];
      for (const line of stdout.split('\n')) {
        const m = line.match(/^"([^"]+)"/);
        if (m) names.push(m[1].toLowerCase());
      }
      resolve(names);
    });
  });
}

function scanUnix() {
  return new Promise((resolve) => {
    /* ps -eo comm= gives just the command name, one per line */
    execFile('ps', ['-eo', 'comm='], { timeout: 4000 }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(stdout.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean));
    });
  });
}

function scanProcesses() {
  return process.platform === 'win32' ? scanWindows() : scanUnix();
}


/* ── Detector ───────────────────────────────────────────────────────── */

class GameDetector extends EventEmitter {
  constructor() {
    super();
    this._current = null; // currently detected game entry
    this._timer   = null;
  }

  start() {
    if (this._timer) return;
    this._poll();
    this._timer = setInterval(() => this._poll(), POLL_MS);
  }

  stop() {
    clearInterval(this._timer);
    this._timer = null;
    if (this._current) {
      const stopped = this._current;
      this._current = null;
      this.emit('game-stop', stopped);
    }
  }

  get current() { return this._current; }

  async _poll() {
    try {
      const procs = await scanProcesses();
      let found = null;

      for (const proc of procs) {
        const game = EXE_MAP.get(proc);
        if (game && !game.fallback) { found = game; break; }
        if (game && game.fallback && !found) found = game; // use steam only if nothing better
      }

      const prevSlug = this._current?.slug || null;
      const nextSlug = found?.slug || null;

      if (nextSlug !== prevSlug) {
        if (this._current) this.emit('game-stop', this._current);
        this._current = found || null;
        if (this._current) this.emit('game-start', this._current);
      }
    } catch (_) {}
  }
}

module.exports = new GameDetector();
