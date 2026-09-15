// ══════════════════════════════════════════════════════════════════
// NYC DREAM 2.0 — GAME.JS
// Core game state, logic, UI, stocks, police, events, minigame
// ══════════════════════════════════════════════════════════════════

// ── GAME STATE ────────────────────────────────────────────────────────
let G = {
  name: 'PLAYER', skinTone: 1, styleChoice: 'casual', origin: 'local',
  cash: 120, savings: 0, day: 1, hour: 8, minute: 0,
  rating: 50, // UNLIMITED — no cap
  job: null, jobDays: 0, commission: 0,
  resume: [], inventory: [], wardrobe: [],
  equippedOutfit: { top:'👕', bottom:'👖', shoes:'👟', bag:null, watch:null, suit:null },
  hasMetroCard: false, hasMonthlyMetro: false, metroExpiry: 0,
  housing: 'shelter', rentPerWeek: 0, ownedHomes: [],
  vehicles: [], activeVehicle: null,
  hasParking: false,
  location: 'Penn Station', playerX: 480, playerY: 521,
  weather: '72°F ☀️', season: 'summer',
  wantedLevel: 0, // 0-5
  stocks: {}, // { tickerId: { shares, avgPrice } }
  totalStockGains: 0,
  stockPrices: {}, // live prices
  achievements: [], achievementsUnlocked: [],
  karensHandled: 0, firesHandled: 0,
  businessContracts: [], // commission deals
  gameLoopTick: 0,
  lastRentDay: 1,
  isSleeping: false,
};

// ── SKIN / OUTFIT PORTRAITS ────────────────────────────────────────────
const SKIN_PORTRAITS = {
  1: { casual:'🧑', business:'👨‍💼', street:'🧑' },
  2: { casual:'🧑🏽', business:'👨🏽‍💼', street:'🧑🏽' },
  3: { casual:'🧑🏾', business:'👨🏾‍💼', street:'🧑🏾' },
  4: { casual:'🧑🏿', business:'👨🏿‍💼', street:'🧑🏿' },
  5: { casual:'👩🏿', business:'👩🏿‍💼', street:'👩🏿' },
};

function getPortraitEmoji() {
  const map = SKIN_PORTRAITS[G.skinTone] || SKIN_PORTRAITS[1];
  if (G.equippedOutfit.suit) return SKIN_PORTRAITS[G.skinTone]?.business || '🧑';
  return map[G.styleChoice] || map.casual;
}

// ── INIT / SELECT ─────────────────────────────────────────────────────
function selectSkin(n) {
  G.skinTone = n;
  document.querySelectorAll('.skin-opt').forEach(el => el.classList.toggle('selected', +el.dataset.skin === n));
}
function selectStyle(s) {
  G.styleChoice = s;
  document.querySelectorAll('.style-opt').forEach(el => el.classList.toggle('selected', el.dataset.style === s));
}
function selectOrigin(o) {
  G.origin = o;
  document.querySelectorAll('[data-origin]').forEach(el => el.classList.toggle('selected', el.dataset.origin === o));
  // Origin bonuses
  const bonuses = { local:{cash:200,rating:60}, immigrant:{cash:80,rating:40}, tourist:{cash:350,rating:30}, suburban:{cash:150,rating:45} };
  const b = bonuses[o] || bonuses.local;
  document.querySelectorAll('[data-origin]').forEach(el => {
    if (el.dataset.origin === o) el.title = `Start: $${b.cash} cash, ${b.rating} rep`;
  });
}

// ── START GAME ────────────────────────────────────────────────────────
function startGame() {
  const nameEl = document.getElementById('player-name');
  G.name = (nameEl && nameEl.value.trim()) || 'PLAYER';

  // Origin bonuses
  const originBonus = { local:{cash:200,rating:60}, immigrant:{cash:80,rating:40}, tourist:{cash:350,rating:30}, suburban:{cash:150,rating:45} };
  const ob = originBonus[G.origin] || originBonus.local;
  G.cash   = ob.cash;
  G.rating = ob.rating;

  // Init stock prices from base
  STOCKS_DATA.forEach(s => { G.stockPrices[s.id] = s.basePrice; });

  document.getElementById('screen-intro').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');

  setTimeout(() => {
    initMiniMap();
    updateUI();

    const origins = {
      local:     "You grew up in the outer boroughs. This city is yours — now prove it.",
      immigrant: "You arrived with less than $100 and a dream. The city is brutal but fair.",
      tourist:   "You came to visit and never left. Welcome to New York, permanently.",
      suburban:  "You took the PATH train in from Jersey. Time to make it for real.",
    };
    addLog(`${G.name} steps off at Penn Station. Day 1. 8AM.`, 'info');
    addLog(origins[G.origin] || "The city awaits.", 'warn');
    addLog('Find a job to start earning. Hit "FIND JOB" or press [J].', 'normal');

    // Main game loop — every 4s = 1 in-game hour
    setInterval(gameLoop, 4000);
    // Random events every ~60s
    setInterval(() => { if (Math.random() > 0.6) triggerRandomEvent(); }, 60000);
    // Stock price updates every 30s
    setInterval(updateStockPrices, 30000);
    // Mini-map refresh every 2s
    setInterval(drawMiniMap, 2000);
    // Achievement check every 10s
    setInterval(checkAchievements, 10000);

    updateTicker();
  }, 100);
}

// ── GAME LOOP ─────────────────────────────────────────────────────────
function gameLoop() {
  if (G.isSleeping) return;
  G.gameLoopTick++;
  G.hour++;
  if (G.hour >= 24) { G.hour = 0; advanceDay(); }
  updateTimeDisplay();
  updateMiniMapClock();

  // Shelter morale drain
  if (G.housing === 'shelter' && G.gameLoopTick % 8 === 0) {
    addRating(-1); addLog('Sleeping rough is taking a toll. -1 rep.', 'warn');
  }

  // Gym bonus
  if (G.inventory.find(i=>i.id==='gym') && G.day % 7 === 0) addRating(3);

  // Monthly metro expiry check
  if (G.hasMonthlyMetro && G.day > G.metroExpiry) {
    G.hasMonthlyMetro = false; updateMetroStatus();
    addLog('30-Day MetroCard expired. Buy a new one!', 'warn');
  }

  // Wanted level decay
  if (G.wantedLevel > 0 && G.gameLoopTick % 6 === 0) {
    G.wantedLevel = Math.max(0, G.wantedLevel - 1);
    updateWantedDisplay();
  }
}

// ── DAY ADVANCE ────────────────────────────────────────────────────────
function advanceDay() {
  G.day++;
  G.hour = 8;
  document.getElementById('t-day').textContent = 'Day ' + G.day;

  // Random weather
  const weathers = [
    '72°F ☀️','58°F 🌧️','45°F 🌬️','81°F 😤','65°F ⛅','38°F ❄️',
    '76°F 🌤️','52°F 🌫️','88°F 🥵','61°F 🌩️',
  ];
  G.weather = weathers[Math.floor(Math.random() * weathers.length)];
  document.getElementById('t-weather').textContent = G.weather;

  // Rent check (every 7 days)
  if (G.day - G.lastRentDay >= 7 && G.rentPerWeek > 0) {
    G.lastRentDay = G.day;
    if (G.cash >= G.rentPerWeek) {
      spendCash(G.rentPerWeek);
      addLog(`Paid weekly rent: $${G.rentPerWeek}.`, 'money');
    } else {
      addLog('⚠️ Can\'t afford rent! Landlord threatening eviction.', 'bad');
      addRating(-8);
      G.wantedLevel = Math.min(5, G.wantedLevel + 1);
      updateWantedDisplay();
    }
  }

  // Housing rating bonus (daily small boost if in good housing)
  const h = HOUSING.find(hh => hh.id === G.housing);
  if (h && h.ratingEffect > 0) addRating(h.ratingEffect * 0.1);

  updateTicker();
  updateUI();
}

