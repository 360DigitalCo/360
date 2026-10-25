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
    if (!client) { location.href = "/signin?from=%2Fai.html"; return; }
    try {
      const { data } = await client.auth.getSession();
      if (data?.session) { await client.auth.signOut(); await updateProfile(null); }
      else location.href = "/signin?from=%2Fai.html";
    } catch (_) { location.href = "/signin?from=%2Fai.html"; }
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
