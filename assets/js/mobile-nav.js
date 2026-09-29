/* 360 — Mobile bottom nav injection
   Drop this script at the end of <body> on every page.
   Renders a bottom tab bar on ≤600px, marks the active tab
   based on the current URL, and wires up the sidebar for the
   "More" tab. */
(function() {
  'use strict';

  const NAV_ITEMS = [
    {
      id: 'home',
      label: 'Home',
      href: '/',
      match: /^\/$/,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
    },
    {
      id: 'search',
      label: 'Search',
      href: '/search.html',
      match: /\/search/,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
    },
    {
      id: 'mail',
      label: 'Mail',
      href: '/360mail',
      match: /360mail/,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 8 10 6 10-6"/></svg>',
      badge: true
    },
    {
      id: 'ai',
      label: 'AI',
      href: '/ai',
      match: /\/ai\b/,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2a2 2 0 0 1 2 2v1a7 7 0 0 1 0 14v1a2 2 0 0 1-4 0v-1a7 7 0 0 1 0-14V4a2 2 0 0 1 2-2z"/><circle cx="12" cy="12" r="3"/></svg>'
    },
    {
      id: 'more',
      label: 'More',
      href: null, // opens sidebar
      match: null,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>'
    },
  ];

  const path = location.pathname;

  function buildNav() {
    const nav = document.createElement('nav');
    nav.id = 'mobile-nav';
    nav.setAttribute('aria-label', 'Main navigation');

    const inner = document.createElement('div');
    inner.className = 'mnav-inner';

    NAV_ITEMS.forEach(item => {
      const isActive = item.match && item.match.test(path);
      const tag = item.href ? 'a' : 'button';
      const el = document.createElement(tag);
      el.className = 'mnav-btn' + (isActive ? ' active' : '');
      if (item.href) {
        el.href = item.href;
        el.setAttribute('aria-current', isActive ? 'page' : undefined);
      }
      el.setAttribute('aria-label', item.label);
      el.innerHTML = item.svg + `<span>${item.label}</span>`;

      if (item.badge) {
        const badge = document.createElement('span');
        badge.className = 'mnav-badge';
        badge.id = 'mnav-mail-badge';
        badge.style.display = 'none';
        badge.setAttribute('aria-label', '0 unread messages');
        el.appendChild(badge);
      }

      if (!item.href) {
        // "More" — open the sidebar
        el.addEventListener('click', () => {
          const sb = document.getElementById('sidebar');
          if (sb) sb.classList.toggle('open');
          const ov = document.getElementById('overlay');
          if (ov) ov.classList.toggle('open');
        });
      }

      inner.appendChild(el);
    });

    nav.appendChild(inner);
    document.body.appendChild(nav);
  }

  // Update mail unread badge from Supabase if available
  function hookMailBadge() {
    if (typeof supabaseClient === 'undefined') return;
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      supabaseClient
        .from('inbox_readable')
        .select('id', { count: 'exact', head: true })
        .eq('owner_email', session.user.email)
        .eq('read', false)
        .eq('direction', 'in')
        .then(({ count }) => {
          const badge = document.getElementById('mnav-mail-badge');
          if (!badge) return;
          if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.setAttribute('aria-label', `${count} unread message${count > 1 ? 's' : ''}`);
            badge.style.display = 'flex';
          }
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { buildNav(); hookMailBadge(); });
  } else {
    buildNav(); hookMailBadge();
  }
})();
