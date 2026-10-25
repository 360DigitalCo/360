(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const client = typeof supabaseClient !== "undefined" ? supabaseClient : null;
  const btn = $("ai-profile-btn"), menu = $("ai-profile-menu"), settings = $("ai-settings-backdrop");
  const webToggle = $("ai-web-research-toggle"), scholarToggle = $("ai-scholar-mode-toggle");
  const webButton = $("ai-web-toggle");
  const drawer = $("ai-sidebar"), shell = $("ai-shell"), historyBackdrop = $("history-backdrop");
  const historyTrigger = $("ai-chat-sidebar-toggle"), historySearch = $("conv-search");
  const keyWeb = "ai360:webResearch", keyScholar = "ai360:scholarMode";
  const read = (key) => localStorage.getItem(key) === "true";

  function menuOpen(open) {
    if (!menu || !btn) return;
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  }
  function updateResearchButton() {
    if (!webButton) return;
    webButton.setAttribute("aria-pressed", String(read(keyWeb) || read(keyScholar)));
  }
  function syncResearchSettings() {
    if (webToggle) webToggle.checked = read(keyWeb) || read(keyScholar);
    if (scholarToggle) scholarToggle.checked = read(keyScholar);
    updateResearchButton();
  }
  function modelLabel() {
    const dest = $("ai-settings-model-name"), label = $("model-picker-label");
    if (dest) dest.textContent = `${label?.textContent?.trim() || "Default model"} ›`;
  }
  function openSettings() {
    syncResearchSettings(); modelLabel(); menuOpen(false);
    if (settings) { settings.hidden = false; $("ai-settings-close")?.focus(); }
  }
  function closeSettings() { if (settings) settings.hidden = true; }
  function setHistory(open) {
    if (!drawer || !shell) return;
    drawer.classList.toggle("collapsed", !open);
    shell.classList.toggle("sidebar-collapsed", !open);
    drawer.setAttribute("aria-hidden", String(!open));
    if (historyBackdrop) historyBackdrop.hidden = !open;
    historyTrigger?.setAttribute("aria-expanded", String(open));
  }
  function syncHistoryFromClass() {
    const open = !!drawer && !drawer.classList.contains("collapsed");
    if (historyBackdrop) historyBackdrop.hidden = !open;
    drawer?.setAttribute("aria-hidden", String(!open));
    historyTrigger?.setAttribute("aria-expanded", String(open));
  }
  async function updateProfile(user) {
    let name = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.username || (user?.email ? user.email.split("@")[0] : "Guest");
    let avatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "";
    if (client && user?.id) {
      try {
        const { data } = await client.from("profiles").select("username,avatar_url").eq("id", user.id).maybeSingle();
        if (data) { name = data.username || name; avatar = data.avatar_url || avatar; }
      } catch (_) {}
    }
    const initial = String(name || "G").trim().slice(0, 1).toUpperCase() || "G";
    [$("ai-profile-name"), $("ai-profile-menu-name")].forEach(el => { if (el) el.textContent = name; });
    const subtitle = $("ai-profile-subtitle"); if (subtitle) subtitle.textContent = user ? "AI preferences" : "Guest session";
    const email = $("ai-profile-menu-email"); if (email) email.textContent = user?.email || "Not signed in";
    [$("ai-profile-avatar"), $("ai-profile-menu-avatar")].filter(Boolean).forEach(el => {
      el.replaceChildren();
      if (avatar && /^https?:\/\//i.test(avatar)) {
        const img = document.createElement("img"); img.src = avatar; img.alt = ""; img.referrerPolicy = "no-referrer";
        img.onerror = () => { el.replaceChildren(document.createTextNode(initial)); };
        el.append(img);
      } else el.textContent = initial;
    });
    const action = $("ai-profile-auth-action");
    if (action) action.textContent = user ? "Sign out" : "Sign in";
  }

  // Use the same market-data endpoint as 360 Stocks. It requires no browser API key;
  // the Edge Function proxies the upstream quote data and keeps provider credentials server-side.
  const STOCK_DATA_URL = "https://wiswfpfsjiowtrdyqpxy.supabase.co/functions/v1/stock-data";
  const KNOWN_TICKERS = new Set((
    "AAPL MSFT NVDA GOOGL GOOG AMZN TSLA META AMD NFLX INTC ORCL CRM AVGO PLTR SPY QQQ JPM DIS WMT COST COIN IBM BA KO PEP NKE UBER SNAP RBLX F T V MA V MS GS BAC C XOM CVX LLY NVO PFE ABBV TSM ASML ARM SHOP SQ PYPL SOFI RIVN LCID BRK-B BRK-BW"
  ).split(/\s+/));
  const TICKER_ALIASES = [
    ["AAPL", /\bapple\b/i], ["MSFT", /\bmicrosoft\b/i], ["NVDA", /\bnvidia\b/i],
    ["GOOGL", /\b(?:google|alphabet)\b/i], ["AMZN", /\bamazon\b/i], ["TSLA", /\btesla\b/i],
    ["META", /\bmeta platforms?\b/i], ["AMD", /\badvanced micro devices\b/i], ["NFLX", /\bnetflix\b/i],
    ["INTC", /\bintel\b/i], ["ORCL", /\boracle\b/i], ["CRM", /\bsalesforce\b/i], ["AVGO", /\bbroadcom\b/i],
    ["PLTR", /\bpalantir\b/i], ["SPY", /\b(?:s\s*&\s*p\s*500|s&p500|sp500)\b/i], ["QQQ", /\bnasdaq\s*100\b/i],
    ["JPM", /\bjpmorgan\b/i], ["DIS", /\bdisney\b/i], ["WMT", /\bwalmart\b/i], ["COST", /\bcostco\b/i],
    ["COIN", /\bcoinbase\b/i], ["TSM", /\btsmc\b/i], ["UBER", /\buber\b/i], ["SHOP", /\bshopify\b/i],
    ["PYPL", /\bpaypal\b/i], ["SOFI", /\bsofi\b/i], ["RIVN", /\brivian\b/i], ["XOM", /\bexxon(?: mobil)?\b/i],
    ["LLY", /\beli lilly\b/i], ["NVO", /\bnovo nordisk\b/i], ["ARM", /\barm holdings\b/i]
  ];
  const STOCK_INTENT = /\b(?:stocks?|shares?|ticker|stock price|share price|quote|market cap|earnings|valuation|technical indicators?|trading volume|price target|market data|stock market|moving average|rsi)\b/i;
  const COMPANY_ACTION = /\b(?:analy[sz]e|review|compare|research|summari[sz]e|track|how is|tell me about|look at|performance|trend|price|worth|doing)\b/i;
  const NON_TICKERS = new Set((
    "A AI AN AND ARE AS AT BE BUY BY CEO CPI CURRENCIES DATA DAY DO EPS ETF FED FINANCE FOR GDP GO HAS HOW I IPO IS IT ITS ME MY NASDAQ NEWS OF ON OR PE PER PM PMI Q1 Q2 Q3 Q4 RSI SEC SEE SO SRI THE TO USA USD VS WAS WE WHAT WHEN WHERE WHY WITH YOY"
  ).split(/\s+/));
  function findStockSymbols(query) {
    const q = String(query || "");
    const symbols = [];
    const add = value => {
      const symbol = String(value || "").toUpperCase().replace(/\$/g, "");
      if (/^[A-Z]{1,5}(?:[-.][A-Z]{1,2})?$/.test(symbol) && !NON_TICKERS.has(symbol) && !symbols.includes(symbol) && symbols.length < 3) symbols.push(symbol);
    };
    for (const re of [/\$([A-Z]{1,5}(?:[-.][A-Z]{1,2})?)\b/gi, /\b(?:ticker|symbol)\s*(?:is|:|=)?\s*([A-Z]{1,5}(?:[-.][A-Z]{1,2})?)\b/gi]) {
      let match;
      while ((match = re.exec(q)) && symbols.length < 3) add(match[1]);
    }
    const financeQuestion = STOCK_INTENT.test(q) || COMPANY_ACTION.test(q);
    if (financeQuestion) {
      for (const [symbol, pattern] of TICKER_ALIASES) if (pattern.test(q)) add(symbol);
      const upperTokens = q.match(/\b[A-Z]{2,5}(?:[-.][A-Z]{1,2})?\b/g) || [];
      for (const token of upperTokens) {
        if (KNOWN_TICKERS.has(token) || (STOCK_INTENT.test(q) && !NON_TICKERS.has(token))) add(token);
        if (symbols.length >= 3) break;
      }
    }
    return symbols;
  }
  const number = (value, digits = 2) => {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "not available";
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
  };
  const compactNumber = value => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "not available";
    const n = Number(value), a = Math.abs(n);
    if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
    if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    return number(n, 2);
  };
  async function fetchStockSnapshot(symbol) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7200);
    try {
      const url = `${STOCK_DATA_URL}?symbol=${encodeURIComponent(symbol)}&range=6mo`;
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok || data?.error || !data?.symbol) throw new Error(data?.error || `HTTP ${response.status}`);
      return data;
    } finally { clearTimeout(timer); }
  }
  function formatStockSnapshot(data) {
    const currency = data.currency || "USD";
    const price = data.lastClose == null ? "not available" : `${currency} ${number(data.lastClose)}`;
    const change = data.changePct == null ? "not available" : `${Number(data.changePct) >= 0 ? "+" : ""}${number(data.changePct)}%`;
    const range = `${number(data.fiftyTwoWeekLow)} – ${number(data.fiftyTwoWeekHigh)}`;
    const tech = data.technical || {};
    const lines = [
      `${data.companyName || data.symbol} (${data.symbol})`,
      `Latest returned price: ${price}; previous close: ${data.prevClose == null ? "not available" : `${currency} ${number(data.prevClose)}`}; daily change: ${change}.`,
      `Day range: ${data.dayLow == null ? "not available" : `${currency} ${number(data.dayLow)}`} – ${data.dayHigh == null ? "not available" : `${currency} ${number(data.dayHigh)}`}; 52-week range: ${range}.`,
      `Market cap: ${compactNumber(data.marketCap)}; trailing P/E: ${number(data.peRatio)}; forward P/E: ${number(data.forwardPE)}; beta: ${number(data.beta)}; sector: ${data.sector || "not available"}.`,
      `Technical snapshot: ${tech.outlookLabel || "not available"}; RSI(14): ${number(tech.rsi14)}; SMA20: ${tech.sma20 == null ? "not available" : `${currency} ${number(tech.sma20)}`}; SMA50: ${tech.sma50 == null ? "not available" : `${currency} ${number(tech.sma50)}`}.`,
      `Indicator notes: ${(Array.isArray(tech.signals) ? tech.signals : []).slice(0, 4).join("; ") || "not available"}.`,
    ];
    const series = data.series || {}, recent = [];
    const closes = series.closes || [], times = series.timestamps || [];
    for (let i = Math.max(0, closes.length - 8); i < closes.length; i++) {
      if (closes[i] == null) continue;
      const date = times[i] ? new Date(times[i] * 1000).toISOString().slice(0, 10) : "date unavailable";
      recent.push(`${date}: ${number(closes[i])}`);
    }
    if (recent.length) lines.push(`Recent returned closes: ${recent.join(", ")}.`);
    lines.push(`Source: the existing 360 Stocks data function, which proxies Yahoo Finance data. Retrieved ${new Date().toISOString()}. Market data may be delayed, incomplete, or unavailable outside trading hours.`);
    return lines.join("\n");
  }
  function cleanStockSearchQuery(query) {
    return String(query || "")
      .replace(/^\s*!(?:web|search|latest|cite|sources)\s+/i, "")
      .replace(/\$[A-Z]{1,5}\b/gi, " ")
      .replace(/\b(?:what|is|the|a|an|about|me|please|could|would|you|tell|how|doing|looking|like|today|right now|latest|current|recent|stock|stocks|share|shares|price|quote|ticker|symbol|market|market cap|company|performance|trend|history|technical|indicators|valuation|earnings|analyze|analyse|review|research|summarize|summary|compare|with|using|data|for|of|and|in|on|to|should|buy|sell|investment|investing|finance|financial)\b/gi, " ")
      .replace(/[^a-zA-Z0-9 .&-]/g, " ").replace(/\s+/g, " ").trim();
  }
  async function resolveSearchSymbol(query) {
    const term = cleanStockSearchQuery(query);
    if (term.length < 2 || term.length > 45 || /^(?:stocks?|markets?|shares?|finance|market data)$/i.test(term)) return null;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(`${STOCK_DATA_URL}?action=search&q=${encodeURIComponent(term)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) return null;
      const rows = (await response.json())?.quotes || [];
      if (!rows.length) return null;
      const low = term.toLowerCase();
      return rows.find(row => String(row.name || "").toLowerCase().includes(low) || low.includes(String(row.name || "").toLowerCase())) || rows[0];
    } finally { clearTimeout(timer); }
  }
  async function enrichMessage(message, visiblePrompt) {
    const prompt = String(visiblePrompt || message || "").replace(/^\s*!(?:web|search|latest|cite|sources)\s+/i, "");
    const symbols = findStockSymbols(prompt);
    const hasStockIntent = STOCK_INTENT.test(prompt);
    if (!symbols.length && !hasStockIntent) return message;
    let targets = symbols;
    if (!targets.length) {
      const found = await resolveSearchSymbol(prompt).catch(() => null);
      if (found?.symbol) targets = [String(found.symbol).toUpperCase()];
    }
    if (!targets.length) return message;
    const snapshots = await Promise.all(targets.slice(0, 3).map(symbol => fetchStockSnapshot(symbol).catch(() => null)));
    const available = snapshots.filter(Boolean);
    if (!available.length) return message;
    const heading = `[360 Stocks market context — reference data, not investment advice]\n${available.map(formatStockSnapshot).join("\n\n")}`;
    return `${message}\n\n${heading}\nUse this data only as a dated snapshot. Clearly separate facts from interpretation, do not invent missing figures or turn technical signals into a buy/sell instruction, and remind the user to verify quotes and source filings before making a financial decision.`;
  }
  window.AI360Stocks = { enrichMessage };

  btn?.addEventListener("click", e => { e.stopPropagation(); menuOpen(!!menu?.hidden); });
  document.addEventListener("click", e => { if (menu && !menu.hidden && !menu.contains(e.target) && !btn?.contains(e.target)) menuOpen(false); });
  $("ai-open-settings")?.addEventListener("click", openSettings);
  $("ai-open-models")?.addEventListener("click", () => { menuOpen(false); $("model-picker-btn")?.click(); setTimeout(modelLabel, 100); });
  $("ai-open-models-dialog")?.addEventListener("click", () => { closeSettings(); $("model-picker-btn")?.click(); setTimeout(modelLabel, 100); });
  $("ai-settings-close")?.addEventListener("click", closeSettings);
  settings?.addEventListener("click", e => { if (e.target === settings) closeSettings(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeSettings(); menuOpen(false); setHistory(false); } });
  webToggle?.addEventListener("change", () => {
    localStorage.setItem(keyWeb, String(webToggle.checked));
    if (!webToggle.checked && read(keyScholar)) localStorage.setItem(keyScholar, "false");
    syncResearchSettings();
  });
  scholarToggle?.addEventListener("change", () => {
    localStorage.setItem(keyScholar, String(scholarToggle.checked));
    if (scholarToggle.checked) localStorage.setItem(keyWeb, "true");
    syncResearchSettings();
  });
  webButton?.addEventListener("click", () => {
    const next = !(read(keyWeb) || read(keyScholar));
    localStorage.setItem(keyWeb, String(next));
    if (!next) localStorage.setItem(keyScholar, "false");
    syncResearchSettings();
  });

  // Keep research preferences compatible with the current ai.js sender, so
  // this workspace update does not replace or downgrade the existing stream.
  const aiInput = $("ai-input");
  const aiFileInput = $("ai-file-input");
  function applyResearchPreferences(value) {
    let prompt = String(value || "").trim();
    if (!prompt || !(read(keyWeb) || read(keyScholar))) return prompt;
    if (!/^!(?:web|search|latest|cite|sources)\b/i.test(prompt)) prompt = "!web " + prompt;
    if (read(keyScholar) && !prompt.includes("360 Scholar research settings:")) {
      prompt += "\n\n360 Scholar research settings: Prioritize trustworthy primary sources, official documentation, peer-reviewed research and respected publications. Cite direct source links, distinguish evidence from inference, describe uncertainty and limitations, and never invent citations.";
    }
    return prompt;
  }
  function applyResearchToInput() {
    if (!aiInput) return;
    const before = aiInput.value;
    const after = applyResearchPreferences(before);
    if (after !== before) {
      aiInput.value = after;
      aiInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  // Capture before ai.js handles send/Enter. Welcome-card prompts use their
  // data-prompt value, so temporarily update that value before its own handler.
  document.addEventListener("click", event => {
    if (event.target?.closest?.("#ai-send-btn")) applyResearchToInput();
    const chip = event.target?.closest?.(".wl-chip");
    if (!chip || !chip.dataset.prompt) return;
    const previous = chip.dataset.prompt;
    const revised = applyResearchPreferences(previous);
    if (revised !== previous) {
      chip.dataset.prompt = revised;
      setTimeout(() => { if (chip.dataset.prompt === revised) chip.dataset.prompt = previous; }, 0);
    }
  }, true);
  document.addEventListener("keydown", event => {
    if (event.target === aiInput && event.key === "Enter" && !event.shiftKey) applyResearchToInput();
  }, true);

  // AI attachments keep their existing chat URL flow, with a private Library
  // copy for signed-in users. The capture listener runs before ai.js clears
  // the file input; Storage RLS confines the path to the current auth UID.
  aiFileInput?.addEventListener("change", event => {
    const selectedFiles = Array.from(event.target?.files || []);
    if (!selectedFiles.length || !client?.storage || !client?.auth) return;
    (async () => {
      try {
        const { data, error } = await client.auth.getSession();
        const userId = !error ? data?.session?.user?.id : null;
        if (!userId) return;
        for (const file of selectedFiles) {
          if (!file || file.size > 50 * 1024 * 1024) continue;
          const name = String(file.name || "file").split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "file";
          const uid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2);
          const path = `${userId}/${Date.now()}-${uid}-${name}`;
          await client.storage.from("ai-library").upload(path, file, {
            cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream"
          }).catch(() => null);
        }
      } catch (_) {}
    })();
  }, true);
  // ai.js toggles this drawer first; synchronize the shade after that change.
  historyTrigger?.addEventListener("click", () => setTimeout(syncHistoryFromClass, 0));
  $("ai-sidebar-collapse")?.addEventListener("click", () => setTimeout(syncHistoryFromClass, 0));
  historyBackdrop?.addEventListener("click", () => setHistory(false));
  $("new-chat-btn")?.addEventListener("click", () => setHistory(false));
  historySearch?.addEventListener("input", () => {
    const q = historySearch.value.trim().toLowerCase();
    document.querySelectorAll("#conv-list .conv-item").forEach(item => {
      item.hidden = !!q && !item.textContent.toLowerCase().includes(q);
    });
  });
  $("ai-profile-auth-action")?.addEventListener("click", async () => {
    menuOpen(false);
    if (!client) { location.href = "/signin?from=%2Fai%2F"; return; }
    try {
      const { data } = await client.auth.getSession();
      if (data?.session) { await client.auth.signOut(); await updateProfile(null); }
      else location.href = "/signin?from=%2Fai%2F";
    } catch (_) { location.href = "/signin?from=%2Fai%2F"; }
  });
  $("model-picker-btn")?.addEventListener("click", () => setTimeout(modelLabel, 100));

  if (client) {
    client.auth.getSession().then(({ data }) => updateProfile(data?.session?.user || null)).catch(() => updateProfile(null));
    client.auth.onAuthStateChange((_event, session) => { setTimeout(() => updateProfile(session?.user || null), 0); });
  } else updateProfile(null);
  syncResearchSettings();
  syncHistoryFromClass();
  if (new URLSearchParams(location.search).get("settings") === "1") {
    setTimeout(openSettings, 60);
  }
})();
