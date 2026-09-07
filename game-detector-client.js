/**
 * 360 Game Detector Client
 *
 * Only runs inside the Electron app (window.electronGames is injected
 * by the preload). Listens for game-start / game-stop events from the
 * main process and broadcasts them into the 'presence-global' Supabase
 * Realtime channel so chat shows "🎮 Playing Fortnite" in real time —
 * exactly like the in-browser game-rewards.js rich presence, but for
 * any game running on the device.
 *
 * This script is loaded on every page via main.js <script> injection
 * so presence works regardless of which 360 page the user is on.
 */
(function () {
  'use strict';

  if (!window.electronGames) return; // not running in Electron

  const SUPABASE_URL = 'https://wiswfpfsjiowtrdyqpxy.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3dmcGZzamlvd3RyZHlxcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzg4OTcsImV4cCI6MjA4MzkxNDg5N30.z_4FtM2c8UwgrRlafPYjolQuod4IoHQats95XHio1zM';

  let sbClient      = null;
  let presenceChan  = null;
  let profile       = null;
  let currentGame   = null;
  let ready         = false;

  /* ── Boot ── */
  async function init() {
    if (!window.supabase?.createClient) return;
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: { session } } = await sbClient.auth.getSession();
    if (!session?.user) {
      /* Wait for sign-in then retry */
      sbClient.auth.onAuthStateChange(async (_e, sess) => {
        if (sess?.user && !ready) await setup(sess.user.id);
      });
      return;
    }

    await setup(session.user.id);

    /* Re-init on auth change */
    sbClient.auth.onAuthStateChange(async (_e, sess) => {
      if (sess?.user && sess.user.id !== profile?.id) {
        await teardown();
        await setup(sess.user.id);
      } else if (!sess?.user) {
        await teardown();
      }
    });
  }

  async function setup(userId) {
    const { data } = await sbClient
      .from('profiles')
      .select('id, username, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    if (!data) return;
    profile = data;
    ready   = true;

    /* Open a dedicated presence channel (keyed to user so it merges
       with the chat.js channel and game-rewards.js channel) */
    presenceChan = sbClient.channel('presence-global', {
      config: { presence: { key: userId } },
    });

    presenceChan.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;

      /* Check if a game was already running when the page loaded */
      const existing = window.electronGames.getCurrent();
      if (existing) {
        currentGame = existing;
        await trackPresence(existing);
      } else {
        await trackPresence(null);
      }
    });
  }

  async function teardown() {
    ready = false;
    profile = null;
    currentGame = null;
    try { await presenceChan?.unsubscribe(); } catch (_) {}
    presenceChan = null;
  }

  /* ── Presence tracking ── */
  async function trackPresence(game) {
    if (!presenceChan || !profile) return;
    const payload = {
      uid:        profile.id,
      username:   profile.username,
      avatar_url: profile.avatar_url,
    };
    if (game) {
      payload.current_activity = {
        type:     'game',
        slug:     game.slug,
        name:     game.name,
        platform: game.platform,
      };
    }
    try { await presenceChan.track(payload); } catch (_) {}
  }

  /* ── Event listeners from Electron main process ── */
  window.electronGames.onGameStart(async (game) => {
    currentGame = game;
    if (ready) await trackPresence(game);
  });

  window.electronGames.onGameStop(async (_game) => {
    currentGame = null;
    if (ready) await trackPresence(null);
  });

  /* ── Start ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
