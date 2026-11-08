(function () {
  var KEY = '360_chat_tour_v1';
  var steps = [
    { sel: '#dcRail', title: 'Your servers', text: 'Servers live down this rail. Click one to open it, or use the plus to start your own.', side: 'right' },
    { sel: '#railDMs', title: 'Direct messages', text: 'Private conversations with friends and bots. Each person only ever gets one thread.', side: 'right' },
    { sel: '#dcSidebar', title: 'Channels', text: 'Pick a channel to read it. Discover Servers is at the top if you want to find a community.', side: 'right' },
    { sel: '#msgInput', title: 'Say something', text: 'Type here and press Enter. Shift+Enter adds a new line, and right-click a message to reply, react or pin.', side: 'top' },
    { sel: '#dcUserChip', title: 'You', text: 'Open account settings from here to change your name, picture and theme.', side: 'top' }
  ];

  function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function mark() { try { localStorage.setItem(KEY, '1'); } catch (e) {} }

  var layer, card, ring, idx = 0;

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < window.innerHeight;
  }

  function build() {
    layer = document.createElement('div');
    layer.className = 'ct-layer';
    layer.innerHTML = '<div class="ct-ring"></div><div class="ct-card" role="dialog" aria-live="polite">' +
      '<div class="ct-step"></div><h3 class="ct-title"></h3><p class="ct-text"></p>' +
      '<div class="ct-row"><button class="ct-skip" type="button">Skip</button>' +
      '<span class="ct-dots"></span><button class="ct-next" type="button"></button></div></div>';
    document.body.appendChild(layer);
    ring = layer.querySelector('.ct-ring');
    card = layer.querySelector('.ct-card');
    layer.querySelector('.ct-skip').onclick = finish;
    layer.querySelector('.ct-next').onclick = function () { go(idx + 1); };
    window.addEventListener('resize', place);
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!layer) return;
    if (e.key === 'Escape') finish();
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(idx + 1); }
    else if (e.key === 'ArrowLeft' && idx > 0) go(idx - 1);
  }

  function finish() {
    mark();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    if (layer) layer.classList.remove('on');
    var l = layer;
    layer = null;
    setTimeout(function () { if (l) l.remove(); }, 250);
  }

  function place() {
    if (!layer) return;
    var s = steps[idx];
    var el = document.querySelector(s.sel);
    if (!visible(el)) { card.style.left = '50%'; card.style.top = '50%'; card.style.transform = 'translate(-50%,-50%)'; ring.style.opacity = '0'; return; }
    var r = el.getBoundingClientRect();
    var pad = 6;
    ring.style.opacity = '1';
    ring.style.left = r.left - pad + 'px';
    ring.style.top = r.top - pad + 'px';
    ring.style.width = r.width + pad * 2 + 'px';
    ring.style.height = r.height + pad * 2 + 'px';
    card.style.transform = 'none';
    var cw = Math.min(320, window.innerWidth - 24);
    card.style.width = cw + 'px';
    var ch = card.offsetHeight;
    var left, top;
    if (s.side === 'right' && r.right + cw + 24 < window.innerWidth) {
      left = r.right + 18;
      top = Math.min(Math.max(12, r.top), window.innerHeight - ch - 12);
    } else if (s.side === 'top' && r.top - ch - 18 > 0) {
      left = Math.min(Math.max(12, r.left), window.innerWidth - cw - 12);
      top = r.top - ch - 18;
    } else {
      left = Math.min(Math.max(12, r.left), window.innerWidth - cw - 12);
      top = Math.min(r.bottom + 18, window.innerHeight - ch - 12);
    }
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  function go(i) {
    while (i < steps.length && !visible(document.querySelector(steps[i].sel))) i++;
    if (i >= steps.length) { finish(); return; }
    idx = i;
    var s = steps[i];
    var total = steps.length;
    card.querySelector('.ct-step').textContent = (i + 1) + ' of ' + total;
    card.querySelector('.ct-title').textContent = s.title;
    card.querySelector('.ct-text').textContent = s.text;
    var last = i === total - 1;
    card.querySelector('.ct-next').textContent = last ? 'Done' : 'Next';
    card.querySelector('.ct-dots').innerHTML = steps.map(function (_, k) { return '<i' + (k === i ? ' class="cur"' : '') + '></i>'; }).join('');
    place();
  }

  function start(force) {
    if (layer) return;
    if (!force && seen()) return;
    if (window.innerWidth < 760) { mark(); return; }
    build();
    requestAnimationFrame(function () { layer.classList.add('on'); go(0); });
  }

  window.ChatTour = { start: function () { start(true); }, reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} } };

  function boot() {
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      var chip = document.getElementById('dcUserName');
      var ready = chip && chip.textContent && chip.textContent !== 'Not signed in' && visible(document.getElementById('msgInput'));
      if (ready) { clearInterval(t); setTimeout(function () { start(false); }, 900); }
      else if (tries > 40) clearInterval(t);
    }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
