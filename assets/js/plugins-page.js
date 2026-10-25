(() => {
  "use strict";
  document.querySelectorAll(".plugin-row").forEach((row) => {
    row.setAttribute("aria-label", `${row.querySelector("h3")?.textContent || "Plugin"}: coming soon`);
  });
})();
