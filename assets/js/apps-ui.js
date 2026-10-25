(function () {
  function ripple(btn) {
    if (!btn || btn._ripple) return;
    btn._ripple = true;
    const speed = (parseFloat(getComputedStyle(btn).getPropertyValue('--btn-speed')) || 0.45) * 1000;
    btn.addEventListener('mouseleave', () => {
      btn.classList.add('is-sliding-away');
      setTimeout(() => btn.classList.remove('is-sliding-away'), speed);
    });
    const spawn = (e) => {
      const r = btn.getBoundingClientRect();
      const n = document.createElement('span');
      n.className = 'c-ripple-btn__ripple';
      const size = Math.max(r.width, r.height) * 2;
      n.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left}px;top:${e.clientY - r.top}px`;
      btn.appendChild(n);
      n.addEventListener('animationend', () => n.remove());
    };
    btn.addEventListener('mousedown', (e) => { if (e.button === 0) spawn(e); });
  }

  function rippleAll(root) {
    (root || document).querySelectorAll('.c-ripple-btn').forEach(ripple);
  }

  function dropdown(trigger, items, onPick, opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'c-dropdown' + (opts.down ? ' down' : '');
    trigger.parentNode.insertBefore(wrap, trigger);
    wrap.appendChild(trigger);
    const menu = document.createElement('div');
    menu.className = 'c-dropdown__menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items.map((it) => `<button type="button" class="c-dropdown__item" role="menuitem" data-v="${it.value}">${it.label}</button>`).join('');
    wrap.appendChild(menu);
    const btns = [...menu.querySelectorAll('.c-dropdown__item')];
    const set = (open) => {
      wrap.dataset.open = String(open);
      trigger.setAttribute('aria-expanded', String(open));
      if (open) btns[0].focus();
    };
    trigger.addEventListener('click', (e) => { e.stopPropagation(); set(wrap.dataset.open !== 'true'); });
    btns.forEach((b, i) => {
      b.addEventListener('click', () => { set(false); onPick(b.dataset.v); });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
        if (e.key === 'Escape') { set(false); trigger.focus(); }
      });
    });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) set(false); });
    return wrap;
  }

  function confirmBox(o) {
    return new Promise((resolve) => {
      const m = document.createElement('div');
      m.className = 'confirm-modal';
      m.innerHTML = `<div class="confirm-box" role="alertdialog" aria-modal="true">
        <div class="confirm-title"></div><div class="confirm-message"></div>
        <div class="confirm-actions"><button type="button" class="confirm-button" data-r="0"></button><button type="button" class="confirm-button primary" data-r="1"></button></div></div>`;
      m.querySelector('.confirm-title').textContent = o.title || 'Are you sure?';
      m.querySelector('.confirm-message').textContent = o.message || '';
      const [no, yes] = m.querySelectorAll('.confirm-button');
      no.textContent = o.cancelText || 'Cancel';
      yes.textContent = o.confirmText || 'Continue';
      document.body.appendChild(m);
      requestAnimationFrame(() => { m.classList.add('open'); yes.focus(); });
      const done = (v) => {
        m.classList.remove('open');
        document.removeEventListener('keydown', key);
        setTimeout(() => m.remove(), 220);
        resolve(v);
      };
      const key = (e) => { if (e.key === 'Escape') done(false); };
      document.addEventListener('keydown', key);
      no.onclick = () => done(false);
      yes.onclick = () => done(true);
      m.addEventListener('mousedown', (e) => { if (e.target === m) done(false); });
    });
  }

  function loader(text) {
    return `<div class="loader"><div class="loader-spinner"></div>${text ? `<div class="loader-text">${text}</div>` : ''}</div>`;
  }

  window.UI = { ripple, rippleAll, dropdown, confirm: confirmBox, loader };
  document.addEventListener('DOMContentLoaded', () => {
    rippleAll();
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType === 1) { if (n.classList.contains('c-ripple-btn')) ripple(n); rippleAll(n); }
    }))).observe(document.body, { childList: true, subtree: true });
  });
})();
