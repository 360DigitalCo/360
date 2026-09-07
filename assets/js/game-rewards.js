/* 360 Rewards — game activity tracker + rich presence broadcaster.
 *
 * Rewards: every eligible game earns points for active play time.
 *   Server validates the session; client just tracks elapsed seconds.
 *
 * Rich presence: broadcasts { type:'game', slug, name } into the
 *   'presence-global' Realtime channel so chat shows "🎮 Playing X"
 *   under each user's name in the online list and members panel.
 *
 * BlockBlast has its own score-based banking — skip rewards there
 * but still broadcast presence so chat can show you're playing.
 */
(function () {
  'use strict';

  const path     = window.location.pathname.toLowerCase();
  const GAME_SLUG = decodeURIComponent(path.split('/').pop().replace(/\.html$/i, ''));
  const SKIP_REWARDS = path.endsWith('/blockblast.html');

  const SUPABASE_URL = 'https://wiswfpfsjiowtrdyqpxy.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3dmcGZzamlvd3RyZHlxcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzg4OTcsImV4cCI6MjA4MzkxNDg5N30.z_4FtM2c8UwgrRlafPYjolQuod4IoHQats95XHio1zM';

  /* Human-readable name map for rich presence display */
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
  };

  function showToast(msg) {
    let el = document.getElementById('gr-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gr-toast';
      Object.assign(el.style, {
        position: 'fixed', bottom: '24px', left: '50%',
        transform: 'translateX(-50%) translateY(12px)',
        background: 'rgba(17,20,29,.93)', color: '#fff',
        padding: '9px 18px', borderRadius: '999px',
        fontSize: '13px', zIndex: '99999',
        opacity: '0', pointerEvents: 'none',
        transition: 'opacity .2s, transform .2s',
        whiteSpace: 'nowrap',
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

  function boot() {
    if (!window.supabase?.createClient) return;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    let sessionId      = null;
    let activeSeconds  = 0;
    let lastTick       = Date.now();
    let visible        = !document.hidden;
    let lastInteraction = Date.now();
    let finishing      = false;
    let presenceChan   = null;
    let currentProfile = null;

    const tick = () => {
      const now = Date.now();
      const active = visible && (now - lastInteraction) <= 15000;
      if (active) activeSeconds += Math.max(0, Math.min(10, (now - lastTick) / 1000));
      lastTick = now;
    };

    /* ── Rich presence ── */
    async function trackPresence(playing) {
      if (!presenceChan || !currentProfile) return;
      const payload = {
        uid:        currentProfile.id,
        username:   currentProfile.username,
        avatar_url: currentProfile.avatar_url,
      };
      if (playing) {
        payload.current_activity = {
          type: 'game',
          slug: GAME_SLUG,
          name: GAME_NAMES[GAME_SLUG] || GAME_SLUG,
        };
      }
      try { await presenceChan.track(payload); } catch (_) {}
    }

    async function startPresence(profile) {
      currentProfile = profile;
      /* Join the same channel key chat.js uses so the state merges */
      presenceChan = client.channel('presence-global', {
        config: { presence: { key: profile.id } },
      });
      presenceChan.subscribe(async status => {
        if (status === 'SUBSCRIBED') await trackPresence(true);
      });
    }

    function stopPresence() {
      trackPresence(false).finally(() => {
        try { presenceChan?.unsubscribe(); } catch (_) {}
        presenceChan = null;
      });
    }

    /* ── Rewards ── */
    async function start() {
      try {
        const { data: { session } } = await client.auth.getSession();
        if (!session?.user) return;

        /* Fetch profile for presence */
        const { data: profile } = await client
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profile) startPresence(profile);

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
        const seconds = Math.floor(activeSeconds);
        try {
          const { data, error } = await client.rpc('finish_game_session', {
            p_session_id:       sessionId,
            p_activity_seconds: seconds,
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

    ['pointerdown', 'pointermove', 'keydown', 'touchstart'].forEach(type => {
      document.addEventListener(type, () => { lastInteraction = Date.now(); }, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      tick();
      visible = !document.hidden;
      lastTick = Date.now();
      if (!visible) finish();
      else if (!finishing) {
        /* Resumed — restart a fresh session */
        finishing = false;
        activeSeconds = 0;
        sessionId = null;
        start();
      }
    });

    window.addEventListener('pagehide', finish, { once: true });
    window.addEventListener('beforeunload', finish, { once: true });

    window.setInterval(tick, 5000);
    start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