// ── TRAVEL ────────────────────────────────────────────────────────────
function travelTo(name, wx, wy) {
  const dist = Math.sqrt(Math.pow(wx - G.playerX, 2) + Math.pow(wy - G.playerY, 2));

  if (!G.hasMetroCard && !G.hasMonthlyMetro && !G.activeVehicle && dist > 80) {
    showNotif('Need a MetroCard or vehicle to travel far!', 'orange');
    addLog('No transit available. Buy a MetroCard in the SHOP.', 'warn');
    return;
  }

  G.location = name; G.playerX = wx; G.playerY = wy;

  // Animate camera if full map open
  if (document.getElementById('screen-fullmap').classList.contains('active')) {
    animateTravelTo(wx, wy, null);
  }

  document.getElementById('t-location').textContent = name;
  document.getElementById('fullmap-location').textContent = '📍 ' + name;
  addLog(`Traveled to ${name}.`, 'info');

  if (G.hasMetroCard && !G.hasMonthlyMetro) {
    G.hasMetroCard = false; updateMetroStatus();
    addLog('Single-ride MetroCard used.', 'warn');
  }

  advanceHours(Math.ceil(dist / 100));
  updateLocationContext(name);
  drawMiniMap();

  // Close full map after traveling
  setTimeout(closeFullMap, 300);
}

function travelSubway() {
  if (!G.hasMetroCard && !G.hasMonthlyMetro) { showNotif('Buy a MetroCard first!', 'orange'); return; }
  openFullMap();
  showNotif('Click any location on the map to travel there.', 'yellow');
}

// ── JOBS ───────────────────────────────────────────────────────────────
function openJobBoard() {
  let html = `
    <div class="event-header">
      <div class="event-type-tag">EMPLOYMENT OPPORTUNITIES</div>
      <div class="event-title">NYC JOB BOARD</div>
      <div class="event-location">📍 ${G.location} — Your Rep: ${Math.round(G.rating)}</div>
    </div>
    <div class="event-body">
      <p class="event-description">Higher reputation unlocks better-paying positions. Your rep is UNLIMITED — keep grinding.</p>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:420px;overflow-y:auto;">
  `;

  // Group by tier
  const tiers = [
    { label:'ENTRY LEVEL',    min:0,   max:49  },
    { label:'SKILLED',        min:50,  max:99  },
    { label:'PROFESSIONAL',   min:100, max:249 },
    { label:'EXPERT',         min:250, max:499 },
    { label:'ELITE',          min:500, max:799 },
    { label:'NYC LEGEND',     min:800, max:9999 },
  ];

  tiers.forEach(tier => {
    const tierJobs = JOBS.filter(j => j.minRating >= tier.min && j.minRating <= tier.max);
    if (!tierJobs.length) return;
    html += `<div style="font-size:9px;letter-spacing:3px;color:var(--muted);padding:10px 0 4px;">${tier.label}</div>`;
    tierJobs.forEach(job => {
      const locked = G.rating < job.minRating;
      const current = G.job && G.job.id === job.id;
      html += `
        <div style="background:var(--mid);border:1px solid ${current?'var(--yellow)':locked?'var(--border)':'var(--border)'};padding:12px;cursor:${locked?'not-allowed':'pointer'};opacity:${locked?'0.35':'1'};transition:border-color 0.2s;"
          ${!locked ? `onclick="applyForJob('${job.id}')" onmouseover="this.style.borderColor='var(--yellow)'" onmouseout="this.style.borderColor='${current?'var(--yellow)':'var(--border)'}'"` : ''}>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span style="font-size:20px;margin-right:8px;">${job.icon}</span>
              <span style="font-size:13px;font-weight:700;color:${locked?'var(--muted)':'var(--text)'};">${job.title}</span>
              ${current ? '<span style="font-size:9px;background:var(--green);color:#000;padding:1px 6px;margin-left:8px;">CURRENT</span>' : ''}
            </div>
            <div style="text-align:right;">
              <div style="color:var(--yellow);font-size:14px;font-weight:700;">$${job.pay.toLocaleString()}/day</div>
              <div style="font-size:9px;color:var(--muted);">Min Rep: ${job.minRating}</div>
            </div>
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px;">📍 ${job.location}</div>
        </div>`;
    });
  });

  html += `</div></div><div style="padding:16px 24px;"><button class="choice-btn" onclick="closeEvent()">← BACK TO CITY</button></div>`;
  showEvent(html);
}

function applyForJob(jobId) {
  const job = JOBS.find(j => j.id === jobId);
  if (!job || G.rating < job.minRating) return;

  if (G.job) {
    G.resume.unshift({ title:G.job.title, location:G.job.location, days:G.jobDays, endRating:Math.round(G.rating) });
    updateResumePanel();
  }

  G.job = job; G.jobDays = 0; G.commission = 0;
  document.getElementById('stat-job').textContent    = job.title;
  document.getElementById('stat-pay').textContent    = '$' + job.pay.toLocaleString() + '/day';
  document.getElementById('stat-commission').textContent = 'NONE';

  addLog(`Got hired as ${job.title} at ${job.location}! $${job.pay.toLocaleString()}/day`, 'good');
  showNotif(`Hired as ${job.title}! 🎉`, 'green');

  const loc = NYC_LOCATIONS.find(l => l.name === job.location);
  if (loc) travelTo(loc.name, loc.x, loc.y);

  closeEvent(); updateUI();
}

function quitJob() {
  if (!G.job) { showNotif("You don't have a job!", 'orange'); return; }
  addRating(-12);
  G.resume.unshift({ title:G.job.title, location:G.job.location, days:G.jobDays, endRating:Math.round(G.rating), quit:true });
  updateResumePanel();
  G.job = null; G.jobDays = 0; G.commission = 0;
  document.getElementById('stat-job').textContent = 'NONE';
  document.getElementById('stat-pay').textContent = '—';
  document.getElementById('stat-commission').textContent = 'NONE';
  addLog('Quit job. -12 rep. Employers notice this.', 'bad');
  updateUI();
}

// Negotiate a commission deal with employer
function negotiateCommission() {
  if (!G.job) { showNotif('Get a job first!', 'orange'); return; }
  const html = `
    <div class="event-header">
      <div class="event-type-tag">BUSINESS NEGOTIATION</div>
      <div class="event-title">COMMISSION DEAL</div>
      <div class="event-location">Current job: ${G.job.title}</div>
    </div>
    <div class="event-body">
      <p class="event-description">Negotiate a performance-based commission on top of your base pay. Higher rep = better deal.</p>
      <div class="event-choices">
        ${[5,10,15,20,25].map(pct => {
          const minRep = pct * 15;
          const locked = G.rating < minRep;
          return `<button class="choice-btn" ${locked?'disabled style="opacity:0.3"':''} onclick="acceptCommission(${pct})">
            <span class="choice-key">${pct}%</span> ${pct}% performance bonus — needs ${minRep}+ rep ${locked?'(LOCKED)':''}
          </button>`;
        }).join('')}
        <button class="choice-btn" onclick="closeEvent()">← CANCEL</button>
      </div>
    </div>`;
  showEvent(html);
}

function acceptCommission(pct) {
  G.commission = pct;
  document.getElementById('stat-commission').textContent = pct + '% / shift';
  addLog(`Commission deal locked in: ${pct}% bonus per shift!`, 'good');
  showNotif(`${pct}% commission agreed! 🤝`, 'green');
  closeEvent();
}

// ── WORK MINIGAME ─────────────────────────────────────────────────────
let mg = { score:0, total:0, active:false, interval:null };

