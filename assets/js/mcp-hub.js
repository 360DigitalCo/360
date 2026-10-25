(function () {
  'use strict';

  const SB_URL = 'https://wiswfpfsjiowtrdyqpxy.supabase.co';
  const GATEWAY = SB_URL + '/functions/v1/mcp-gateway';
  const KEY = 'mcp_servers';
  const REDIRECT = location.origin + '/mcp-return';

  const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    code: icon('<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>'),
    book: icon('<path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5z"/><path d="M4 19.5V21h16"/>'),
    check: icon('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>'),
    note: icon('<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
    alert: icon('<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    card: icon('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'),
    cloud: icon('<path d="M18 10a6 6 0 00-11.6-1.5A4.5 4.5 0 007 18h11a4 4 0 000-8z"/>'),
    db: icon('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
    search: icon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    chat: icon('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>'),
    design: icon('<path d="M12 19l7-7 3 3-7 7z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"/><path d="M2 2l7.6 7.6"/>'),
    globe: icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>'),
    link: icon('<path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7"/>'),
    ai: icon('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>'),
  };

  const CATALOG = [
    { id: 'github', name: 'GitHub', cat: 'Developer', icon: 'code', url: 'https://api.githubcopilot.com/mcp/', auth: 'token',
      desc: 'Repositories, issues, pull requests, code search and Actions.',
      help: { label: 'Personal access token', link: 'https://github.com/settings/tokens/new?description=360+AI&scopes=repo,read:user', linkText: 'Create a token on GitHub', ph: 'ghp_…' } },
    { id: 'deepwiki', name: 'DeepWiki', cat: 'Developer', icon: 'book', url: 'https://mcp.deepwiki.com/mcp', auth: 'none',
      desc: 'Ask questions about any public GitHub repository.' },
    { id: 'context7', name: 'Context7', cat: 'Developer', icon: 'book', url: 'https://mcp.context7.com/mcp', auth: 'none',
      desc: 'Up to date library documentation and code examples.' },
    { id: 'msdocs', name: 'Microsoft Learn', cat: 'Developer', icon: 'book', url: 'https://learn.microsoft.com/api/mcp', auth: 'none',
      desc: 'Search official Microsoft and Azure documentation.' },
    { id: 'cfdocs', name: 'Cloudflare Docs', cat: 'Developer', icon: 'cloud', url: 'https://docs.mcp.cloudflare.com/mcp', auth: 'none',
      desc: 'Search the Cloudflare developer documentation.' },
    { id: 'vercel', name: 'Vercel', cat: 'Developer', icon: 'cloud', url: 'https://mcp.vercel.com', auth: 'oauth',
      desc: 'Projects, deployments and logs.' },
    { id: 'neon', name: 'Neon', cat: 'Data', icon: 'db', url: 'https://mcp.neon.tech/mcp', auth: 'oauth',
      desc: 'Serverless Postgres: branches, schemas and queries.' },
    { id: 'sentry', name: 'Sentry', cat: 'Developer', icon: 'alert', url: 'https://mcp.sentry.dev/mcp', auth: 'oauth',
      desc: 'Issues, stack traces and release health.' },
    { id: 'huggingface', name: 'Hugging Face', cat: 'AI', icon: 'ai', url: 'https://huggingface.co/mcp', auth: 'token',
      desc: 'Search models, datasets, papers and Spaces.',
      help: { label: 'Access token', link: 'https://huggingface.co/settings/tokens', linkText: 'Create a token on Hugging Face', ph: 'hf_…' } },
    { id: 'linear', name: 'Linear', cat: 'Productivity', icon: 'check', url: 'https://mcp.linear.app/mcp', auth: 'oauth',
      desc: 'Issues, projects and cycles.' },
    { id: 'notion', name: 'Notion', cat: 'Productivity', icon: 'note', url: 'https://mcp.notion.com/mcp', auth: 'oauth',
      desc: 'Search, read and write pages and databases.' },
    { id: 'atlassian', name: 'Atlassian', cat: 'Productivity', icon: 'check', url: 'https://mcp.atlassian.com/v1/mcp', auth: 'oauth',
      desc: 'Jira and Confluence.' },
    { id: 'asana', name: 'Asana', cat: 'Productivity', icon: 'check', url: 'https://mcp.asana.com/v2/mcp', auth: 'oauth',
      desc: 'Tasks, projects and portfolios.' },
    { id: 'figma', name: 'Figma', cat: 'Design', icon: 'design', url: 'https://mcp.figma.com/mcp', auth: 'oauth',
      desc: 'Design context from your Figma files.' },
    { id: 'canva', name: 'Canva', cat: 'Design', icon: 'design', url: 'https://mcp.canva.com/mcp', auth: 'oauth',
      desc: 'Search and create Canva designs.' },
    { id: 'stripe', name: 'Stripe', cat: 'Business', icon: 'card', url: 'https://mcp.stripe.com', auth: 'oauth',
      desc: 'Customers, payments, subscriptions and documentation.' },
    { id: 'paypal', name: 'PayPal', cat: 'Business', icon: 'card', url: 'https://mcp.paypal.com/mcp', auth: 'oauth',
      desc: 'Invoices, orders and transactions.' },
    { id: 'intercom', name: 'Intercom', cat: 'Business', icon: 'chat', url: 'https://mcp.intercom.com/mcp', auth: 'oauth',
      desc: 'Customer conversations and contacts.' },
    { id: 'exa', name: 'Exa Search', cat: 'Search', icon: 'search', url: 'https://mcp.exa.ai/mcp', auth: 'none',
      desc: 'Web search tuned for AI.' },
    { id: 'custom', name: 'Custom connector', cat: 'Custom', icon: 'link', url: '', auth: 'custom',
      desc: 'Add any remote MCP server by URL.' },
  ];

  const CATS = ['All', 'Developer', 'Productivity', 'Data', 'Business', 'Design', 'AI', 'Search', 'Custom'];

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };
  const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) {} };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const find = (id) => CATALOG.find((c) => c.id === id);
  const listeners = [];
  const notify = () => listeners.forEach((f) => { try { f(); } catch (_) {} });

  function connected() { return Object.values(load()); }
  function isConnected(id) { return !!load()[id]; }

  async function gateway(payload) {
    const r = await fetch(GATEWAY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (j && j.ok === false) { const e = new Error(j.error || 'Request failed'); e.status = j.status; throw e; }
    return j;
  }

  function put(entry) { const all = load(); all[entry.id] = entry; save(all); notify(); }
  function remove(id) { const all = load(); delete all[id]; save(all); notify(); }
  function patch(id, fields) { const all = load(); if (all[id]) { Object.assign(all[id], fields); save(all); notify(); } }

  function rand(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
  async function challenge(v) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
    return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  function modal(html) {
    const ov = document.createElement('div');
    ov.className = 'hub-ov';
    ov.innerHTML = `<div class="hub-modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('open'));
    const close = () => { ov.classList.remove('open'); setTimeout(() => ov.remove(), 200); };
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    return { ov, close, $: (s) => ov.querySelector(s) };
  }

  async function finish(entry, probe) {
    entry.tools = (probe.tools || []).map((t) => ({ name: t.name, description: t.description, readOnly: t.readOnly }));
    entry.server = probe.server && probe.server.name || '';
    entry.allowWrites = !!entry.allowWrites;
    put(entry);
  }

  function tokenModal(c, done) {
    const custom = c.auth === 'custom';
    const h = c.help || {};
    const m = modal(`
      <h3>${custom ? 'Add a custom connector' : 'Connect ' + esc(c.name)}</h3>
      ${custom ? `<label class="hub-lbl">Server URL<input class="hub-in" id="hubUrl" placeholder="https://example.com/mcp" spellcheck="false"/></label>
        <label class="hub-lbl">Name<input class="hub-in" id="hubName" placeholder="My server" maxlength="40"/></label>` : ''}
      ${h.link ? `<p class="hub-help"><a href="${esc(h.link)}" target="_blank" rel="noopener">${esc(h.linkText || 'Get a token')}</a>, then paste it below.</p>` : ''}
      <label class="hub-lbl">${esc(h.label || (custom ? 'Access token (optional)' : 'Access token'))}
        <input class="hub-in" id="hubTok" type="password" placeholder="${esc(h.ph || '')}" autocomplete="off"/></label>
      <div class="hub-err" id="hubErr"></div>
      <div class="hub-actions"><button class="c-ripple-btn" id="hubCancel" type="button">Cancel</button>
      <button class="c-ripple-btn c-ripple-btn--solid" id="hubOk" type="button">Connect</button></div>`);
    m.$('#hubCancel').onclick = m.close;
    const go = async () => {
      const token = m.$('#hubTok').value.trim();
      const url = custom ? m.$('#hubUrl').value.trim() : c.url;
      const name = custom ? (m.$('#hubName').value.trim() || 'Custom connector') : c.name;
      if (!url) return (m.$('#hubErr').textContent = 'Enter the server URL.');
      if (c.auth === 'token' && !token) return (m.$('#hubErr').textContent = 'Paste your token to continue.');
      m.$('#hubOk').disabled = true;
      m.$('#hubErr').textContent = 'Checking the connection';
      try {
        const probe = await gateway({ action: 'probe', url, token: token || undefined });
        const id = custom ? 'custom-' + rand(4).toLowerCase().replace(/[^a-z0-9]/g, '') : c.id;
        await finish({ id, name, url, token: token || null, catalog: c.id, auth: c.auth }, probe);
        m.close();
        if (done) done();
      } catch (e) {
        m.$('#hubErr').textContent = e.message || 'Could not connect.';
        m.$('#hubOk').disabled = false;
      }
    };
    m.$('#hubOk').onclick = go;
    m.ov.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => (m.$('#hubUrl') || m.$('#hubTok')).focus(), 60);
  }

  async function oauthConnect(c, done) {
    const m = modal(`<h3>Connecting ${esc(c.name)}</h3><div class="hub-wait"><div class="hub-spin"></div><p id="hubMsg">Contacting ${esc(c.name)}</p></div>
      <div class="hub-actions"><button class="c-ripple-btn" id="hubCancel" type="button">Cancel</button></div>`);
    let cancelled = false, popup = null, listener = null;
    const stop = () => { cancelled = true; if (listener) window.removeEventListener('message', listener); try { popup && popup.close(); } catch (_) {} m.close(); };
    m.$('#hubCancel').onclick = stop;
    try {
      const disc = await gateway({ action: 'discover', url: c.url, redirect_uri: REDIRECT, client_name: '360 AI' });
      if (cancelled) return;
      if (disc.open) {
        const probe = await gateway({ action: 'probe', url: c.url });
        await finish({ id: c.id, name: c.name, url: c.url, token: null, catalog: c.id, auth: 'none' }, probe);
        m.close(); if (done) done(); return;
      }
      const verifier = rand(48);
      const state = rand(16);
      const u = new URL(disc.authorization_endpoint);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('client_id', disc.client_id);
      u.searchParams.set('redirect_uri', REDIRECT);
      u.searchParams.set('code_challenge', await challenge(verifier));
      u.searchParams.set('code_challenge_method', 'S256');
      u.searchParams.set('state', state);
      if (disc.resource) u.searchParams.set('resource', disc.resource);
      if (disc.scope) u.searchParams.set('scope', disc.scope);
      popup = window.open(u.toString(), 'mcp_hub_oauth', 'width=520,height=720,resizable=yes,scrollbars=yes');
      if (!popup) throw new Error('Allow pop-ups for this site and try again.');
      m.$('#hubMsg').textContent = 'Finish signing in in the window that opened.';
      listener = async (ev) => {
        if (ev.origin !== location.origin || !ev.data || ev.data.type !== 'mcp-hub-code' || ev.data.state !== state) return;
        window.removeEventListener('message', listener);
        if (ev.data.error) { m.$('#hubMsg').textContent = ev.data.error; return; }
        m.$('#hubMsg').textContent = 'Finishing up';
        try {
          const tok = await gateway({ action: 'exchange', token_endpoint: disc.token_endpoint, code: ev.data.code, redirect_uri: REDIRECT, client_id: disc.client_id, code_verifier: verifier, resource: disc.resource });
          const probe = await gateway({ action: 'probe', url: c.url, token: tok.access_token });
          await finish({
            id: c.id, name: c.name, url: c.url, token: tok.access_token, catalog: c.id, auth: 'oauth',
            refresh_token: tok.refresh_token, expires_at: Date.now() + (tok.expires_in || 3600) * 1000,
            token_endpoint: disc.token_endpoint, client_id: disc.client_id, resource: disc.resource,
          }, probe);
          m.close(); if (done) done();
        } catch (e) { m.$('#hubMsg').textContent = e.message || 'Could not finish connecting.'; }
      };
      window.addEventListener('message', listener);
    } catch (e) {
      if (cancelled) return;
      m.$('#hubMsg').innerHTML = esc(e.message || 'Could not connect.') + (c.auth === 'oauth' ? '<br><a href="#" id="hubTokLink">Use an access token instead</a>' : '');
      const l = m.$('#hubTokLink');
      if (l) l.onclick = (ev) => { ev.preventDefault(); m.close(); tokenModal(Object.assign({}, c, { auth: 'token', help: { label: 'Access token', ph: '' } }), done); };
    }
  }

  function connect(id, done) {
    const c = find(id);
    if (!c) return;
    if (c.auth === 'token' || c.auth === 'custom') return tokenModal(c, done);
    if (c.auth === 'oauth') return oauthConnect(c, done);
    const m = modal(`<h3>Connecting ${esc(c.name)}</h3><div class="hub-wait"><div class="hub-spin"></div><p id="hubMsg">Checking the connection</p></div>`);
    gateway({ action: 'probe', url: c.url }).then((probe) => finish({ id: c.id, name: c.name, url: c.url, token: null, catalog: c.id, auth: 'none' }, probe))
      .then(() => { m.close(); if (done) done(); })
      .catch((e) => { m.$('#hubMsg').textContent = e.message || 'Could not connect.'; setTimeout(m.close, 2600); });
  }

  function manage(id) {
    const e = load()[id];
    if (!e) return;
    const tools = e.tools || [];
    const m = modal(`
      <h3>${esc(e.name)}</h3>
      <p class="hub-help">${tools.length} tool${tools.length === 1 ? '' : 's'} available${e.server ? ' from ' + esc(e.server) : ''}.</p>
      <label class="hub-switch"><input type="checkbox" id="hubW" ${e.allowWrites ? 'checked' : ''}/><span>Allow tools that change data</span></label>
      <p class="hub-help">Off by default. With this off, 360 AI only reads from ${esc(e.name)}.</p>
      <div class="hub-tools">${tools.slice(0, 60).map((t) => `<div><b>${esc(t.name)}</b><span>${esc(t.description || '')}</span></div>`).join('')}</div>
      <div class="hub-actions"><button class="c-ripple-btn c-ripple-btn--danger" id="hubOff" type="button">Disconnect</button>
      <button class="c-ripple-btn" id="hubDone" type="button">Done</button></div>`);
    m.$('#hubW').onchange = (ev) => patch(id, { allowWrites: ev.target.checked });
    m.$('#hubOff').onclick = () => { remove(id); m.close(); };
    m.$('#hubDone').onclick = m.close;
  }

  function render(root, opts) {
    opts = opts || {};
    let cat = 'All', q = '';
    root.classList.add('hub');
    root.innerHTML = `
      <div class="hub-bar"><input class="hub-search" type="search" placeholder="Search connectors" aria-label="Search connectors"/>
      <div class="hub-cats">${CATS.map((c) => `<button type="button" data-c="${c}" class="${c === 'All' ? 'on' : ''}">${c}</button>`).join('')}</div></div>
      <div class="hub-list"></div>`;
    const list = root.querySelector('.hub-list');
    const draw = () => {
      const have = load();
      const rows = CATALOG.filter((c) => (cat === 'All' || c.cat === cat) && (!q || (c.name + ' ' + c.desc).toLowerCase().includes(q)));
      const mine = Object.values(have).filter((e) => !CATALOG.some((c) => c.id === e.id) && (cat === 'All' || cat === 'Custom') && (!q || e.name.toLowerCase().includes(q)));
      const card = (c, e) => `<div class="hub-card${e ? ' on' : ''}">
        <div class="hub-ico">${ICONS[c.icon] || ICONS.link}</div>
        <div class="hub-info"><div class="hub-name">${esc(e ? e.name : c.name)}${e ? '<span class="hub-dot" title="Connected"></span>' : ''}</div>
        <div class="hub-desc">${esc(c.desc)}</div><div class="hub-meta">${esc(c.cat)} · ${c.auth === 'none' ? 'No sign in' : c.auth === 'oauth' ? 'Sign in' : 'Access token'}</div></div>
        <div class="hub-cta">${e ? `<button type="button" class="c-ripple-btn" data-manage="${esc(e.id)}">Manage</button>` : `<button type="button" class="c-ripple-btn c-ripple-btn--accent" data-connect="${esc(c.id)}">${c.auth === 'custom' ? 'Add' : 'Connect'}</button>`}</div></div>`;
      list.innerHTML = rows.filter((c) => c.id !== 'custom' || !opts.hideCustom).map((c) => card(c, c.auth === 'custom' ? null : have[c.id])).join('') +
        mine.map((e) => card({ cat: 'Custom', icon: 'link', desc: e.url, auth: e.auth, name: e.name }, e)).join('') ||
        '<div class="hub-empty">No connectors match your search.</div>';
      list.querySelectorAll('[data-connect]').forEach((b) => b.onclick = () => connect(b.dataset.connect, draw));
      list.querySelectorAll('[data-manage]').forEach((b) => b.onclick = () => manage(b.dataset.manage));
    };
    root.querySelector('.hub-search').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
    root.querySelectorAll('.hub-cats button').forEach((b) => b.onclick = () => {
      cat = b.dataset.c;
      root.querySelectorAll('.hub-cats button').forEach((x) => x.classList.toggle('on', x === b));
      draw();
    });
    listeners.push(draw);
    draw();
  }

  async function freshServers() {
    const all = load();
    const out = [];
    for (const e of Object.values(all)) {
      if (e.refresh_token && e.expires_at && e.expires_at - Date.now() < 90000) {
        try {
          const t = await gateway({ action: 'refresh', token_endpoint: e.token_endpoint, refresh_token: e.refresh_token, client_id: e.client_id, resource: e.resource });
          e.token = t.access_token;
          e.refresh_token = t.refresh_token || e.refresh_token;
          e.expires_at = Date.now() + (t.expires_in || 3600) * 1000;
          all[e.id] = e;
          save(all);
        } catch (_) {}
      }
      out.push({ id: e.id, name: e.name, url: e.url, token: e.token || undefined, allowWrites: !!e.allowWrites });
    }
    return out;
  }

  const AI_URL = /\/functions\/v1\/ai-chatbot/;
  const origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!AI_URL.test(url) || !init || !init.body || !connected().length) return origFetch(input, init);
    let body;
    try { body = JSON.parse(init.body); } catch (_) { return origFetch(input, init); }
    const enc = new TextEncoder();
    const events = [];
    let context = '';
    try {
      const servers = await freshServers();
      const res = await origFetch(GATEWAY, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', servers, message: body.message, memory: body.memory || [] }),
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const p of parts) {
          if (!p.startsWith('data:')) continue;
          let ev;
          try { ev = JSON.parse(p.slice(5).trim()); } catch (_) { continue; }
          if (ev.type === 'tool') events.push(ev);
          else if (ev.type === 'context') context = ev.text || '';
        }
      }
    } catch (_) {}
    if (context) body.message += '\n\n[Results from the user\'s connected tools. Use them to answer, and say which tool they came from.]\n' + context;
    const upstream = await origFetch(input, Object.assign({}, init, { body: JSON.stringify(body) }));
    if (!upstream.ok || !upstream.body || !events.length) return upstream;
    const prefix = enc.encode(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''));
    const reader = upstream.body.getReader();
    const stream = new ReadableStream({
      start(c) { c.enqueue(prefix); },
      async pull(c) {
        const { done, value } = await reader.read();
        if (done) c.close(); else c.enqueue(value);
      },
      cancel() { reader.cancel(); },
    });
    return new Response(stream, { status: upstream.status, headers: upstream.headers });
  };

  window.McpHub = {
    catalog: CATALOG, render, connect, manage, isConnected, connected,
    names: () => connected().map((e) => e.name),
    onChange: (f) => listeners.push(f),
  };
})();
