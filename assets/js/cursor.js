/* ============================================================
   360 — CURSOR.JS
   Completely self-contained. Works on every page.
   ============================================================ */
(function () {
  const hasMouseCursor = window.matchMedia("(hover: hover)").matches;
  const body = document.body;

  let rafId = null;
  let trailActive = true;

  function inject() {
    if (!hasMouseCursor) return;

    ["cursor-dot", "cursor-trail", "cursor-crosshair", "cursor-blob"].forEach(cls => {
      if (!document.querySelector("." + cls)) {
        const el = document.createElement("div");
        el.className = cls;
        body.appendChild(el);
      }
    });

    run();
  }

  function run() {
    const dot = document.querySelector(".cursor-dot");
    const trail = document.querySelector(".cursor-trail");
    const crosshair = document.querySelector(".cursor-crosshair");
    const blob = document.querySelector(".cursor-blob");

    let mx = 0;
    let my = 0;
    let tx = 0;
    let ty = 0;

    document.addEventListener("mousemove", e => {
      mx = e.clientX;
      my = e.clientY;

      if (dot) {
        dot.style.left = mx + "px";
        dot.style.top = my + "px";
      }

      if (crosshair) {
        crosshair.style.left = mx + "px";
        crosshair.style.top = my + "px";
      }
    });

    function animateTrail() {
      const dx = mx - tx;
      const dy = my - ty;

      tx += dx * 0.18;
      ty += dy * 0.18;

      if (trail) {
        trail.style.left = tx + "px";
        trail.style.top = ty + "px";
      }

      if (blob) {
        blob.style.left = tx + "px";
        blob.style.top = ty + "px";
      }

      if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
        rafId = requestAnimationFrame(animateTrail);
      } else {
        rafId = null;
      }
    }

    function startTrail() {
      if (trailActive && rafId === null) {
        rafId = requestAnimationFrame(animateTrail);
      }
    }

    document.addEventListener("mousemove", startTrail);

    const savedStyle = localStorage.getItem("360_cursor_style") || "default";
    const savedColor = localStorage.getItem("360_cursor_color");

    applyStyle(savedStyle);

    if (savedColor) {
      applyColor(savedColor);
    }

    document.addEventListener("click", e => {
      const opt = e.target.closest(".cursor-option");

      if (opt && opt.dataset.cursor) {
        e.stopPropagation();
        applyStyle(opt.dataset.cursor);
      }
    });

    const picker = document.getElementById("cursorColorPicker");

    if (picker) {
      picker.value = savedColor || "#3b82f6";

      picker.addEventListener("input", e => {
        applyColor(e.target.value);
      });
    }

    const resetBtn = document.getElementById("cursorColorReset");

    if (resetBtn) {
      resetBtn.addEventListener("click", e => {
        e.stopPropagation();

        body.style.removeProperty("--cursor-color");
        localStorage.removeItem("360_cursor_color");

        if (picker) {
          picker.value = "#3b82f6";
        }
      });
    }

    const observer = new MutationObserver(() => {
      const p = document.getElementById("cursorColorPicker");

      if (p && !p._wired) {
        p._wired = true;
        p.value = localStorage.getItem("360_cursor_color") || "#3b82f6";

        p.addEventListener("input", e => {
          applyColor(e.target.value);
        });
      }

      document.querySelectorAll(".cursor-option").forEach(opt => {
        if (!opt._wired) {
          opt._wired = true;

          opt.addEventListener("click", e => {
            e.stopPropagation();
            applyStyle(opt.dataset.cursor);
          });
        }
      });

      bindSmoothControls();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function applyStyle(style) {
    body.dataset.cursor = style;

    localStorage.setItem("360_cursor_style", style);

    document.querySelectorAll(".cursor-option").forEach(opt => {
      opt.classList.toggle(
        "active",
        opt.dataset.cursor === style
      );
    });

    trailActive =
      style === "ring" ||
      style === "blob" ||
      style === "default";

    if (!trailActive && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function applyColor(hex) {
    body.style.setProperty("--cursor-color", hex);
    localStorage.setItem("360_cursor_color", hex);
  }

  /* ============================================================
     SMOOTH TYPING CARET
     Sitewide caret overlay for:
       - text inputs
       - search inputs
       - email inputs
       - URL inputs
       - telephone inputs
       - password inputs
       - textareas
       - contenteditable elements
     ============================================================ */

  const smoothDefaults = {
    enabled: false,
    slide: 140,
    blink: 550,
    color: "#3b82f6"
  };

  let smoothSettings = loadSmoothSettings();
  let smoothCaret = null;
  let smoothMirror = null;
  let smoothActive = null;
  let smoothFrame = null;

  function loadSmoothSettings() {
    const enabled =
      localStorage.getItem("360_smooth_typing_cursor") === "true";

    const slide = clampNumber(
      localStorage.getItem("360_smooth_typing_slide"),
      40,
      500,
      smoothDefaults.slide
    );

    const blink = clampNumber(
      localStorage.getItem("360_smooth_typing_blink"),
      250,
      1400,
      smoothDefaults.blink
    );

    const savedColor =
      localStorage.getItem("360_smooth_typing_color") || "";

    const color = /^#[0-9a-f]{6}$/i.test(savedColor)
      ? savedColor
      : smoothDefaults.color;

    return {
      enabled,
      slide,
      blink,
      color
    };
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);

    return Number.isFinite(n)
      ? Math.min(max, Math.max(min, n))
      : fallback;
  }

  function isTextEditable(el) {
    if (!el || !(el instanceof Element)) return false;

    if (el.matches("textarea")) {
      return true;
    }

    if (
      el.matches(
        'input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"]'
      )
    ) {
      return true;
    }

    return (
      el.isContentEditable ||
      el.closest('[contenteditable="true"]') === el
    );
  }

  function getEditableTarget(el) {
    if (!el || !(el instanceof Element)) {
      return null;
    }

    if (
      el.matches(
        'textarea, input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"]'
      )
    ) {
      return el;
    }

    const editable = el.closest?.('[contenteditable="true"]');

    return editable && isTextEditable(editable)
      ? editable
      : null;
  }

  function ensureSmoothCaret() {
    if (!smoothCaret) {
      smoothCaret = document.createElement("div");
      smoothCaret.className = "smooth-typing-caret";
      smoothCaret.setAttribute("aria-hidden", "true");

      document.body.appendChild(smoothCaret);
    }

    updateSmoothCaretStyles();

    return smoothCaret;
  }

  function updateSmoothCaretStyles() {
    if (!smoothCaret) return;

    smoothCaret.style.setProperty(
      "--smooth-caret-slide",
      smoothSettings.slide + "ms"
    );

    smoothCaret.style.setProperty(
      "--smooth-caret-blink",
      smoothSettings.blink * 2 + "ms"
    );

    smoothCaret.style.background = smoothSettings.color;

    smoothCaret.style.boxShadow =
      "0 0 7px " + smoothSettings.color;
  }

  function ensureMirror() {
    if (!smoothMirror) {
      smoothMirror = document.createElement("div");

      smoothMirror.className =
        "smooth-typing-caret-mirror";

      smoothMirror.setAttribute(
        "aria-hidden",
        "true"
      );

      document.body.appendChild(smoothMirror);
    }

    return smoothMirror;
  }

  function copyMirrorStyles(source, mirror) {
    const cs = getComputedStyle(source);

    const props = [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "fontVariant",
      "letterSpacing",
      "textTransform",
      "textIndent",
      "textDecoration",
      "lineHeight",
      "wordSpacing",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "boxSizing"
    ];

    props.forEach(prop => {
      mirror.style[prop] = cs[prop];
    });

    mirror.style.color = cs.color;
    mirror.style.textAlign = cs.textAlign;

    mirror.style.whiteSpace =
      source.matches("textarea")
        ? "pre-wrap"
        : "pre";

    mirror.style.wordBreak =
      source.matches("textarea")
        ? "break-word"
        : "normal";

    mirror.style.overflow = "hidden";

    mirror.style.width =
      source.getBoundingClientRect().width + "px";

    mirror.style.height =
      source.getBoundingClientRect().height + "px";
  }

  function caretRectForControl(el) {
    const start =
      typeof el.selectionStart === "number"
        ? el.selectionStart
        : 0;

    let before = (el.value || "").slice(0, start);

    if (el.type === "password") {
      before = "•".repeat(start);
    }

    const mirror = ensureMirror();

    copyMirrorStyles(el, mirror);

    const rect = el.getBoundingClientRect();

    mirror.style.left = rect.left + "px";
    mirror.style.top = rect.top + "px";
    mirror.style.visibility = "hidden";

    mirror.innerHTML = "";

    const textNode = document.createTextNode(
      before || ""
    );

    const marker = document.createElement("span");

    marker.textContent = "\u200b";

    mirror.appendChild(textNode);
    mirror.appendChild(marker);

    const markerRect =
      marker.getBoundingClientRect();

    const cs = getComputedStyle(el);

    const fontSize =
      Number.parseFloat(cs.fontSize) || 16;

    const lineHeight =
      Number.parseFloat(cs.lineHeight) ||
      fontSize * 1.2 ||
      18;

    let left = markerRect.left;
    let top = markerRect.top;

    if (el.matches("textarea")) {
      left -= el.scrollLeft;
      top -= el.scrollTop;
    }

    if (
      el.matches(
        'input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"]'
      )
    ) {
      left -= el.scrollLeft;

      top =
        rect.top +
        Math.max(
          0,
          (rect.height - lineHeight) / 2
        );
    }

    return {
      left,
      top,
      height: Math.max(
        lineHeight,
        markerRect.height || lineHeight
      )
    };
  }

  function caretRectForContentEditable(el) {
    const selection = window.getSelection();

    if (!selection || !selection.rangeCount) {
      return null;
    }

    const range =
      selection.getRangeAt(0).cloneRange();

    let node = range.commonAncestorContainer;

    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }

    if (
      !node ||
      !(node === el || el.contains(node))
    ) {
      return null;
    }

    range.collapse(true);

    let rect =
      range.getClientRects()[0] ||
      range.getBoundingClientRect();

    if (
      !rect ||
      (!rect.width && !rect.height)
    ) {
      const fallback =
        el.getBoundingClientRect();

      rect = {
        left: fallback.left,
        top: fallback.top,
        height: fallback.height
      };
    }

    const cs = getComputedStyle(el);

    const fontSize =
      Number.parseFloat(cs.fontSize) || 16;

    const lineHeight =
      Number.parseFloat(cs.lineHeight) ||
      fontSize * 1.2 ||
      18;

    return {
      left: rect.left,
      top: rect.top,
      height: Math.max(
        lineHeight,
        rect.height || lineHeight
      )
    };
  }

  function placeSmoothCaret() {
    if (
      !smoothSettings.enabled ||
      !smoothActive ||
      !document.contains(smoothActive)
    ) {
      if (smoothCaret) {
        smoothCaret.classList.remove("visible");
      }

      return;
    }

    const el = smoothActive;

    const pos =
      el.isContentEditable &&
      !el.matches("textarea,input")
        ? caretRectForContentEditable(el)
        : caretRectForControl(el);

    if (!pos) return;

    ensureSmoothCaret();

    smoothCaret.style.left =
      Math.round(pos.left) + "px";

    smoothCaret.style.top =
      Math.round(pos.top) + "px";

    smoothCaret.style.height =
      Math.round(pos.height) + "px";

    smoothCaret.classList.add("visible");
  }

  function scheduleSmoothCaret() {
    if (smoothFrame !== null) return;

    smoothFrame = requestAnimationFrame(() => {
      smoothFrame = null;
      placeSmoothCaret();
    });
  }

  function setSmoothActive(el) {
    if (
      smoothActive &&
      smoothActive !== el
    ) {
      smoothActive.style.removeProperty(
        "caret-color"
      );

      smoothActive.classList.remove(
        "smooth-caret-active"
      );
    }

    smoothActive = getEditableTarget(el);

    if (
      !smoothSettings.enabled ||
      !smoothActive
    ) {
      if (smoothActive) {
        smoothActive.classList.remove(
          "smooth-caret-active"
        );
      }

      if (smoothCaret) {
        smoothCaret.classList.remove("visible");
      }

      return;
    }

    smoothActive.classList.add(
      "smooth-caret-active"
    );

    smoothActive.style.caretColor =
      "transparent";

    ensureSmoothCaret();
    scheduleSmoothCaret();
  }

  function syncSmoothControls() {
    const toggle =
      document.getElementById(
        "smoothTypingCursorToggle"
      );

    const slide =
      document.getElementById(
        "smoothTypingSlide"
      );

    const blink =
      document.getElementById(
        "smoothTypingBlink"
      );

    const color =
      document.getElementById(
        "smoothTypingColor"
      );

    const reset =
      document.getElementById(
        "smoothTypingReset"
      );

    const slideValue =
      document.getElementById(
        "smoothTypingSlideValue"
      );

    const blinkValue =
      document.getElementById(
        "smoothTypingBlinkValue"
      );

    const controls = [
      slide,
      blink,
      color,
      reset
    ].filter(Boolean);

    if (toggle) {
      toggle.classList.toggle(
        "on",
        smoothSettings.enabled
      );
    }

    controls.forEach(control => {
      control.disabled =
        !smoothSettings.enabled;
    });

    if (slide) {
      slide.value =
        String(smoothSettings.slide);
    }

    if (blink) {
      blink.value =
        String(smoothSettings.blink);
    }

    if (color) {
      color.value =
        smoothSettings.color;
    }

    if (slideValue) {
      slideValue.textContent =
        smoothSettings.slide + " ms";
    }

    if (blinkValue) {
      blinkValue.textContent =
        smoothSettings.blink + " ms";
    }

    updateSmoothCaretStyles();
  }

  function applySmoothSettings(
    next,
    persist = true
  ) {
    smoothSettings = {
      enabled: Boolean(next.enabled),

      slide: clampNumber(
        next.slide,
        40,
        500,
        smoothDefaults.slide
      ),

      blink: clampNumber(
        next.blink,
        250,
        1400,
        smoothDefaults.blink
      ),

      color:
        /^#[0-9a-f]{6}$/i.test(
          next.color || ""
        )
          ? next.color
          : smoothDefaults.color
    };

    if (persist) {
      localStorage.setItem(
        "360_smooth_typing_cursor",
        String(smoothSettings.enabled)
      );

      localStorage.setItem(
        "360_smooth_typing_slide",
        String(smoothSettings.slide)
      );

      localStorage.setItem(
        "360_smooth_typing_blink",
        String(smoothSettings.blink)
      );

      localStorage.setItem(
        "360_smooth_typing_color",
        smoothSettings.color
      );
    }

    body.classList.toggle(
      "smooth-typing-caret-enabled",
      smoothSettings.enabled
    );

    if (
      !smoothSettings.enabled &&
      smoothActive
    ) {
      smoothActive.style.removeProperty(
        "caret-color"
      );

      smoothActive.classList.remove(
        "smooth-caret-active"
      );
    } else if (
      smoothSettings.enabled &&
      smoothActive
    ) {
      smoothActive.classList.add(
        "smooth-caret-active"
      );

      smoothActive.style.caretColor =
        "transparent";
    }

    syncSmoothControls();

    if (smoothSettings.enabled) {
      scheduleSmoothCaret();
    } else if (smoothCaret) {
      smoothCaret.classList.remove(
        "visible"
      );
    }

    document.dispatchEvent(
      new CustomEvent(
        "360smoothtypingchange",
        {
          detail: {
            ...smoothSettings
          }
        }
      )
    );
  }

  function bindSmoothControls() {
    const toggle =
      document.getElementById(
        "smoothTypingCursorToggle"
      );

    const slide =
      document.getElementById(
        "smoothTypingSlide"
      );

    const blink =
      document.getElementById(
        "smoothTypingBlink"
      );

    const color =
      document.getElementById(
        "smoothTypingColor"
      );

    const reset =
      document.getElementById(
        "smoothTypingReset"
      );

    if (
      toggle &&
      !toggle._smoothBound
    ) {
      toggle._smoothBound = true;

      toggle.addEventListener(
        "click",
        e => {
          e.stopPropagation();

          applySmoothSettings({
            ...smoothSettings,
            enabled:
              !smoothSettings.enabled
          });
        }
      );
    }

    if (
      slide &&
      !slide._smoothBound
    ) {
      slide._smoothBound = true;

      slide.addEventListener(
        "input",
        e => {
          applySmoothSettings({
            ...smoothSettings,
            slide: e.target.value
          });
        }
      );
    }

    if (
      blink &&
      !blink._smoothBound
    ) {
      blink._smoothBound = true;

      blink.addEventListener(
        "input",
        e => {
          applySmoothSettings({
            ...smoothSettings,
            blink: e.target.value
          });
        }
      );
    }

    if (
      color &&
      !color._smoothBound
    ) {
      color._smoothBound = true;

      color.addEventListener(
        "input",
        e => {
          applySmoothSettings({
            ...smoothSettings,
            color: e.target.value
          });
        }
      );
    }

    if (
      reset &&
      !reset._smoothBound
    ) {
      reset._smoothBound = true;

      reset.addEventListener(
        "click",
        e => {
          e.stopPropagation();

          applySmoothSettings({
            ...smoothDefaults,
            enabled:
              smoothSettings.enabled
          });
        }
      );
    }

    syncSmoothControls();
  }

  function initSmoothTypingCaret() {
    bindSmoothControls();

    document.addEventListener(
      "focusin",
      e => {
        const target =
          getEditableTarget(e.target);

        if (target) {
          setSmoothActive(target);
        }
      }
    );

    document.addEventListener(
      "focusout",
      e => {
        if (
          getEditableTarget(e.target) ===
          smoothActive
        ) {
          setTimeout(() => {
            if (
              !getEditableTarget(
                document.activeElement
              )
            ) {
              if (smoothActive) {
                smoothActive.style.removeProperty(
                  "caret-color"
                );
              }

              smoothActive = null;

              if (smoothCaret) {
                smoothCaret.classList.remove(
                  "visible"
                );
              }
            }
          }, 0);
        }
      }
    );

    [
      "input",
      "keyup",
      "click",
      "select",
      "compositionend"
    ].forEach(type => {
      document.addEventListener(
        type,
        e => {
          if (
            getEditableTarget(e.target)
          ) {
            scheduleSmoothCaret();
          }
        },
        true
      );
    });

    document.addEventListener(
      "selectionchange",
      () => {
        if (smoothActive) {
          scheduleSmoothCaret();
        }
      }
    );

    window.addEventListener(
      "resize",
      scheduleSmoothCaret,
      { passive: true }
    );

    window.addEventListener(
      "scroll",
      scheduleSmoothCaret,
      {
        passive: true,
        capture: true
      }
    );

    window.addEventListener(
      "storage",
      e => {
        if (
          !e.key ||
          !e.key.startsWith(
            "360_smooth_typing_"
          )
        ) {
          return;
        }

        smoothSettings =
          loadSmoothSettings();

        applySmoothSettings(
          smoothSettings,
          false
        );
      }
    );

    const smoothToggle =
      document.getElementById(
        "smoothTypingCursorToggle"
      );

    if (!smoothToggle) {
      const observer =
        new MutationObserver(() => {
          bindSmoothControls();

          if (
            document.getElementById(
              "smoothTypingCursorToggle"
            )
          ) {
            observer.disconnect();
          }
        });

      observer.observe(
        document.body,
        {
          childList: true,
          subtree: true
        }
      );
    }
  }

  function boot() {
    inject();
    initSmoothTypingCaret();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      boot
    );
  } else {
    boot();
  }
})();