function doWorkDay() {
  if (!G.job) { showNotif('Find a job first! Press [J]', 'orange'); return; }

  const job = G.job;
  const html = `
    <div class="event-header">
      <div class="event-type-tag">WORK SHIFT — DAY ${G.jobDays+1}</div>
      <div class="event-title">${job.title}</div>
      <div class="event-location">📍 ${job.location} • Base Pay: $${job.pay.toLocaleString()} • Commission: ${G.commission?G.commission+'%':'none'}</div>
    </div>
    <div class="event-body">
      <div class="event-character">
        <div class="char-avatar">${job.icon}</div>
        <div class="char-info">
          <div class="char-name">TODAY'S SHIFT</div>
          <div class="char-desc">${job.desc}</div>
        </div>
      </div>
      <div class="event-stakes">
        <div class="stake-item"><div class="stake-val pos">+$${job.pay.toLocaleString()}</div><div class="stake-label">BASE PAY</div></div>
        <div class="stake-item"><div class="stake-val pos" id="mg-bonus-prev">+$0</div><div class="stake-label">PERF BONUS</div></div>
        <div class="stake-item"><div class="stake-val" id="mg-rat-prev" style="color:var(--yellow)">±?</div><div class="stake-label">REP CHANGE</div></div>
      </div>
    </div>
    <div id="minigame-wrap">
      <div id="minigame-area">
        <div class="mg-instruction" id="mg-inst">CLICK ANYWHERE TO START YOUR SHIFT</div>
      </div>
      <div class="mg-bar-wrap">
        <span id="mg-timer-lbl">15s</span>
        <div class="mg-bar"><div class="mg-bar-fill" id="mg-bar-fill" style="width:100%"></div></div>
        <span id="mg-score-lbl">0 / 0</span>
      </div>
    </div>
    <div style="padding:0 24px 20px;">
      <button class="choice-btn" id="mg-done-btn" style="display:none" onclick="finishWorkDay()">
        <span class="choice-key">↵</span> COLLECT PAY & END SHIFT
      </button>
    </div>`;

  showEvent(html);
  mg.score = 0; mg.total = 0; mg.active = false;

  document.getElementById('minigame-area').addEventListener('click', function startMG() {
    if (mg.active) return;
    mg.active = true;
    document.getElementById('mg-inst').style.display = 'none';

    const area = document.getElementById('minigame-area');
    let timeLeft = 15;

    // Fire job uses a different visual
    const isFire = job.dept === 'emergency';
    const emojis = isFire
      ? ['🔥','🔥','💧','🔥','🚒','🔥']
      : ['📦','🍽️','📄','☕','📱','💼','🔧','📊','📋','🧾','🎟️','📮'];

    function spawnTarget() {
      if (!mg.active) return;
      mg.total++;
      const t = document.createElement('div');
      t.className = 'mg-target';
      t.textContent = emojis[Math.floor(Math.random()*emojis.length)];
      const mxPos = Math.max(10, area.offsetWidth  - 50);
      const myPos = Math.max(10, area.offsetHeight - 50);
      t.style.left = (10 + Math.random()*mxPos) + 'px';
      t.style.top  = (10 + Math.random()*myPos) + 'px';
      if (isFire) t.style.borderColor = '#E8001A';
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        mg.score++;
        document.getElementById('mg-score-lbl').textContent = `${mg.score} / ${mg.total}`;
        const b = Math.floor(mg.score * (G.job.pay * 0.08 * (1 + G.commission/100)));
        document.getElementById('mg-bonus-prev').textContent = '+$' + b.toLocaleString();
        const rc = Math.floor((mg.score/Math.max(mg.total,1)*10)-3);
        const rcEl = document.getElementById('mg-rat-prev');
        if(rcEl){rcEl.textContent = (rc>=0?'+':'')+rc; rcEl.style.color = rc>=0?'var(--green)':'var(--red)';}
        t.style.transform = 'scale(0)';
        setTimeout(() => { if(t.parentNode) t.remove(); }, 180);
      });
      area.appendChild(t);
      setTimeout(() => { if(t.parentNode) t.remove(); }, 1800);
    }

    mg.interval = setInterval(spawnTarget, 800);

    const tmr = setInterval(() => {
      timeLeft--;
      const fill = document.getElementById('mg-bar-fill');
      if(fill) fill.style.width = (timeLeft/15*100)+'%';
      const lbl = document.getElementById('mg-timer-lbl');
      if(lbl) lbl.textContent = timeLeft + 's';
      if (timeLeft <= 0) {
        clearInterval(tmr); clearInterval(mg.interval); mg.active = false;
        document.querySelectorAll('.mg-target').forEach(t => t.remove());
        const done = document.getElementById('mg-done-btn');
        if(done) done.style.display = 'flex';
        const inst = document.getElementById('mg-inst');
        if(inst) {
          inst.style.display = 'block';
          const acc = mg.total>0 ? Math.round(mg.score/mg.total*100) : 0;
          inst.textContent = `SHIFT DONE! ${mg.score}/${mg.total} tasks (${acc}% efficiency)`;
        }
      }
    }, 1000);
  });
}

function finishWorkDay() {
  const acc = mg.total > 0 ? mg.score/mg.total : 0;
  const basePay = G.job.pay;
  const perfBonus = Math.floor(mg.score * basePay * 0.08);
  const commBonus = Math.floor((basePay + perfBonus) * (G.commission/100));
  const totalPay  = basePay + perfBonus + commBonus;
  const repChange = Math.floor(acc * 14) - 5;

  addCash(totalPay);
  addRating(repChange);
  G.jobDays++;
  document.getElementById('stat-daysworked').textContent = G.jobDays;

  const accP = Math.round(acc*100);
  const commStr = commBonus > 0 ? ` +$${commBonus} commission` : '';
  if(accP >= 80)      addLog(`🌟 Excellent! ${accP}% efficiency. +$${totalPay.toLocaleString()}${commStr}. Rep: ${repChange>0?'+':''}${repChange}`, 'good');
  else if(accP >= 50) addLog(`Good shift. ${accP}% efficiency. +$${totalPay.toLocaleString()}${commStr}. Rep: ${repChange>0?'+':''}${repChange}`, 'normal');
  else                addLog(`Rough shift. ${accP}% efficiency. +$${totalPay.toLocaleString()}. Rep: ${repChange}`, 'bad');

  // FDNY fire handled
  if (G.job.dept === 'emergency' && accP >= 60) { G.firesHandled++; }

  // Fired check
  if (G.rating < 10 && G.job) {
    addLog('🚨 FIRED! Your rep dropped too low. Back to the streets.', 'bad');
    quitJob();
  }

  advanceDay(); closeEvent(); updateUI();
}

// ── STOCK MARKET ──────────────────────────────────────────────────────
function updateStockPrices() {
  STOCKS_DATA.forEach(s => {
    const prev = G.stockPrices[s.id] || s.basePrice;
    const change = (Math.random() - 0.48) * s.volatility * prev + s.trend * prev;
    G.stockPrices[s.id] = Math.max(1, +(prev + change).toFixed(2));
  });
  // Update portfolio value display
  updatePortfolioValue();
}

function updatePortfolioValue() {
  let total = 0;
  Object.entries(G.stocks).forEach(([id, pos]) => {
    total += pos.shares * (G.stockPrices[id] || 0);
  });
  const el = document.getElementById('stat-portfolio');
  if (el) el.textContent = '$' + total.toLocaleString(undefined, {maximumFractionDigits:2});
  return total;
}

function openStockMarket() {
  let html = `
    <div class="event-header">
      <div class="event-type-tag">NYSE / NASDAQ — NYC EDITION</div>
      <div class="event-title">STOCK MARKET</div>
      <div class="event-location">💰 Cash: $${G.cash.toFixed(2)} • Portfolio: $${updatePortfolioValue().toLocaleString()}</div>
    </div>
    <div class="event-body">
      <p class="event-description">Buy and sell shares of NYC-based companies. Prices update every 30 seconds in real-time.</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
  `;

  STOCKS_DATA.forEach(s => {
    const price = G.stockPrices[s.id] || s.basePrice;
    const pos   = G.stocks[s.id] || { shares:0, avgPrice:0 };
    const pnl   = pos.shares > 0 ? (price - pos.avgPrice) * pos.shares : 0;
    const pnlPct = pos.avgPrice > 0 ? ((price - pos.avgPrice)/pos.avgPrice*100).toFixed(1) : '—';
    html += `
      <div style="background:var(--mid);border:1px solid var(--border);padding:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-size:12px;font-weight:700;color:var(--yellow);">${s.id}</span>
            <span style="font-size:11px;color:var(--muted);margin-left:8px;">${s.name}</span>
          </div>
          <div style="text-align:right;">
            <span style="font-size:14px;font-weight:700;color:var(--text);">$${price.toFixed(2)}</span>
            <span style="font-size:10px;color:var(--muted);margin-left:6px;">${s.sector}</span>
          </div>
        </div>
        ${pos.shares>0 ? `<div style="font-size:10px;color:var(--muted);margin:4px 0;">You own: ${pos.shares} shares • P&L: <span style="color:${pnl>=0?'var(--green)':'var(--red)'};">${pnl>=0?'+':''}$${pnl.toFixed(2)} (${pnlPct}%)</span></div>` : ''}
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button class="action-btn" style="font-size:9px;padding:5px 8px;" onclick="stockTrade('${s.id}','buy',1)">BUY 1</button>
          <button class="action-btn" style="font-size:9px;padding:5px 8px;" onclick="stockTrade('${s.id}','buy',5)">BUY 5</button>
          <button class="action-btn" style="font-size:9px;padding:5px 8px;" onclick="stockTrade('${s.id}','buy',10)">BUY 10</button>
          ${pos.shares>0 ? `<button class="action-btn danger" style="font-size:9px;padding:5px 8px;" onclick="stockTrade('${s.id}','sell',${pos.shares})">SELL ALL</button>` : ''}
        </div>
      </div>`;
  });

  html += `</div></div><div style="padding:16px 24px;"><button class="choice-btn" onclick="closeEvent()">← BACK TO CITY</button></div>`;
  showEvent(html);
}

