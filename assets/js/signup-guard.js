(function () {
  var URL_BASE = 'https://wiswfpfsjiowtrdyqpxy.supabase.co/functions/v1/signup-guard';
  var LOCK = '360_underage_lock';

  function locked() {
    try { return Number(localStorage.getItem(LOCK) || 0) > Date.now(); } catch (e) { return false; }
  }
  function lock() {
    try { localStorage.setItem(LOCK, String(Date.now() + 24 * 3600 * 1000)); } catch (e) {}
  }
  function ageOf(v) {
    var d = new Date(v);
    if (isNaN(d)) return null;
    var n = new Date(), a = n.getFullYear() - d.getFullYear(), m = n.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
    return a;
  }

  async function signUp(sb, payload) {
    var key = sb.supabaseKey;
    var res = await fetch(URL_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
      body: JSON.stringify(payload)
    });
    var out = {};
    try { out = await res.json(); } catch (e) {}
    if (!res.ok || out.error) return { data: null, error: { message: out.error || 'Sign up failed. Try again.' } };
    if (out.session && out.session.access_token) {
      await sb.auth.setSession({ access_token: out.session.access_token, refresh_token: out.session.refresh_token });
    }
    return { data: { user: out.user, session: out.session }, error: null };
  }

  window.SignupGuard = { signUp: signUp, locked: locked, lock: lock, ageOf: ageOf };
})();
