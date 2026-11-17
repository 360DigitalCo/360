(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const app = $("drive-app");
  const wait = $("drive-auth-wait");
  const authError = $("drive-auth-error");
  const signInUrl = "/signin?from=%2Fdrive%2F";
  const client = typeof supabaseClient !== "undefined" ? supabaseClient : null;

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

  function toast(message) {
    const el = $("drive-toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 3000);
  }

  function bindFilePicker() {
    const picker = $("drive-file-input");
    const choose = () => picker?.click();

    $("drive-upload")?.addEventListener("click", choose);
    $("drive-empty-upload")?.addEventListener("click", choose);

    picker?.addEventListener("change", () => {
      const files = Array.from(picker.files || []);
      if (!files.length) return;
      toast(`${files.length} ${files.length === 1 ? "file" : "files"} selected. Uploads are not enabled yet, so nothing was sent.`);
      $("drive-status").textContent = `${files.length} local file(s) selected. No upload was made.`;
      picker.value = "";
    });
  }

  function bindNavigation() {
    const views = {
      files: ["YOUR SPACE", "My files"],
      recent: ["ACTIVITY", "Recent"],
      starred: ["SAVED", "Starred"],
      shared: ["COLLABORATION", "Shared with me"],
      trash: ["RECOVERY", "Trash"]
    };

    document.querySelectorAll(".drive-nav-item").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".drive-nav-item").forEach(item => {
          item.classList.toggle("active", item === button);
        });
        const view = views[button.dataset.view] || views.files;
        $("drive-view-label").textContent = view[0];
        $("drive-view-title").textContent = view[1];
        $("drive-status").textContent = "This view will show files once storage is connected.";
      });
    });
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
      const user = data.session.user;
      $("drive-status").textContent =
        `Signed in as ${user.email || "your 360 account"}. Storage uploads are not connected yet.`;

      bindFilePicker();
      bindNavigation();

      $("drive-search")?.addEventListener("input", event => {
        $("drive-status").textContent = event.target.value.trim()
          ? "No matching files. Storage has not been connected yet."
          : "Your 360 account is connected. Storage uploads are the next step.";
      });

      $("drive-new-folder")?.addEventListener("click", () => {
        toast("Folder creation will be enabled when storage is connected.");
      });

      $("drive-view-toggle")?.addEventListener("click", () => {
        toast("The file layout will be configurable once files are available.");
      });

      document.addEventListener("keydown", event => {
        if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
          event.preventDefault();
          $("drive-search")?.focus();
        }
      });

      client.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT" || !session) showError();
      });
    } catch (error) {
      console.error("360 Drive account check failed:", error);
      showError();
    }
  }

  init();
})();