function stockTrade(id, action, qty) {
  const s = STOCKS_DATA.find(s => s.id === id);
  if (!s) return;
  const price = G.stockPrices[id] || s.basePrice;
  if (!G.stocks[id]) G.stocks[id] = { shares:0, avgPrice:0 };

  if (action === 'buy') {
    const cost = price * qty;
    if (G.cash < cost) { showNotif('Not enough cash!', 'red'); return; }
    const prev = G.stocks[id];
    const totalShares = prev.shares + qty;
    prev.avgPrice = (prev.avgPrice * prev.shares + cost) / totalShares;
    prev.shares   = totalShares;
    spendCash(cost);
    addLog(`Bought ${qty} shares of ${id} @ $${price.toFixed(2)} = $${cost.toFixed(2)}`, 'money');
  } else {
    const pos = G.stocks[id];
    if (!pos || pos.shares < qty) { showNotif('Not enough shares!', 'orange'); return; }
    const revenue = price * qty;
    const gain    = (price - pos.avgPrice) * qty;
    G.totalStockGains += gain;
    pos.shares -= qty;
    addCash(revenue);
    addLog(`Sold ${qty} ${id} @ $${price.toFixed(2)}. Gain: ${gain>=0?'+':''}$${gain.toFixed(2)}`, gain>=0?'good':'bad');
    if (pos.shares === 0) delete G.stocks[id];
  }
  updatePortfolioValue();
  openStockMarket();
}

// ── SHOP ──────────────────────────────────────────────────────────────
function openShop() {
  const cats = ['transit','food','clothing','gear','career','lifestyle'];
  const catIcons = { transit:'🚇', food:'🍕', clothing:'👔', gear:'⚙️', career:'📈', lifestyle:'🍸' };

  let html = `
    <div class="event-header">
      <div class="event-type-tag">NYC MARKETPLACE</div>
      <div class="event-title">SHOP & SPEND</div>
      <div class="event-location">💰 Cash: $${G.cash.toFixed(2)}</div>
    </div>
    <div class="event-body" style="padding-bottom:0;">
      <p class="event-description">Every dollar is a decision. Invest in yourself, get around the city, eat and live.</p>
    </div>`;

  cats.forEach(cat => {
    const items = SHOP_ITEMS.filter(i => i.cat === cat);
    if (!items.length) return;
    html += `<div class="section-title" style="padding:12px 24px 6px;font-size:9px;letter-spacing:3px;">${catIcons[cat]} ${cat.toUpperCase()}</div>`;
    html += `<div class="shop-grid">`;
    items.forEach(item => {
      const cantAfford = G.cash < item.price;
      const owned = G.inventory.some(i => i.id === item.id);
      html += `
        <div class="shop-item ${cantAfford||owned?'cant-afford':''}" onclick="${cantAfford||owned?'':` buyItem('${item.id}')`}">
          <div class="shop-item-icon">${item.icon}</div>
          <div class="shop-item-name">${item.name}${owned?' ✓':''}</div>
          <div class="shop-item-desc">${item.desc}</div>
          <div class="shop-item-price">$${item.price.toFixed(2)}</div>
        </div>`;
    });
    html += '</div>';
  });

  html += `
    <div style="padding:4px 24px 8px;"><div class="section-title" style="padding:8px 0 6px;font-size:9px;letter-spacing:3px;">🚗 VEHICLES (see dealer)</div>
      <button class="choice-btn" style="margin-bottom:4px;" onclick="openVehicleDealer()"><span class="choice-key">V</span> Browse Vehicle Dealership</button>
      <button class="choice-btn" onclick="openHousingMenu()"><span class="choice-key">H</span> Browse Housing Market</button>
    </div>
    <div style="padding:0 24px 20px;"><button class="choice-btn" onclick="closeEvent()">← BACK TO CITY</button></div>`;

  showEvent(html);
}

function buyItem(itemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item || G.cash < item.price) { showNotif('Not enough cash!', 'red'); return; }
  spendCash(item.price);

  // Apply effects
  const ef = item.effect;
  if (ef === 'metro_single')      { G.hasMetroCard = true; updateMetroStatus(); }
  else if (ef === 'metro_30day')  { G.hasMonthlyMetro = true; G.metroExpiry = G.day + 30; updateMetroStatus(); addRating(5); }
  else if (ef.startsWith('rating+')) { const n = +ef.split('+')[1]; addRating(isNaN(n)?0:n); }
  else if (ef.startsWith('ward+'))   { const n = +ef.split('+')[1]; addRating(isNaN(n)?0:n); G.wardrobe.push({ id:item.id, icon:item.icon, name:item.name }); updateWardrobeDisplay(); }
  else if (ef.startsWith('unlock+')) { const n = +ef.split('+')[1]; addRating(isNaN(n)?0:n); }

  // Durable items to inventory
  const durables = ['metro_30day','suit_basic','suit_nice','suit_luxury','briefcase','cell_phone','laptop','camera','gym','rolex','hermes_bag','gucci_loafers','nike_sneakers','parking_spot'];
  if (durables.includes(item.id)) {
    G.inventory.push({ id:item.id, icon:item.icon, name:item.name });
    updateInventoryDisplay();
  }

  addLog(`Bought: ${item.name} for $${item.price.toFixed(2)}`, 'money');
  showNotif(`${item.icon} ${item.name} — purchased!`, 'green');
  openShop();
}

// ── VEHICLE DEALER ────────────────────────────────────────────────────
function openVehicleDealer() {
  let html = `
    <div class="event-header">
      <div class="event-type-tag">NYC AUTO DEALER</div>
      <div class="event-title">VEHICLE SHOWROOM</div>
      <div class="event-location">💰 Cash: $${G.cash.toLocaleString()}</div>
    </div>
    <div class="event-body">
      <p class="event-description">Own a vehicle for faster travel. Manhattan requires a parking spot ($450/month extra).</p>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;">`;

  VEHICLES.forEach(v => {
    const owned = G.vehicles.find(vv => vv.id === v.id);
    const cantAfford = G.cash < v.price;
    html += `
      <div style="background:var(--mid);border:1px solid ${owned?'var(--yellow)':'var(--border)'};padding:12px;cursor:${cantAfford||owned?'not-allowed':'pointer'};opacity:${cantAfford?'0.4':'1'};"
        ${!cantAfford && !owned ? `onclick="buyVehicle('${v.id}')" onmouseover="this.style.borderColor='var(--yellow)'" onmouseout="this.style.borderColor='var(--border)'"` : ''}>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div><span style="font-size:22px;margin-right:8px;">${v.icon}</span><span style="font-size:13px;font-weight:700;">${v.name}</span>${owned?'<span style="font-size:9px;background:var(--green);color:#000;padding:1px 6px;margin-left:8px;">OWNED</span>':''}</div>
          <div style="text-align:right;">
            <div style="color:var(--yellow);font-size:14px;font-weight:700;">$${v.price.toLocaleString()}</div>
            <div style="font-size:9px;color:var(--muted);">$${v.maintenance}/wk maint.</div>
          </div>
        </div>
      </div>`;
  });

  html += `</div></div><div style="padding:16px 24px;"><button class="choice-btn" onclick="closeEvent()">← BACK</button></div>`;
  showEvent(html);
}

