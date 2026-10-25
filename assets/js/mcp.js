(() => {
  /* ── 360 AI — mcp.js ─────────────────────────────────────────────
   *
   * MCP Connector panel — real Supabase OAuth2 PKCE flow.
   *
   * Flow:
   *   1. generatePKCE()  — browser generates verifier + challenge
   *   2. popup opens     — api.supabase.com/v1/oauth/authorize
   *   3. user approves   — Supabase redirects to /mcp-callback?code=&state=
   *   4. callback page   — POSTs code + verifier to edge fn mcp-oauth
   *   5. edge fn         — exchanges for tokens (client_secret stays server-side)
   *   6. callback        — postMessage({ type:"mcp-oauth-done", ... }) to opener
   *   7. mcp.js          — receives token, stores in localStorage, re-renders
   * ──────────────────────────────────────────────────────────────── */

  const STORAGE_KEY   = "mcp_creds";
  const CLIENT_ID     = "91196568-0249-4a7e-a655-5292d663fe08";
  const REDIRECT_URI  = "https://360-search.com/mcp-callback";
  const AUTHORIZE_URL = "https://api.supabase.com/v1/oauth/authorize";
  const EXCHANGE_URL  = "https://wiswfpfsjiowtrdyqpxy.supabase.co/functions/v1/mcp-oauth";

  /* ── connector registry ─────────────────────────────────────────── */

  const CONNECTORS = [
    {
      id: "supabase",
      name: "Supabase",
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.976 22.272c-.533.667-1.6.283-1.6-.567V13.6H3.2c-.867 0-1.333-1.033-.8-1.667L10.024 1.728c.533-.667 1.6-.283 1.6.567V10.4H20.8c.867 0 1.333 1.033.8 1.667l-7.624 10.205z" fill="#3ECF8E"/></svg>`,
      color: "#3ECF8E",
      desc: "Query your database, list tables, and run SELECT statements.",
      tools: [
        { name: "list_tables", desc: "List all tables in the project" },
        { name: "execute_sql", desc: "Run a read-only SELECT query" },
      ],
    },
  ];

  /* ── PKCE helpers ───────────────────────────────────────────────── */

  function randomBase64url(len) {
    const buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    return btoa(String.fromCharCode(...buf))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  async function sha256Base64url(plain) {
    const enc  = new TextEncoder().encode(plain);
    const hash = await crypto.subtle.digest("SHA-256", enc);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  async function generatePKCE() {
    const verifier  = randomBase64url(64);
    const challenge = await sha256Base64url(verifier);
    return { verifier, challenge };
  }

  /* ── credential storage ─────────────────────────────────────────── */

  function loadCreds() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch (_) { return {}; }
  }

  function saveCreds(c) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); }
    catch (_) {}
  }

  function isConnected(id) {
    const c = loadCreds()[id];
    return !!(c && c.access_token);
  }

  function setConnectorCreds(id, fields) {
    const all = loadCreds();
    all[id] = fields;
    saveCreds(all);
  }

  function clearConnectorCreds(id) {
    const all = loadCreds();
    delete all[id];
    saveCreds(all);
  }

  /* ── expose creds to fetch patch ────────────────────────────────── */

  function syncWindowCreds() {
    const creds = loadCreds();
    window.__mcpCreds = {};
    for (const conn of CONNECTORS) {
      if (isConnected(conn.id)) window.__mcpCreds[conn.id] = creds[conn.id];
    }
  }

  syncWindowCreds();

  /* ── DOM refs ───────────────────────────────────────────────────── */

  const mcpBtn     = document.getElementById("mcp-btn");
  const mcpPanel   = document.getElementById("mcp-panel");
  const mcpOverlay = document.getElementById("mcp-overlay");
  const mcpClose   = document.getElementById("mcp-panel-close");
  const mcpBody    = document.getElementById("mcp-panel-body");
  const ctxBar     = document.getElementById("mcp-context-bar");
  const ctxLabel   = document.getElementById("mcp-ctx-label");
  const ctxClose   = document.getElementById("mcp-ctx-close");

  if (!mcpBtn || !mcpPanel || !mcpBody) return;

  /* ── panel open / close ─────────────────────────────────────────── */

  function openPanel() {
    mcpPanel.classList.add("open");
    mcpBtn.classList.add("active");
    if (mcpOverlay) mcpOverlay.classList.add("show");
    renderCards();
  }

  function closePanel() {
    mcpPanel.classList.remove("open");
    mcpBtn.classList.remove("active");
    if (mcpOverlay) mcpOverlay.classList.remove("show");
  }

  mcpBtn.addEventListener("click", () =>
    mcpPanel.classList.contains("open") ? closePanel() : openPanel());
  mcpClose.addEventListener("click", closePanel);
  if (mcpOverlay) mcpOverlay.addEventListener("click", closePanel);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && mcpPanel.classList.contains("open")) closePanel();
  });

  /* ── context bar ────────────────────────────────────────────────── */

  function refreshContextBar() {
    const names = CONNECTORS.filter(c => !c.comingSoon && isConnected(c.id)).map(c => c.name)
      .concat(window.McpHub ? window.McpHub.names() : []);
    if (ctxLabel) ctxLabel.textContent = names.length ? names.join(", ") + " connected" : "";
    if (ctxBar) ctxBar.classList.toggle("show", names.length > 0);
    mcpBtn.classList.toggle("has-active", names.length > 0);
  }

  if (ctxClose) ctxClose.addEventListener("click", () => ctxBar.classList.remove("show"));
  refreshContextBar();
  if (window.McpHub) window.McpHub.onChange(refreshContextBar);

  /* ── OAuth PKCE flow ────────────────────────────────────────────── */

  let _pendingState    = null;
  let _pendingVerifier = null;
  let _popup           = null;
  let _messageListener = null;

  async function startOAuth(connector) {
    /* clean up any previous attempt */
    if (_popup && !_popup.closed) _popup.close();
    if (_messageListener) window.removeEventListener("message", _messageListener);

    const { verifier, challenge } = await generatePKCE();
    const state = randomBase64url(16);

    _pendingState    = state;
    _pendingVerifier = verifier;

    /* store verifier in sessionStorage so the callback page can read it
       if it needs to — but we pass it via postMessage instead */
    sessionStorage.setItem("mcp_pkce_" + state, verifier);

    const params = new URLSearchParams({
      client_id:             CLIENT_ID,
      redirect_uri:          REDIRECT_URI,
      response_type:         "code",
      scope:                 "all",
      code_challenge:        challenge,
      code_challenge_method: "S256",
      state,
    });

    const authUrl = AUTHORIZE_URL + "?" + params.toString();
    _popup = window.open(authUrl, "mcp_supabase_oauth",
      "width=960,height=680,resizable=yes,scrollbars=yes");

    showWaitingModal(connector);

    /* listen for the callback postMessage */
    _messageListener = (evt) => {
      if (evt.origin !== location.origin) return;
      if (!evt.data || evt.data.type !== "mcp-oauth-done") return;
      if (evt.data.state !== state) return;

      window.removeEventListener("message", _messageListener);
      _messageListener = null;
      closeWaitingModal();

      if (evt.data.error) {
        showOAuthError(evt.data.error);
        return;
      }

      setConnectorCreds(connector.id, {
        access_token:  evt.data.access_token,
        refresh_token: evt.data.refresh_token,
        expires_at:    Date.now() + (evt.data.expires_in || 3600) * 1000,
      });

      syncWindowCreds();
      refreshContextBar();
      renderCards();
    };

    window.addEventListener("message", _messageListener);
  }

  /* ── waiting modal (shown while popup is open) ──────────────────── */

  let _waitingOverlay = null;

  function showWaitingModal(connector) {
    closeWaitingModal();
    const overlay = document.createElement("div");
    overlay.className = "mcp-auth-overlay";
    overlay.id = "mcp-waiting-overlay";

    overlay.innerHTML = `
      <div class="mcp-auth-modal">
        <div class="mcp-auth-modal-head">
          <span class="mcp-auth-modal-icon">${connector.icon}</span>
          <div class="mcp-auth-modal-title">Connecting ${escHtml(connector.name)}</div>
        </div>
        <div class="mcp-oauth-waiting">
          <div class="mcp-oauth-spinner"></div>
          <p>Complete the sign-in in the popup window.<br>This will close automatically when done.</p>
        </div>
        <div class="mcp-auth-modal-actions">
          <button class="mcp-auth-cancel-btn" id="mcp-waiting-cancel">Cancel</button>
          <button class="mcp-auth-cancel-btn" id="mcp-waiting-reopen" style="flex:1;opacity:1;">Open window again ↗</button>
        </div>
      </div>`;

    mcpPanel.appendChild(overlay);
    _waitingOverlay = overlay;

    overlay.querySelector("#mcp-waiting-cancel").addEventListener("click", () => {
      if (_popup && !_popup.closed) _popup.close();
      if (_messageListener) { window.removeEventListener("message", _messageListener); _messageListener = null; }
      closeWaitingModal();
    });

    overlay.querySelector("#mcp-waiting-reopen").addEventListener("click", () => {
      if (!_popup || _popup.closed) {
        const params = new URLSearchParams({
          client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
          response_type: "code", scope: "all",
          code_challenge_method: "S256", state: _pendingState,
        });
        /* can't regenerate challenge without new verifier; just reopen */
        _popup = window.open(AUTHORIZE_URL + "?" + params.toString(),
          "mcp_supabase_oauth", "width=960,height=680,resizable=yes,scrollbars=yes");
      } else {
        _popup.focus();
      }
    });
  }

  function closeWaitingModal() {
    if (_waitingOverlay) { _waitingOverlay.remove(); _waitingOverlay = null; }
  }

  function showOAuthError(msg) {
    const overlay = document.createElement("div");
    overlay.className = "mcp-auth-overlay";
    overlay.innerHTML = `
      <div class="mcp-auth-modal">
        <div class="mcp-auth-modal-head">
          <div class="mcp-auth-modal-title" style="color:#ef4444">Connection failed</div>
        </div>
        <p style="font-size:13px;opacity:.75;margin:0">${escHtml(msg)}</p>
        <div class="mcp-auth-modal-actions">
          <button class="mcp-auth-save-btn" id="mcp-err-close">Close</button>
        </div>
      </div>`;
    mcpPanel.appendChild(overlay);
    overlay.querySelector("#mcp-err-close").addEventListener("click", () => overlay.remove());
  }

  /* ── PAT form (GitHub) ──────────────────────────────────────────── */

  function startPAT(connector) {
    const overlay = document.createElement("div");
    overlay.className = "mcp-auth-overlay";

    overlay.innerHTML = `
      <div class="mcp-auth-modal">
        <div class="mcp-auth-modal-head">
          <span class="mcp-auth-modal-icon" style="color:${escHtml(connector.color)}">${connector.icon}</span>
          <div class="mcp-auth-modal-title">Connect ${escHtml(connector.name)}</div>
        </div>
        <ol class="mcp-auth-steps">
          <li>Go to <a href="https://github.com/settings/tokens/new?description=360+AI&scopes=repo,read:user" target="_blank" rel="noopener">GitHub → Settings → Tokens ↗</a> and create a token.</li>
          <li>Paste it below.</li>
        </ol>
        <div class="mcp-auth-fields">
          <label class="mcp-auth-field-label">Personal access token
            <input class="mcp-auth-field-input" type="password" placeholder="ghp_…" id="mcp-gh-token" />
          </label>
        </div>
        <div class="mcp-auth-modal-actions">
          <button class="mcp-auth-cancel-btn" id="mcp-pat-cancel">Cancel</button>
          <button class="mcp-auth-save-btn" id="mcp-pat-save">Connect GitHub</button>
        </div>
      </div>`;

    mcpPanel.appendChild(overlay);

    const input = overlay.querySelector("#mcp-gh-token");
    setTimeout(() => input && input.focus(), 60);

    overlay.querySelector("#mcp-pat-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

    const save = () => {
      const val = input.value.trim();
      if (!val) { input.style.borderColor = "rgba(239,68,68,.6)"; setTimeout(() => input.style.borderColor = "", 1200); return; }
      overlay.remove();
      setConnectorCreds(connector.id, { access_token: val });
      syncWindowCreds();
      refreshContextBar();
      renderCards();
    };

    overlay.querySelector("#mcp-pat-save").addEventListener("click", save);
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  }

  /* ── card rendering ─────────────────────────────────────────────── */

  function renderCards() {
    mcpBody.innerHTML = "";
    const sbHost = document.createElement("div");
    mcpBody.appendChild(sbHost);
    const hubHost = document.createElement("div");
    mcpBody.appendChild(hubHost);
    if (window.McpHub) window.McpHub.render(hubHost, { hideCustom: false });

    const connected  = CONNECTORS.filter(c => !c.comingSoon && isConnected(c.id));
    const available  = CONNECTORS.filter(c => !c.comingSoon && !isConnected(c.id));
    const comingSoon = CONNECTORS.filter(c => c.comingSoon);

    [...connected, ...available, ...comingSoon].forEach(c => sbHost.appendChild(buildCard(c)));
  }

  function sectionLabel(text) {
    const el = document.createElement("div");
    el.className = "mcp-section-label";
    el.textContent = text;
    return el;
  }

  function buildCard(connector) {
    const connected = isConnected(connector.id);
    const wrap = document.createElement("div");
    wrap.className = "mcp-card" + (connected ? " connected" : "");

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:12px;width:100%;";

    const icon = document.createElement("div");
    icon.className = "mcp-card-icon";
    icon.innerHTML = connector.icon;
    icon.style.color = connector.color || "currentColor";

    const info = document.createElement("div");
    info.className = "mcp-card-info";
    info.innerHTML = `<div class="mcp-card-name">${escHtml(connector.name)}</div>
                      <div class="mcp-card-desc">${escHtml(connector.desc)}</div>`;

    const btn = document.createElement("button");
    if (connector.comingSoon) {
      btn.className = "mcp-connect-btn connect";
      btn.disabled = true;
      btn.style.cssText = "opacity:.38;cursor:default;";
      btn.textContent = "Soon";
    } else if (connected) {
      btn.className = "mcp-connect-btn disconnect";
      btn.textContent = "Disconnect";
    } else {
      btn.className = "mcp-connect-btn connect";
      btn.innerHTML = `${connector.icon} Connect`;
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.gap = "6px";
    }

    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(btn);
    wrap.appendChild(row);

    if (connector.comingSoon) return wrap;

    /* tools list when connected */
    const toolsList = document.createElement("div");
    toolsList.className = "mcp-tools-list" + (connected ? " show" : "");
    connector.tools.forEach(tool => {
      const tr = document.createElement("div");
      tr.className = "mcp-tool-row";
      tr.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <span><strong>${escHtml(tool.name)}</strong> — ${escHtml(tool.desc)}</span>`;
      toolsList.appendChild(tr);
    });
    wrap.appendChild(toolsList);

    /* button actions */
    if (connected) {
      btn.addEventListener("click", () => {
        clearConnectorCreds(connector.id);
        syncWindowCreds();
        refreshContextBar();
        renderCards();
      });
    } else {
      btn.addEventListener("click", () => {
        if (connector.id === "github") startPAT(connector);
        else startOAuth(connector);
      });
    }

    return wrap;
  }

  /* ── fetch patch ────────────────────────────────────────────────── */

  const SB_AI_URL_PATTERN = /\/functions\/v1\/ai-chatbot/;
  const _origFetch = window.fetch;

  window.fetch = function(input, init, ...rest) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (SB_AI_URL_PATTERN.test(url) && init && init.body) {
      try {
        const body = JSON.parse(init.body);
        const creds = window.__mcpCreds || {};
        if (Object.keys(creds).length) {
          body.mcp_creds = creds;
          init = { ...init, body: JSON.stringify(body) };
        }
      } catch (_) {}
    }
    return _origFetch.call(this, input, init, ...rest);
  };

  /* ── helpers ────────────────────────────────────────────────────── */

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

})();
