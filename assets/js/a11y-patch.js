/* 360 — Accessibility patch
   Fixes ScoutForge: unnamed buttons (74/100 score), unlabeled forms,
   missing alt text. Runs once after DOM ready. Idempotent — safe
   to include on every page. */
(function() {
  'use strict';

  function patch() {
    // ── Buttons with only icon content ───────────────────────
    const LABEL_MAP = {
      settingsBtn:       'Settings',
      sidebarToggle:     'Open navigation menu',
      darkToggle:        'Toggle dark mode',
      installBtn:        'Install 360 app',
      signInBtn:         'Sign in',
      signUpBtn:         'Sign up',
      signOutBtn:        'Sign out',
      bgUpload:          'Upload background image',
      bgUrlBtn:          'Apply background image URL',
      bgResetBtn:        'Reset background image',
      cursorColorReset:  'Reset cursor color to default',
      tempUnitBtn:       'Switch temperature unit',
      musicToggle:       'Toggle music player',
      voiceSearchBtn:    'Search by voice',
      cameraSearchBtn:   'Search by image',
      searchBtn:         'Search',
      clearSearchBtn:    'Clear search',
      composeBtn:        'Compose new message',
      composeClose:      'Close compose window',
      cSendBtn:          'Send message',
      cScheduleBtn:      'Schedule send',
      listReloadBtn:     'Reload mail',
      rdReply:           'Reply',
      rdForward:         'Forward',
      rdStar:            'Star message',
      rdDelete:          'Delete message',
      rdBack:            'Back to inbox',
      addDomainBtn:      'Add custom domain',
      addCategoryBtn:    'Add mail category',
      mailSettingsBtn:   'Mail settings',
      confirmDelete:     'Confirm delete',
      confirmCancel:     'Cancel',
    };

    Object.entries(LABEL_MAP).forEach(([id, label]) => {
      const el = document.getElementById(id);
      if (el && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
        el.setAttribute('aria-label', label);
      }
    });

    // ── Any <button> with no visible text and no aria-label ──
    document.querySelectorAll('button:not([aria-label]):not([aria-labelledby])').forEach(btn => {
      const text = btn.textContent.trim();
      if (!text || text.length < 2) {
        // Try to infer from title
        const title = btn.getAttribute('title');
        if (title) btn.setAttribute('aria-label', title);
      }
    });

    // ── Images missing alt ────────────────────────────────────
    document.querySelectorAll('img:not([alt])').forEach(img => {
      // Decorative images get empty alt; content images get filename
      const src = img.getAttribute('src') || '';
      const isDecorative = img.getAttribute('role') === 'presentation'
        || img.closest('[aria-hidden="true"]')
        || /icon|logo|bg|background|decoration/.test(src);
      img.setAttribute('alt', isDecorative ? '' : src.split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    });

    // ── Form inputs without labels ────────────────────────────
    const INPUT_PLACEHOLDERS = {
      mailSearch:    'Search mail',
      cTo:           'Recipient email address',
      cSubject:      'Email subject',
      'home-search': 'Search the web',
      searchInput:   'Search query',
      bgUrlInput:    'Background image URL',
      domainInput:   'Your domain name',
      catName:       'Category name',
      ruleInput:     'Sender email for this category',
    };

    Object.entries(INPUT_PLACEHOLDERS).forEach(([id, label]) => {
      const el = document.getElementById(id);
      if (el && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
        el.setAttribute('aria-label', label);
      }
    });

    // ── Role on nav elements ──────────────────────────────────
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.getAttribute('role')) {
      sidebar.setAttribute('role', 'navigation');
      sidebar.setAttribute('aria-label', '360 main navigation');
    }

    // ── Skip-to-content link (inject once) ───────────────────
    if (!document.getElementById('skip-to-content')) {
      const skip = document.createElement('a');
      skip.id = 'skip-to-content';
      skip.href = '#main-content';
      skip.textContent = 'Skip to main content';
      skip.style.cssText = [
        'position:fixed', 'top:-100px', 'left:16px', 'z-index:9999',
        'padding:8px 16px', 'border-radius:8px',
        'background:var(--a,#3b82f6)', 'color:#fff',
        'font-weight:700', 'font-size:14px', 'text-decoration:none',
        'transition:top .15s',
      ].join(';');
      skip.addEventListener('focus', () => { skip.style.top = '16px'; });
      skip.addEventListener('blur',  () => { skip.style.top = '-100px'; });
      document.body.insertBefore(skip, document.body.firstChild);
    }

    // ── Main landmark ─────────────────────────────────────────
    ['home-inner','search-results','main-content','page-content'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.getAttribute('role')) {
        el.setAttribute('role', 'main');
        el.id = el.id || 'main-content';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patch);
  } else {
    patch();
  }
})();
