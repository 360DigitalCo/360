(() => {
  "use strict";
  const root = document.getElementById("hub-root");
  if (root && window.McpHub) window.McpHub.render(root, {});
})();
