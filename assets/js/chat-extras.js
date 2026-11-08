(function () {
  var $ = function (id) { return document.getElementById(id); };
  var qs = function (s, r) { return (r || document).querySelector(s); };

  function items() {
    var out = [];
    document.querySelectorAll('#rail-servers .rail-server-icon').forEach(function (b) {
      out.push({ label: b.title || 'Server', kind: 'Server', el: b });
    });
    document.querySelectorAll('#sidebarBody .dc-ch-item, #sidebarBody .dc-dm-item').forEach(function (e) {
      out.push({ label: e.textContent.trim().replace(/^#/, ''), kind: e.classList.contains('dc-dm-item') ? 'Message' : 'Channel', el: e });
    });
    return out;
  }

  var sw, list, input, sel = 0, shown = [];
  function build() {
    sw = document.createElement('div');
    sw.className = 'qs-overlay hidden';
    sw.innerHTML = '<div class="qs-box"><input class="qs-input" placeholder="Jump to a channel, server or conversation" autocomplete="off"><div class="qs-list"></div><div class="qs-hint">Enter to open, Esc to close</div></div>';
    document.body.appendChild(sw);
    list = qs('.qs-list', sw);
    input = qs('.qs-input', sw);
    sw.addEventListener('mousedown', function (e) { if (e.target === sw) close(); });
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
      else if (e.key === 'Enter') { pick(sel); }
      else if (e.key === 'Escape') close();
    });
  }
  function score(label, q) {
    var l = label.toLowerCase();
    if (!q) return 1;
    if (l.indexOf(q) === 0) return 3;
    if (l.indexOf(q) > -1) return 2;
    var i = 0;
    for (var k = 0; k < l.length && i < q.length; k++) if (l[k] === q[i]) i++;
    return i === q.length ? 1 : 0;
  }
  function render() {
    var q = input.value.trim().toLowerCase();
    shown = items().map(function (it) { it.s = score(it.label, q); return it; })
      .filter(function (it) { return it.s > 0; })
      .sort(function (a, b) { return b.s - a.s; }).slice(0, 12);
    sel = 0;
    list.innerHTML = shown.length ? shown.map(function (it, i) {
      var d = document.createElement('div');
      d.textContent = it.label;
      return '<div class="qs-row" data-i="' + i + '"><span class="qs-kind">' + it.kind + '</span><span>' + d.innerHTML + '</span></div>';
    }).join('') : '<div class="qs-empty">Nothing matches</div>';
    list.querySelectorAll('.qs-row').forEach(function (r) {
      r.addEventListener('click', function () { pick(+r.dataset.i); });
      r.addEventListener('mousemove', function () { sel = +r.dataset.i; paint(); });
    });
    paint();
  }
  function paint() {
    list.querySelectorAll('.qs-row').forEach(function (r, i) {
      r.classList.toggle('on', i === sel);
      if (i === sel) r.scrollIntoView({ block: 'nearest' });
    });
  }
  function pick(i) {
    var it = shown[i];
    close();
    if (it && it.el) it.el.click();
  }
  function open() {
    if (!sw) build();
    sw.classList.remove('hidden');
    input.value = '';
    render();
    input.focus();
  }
  function close() {
    if (sw) sw.classList.add('hidden');
    var m = $('msgInput');
    if (m) m.focus();
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (sw && !sw.classList.contains('hidden')) close(); else open();
    }
  });

  function jumpPill() {
    var msgs = $('dc-messages');
    if (!msgs || $('dcJump')) return;
    var b = document.createElement('button');
    b.id = 'dcJump';
    b.type = 'button';
    b.className = 'dc-jump hidden';
    b.textContent = 'Jump to present';
    msgs.parentNode.appendChild(b);
    b.addEventListener('click', function () { msgs.scrollTo({ top: msgs.scrollHeight, behavior: 'smooth' }); });
    function sync() { b.classList.toggle('hidden', msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 400); }
    msgs.addEventListener('scroll', sync, { passive: true });
    new MutationObserver(sync).observe(msgs, { childList: true });
  }

  function drafts() {
    var m = $('msgInput');
    if (!m) return;
    var key = function () { var r = window.activeRoom; return r ? '360_draft_' + r.type + '_' + r.id : null; };
    var last = null;
    function restore() {
      var k = key();
      if (!k || k === last) return;
      last = k;
      try { m.value = localStorage.getItem(k) || ''; } catch (e) { m.value = ''; }
      m.dispatchEvent(new Event('input'));
    }
    m.addEventListener('input', function () {
      var k = key();
      if (!k) return;
      try { if (m.value) localStorage.setItem(k, m.value); else localStorage.removeItem(k); } catch (e) {}
    });
    setInterval(restore, 400);
  }

  function editLast() {
    var m = $('msgInput');
    if (!m) return;
    m.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowUp' || m.value) return;
      var uid = typeof currentUserId !== 'undefined' ? currentUserId : null;
      var mine = Array.prototype.filter.call(document.querySelectorAll('#dc-messages .dc-msg'), function (n) { return uid && n.dataset.userId === uid; });
      var el = mine[mine.length - 1];
      if (!el) return;
      e.preventDefault();
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
      var edit = $('ctx-edit');
      if (edit && edit.style.display !== 'none') edit.click();
    });
  }

  function boot() { jumpPill(); drafts(); editLast(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
