/* ══════════════════════════════════════════════════════════════
   360 — WIDGETS.JS  v3.6.0
   Homepage draggable widget board + Settings form controller.
   Widget types: clock · weather · note · stocks · countdown ·
                 quote · news · todo · calendar · pomodoro ·
                 currency · rss
══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Storage ───────────────────────────────────────────────── */
  const STORAGE_KEY = '360_widgets_v3';

  function loadWidgets() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }
  function saveWidgets(w) { localStorage.setItem(STORAGE_KEY, JSON.stringify(w)); }
  function uid() { return `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

  function octicon(name) {
    return window.Octicons?.icon ? window.Octicons.icon(name) : '';
  }

  /* ── Widget type registry ──────────────────────────────────── */
  const WIDGET_TYPES = {
    clock:     { label: 'Clock',     icon: 'clock',              color: '#8b5cf6', defaultW: 240, defaultH: 175 },
    weather:   { label: 'Weather',   icon: 'cloud',              color: '#06b6d4', defaultW: 270, defaultH: 200 },
    note:      { label: 'Note',      icon: 'pencil',             color: '#f59e0b', defaultW: 240, defaultH: 210 },
    stocks:    { label: 'Stocks',    icon: 'graph',              color: '#10b981', defaultW: 270, defaultH: 240 },
    countdown: { label: 'Countdown', icon: 'hourglass',          color: '#f43f5e', defaultW: 290, defaultH: 175 },
    quote:     { label: 'Quote',     icon: 'comment-discussion', color: '#3b82f6', defaultW: 270, defaultH: 185 },
    news:      { label: 'News',      icon: 'newspaper',          color: '#f97316', defaultW: 290, defaultH: 290 },
    todo:      { label: 'To-Do',     icon: 'checklist',          color: '#22c55e', defaultW: 260, defaultH: 260 },
    calendar:  { label: 'Calendar',  icon: 'calendar',           color: '#ec4899', defaultW: 270, defaultH: 260 },
    pomodoro:  { label: 'Pomodoro',  icon: 'stopwatch',          color: '#ef4444', defaultW: 240, defaultH: 210 },
    currency:  { label: 'Currency',  icon: 'arrow-switch',       color: '#a855f7', defaultW: 260, defaultH: 200 },
    rss:       { label: 'RSS Feed',  icon: 'rss',                color: '#fb923c', defaultW: 290, defaultH: 280 },
    // Legacy alias
    time:      { label: 'Clock',     icon: 'clock',              color: '#8b5cf6', defaultW: 240, defaultH: 175 },
  };

  /* ── Weather helpers ───────────────────────────────────────── */
  const WMO_ICONS = {
    0:'sun',1:'sun',2:'cloud',3:'cloud',45:'cloud',48:'cloud',
    51:'cloud',53:'cloud',55:'cloud',61:'cloud',63:'cloud',65:'cloud',
    71:'cloud',73:'cloud',75:'cloud',80:'cloud',81:'cloud',82:'alert',
    95:'alert',96:'alert',99:'alert'
  };
  const WMO_DESC = {
    0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
    45:'Foggy',48:'Icy fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
    61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',
    75:'Heavy snow',80:'Rain showers',81:'Heavy showers',82:'Violent showers',
    95:'Thunderstorm',96:'Thunderstorm + hail',99:'Thunderstorm + heavy hail'
  };

  async function fetchWeather(lat, lon, unit) {
    const tu = unit === 'F' ? 'fahrenheit' : 'celsius';
    const [wRes, gRes] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,relative_humidity_2m,apparent_temperature&temperature_unit=${tu}&wind_speed_unit=mph`),
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)
    ]);
    const w = await wRes.json(), g = await gRes.json();
    const cur = w.current, code = cur.weathercode;
    return {
      temp:     Math.round(cur.temperature_2m),
      feels:    Math.round(cur.apparent_temperature),
      unit,
      icon:     WMO_ICONS[code] || 'meter',
      desc:     WMO_DESC[code]  || 'Unknown',
      city:     g.address?.city || g.address?.town || g.address?.village || 'Your location',
      wind:     Math.round(cur.windspeed_10m),
      humidity: cur.relative_humidity_2m
    };
  }

  /* ── Mock stocks ───────────────────────────────────────────── */
  const BASE_STOCKS = [
    { symbol: 'AAPL',  name: 'Apple',     price: 213.49, change: +1.23 },
    { symbol: 'GOOGL', name: 'Google',    price: 178.22, change: -0.87 },
    { symbol: 'MSFT',  name: 'Microsoft', price: 425.52, change: +2.15 },
    { symbol: 'TSLA',  name: 'Tesla',     price: 248.91, change: -3.41 },
    { symbol: 'AMZN',  name: 'Amazon',    price: 202.60, change: +1.05 },
  ];

  /* ── Quotes ────────────────────────────────────────────────── */
  const QUOTES = [
    { text: 'The secret of getting ahead is getting started.',            author: 'Mark Twain' },
    { text: "It does not matter how slowly you go — just don't stop.",    author: 'Confucius' },
    { text: 'Build. Break. Learn. Repeat.',                               author: 'Unknown' },
    { text: "Code is like humor. When you have to explain it, it's bad.", author: 'Cory House' },
    { text: 'Simplicity is the soul of efficiency.',                      author: 'Austin Freeman' },
    { text: 'Make it work, make it right, make it fast.',                 author: 'Kent Beck' },
    { text: 'Stay focused and never stop.',                               author: '360 Digital' },
    { text: 'Every expert was once a beginner.',                          author: 'Helen Hayes' },
    { text: 'Dream big. Start small. Act now.',                           author: 'Robin Sharma' },
    { text: 'Progress, not perfection.',                                  author: 'Unknown' },
    { text: 'Act as if what you do makes a difference. It does.',         author: 'William James' },
    { text: 'The best way to predict the future is to create it.',        author: 'Peter Drucker' },
    { text: 'Focus is the art of knowing what to ignore.',                author: 'Unknown' },
    { text: 'Small steps every day lead to big results.',                 author: 'Unknown' },
    { text: 'Discipline is the bridge between goals and accomplishment.',  author: 'Jim Rohn' },
  ];

  /* ── News fetch ────────────────────────────────────────────── */
  const FALLBACK_NEWS = [
    'Global markets react to latest economic data',
    'Tech giants report strong quarterly earnings',
    'New climate policy proposals announced at summit',
    'Scientists make breakthrough in renewable energy',
    'Sports: Record-breaking performances this season',
  ];

  async function fetchNews(feedUrl) {
    const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl || 'https://feeds.bbci.co.uk/news/rss.xml')}&count=6`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.items?.length) throw new Error('empty');
    return data.items;
  }

  /* ── Currency rates (ECB via open free endpoint) ───────────── */
  const CURRENCY_CACHE_KEY = '360_currency_cache';

  async function fetchRates(base) {
    const cached = JSON.parse(localStorage.getItem(CURRENCY_CACHE_KEY) || '{}');
    const stale  = !cached.ts || (Date.now() - cached.ts > 3600000);
    if (!stale && cached.base === base && cached.rates) return cached.rates;
    const res  = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    const data = await res.json();
    if (!data.rates) throw new Error('no rates');
    const payload = { base, rates: data.rates, ts: Date.now() };
    localStorage.setItem(CURRENCY_CACHE_KEY, JSON.stringify(payload));
    return data.rates;
  }

  /* ═══════════════════════════════════════════════════════════
     INDEX MODE — renders widgets on the homepage
  ═══════════════════════════════════════════════════════════ */
  function startIndexMode() {
    const host = document.getElementById('widgetBoard');
    if (!host) return;
    let widgets = loadWidgets();

    function renderAll() {
      host.innerHTML = '';
      widgets.forEach(w => renderWidget(w));
    }

    function renderWidget(w) {
      const def = WIDGET_TYPES[w.type] || WIDGET_TYPES.note;

      const card = document.createElement('section');
      card.className  = 'home-widget';
      card.dataset.id = w.id;
      card.dataset.type = w.type;
      card.style.cssText = [
        `left:${w.x ?? 20}px`,
        `top:${w.y ?? 80}px`,
        `width:${w.width  || def.defaultW}px`,
        `height:${w.height || def.defaultH}px`,
        `--widget-accent:${def.color}`,
      ].join(';');

      /* Header */
      const header = document.createElement('div');
      header.className = 'home-widget-header';
      header.innerHTML = `
        <span class="home-widget-icon">${octicon(def.icon)}</span>
        <span class="home-widget-title">${w.title || def.label}</span>
        <button class="home-widget-close" title="Remove widget">${octicon('x-circle')}</button>
      `;

      /* Body */
      const body = document.createElement('div');
      body.className = 'home-widget-body';

      /* Resize handle */
      const resizer = document.createElement('div');
      resizer.className = 'home-widget-resizer';

      card.append(header, body, resizer);
      host.appendChild(card);

      /* Close */
      header.querySelector('.home-widget-close').addEventListener('click', e => {
        e.stopPropagation();
        card.style.animation = 'widgetVanish 0.22s ease forwards';
        card.addEventListener('animationend', () => {
          widgets = widgets.filter(ww => ww.id !== w.id);
          saveWidgets(widgets);
          card.remove();
        }, { once: true });
      });

      populateWidget(w, body);
      makeDraggable(card, header, w, widgets);
      makeResizable(card, resizer, w, def, widgets);
    }

    renderAll();
  }

  /* ── Widget content dispatchers ────────────────────────────── */
  function populateWidget(w, body) {
    switch (w.type) {
      case 'clock':
      case 'time':      initClock(body, w);     break;
      case 'weather':   initWeather(body, w);   break;
      case 'note':      initNote(body, w);       break;
      case 'stocks':    initStocks(body, w);     break;
      case 'countdown': initCountdown(body, w); break;
      case 'quote':     initQuote(body, w);      break;
      case 'news':      initNews(body, w);       break;
      case 'todo':      initTodo(body, w);       break;
      case 'calendar':  initCalendar(body, w);   break;
      case 'pomodoro':  initPomodoro(body, w);   break;
      case 'currency':  initCurrency(body, w);   break;
      case 'rss':       initRss(body, w);        break;
      default: body.textContent = 'Unknown widget type';
    }
  }

  /* ── Clock ─────────────────────────────────────────────────── */
  function initClock(body, w) {
    const fmt24 = w.format24 ?? false;
    body.innerHTML = `
      <div class="wg-clock-time">--:--:--</div>
      <div class="wg-clock-date"></div>
      <div class="wg-clock-greeting"></div>
    `;
    const timeEl  = body.querySelector('.wg-clock-time');
    const dateEl  = body.querySelector('.wg-clock-date');
    const greetEl = body.querySelector('.wg-clock-greeting');
    const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const locale = w.locale   || undefined;
    const tz     = w.timezone || undefined;

    function tick() {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString(locale, {
        timeZone: tz,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: !fmt24
      });
      const d = tz ? new Date(now.toLocaleString('en-US', { timeZone: tz })) : now;
      dateEl.textContent  = `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
      const h = d.getHours();
      greetEl.textContent = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
    }
    tick();
    const iv = setInterval(tick, 1000);
    new MutationObserver((_, obs) => {
      if (!document.body.contains(body)) { clearInterval(iv); obs.disconnect(); }
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ── Weather ───────────────────────────────────────────────── */
  function initWeather(body, w) {
    body.innerHTML = `<div class="wg-weather-loading">${octicon('location')} Fetching weather…</div>`;
    const unit = w.unit || localStorage.getItem('tempUnit') || 'C';

    function load(lat, lon) {
      fetchWeather(lat, lon, unit).then(d => {
        body.innerHTML = `
          <div class="wg-weather-main">
            <span class="wg-weather-icon">${octicon(d.icon)}</span>
            <div>
              <div class="wg-weather-temp">${d.temp}°${d.unit}</div>
              <div class="wg-weather-desc">${d.desc}</div>
            </div>
          </div>
          <div class="wg-weather-loc">${octicon('location')} ${d.city}</div>
          <div class="wg-weather-extra">
            <span>Feels ${d.feels}°${d.unit}</span>
            <span>Humidity ${d.humidity}%</span>
            <span>Wind ${d.wind} mph</span>
          </div>
        `;
      }).catch(() => { body.innerHTML = `<div class="wg-weather-err">Weather unavailable</div>`; });
    }

    if (!navigator.geolocation) {
      body.innerHTML = `<div class="wg-weather-err">Geolocation unavailable</div>`;
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => load(pos.coords.latitude, pos.coords.longitude),
      ()  => { body.innerHTML = `<div class="wg-weather-err">Location denied</div>`; }
    );
  }

  /* ── Note ──────────────────────────────────────────────────── */
  function initNote(body, w) {
    const key   = `360_widget_note_${w.id}`;
    const saved = localStorage.getItem(key) ?? w.text ?? '';
    body.style.padding = '0';
    body.innerHTML = `<textarea class="wg-note-area" placeholder="Type a note…" maxlength="1200">${saved}</textarea>`;
    const ta = body.querySelector('.wg-note-area');
    let debounce;
    ta.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => localStorage.setItem(key, ta.value), 400);
    });
  }

  /* ── Stocks ────────────────────────────────────────────────── */
  function initStocks(body, w) {
    const tickers = w.tickers?.length ? w.tickers : BASE_STOCKS.map(s => s.symbol);
    const data = BASE_STOCKS
      .filter(s => tickers.includes(s.symbol))
      .map(s => ({
        ...s,
        price:  +(s.price  + (Math.random() - 0.5) * 2.4).toFixed(2),
        change: +(s.change + (Math.random() - 0.5) * 0.6).toFixed(2),
      }));

    body.innerHTML = `
      <div class="wg-stocks-header">
        <span>Symbol</span><span>Price</span><span>Chg</span>
      </div>
      ${data.map(s => {
        const up = s.change >= 0;
        return `<div class="wg-stock-row">
          <span class="wg-stock-sym">${s.symbol}</span>
          <span class="wg-stock-name">${s.name}</span>
          <span class="wg-stock-price">$${s.price.toFixed(2)}</span>
          <span class="wg-stock-change ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(s.change).toFixed(2)}</span>
        </div>`;
      }).join('')}
      <div class="wg-stocks-note">Simulated · updates every 30s</div>
    `;

    const iv = setInterval(() => {
      if (!document.querySelector(`[data-id="${w.id}"]`)) { clearInterval(iv); return; }
      initStocks(body, w);
    }, 30000);
  }

  /* ── Countdown ─────────────────────────────────────────────── */
  function initCountdown(body, w) {
    if (!w.targetDate) {
      body.innerHTML = `<div class="wg-cd-none">No date set.<br><small>Configure in Widget Settings.</small></div>`;
      return;
    }
    const eventName = w.eventName || 'Event';
    body.innerHTML = `
      <div class="wg-cd-event">${eventName}</div>
      <div class="wg-cd-display">
        <div class="wg-cd-block"><span class="wg-cd-num" id="cd-d-${w.id}">-</span><span class="wg-cd-label">days</span></div>
        <div class="wg-cd-sep">:</div>
        <div class="wg-cd-block"><span class="wg-cd-num" id="cd-h-${w.id}">-</span><span class="wg-cd-label">hrs</span></div>
        <div class="wg-cd-sep">:</div>
        <div class="wg-cd-block"><span class="wg-cd-num" id="cd-m-${w.id}">-</span><span class="wg-cd-label">min</span></div>
        <div class="wg-cd-sep">:</div>
        <div class="wg-cd-block"><span class="wg-cd-num" id="cd-s-${w.id}">-</span><span class="wg-cd-label">sec</span></div>
      </div>
    `;

    function tick() {
      const diff = new Date(w.targetDate) - new Date();
      if (diff <= 0) {
        body.querySelector('.wg-cd-display').innerHTML = `<div class="wg-cd-done">${octicon('check-circle')} It's here!</div>`;
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000)  / 60000);
      const s = Math.floor((diff % 60000)    / 1000);
      const nd = document.getElementById(`cd-d-${w.id}`);
      const nh = document.getElementById(`cd-h-${w.id}`);
      const nm = document.getElementById(`cd-m-${w.id}`);
      const ns = document.getElementById(`cd-s-${w.id}`);
      if (nd) nd.textContent = d;
      if (nh) nh.textContent = String(h).padStart(2,'0');
      if (nm) nm.textContent = String(m).padStart(2,'0');
      if (ns) ns.textContent = String(s).padStart(2,'0');
    }
    tick();
    const iv = setInterval(() => {
      if (!document.querySelector(`[data-id="${w.id}"]`)) { clearInterval(iv); return; }
      tick();
    }, 1000);
  }

  /* ── Quote ─────────────────────────────────────────────────── */
  function initQuote(body) {
    const idx = new Date().getDate() % QUOTES.length;
    const q   = QUOTES[idx];
    body.innerHTML = `
      <div class="wg-quote-mark">"</div>
      <div class="wg-quote-text">${q.text}</div>
      <div class="wg-quote-author">— ${q.author}</div>
    `;
  }

  /* ── News ──────────────────────────────────────────────────── */
  async function initNews(body, w) {
    body.innerHTML = `<div class="wg-news-loading">${octicon('newspaper')} Loading headlines…</div>`;
    try {
      const items = await fetchNews(w.feedUrl);
      body.innerHTML = items.map(item => `
        <a class="wg-news-item" href="${item.link}" target="_blank" rel="noopener noreferrer">
          <div class="wg-news-headline">${item.title}</div>
          <div class="wg-news-meta">${new Date(item.pubDate).toLocaleDateString()}</div>
        </a>
      `).join('');
    } catch {
      body.innerHTML = FALLBACK_NEWS.map(t => `
        <div class="wg-news-item">
          <div class="wg-news-headline">${t}</div>
          <div class="wg-news-meta">Today</div>
        </div>
      `).join('');
    }
  }

  /* ── To-Do ─────────────────────────────────────────────────── */
  function initTodo(body, w) {
    const key    = `360_widget_todo_${w.id}`;
    let   todos  = JSON.parse(localStorage.getItem(key) || '[]');

    function save() { localStorage.setItem(key, JSON.stringify(todos)); }

    function render() {
      list.innerHTML = '';
      if (!todos.length) {
        list.innerHTML = `<div class="wg-todo-empty">No tasks yet.</div>`;
        return;
      }
      todos.forEach((t, i) => {
        const row = document.createElement('div');
        row.className = `wg-todo-item${t.done ? ' done' : ''}`;
        row.innerHTML = `
          <input type="checkbox" data-i="${i}" ${t.done ? 'checked' : ''}/>
          <span class="wg-todo-text">${t.text}</span>
          <button class="wg-todo-del" data-i="${i}" title="Remove">✕</button>
        `;
        list.appendChild(row);
      });
    }

    body.innerHTML = `
      <div class="wg-todo-input-row">
        <input class="wg-todo-input" placeholder="Add task…" maxlength="80"/>
        <button class="wg-todo-add">＋</button>
      </div>
      <div class="wg-todo-list"></div>
    `;

    const input = body.querySelector('.wg-todo-input');
    const list  = body.querySelector('.wg-todo-list');

    function add() {
      const txt = input.value.trim();
      if (!txt) return;
      todos.unshift({ text: txt, done: false });
      save(); render(); input.value = '';
    }

    body.querySelector('.wg-todo-add').addEventListener('click', add);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });

    list.addEventListener('click', e => {
      const i = parseInt(e.target.dataset.i);
      if (isNaN(i)) return;
      if (e.target.type === 'checkbox') {
        todos[i].done = e.target.checked; save(); render();
      } else if (e.target.classList.contains('wg-todo-del')) {
        todos.splice(i, 1); save(); render();
      }
    });

    render();
  }

  /* ── Calendar ──────────────────────────────────────────────── */
  function initCalendar(body) {
    const now   = new Date();
    let   year  = now.getFullYear();
    let   month = now.getMonth();

    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

    function render() {
      const first    = new Date(year, month, 1).getDay();
      const total    = new Date(year, month + 1, 0).getDate();
      const isToday  = (d) => d === now.getDate() && month === now.getMonth() && year === now.getFullYear();

      let cells = '';
      DAYS.forEach(d => { cells += `<div class="wg-cal-daylabel">${d}</div>`; });
      for (let i = 0; i < first; i++) cells += `<div></div>`;
      for (let d = 1; d <= total; d++) {
        cells += `<div class="wg-cal-day${isToday(d) ? ' today' : ''}">${d}</div>`;
      }

      body.innerHTML = `
        <div class="wg-cal-nav">
          <button class="wg-cal-prev">‹</button>
          <span class="wg-cal-label">${MONTHS[month]} ${year}</span>
          <button class="wg-cal-next">›</button>
        </div>
        <div class="wg-cal-grid">${cells}</div>
      `;

      body.querySelector('.wg-cal-prev').addEventListener('click', () => {
        month--; if (month < 0) { month = 11; year--; } render();
      });
      body.querySelector('.wg-cal-next').addEventListener('click', () => {
        month++; if (month > 11) { month = 0; year++; } render();
      });
    }

    render();
  }

  /* ── Pomodoro ──────────────────────────────────────────────── */
  function initPomodoro(body, w) {
    const WORK  = (w.workMin  || 25) * 60;
    const BREAK = (w.breakMin || 5)  * 60;

    let remaining = WORK;
    let running   = false;
    let onBreak   = false;
    let iv        = null;

    const pad = n => String(n).padStart(2, '0');

    body.innerHTML = `
      <div class="wg-pom-label">Focus</div>
      <div class="wg-pom-time">25:00</div>
      <div class="wg-pom-controls">
        <button class="wg-pom-btn start">Start</button>
        <button class="wg-pom-btn reset">Reset</button>
      </div>
      <div class="wg-pom-status"></div>
    `;

    const labelEl  = body.querySelector('.wg-pom-label');
    const timeEl   = body.querySelector('.wg-pom-time');
    const startBtn = body.querySelector('.wg-pom-btn.start');
    const resetBtn = body.querySelector('.wg-pom-btn.reset');
    const statusEl = body.querySelector('.wg-pom-status');

    function tick() {
      remaining--;
      render();
      if (remaining <= 0) {
        clearInterval(iv); iv = null; running = false;
        onBreak = !onBreak;
        remaining = onBreak ? BREAK : WORK;
        labelEl.textContent  = onBreak ? 'Break' : 'Focus';
        statusEl.textContent = onBreak ? '☕ Break time!' : '🎯 Back to work!';
        render();
      }
    }

    function render() {
      timeEl.textContent  = `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;
      startBtn.textContent = running ? 'Pause' : 'Start';
    }

    startBtn.addEventListener('click', () => {
      if (!document.body.contains(body)) { clearInterval(iv); return; }
      if (running) {
        clearInterval(iv); iv = null; running = false;
      } else {
        running = true;
        iv = setInterval(() => {
          if (!document.body.contains(body)) { clearInterval(iv); return; }
          tick();
        }, 1000);
      }
      render();
    });

    resetBtn.addEventListener('click', () => {
      clearInterval(iv); iv = null; running = false; onBreak = false;
      remaining = WORK; labelEl.textContent = 'Focus'; statusEl.textContent = '';
      render();
    });
  }

  /* ── Currency ──────────────────────────────────────────────── */
  function initCurrency(body, w) {
    const defaultBase = w.baseCurrency || 'USD';
    const pairs = w.pairs || ['EUR','GBP','JPY','CAD'];

    body.innerHTML = `
      <div class="wg-cur-row">
        <select class="wg-cur-base"></select>
        <input class="wg-cur-amount" type="number" value="1" min="0" step="any"/>
      </div>
      <div class="wg-cur-results"><div class="wg-cur-loading">Loading rates…</div></div>
    `;

    const baseSelect = body.querySelector('.wg-cur-base');
    const amountIn   = body.querySelector('.wg-cur-amount');
    const results    = body.querySelector('.wg-cur-results');

    const COMMON = ['USD','EUR','GBP','JPY','CAD','AUD','CHF','CNY','INR','BRL','MXN','KRW'];
    COMMON.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      if (c === defaultBase) opt.selected = true;
      baseSelect.appendChild(opt);
    });

    async function load() {
      results.innerHTML = `<div class="wg-cur-loading">Loading…</div>`;
      try {
        const base  = baseSelect.value;
        const amt   = parseFloat(amountIn.value) || 1;
        const rates = await fetchRates(base);
        results.innerHTML = pairs
          .filter(p => rates[p])
          .map(p => {
            const val = (rates[p] * amt).toFixed(4);
            return `<div class="wg-cur-pair">
              <span class="wg-cur-code">${p}</span>
              <span class="wg-cur-val">${val}</span>
            </div>`;
          }).join('');
      } catch {
        results.innerHTML = `<div class="wg-cur-err">Rates unavailable</div>`;
      }
    }

    baseSelect.addEventListener('change', load);
    let debounce;
    amountIn.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(load, 400);
    });

    load();
  }

  /* ── RSS Feed ──────────────────────────────────────────────── */
  async function initRss(body, w) {
    const feedUrl = w.feedUrl || 'https://feeds.bbci.co.uk/news/rss.xml';
    body.innerHTML = `<div class="wg-news-loading">${octicon('rss')} Loading feed…</div>`;
    try {
      const items = await fetchNews(feedUrl);
      body.innerHTML = items.slice(0, 6).map(item => `
        <a class="wg-news-item" href="${item.link}" target="_blank" rel="noopener noreferrer">
          <div class="wg-news-headline">${item.title}</div>
          <div class="wg-news-meta">${new Date(item.pubDate).toLocaleDateString()}</div>
        </a>
      `).join('');
    } catch {
      body.innerHTML = `<div class="wg-news-err">Feed unavailable.<br><small>Check the URL in settings.</small></div>`;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     DRAG & RESIZE
  ═══════════════════════════════════════════════════════════ */
  function makeDraggable(card, header, widget, allWidgets) {
    let sx=0, sy=0, ox=0, oy=0, dragging=false;
    header.addEventListener('pointerdown', e => {
      if (e.target.classList.contains('home-widget-close')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      ox = widget.x ?? 20; oy = widget.y ?? 80;
      header.style.cursor = 'grabbing';
      card.style.zIndex   = '20';
      header.setPointerCapture(e.pointerId);
    });
    header.addEventListener('pointermove', e => {
      if (!dragging) return;
      widget.x = Math.max(0, ox + e.clientX - sx);
      widget.y = Math.max(0, oy + e.clientY - sy);
      card.style.left = `${widget.x}px`;
      card.style.top  = `${widget.y}px`;
    });
    header.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      header.style.cursor = '';
      card.style.zIndex   = '';
      saveWidgets(allWidgets);
    });
  }

  function makeResizable(card, handle, widget, def, allWidgets) {
    const MIN_W = Math.min(def.defaultW * 0.65, 160);
    const MIN_H = Math.min(def.defaultH * 0.65, 100);
    let sx=0, sy=0, ow=0, oh=0, resizing=false;
    handle.addEventListener('pointerdown', e => {
      resizing = true;
      sx = e.clientX; sy = e.clientY;
      ow = widget.width  || def.defaultW;
      oh = widget.height || def.defaultH;
      handle.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });
    handle.addEventListener('pointermove', e => {
      if (!resizing) return;
      widget.width  = Math.max(MIN_W, ow + (e.clientX - sx));
      widget.height = Math.max(MIN_H, oh + (e.clientY - sy));
      card.style.width  = `${widget.width}px`;
      card.style.height = `${widget.height}px`;
    });
    handle.addEventListener('pointerup', () => {
      if (!resizing) return;
      resizing = false;
      saveWidgets(allWidgets);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     SETTINGS MODE — widget management form in settings.html
  ═══════════════════════════════════════════════════════════ */
  function startSettingsMode() {
    const list = document.getElementById('widgetList');
    if (!list) return;

    let widgets      = loadWidgets();
    let selectedType = 'clock';

    /* ── Type buttons ── */
    const typeButtons = document.querySelectorAll('[data-widget-type]');
    typeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        typeButtons.forEach(b => b.classList.remove('wf-type-active'));
        btn.classList.add('wf-type-active');
        selectedType = btn.dataset.widgetType;
        updateFields(selectedType);
      });
    });

    function updateFields(type) {
      const show = id => { const el = document.getElementById(id); if (el) el.style.display = ''; };
      const hide = id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
      ['wf-note-fields','wf-weather-fields','wf-clock-fields','wf-countdown-fields',
       'wf-todo-fields','wf-pomodoro-fields','wf-currency-fields','wf-rss-fields']
        .forEach(hide);
      if (type === 'note')                     show('wf-note-fields');
      if (type === 'weather')                  show('wf-weather-fields');
      if (type === 'clock' || type === 'time') show('wf-clock-fields');
      if (type === 'countdown')                show('wf-countdown-fields');
      if (type === 'todo')                     show('wf-todo-fields');
      if (type === 'pomodoro')                 show('wf-pomodoro-fields');
      if (type === 'currency')                 show('wf-currency-fields');
      if (type === 'rss')                      show('wf-rss-fields');
    }

    /* ── Form submission ── */
    const form = document.getElementById('widgetForm');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const def = WIDGET_TYPES[selectedType] || WIDGET_TYPES.note;
        const g   = id => document.getElementById(id);
        const v   = id => g(id)?.value.trim() ?? '';

        const offset = (widgets.length % 8) * 22;

        widgets.push({
          id:           uid(),
          type:         selectedType,
          title:        v('wf-title') || def.label,
          width:        def.defaultW,
          height:       def.defaultH,
          // note
          text:         v('wf-note-text'),
          // weather / clock
          unit:         g('wf-unit')?.value || 'C',
          timezone:     v('wf-timezone'),
          locale:       v('wf-locale'),
          format24:     g('wf-format24')?.checked ?? false,
          // countdown
          targetDate:   v('wf-countdown-date') || null,
          eventName:    v('wf-countdown-event') || 'Event',
          // pomodoro
          workMin:      parseInt(v('wf-work-min'))  || 25,
          breakMin:     parseInt(v('wf-break-min')) || 5,
          // currency
          baseCurrency: v('wf-base-currency') || 'USD',
          // rss / news
          feedUrl:      v('wf-feed-url') || null,
          x: 20 + offset,
          y: 80 + offset,
        });

        saveWidgets(widgets);
        form.reset();

        typeButtons.forEach(b => b.classList.remove('wf-type-active'));
        document.querySelector('[data-widget-type="clock"]')?.classList.add('wf-type-active');
        selectedType = 'clock';
        updateFields('clock');

        refresh();
        showToast('Widget added — drag it around on the homepage!');
      });
    }

    /* ── Widget list ── */
    function refresh() {
      if (!widgets.length) {
        list.innerHTML = `<div class="wf-empty">No widgets yet — add one above.</div>`;
        return;
      }
      list.innerHTML = widgets.map(w => {
        const def = WIDGET_TYPES[w.type] || WIDGET_TYPES.note;
        return `<div class="wf-widget-row" data-id="${w.id}">
          <span class="wf-row-icon">${def.icon}</span>
          <div class="wf-row-info">
            <div class="wf-row-name">${w.title || def.label}</div>
            <div class="wf-row-meta">${def.label} · ${w.width}×${w.height}px</div>
          </div>
          <button class="wf-del-btn" data-id="${w.id}" title="Delete widget">${octicon('trash')}</button>
        </div>`;
      }).join('');

      list.querySelectorAll('.wf-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          widgets = widgets.filter(w => w.id !== btn.dataset.id);
          saveWidgets(widgets);
          refresh();
          showToast('Widget removed.');
        });
      });
    }

    /* ── Toast ── */
    function showToast(msg) {
      let toast = document.getElementById('wf-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'wf-toast';
        Object.assign(toast.style, {
          position: 'fixed', bottom: '28px', left: '50%',
          transform: 'translateX(-50%) translateY(20px)',
          background: 'linear-gradient(120deg,#3b82f6,#8b5cf6)',
          color: '#fff', padding: '12px 24px',
          borderRadius: '999px', fontSize: '14px', fontWeight: '600',
          zIndex: '9999', opacity: '0',
          transition: 'opacity .25s,transform .25s',
          boxShadow: '0 8px 28px rgba(0,0,0,.35)',
          pointerEvents: 'none',
          fontFamily: '"Segoe UI",system-ui,sans-serif',
        });
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      requestAnimationFrame(() => {
        toast.style.opacity   = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
      });
      clearTimeout(toast._hide);
      toast._hide = setTimeout(() => {
        toast.style.opacity   = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
      }, 2800);
    }

    /* ── Init ── */
    document.querySelector('[data-widget-type="clock"]')?.classList.add('wf-type-active');
    updateFields('clock');
    refresh();
  }

  /* ═══════════════════════════════════════════════════════════
     BOOT
  ═══════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  function boot() {
    startIndexMode();
    startSettingsMode();
  }
  // Emoji → SVG on widget board
  (function(){
    if (document.getElementById('em-style')) return; // already loaded by main.js
    var s = document.createElement('script');
    s.src = '/assets/js/emoji.js';
    s.defer = true;
    document.head.appendChild(s);
  })();

})();
