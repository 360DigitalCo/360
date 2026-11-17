(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const client = typeof supabaseClient !== "undefined" ? supabaseClient : null;
  const views = {
    "my-drive": ["My Drive", "Your Drive is empty", "Drop files here or use the New button to add something to your Drive."],
    computers: ["Computers", "No computers connected", "Computers connected to your Drive will appear here."],
    shared: ["Shared with me", "Nothing shared with you yet", "Files and folders shared with your 360 account will appear here."],
    recent: ["Recent", "No recent files", "Files you open or work on will appear here."],
    starred: ["Starred", "No starred files", "Star important items to find them here."],
    spam: ["Spam", "No spam", "Items marked as spam will appear here."],
    trash: ["Trash", "Trash is empty", "Items moved to Trash will appear here."]
  };
  let toastTimer = 0;

  function toast(message) {
    const el = $("drive-toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove("show"), 3000);
  }

  function showSignedIn(isSignedIn) {
    const banner = $("drive-auth-banner");
    if (banner) banner.hidden = !!isSignedIn;
    document.body.classList.toggle("drive-signed-out", !isSignedIn);
    const action = $("desk-auth-action");
    if (action) action.textContent = isSignedIn ? "Sign out" : "Sign in";
  }

  function setView(button) {
    const view = views[button.dataset.view] || views["my-drive"];
    document.querySelectorAll(".drive-nav-item[data-view]").forEach(item => {
      const active = item === button;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    $("drive-view-title").textContent = view[0];
    $("drive-empty-title").textContent = view[1];
    $("drive-empty-description").textContent = view[2];
  }

  function bindNewMenu() {
    const trigger = $("drive-new");
    const menu = $("drive-new-menu");
    const fileInput = $("drive-file-input");
    const folderInput = $("drive-folder-input");
    if (!trigger || !menu) return;

    function closeMenu() {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", event => {
      event.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
    });

    menu.addEventListener("click", event => {
      const action = event.target.closest("[data-new-action]")?.dataset.newAction;
      if (!action) return;
      closeMenu();
      if (action === "upload") fileInput?.click();
      else if (action === "folder-upload") folderInput?.click();
      else toast("Folder creation will be enabled when Drive storage is connected.");
    });

    document.addEventListener("click", event => {
      if (!event.target.closest(".drive-new-wrap")) closeMenu();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeMenu();
    });

    $("drive-empty-upload")?.addEventListener("click", () => fileInput?.click());
    const handleSelection = input => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      const count = files.length;
      toast(`${count} ${count === 1 ? "file" : "files"} selected. Upload is not connected yet, so nothing was sent.`);
      input.value = "";
    };
    fileInput?.addEventListener("change", () => handleSelection(fileInput));
    folderInput?.addEventListener("change", () => handleSelection(folderInput));
  }

  function bindToolbar() {
    document.querySelectorAll(".drive-nav-item[data-view]").forEach(button => {
      button.addEventListener("click", () => setView(button));
    });

    $("drive-search")?.addEventListener("keydown", event => {
      if (event.key === "Enter" && event.currentTarget.value.trim()) {
        toast("Search will be available when Drive storage is connected.");
      }
    });
    $("drive-search-options")?.addEventListener("click", () => toast("Search filters will be added with Drive storage."));
    $("drive-sort")?.addEventListener("click", () => toast("Sorting will be available when files are connected."));
    $("drive-details")?.addEventListener("click", () => toast("Select a file to see its details."));
    $("drive-location-menu")?.addEventListener("click", () => toast("Drive options will be available when storage is connected."));
    $("drive-help")?.addEventListener("click", () => toast("360 Drive help will be added with the storage release."));
    $("drive-storage-info")?.addEventListener("click", () => toast("Storage details will appear when storage is connected."));

    const list = $("drive-list-view");
    const grid = $("drive-grid-view");
    const setLayout = isList => {
      list?.classList.toggle("active", isList);
      grid?.classList.toggle("active", !isList);
      list?.setAttribute("aria-pressed", String(isList));
      grid?.setAttribute("aria-pressed", String(!isList));
      toast(`${isList ? "List" : "Grid"} view selected. File display will be enabled with storage.`);
    };
    list?.addEventListener("click", () => setLayout(true));
    grid?.addEventListener("click", () => setLayout(false));
  }

  async function initAuth() {
    if (!client?.auth) {
      showSignedIn(false);
      toast("360 account services could not be loaded. Refresh the page to try again.");
      return;
    }
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      showSignedIn(!!data?.session?.user);
      client.auth.onAuthStateChange((_event, session) => showSignedIn(!!session?.user));
    } catch (error) {
      console.error("360 Drive sign-in check failed:", error);
      showSignedIn(false);
    }
  }

  function init() {
    bindNewMenu();
    bindToolbar();
    initAuth();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
