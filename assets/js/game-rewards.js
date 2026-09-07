/* 360 Rewards + Rich Presence — game-rewards.js
 *
 * Runs inside each 360 game page. Does two things:
 *
 *  1. REWARDS  — tracks active play time and awards points via
 *                Supabase RPCs (start_game_session / finish_game_session).
 *
 *  2. PRESENCE — broadcasts { type:'game', slug, name } into the
 *                'presence-global' Supabase Realtime channel so
 *                360 Chat shows "🎮 Playing X" under your name.
 */
(function () {
  'use strict';

  const GAME_SLUG = decodeURIComponent(
    window.location.pathname.split('/').pop().replace(/\.html$/i, '')
  );
  const SKIP_REWARDS = /blockblast/i.test(GAME_SLUG);

  const SUPABASE_URL = 'https://wiswfpfsjiowtrdyqpxy.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3dmcGZzamlvd3RyZHlxcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzg4OTcsImV4cCI6MjA4MzkxNDg5N30.z_4FtM2c8UwgrRlafPYjolQuod4IoHQats95XHio1zM';

  const GAME_NAMES = {
    'minesweeper':            'Minesweeper',
    'starfallrng':            'Starfall RNG',
    'PenguinKnockout':        'Penguin Knockout',
    '360Fish':                '360 Fish',
    'NightfallRNG':           'Nightfall RNG',
    'BlockBlast':             'Block Blast',
    'Blockblast':             'Block Blast',
    'jjkrng':                 'JJK RNG',
    'epochera':               'Epoch Era',
    'spaceGlider':            'Space Glider',
    'untitledMonsterFighter': 'Monster Fighter',
    'nyc_dream':              'NYC Dream',
    'UnwantedProblems':       'Unwanted Problems',
    'starfallrngultimate':    'Starfall RNG Ultimate',
    'BlitzTowerDefense':      'Blitz Tower Defense',
    'StarBlasted':            'Star Blasted',
    'CQBSIM':                 'CQBSIM',
    'angelrng':               'Angel RNG',
    'STARFALL_Ωjar':          'STARFALL_Ω',
  };

  function getGameName(slug) {
    if (GAME_NAMES[slug]) return GAME_NAMES[slug];
    const lo = slug.toLowerCase();
    for (const [k, v] of Object.entries(GAME_NAMES)) {
      if (k.toLowerCase() === lo) return v;
    }
    return slug;
  }

  const GAME_NAME = getGameName(GAME_SLUG);

  function showToast(msg) {
    let el = document.getElementById('gr-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gr-toast';
      Object.assign(el.style, {
        position:'fixed', bottom:'24px', left:'50%',
        transform:'translateX(-50%) translateY(12px)',
        background:'rgba(17,20,29,.93)', color:'#fff',
        padding:'9px 18px', borderRadius:'999px',
        fontSize:'13px', zIndex:'99999',
        opacity:'0', pointerEvents:'none',
        transition:'opacity .2s, transform .2s',
        whiteSpace:'nowrap',
      });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(12px)';
    }, 3500);
  }

  /* ── Supabase presence ── */
  let presenceChan = null;
  let profile      = null;

  async function startPresence(client) {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;
    const { data } = await client
      .from('profiles')
      .select('id, username, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    if (!data) return;
    profile = data;

    presenceChan = client.channel('presence-global', {
      config: { presence: { key: profile.id } },
    });
    presenceChan.subscribe(async s => {
      if (s === 'SUBSCRIBED') await trackPresence(true);
    });
  }

  async function trackPresence(playing) {
    if (!presenceChan || !profile) return;
    const payload = {
      uid: profile.id,
      username: profile.username,
      avatar_url: profile.avatar_url,
    };
    if (playing) {
      payload.current_activity = { type: 'game', slug: GAME_SLUG, name: GAME_NAME };
    }
    try { await presenceChan.track(payload); } catch (_) {}
  }

  function stopPresence() {
    trackPresence(false).finally(() => {
      try { presenceChan?.unsubscribe(); } catch (_) {}
      presenceChan = null;
    });
  }

  /* ── Boot ── */
  function boot() {
    if (!window.supabase?.createClient) return;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    let sessionId     = null;
    let activeSeconds = 0;
    let lastTick      = Date.now();
    let visible       = !document.hidden;
    let lastInteract  = Date.now();
    let finishing     = false;

    const tick = () => {
      const now = Date.now();
      if (visible && (now - lastInteract) <= 15000) {
        activeSeconds += Math.max(0, Math.min(10, (now - lastTick) / 1000));
      }
      lastTick = now;
    };

    async function start() {
      try {
        const { data: { session } } = await client.auth.getSession();
        if (!session?.user) return;
        await startPresence(client);
        if (!SKIP_REWARDS) {
          const { data, error } = await client.rpc('start_game_session', { p_game_slug: GAME_SLUG });
          if (!error) sessionId = data;
        }
      } catch (_) {}
    }

    async function finish() {
      if (finishing) return;
      finishing = true;
      tick();
      stopPresence();
      if (!SKIP_REWARDS && sessionId) {
        try {
          const { data, error } = await client.rpc('finish_game_session', {
            p_session_id:       sessionId,
            p_activity_seconds: Math.floor(activeSeconds),
          });
          if (!error && data) {
            const row = Array.isArray(data) ? data[0] : data;
            if (row && Number(row.points_awarded) > 0) {
              showToast(`+${Number(row.points_awarded).toLocaleString()} Rewards Points earned`);
            }
          }
        } catch (_) {}
        sessionId = null;
      }
    }

    ['pointerdown','pointermove','keydown','touchstart'].forEach(t => {
      document.addEventListener(t, () => { lastInteract = Date.now(); }, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      tick();
      visible = !document.hidden;
      lastTick = Date.now();
      if (!visible) {
        finish();
      } else {
        finishing = false; activeSeconds = 0; sessionId = null;
        start();
      }
    });

    window.addEventListener('pagehide', finish, { once: true });
    window.addEventListener('beforeunload', finish, { once: true });
    setInterval(tick, 5000);
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
