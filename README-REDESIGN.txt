360 Workspace redesign patch

Apply this patch on top of the current 360DigitalCo/360 master branch. It intentionally does not replace assets/js/ai.js or assets/js/main.js, preserving the existing AI stream and site-wide logic from the latest repository state.

The AI page now has a standalone 360 workspace design: deep navy rail, light editorial workspace, distinct prompt cards, a slide-out history drawer, a profile/preferences menu, and a bottom composer. The other pages share a consistent workspace shell and avoid the legacy global sidebar styles.

Included pages: ai.html, plugins.html, library.html, health.html, scholar.html.

Private Library storage was already configured in Supabase. The migration file is named 20261025132513_ai_library_private_storage.sql to match the migration version recorded by Supabase. If you previously kept a duplicate file named 20261025140000_ai_library_private_storage.sql, delete that duplicate so two versions do not try to create the same policies.

The AI page keeps the current existing ai.js sender and model/MCP handlers. The AI preferences script enables !web and Scholar instructions just before sending, and keeps a private copy of signed-in users' AI attachments in the Library without replacing the existing chat attachment flow.

This is a source patch. It has not been pushed to GitHub Pages. Browser rendering was unavailable in this environment; JavaScript syntax, CSS parsing, HTML structure, element hooks, and local asset paths were checked.
