(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const app = $("drive-app");
  const wait = $("drive-auth-wait");
  const authError = $("drive-auth-error");
  const client = typeof supabaseClient !== "undefined" ? supabaseClient : null;
  const views = {
    "my-drive": "My Drive",
    computers: "Computers",
    shared: "Shared with me",
    recent: "Recent",
    starred: "Starred",
    spam: "Spam",
    trash: "Trash"
  };
  let toastTimer;

  function toast(message) {
    const el = $("drive-toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function showError() {
    if (wait) wait.hidden = true;
    if (app) app.hidden = true;
    if (authError) authError.hidden = false;
  }

  function showApp() {
    if (wait) wait.hidden = true;
    if (authError) authError.hidden = true;
    if (app) app.hidden = false;
  }

  function setView(button) {
    document.querySelectorAll(".drive-nav-item").forEach(item => {
      const active = item === button;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });

    const title = views[button.dataset.view] || "My Drive";
    $("drive-view-title").textContent = title;
    const emptyTitle = $("drive-empty-title");
    const emptyDescription = $("drive-empty-description");
    if (button.dataset.view === "my-drive") {
      emptyTitle.textContent = "Your Drive is empty";
      emptyDescription.textContent = "Drop files here or use the New button to add something to your Drive.";
    } else if (button.dataset.view === "shared") {
      emptyTitle.textContent = "Nothing shared with you yet";
      emptyDescription.textContent = "Files and folders shared with your 360 account will appear here.";
    } else if (button.dataset.view === "recent") {
      emptyTitle.textContent = "No recent files";
      emptyDescription.textContent = "Files you open or work on will appear here.";
    } else if (button.dataset.view === "starred") {
      emptyTitle.textContent = "No starred files";
      emptyDescription.textContent = "Add a star to important files to find them here.";
    } else if (button.dataset.view === "trash") {
      emptyTitle.textContent = "Trash is empty";
      emptyDescription.textContent = "Items you move to Trash will appear here.";
    } else if (button.dataset.view === "spam") {
      emptyTitle.textContent = "No spam";
      emptyDescription.textContent = "Items marked as spam will appear here.";
    } else {
      emptyTitle.textContent = "No computers connected";
      emptyDescription.textContent = "Computers connected to your Drive will appear here.";
    }
  }

  function bindNewMenu() {
    const trigger = $("drive-new");
    const menu = $("drive-new-menu");
    const fileInput = $("drive-file-input");
    const folderInput = $("drive-folder-input");

    function closeMenu() {
      if (!menu || !trigger) return;
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }

    trigger?.addEventListener("click", event => {
      event.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
    });

    menu?.addEventListener("click", event => {
      const action = event.target.closest("[data-new-action]")?.dataset.newAction;
      if (!action) return;
      closeMenu();
      if (action === "upload") fileInput?.click();
      else if (action === "folder-upload") folderInput?.click();
      else toast("Creating folders will be available when Drive storage is connected.");
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
      toast(`${count} ${count === 1 ? "file" : "files"} selected. Uploads are not connected yet, so nothing was sent.`);
      input.value = "";
    };
    fileInput?.addEventListener("change", () => handleSelection(fileInput));
    folderInput?.addEventListener("change", () => handleSelection(folderInput));
  }

  function bindNavigation() {
    document.querySelectorAll(".drive-nav-item").forEach(button => {
      button.addEventListener("click", () => setView(button));
    });
  }

  function bindToolbar() {
    const search = $("drive-search");
    search?.addEventListener("input", () => {
      const query = search.value.trim();
      if (query) toast("Search will be available when Drive storage is connected.");
    });

    $("drive-search-options")?.addEventListener("click", () => {
      toast("Search filters will be available when Drive storage is connected.");
    });
    $("drive-sort")?.addEventListener("click", () => {
      toast("Sorting will be available when files are connected.");
    });
    $("drive-details")?.addEventListener("click", () => {
      toast("Select a file to see its details.");
    });
    $("drive-location-menu")?.addEventListener("click", () => {
      toast("Drive options will be available when storage is connected.");
    });
    $("drive-storage-info")?.addEventListener("click", () => {
      toast("Storage information will appear here once storage is connected.");
    });
    $("drive-help")?.addEventListener("click", () => {
      toast("360 Drive help will be added with the storage release.");
    });

    const list = $("drive-list-view");
    const grid = $("drive-grid-view");
    list?.addEventListener("click", () => setLayout("list"));
    grid?.addEventListener("click", () => setLayout("grid"));
  }

  function setLayout(layout) {
    const list = $("drive-list-view");
    const grid = $("drive-grid-view");
    const isList = layout === "list";
    list?.classList.toggle("active", isList);
    grid?.classList.toggle("active", !isList);
    list?.setAttribute("aria-pressed", String(isList));
    grid?.setAttribute("aria-pressed", String(!isList));
    toast(`${isList ? "List" : "Grid"} view selected. Files will appear when storage is connected.`);
  }

  async function init() {
    if (!client?.auth) {
      showError();
      return;
    }

    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!data?.session?.user) {
        showError();
        return;
      }

      showApp();
      bindNewMenu();
      bindNavigation();
      bindToolbar();

      client.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT" || !session?.user) showError();
      });
    } catch (error) {
      console.error("360 Drive account check failed:", error);
      showError();
    }
  }

  init();
})();