function buyVehicle(vid) {
  const v = VEHICLES.find(vv => vv.id === vid);
  if (!v || G.cash < v.price) { showNotif('Not enough cash!', 'red'); return; }
  spendCash(v.price);
  G.vehicles.push({ ...v });
  G.activeVehicle = v.id;
  addRating(10);
  addLog(`Bought ${v.name}! 🚗 Now you can travel freely.`, 'good');
  showNotif(`${v.icon} ${v.name} — yours now!`, 'green');
  updateInventoryDisplay();
  closeEvent();
}

// ── HOUSING ───────────────────────────────────────────────────────────
function openHousingMenu() {
  let html = `
    <div class="event-header">
      <div class="event-type-tag">NYC REAL ESTATE</div>
      <div class="event-title">HOUSING MARKET</div>
      <div class="event-location">Current: ${HOUSING.find(h=>h.id===G.housing)?.name || 'Shelter'} | Cash+Savings: $${(G.cash+G.savings).toLocaleString()}</div>
    </div>
    <div class="event-body">
      <p class="event-description">Where you live affects your reputation, rent, and daily morale. You can rent OR buy (when you have the cash).</p>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:440px;overflow-y:auto;">`;

  HOUSING.forEach(h => {
    const current = h.id === G.housing;
    const owned   = G.ownedHomes.includes(h.id);
    const canBuyNow = h.canBuy && (G.cash + G.savings) >= h.buyPrice;
    const rentCantAfford = G.cash < h.weeklyRent * 2 && h.weeklyRent > 0;
    html += `
      <div style="background:var(--mid);border:1px solid ${current?'var(--yellow)':'var(--border)'};padding:14px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-size:14px;">${h.icon} <span style="font-size:13px;font-weight:700;color:${current?'var(--yellow)':'var(--text)'};">${h.name}</span> ${current?'<span style="font-size:9px;background:var(--yellow);color:#000;padding:1px 6px;">CURRENT</span>':''} ${owned?'<span style="font-size:9px;background:var(--green);color:#000;padding:1px 6px;">OWNED</span>':''}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:2px;">📍 ${h.location} • Rep boost: +${h.ratingEffect}/wk</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="color:var(--red);font-size:13px;font-weight:700;">${h.weeklyRent===0?'FREE':'$'+h.weeklyRent+'/wk'}</div>
            ${h.canBuy?`<div style="color:var(--yellow);font-size:11px;">Buy: $${h.buyPrice.toLocaleString()}</div>`:''}
          </div>
        </div>
        ${!current && !owned ? `
          <div style="display:flex;gap:6px;margin-top:10px;">
            ${!rentCantAfford?`<button class="action-btn" style="font-size:9px;" onclick="moveInto('${h.id}','rent')">📋 RENT</button>`:'<span style="font-size:9px;color:var(--muted);">Can\'t afford rent</span>'}
            ${h.canBuy && canBuyNow ? `<button class="action-btn primary" style="font-size:9px;" onclick="moveInto('${h.id}','buy')">🏠 BUY</button>` : ''}
          </div>` : ''}
      </div>`;
  });

  html += `</div></div><div style="padding:16px 24px;"><button class="choice-btn" onclick="closeEvent()">← BACK</button></div>`;
  showEvent(html);
}

function moveInto(id, mode) {
  const h = HOUSING.find(hh => hh.id === id);
  if (!h) return;

  if (mode === 'buy') {
    const total = G.cash + G.savings;
    if (total < h.buyPrice) { showNotif('Not enough total funds!', 'red'); return; }
    let remaining = h.buyPrice;
    if (G.savings >= remaining) { G.savings -= remaining; }
    else { remaining -= G.savings; G.savings = 0; G.cash -= remaining; }
    G.ownedHomes.push(h.id);
    addLog(`BOUGHT ${h.name} for $${h.buyPrice.toLocaleString()}! You own Manhattan real estate now.`, 'money');
    addRating(25);
  }

  G.housing = id;
  G.rentPerWeek = mode === 'buy' ? 0 : h.weeklyRent;
  G.lastRentDay = G.day;
  document.getElementById('stat-rent').textContent = G.rentPerWeek > 0 ? '$' + G.rentPerWeek + '/wk' : mode==='buy' ? 'OWNED' : 'NONE';

  if (id !== 'shelter') addRating(h.ratingEffect);
  showNotif(`Moved to ${h.name}! ${h.icon}`, 'green');
  addLog(`Moved to ${h.name}. Weekly rent: ${G.rentPerWeek>0?'$'+G.rentPerWeek:'FREE'}.`, 'money');

  // Travel to housing location
  const loc = NYC_LOCATIONS.find(l => l.name === h.location);
  if (loc) travelTo(loc.name, loc.x, loc.y);
  closeEvent(); updateUI();
}

// ── SLEEP ─────────────────────────────────────────────────────────────
function doSleep() {
  if (G.hour >= 6 && G.hour <= 20) {
    showNotif("It's daytime — hustle first, sleep later!", 'orange'); return;
  }
  G.isSleeping = true;
  const html = `
    <div class="event-header">
      <div class="event-type-tag">END OF DAY</div>
      <div class="event-title">GETTING SOME REST</div>
      <div class="event-location">${HOUSING.find(h=>h.id===G.housing)?.name || 'Shelter'}</div>
    </div>
    <div class="event-body" style="text-align:center;padding:40px 24px;">
      <div style="font-size:48px;margin-bottom:20px;">😴</div>
      <p class="event-description">You rest for the night. The city that never sleeps will still be here tomorrow.</p>
      <div style="margin-top:20px;">
        <button class="choice-btn" onclick="wakeUp()" style="justify-content:center;">
          <span class="choice-key">☀️</span> WAKE UP — Day ${G.day+1}
        </button>
      </div>
    </div>`;
  showEvent(html);
}

function wakeUp() {
  G.isSleeping = false;
  advanceDay(); // triggers rent etc.
  G.hour = 8;
  updateTimeDisplay();
  addRating(3); // rested bonus
  addLog('Woke up refreshed. +3 rep.', 'good');
  closeEvent();
}

// ── NPC / NETWORKING ──────────────────────────────────────────────────
function talkToNPC() {
  const npc = NPC_ENCOUNTERS[Math.floor(Math.random() * NPC_ENCOUNTERS.length)];
  const quote = npc.lines[Math.floor(Math.random() * npc.lines.length)];

  if (npc.isKaren) {
    // Karen encounter
    const html = `
      <div class="event-header">
        <div class="event-type-tag">⚠️ KAREN ALERT</div>
        <div class="event-title">DIFFICULT CUSTOMER</div>
        <div class="event-location">📍 ${G.location}</div>
      </div>
      <div class="event-body">
        <div class="event-character">
          <div class="char-avatar">${npc.emoji}</div>
          <div class="char-info"><div class="char-name">${npc.name}</div><div class="char-desc">${npc.type}</div></div>
        </div>
        <div class="task-box" style="border-color:var(--red);background:rgba(232,0,26,0.05);">
          <div class="task-title" style="color:var(--red);">😤 SHE SAYS...</div>
          <div class="task-desc" style="font-style:italic;">"${quote}"</div>
        </div>
        <div class="event-choices">
          <button class="choice-btn" onclick="handleKaren('calm')"><span class="choice-key">A</span> Stay calm and professional</button>
          <button class="choice-btn" onclick="handleKaren('manager')"><span class="choice-key">B</span> Get the manager immediately</button>
          <button class="choice-btn danger" onclick="handleKaren('argue')"><span class="choice-key">C</span> Argue back (not recommended)</button>
        </div>
      </div>`;
    showEvent(html); return;
  }

  const html = `
    <div class="event-header">
      <div class="event-type-tag">NETWORKING</div>
      <div class="event-title">STREET ENCOUNTER</div>
      <div class="event-location">📍 ${G.location}</div>
    </div>
    <div class="event-body">
      <div class="event-character">
        <div class="char-avatar">${npc.emoji}</div>
        <div class="char-info"><div class="char-name">${npc.name}</div><div class="char-desc">${npc.type}</div></div>
      </div>
      <div class="task-box">
        <div class="task-title">💬 THEY SAY...</div>
        <div class="task-desc" style="font-style:italic;font-size:14px;">"${quote}"</div>
      </div>
      <div class="event-stakes">
        <div class="stake-item"><div class="stake-val pos">+${npc.ratingBoost}</div><div class="stake-label">REP BOOST</div></div>
        <div class="stake-item"><div class="stake-val" style="color:var(--blue)">📇</div><div class="stake-label">NEW CONTACT</div></div>
      </div>
      <div class="event-choices">
        <button class="choice-btn" onclick="npcRespond('${npc.name}',${npc.ratingBoost},false)"><span class="choice-key">A</span> Engage — listen and learn.</button>
        <button class="choice-btn" onclick="npcRespond('${npc.name}',0,true)"><span class="choice-key">B</span> Keep moving. No time.</button>
      </div>
    </div>`;
  showEvent(html);
}

