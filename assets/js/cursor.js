/* ============================================================
   360 — CURSOR.JS
   Existing mouse cursor + optional sitewide smooth typing caret.
   The two systems are intentionally independent.
   ============================================================ */
(function () {
  function initMouseCursor() {
    /* Skip the custom mouse cursor on touch devices. */
    if (!window.matchMedia('(hover: hover)').matches) return;

    const body = document.body;
    if (!body) return;

    let rafId = null;
    let trailActive = true;

    function inject() {
      ['cursor-dot', 'cursor-trail', 'cursor-crosshair', 'cursor-blob'].forEach(cls => {
        if (!document.querySelector('.' + cls)) {
          const el = document.createElement('div');
          el.className = cls;
          body.appendChild(el);
        }
      });
      run();
    }

    function run() {
      const dot = document.querySelector('.cursor-dot');
      const trail = document.querySelector('.cursor-trail');
      const crosshair = document.querySelector('.cursor-crosshair');
      const blob = document.querySelector('.cursor-blob');

      let mx = 0, my = 0;
      let tx = 0, ty = 0;

      document.addEventListener('mousemove', e => {
        mx = e.clientX;
        my = e.clientY;

        if (dot) {
          dot.style.left = mx + 'px';
          dot.style.top = my + 'px';
        }

        if (crosshair) {
          crosshair.style.left = mx + 'px';
          crosshair.style.top = my + 'px';
        }
      });

      function animateTrail() {
        const dx = mx - tx;
        const dy = my - ty;

        tx += dx * 0.18;
        ty += dy * 0.18;

        if (trail) {
          trail.style.left = tx + 'px';
          trail.style.top = ty + 'px';
        }

        if (blob) {
          blob.style.left = tx + 'px';
          blob.style.top = ty + 'px';
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

      document.addEventListener('mousemove', startTrail);

      const savedStyle =
        localStorage.getItem('360_cursor_style') || 'default';

      const savedColor =
        localStorage.getItem('360_cursor_color');

      applyStyle(savedStyle);

      if (savedColor) {
        applyColor(savedColor);
      }

      document.addEventListener('click', e => {
        const opt = e.target.closest?.('.cursor-option');

        if (opt && opt.dataset.cursor) {
          e.stopPropagation();
          applyStyle(opt.dataset.cursor);
        }
      });

      function bindColorControls() {
        const picker =
          document.getElementById('cursorColorPicker');

        if (picker && !picker._cursorWired) {
          picker._cursorWired = true;
          picker.value = savedColor || '#3b82f6';

          picker.addEventListener('input', e => {
            applyColor(e.target.value);
          });
        }

        const resetBtn =
          document.getElementById('cursorColorReset');

        if (resetBtn && !resetBtn._cursorWired) {
          resetBtn._cursorWired = true;

          resetBtn.addEventListener('click', e => {
            e.stopPropagation();

            body.style.removeProperty('--cursor-color');
            localStorage.removeItem('360_cursor_color');

            const p =
              document.getElementById('cursorColorPicker');

            if (p) {
              p.value = '#3b82f6';
            }
          });
        }

        document.querySelectorAll('.cursor-option').forEach(opt => {
          if (!opt._cursorWired) {
            opt._cursorWired = true;

            opt.addEventListener('click', e => {
              e.stopPropagation();
              applyStyle(opt.dataset.cursor);
            });
          }
        });
      }

      bindColorControls();

      const observer =
        new MutationObserver(bindColorControls);

      observer.observe(body, {
        childList: true,
        subtree: true
      });
    }

    function applyStyle(style) {
      body.dataset.cursor = style;

      localStorage.setItem(
        '360_cursor_style',
        style
      );

      document.querySelectorAll('.cursor-option').forEach(opt => {
        opt.classList.toggle(
          'active',
          opt.dataset.cursor === style
        );
      });

      trailActive =
        style === 'ring' ||
        style === 'blob' ||
        style === 'default';

      if (!trailActive && rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function applyColor(hex) {
      body.style.setProperty(
        '--cursor-color',
        hex
      );

      localStorage.setItem(
        '360_cursor_color',
        hex
      );
    }

    inject();
  }

  /* ============================================================
     SMOOTH TYPING CARET
     ============================================================ */
  function initSmoothTypingCaret() {
    const body = document.body;
    if (!body) return;

    const DEFAULTS = {
      enabled: false,
      slide: 140,
      blink: 550,
      color: '#3b82f6'
    };

    const KEYS = {
      enabled: '360_smooth_typing_cursor',
      slide: '360_smooth_typing_slide',
      blink: '360_smooth_typing_blink',
      color: '360_smooth_typing_color'
    };

    let settings = readSettings();
    let active = null;
    let caret = null;
    let mirror = null;
    let frame = 0;

    function clamp(value, min, max, fallback) {
      const n = Number(value);

      return Number.isFinite(n)
        ? Math.min(max, Math.max(min, n))
        : fallback;
    }

    function readSettings() {
      const color =
        localStorage.getItem(KEYS.color);

      return {
        enabled:
          localStorage.getItem(KEYS.enabled) === 'true',

        slide:
          clamp(
            localStorage.getItem(KEYS.slide),
            40,
            500,
            DEFAULTS.slide
          ),

        blink:
          clamp(
            localStorage.getItem(KEYS.blink),
            250,
            1400,
            DEFAULTS.blink
          ),

        color:
          /^#[0-9a-f]{6}$/i.test(color || '')
            ? color
            : DEFAULTS.color
      };
    }

    function isEditable(el) {
      if (!(el instanceof Element)) return false;

      return el.matches(
        'textarea, input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"], [contenteditable="true"]'
      );
    }

    function editableRoot(el) {
      if (!(el instanceof Element)) return null;

      if (
        el.matches(
          'textarea, input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"]'
        )
      ) {
        return el;
      }

      return el.closest(
        '[contenteditable="true"]'
      );
    }

    function ensureCaret() {
      if (!caret) {
        caret = document.createElement('div');

        caret.className =
          'smooth-typing-caret';

        caret.setAttribute(
          'aria-hidden',
          'true'
        );

        body.appendChild(caret);
      }

      caret.style.setProperty(
        '--smooth-caret-slide',
        settings.slide + 'ms'
      );

      caret.style.setProperty(
        '--smooth-caret-blink',
        (settings.blink * 2) + 'ms'
      );

      caret.style.backgroundColor =
        settings.color;

      caret.style.boxShadow =
        '0 0 7px ' + settings.color;

      return caret;
    }

    function ensureMirror() {
      if (!mirror) {
        mirror =
          document.createElement('div');

        mirror.className =
          'smooth-typing-caret-mirror';

        mirror.setAttribute(
          'aria-hidden',
          'true'
        );

        body.appendChild(mirror);
      }

      return mirror;
    }

    function copyComputedStyles(
      source,
      target
    ) {
      const cs = getComputedStyle(source);

      [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'fontVariant',
        'letterSpacing',
        'textTransform',
        'textIndent',
        'textDecoration',
        'lineHeight',
        'wordSpacing',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth',
        'boxSizing',
        'textAlign'
      ].forEach(prop => {
        target.style[prop] = cs[prop];
      });

      target.style.whiteSpace =
        source.matches('textarea')
          ? 'pre-wrap'
          : 'pre';

      target.style.wordBreak =
        source.matches('textarea')
          ? 'break-word'
          : 'normal';

      target.style.overflow = 'hidden';

      const r =
        source.getBoundingClientRect();

      target.style.width =
        r.width + 'px';

      target.style.height =
        r.height + 'px';
    }

    function inputCaretRect(el) {
      const r =
        el.getBoundingClientRect();

      const mirrorEl =
        ensureMirror();

      copyComputedStyles(
        el,
        mirrorEl
      );

      mirrorEl.style.left =
        r.left + 'px';

      mirrorEl.style.top =
        r.top + 'px';

      mirrorEl.innerHTML = '';

      const selectionStart =
        el.selectionStart || 0;

      const before =
        (el.value || '').slice(
          0,
          selectionStart
        );

      const text =
        document.createTextNode(
          el.type === 'password'
            ? '•'.repeat(selectionStart)
            : before
        );

      const marker =
        document.createElement('span');

      marker.textContent = '\u200b';

      mirrorEl.append(
        text,
        marker
      );

      const markerRect =
        marker.getBoundingClientRect();

      const cs =
        getComputedStyle(el);

      const fontSize =
        Number.parseFloat(
          cs.fontSize
        ) || 16;

      const lineHeight =
        Number.parseFloat(
          cs.lineHeight
        ) || fontSize * 1.2;

      let left =
        markerRect.left;

      let top =
        markerRect.top;

      if (el.matches('textarea')) {
        left -= el.scrollLeft;
        top -= el.scrollTop;
      } else {
        left =
          Math.max(
            r.left,
            left - el.scrollLeft
          );

        top =
          r.top +
          Math.max(
            0,
            (r.height - lineHeight) / 2
          );
      }

      return {
        left,
        top,
        height:
          Math.max(
            lineHeight,
            markerRect.height ||
              lineHeight
          )
      };
    }

    function contenteditableCaretRect(el) {
      const selection =
        window.getSelection();

      if (
        !selection ||
        !selection.rangeCount
      ) {
        return null;
      }

      const range =
        selection
          .getRangeAt(0)
          .cloneRange();

      let node =
        range.commonAncestorContainer;

      if (
        node.nodeType ===
        Node.TEXT_NODE
      ) {
        node = node.parentElement;
      }

      if (
        !node ||
        !(node === el ||
          el.contains(node))
      ) {
        return null;
      }

      range.collapse(true);

      const rect =
        range.getClientRects()[0] ||
        range.getBoundingClientRect();

      if (
        !rect ||
        (!rect.width &&
          !rect.height)
      ) {
        return null;
      }

      const cs =
        getComputedStyle(el);

      const fontSize =
        Number.parseFloat(
          cs.fontSize
        ) || 16;

      const lineHeight =
        Number.parseFloat(
          cs.lineHeight
        ) || fontSize * 1.2;

      return {
        left: rect.left,
        top: rect.top,
        height:
          Math.max(
            lineHeight,
            rect.height ||
              lineHeight
          )
      };
    }

    function moveCaret() {
      if (
        !settings.enabled ||
        !active ||
        !document.contains(active)
      ) {
        if (caret) {
          caret.classList.remove(
            'visible'
          );
        }

        return;
      }

      const pos =
        active.isContentEditable &&
        !active.matches(
          'input, textarea'
        )
          ? contenteditableCaretRect(
              active
            )
          : inputCaretRect(
              active
            );

      if (!pos) return;

      ensureCaret();

      caret.style.left =
        Math.round(pos.left) + 'px';

      caret.style.top =
        Math.round(pos.top) + 'px';

      caret.style.height =
        Math.round(pos.height) + 'px';

      caret.classList.add(
        'visible'
      );
    }

    function schedule() {
      if (frame) return;

      frame =
        requestAnimationFrame(() => {
          frame = 0;
          moveCaret();
        });
    }

    function setActive(el) {
      const target =
        editableRoot(el);

      if (
        active &&
        active !== target
      ) {
        active.classList.remove(
          'smooth-caret-active'
        );

        active.style.removeProperty(
          'caret-color'
        );
      }

      active = target;

      if (
        !settings.enabled ||
        !active
      ) {
        if (active) {
          active.classList.remove(
            'smooth-caret-active'
          );
        }

        if (caret) {
          caret.classList.remove(
            'visible'
          );
        }

        return;
      }

      active.classList.add(
        'smooth-caret-active'
      );

      active.style.caretColor =
        'transparent';

      ensureCaret();
      schedule();
    }

    function syncControls() {
      const toggle =
        document.getElementById(
          'smoothTypingCursorToggle'
        );

      const slide =
        document.getElementById(
          'smoothTypingSlide'
        );

      const blink =
        document.getElementById(
          'smoothTypingBlink'
        );

      const color =
        document.getElementById(
          'smoothTypingColor'
        );

      const reset =
        document.getElementById(
          'smoothTypingReset'
        );

      const slideValue =
        document.getElementById(
          'smoothTypingSlideValue'
        );

      const blinkValue =
        document.getElementById(
          'smoothTypingBlinkValue'
        );

      if (toggle) {
        toggle.classList.toggle(
          'on',
          settings.enabled
        );
      }

      if (slide) {
        slide.value =
          String(settings.slide);

        slide.disabled =
          !settings.enabled;
      }

      if (blink) {
        blink.value =
          String(settings.blink);

        blink.disabled =
          !settings.enabled;
      }

      if (color) {
        color.value =
          settings.color;

        color.disabled =
          !settings.enabled;
      }

      if (reset) {
        reset.disabled =
          !settings.enabled;
      }

      if (slideValue) {
        slideValue.textContent =
          settings.slide + ' ms';
      }

      if (blinkValue) {
        blinkValue.textContent =
          settings.blink + ' ms';
      }

      if (caret) {
        caret.style.setProperty(
          '--smooth-caret-slide',
          settings.slide + 'ms'
        );

        caret.style.setProperty(
          '--smooth-caret-blink',
          (settings.blink * 2) + 'ms'
        );

        caret.style.backgroundColor =
          settings.color;

        caret.style.boxShadow =
          '0 0 7px ' +
          settings.color;
      }
    }

    function writeSettings() {
      localStorage.setItem(
        KEYS.enabled,
        String(settings.enabled)
      );

      localStorage.setItem(
        KEYS.slide,
        String(settings.slide)
      );

      localStorage.setItem(
        KEYS.blink,
        String(settings.blink)
      );

      localStorage.setItem(
        KEYS.color,
        settings.color
      );
    }

    function apply(
      next,
      persist = true
    ) {
      settings = {
        enabled:
          Boolean(next.enabled),

        slide:
          clamp(
            next.slide,
            40,
            500,
            DEFAULTS.slide
          ),

        blink:
          clamp(
            next.blink,
            250,
            1400,
            DEFAULTS.blink
          ),

        color:
          /^#[0-9a-f]{6}$/i.test(
            next.color || ''
          )
            ? next.color
            : DEFAULTS.color
      };

      if (persist) {
        writeSettings();
      }

      body.classList.toggle(
        'smooth-typing-caret-enabled',
        settings.enabled
      );

      if (active) {
        if (settings.enabled) {
          active.classList.add(
            'smooth-caret-active'
          );

          active.style.caretColor =
            'transparent';

          schedule();
        } else {
          active.classList.remove(
            'smooth-caret-active'
          );

          active.style.removeProperty(
            'caret-color'
          );
        }
      }

      if (
        !settings.enabled &&
        caret
      ) {
        caret.classList.remove(
          'visible'
        );
      }

      syncControls();
    }

    function bindControls() {
      const toggle =
        document.getElementById(
          'smoothTypingCursorToggle'
        );

      const slide =
        document.getElementById(
          'smoothTypingSlide'
        );

      const blink =
        document.getElementById(
          'smoothTypingBlink'
        );

      const color =
        document.getElementById(
          'smoothTypingColor'
        );

      const reset =
        document.getElementById(
          'smoothTypingReset'
        );

      if (
        toggle &&
        !toggle._smoothTypingBound
      ) {
        toggle._smoothTypingBound =
          true;

        toggle.addEventListener(
          'click',
          event => {
            event.preventDefault();
            event.stopPropagation();

            apply({
              ...settings,
              enabled:
                !settings.enabled
            });
          }
        );
      }

      if (
        slide &&
        !slide._smoothTypingBound
      ) {
        slide._smoothTypingBound =
          true;

        slide.addEventListener(
          'input',
          event => {
            apply({
              ...settings,
              slide:
                event.target.value
            });
          }
        );
      }

      if (
        blink &&
        !blink._smoothTypingBound
      ) {
        blink._smoothTypingBound =
          true;

        blink.addEventListener(
          'input',
          event => {
            apply({
              ...settings,
              blink:
                event.target.value
            });
          }
        );
      }

      if (
        color &&
        !color._smoothTypingBound
      ) {
        color._smoothTypingBound =
          true;

        color.addEventListener(
          'input',
          event => {
            apply({
              ...settings,
              color:
                event.target.value
            });
          }
        );
      }

      if (
        reset &&
        !reset._smoothTypingBound
      ) {
        reset._smoothTypingBound =
          true;

        reset.addEventListener(
          'click',
          event => {
            event.preventDefault();
            event.stopPropagation();

            apply({
              ...DEFAULTS,
              enabled:
                settings.enabled
            });
          }
        );
      }

      syncControls();
    }

    bindControls();

    document.addEventListener(
      'focusin',
      event => {
        if (isEditable(event.target)) {
          setActive(event.target);
        }
      },
      true
    );

    document.addEventListener(
      'focusout',
      event => {
        const target =
          editableRoot(event.target);

        if (
          target &&
          target === active
        ) {
          setTimeout(() => {
            const next =
              editableRoot(
                document.activeElement
              );

            if (!next) {
              setActive(null);
            }
          }, 0);
        }
      },
      true
    );

    [
      'input',
      'keyup',
      'click',
      'select',
      'compositionend'
    ].forEach(type => {
      document.addEventListener(
        type,
        event => {
          if (
            editableRoot(
              event.target
            )
          ) {
            schedule();
          }
        },
        true
      );
    });

    document.addEventListener(
      'selectionchange',
      schedule
    );

    window.addEventListener(
      'resize',
      schedule,
      { passive: true }
    );

    window.addEventListener(
      'scroll',
      schedule,
      {
        passive: true,
        capture: true
      }
    );

    window.addEventListener(
      'storage',
      event => {
        if (
          !Object.values(KEYS).includes(
            event.key
          )
        ) {
          return;
        }

        settings =
          readSettings();

        apply(
          settings,
          false
        );
      }
    );

    const observer =
      new MutationObserver(
        bindControls
      );

    observer.observe(body, {
      childList: true,
      subtree: true
    });
  }

  function boot() {
    initMouseCursor();
    initSmoothTypingCaret();
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      boot,
      { once: true }
    );
  } else {
    boot();
  }
})();
