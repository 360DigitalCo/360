/* ══════════════════════════════════════════════════════════════
   360 — NEWTAB.JS
   Renders the new tab dashboard when 360 is the default search
   engine and the user opens a new tab (no ?q= param).
══════════════════════════════════════════════════════════════ */

(function () {

/* ── Inject styles ── */
const STYLE = `
  :root {
    --bg:      #f0f2f8;
    --bg2:     #e4e7f0;
    --card:    rgba(255,255,255,.72);
    --cardhov: rgba(255,255,255,.92);
    --border:  rgba(0,0,0,.09);
    --txt:     #111827;
    --mut:     #6b7280;
    --a:       #4f8cff;
    --a2:      #06d6c8;
    --grad:    linear-gradient(120deg,#4f8cff,#06d6c8);
    --radius:  14px;
    --shadow:  0 4px 20px rgba(0,0,0,.10);
  }
  body.nt-dark {
    --bg:      #0b0f1a;
    --bg2:     #111827;
    --card:    rgba(255,255,255,.05);
    --cardhov: rgba(255,255,255,.09);
    --border:  rgba(255,255,255,.09);
    --txt:     #e7e9f0;
    --mut:     #7b8599;
    --shadow:  0 8px 32px rgba(0,0,0,.45);
  }

  /* hide the normal homepage content */
  body.nt-active > *:not(#nt-root) { display:none !important; }

  #nt-root {
    display: block;
    font-family: "Segoe UI", system-ui, sans-serif;
    background: var(--bg);
    color: var(--txt);
    min-height: 100vh;
    overflow-x: hidden;
    transition: background .3s, color .3s;
    position: relative;
  }
  #nt-root::before {
    content: "";
    position: fixed; inset: 0;
    background:
      radial-gradient(ellipse 70% 50% at 20% 10%, rgba(79,140,255,.08) 0%, transparent 60%),
      radial-gradient(ellipse 60% 60% at 80% 80%, rgba(6,214,200,.06) 0%, transparent 60%);
    pointer-events: none; z-index: 0;
  }
  body.nt-dark #nt-root::before {
    background:
      radial-gradient(ellipse 70% 50% at 20% 20%, rgba(79,140,255,.12) 0%, transparent 60%),
      radial-gradient(ellipse 60% 70% at 80% 80%, rgba(6,214,200,.10) 0%, transparent 60%);
  }

  .nt-page {
    position: relative; z-index: 1;
    display: grid;
    grid-template-columns: 1fr 320px;
    grid-template-rows: auto auto 1fr;
    gap: 16px;
    max-width: 1100px;
    margin: 0 auto;
    padding: 28px 20px 40px;
    min-height: 100vh;
  }
  @media (max-width: 780px) {
    .nt-page { grid-template-columns: 1fr; padding: 16px 12px 32px; }
  }

  .nt-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: var(--shadow);
    transition: background .2s;
  }
  .nt-card:hover { background: var(--cardhov); }

  /* Top bar */
  .nt-top {
    grid-column: 1 / -1;
    display: flex; align-items: center;
    justify-content: space-between; gap: 12px;
  }
  .nt-logo {
    font-size: 1.6rem; font-weight: 900;
    letter-spacing: .06em;
    background: var(--grad);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    flex-shrink: 0;
  }
  .nt-search-wrap { flex: 1; max-width: 520px; position: relative; }
  .nt-search-wrap input {
    width: 100%; padding: 11px 48px 11px 18px;
    border-radius: 999px; border: 1px solid var(--border);
    background: var(--card); backdrop-filter: blur(12px);
    color: var(--txt); font-size: .95rem; outline: none;
    transition: border-color .2s, box-shadow .2s; font-family: inherit;
  }
  .nt-search-wrap input:focus {
    border-color: var(--a);
    box-shadow: 0 0 0 3px rgba(79,140,255,.18);
  }
  .nt-search-wrap input::placeholder { color: var(--mut); }
  .nt-search-btn {
    position: absolute; right: 8px; top: 50%;
    transform: translateY(-50%);
    background: var(--grad); border: none;
    width: 32px; height: 32px; border-radius: 50%;
    cursor: pointer; display: flex;
    align-items: center; justify-content: center;
    font-size: 14px; transition: opacity .2s;
  }
  .nt-search-btn:hover { opacity: .85; }
  .nt-actions { display: flex; gap: 8px; flex-shrink: 0; }
  .nt-icon-btn {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 12px; cursor: pointer;
    font-size: 14px; color: var(--txt);
    transition: background .2s, border-color .2s;
    display: flex; align-items: center; gap: 5px;
    font-family: inherit; backdrop-filter: blur(8px);
  }
  .nt-icon-btn:hover { background: var(--cardhov); border-color: var(--a); }

  /* Left column */
  .nt-left { display: flex; flex-direction: column; gap: 16px; }

  /* Clock */
  .nt-clock-card { text-align: center; padding: 22px 18px; }
  .nt-time {
    font-size: 3.8rem; font-weight: 800; letter-spacing: -.02em;
    background: var(--grad); -webkit-background-clip: text;
    -webkit-text-fill-color: transparent; line-height: 1;
  }
  .nt-date { font-size: .9rem; color: var(--mut); margin-top: 6px; }
  .nt-greeting { font-size: 1.05rem; font-weight: 600; margin-top: 10px; }

  /* Weather */
  .nt-weather { display: flex; align-items: center; gap: 16px; padding: 14px 18px; cursor: pointer; }
  .nt-wicon { font-size: 2.8rem; flex-shrink: 0; }
  .nt-wtemp {
    font-size: 1.8rem; font-weight: 800;
    background: var(--grad); -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .nt-wdesc { font-size: .85rem; color: var(--mut); margin-top: 2px; }
  .nt-wloc  { font-size: .8rem;  color: var(--mut); }
  .nt-wextra { margin-left: auto; text-align: right; font-size: .8rem; color: var(--mut); }
  .nt-wextra div { margin-top: 2px; }

  /* Quick links */
  .nt-links-grid {
    display: grid; grid-template-columns: repeat(4,1fr); gap: 8px;
  }
  .nt-link {
    display: flex; flex-direction: column; align-items: center;
    gap: 6px; padding: 12px 8px; border-radius: 10px;
    border: 1px solid var(--border); background: var(--card);
    cursor: pointer; text-decoration: none; color: var(--txt);
    font-size: .75rem; font-weight: 600;
    transition: background .18s, border-color .18s, transform .18s;
    backdrop-filter: blur(8px);
  }
  .nt-link:hover { background: var(--cardhov); border-color: var(--a); transform: translateY(-2px); }
  .nt-link-icon { font-size: 1.5rem; }

  /* Apps row */
  .nt-apps-card { padding: 14px 18px; }
  .nt-apps-card h3 {
    font-size: .85rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: .07em; color: var(--mut); margin-bottom: 10px;
  }
  .nt-apps-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .nt-app-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--card);
    font-size: .82rem; font-weight: 600; cursor: pointer;
    text-decoration: none; color: var(--txt);
    transition: background .15s, border-color .15s, transform .15s;
  }
  .nt-app-pill:hover { background: var(--cardhov); border-color: var(--a); transform: translateY(-1px); }

  /* Right column */
  .nt-right { display: flex; flex-direction: column; gap: 16px; }

  /* Calculator */
  .nt-calc { padding: 16px; }
  .nt-calc h3 {
    font-size: .85rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: .07em; color: var(--mut); margin-bottom: 12px;
  }
  .nt-calc-display {
    background: rgba(0,0,0,.08); border-radius: 10px;
    padding: 12px 16px; text-align: right; margin-bottom: 10px;
    border: 1px solid var(--border);
  }
  body.nt-dark .nt-calc-display { background: rgba(0,0,0,.25); }
  .nt-calc-expr { font-size: .8rem; color: var(--mut); min-height: 18px; word-break: break-all; }
  .nt-calc-val  { font-size: 2rem; font-weight: 800; letter-spacing: -.02em; word-break: break-all; }
  .nt-calc-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
  .nt-cbtn {
    padding: 12px 0; border-radius: 9px;
    border: 1px solid var(--border); background: var(--card);
    color: var(--txt); font-size: .95rem; font-weight: 600;
    cursor: pointer; transition: background .15s, transform .1s, border-color .15s;
    font-family: inherit;
  }
  .nt-cbtn:hover { background: var(--cardhov); border-color: var(--a); transform: scale(1.04); }
  .nt-cbtn:active { transform: scale(.97); }
  .nt-cbtn.op  { color: var(--a); }
  .nt-cbtn.eq  { background: var(--grad); color: #050816; border-color: transparent; font-size: 1.1rem; }
  .nt-cbtn.eq:hover { opacity: .85; background: var(--grad); }
  .nt-cbtn.clr { color: #ef4444; }
  .nt-cbtn.s2  { grid-column: span 2; }

  /* Todo */
  .nt-todo-card h3 {
    font-size: .85rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: .07em; color: var(--mut); margin-bottom: 12px;
  }
  .nt-todo-row { display: flex; gap: 6px; margin-bottom: 10px; }
  .nt-todo-row input {
    flex: 1; padding: 8px 12px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--card);
    color: var(--txt); font-size: .9rem; outline: none;
    transition: border-color .2s; font-family: inherit;
  }
  .nt-todo-row input:focus { border-color: var(--a); }
  .nt-todo-row input::placeholder { color: var(--mut); }
  .nt-todo-add {
    padding: 8px 14px; border-radius: 8px; border: none;
    background: var(--grad); color: #050816; font-weight: 700;
    cursor: pointer; font-size: .9rem; font-family: inherit;
    transition: opacity .2s;
  }
  .nt-todo-add:hover { opacity: .85; }
  .nt-todo-list {
    display: flex; flex-direction: column; gap: 5px;
    max-height: 210px; overflow-y: auto;
  }
  .nt-todo-list::-webkit-scrollbar { width: 3px; }
  .nt-todo-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
  .nt-todo-item {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--card);
    font-size: .87rem; transition: background .15s;
  }
  .nt-todo-item:hover { background: var(--cardhov); }
  .nt-todo-item input[type="checkbox"] { accent-color: var(--a); width: 15px; height: 15px; flex-shrink: 0; cursor: pointer; }
  .nt-todo-item .nt-todo-text { flex: 1; transition: opacity .2s; }
  .nt-todo-item.done .nt-todo-text { text-decoration: line-through; opacity: .45; }
  .nt-todo-del {
    background: none; border: none; cursor: pointer;
    color: var(--mut); font-size: 14px; padding: 0 3px; opacity: .5;
    transition: opacity .15s, color .15s;
  }
  .nt-todo-del:hover { opacity: 1; color: #ef4444; }
  .nt-todo-empty { font-size: .85rem; color: var(--mut); text-align: center; padding: 14px 0; }

  /* Quote */
  .nt-quote { padding: 16px 18px; }
  .nt-quote-text { font-size: .9rem; font-style: italic; line-height: 1.6; }
  .nt-quote-author { font-size: .78rem; color: var(--mut); margin-top: 8px; font-weight: 600; }

  /* Pomodoro */
  .nt-pom-card { padding: 16px 18px; text-align: center; }
  .nt-pom-card h3 {
    font-size: .85rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: .07em; color: var(--mut); margin-bottom: 10px;
  }
  .nt-pom-label { font-size: .8rem; font-weight: 600; color: var(--mut); margin-bottom: 4px; text-transform: uppercase; letter-spacing: .06em; }
  .nt-pom-time {
    font-size: 2.8rem; font-weight: 800; letter-spacing: -.02em;
    background: var(--grad); -webkit-background-clip: text;
    -webkit-text-fill-color: transparent; line-height: 1; margin-bottom: 12px;
  }
  .nt-pom-btns { display: flex; gap: 8px; justify-content: center; }
  .nt-pom-btn {
    padding: 8px 18px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--card); color: var(--txt); font-size: .88rem; font-weight: 600;
    cursor: pointer; transition: background .15s, border-color .15s; font-family: inherit;
  }
  .nt-pom-btn.start { background: var(--grad); color: #050816; border-color: transparent; }
  .nt-pom-btn:hover:not(.start) { background: var(--cardhov); border-color: var(--a); }
  .nt-pom-status { font-size: .82rem; color: var(--mut); margin-top: 8px; min-height: 18px; }

  /* Calendar mini */
  .nt-cal-card { padding: 14px 16px; }
  .nt-cal-card h3 {
    font-size: .85rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: .07em; color: var(--mut); margin-bottom: 10px;
  }
  .nt-cal-nav {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px;
  }
  .nt-cal-nav button {
    background: none; border: none; cursor: pointer; color: var(--mut);
    font-size: 1.1rem; padding: 2px 6px; border-radius: 6px; transition: background .15s;
  }
  .nt-cal-nav button:hover { background: var(--cardhov); }
  .nt-cal-month { font-size: .88rem; font-weight: 700; color: var(--txt); }
  .nt-cal-grid {
    display: grid; grid-template-columns: repeat(7,1fr); gap: 2px; text-align: center;
  }
  .nt-cal-dl { font-size: .65rem; color: var(--mut); font-weight: 700; padding: 2px 0; }
  .nt-cal-day {
    font-size: .78rem; padding: 4px 2px; border-radius: 5px;
    cursor: default; color: var(--txt); transition: background .12s;
  }
  .nt-cal-day.today {
    background: var(--grad); color: #050816; font-weight: 800;
    -webkit-text-fill-color: #050816;
  }
  .nt-cal-day:hover:not(.today) { background: var(--cardhov); }

  /* Scrollbar */
  #nt-root ::-webkit-scrollbar { width: 5px; }
  #nt-root ::-webkit-scrollbar-track { background: transparent; }
  #nt-root ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
`;

/* ── HTML ── */
const HTML = `
<div class="nt-page">

  <!-- TOP BAR -->
  <div class="nt-top">
    <div class="nt-logo">360</div>
    <div class="nt-search-wrap">
      <input id="nt-search" type="text" placeholder="Search 360..." autocomplete="off" />
      <button class="nt-search-btn" id="nt-search-btn">🔍</button>
    </div>
    <div class="nt-actions">
      <button class="nt-icon-btn" id="nt-theme-btn">🌙</button>
      <button class="nt-icon-btn" onclick="window.open('https://360-search.com','_blank')">🏠 Home</button>
    </div>
  </div>

  <!-- LEFT -->
  <div class="nt-left">

    <div class="nt-card nt-clock-card">
      <div class="nt-time"  id="nt-clock">00:00:00</div>
      <div class="nt-date"  id="nt-date">Loading...</div>
      <div class="nt-greeting" id="nt-greeting">Welcome!</div>
    </div>

    <div class="nt-card nt-weather" id="nt-weather">
      <div class="nt-wicon" id="nt-wicon">🌤️</div>
      <div>
        <div class="nt-wtemp"  id="nt-wtemp">--°</div>
        <div class="nt-wdesc" id="nt-wdesc">Fetching weather...</div>
        <div class="nt-wloc"  id="nt-wloc">📍 Locating...</div>
      </div>
      <div class="nt-wextra" id="nt-wextra"></div>
    </div>

    <div class="nt-card" style="padding:16px;">
      <div class="nt-links-grid" id="nt-links"></div>
    </div>

    <div class="nt-card nt-apps-card">
      <h3>360 Apps</h3>
      <div class="nt-apps-row" id="nt-apps"></div>
    </div>

  </div>

  <!-- RIGHT -->
  <div class="nt-right">

    <div class="nt-card nt-calc">
      <h3>Calculator</h3>
      <div class="nt-calc-display">
        <div class="nt-calc-expr" id="nt-cexpr"></div>
        <div class="nt-calc-val"  id="nt-cval">0</div>
      </div>
      <div class="nt-calc-grid" id="nt-cgrid"></div>
    </div>

    <div class="nt-card nt-todo-card">
      <h3>To-Do</h3>
      <div class="nt-todo-row">
        <input id="nt-todo-input" placeholder="Add a task..." maxlength="80" />
        <button class="nt-todo-add" id="nt-todo-add">＋</button>
      </div>
      <div class="nt-todo-list" id="nt-todo-list"></div>
    </div>

    <div class="nt-card nt-pom-card">
      <h3>Pomodoro</h3>
      <div class="nt-pom-label" id="nt-pom-label">Focus</div>
      <div class="nt-pom-time"  id="nt-pom-time">25:00</div>
      <div class="nt-pom-btns">
        <button class="nt-pom-btn start" id="nt-pom-start">Start</button>
        <button class="nt-pom-btn" id="nt-pom-reset">Reset</button>
      </div>
      <div class="nt-pom-status" id="nt-pom-status"></div>
    </div>

    <div class="nt-card nt-cal-card">
      <h3>Calendar</h3>
      <div class="nt-cal-nav">
        <button id="nt-cal-prev">‹</button>
        <span class="nt-cal-month" id="nt-cal-month"></span>
        <button id="nt-cal-next">›</button>
      </div>
      <div class="nt-cal-grid" id="nt-cal-grid"></div>
    </div>

    <div class="nt-card nt-quote">
      <div class="nt-quote-text"   id="nt-quote-text">Loading...</div>
      <div class="nt-quote-author" id="nt-quote-author"></div>
    </div>

  </div>

</div>
`;

/* ══ Mount ══ */
function mount() {
  // Inject styles
  const styleEl = document.createElement("style");
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  // Create root
  const root = document.createElement("div");
  root.id = "nt-root";
  root.innerHTML = HTML;
  document.body.appendChild(root);

  // Hide everything else
  document.body.classList.add("nt-active");

  // Default to light mode; only go dark if user previously chose dark
  const isDark = localStorage.getItem("360nt_dark") === "true";
  if (isDark) document.body.classList.add("nt-dark");

  initAll();
}

/* ══ Init all widgets ══ */
function initAll() {
  initTheme();
  initClock();
  initSearch();
  initWeather();
  initLinks();
  initApps();
  initCalc();
  initTodo();
  initPomodoro();
  initCalendar();
  initQuote();
}

/* ── Theme ── */
function initTheme() {
  const btn = document.getElementById("nt-theme-btn");
  function sync() {
    const dark = document.body.classList.contains("nt-dark");
    btn.textContent = dark ? "🌙" : "☀️";
  }
  sync();
  btn.addEventListener("click", () => {
    const dark = document.body.classList.toggle("nt-dark");
    localStorage.setItem("360nt_dark", dark);
    sync();
  });
}

/* ── Clock ── */
function initClock() {
  const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const pad = n => String(n).padStart(2,"0");
  function tick() {
    const now = new Date();
    document.getElementById("nt-clock").textContent =
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    document.getElementById("nt-date").textContent =
      `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    const h = now.getHours();
    document.getElementById("nt-greeting").textContent =
      h < 12 ? "Good morning ☀️" : h < 17 ? "Good afternoon 🌤️" : h < 21 ? "Good evening 🌆" : "Good night 🌙";
  }
  setInterval(tick, 1000);
  tick();
}

/* ── Search ── */
function initSearch() {
  function go() {
    const q = document.getElementById("nt-search").value.trim();
    if (q) window.location.href = `https://360-search.com/?q=${encodeURIComponent(q)}`;
  }
  document.getElementById("nt-search-btn").addEventListener("click", go);
  document.getElementById("nt-search").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
}

/* ── Weather ── */
function initWeather() {
  const WMO_ICONS = {0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",51:"🌦️",53:"🌧️",55:"🌧️",61:"🌧️",63:"🌧️",65:"🌧️",71:"❄️",73:"❄️",75:"❄️",80:"🌦️",81:"🌧️",82:"⛈️",95:"⛈️",96:"⛈️",99:"⛈️"};
  const WMO_DESC  = {0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Foggy",48:"Icy fog",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Heavy showers",82:"Violent showers",95:"Thunderstorm",96:"Thunderstorm w/ hail",99:"Thunderstorm w/ heavy hail"};

  async function load() {
    if (!navigator.geolocation) { document.getElementById("nt-wdesc").textContent = "Geolocation unavailable"; return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      try {
        const [wRes, gRes] = await Promise.all([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weathercode,windspeed_10m,apparent_temperature&wind_speed_unit=mph`),
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)
        ]);
        const w = await wRes.json(), g = await gRes.json();
        const cur = w.current;
        const useF = localStorage.getItem("360nt_unit") === "F";
        const toF  = c => Math.round(c * 9/5 + 32);
        const disp = c => useF ? `${toF(c)}°F` : `${Math.round(c)}°C`;
        const code = cur.weathercode;
        const city = g.address?.city || g.address?.town || g.address?.village || "Your location";
        document.getElementById("nt-wicon").textContent  = WMO_ICONS[code] || "🌡️";
        document.getElementById("nt-wtemp").textContent  = disp(cur.temperature_2m);
        document.getElementById("nt-wdesc").textContent  = WMO_DESC[code] || "Unknown";
        document.getElementById("nt-wloc").textContent   = `📍 ${city}`;
        document.getElementById("nt-wextra").innerHTML   =
          `<div>💧 ${cur.relative_humidity_2m}%</div><div>💨 ${Math.round(cur.windspeed_10m)} mph</div><div>Feels ${disp(cur.apparent_temperature)}</div>`;
      } catch { document.getElementById("nt-wdesc").textContent = "Weather unavailable"; }
    }, () => { document.getElementById("nt-wdesc").textContent = "Location denied"; document.getElementById("nt-wloc").textContent = ""; });
  }

  load();
  document.getElementById("nt-weather").addEventListener("click", () => {
    const u = localStorage.getItem("360nt_unit") === "F" ? "C" : "F";
    localStorage.setItem("360nt_unit", u);
    load();
  });
}

/* ── Quick Links ── */
function initLinks() {
  const LINKS = [
    { icon:"🤖", label:"AI",         href:"https://360-search.com/ai.html" },
    { icon:"💬", label:"Chat",       href:"https://360-search.com/chat.html" },
    { icon:"📰", label:"News",       href:"https://360-search.com/news.html" },
    { icon:"🌦️", label:"Weather",    href:"https://360-search.com/weather.html" },
    { icon:"📈", label:"Stocks",     href:"https://360-search.com/stocks.html" },
    { icon:"🌍", label:"Translator", href:"https://360-search.com/translator.html" },
    { icon:"🔗", label:"Shorten",    href:"https://360-search.com/url-shortener.html" },
    { icon:"🎮", label:"Games",      href:"https://360-search.com/games.html" },
  ];
  const grid = document.getElementById("nt-links");
  LINKS.forEach(l => {
    const a = document.createElement("a");
    a.className = "nt-link"; a.href = l.href;
    a.innerHTML = `<div class="nt-link-icon">${l.icon}</div><div>${l.label}</div>`;
    grid.appendChild(a);
  });
}

/* ── Apps ── */
function initApps() {
  const APPS = [
    { icon:"🔍", label:"Google",    href:"https://google.com" },
    { icon:"📺", label:"YouTube",   href:"https://youtube.com" },
    { icon:"📧", label:"Gmail",     href:"https://mail.google.com" },
    { icon:"📅", label:"Calendar",  href:"https://calendar.google.com" },
    { icon:"📁", label:"Drive",     href:"https://drive.google.com" },
    { icon:"𝕏",  label:"Twitter/X", href:"https://x.com" },
    { icon:"📸", label:"Instagram", href:"https://instagram.com" },
    { icon:"🎵", label:"Spotify",   href:"https://open.spotify.com" },
  ];
  const row = document.getElementById("nt-apps");
  APPS.forEach(a => {
    const el = document.createElement("a");
    el.className = "nt-app-pill"; el.href = a.href;
    el.innerHTML = `${a.icon} ${a.label}`;
    row.appendChild(el);
  });
}

/* ── Calculator ── */
function initCalc() {
  const BTNS = [
    {l:"C",  c:"clr", v:"C"}, {l:"±", c:"op", v:"±"}, {l:"%", c:"op", v:"%"}, {l:"÷", c:"op", v:"/"},
    {l:"7",  c:"",    v:"7"}, {l:"8", c:"",   v:"8"}, {l:"9", c:"",   v:"9"}, {l:"×", c:"op", v:"*"},
    {l:"4",  c:"",    v:"4"}, {l:"5", c:"",   v:"5"}, {l:"6", c:"",   v:"6"}, {l:"−", c:"op", v:"-"},
    {l:"1",  c:"",    v:"1"}, {l:"2", c:"",   v:"2"}, {l:"3", c:"",   v:"3"}, {l:"+", c:"op", v:"+"},
    {l:"0",  c:"s2",  v:"0"}, {l:".", c:"",   v:"."}, {l:"=", c:"eq", v:"="},
  ];
  let expr="", cur="0", evaled=false;
  function render() {
    document.getElementById("nt-cexpr").textContent = expr;
    document.getElementById("nt-cval").textContent  = cur;
  }
  function press(v) {
    if (v==="C") { expr=""; cur="0"; evaled=false; render(); return; }
    if (v==="±") { if (cur!=="0") cur = cur.startsWith("-") ? cur.slice(1) : "-"+cur; render(); return; }
    if (v==="%") { try { cur=String(parseFloat(cur)/100); } catch{} render(); return; }
    if (v==="=") {
      const e = expr+cur; expr=e+" =";
      try { cur=String(parseFloat(Function('"use strict";return ('+e+')')().toFixed(10))); } catch { cur="Error"; }
      evaled=true; render(); return;
    }
    const isOp = ["+","-","*","/"].includes(v);
    if (isOp) {
      expr=(evaled?cur:expr+cur)+" "+v+" "; cur="0"; evaled=false;
    } else {
      if (evaled) { cur="0"; evaled=false; }
      if (v==="." && cur.includes(".")) { render(); return; }
      cur = cur==="0" && v!=="." ? v : cur+v;
    }
    render();
  }
  const grid = document.getElementById("nt-cgrid");
  BTNS.forEach(b => {
    const btn = document.createElement("button");
    btn.className = "nt-cbtn "+b.c; btn.textContent = b.l;
    btn.addEventListener("click", () => press(b.v));
    grid.appendChild(btn);
  });
  document.addEventListener("keydown", e => {
    if (e.target.tagName==="INPUT") return;
    const map={"0":"0","1":"1","2":"2","3":"3","4":"4","5":"5","6":"6","7":"7","8":"8","9":"9","+":"+","-":"-","*":"*","/":"/",".":".","Enter":"=","=":"=","Escape":"C"};
    if (e.key==="Backspace") { cur=cur.length>1?cur.slice(0,-1):"0"; render(); return; }
    if (map[e.key]) { e.preventDefault(); press(map[e.key]); }
  });
  render();
}

/* ── Todo ── */
function initTodo() {
  let todos = JSON.parse(localStorage.getItem("360nt_todos")||"[]");
  function save() { localStorage.setItem("360nt_todos", JSON.stringify(todos)); }
  function render() {
    const list = document.getElementById("nt-todo-list");
    list.innerHTML = "";
    if (!todos.length) { list.innerHTML=`<div class="nt-todo-empty">Nothing here yet — add a task!</div>`; return; }
    todos.forEach((t,i) => {
      const d = document.createElement("div");
      d.className = "nt-todo-item"+(t.done?" done":"");
      d.innerHTML = `<input type="checkbox" ${t.done?"checked":""} data-i="${i}"/><span class="nt-todo-text">${t.text}</span><button class="nt-todo-del" data-i="${i}">✕</button>`;
      list.appendChild(d);
    });
  }
  document.getElementById("nt-todo-list").addEventListener("click", e => {
    const i = parseInt(e.target.dataset.i);
    if (e.target.type==="checkbox") { todos[i].done=e.target.checked; save(); render(); }
    if (e.target.classList.contains("nt-todo-del")) { todos.splice(i,1); save(); render(); }
  });
  function add() {
    const inp = document.getElementById("nt-todo-input");
    const txt = inp.value.trim(); if (!txt) return;
    todos.unshift({text:txt,done:false}); save(); render(); inp.value="";
  }
  document.getElementById("nt-todo-add").addEventListener("click", add);
  document.getElementById("nt-todo-input").addEventListener("keydown", e => { if (e.key==="Enter") add(); });
  render();
}

/* ── Pomodoro ── */
function initPomodoro() {
  const WORK  = 25 * 60;
  const BREAK = 5  * 60;
  let remaining = WORK;
  let running   = false;
  let onBreak   = false;
  let iv        = null;

  const pad = n => String(n).padStart(2, '0');
  const labelEl  = document.getElementById('nt-pom-label');
  const timeEl   = document.getElementById('nt-pom-time');
  const startBtn = document.getElementById('nt-pom-start');
  const resetBtn = document.getElementById('nt-pom-reset');
  const statusEl = document.getElementById('nt-pom-status');

  function render() {
    timeEl.textContent   = `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;
    startBtn.textContent = running ? 'Pause' : 'Start';
  }

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

  startBtn.addEventListener('click', () => {
    if (running) { clearInterval(iv); iv = null; running = false; }
    else         { running = true; iv = setInterval(tick, 1000); }
    render();
  });
  resetBtn.addEventListener('click', () => {
    clearInterval(iv); iv = null; running = false; onBreak = false;
    remaining = WORK; labelEl.textContent = 'Focus'; statusEl.textContent = '';
    render();
  });

  render();
}

/* ── Calendar ── */
function initCalendar() {
  const now   = new Date();
  let   year  = now.getFullYear();
  let   month = now.getMonth();

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  const monthEl = document.getElementById('nt-cal-month');
  const gridEl  = document.getElementById('nt-cal-grid');

  function render() {
    const first   = new Date(year, month, 1).getDay();
    const total   = new Date(year, month + 1, 0).getDate();
    const isToday = d => d === now.getDate() && month === now.getMonth() && year === now.getFullYear();

    monthEl.textContent = `${MONTHS[month]} ${year}`;
    gridEl.innerHTML = '';

    DAY_LABELS.forEach(d => {
      const el = document.createElement('div');
      el.className = 'nt-cal-dl';
      el.textContent = d;
      gridEl.appendChild(el);
    });
    for (let i = 0; i < first; i++) {
      gridEl.appendChild(document.createElement('div'));
    }
    for (let d = 1; d <= total; d++) {
      const el = document.createElement('div');
      el.className = `nt-cal-day${isToday(d) ? ' today' : ''}`;
      el.textContent = d;
      gridEl.appendChild(el);
    }
  }

  document.getElementById('nt-cal-prev').addEventListener('click', () => {
    month--; if (month < 0) { month = 11; year--; } render();
  });
  document.getElementById('nt-cal-next').addEventListener('click', () => {
    month++; if (month > 11) { month = 0; year++; } render();
  });

  render();
}

/* ── Quote ── */
function initQuote() {
  const QUOTES = [
    {text:"The secret of getting ahead is getting started.",author:"Mark Twain"},
    {text:"It does not matter how slowly you go as long as you do not stop.",author:"Confucius"},
    {text:"Build. Break. Learn. Repeat.",author:"Unknown"},
    {text:"Code is like humor. When you have to explain it, it's bad.",author:"Cory House"},
    {text:"Simplicity is the soul of efficiency.",author:"Austin Freeman"},
    {text:"Make it work, make it right, make it fast.",author:"Kent Beck"},
    {text:"Stay focused and never stop.",author:"360 Digital"},
    {text:"Every expert was once a beginner.",author:"Helen Hayes"},
    {text:"Dream big. Start small. Act now.",author:"Robin Sharma"},
  ];
  const q = QUOTES[Math.floor(Math.random()*QUOTES.length)];
  document.getElementById("nt-quote-text").textContent   = `"${q.text}"`;
  document.getElementById("nt-quote-author").textContent = `— ${q.author}`;
}

/* ══ Entry point: only show new tab UI when there's no search query ══ */
const params = new URLSearchParams(window.location.search);
if (!params.get("q")) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
}

})();