function npcRespond(name, boost, skip) {
  if (!skip) { addRating(boost); addLog(`Talked with ${name}. +${boost} rep.`, 'good'); showNotif(`+${boost} rep from ${name}`, 'green'); }
  else        { addLog(`Passed ${name}. Maybe next time.`, 'normal'); }
  closeEvent();
}

function handleKaren(choice) {
  G.karensHandled++;
  if(choice==='calm')    { addRating(6);  addLog('Handled the Karen with grace. +6 rep.', 'good'); showNotif('+6 rep — stayed professional 💪', 'green'); }
  else if(choice==='manager') { addLog('Got the manager. Situation resolved.', 'normal'); }
  else                   { addRating(-14); addLog('Argued with the Karen. She\'s calling corporate. -14 rep.', 'bad'); showNotif('-14 rep — never argue with a Karen', 'red'); }
  closeEvent();
}

// ── RANDOM EVENTS ─────────────────────────────────────────────────────
function triggerRandomEvent() {
  const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
  let html = `
    <div class="event-header">
      <div class="event-type-tag">CITY EVENT ${event.emoji}</div>
      <div class="event-title">${event.title}</div>
      <div class="event-location">📍 ${G.location} — Day ${G.day}</div>
    </div>
    <div class="event-body">
      <p class="event-description">${event.desc}</p>
      <div class="event-choices">
        ${event.choices.map((c,i) => `<button class="choice-btn" onclick="resolveEvent(${i})"><span class="choice-key">${String.fromCharCode(65+i)}</span> ${c.text}</button>`).join('')}
      </div>
    </div>`;
  showEvent(html);
  window._pendingEvent = event;
}

function resolveEvent(idx) {
  if (window._pendingEvent) {
    const result = window._pendingEvent.choices[idx].effect(G);
    addLog(result, 'normal');
  }
  closeEvent(); updateUI();
}

// ── WANTED / POLICE ────────────────────────────────────────────────────
function triggerPoliceEvent() {
  G.wantedLevel = Math.min(5, G.wantedLevel + 1);
  updateWantedDisplay();
  if (G.wantedLevel >= 2) {
    triggerChaseEvent();
  }
}

function triggerChaseEvent() {
  const fine = [0, 75, 200, 500, 1200, 3000][G.wantedLevel] || 200;
  const html = `
    <div class="event-header">
      <div class="event-type-tag">⭐ WANTED LEVEL ${G.wantedLevel}</div>
      <div class="event-title">NYPD PURSUIT</div>
      <div class="event-location">📍 ${G.location}</div>
    </div>
    <div class="event-body">
      <p class="event-description">NYPD units are converging on your location. You've got seconds to decide.</p>
      <div class="event-stakes">
        <div class="stake-item"><div class="stake-val neg">$${fine}</div><div class="stake-label">FINE</div></div>
        <div class="stake-item"><div class="stake-val neg">Wanted ⭐${G.wantedLevel}</div><div class="stake-label">HEAT LEVEL</div></div>
      </div>
      <div class="event-choices">
        <button class="choice-btn" onclick="policeChoice('pay',${fine})"><span class="choice-key">A</span> Pay the fine ($${fine}). Cooperate.</button>
        <button class="choice-btn" onclick="policeChoice('run',${fine})"><span class="choice-key">B</span> Run. (${G.rating>=80?'High rep — decent odds':'Risky'})</button>
        <button class="choice-btn" onclick="policeChoice('lawyer',${fine})"><span class="choice-key">C</span> Call your lawyer. ${G.cash>=fine*2?'You can afford it.':'Expensive.'}</button>
      </div>
    </div>`;
  showEvent(html);
}

function policeChoice(action, fine) {
  if (action === 'pay') {
    spendCash(fine);
    G.wantedLevel = 0; updateWantedDisplay();
    addLog(`Paid $${fine} fine. Wanted level cleared.`, 'bad');
  } else if (action === 'run') {
    const escapeChance = Math.min(0.8, G.rating / 150);
    if (Math.random() < escapeChance) {
      G.wantedLevel = Math.max(0, G.wantedLevel - 1);
      addLog('Escaped the cops! Wanted level reduced.', 'good');
    } else {
      spendCash(fine * 2); addRating(-10);
      G.wantedLevel = Math.min(5, G.wantedLevel + 1);
      addLog(`Caught while running. Fine doubled: $${fine*2}. -10 rep.`, 'bad');
    }
    updateWantedDisplay();
  } else { // lawyer
    const cost = fine * 1.5;
    if (G.cash >= cost) { spendCash(cost); G.wantedLevel = 0; updateWantedDisplay(); addLog(`Lawyer got you off. Cost $${cost}. Wanted cleared.`, 'money'); }
    else { addLog("Can't afford the lawyer. Paying fine instead.", 'bad'); spendCash(fine); G.wantedLevel = 0; updateWantedDisplay(); }
  }
  closeEvent(); updateUI();
}

// ── BANK ──────────────────────────────────────────────────────────────
function saveToBank() {
  if (G.cash < 10) { showNotif('Need at least $10 to deposit.', 'orange'); return; }
  const amt = Math.floor(G.cash * 0.75);
  G.savings += amt; G.cash -= amt;
  addLog(`Deposited $${amt.toLocaleString()} to savings.`, 'money');
  showNotif(`$${amt.toLocaleString()} saved! 🏦`, 'green');
  updateUI();
}

function withdrawBank() {
  if (G.savings < 1) { showNotif('No savings to withdraw.', 'orange'); return; }
  addCash(G.savings);
  addLog(`Withdrew $${G.savings.toLocaleString()} from savings.`, 'money');
  G.savings = 0; updateUI();
}

// ── WARDROBE ──────────────────────────────────────────────────────────
function openWardrobePanel() {
  let html = `
    <div class="event-header">
      <div class="event-type-tag">PERSONAL STYLE</div>
      <div class="event-title">YOUR WARDROBE</div>
      <div class="event-location">Outfit affects your rep and first impressions</div>
    </div>
    <div class="event-body">
      <div style="text-align:center;font-size:48px;margin-bottom:16px;">${getPortraitEmoji()}</div>
      <p class="event-description">Your current outfit defines how NYC sees you. Equip items from your wardrobe.</p>
      <div style="display:flex;flex-direction:column;gap:8px;">`;

  const wardItems = G.wardrobe;
  if (!wardItems.length) {
    html += '<div style="color:var(--muted);font-size:11px;">No clothing items yet. Visit the SHOP to buy clothes.</div>';
  } else {
    wardItems.forEach(item => {
      const equipped = Object.values(G.equippedOutfit).includes(item.icon);
      html += `
        <div style="background:var(--mid);border:1px solid ${equipped?'var(--yellow)':'var(--border)'};padding:10px;cursor:pointer;" onclick="toggleEquip('${item.id}')">
          <span style="font-size:18px;margin-right:8px;">${item.icon}</span>
          <span style="font-size:12px;">${item.name}</span>
          ${equipped?'<span style="float:right;font-size:9px;background:var(--yellow);color:#000;padding:1px 5px;">EQUIPPED</span>':''}
        </div>`;
    });
  }

  html += `</div></div><div style="padding:16px 24px;"><button class="choice-btn" onclick="closeEvent()">← BACK</button></div>`;
  showEvent(html);
}

