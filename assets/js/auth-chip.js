/* ── auth-chip.js — v3.6.0 ───────────────────────────────────────────────────
   Builds the signed-in user chip in the top-right corner of every 360 page.
   Replaces the old version that referenced profile.profile_picture (removed).
   Also exposes window.openAuth() so legacy callers keep working.
──────────────────────────────────────────────────────────────────────────────*/
(function () {
  'use strict';

  /* Redirect helper used by openAuth() and the Sign In / Sign Up buttons */
  function fromParam() {
    return encodeURIComponent(window.location.pathname + window.location.search);
  }

  window.openAuth = function (mode) {
    const dest = mode === 'signup'
      ? '/signup?from=' + fromParam()
      : '/signin?from=' + fromParam();
    window.location.href = dest;
  };

  /* Avatar: prefers avatar_url, falls back to generated initials */
  function buildAvatar(profile) {
    if (profile.avatar_url) {
      const img = document.createElement('img');
      img.src   = profile.avatar_url;
      img.alt   = profile.username || 'Avatar';
      img.style.cssText = 'width:28px;height:28px;border-radius:50%;object-fit:cover;';
      return img;
    }
    const el = document.createElement('div');
    const initial = (profile.username || profile.email || 'U').charAt(0).toUpperCase();
    el.textContent = initial;
    el.style.cssText = [
      'width:28px;height:28px;border-radius:50%;',
      'background:linear-gradient(135deg,#3b82f6,#8b5cf6);',
      'color:#fff;font-weight:800;font-size:13px;',
      'display:flex;align-items:center;justify-content:center;flex-shrink:0;',
    ].join('');
    return el;
  }

  async function buildUserChip() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('username,display_name,avatar_url,email,dev_suite,membership_tier')
      .eq('id', session.user.id)
      .single();
    if (!profile) return;

    /* Hide the sign-in / sign-up buttons that main.js may have shown */
    const signInBtn  = document.getElementById('signInBtn');
    const signUpBtn  = document.getElementById('signUpBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    if (signInBtn)  signInBtn.style.display  = 'none';
    if (signUpBtn)  signUpBtn.style.display  = 'none';
    if (signOutBtn) signOutBtn.style.display = '';

    /* Container */
    const wrap = document.createElement('div');
    wrap.id    = 'user-chip';
    wrap.style.cssText = [
      'position:relative;display:flex;align-items:center;gap:7px;',
      'padding:4px 10px 4px 5px;border-radius:99px;',
      'border:1px solid rgba(255,255,255,.1);cursor:pointer;',
      'background:rgba(255,255,255,.04);',
      'font-family:"Segoe UI",system-ui,sans-serif;',
      'transition:background .15s;user-select:none;',
    ].join('');
    wrap.addEventListener('mouseenter', () => { wrap.style.background = 'rgba(255,255,255,.08)'; });
    wrap.addEventListener('mouseleave', () => { wrap.style.background = 'rgba(255,255,255,.04)'; });

    wrap.appendChild(buildAvatar(profile));

    const name = document.createElement('span');
    name.textContent = profile.display_name || profile.username || 'Account';
    name.style.cssText = 'font-size:13px;font-weight:600;color:#e2e8f0;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    wrap.appendChild(name);

    /* Dropdown */
    const drop = document.createElement('div');
    drop.style.cssText = [
      'position:absolute;top:calc(100% + 8px);right:0;min-width:200px;',
      'background:#0d1225;border:1px solid rgba(255,255,255,.1);',
      'border-radius:10px;padding:6px;',
      'box-shadow:0 12px 36px rgba(0,0,0,.5);',
      'display:none;z-index:999;',
      'font-family:"Segoe UI",system-ui,sans-serif;',
    ].join('');

    function menuItem(label, href, icon = '') {
      const btn = document.createElement('a');
      btn.href  = href;
      btn.style.cssText = [
        'display:flex;align-items:center;gap:8px;',
        'padding:8px 10px;border-radius:7px;',
        'font-size:13px;font-weight:500;color:#e2e8f0;',
        'text-decoration:none;transition:background .12s;',
      ].join('');
      btn.innerHTML = `<span style="font-size:15px;width:18px;text-align:center;">${icon}</span>${label}`;
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,.06)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = ''; });
      return btn;
    }

    /* Header row in dropdown */
    const hdr = document.createElement('div');
    hdr.style.cssText = 'padding:8px 10px 10px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:4px;';
    hdr.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${profile.display_name || profile.username || 'Account'}
      </div>
      <div style="font-size:11.5px;color:#64748b;margin-top:1px;overflow:hidden;text-overflow:ellipsis;">
        ${profile.email || ''}
        ${profile.membership_tier ? `<span style="margin-left:6px;padding:1px 6px;border-radius:99px;background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.3);color:#c4b5fd;font-size:10px;font-weight:700;">${profile.membership_tier}</span>` : ''}
      </div>
    `;
    drop.appendChild(hdr);

    drop.appendChild(menuItem('My account',   '/account',  '👤'));
    drop.appendChild(menuItem('Settings',     '/account?tab=settings', '⚙️'));

    if (profile.dev_suite) {
      const devDivider = document.createElement('div');
      devDivider.style.cssText = 'height:1px;background:rgba(255,255,255,.06);margin:4px 0;';
      drop.appendChild(devDivider);
      drop.appendChild(menuItem('OAuth Apps',  '/oauth/apps',      '🔑'));
      drop.appendChild(menuItem('API keys',    '/oauth/apps#keys', '🛠️'));
    }

    const divider = document.createElement('div');
    divider.style.cssText = 'height:1px;background:rgba(255,255,255,.06);margin:4px 0;';
    drop.appendChild(divider);

    const signOut = document.createElement('button');
    signOut.style.cssText = [
      'width:100%;display:flex;align-items:center;gap:8px;',
      'padding:8px 10px;border-radius:7px;border:none;background:none;',
      'font-size:13px;font-weight:500;color:#f87171;cursor:pointer;',
      'text-align:left;font-family:inherit;transition:background .12s;',
    ].join('');
    signOut.innerHTML = '<span style="font-size:15px;width:18px;text-align:center;">→</span>Sign out';
    signOut.addEventListener('mouseenter', () => { signOut.style.background = 'rgba(239,68,68,.08)'; });
    signOut.addEventListener('mouseleave', () => { signOut.style.background = ''; });
    signOut.addEventListener('click', async (e) => {
      e.stopPropagation();
      await supabaseClient.auth.signOut();
      sessionStorage.removeItem('360_auth_redirect');
      window.location.reload();
    });
    drop.appendChild(signOut);

    wrap.appendChild(drop);

    /* Toggle */
    let open = false;
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      open = !open;
      drop.style.display = open ? 'block' : 'none';
    });
    document.addEventListener('click', () => {
      if (!open) return;
      open = false;
      drop.style.display = 'none';
    });

    /* Mount — replace existing chip if present */
    const existing = document.getElementById('user-chip');
    if (existing) existing.replaceWith(wrap);
    else {
      const container = document.querySelector('.auth-top-right') || document.body;
      container.appendChild(wrap);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUserChip);
  } else {
    buildUserChip();
  }
})();
