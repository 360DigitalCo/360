/* ============================================================
   emoji.js — 360 emoji → SVG renderer
   Replaces emoji characters in the DOM with inline Twemoji SVGs.
   Skips any element inside .chat-page, .chat-window, [data-raw-emoji],
   or textarea/input/code/pre so chat text and user input are untouched.
   Runs once on DOMContentLoaded, then observes for new nodes.
   ============================================================ */
(function () {
  'use strict';

  const CDN = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';

  // Every emoji present in the 360 codebase → Twemoji SVG filename (no .svg)
  const MAP = {
    '☀':  '2600',   '☁':  '2601',   '☕':  '2615',   '⚙':  '2699',
    '⚠':  '26a0',   '⛅':  '26c5',   '⛈':  '26c8',   '✉':  '2709',
    '✏':  '270f',   '✕':  '2715',   '❄':  '2744',   '⭐':  '2b50',
    '🌆': '1f306',  '🌍': '1f30d',  '🌐': '1f310',  '🌙': '1f319',
    '🌡': '1f321',  '🌤': '1f324',  '🌦': '1f326',  '🌧': '1f327',
    '🌫': '1f32b',  '🌱': '1f331',  '🎛': '1f39b',  '🎨': '1f3a8',
    '🎬': '1f3ac',  '🎮': '1f3ae',  '🎯': '1f3af',  '🎵': '1f3b5',
    '🎶': '1f3b6',  '🏅': '1f3c5',  '🏠': '1f3e0',  '🏫': '1f3eb',
    '👋': '1f44b',  '👑': '1f451',  '👤': '1f464',  '👥': '1f465',
    '💡': '1f4a1',  '💧': '1f4a7',  '💨': '1f4a8',  '💬': '1f4ac',
    '📁': '1f4c1',  '📃': '1f4c3',  '📅': '1f4c5',  '📈': '1f4c8',
    '📍': '1f4cd',  '📖': '1f4d6',  '📜': '1f4dc',  '📝': '1f4dd',
    '📧': '1f4e7',  '📰': '1f4f0',  '📸': '1f4f8',  '📺': '1f4fa',
    '🔍': '1f50d',  '🔐': '1f510',  '🔑': '1f511',  '🔒': '1f512',
    '🔗': '1f517',  '🕥': '1f565',  '🗝': '1f5dd',  '🗺': '1f5fa',
    '🛜': '1f6dc',  '🛠': '1f6e0',  '🤖': '1f916',
    // Symbols that render as emoji in some contexts
    '★':  '2605',   '☆':  '2606',   '✓':  '2713',
  };

  // Build a regex that matches any mapped emoji (longest first to handle multi-char)
  const sorted  = Object.keys(MAP).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    sorted.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'g'
  );

  // Skip subtrees: chat, inputs, code blocks, pre, anything marked data-raw-emoji
  const SKIP_TAGS = new Set(['SCRIPT','STYLE','TEXTAREA','INPUT','CODE','PRE','SVG','IMG']);
  const SKIP_CLASS = ['chat-page','chat-window','chat-msg','chat-bubble','no-emoji'];

  function shouldSkip(node) {
    let el = node.nodeType === 1 ? node : node.parentElement;
    while (el) {
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.dataset && el.dataset.rawEmoji !== undefined) return true;
      if (SKIP_CLASS.some(cls => el.classList && el.classList.contains(cls))) return true;
      el = el.parentElement;
    }
    return false;
  }

  function makeImg(emoji) {
    const code = MAP[emoji];
    if (!code) return null;
    const img = document.createElement('img');
    img.src              = CDN + code + '.svg';
    img.alt              = emoji;
    img.className        = 'em';
    img.setAttribute('aria-label', emoji);
    img.setAttribute('role', 'img');
    img.draggable        = false;
    img.style.cssText    = 'display:inline-block;width:1.15em;height:1.15em;vertical-align:-0.2em;pointer-events:none;';
    return img;
  }

  function processTextNode(node) {
    if (!node.nodeValue || !pattern.test(node.nodeValue)) return;
    pattern.lastIndex = 0; // reset after test()

    const frag  = document.createDocumentFragment();
    let   last  = 0;
    let   match;
    const text  = node.nodeValue;

    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      // text before emoji
      if (match.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, match.index)));
      }
      // strip VS16 (️ U+FE0F) from the matched string for lookup
      const emoji = match[0].replace(/\uFE0F/g, '');
      const img   = makeImg(emoji) || makeImg(match[0]);
      if (img) {
        frag.appendChild(img);
      } else {
        frag.appendChild(document.createTextNode(match[0]));
      }
      last = match.index + match[0].length;
    }

    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }

    node.parentNode.replaceChild(frag, node);
  }

  function walkTree(root) {
    if (shouldSkip(root)) return;
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    // Process collected nodes (mutating during walk is unsafe)
    nodes.forEach(processTextNode);
  }

  // Initial pass
  function init() {
    walkTree(document.body);

    // Inject global .em style once
    if (!document.getElementById('em-style')) {
      const s = document.createElement('style');
      s.id = 'em-style';
      s.textContent = '.em{display:inline-block;width:1.15em;height:1.15em;vertical-align:-0.2em;pointer-events:none;user-select:none;}';
      document.head.appendChild(s);
    }
  }

  // Observe new content (dynamically rendered widgets, search results, etc.)
  function observe() {
    const obs = new MutationObserver(mutations => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (node.nodeType === 3) {
            if (!shouldSkip(node)) processTextNode(node);
          } else if (node.nodeType === 1) {
            // Small delay so the subtree is fully inserted before walking
            requestAnimationFrame(() => walkTree(node));
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); observe(); });
  } else {
    init(); observe();
  }
})();