function toggleEquip(itemId) {
  const item = G.wardrobe.find(i => i.id === itemId);
  if (!item) return;
  const shopItem = SHOP_ITEMS.find(i => i.id === itemId);
  if (shopItem && shopItem.slot) {
    G.equippedOutfit[shopItem.slot] = item.icon;
  }
  updatePortrait();
  openWardrobePanel();
}

// ── CHARACTER PANEL ────────────────────────────────────────────────────
function openCharacterPanel() {
  const html = `
    <div class="event-header">
      <div class="event-type-tag">YOUR CHARACTER</div>
      <div class="event-title">${G.name}</div>
      <div class="event-location">${getRatingTier()} • ${G.origin.toUpperCase()}</div>
    </div>
    <div class="event-body" style="text-align:center;">
      <div style="font-size:72px;margin:16px 0;">${getPortraitEmoji()}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
        <div style="background:var(--mid);border:1px solid var(--border);padding:10px;">
          <div style="font-size:10px;color:var(--muted);">REPUTATION</div>
          <div style="font-size:20px;color:var(--yellow);font-weight:700;">${Math.round(G.rating)}</div>
        </div>
        <div style="background:var(--mid);border:1px solid var(--border);padding:10px;">
          <div style="font-size:10px;color:var(--muted);">NET WORTH</div>
          <div style="font-size:16px;color:var(--green);font-weight:700;">$${(G.cash+G.savings+updatePortfolioValue()).toLocaleString()}</div>
        </div>
        <div style="background:var(--mid);border:1px solid var(--border);padding:10px;">
          <div style="font-size:10px;color:var(--muted);">DAYS IN NYC</div>
          <div style="font-size:20px;color:var(--text);font-weight:700;">${G.day}</div>
        </div>
        <div style="background:var(--mid);border:1px solid var(--border);padding:10px;">
          <div style="font-size:10px;color:var(--muted);">VEHICLES OWNED</div>
          <div style="font-size:20px;color:var(--orange);font-weight:700;">${G.vehicles.length}</div>
        </div>
      </div>
      <div style="text-align:left;">
        <div style="font-size:9px;letter-spacing:3px;color:var(--muted);margin-bottom:8px;">ACHIEVEMENTS (${G.achievementsUnlocked.length}/${ACHIEVEMENTS.length})</div>
        ${ACHIEVEMENTS.map(a => `
          <div style="padding:6px 0;border-bottom:1px solid #111;display:flex;align-items:center;gap:8px;">
            <span style="font-size:14px;">${G.achievementsUnlocked.includes(a.id)?'✅':'⬜'}</span>
            <div>
              <div style="font-size:11px;color:${G.achievementsUnlocked.includes(a.id)?'var(--yellow)':'var(--muted)'};">${a.title}</div>
              <div style="font-size:9px;color:var(--muted);">${a.desc}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>
    <div style="padding:16px 24px;"><button class="choice-btn" onclick="closeEvent()">← BACK</button></div>`;
  showEvent(html);
}

// ── ACHIEVEMENTS ──────────────────────────────────────────────────────
function checkAchievements() {
  ACHIEVEMENTS.forEach(a => {
    if (!G.achievementsUnlocked.includes(a.id) && a.check(G)) {
      G.achievementsUnlocked.push(a.id);
      addRating(a.reward);
      addCash(a.reward * 10);
      addLog(`🏆 ACHIEVEMENT: "${a.title}" — ${a.desc}. +${a.reward} rep, +$${a.reward*10}!`, 'good');
      showNotif(`🏆 ${a.title} unlocked!`, 'green');
    }
  });
}

// ── LOCATION CONTEXT ───────────────────────────────────────────────────
function updateLocationContext(name) {
  const loc = NYC_LOCATIONS.find(l => l.name === name);
  const nameEl = document.getElementById('loc-ctx-name');
  const descEl = document.getElementById('loc-ctx-desc');
  const actEl  = document.getElementById('loc-ctx-actions');
  if (!nameEl || !loc) return;
  nameEl.textContent = loc.icon + ' ' + loc.name.toUpperCase();
  const descs = {
    'TRANSIT HUB':        'Transit hub. Many subway/bus connections here.',
    'FINANCE DISTRICT':   'Finance district. Wall Street jobs available.',
    'ENTERTAINMENT':      'Entertainment district. Networking opportunities.',
    'PUBLIC PARK':        'Public park. Great for mental health and NPC encounters.',
    'FOOD / CULTURE':     'Food and culture. Find cheap eats and NPCs.',
    'LUXURY RESIDENTIAL': 'Wealthy neighborhood. High-end housing available.',
    'EDUCATION':          'Academic area. Career development opportunities.',
    'NIGHTLIFE / FOOD':   'Nightlife hub. Networking and spending.',
    'SPORTS ARENA':       'Sports venue. Unique event-driven opportunities.',
    'AIRPORT':            'Airport. Travel options and courier jobs.',
    'TECH / ARTS':        'Tech and arts hub. Startup opportunities here.',
    'BEACH / AMUSEMENT':  'Beach and fun. Take a break from the grind.',
  };
  descEl.textContent = descs[loc.type] || loc.type;

  // Contextual action buttons
  const jobsHere = JOBS.filter(j => j.location === name && G.rating >= j.minRating);
  let btns = '';
  if (jobsHere.length > 0 && !G.job) btns += `<button class="action-btn primary" onclick="applyForJob('${jobsHere[0].id}')">💼 ${jobsHere[0].title}</button>`;
  if (loc.type.includes('PARK')) btns += `<button class="action-btn" onclick="talkToNPC()">👤 Meet People</button>`;
  if (loc.type.includes('FOOD')) btns += `<button class="action-btn" onclick="buyItem('pizza')">🍕 Eat</button>`;
  if (actEl) actEl.innerHTML = btns;
}

// ── UI HELPERS ────────────────────────────────────────────────────────
function addCash(n) { G.cash += n; updateUI(); }
function spendCash(n) { G.cash = Math.max(0, G.cash - n); updateUI(); }

function addRating(n) {
  G.rating = Math.max(0, G.rating + n); // no cap!
  const fill = document.getElementById('rating-fill');
  // Scale: 0-100 maps to 0-50% width, 100-500 maps to 50-85%, 500+ maps to 85-100%
  let width;
  if (G.rating <= 100)      width = G.rating * 0.5;
  else if (G.rating <= 500) width = 50 + (G.rating-100) / 400 * 35;
  else                       width = 85 + Math.min((G.rating-500)/1000*15, 15);
  if (fill) { fill.style.width = Math.min(100, width) + '%'; }
  const rn = document.getElementById('rating-num');
  if (rn) rn.textContent = Math.round(G.rating);
  const tier = document.getElementById('rating-tier');
  if (tier) tier.textContent = getRatingTier();
  updatePlayerTitle();
}

function advanceHours(h) { G.hour = Math.min(23, G.hour + h); updateTimeDisplay(); }

function updateTimeDisplay() {
  const h = G.hour, ampm = h>=12?'PM':'AM', h12 = h===0?12:h>12?h-12:h;
  const el = document.getElementById('t-time');
  if (el) el.textContent = h12 + ':00 ' + ampm;
  // Night indicator
  document.body.style.setProperty('--night-alpha', getNightAlpha().toString());
}

function updateMiniMapClock() { drawMiniMap(); }

function updateMetroStatus() {
  const dot = document.getElementById('metro-dot');
  const status = document.getElementById('metro-status');
  if (!dot || !status) return;
  if (G.hasMonthlyMetro) { dot.className = 'metro-dot active'; status.textContent = 'Unlimited Card ✓'; }
  else if (G.hasMetroCard) { dot.className = 'metro-dot'; dot.style.background = 'var(--orange)'; status.textContent = 'Single Ride'; }
  else { dot.className = 'metro-dot'; dot.style.background = 'var(--subway-blue)'; status.textContent = 'No MetroCard'; }
}

function updateWantedDisplay() {
  const row = document.getElementById('wanted-row');
  const stars = document.getElementById('wanted-stars');
  if (!row || !stars) return;
  row.style.display = G.wantedLevel > 0 ? 'flex' : 'none';
  stars.textContent = '⭐'.repeat(G.wantedLevel) + '☆'.repeat(5-G.wantedLevel);
  stars.style.color = G.wantedLevel >= 4 ? 'var(--red)' : G.wantedLevel >= 2 ? 'var(--orange)' : 'var(--yellow)';
}

function getRatingTier() {
  const r = G.rating;
  if (r >= 1000) return 'NYC ICON';
  if (r >= 800)  return 'CITY LEGEND';
  if (r >= 600)  return 'ELITE STATUS';
  if (r >= 400)  return 'POWER PLAYER';
  if (r >= 250)  return 'EXPERT';
  if (r >= 150)  return 'PROFESSIONAL';
  if (r >= 100)  return 'RELIABLE';
  if (r >= 75)   return 'SKILLED';
  if (r >= 50)   return 'AVERAGE';
  if (r >= 30)   return 'STRUGGLING';
  if (r >= 15)   return 'DESPERATE';
  return 'ROCK BOTTOM';
}

function updatePlayerTitle() {
  const titleEl = document.getElementById('display-title');
  if (!titleEl) return;
  titleEl.textContent = getRatingTier() + ' • ' + (G.job ? G.job.title : 'UNEMPLOYED');
}

function updateResumePanel() {
  const panel = document.getElementById('resume-panel');
  if (!panel) return;
  if (!G.resume.length) { panel.innerHTML = '<div style="padding:12px 16px;font-size:10px;color:var(--muted)">No work history yet.</div>'; return; }
  panel.innerHTML = G.resume.slice(0,5).map(j => `
    <div class="resume-entry">
      <div class="job-name">${j.title}</div>
      <div style="font-size:9px;color:var(--muted);">${j.location} • ${j.days} days</div>
      <span class="job-rating ${j.endRating>=100?'good':j.endRating>=50?'ok':'bad'}">Rep:${j.endRating}${j.quit?' (QUIT)':''}</span>
    </div>`).join('');
}

function updateInventoryDisplay() {
  const list = document.getElementById('inventory-list');
  if (!list) return;
  const all = [...G.inventory, ...G.vehicles.map(v => ({ icon:v.icon, name:v.name }))];
  if (!all.length) { list.innerHTML = '<div class="inv-item"><span>Nothing yet</span></div>'; return; }
  list.innerHTML = all.map(i => `<div class="inv-item"><span>${i.icon} ${i.name}</span></div>`).join('');
}

function updateWardrobeDisplay() {
  // Could be expanded to show outfit on character
  updatePortrait();
}

function updatePortrait() {
  const el = document.getElementById('char-portrait');
  if (el) el.textContent = getPortraitEmoji();
}

function updateTicker() {
  const lines = [
    `DAY ${G.day} IN NYC`, `REPUTATION: ${Math.round(G.rating)} — ${getRatingTier()}`,
    G.job ? `WORKING: ${G.job.title}` : 'UNEMPLOYED — HIT THE JOB BOARD',
    `CASH: $${G.cash.toFixed(2)}`, `SAVINGS: $${G.savings.toLocaleString()}`,
    'RENT UP 3% IN ALL FIVE BOROUGHS', 'MTA ANNOUNCES NEW FARE HIKE',
    'WALL STREET CLOSES HIGHER', 'BODEGA CAT WINS ASTORIA AWARD',
    'CONSTRUCTION ON EVERY MIDTOWN BLOCK — FOREVER',
    'DOLLAR PIZZA HOLDS STRONG DESPITE INFLATION',
    'CITI BIKE EXPANSION REACHES THE BRONX',
    'YANKEES EXTEND WIN STREAK', 'BROOKLYN TECH STARTUPS RAISE RECORD FUNDING',
    'HARLEM CULTURAL FESTIVAL THIS WEEKEND', 'SUBWAY ON-TIME RATE: 68% (NEW HIGH)',
  ];
  const el = document.getElementById('ticker-text');
  if (el) el.textContent = lines.join(' \u00a0•\u00a0 ') + ' \u00a0•\u00a0 ' + lines.slice(0,5).join(' \u00a0•\u00a0 ');
}

function updateUI() {
  const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  set('display-name',     G.name);
  set('stat-cash',        '$' + G.cash.toFixed(2));
  set('stat-savings',     '$' + G.savings.toLocaleString());
  set('stat-rent',        G.ownedHomes.includes(G.housing) ? 'OWNED ✓' : (G.rentPerWeek>0 ? '$'+G.rentPerWeek+'/wk' : 'NONE'));
  set('stat-job',         G.job ? G.job.title : 'NONE');
  set('stat-pay',         G.job ? '$' + G.job.pay.toLocaleString() + '/day' : '—');
  set('stat-commission',  G.commission ? G.commission + '% / shift' : 'NONE');
  set('stat-daysworked',  G.jobDays);
  set('t-day',            'Day ' + G.day);
  set('display-origin',   G.origin.toUpperCase());
  document.getElementById('t-weather').textContent = G.weather;
  document.getElementById('t-location').textContent = G.location;
  updatePlayerTitle();
  updateMetroStatus();
  updateWantedDisplay();
  updatePortrait();
  updatePortfolioValue();
  updateResumePanel();
  updateInventoryDisplay();
  addRating(0); // re-sync bar
}

// ── LOG ───────────────────────────────────────────────────────────────
function addLog(msg, type='normal') {
  const log = document.getElementById('log-area');
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  const h = G.hour, ampm = h>=12?'PM':'AM', h12 = h===0?12:h>12?h-12:h;
  entry.innerHTML = `<div class="log-time">DAY ${G.day} — ${h12}:00 ${ampm}</div><div class="log-msg">${msg}</div>`;
  log.insertBefore(entry, log.firstChild);
  while (log.children.length > 150) log.removeChild(log.lastChild);
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────
function showNotif(msg, type='yellow') {
  const area = document.getElementById('notif-area');
  if (!area) return;
  const notif = document.createElement('div');
  notif.className = `notif ${type}`;
  notif.textContent = msg;
  area.appendChild(notif);
  setTimeout(() => { if(notif.parentNode) notif.remove(); }, 3400);
}

// ── EVENT MODAL ───────────────────────────────────────────────────────
function showEvent(html) {
  const screen = document.getElementById('screen-event');
  if (!screen) return;
  screen.innerHTML = `<div id="event-modal">${html}</div>`;
  screen.classList.add('active');
}
function closeEvent() {
  const screen = document.getElementById('screen-event');
  if (screen) screen.classList.remove('active');
  updateUI();
}

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  switch(e.key) {
    case 'Escape': closeEvent(); closeFullMap(); break;
    case 'j': case 'J': openJobBoard(); break;
    case 's': case 'S': openShop(); break;
    case 'w': case 'W': doWorkDay(); break;
    case 'n': case 'N': talkToNPC(); break;
    case 'h': case 'H': openHousingMenu(); break;
    case 'm': case 'M': openFullMap(); break;
    case 'x': case 'X': if(typeof openExplore === 'function') openExplore(G.location); break;
    case 'b': case 'B': saveToBank(); break;
    case 'v': case 'V': openVehicleDealer(); break;
    case 'k': case 'K': openStockMarket(); break;
    case 'z': case 'Z': doSleep(); break;
    case 'c': case 'C': negotiateCommission(); break;
    case 'Enter':
      if (document.getElementById('screen-intro')?.classList.contains('active')) startGame(); break;
  }
});

document.getElementById('player-name')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startGame();
});

window.onload = () => {
  document.getElementById('screen-intro').classList.add('active');
};
