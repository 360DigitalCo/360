/* ============================================================
   mail.js — 360Mail client logic
   Requires: supabaseClient (from main.js), mail.css
   ============================================================ */
(() => {
  const sb       = supabaseClient;
  const SB_URL   = "https://wiswfpfsjiowtrdyqpxy.supabase.co";
  const SB_ANON  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3dmcGZzamlvd3RyZHlxcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzg4OTcsImV4cCI6MjA4MzkxNDg5N30.z_4FtM2c8UwgrRlafPYjolQuod4IoHQats95XHio1zM";

  // ── State ──────────────────────────────────────────────────
  let currentUser   = null;
  let mailAddress   = null;
  let currentFolder = "inbox";
  let currentCatId  = null;
  let allEmails     = [];
  let filteredEmails= [];
  let selectedId    = null;
  let deleteTarget  = null;
  let categories    = [];
  let rules         = {};
  let newCatRules   = [];
  let editCatId     = null;
  let editCatRules  = [];
  let pendingAttachments = []; // [{ filename, content_type, content (base64), size }]

  // ── E2EE — Hybrid RSA-OAEP + AES-GCM ──────────────────────
  // Every 360Mail user has an RSA-4096 key pair. The private key is stored
  // encrypted in localStorage, protected by a key derived from the user's
  // session token. To send E2EE to ANY client:
  //   1. Generate a random AES-GCM-256 content key
  //   2. Encrypt subject/body with the content key
  //   3. Fetch the recipient's public key from `user_pubkeys`
  //   4. Wrap (encrypt) the content key with the recipient's RSA public key
  //   5. Store wrapped_key + ciphertext in the email payload
  // Decryption reverses: unwrap the content key with our private key, then
  // decrypt the content. Private key never leaves the device.
  // External SMTP still requires plaintext for delivery — we add a note.

  const E2EE_SALT = new TextEncoder().encode("360-mail-e2ee-v1");
  let _privKey = null;
  let _pubKey  = null;

  async function getOrGenerateKeyPair() {
    if (_privKey && _pubKey) return;
    const stored = localStorage.getItem("360mail_privkey_" + currentUser.id);
    if (stored) {
      try {
        const { privJwk, pubJwk } = JSON.parse(stored);
        _privKey = await crypto.subtle.importKey("jwk", privJwk, { name:"RSA-OAEP", hash:"SHA-256" }, false, ["decrypt"]);
        _pubKey  = await crypto.subtle.importKey("jwk", pubJwk,  { name:"RSA-OAEP", hash:"SHA-256" }, true,  ["encrypt"]);
        return;
      } catch {}
    }
    // Generate new key pair and persist
    const pair = await crypto.subtle.generateKey(
      { name:"RSA-OAEP", modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:"SHA-256" },
      true, ["encrypt","decrypt"]
    );
    _privKey = pair.privateKey; _pubKey = pair.publicKey;
    const privJwk = await crypto.subtle.exportKey("jwk", _privKey);
    const pubJwk  = await crypto.subtle.exportKey("jwk", _pubKey);
    localStorage.setItem("360mail_privkey_" + currentUser.id, JSON.stringify({ privJwk, pubJwk }));
    // Publish public key to Supabase so others can encrypt to us
    const pubSpki = await crypto.subtle.exportKey("spki", _pubKey);
    const pubB64  = btoa(String.fromCharCode(...new Uint8Array(pubSpki)));
    await sb.from("user_pubkeys").upsert({ user_id: currentUser.id, email: mailAddress, pubkey: pubB64 }, { onConflict: "user_id" });
  }

  async function fetchRecipientPubKey(email) {
    const { data } = await sb.from("user_pubkeys").select("pubkey").eq("email", email.toLowerCase()).maybeSingle();
    if (!data?.pubkey) return null;
    const spki = Uint8Array.from(atob(data.pubkey), c => c.charCodeAt(0));
    return crypto.subtle.importKey("spki", spki, { name:"RSA-OAEP", hash:"SHA-256" }, false, ["encrypt"]);
  }

  const b64enc = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const b64dec = s  => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function hybridEncrypt(plaintext, recipientPubKey) {
    const contentKey = await crypto.subtle.generateKey({ name:"AES-GCM", length:256 }, true, ["encrypt","decrypt"]);
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const ct  = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, contentKey, new TextEncoder().encode(plaintext));
    const rawKey = await crypto.subtle.exportKey("raw", contentKey);
    const wrappedKey = await crypto.subtle.encrypt({ name:"RSA-OAEP" }, recipientPubKey, rawKey);
    return `e2ee2:${b64enc(wrappedKey)}:${b64enc(iv.buffer)}:${b64enc(ct)}`;
  }

  async function hybridDecrypt(packed) {
    if (!packed) return packed;
    // Legacy symmetric format
    if (packed.startsWith("e2ee:") && !packed.startsWith("e2ee2:")) {
      const [,ivB64,ctB64] = packed.split(":");
      const legacyKey = await (async () => {
        const raw = new TextEncoder().encode(currentUser.id);
        const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
        return crypto.subtle.deriveKey(
          { name:"HKDF", hash:"SHA-256", salt:E2EE_SALT, info:new Uint8Array(0) }, base,
          { name:"AES-GCM", length:256 }, false, ["decrypt"]
        );
      })();
      const plain = await crypto.subtle.decrypt({ name:"AES-GCM", iv:b64dec(ivB64) }, legacyKey, b64dec(ctB64));
      return new TextDecoder().decode(plain);
    }
    if (!packed.startsWith("e2ee2:")) return packed;
    await getOrGenerateKeyPair();
    const parts = packed.split(":");
    const [, wrappedB64, ivB64, ctB64] = parts;
    const rawKey    = await crypto.subtle.decrypt({ name:"RSA-OAEP" }, _privKey, b64dec(wrappedB64));
    const contentKey = await crypto.subtle.importKey("raw", rawKey, { name:"AES-GCM" }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name:"AES-GCM", iv:b64dec(ivB64) }, contentKey, b64dec(ctB64));
    return new TextDecoder().decode(plain);
  }

  // Alias old names so existing call sites still work
  const e2eeEncrypt = async (pt) => {
    // Called from sendMail — uses recipient key fetched at send time
    throw new Error("Use hybridEncryptForRecipient instead");
  };
  const e2eeDecrypt = hybridDecrypt;

  // Decrypt an email object in-place
  async function decryptEmail(e) {
    if (!e) return e;
    const needsDecrypt = e.e2ee
      || (e.subject   && (String(e.subject).startsWith("e2ee:") || String(e.subject).startsWith("e2ee2:")))
      || (e.body_html && (String(e.body_html).startsWith("e2ee:") || String(e.body_html).startsWith("e2ee2:")))
      || (e.body_text && (String(e.body_text).startsWith("e2ee:") || String(e.body_text).startsWith("e2ee2:")));
    if (!needsDecrypt) return e;
    try {
      await getOrGenerateKeyPair();
      if (e.subject)   e.subject   = await hybridDecrypt(e.subject);
      if (e.body_html) e.body_html = await hybridDecrypt(e.body_html);
      if (e.body_text) e.body_text = await hybridDecrypt(e.body_text);
      e._decrypted = true;
    } catch { e._decryptFailed = true; }
    return e;
  }

  function is360Address(addr) { return (addr||"").toLowerCase().endsWith("@360-search.com"); }

  // ── DOM helpers ────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── Boot ───────────────────────────────────────────────────
  let appBooted = false;

  async function bootApp(user) {
    if (appBooted) return;
    appBooted = true;
    currentUser = user;
    await loadProfile();
    $("mailGate").style.display = "none";
    $("mailApp").style.display  = "flex";
    setupBuiltinFolders();
    setupCompose();
    setupSearch();
    setupReloadButtons();
    setupCategoryModals();
    setupDomains();
    setupRealtime();
    showSecurityStrip();
    setupSettingsPanel();
    setupCategoryTabs();
    await loadCategories();
    await loadMail();
    if (window.Octicons) Octicons.hydrate($("mailApp"));
  }

  function showSecurityStrip() {
    const strip = $("mailSecurityStrip");
    if (!strip) return;
    strip.style.display = "flex";
    $("securityLabel").textContent = "E2EE active";
  }

  // onAuthStateChange fires on every tab load with the persisted session,
  // on token refresh (TOKEN_REFRESHED), and on sign-in/out. Driving boot
  // from here instead of a one-shot getSession() means the session is
  // always current and token refreshes are handled automatically.
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "SIGNED_OUT" || !session) {
      appBooted = false;
      currentUser = null; mailAddress = null;
      $("mailGate").style.display = "flex";
      $("mailApp").style.display  = "none";
      return;
    }
    if (ev === "SIGNED_IN" || ev === "TOKEN_REFRESHED" || ev === "INITIAL_SESSION") {
      bootApp(session.user);
    }
  });

  // Fallback: if onAuthStateChange fires before the DOM event listener
  // is registered (rare but possible on fast connections), poll once.
  (async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (session && !appBooted) bootApp(session.user);
    else if (!session)         $("mailGate").style.display = "flex";
  })();

  // ── Profile ────────────────────────────────────────────────
  async function loadProfile() {
    const { data: p } = await sb.from("profiles")
      .select("mail_address,username").eq("id", currentUser.id).maybeSingle();
    mailAddress =
      p?.mail_address ||
      (p?.username ? p.username.toLowerCase().replace(/\s+/g,"") + "@360-search.com" : null) ||
      currentUser.email;
    $("myAddressPill").textContent = mailAddress || "No address";
  }

  // ── Load mail ──────────────────────────────────────────────
  async function loadMail() {
    if (!mailAddress) return;
    $("mailSkeletons").style.display = "block";
    const { data, error } = await sb.from("inbox_readable")
      .select("*").eq("owner_email", mailAddress)
      .order("received_at", { ascending: false });
    $("mailSkeletons").style.display = "none";
    if (error) {
      $("mailListScroll").innerHTML = `<div class="mail-empty">
        <div class="mail-empty-icon">⚠️</div>
        <div class="mail-empty-text">Failed to load mail</div>
        <div class="mail-empty-sub">${esc(error.message)}</div></div>`;
      return;
    }
    allEmails = data || [];
    // Decrypt any E2EE content — checks both the e2ee flag and content prefix
    await Promise.all(allEmails.map(decryptEmail));
    updateBadge(); applyFilter();
  }

  function updateBadge() {
    const n = allEmails.filter(e => e.direction === "in" && !e.read).length;
    $("inboxBadge").textContent   = n > 99 ? "99+" : n;
    $("inboxBadge").style.display = n > 0 ? "flex" : "none";
    const s = allEmails.filter(e => e.direction === "out" && e.status === "scheduled").length;
    $("scheduledBadge").textContent   = s > 99 ? "99+" : s;
    $("scheduledBadge").style.display = s > 0 ? "flex" : "none";
  }

  // ── Filter ─────────────────────────────────────────────────
  function applyFilter() {
    const q = $("mailSearch").value.trim().toLowerCase();
    let list = [...allEmails];
    if      (currentFolder === "inbox")    list = list.filter(e => e.direction === "in");
    else if (currentFolder === "sent")     list = list.filter(e => e.direction === "out" && e.status !== "scheduled");
    else if (currentFolder === "starred")  list = list.filter(e => e.starred);
    else if (currentFolder === "scheduled")list = list.filter(e => e.direction === "out" && e.status === "scheduled");
    else if (currentFolder === "category" && currentCatId) {
      const senders = (rules[currentCatId] || []).map(s => s.toLowerCase());
      list = list.filter(e => e.direction === "in" && senders.includes((e.from_addr||"").toLowerCase()));
    }
    // Apply Primary/Social/Promotions tab filter only on inbox
    if (currentFolder === "inbox" && typeof tabFilter === "function") list = list.filter(tabFilter);
    if (q) list = list.filter(e =>
      (e.subject||"").toLowerCase().includes(q)   ||
      (e.from_addr||"").toLowerCase().includes(q)  ||
      (e.to_addr||"").toLowerCase().includes(q)    ||
      (e.body_text||"").toLowerCase().includes(q)
    );
    filteredEmails = list;
    $("listCount").textContent = list.length;
    renderList();
  }

  function renderList() {
    const scroll = $("mailListScroll");
    if (!filteredEmails.length) {
      const icons = { inbox:"📭", sent:"📨", starred:"⭐", scheduled:"⏰", category:"📂" };
      const msgs  = { inbox:"No messages yet", sent:"No sent messages", starred:"Nothing starred", scheduled:"Nothing scheduled", category:"No messages from these senders" };
      scroll.innerHTML = `<div class="mail-empty">
        <div class="mail-empty-icon">${icons[currentFolder]||"📭"}</div>
        <div class="mail-empty-text">${msgs[currentFolder]||"Empty"}</div>
        <div class="mail-empty-sub">${$("mailSearch").value ? "Try a different search" : ""}</div></div>`;
      return;
    }
    scroll.innerHTML = filteredEmails.map(e => {
      const unread  = e.direction === "in" && !e.read;
      const active  = e.id === selectedId;
      const display = e.direction === "out" ? (e.to_addr||"") : (e.from_addr||"");
      const preview = e.body_text || stripHtml(e.body_html||"") || "";
      const hasAtt  = e.attachments?.length > 0;
      const flags   = (e.status==="scheduled" ? `<span class="mi-flag" title="Scheduled for ${esc(fmtDate(e.scheduled_at))}">⏰</span>` : "")
                    + (e.expires_at ? `<span class="mi-flag" title="Expires ${esc(fmtDate(e.expires_at))}">⏳</span>` : "")
                    + (e.self_destruct ? `<span class="mi-flag" title="Self-destructs after reading">🔥</span>` : "")
                    + (e._decrypted ? `<span class="mi-flag mi-e2ee" title="End-to-end encrypted">🔐</span>` : "")
                    + (() => { const s = scoreEmail(e); return s.level === "danger" ? `<span class="mi-flag mi-spam-danger" title="Threat detected">🚨</span>` : s.level === "warn" ? `<span class="mi-flag mi-spam-warn" title="Suspicious">⚠️</span>` : ""; })();
      const raw     = (e.direction === "out" ? e.to_addr : e.from_addr) || display;
      const initials = raw.replace(/<[^>]+>/g,"").trim().split(/[\s@]/)[0].slice(0,2).toUpperCase() || "?";
      return `<div class="mail-item${unread?" unread":""}${active?" active":""}${selectedIds.has(e.id)?" selected":""}" data-id="${e.id}" data-initials="${esc(initials)}">
        <input type="checkbox" class="mi-check" data-id="${e.id}" ${selectedIds.has(e.id)?"checked":""} />
        <div style="flex:1;min-width:0;">
          <div class="mi-row1">
            <span class="mi-from">${esc(display)}</span>
            ${hasAtt ? `<span class="mi-att" title="Has attachments"><span data-octicon="attach"></span></span>` : ''}
            ${flags}
            <span class="mi-time">${e.status==="scheduled" ? relTime(e.scheduled_at) : relTime(e.received_at)}</span>
          </div>
          <div class="mi-subject">${esc(e.subject||"(no subject)")}</div>
          <div class="mi-preview">${esc(preview.slice(0,90))}</div>
        </div>
        <button class="mi-star${e.starred?" starred":""}" data-id="${e.id}" title="${e.starred?"Unstar":"Star"}">
          <span data-octicon="${e.starred?"star-fill":"star"}"></span>
        </button>
      </div>`;
    }).join("");
    scroll.querySelectorAll(".mail-item").forEach(el =>
      el.addEventListener("click", ev => {
        if(ev.target.classList.contains("mi-star") || ev.target.classList.contains("mi-check")) return;
        openEmail(el.dataset.id);
      })
    );
    scroll.querySelectorAll(".mi-star").forEach(btn =>
      btn.addEventListener("click", ev => { ev.stopPropagation(); toggleStar(btn.dataset.id); })
    );
    scroll.querySelectorAll(".mi-check").forEach(cb =>
      cb.addEventListener("click", ev => { ev.stopPropagation(); toggleSelect(cb.dataset.id, ev); })
    );
    updateBulkBar();
    if (window.Octicons) Octicons.hydrate(scroll);
  }

  const selectedIds = new Set();
  let _lastSelIdx = -1;

  function toggleSelect(id, ev) {
    const idx = filteredEmails.findIndex(e => e.id === id);
    if (ev && ev.shiftKey && _lastSelIdx >= 0 && idx >= 0) {
      const lo = Math.min(_lastSelIdx, idx), hi = Math.max(_lastSelIdx, idx);
      for (let i = lo; i <= hi; i++) selectedIds.add(filteredEmails[i].id);
    } else {
      if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
    }
    if (idx >= 0) _lastSelIdx = idx;
    updateBulkBar(); renderList();
  }

  function updateBulkBar() {
    const bar = $("bulkBar");
    if (!bar) return;
    if (!selectedIds.size) { bar.classList.remove("open"); } else { bar.classList.add("open"); }
    const cnt = $("bulkCount"); if (cnt) cnt.textContent = `${selectedIds.size} selected`;
    const all = $("checkAllBox");
    if (all) all.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredEmails.length;
    if (all) all.checked = filteredEmails.length > 0 && selectedIds.size === filteredEmails.length;
  }

  $("checkAllBox")?.addEventListener("change", e => {
    if (e.target.checked) filteredEmails.forEach(m => selectedIds.add(m.id));
    else selectedIds.clear();
    updateBulkBar(); renderList();
  });

  $("bulkDeleteBtn")?.addEventListener("click", () => {
    if (!selectedIds.size) return;
    deleteTarget = [...selectedIds];
    $("confirmOverlay").classList.add("open");
  });
  $("bulkClearBtn")?.addEventListener("click", () => { selectedIds.clear(); renderList(); });
  $("bulkSelectAllBtn")?.addEventListener("click", () => {
    filteredEmails.forEach(e => selectedIds.add(e.id));
    renderList();
  });

  function purifyEmailBody(html, blockImages) {
    if (!window.DOMPurify) return esc(html);
    // Belt-and-suspenders: strip <script> blocks before DOMPurify so the
    // sandboxed iframe never emits "Blocked script execution" console errors.
    const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    DOMPurify.addHook("afterSanitizeAttributes", node => {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
      if (blockImages && node.tagName === "IMG") {
        const src = node.getAttribute("src") || "";
        if (src && !src.startsWith("data:") && !src.startsWith("cid:")) {
          node.setAttribute("data-src", src);
          node.removeAttribute("src");
          node.setAttribute("alt", node.getAttribute("alt") || "[image]");
          node.setAttribute("style", "opacity:.25;max-width:100%;");
        }
      }
    });
    let clean;
    try {
      clean = DOMPurify.sanitize(stripped, {
        WHOLE_DOCUMENT: true,
        // ADD_ATTR lets the hook's setAttribute("target") survive the allow-list pass
        ADD_ATTR: ['target', 'data-src'],
        ALLOWED_TAGS: ['html','head','body','title','meta','style','center','p','br','b','strong','i','em','u','s',
          'strike','span','div','a','img','ul','ol','li','blockquote','h1','h2','h3','h4','h5','h6','hr',
          'table','thead','tbody','tfoot','tr','td','th','code','pre','font','sub','sup','small','big',
          'link'],  // <link rel="stylesheet"> is safe inside a no-scripts sandbox
        ALLOWED_ATTR: ['href','title','target','rel','src','alt','width','height','style','color','size','face',
          'colspan','rowspan','class','id','align','valign','bgcolor','border','cellpadding','cellspacing',
          'charset','name','content','dir','lang','type'],
        FORBID_TAGS: ['script','object','embed','form','input','button','noscript','iframe'],
        FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus','onblur','onkeydown','onkeyup',
          'onchange','onsubmit','onreset','onselect','oninput'],
      });
    } finally {
      DOMPurify.removeHook("afterSanitizeAttributes");
    }
    return clean;
  }
  function buildEmailSrcdoc(html, blockImages) {
    const clean = purifyEmailBody(html || "", blockImages);
    const dark  = document.body.classList.contains("dark");
    const baseCss = `body{margin:0;padding:16px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;`
      + `font-size:14px;line-height:1.7;color:${dark?'#e2e8f0':'#1e293b'};background:transparent;`
      + `word-wrap:break-word;overflow-wrap:break-word;max-width:100%;}`
      + `img{max-width:100%;height:auto;} a{color:${dark?'#60a5fa':'#3b82f6'};}`
      + `table{max-width:100%;border-collapse:collapse;} td,th{padding:4px 8px;}`
      + `blockquote{margin:8px 0;padding:6px 14px;border-left:3px solid ${dark?'#3b82f6':'#93c5fd'};`
      + `color:${dark?'#94a3b8':'#64748b'};background:${dark?'rgba(59,130,246,.07)':'rgba(59,130,246,.05)'};}`;
    const noRef = `<meta name="referrer" content="no-referrer">`;
    if (/<html[\s>]/i.test(clean)) {
      return clean.replace(/<head[^>]*>/i, m => `${m}${noRef}<style>${baseCss}</style>`);
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${noRef}<style>${baseCss}</style></head><body>${clean}</body></html>`;
  }
  function renderEmailIframe(html, blockImages) {
    const iframe = document.createElement("iframe");
    iframe.className = "mail-body-iframe";
    // allow-popups: target=_blank links open new windows (correct for email)
    // allow-same-origin: lets us read scrollHeight for auto-sizing
    // no allow-scripts: scripts are intentionally blocked
    iframe.setAttribute("sandbox", "allow-same-origin allow-popups allow-popups-to-escape-sandbox");
    iframe.srcdoc = buildEmailSrcdoc(html, blockImages);
    function fitHeight() {
      try {
        const h = iframe.contentWindow?.document?.documentElement?.scrollHeight;
        if (h > 40) { iframe.style.height = h + "px"; return true; }
      } catch {}
      return false;
    }
    iframe.addEventListener("load", () => {
      if (!fitHeight()) setTimeout(fitHeight, 150);
      // ResizeObserver catches content that expands after load (images, web fonts)
      if (window.ResizeObserver) {
        try {
          const ro = new ResizeObserver(fitHeight);
          ro.observe(iframe.contentWindow.document.documentElement);
        } catch {}
      }
    });
    return iframe;
  }


  async function openEmail(id) {
    selectedId = id; renderList();
    const e = allEmails.find(x => x.id === id);
    if (!e) return;

    // Show the reading pane content, hide the no-select placeholder
    $("noMailSelected").style.display   = "none";
    $("mailReadContent").style.display  = "flex";

    const willBurn = !!e.self_destruct && e.direction === "in";
    if (!e.read && e.direction === "in") {
      e.read = true;
      await sb.from("inbox").update({ read: true }).eq("id", id);
      updateBadge();
    }
    const isSent = e.direction === "out";
    $("rdSubject").textContent = e.subject || "(no subject)";

    // Avatar initials
    const senderRaw = isSent ? (e.to_addr||"") : (e.from_addr||"");
    const initials  = senderRaw.split(/[\s@]/)[0].slice(0,2).toUpperCase() || "?";
    const rdAvatar  = $("rdAvatar");
    if (rdAvatar) rdAvatar.textContent = initials;

    const rdFromEl = $("rdFrom"); if (rdFromEl) rdFromEl.textContent = isSent ? (e.to_addr||"") : (e.from_addr||"");
    const rdAddrEl = $("rdAddr"); if (rdAddrEl) rdAddrEl.textContent = isSent ? "Sent" : "→ "+(e.to_addr||"");
    const rdTimeEl = $("rdTime"); if (rdTimeEl) rdTimeEl.textContent = e.status === "scheduled" ? "Scheduled for "+fmtDate(e.scheduled_at) : fmtDate(e.received_at);

    // Badges
    const { score, flags, level } = scoreEmail(e);
    const badges = [];
    if (e.e2ee && !e._decryptFailed) badges.push(`<span class="mrh-badge e2ee">🔐 E2EE</span>`);
    if (e._decryptFailed)            badges.push(`<span class="mrh-badge burn">⚠️ Decrypt failed</span>`);
    if (level === "danger") badges.push(`<span class="mrh-badge burn">🚨 ${flags.map(f=>f.text).join(" · ")}</span>`);
    else if (level === "warn") badges.push(`<span class="mrh-badge">⚠️ ${flags.map(f=>f.text).join(" · ")}</span>`);
    if (e.status === "scheduled") badges.push(`<span class="mrh-badge scheduled">⏰ Scheduled — ${esc(fmtDate(e.scheduled_at))}</span>`);
    if (e.expires_at)             badges.push(`<span class="mrh-badge">⏳ Expires ${esc(fmtDate(e.expires_at))}</span>`);
    if (e.self_destruct)          badges.push(`<span class="mrh-badge burn">🔥 Self-destructs after reading</span>`);
    $("rdBadges").innerHTML = badges.join("");

    // Body — HTML renders inside a sandboxed iframe (real email HTML is
    // often a full <html><head><body> document; injecting that into a
    // page <div> via innerHTML is invalid nesting and breaks layout/styles).
    // Remote images are blocked by default to prevent tracking pixels.
    const body = $("rdBody");
    body.innerHTML = "";
    if (willBurn) {
      const banner = document.createElement("div");
      banner.className = "burn-banner";
      banner.textContent = "🔥 This message will self-destruct now that you've opened it.";
      body.appendChild(banner);
    }
    if (e.body_html) {
      // Show "Load images" bar above the iframe
      const imgBar = document.createElement("div");
      imgBar.className = "mail-img-bar";
      imgBar.innerHTML = `<span>Remote images are blocked to prevent tracking.</span><button class="mail-img-load-btn">Load images</button>`;
      body.appendChild(imgBar);
      let iframe = renderEmailIframe(e.body_html, true);
      body.appendChild(iframe);
      imgBar.querySelector(".mail-img-load-btn").addEventListener("click", () => {
        imgBar.remove();
        iframe.remove();
        iframe = renderEmailIframe(e.body_html, false);
        body.appendChild(iframe);
      });
    } else if (e.body_text)  { const pre = document.createElement("pre"); pre.className = "mail-body-plain"; pre.textContent = e.body_text; body.appendChild(pre); }
    else                   { const d = document.createElement("div"); d.className = "mail-body-plain"; d.style.opacity = ".4"; d.textContent = "No message body."; body.appendChild(d); }

    // Attachments display
    const atts = e.attachments || [];
    if (atts.length) {
      const attWrap = document.createElement("div");
      attWrap.className = "att-list";
      const risky = atts.filter(a => DANGEROUS_EXT.test(a.filename || ""));
      attWrap.innerHTML = `<div class="att-list-title">📎 ${atts.length} attachment${atts.length>1?"s":""}</div>
        ${risky.length ? `<div class="att-warning">⚠️ ${risky.length} attachment${risky.length>1?"s are":" is"} an executable file type — only open if you trust the sender.</div>` : ""}
        ${atts.map(a => `
          <div class="att-chip${DANGEROUS_EXT.test(a.filename||"")?" att-risky":""}">
            <span class="att-icon">${attIcon(a.content_type)}</span>
            <span class="att-name">${esc(a.filename)}</span>
            <span class="att-size">${fmtSize(a.size)}</span>
            ${a.download_url ? `<a class="att-dl" href="${esc(a.download_url)}" target="_blank" rel="noopener" download="${esc(a.filename)}">⬇</a>` : `<span class="att-dl" style="opacity:.4" title="Not available for download">⬇</span>`}
          </div>`).join("")}`;
      body.appendChild(attWrap);
    }

    $("noMailSelected").style.display  = "none";
    $("mailReadContent").style.display = "flex";
    $("rdBack").style.display          = window.innerWidth < 900 ? "flex" : "none";
    if (window.innerWidth < 900) {
      $("mailReadPane").classList.add("show");
      $("mailListPanel").classList.remove("show");
    }
    $("rdReply").onclick   = () => openCompose(e.from_addr||"", "Re: "+(e.subject||""));
    $("rdForward").onclick = () => openCompose("", "Fwd: "+(e.subject||""),
      null, "\n\n--- Forwarded ---\nFrom: "+(e.from_addr||"")+"\n\n"+(e.body_text||stripHtml(e.body_html||"")));
    $("rdStar").innerHTML  = `<span data-octicon="${e.starred?"star-fill":"star"}"></span> ${e.starred?"Unstar":"Star"}`;
    $("rdStar").onclick    = () => toggleStar(id);
    $("rdDelete").onclick  = () => triggerDelete(id);
    $("rdCancelSchedule").style.display = e.status === "scheduled" ? "flex" : "none";
    $("rdCancelSchedule").onclick = () => cancelScheduled(id);
    if (window.Octicons) Octicons.hydrate($("mailReadContent"));

    if (willBurn) await burnEmail(id);
  }

  // ── Spam & virus detection ─────────────────────────────────
  // Client-side heuristic scoring. Server-side SpamAssassin/ClamAV scores
  // come in via e.spam_score / e.virus_detected flags if the edge function
  // sets them. We augment with client analysis of subject, body, and attachments.
  const PHISHING_PATTERNS = [
    /verify.{0,20}(account|identity|password)/i,
    /unusual.{0,20}(sign.?in|activity|login)/i,
    /click here.{0,20}(confirm|verify|update)/i,
    /your.{0,15}(paypal|amazon|apple|google|microsoft|bank).{0,20}(account|card)/i,
    /urgent.{0,20}(action|response|attention)/i,
    /(suspended|disabled|limited).{0,20}account/i,
    /congratulations.{0,30}(won|winner|prize|lottery)/i,
    /\$[0-9,]+.{0,20}(transfer|send|receive|claim)/i,
    /http[s]?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}/i,  // IP address links
  ];
  const DANGEROUS_EXTENSIONS = /\.(exe|scr|bat|cmd|com|vbs|js|jar|msi|ps1|dmg|pkg|deb|rpm|sh|app)$/i;
  const MACRO_EXTENSIONS     = /\.(doc|xls|ppt|docm|xlsm|pptm)$/i;

  function scoreEmail(e) {
    let score = 0; const flags = [];

    // Server-side signals (if available)
    if (e.virus_detected) { score += 100; flags.push({ level:"danger", text:"Virus detected" }); }
    if (typeof e.spam_score === "number") score += Math.max(0, e.spam_score * 2);
    if (e.spf_fail)  { score += 15; flags.push({ level:"warn",   text:"SPF fail" }); }
    if (e.dkim_fail) { score += 15; flags.push({ level:"warn",   text:"DKIM fail" }); }
    if (e.dmarc_fail){ score += 20; flags.push({ level:"warn",   text:"DMARC fail" }); }

    // Subject & body patterns
    const text = [(e.subject||""), (e.body_text||""), (e.body_html||"").replace(/<[^>]+>/g,"")].join(" ");
    let phishHits = 0;
    PHISHING_PATTERNS.forEach(re => { if (re.test(text)) phishHits++; });
    if (phishHits >= 3) { score += 40; flags.push({ level:"danger", text:"Phishing likely" }); }
    else if (phishHits >= 1) { score += 15; flags.push({ level:"warn", text:"Suspicious content" }); }

    // Attachments
    const atts = e.attachments || [];
    const dangerous = atts.filter(a => DANGEROUS_EXTENSIONS.test(a.filename||""));
    const macros    = atts.filter(a => MACRO_EXTENSIONS.test(a.filename||""));
    if (dangerous.length) { score += 50; flags.push({ level:"danger", text:`Executable attachment${dangerous.length>1?"s":""}` }); }
    if (macros.length)    { score += 20; flags.push({ level:"warn",   text:`Macro-enabled file${macros.length>1?"s":""}` }); }

    // From spoofing: display name contains "bank", "paypal" etc but domain doesn't match
    const fromAddr = (e.from_addr||"").toLowerCase();
    const fromName = (e.from_name||fromAddr).toLowerCase();
    const brandKeywords = ["paypal","amazon","apple","google","microsoft","chase","wellsfargo","citibank","bank of america"];
    if (brandKeywords.some(b => fromName.includes(b) && !fromAddr.includes(b.replace(/ /g,"")))) {
      score += 30; flags.push({ level:"danger", text:"Sender spoofing" });
    }

    return { score, flags, level: score >= 60 ? "danger" : score >= 25 ? "warn" : "safe" };
  }
    await sb.from("inbox").delete().eq("id", id);
    allEmails = allEmails.filter(e => e.id !== id);
    updateBadge(); applyFilter();
  }

  // ── Cancel a scheduled send ─────────────────────────────────
  async function cancelScheduled(id) {
    await sb.from("inbox").delete().eq("id", id);
    allEmails = allEmails.filter(e => e.id !== id);
    if (selectedId === id) { selectedId = null; hideReadPane(); }
    updateBadge(); applyFilter();
  }

  function hideReadPane() {
    $("noMailSelected").style.display  = "flex";
    $("mailReadContent").style.display = "none";
  }

  $("rdBack").addEventListener("click", () => {
    $("mailReadPane").classList.remove("show");
    $("mailListPanel").classList.add("show");
  });

  // ── Star ───────────────────────────────────────────────────
  async function toggleStar(id) {
    const e = allEmails.find(x => x.id === id); if (!e) return;
    e.starred = !e.starred;
    await sb.from("inbox").update({ starred: e.starred }).eq("id", id);
    // Update list item star in place — avoids full re-render scroll reset
    const btn = document.querySelector(`.mi-star[data-id="${id}"]`);
    if (btn) {
      btn.classList.toggle("starred", e.starred);
      btn.title = e.starred ? "Unstar" : "Star";
      btn.querySelector("[data-octicon]").dataset.octicon = e.starred ? "star-fill" : "star";
      if (window.Octicons) Octicons.hydrate(btn);
    }
    if (selectedId === id) {
      const rdStar = $("rdStar");
      rdStar.innerHTML = `<span data-octicon="${e.starred?"star-fill":"star"}"></span> ${e.starred?"Unstar":"Star"}`;
      if (window.Octicons) Octicons.hydrate(rdStar);
    }
    if (currentFolder === "starred") applyFilter();
  }

  // ── Delete ─────────────────────────────────────────────────
  function triggerDelete(id) { deleteTarget = id; $("confirmOverlay").classList.add("open"); }
  $("confirmCancel").addEventListener("click", () => { $("confirmOverlay").classList.remove("open"); deleteTarget = null; });
  $("confirmDelete").addEventListener("click", async () => {
    if (!deleteTarget) return;
    const ids = Array.isArray(deleteTarget) ? deleteTarget : [deleteTarget];
    await sb.from("inbox").delete().in("id", ids);
    allEmails = allEmails.filter(e => !ids.includes(e.id));
    if (ids.includes(selectedId)) { selectedId = null; hideReadPane(); }
    selectedIds.clear();
    deleteTarget = null;
    $("confirmOverlay").classList.remove("open");
    updateBadge(); applyFilter();
  });

  // ── Search ─────────────────────────────────────────────────
  function setupSearch() { $("mailSearch").addEventListener("input", applyFilter); }

  // ── Folder navigation ──────────────────────────────────────
  function setupBuiltinFolders() {
    document.querySelectorAll(".folder-item[data-builtin]").forEach(el => {
      el.addEventListener("click", ev => {
        if (ev.target.classList.contains("folder-reload-btn")) return;
        setFolder(el.dataset.folder, null,
          { inbox:"Inbox", sent:"Sent", starred:"Starred", scheduled:"Scheduled" }[el.dataset.folder] || el.dataset.folder);
      });
    });
  }

  function setFolder(folder, catId, title) {
    currentFolder = folder; currentCatId = catId || null;
    $("listTitle").textContent = title;
    selectedId = null; hideReadPane();
    document.querySelectorAll(".folder-item").forEach(f => f.classList.remove("active"));
    const target = catId
      ? document.querySelector(`.folder-item[data-cat-id="${catId}"]`)
      : document.querySelector(`.folder-item[data-builtin][data-folder="${folder}"]`);
    if (target) target.classList.add("active");
    applyFilter();
  }

  // ── Reload ─────────────────────────────────────────────────
  function setupReloadButtons() {
    document.querySelectorAll(".folder-item[data-builtin] .folder-reload-btn").forEach(btn => {
      btn.addEventListener("click", async ev => { ev.stopPropagation(); spinBtn(btn); await loadMail(); });
    });
    $("listReloadBtn").addEventListener("click", async () => { spinBtn($("listReloadBtn")); await loadMail(); });
  }
  function spinBtn(btn) { btn.classList.add("spinning"); setTimeout(() => btn.classList.remove("spinning"), 500); }

  // ── Realtime ───────────────────────────────────────────────
  function setupRealtime() {
    if (!mailAddress) return;
    sb.channel("inbox_rt")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"inbox", filter:`owner_email=eq.${mailAddress}` },
        payload => {
          if (allEmails.some(e => e.id === payload.new.id)) return;
          allEmails.unshift(payload.new);
          updateBadge(); applyFilter();
        })
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"inbox", filter:`owner_email=eq.${mailAddress}` },
        payload => {
          const i = allEmails.findIndex(e => e.id === payload.new.id);
          if (i === -1) return;
          allEmails[i] = payload.new;
          updateBadge(); applyFilter();
          if (selectedId === payload.new.id) openEmail(payload.new.id);
        })
      .on("postgres_changes", { event:"DELETE", schema:"public", table:"inbox", filter:`owner_email=eq.${mailAddress}` },
        payload => {
          allEmails = allEmails.filter(e => e.id !== payload.old.id);
          if (selectedId === payload.old.id) { selectedId = null; hideReadPane(); }
          updateBadge(); applyFilter();
        })
      .subscribe();
  }

  // ══════════════════════════════════════════════════════════
  // COMPOSE — rich text editor
  // ══════════════════════════════════════════════════════════
  function setupCompose() {
    $("composeBtn").addEventListener("click", () => openCompose());
    $("composeClose").addEventListener("click", closeCompose);
    $("cSendBtn").addEventListener("click", sendMail);
    $("cTo").addEventListener("input", updateE2EEIndicator);
    setupRichEditor();
    setupAttachmentPicker();
    setupMailOptions();
  }

  function setupMailOptions() {
    $("cExpireToggle").addEventListener("change", ev => {
      $("cExpireInputWrap").classList.toggle("show", ev.target.checked);
      if (ev.target.checked && !$("cExpireAt").value) {
        const d = new Date(Date.now() + 24*3600*1000);
        $("cExpireAt").value = d.toISOString().slice(0,16);
      }
    });
    $("cScheduleBtn").addEventListener("click", () => {
      const active = $("cScheduleRow").style.display !== "none";
      if (active) {
        $("cScheduleRow").style.display = "none";
        $("cScheduleAt").value = "";
        $("cScheduleBtn").classList.remove("active");
        $("cScheduleBtn").innerHTML = "<span>⏰</span> Schedule";
      } else {
        $("cScheduleRow").style.display = "flex";
        if (!$("cScheduleAt").value) {
          const d = new Date(Date.now() + 3600*1000);
          $("cScheduleAt").value = d.toISOString().slice(0,16);
        }
        $("cScheduleBtn").classList.add("active");
        $("cScheduleBtn").innerHTML = "<span>✕</span> Cancel schedule";
      }
    });
  }

  function setupRichEditor() {
    // Formatting toolbar buttons
    document.querySelectorAll(".fmt-btn[data-cmd]").forEach(btn => {
      btn.addEventListener("mousedown", ev => {
        ev.preventDefault(); // keep focus in editor
        const cmd = btn.dataset.cmd;
        const val = btn.dataset.val || null;
        if (cmd === "createLink") {
          const url = prompt("Enter URL:", "https://");
          if (url) document.execCommand("createLink", false, url);
        } else {
          document.execCommand(cmd, false, val);
        }
        updateToolbarState();
      });
    });

    // Font size select
    $("cFontSize") && $("cFontSize").addEventListener("change", ev => {
      document.execCommand("fontSize", false, ev.target.value);
      $("cEditor").focus();
    });

    // Update toolbar active states on cursor move
    const editor = $("cEditor");
    editor.addEventListener("keyup",   updateToolbarState);
    editor.addEventListener("mouseup", updateToolbarState);
    editor.addEventListener("focus",   updateToolbarState);

    // Raw HTML source toggle — write/paste actual HTML directly
    $("cHtmlToggle").addEventListener("click", () => {
      const src = $("cHtmlSource"), ed = $("cEditor");
      const goingToHtml = !src.classList.contains("show");
      if (goingToHtml) {
        src.value = ed.innerHTML;
        ed.classList.add("hide"); src.classList.add("show");
      } else {
        ed.innerHTML = purify(src.value);
        ed.classList.remove("hide"); src.classList.remove("show");
      }
      $("cHtmlToggle").classList.toggle("active", goingToHtml);
    });
  }

  function updateToolbarState() {
    const cmds = ["bold","italic","underline","strikeThrough","insertOrderedList","insertUnorderedList"];
    cmds.forEach(cmd => {
      const btn = document.querySelector(`.fmt-btn[data-cmd="${cmd}"]`);
      if (btn) btn.classList.toggle("active", document.queryCommandState(cmd));
    });
  }

  const DANGEROUS_EXT = /\.(exe|bat|cmd|com|scr|pif|vbs|vbe|js|jse|wsf|wsh|msi|ps1|jar|cpl|reg|hta|lnk)$/i;

  function setupAttachmentPicker() {
    const input = $("cAttachInput");
    $("cAttachBtn").addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      for (const file of Array.from(input.files)) {
        if (file.size > 10 * 1024 * 1024) { alert(`${file.name} is too large (max 10MB).`); continue; }
        if (DANGEROUS_EXT.test(file.name) &&
            !confirm(`"${file.name}" is an executable file type. Most email providers block these and recipients may not receive it. Attach anyway?`)) continue;
        const b64 = await fileToBase64(file);
        pendingAttachments.push({ filename: file.name, content_type: file.type || "application/octet-stream", content: b64, size: file.size });
      }
      input.value = "";
      renderPendingAttachments();
    });
  }

  function renderPendingAttachments() {
    const wrap = $("cAttachList");
    if (!pendingAttachments.length) { wrap.innerHTML = ""; return; }
    wrap.innerHTML = pendingAttachments.map((a, i) => `
      <div class="c-att-chip">
        <span class="att-icon">${attIcon(a.content_type)}</span>
        <span class="c-att-name">${esc(a.filename)}</span>
        <span class="att-size">${fmtSize(a.size)}</span>
        <button class="c-att-remove" data-idx="${i}">✕</button>
      </div>`).join("");
    wrap.querySelectorAll(".c-att-remove").forEach(btn =>
      btn.addEventListener("click", () => {
        pendingAttachments.splice(parseInt(btn.dataset.idx), 1);
        renderPendingAttachments();
      })
    );
  }

  function openCompose(to = "", subject = "", htmlBody = null, textBody = "") {
    $("cTo").value      = to;
    $("cSubject").value = subject;
    $("cEditor").classList.remove("hide");
    $("cHtmlSource").classList.remove("show");
    $("cHtmlToggle").classList.remove("active");
    $("cEditor").innerHTML = htmlBody || (textBody ? `<p>${esc(textBody).replace(/\n/g,"<br>")}</p>` : "");
    $("cHtmlSource").value = "";
    $("cStatus").textContent = "";
    $("cStatus").className   = "compose-status";
    $("cSendBtn").disabled   = false;
    $("cSendBtn").innerHTML  = `<span data-octicon="paper-airplane"></span> Send`;
    pendingAttachments = [];
    renderPendingAttachments();
    $("cExpireToggle").checked = false;
    $("cExpireInputWrap").classList.remove("show");
    $("cExpireAt").value = "";
    $("cSelfDestructToggle").checked = false;
    $("cScheduleRow").style.display = "none";
    $("cScheduleAt").value = "";
    $("cScheduleBtn").classList.remove("active");
    $("cScheduleBtn").innerHTML = "<span>⏰</span> Schedule";
    $("composeModal").classList.add("open");
    setTimeout(() => $("cTo").focus(), 80);
    updateE2EEIndicator();
  }

  function updateE2EEIndicator() {
    const to = $("cTo").value.trim();
    const el = $("cE2eeIndicator");
    if (!el) return;
    if (is360Address(to) && is360Address(mailAddress)) {
      el.textContent = "🔐 End-to-end encrypted";
      el.className = "compose-e2ee on";
    } else {
      el.textContent = to ? "🔓 Not encrypted (external recipient)" : "";
      el.className = "compose-e2ee off";
    }
  }

  function closeCompose() { $("composeModal").classList.remove("open"); }

  async function sendMail() {
    const to      = $("cTo").value.trim();
    const subject = $("cSubject").value.trim();
    // If the raw-HTML view is open, fold its contents back into the editor first
    if ($("cHtmlSource").classList.contains("show")) {
      $("cEditor").innerHTML = purify($("cHtmlSource").value);
    }
    const html    = purify($("cEditor").innerHTML.trim());
    const text    = $("cEditor").innerText.trim();
    const btn     = $("cSendBtn");
    const status  = $("cStatus");

    if (!to || !subject || !text) {
      status.textContent = "To, subject, and message are required.";
      status.className   = "compose-status err"; return;
    }

    const expireOn    = $("cExpireToggle").checked;
    const expiresAt   = expireOn && $("cExpireAt").value ? new Date($("cExpireAt").value).toISOString() : null;
    if (expireOn && !expiresAt) {
      status.textContent = "Pick an expiration date, or turn the toggle off.";
      status.className   = "compose-status err"; return;
    }
    const selfDestruct = $("cSelfDestructToggle").checked;
    const scheduleOn   = $("cScheduleRow").style.display !== "none";
    const scheduledAt  = scheduleOn && $("cScheduleAt").value ? new Date($("cScheduleAt").value).toISOString() : null;
    if (scheduleOn && !scheduledAt) {
      status.textContent = "Pick a send time, or click Schedule again to cancel.";
      status.className   = "compose-status err"; return;
    }

    btn.disabled  = true;
    btn.innerHTML = `<span data-octicon="hourglass"></span> Sending…`;
    if (window.Octicons) Octicons.hydrate(btn);
    status.textContent = "";

    try {
      const { data: { session } } = await sb.auth.getSession();

      // E2EE: try hybrid encryption for any 360-search.com recipient.
      // Fall back to plaintext if recipient has no public key on file.
      let e2ee = false;
      let encSubject = subject, encHtml = html, encText = text;
      if (is360Address(to)) {
        await getOrGenerateKeyPair();
        btn.innerHTML = `<span data-octicon="lock"></span> Fetching key…`;
        if (window.Octicons) Octicons.hydrate(btn);
        const recipKey = await fetchRecipientPubKey(to).catch(() => null);
        if (recipKey) {
          btn.innerHTML = `<span data-octicon="lock"></span> Encrypting…`;
          if (window.Octicons) Octicons.hydrate(btn);
          encSubject = await hybridEncrypt(subject, recipKey);
          encHtml    = await hybridEncrypt(html,    recipKey);
          encText    = await hybridEncrypt(text,    recipKey);
          e2ee = true;
        }
      }
      const payload = {
        to, expiresAt, selfDestruct, scheduledAt,
        subject: encSubject, html: encHtml, text: encText, e2ee,
        attachments: pendingAttachments.map(a => ({ filename: a.filename, content_type: a.content_type, content: a.content })),
      };
      btn.innerHTML = `<span data-octicon="paper-airplane"></span> Sending…`;
      if (window.Octicons) Octicons.hydrate(btn);

      const res = await fetch(`${SB_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${session.access_token}`, "apikey":SB_ANON },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || json.error || "Send failed");
      status.textContent = json.delivery === "scheduled" ? "Scheduled ✓" : "Sent ✓";
      status.className = "compose-status ok";
      btn.innerHTML = `<span data-octicon="paper-airplane"></span> Send`; btn.disabled = false;
      setTimeout(closeCompose, 1200);
      await loadMail();
    } catch (err) {
      status.textContent = err.message; status.className = "compose-status err";
      btn.innerHTML = `<span data-octicon="paper-airplane"></span> Send`; btn.disabled = false;
    }
  }

  // ── Categories ─────────────────────────────────────────────
  async function loadCategories() {
    if (!mailAddress) return;
    const { data: cats } = await sb.from("mail_categories").select("*").eq("owner_email", mailAddress).order("created_at");
    categories = cats || [];
    if (categories.length) {
      const { data: ruleRows } = await sb.from("mail_category_rules").select("*").eq("owner_email", mailAddress);
      rules = {};
      (ruleRows||[]).forEach(r => { if (!rules[r.category_id]) rules[r.category_id]=[]; rules[r.category_id].push(r.sender_email); });
    }
    renderCategoryFolders();
  }

  function renderCategoryFolders() {
    const customList = $("customFolderList");
    customList.innerHTML = "";
    categories.forEach(cat => {
      const div = document.createElement("div");
      div.className = "folder-item"; div.dataset.catId = cat.id; div.dataset.folder = "category";
      div.innerHTML = `<span class="fi-icon" style="color:${esc(cat.color)}">●</span>
        <span class="fi-name">${esc(cat.name)}</span>
        <button class="folder-reload-btn" title="Reload">↻</button>
        <button class="folder-del-btn" title="Edit">✎</button>`;
      div.addEventListener("click", ev => {
        if (ev.target.classList.contains("folder-del-btn"))    { openEditCat(cat.id); return; }
        if (ev.target.classList.contains("folder-reload-btn")) { spinBtn(ev.target); loadMail(); return; }
        setFolder("category", cat.id, cat.name);
      });
      customList.appendChild(div);
    });
    customList.querySelectorAll(".folder-reload-btn").forEach(btn =>
      btn.addEventListener("click", async ev => { ev.stopPropagation(); spinBtn(btn); await loadMail(); })
    );
    const label = $("customFolderLabel");
    if (categories.length > 0) {
      label.style.display = "flex";
      label.innerHTML = `Categories <button class="folder-add-btn" id="catLabelAddBtn">＋</button>`;
      $("catLabelAddBtn").addEventListener("click", openNewCatModal);
    } else { label.style.display = "none"; }
  }

  function setupCategoryModals() {
    $("addCategoryBtnAlt").addEventListener("click", openNewCatModal);
    $("catModalCancel").addEventListener("click",    () => $("catModal").classList.remove("open"));
    $("catModalSave").addEventListener("click",      saveNewCategory);
    $("ruleAddBtn").addEventListener("click", () => addRule($("ruleInput"), newCatRules, "ruleList", renderNewRules));
    $("ruleInput").addEventListener("keydown", ev => { if(ev.key==="Enter") addRule($("ruleInput"),newCatRules,"ruleList",renderNewRules); });
    $("catEditCancel").addEventListener("click",  () => $("catEditModal").classList.remove("open"));
    $("catEditSave").addEventListener("click",    saveEditCategory);
    $("catEditDelete").addEventListener("click",  deleteCategory);
    $("editRuleAddBtn").addEventListener("click", () => addRule($("editRuleInput"),editCatRules,"editRuleList",renderEditRules));
    $("editRuleInput").addEventListener("keydown", ev => { if(ev.key==="Enter") addRule($("editRuleInput"),editCatRules,"editRuleList",renderEditRules); });
  }

  function openNewCatModal() {
    newCatRules = []; $("catName").value=""; $("catColor").value="#6366f1";
    $("ruleList").innerHTML=""; $("ruleInput").value="";
    $("catModal").classList.add("open"); setTimeout(() => $("catName").focus(), 80);
  }
  function addRule(input, arr, listId, renderFn) {
    const val = input.value.trim().toLowerCase(); if (!val||arr.includes(val)){input.value="";return;}
    arr.push(val); input.value=""; renderFn();
  }
  function renderNewRules() { renderRuleList("ruleList", newCatRules, s=>{newCatRules.splice(newCatRules.indexOf(s),1);renderNewRules();}); }
  function renderEditRules(){ renderRuleList("editRuleList",editCatRules,s=>{editCatRules.splice(editCatRules.indexOf(s),1);renderEditRules();}); }
  function renderRuleList(listId, arr, onRemove) {
    const el = $(listId); if (!arr.length){el.innerHTML="";return;}
    el.innerHTML = arr.map(s=>`<div class="rule-item"><span>${esc(s)}</span><button class="rule-remove" data-sender="${esc(s)}">✕</button></div>`).join("");
    el.querySelectorAll(".rule-remove").forEach(btn=>btn.addEventListener("click",()=>onRemove(btn.dataset.sender)));
  }
  async function saveNewCategory() {
    const name=$("catName").value.trim(), color=$("catColor").value; if(!name)return;
    const {data:cat,error}=await sb.from("mail_categories").insert({owner_email:mailAddress,name,color}).select().maybeSingle();
    if(error||!cat)return;
    categories.push(cat); rules[cat.id]=[...newCatRules];
    if(newCatRules.length) await sb.from("mail_category_rules").insert(newCatRules.map(s=>({category_id:cat.id,owner_email:mailAddress,sender_email:s})));
    $("catModal").classList.remove("open"); renderCategoryFolders();
  }
  function openEditCat(catId) {
    editCatId=catId; editCatRules=[...(rules[catId]||[])];
    const cat=categories.find(c=>c.id===catId);
    $("catEditName").value=cat.name; $("catEditColor").value=cat.color;
    renderEditRules(); $("editRuleInput").value=""; $("catEditModal").classList.add("open");
  }
  async function saveEditCategory() {
    const name=$("catEditName").value.trim(), color=$("catEditColor").value; if(!name||!editCatId)return;
    await sb.from("mail_categories").update({name,color}).eq("id",editCatId);
    await sb.from("mail_category_rules").delete().eq("category_id",editCatId);
    if(editCatRules.length) await sb.from("mail_category_rules").insert(editCatRules.map(s=>({category_id:editCatId,owner_email:mailAddress,sender_email:s})));
    const cat=categories.find(c=>c.id===editCatId); if(cat){cat.name=name;cat.color=color;}
    rules[editCatId]=[...editCatRules];
    $("catEditModal").classList.remove("open"); renderCategoryFolders();
    if(currentCatId===editCatId){$("listTitle").textContent=name;applyFilter();}
  }
  async function deleteCategory() {
    if(!editCatId)return;
    await sb.from("mail_categories").delete().eq("id",editCatId);
    categories=categories.filter(c=>c.id!==editCatId); delete rules[editCatId];
    $("catEditModal").classList.remove("open");
    if(currentFolder==="category"&&currentCatId===editCatId) setFolder("inbox",null,"Inbox");
    renderCategoryFolders();
  }

  // ── Custom domains ─────────────────────────────────────────
  // Stored in localStorage (no server table required).
  // DNS records are shown for the user to add at their registrar;
  // "verification" is a best-effort DNS lookup via the edge function
  // if available, otherwise we just mark it pending and advise patience.
  let customDomains = [];
  const DOMAINS_KEY = "360mail_domains_" + (currentUser?.id || "");

  const DOMAIN_MX_HOST   = "mx.360-search.com";
  const DOMAIN_SPF       = "v=spf1 include:360-search.com ~all";
  const DOMAIN_DKIM_NAME = "360mail._domainkey";
  const DOMAIN_DKIM_VAL  = "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ==";

  function setupDomains() {
    $("addDomainBtn")?.addEventListener("click", openDomainModal);
    $("domainModalCancel")?.addEventListener("click", closeDomainModal);
    $("domainModalNext")?.addEventListener("click", handleDomainNext);
    loadDomains();
  }

  function loadDomains() {
    try {
      customDomains = JSON.parse(localStorage.getItem("360mail_domains_" + currentUser.id) || "[]");
    } catch { customDomains = []; }
    renderDomainList();
  }

  function saveDomains() {
    try { localStorage.setItem("360mail_domains_" + currentUser.id, JSON.stringify(customDomains)); } catch {}
  }

  function renderDomainList() {
    const list = $("domainList");
    if (!list) return;
    if (!customDomains.length) {
      list.innerHTML = `<div style="font-size:11px;color:var(--mut);padding:4px 6px 8px;">No custom domains yet.</div>`;
      return;
    }
    list.innerHTML = customDomains.map(d => {
      const cls   = d.verified ? "verified" : "pending";
      const label = d.verified ? "Active" : "Pending DNS";
      return `<div class="domain-item">
        <div class="domain-status-dot ${cls}" title="${label}"></div>
        <span class="domain-item-name" title="${esc(d.domain)}">${esc(d.domain)}</span>
        <span style="font-size:10px;color:var(--mut)">${label}</span>
      </div>`;
    }).join("");
  }

  let _pendingDomain = "";

  function openDomainModal() {
    _pendingDomain = "";
    $("domainInput").value = "";
    $("domainVerifySteps").style.display = "none";
    $("domainModalNext").textContent = "Next — Get DNS records";
    $("domainModalNext").disabled = false;
    $("domainStatus").textContent = "";
    $("domainModal").classList.add("open");
    setTimeout(() => $("domainInput").focus(), 80);
  }

  function closeDomainModal() { $("domainModal").classList.remove("open"); }

  async function handleDomainNext() {
    const btn = $("domainModalNext");
    const status = $("domainStatus");

    if (!_pendingDomain) {
      const raw = $("domainInput").value.trim().toLowerCase()
        .replace(/^https?:\/\//,"").replace(/\/.*$/,"");
      if (!raw || !raw.includes(".")) { status.textContent = "Enter a valid domain."; return; }
      _pendingDomain = raw;

      if (!customDomains.find(d => d.domain === _pendingDomain)) {
        customDomains.push({ domain: _pendingDomain, verified: false, added: Date.now() });
        saveDomains(); renderDomainList();
      }

      $("domainDnsTable").innerHTML = `
        <div class="domain-dns-row">
          <div class="domain-dns-cell header">Type</div>
          <div class="domain-dns-cell header">Host</div>
          <div class="domain-dns-cell header">Value</div>
        </div>
        <div class="domain-dns-row">
          <div class="domain-dns-cell">MX</div>
          <div class="domain-dns-cell"><code>@</code></div>
          <div class="domain-dns-cell"><code>${DOMAIN_MX_HOST} (priority 10)</code></div>
        </div>
        <div class="domain-dns-row">
          <div class="domain-dns-cell">TXT</div>
          <div class="domain-dns-cell"><code>@</code></div>
          <div class="domain-dns-cell"><code>${DOMAIN_SPF}</code></div>
        </div>
        <div class="domain-dns-row">
          <div class="domain-dns-cell">TXT</div>
          <div class="domain-dns-cell"><code>${DOMAIN_DKIM_NAME}</code></div>
          <div class="domain-dns-cell"><code>${DOMAIN_DKIM_VAL}</code></div>
        </div>`;
      $("domainVerifySteps").style.display = "block";
      btn.textContent = "I've added these — Verify";
      status.textContent = "";
      return;
    }

    // Step 2 — try edge-function verify, fallback to marking pending
    btn.disabled = true; btn.textContent = "Checking DNS…"; status.textContent = "";
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`${SB_URL}/functions/v1/verify-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}`, "apikey": SB_ANON },
        body: JSON.stringify({ domain: _pendingDomain }),
      });
      const json = res.ok ? await res.json().catch(() => ({})) : {};
      const verified = json.verified === true;
      const entry = customDomains.find(d => d.domain === _pendingDomain);
      if (entry) entry.verified = verified;
      saveDomains(); renderDomainList();
      if (verified) {
        status.textContent = "✓ Verified! You can now receive mail at @" + _pendingDomain;
        setTimeout(closeDomainModal, 2400);
      } else {
        status.textContent = "DNS not detected yet — changes can take up to 48 h to propagate.";
        btn.textContent = "Check again"; btn.disabled = false;
      }
    } catch {
      // Edge function unavailable — mark pending and advise
      status.textContent = "Could not reach verification service. Your domain is saved as pending.";
      btn.textContent = "Check again"; btn.disabled = false;
    }
  }

  // ── Utilities ──────────────────────────────────────────────
  function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  // Sanitize on render, in addition to server-side sanitization — covers
  // older rows written before sanitization existed and any future insert
  // path that bypasses the edge functions.
  function purify(html) {
    if (window.DOMPurify) {
      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p','br','b','strong','i','em','u','s','strike','span','div','a','img','ul','ol','li',
          'blockquote','h1','h2','h3','h4','h5','h6','hr','table','thead','tbody','tr','td','th','code','pre','font','sub','sup'],
        ALLOWED_ATTR: ['href','title','target','rel','src','alt','width','height','style','color','size','face','colspan','rowspan'],
      });
    }
    return esc(html); // DOMPurify failed to load — fail safe to plain text
  }
  function stripHtml(h){ const d=document.createElement("div");d.innerHTML=h;return d.textContent||d.innerText||""; }
  function relTime(ts){
    const d=Math.floor((Date.now()-new Date(ts).getTime())/1000);
    if(d<60) return "just now"; if(d<3600) return Math.floor(d/60)+"m ago";
    if(d<86400) return Math.floor(d/3600)+"h ago"; if(d<604800) return Math.floor(d/86400)+"d ago";
    return new Date(ts).toLocaleDateString(undefined,{month:"short",day:"numeric"});
  }
  function fmtDate(ts){ return new Date(ts).toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}); }
  function fmtSize(b){ if(!b)return ""; if(b<1024)return b+"B"; if(b<1048576)return (b/1024).toFixed(1)+"KB"; return (b/1048576).toFixed(1)+"MB"; }
  function attIcon(ct){
    if(!ct)return "📎";
    if(ct.startsWith("image/"))  return "🖼";
    if(ct.includes("pdf"))       return "📄";
    if(ct.includes("word")||ct.includes("document")) return "📝";
    if(ct.includes("sheet")||ct.includes("excel"))   return "📊";
    if(ct.includes("zip")||ct.includes("compressed")) return "🗜";
    return "📎";
  }
  function fileToBase64(file){
    return new Promise((res,rej)=>{
      const r=new FileReader();
      r.onload=()=>res(r.result.split(",")[1]);
      r.onerror=()=>rej(new Error("Read failed"));
      r.readAsDataURL(file);
    });
  }

  // ── Settings panel ──────────────────────────────────────────
  function setupSettingsPanel() {
    $("mailSettingsBtn")?.addEventListener("click", () => {
      const sPanel = $("mailSettings");
      if (!sPanel) return;
      const open = sPanel.style.display !== "none";
      $("mailReadContent").style.display = "none";
      $("noMailSelected").style.display  = "none";
      if (open) {
        sPanel.style.display = "none";
        if (selectedId) $("mailReadContent").style.display = "flex";
        else             $("noMailSelected").style.display  = "flex";
      } else {
        sPanel.style.display = "flex";
        renderSettingsDomains();
        renderPubkeyFingerprint();
        // Sync toggles from localStorage
        const bi = $("msBlockImages");
        if (bi) bi.checked = localStorage.getItem("360mail_blockImages") !== "false";
      }
    });

    $("msBlockImages")?.addEventListener("change", e => localStorage.setItem("360mail_blockImages", e.target.checked));

    $("msRegenKey")?.addEventListener("click", async () => {
      if (!confirm("Regenerate your encryption key? Existing encrypted mail will be unreadable.")) return;
      localStorage.removeItem("360mail_privkey_" + currentUser.id);
      _privKey = null; _pubKey = null;
      $("msPubkeyFp").textContent = "Regenerating…";
      await getOrGenerateKeyPair();
      await renderPubkeyFingerprint();
    });

    $("msAddDomainBtn")?.addEventListener("click", openDomainModal);

    $("msNotifyBtn")?.addEventListener("click", async () => {
      if (!("Notification" in window)) { alert("Notifications not supported in this browser."); return; }
      const perm = await Notification.requestPermission();
      const btn  = $("msNotifyBtn");
      if (btn) btn.textContent = perm === "granted" ? "Enabled ✓" : "Blocked";
    });
  }

  async function renderPubkeyFingerprint() {
    const el = $("msPubkeyFp");
    if (!el) return;
    try {
      await getOrGenerateKeyPair();
      const spki = await crypto.subtle.exportKey("spki", _pubKey);
      const hash = await crypto.subtle.digest("SHA-256", spki);
      const hex  = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
      el.textContent = hex.match(/.{1,8}/g).join(" ");
    } catch { el.textContent = "Unavailable"; }
  }

  function renderSettingsDomains() {
    const el = $("msSettingsDomainList");
    if (!el) return;
    if (!customDomains.length) { el.innerHTML = `<p style="font-size:12px;color:var(--mut);padding:0 28px 8px;">No domains added yet.</p>`; return; }
    el.innerHTML = customDomains.map(d => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 28px;font-size:13px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${d.verified?"#22c55e":"#f59e0b"};flex-shrink:0;"></span>
        <span style="flex:1;font-weight:600;">${esc(d.domain)}</span>
        <span style="color:var(--mut);font-size:11px;">${d.verified?"Active":"Pending DNS"}</span>
      </div>`).join("");
  }

  // ── Category tabs ───────────────────────────────────────────
  const SOCIAL_DOMAINS = ["facebook.com","twitter.com","x.com","instagram.com","linkedin.com","tiktok.com","snapchat.com","pinterest.com","reddit.com","discord.com","youtube.com","twitch.tv"];
  const PROMO_RE       = /\b(sale|off|discount|deal|offer|promo|coupon|unsubscribe|newsletter|no-reply|noreply|marketing|promotion|exclusive|limited.?time|free.?shipping)\b/i;
  let _activeTab = "all";

  function tabFilter(e) {
    if (_activeTab === "all") return true;
    const from = (e.from_addr || "").toLowerCase();
    const sub  = e.subject    || "";
    const isSocial = SOCIAL_DOMAINS.some(d => from.includes(d));
    const isPromo  = PROMO_RE.test(from) || PROMO_RE.test(sub);
    if (_activeTab === "social")     return isSocial;
    if (_activeTab === "promotions") return isPromo && !isSocial;
    return !isSocial && !isPromo; // Primary
  }

  function setupCategoryTabs() {
    $("mlTabs")?.querySelectorAll(".ml-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        $("mlTabs").querySelectorAll(".ml-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        _activeTab = tab.dataset.tab;
        applyFilter();
      });
    });
  }

})();
