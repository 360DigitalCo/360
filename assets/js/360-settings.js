/**
 * 360 ACCOUNT SETTINGS SYNC  v2
 * ──────────────────────────────
 * Two responsibilities:
 *
 * 1. Settings360 API — any page can read/write named preferences that
 *    sync to the user's account (user_settings table, one JSONB blob
 *    per user, RLS-locked to its owner).  Falls back to localStorage
 *    when signed out so nothing breaks for anonymous visitors.
 *
 * 2. localStorage intercept — patches setItem/getItem for every known
 *    platform preference key so ALL existing code (main.js, cursor.js,
 *    wide.js, gallium.js, newtab.js, home.js, search.html …) gets
 *    cross-device sync automatically, with zero per-file changes.
 *    On page load, remote values are applied to localStorage so each
 *    file's own "read localStorage on init" path sees the right value.
 *
 * USAGE (same as v1 — existing call sites unchanged)
 *   Settings360.init(supabaseClient).then(() => { … });
 *   Settings360.get('theme', 'ocean');
 *   Settings360.set('theme', 'midnight');
 *   Settings360.onChange((key, value) => { … });
 */
(function (global) {
  "use strict";

  /* ── All localStorage keys that belong to platform preferences ──
     Mapped to their Settings360 canonical name.  Any key not in this
     map is left alone by the intercept (pinned apps, GCSE state, etc.) */
  const KEY_MAP = {
    /* Visual */
    "theme":              "theme",
    "darkMode":           "darkMode",
    "customBG":           "customBG",
    "bg":                 "customBG",      // settings.js alias
    "360_bold_font":      "boldFont",
    /* Glass modes */
    "360_wide_mode":      "wideMode",
    "360_gallium_mode":   "galliumMode",
    /* Cursor */
    "360_cursor_style":   "cursorStyle",
    "360_cursor_color":   "cursorColor",
    /* Search */
    "360_safe_search":    "safeSearch",
    "360_view_mode":      "viewMode",
    "360_ai_summary":     "aiSummary",
    /* New-tab */
    "360nt_dark":         "newtabDark",
    "360nt_unit":         "newtabUnit",
    /* Home / widgets */
    "tempUnit":           "tempUnit",
  };

  /* Reverse map: Settings360 key → primary localStorage key */
  const REVERSE_MAP = {};
  Object.entries(KEY_MAP).forEach(([lsKey, s360Key]) => {
    if (!REVERSE_MAP[s360Key]) REVERSE_MAP[s360Key] = lsKey;
  });

  const LOCAL_KEY  = "360_settings_cache";
  let sbClient     = null;
  let userId       = null;
  let cache        = {};
  let saveTimer    = null;
  const listeners  = [];
  let intercepting = false; // prevent re-entrancy during applyRemote

  /* ── localStorage helpers ── */
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function saveLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(cache)); } catch (e) {}
  }

  /* ── Apply remote values back into localStorage so every file's own
     "read localStorage on init" path sees the synced value ── */
  function applyRemoteToLocalStorage() {
    intercepting = true;
    try {
      Object.entries(REVERSE_MAP).forEach(([s360Key, lsKey]) => {
        if (!Object.prototype.hasOwnProperty.call(cache, s360Key)) return;
        const val = cache[s360Key];
        if (val === null || val === undefined) {
          try { localStorage.removeItem(lsKey); } catch (e) {}
          return;
        }
        /* Serialize the way each file expects it */
        let stored;
        if (typeof val === "boolean") {
          /* safeSearch, wideMode, galliumMode, boldFont, newtabDark, aiSummary, darkMode */
          stored = String(val);
          /* safe search uses "on"/"off" not "true"/"false" */
          if (lsKey === "360_safe_search") stored = val ? "on" : "off";
        } else {
          stored = String(val);
        }
        try { localStorage.setItem(lsKey, stored); } catch (e) {}
      });
    } finally {
      intercepting = false;
    }
  }

  /* ── Patch localStorage.setItem to intercept preference writes ── */
  const _origSet    = Storage.prototype.setItem;
  const _origGet    = Storage.prototype.getItem;
  const _origRemove = Storage.prototype.removeItem;

  Storage.prototype.setItem = function (key, value) {
    _origSet.call(this, key, value);
    /* Only intercept writes to window.localStorage, not sessionStorage,
       and only known preference keys, and not during our own applyRemote pass */
    if (this !== window.localStorage) return;
    if (intercepting) return;
    const s360Key = KEY_MAP[key];
    if (!s360Key) return;
    /* Parse back to the right JS type */
    let parsed = value;
    if (value === "true")  parsed = true;
    else if (value === "false") parsed = false;
    else if (key === "360_safe_search") parsed = (value === "on");
    set(s360Key, parsed);
  };

  Storage.prototype.removeItem = function (key) {
    _origRemove.call(this, key);
    if (this !== window.localStorage) return;
    if (intercepting) return;
    const s360Key = KEY_MAP[key];
    if (!s360Key) return;
    set(s360Key, null);
  };

  /* ── Supabase sync ── */
  async function init(supabaseClient_) {
    sbClient = supabaseClient_;
    cache    = loadLocal();

    if (!sbClient) return cache;

    const { data: { session } } = await sbClient.auth.getSession();
    userId = session?.user?.id || null;

    if (userId) await pullRemote();

    sbClient.auth.onAuthStateChange(async (_e, session) => {
      const newId = session?.user?.id || null;
      if (newId !== userId) {
        userId = newId;
        if (userId) await pullRemote();
      }
    });

    return cache;
  }

  async function pullRemote() {
    if (!sbClient || !userId) return;
    const { data, error } = await sbClient
      .from("user_settings")
      .select("settings")
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && data?.settings) {
      /* Remote is source of truth — merge local-only keys on top so
         anything set while signed out isn't silently lost */
      const merged = { ...data.settings, ...cache };
      cache = merged;
    }

    saveLocal();
    applyRemoteToLocalStorage();
    /* Let any registered listeners know everything may have changed */
    listeners.forEach(fn => {
      try { fn("*", cache); } catch (e) {}
    });
    pushRemote(); // push merged result back up
  }

  function pushRemote() {
    if (!sbClient || !userId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await sbClient.from("user_settings").upsert({
          user_id: userId,
          settings: cache,
          updated_at: new Date().toISOString(),
        });
      } catch (e) { /* best-effort */ }
    }, 400);
  }

  function get(key, fallback) {
    return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : fallback;
  }

  function set(key, value) {
    if (value === null || value === undefined) {
      delete cache[key];
    } else {
      cache[key] = value;
    }
    saveLocal();
    pushRemote();
    listeners.forEach(fn => { try { fn(key, value); } catch (e) {} });
  }

  function getAll() { return { ...cache }; }
  function onChange(fn) { listeners.push(fn); }

  /* ── Boot: apply whatever is in the local cache immediately (before
     any page script runs its own localStorage.getItem init) ── */
  cache = loadLocal();
  applyRemoteToLocalStorage();

  global.Settings360 = { init, get, set, getAll, onChange };

})(window);
