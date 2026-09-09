/* ============================================================
   auth.js — 360 auth state module
   Load this after the Supabase CDN, before any page script
   that needs the session. Gives every page a single ready
   promise instead of racing getSession() calls.

   Usage:
     await window.authReady;          — resolves with session|null
     window.authSession                — the current session (after ready)
     window.authSignOut()             — sign out from anywhere
   ============================================================ */
(function () {
  'use strict';

  // authReady resolves once onAuthStateChange fires INITIAL_SESSION.
  // At that point supabaseClient has the JWT attached and all
  // subsequent .from() calls will pass RLS correctly.
  window.authReady = new Promise(function (resolve) {
    const unsub = supabaseClient.auth.onAuthStateChange(function (event, session) {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        window.authSession = session;
        resolve(session);
        unsub.data?.subscription?.unsubscribe();
      }
    });
  });

  // Keep authSession current on token refresh and sign-out
  supabaseClient.auth.onAuthStateChange(function (event, session) {
    if (event === 'TOKEN_REFRESHED') window.authSession = session;
    if (event === 'SIGNED_OUT')      window.authSession = null;
  });

  // Global helper — signs out and goes home
  window.authSignOut = async function () {
    await supabaseClient.auth.signOut();
    sessionStorage.removeItem('360_auth_redirect');
    window.location.replace('/');
  };
})();
