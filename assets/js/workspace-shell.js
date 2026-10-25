(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const client = typeof supabaseClient !== "undefined" ? supabaseClient : null;
  const trigger = $("desk-profile-trigger"), menu = $("desk-profile-menu"), authAction = $("desk-auth-action");

  function setMenu(open) {
    if (!menu || !trigger) return;
    menu.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
  }
  function paintAvatar(el, name, url) {
    if (!el) return;
    el.replaceChildren();
    const initial = String(name || "G").trim().slice(0, 1).toUpperCase() || "G";
    if (url && /^https?:\/\//i.test(url)) {
      const img = document.createElement("img");
      img.src = url; img.alt = ""; img.referrerPolicy = "no-referrer";
      img.onerror = () => { el.replaceChildren(document.createTextNode(initial)); };
      el.append(img);
    } else el.textContent = initial;
  }
  async function updateProfile(user) {
    let name = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.username || user?.email?.split("@")[0] || "Guest";
    let avatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "";
    if (client && user?.id) {
      try {
        const { data } = await client.from("profiles").select("username,avatar_url").eq("id", user.id).maybeSingle();
        if (data) { name = data.username || name; avatar = data.avatar_url || avatar; }
      } catch (_) {}
    }
    const email = user?.email || "Not signed in";
    if ($("desk-profile-name")) $("desk-profile-name").textContent = name;
    if ($("desk-profile-subtitle")) $("desk-profile-subtitle").textContent = user ? "Your account" : "Guest session";
    if ($("desk-menu-name")) $("desk-menu-name").textContent = name;
    if ($("desk-menu-email")) $("desk-menu-email").textContent = email;
    paintAvatar($("desk-profile-avatar"), name, avatar);
    paintAvatar($("desk-menu-avatar"), name, avatar);
    if (authAction) authAction.textContent = user ? "Sign out" : "Sign in";
    if (authAction) authAction.dataset.signedIn = String(!!user);
  }
  // Keep the restored site-wide 360 menu button accessible without changing its items.
  const siteMenuTrigger = $("sidebarToggle"), siteMenu = $("sidebar"), siteMenuOverlay = $("overlay");
  const syncSiteMenuState = () => siteMenuTrigger?.setAttribute("aria-expanded", String(!!siteMenu?.classList.contains("open")));
  siteMenuTrigger?.addEventListener("click", () => requestAnimationFrame(syncSiteMenuState));
  siteMenuOverlay?.addEventListener("click", () => requestAnimationFrame(syncSiteMenuState));
  document.addEventListener("click", event => {
    if (!event.target?.closest?.(".sidebar") && !event.target?.closest?.("#sidebarToggle")) requestAnimationFrame(syncSiteMenuState);
  });

  trigger?.addEventListener("click", e => { e.stopPropagation(); setMenu(!!menu?.hidden); });
  document.addEventListener("click", e => { if (menu && !menu.hidden && !menu.contains(e.target) && !trigger?.contains(e.target)) setMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });
  authAction?.addEventListener("click", async () => {
    setMenu(false);
    const from = encodeURIComponent(location.pathname + location.search);
    if (!client) { location.href = `/signin?from=${from}`; return; }
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (data?.session) { await client.auth.signOut(); await updateProfile(null); }
      else location.href = `/signin?from=${from}`;
    } catch (_) { location.href = `/signin?from=${from}`; }
  });
  if (client) {
    client.auth.getSession().then(({ data }) => updateProfile(data?.session?.user || null)).catch(() => updateProfile(null));
    client.auth.onAuthStateChange((_event, session) => setTimeout(() => updateProfile(session?.user || null), 0));
  } else updateProfile(null);
})();
