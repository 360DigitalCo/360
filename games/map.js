// ══════════════════════════════════════════════════════════════════
// NYC DREAM 2.0 — MAP.JS
// Full map renderer + mini-map engine
// ══════════════════════════════════════════════════════════════════

const MAP = {
  // Full map canvas
  canvas: null, ctx: null,
  scale: 0.85, minScale: 0.35, maxScale: 4.0,
  offsetX: 0, offsetY: 0,
  isDragging: false, lastMX: 0, lastMY: 0,
  hoveredLoc: null,
  // Mini map canvas
  mini: null, miniCtx: null,
  miniScale: 0.18,
  MINI_W: 220, MINI_H: 130,
  // Viewport reference
  mapCenterX: 580, mapCenterY: 500,
};

// ── INIT ──────────────────────────────────────────────────────────────
function initMiniMap() {
  MAP.mini = document.getElementById('minimap-canvas');
  MAP.mini.width  = MAP.MINI_W;
  MAP.mini.height = MAP.MINI_H;
  MAP.miniCtx = MAP.mini.getContext('2d');
  drawMiniMap();
}

function initFullMap() {
  MAP.canvas = document.getElementById('map-canvas');
  const wrap = document.getElementById('fullmap-canvas-wrap');
  MAP.canvas.width  = wrap.offsetWidth;
  MAP.canvas.height = wrap.offsetHeight;
  MAP.ctx = MAP.canvas.getContext('2d');

  // Center on Penn Station initially
  centerMapOnWorld(480, 521);

  MAP.canvas.addEventListener('mousemove', onMapMouseMove);
  MAP.canvas.addEventListener('mousedown', (e) => {
    MAP.isDragging = true;
    MAP.lastMX = e.clientX; MAP.lastMY = e.clientY;
  });
  MAP.canvas.addEventListener('mouseup',    () => { MAP.isDragging = false; });
  MAP.canvas.addEventListener('mouseleave', () => { MAP.isDragging = false; hideMapTooltip(); });
  MAP.canvas.addEventListener('click',      onMapClick);
  MAP.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = MAP.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    const wx = (mx - MAP.offsetX) / MAP.scale;
    const wy = (my - MAP.offsetY) / MAP.scale;
    MAP.scale = Math.min(Math.max(MAP.scale * factor, MAP.minScale), MAP.maxScale);
    MAP.offsetX = mx - wx * MAP.scale;
    MAP.offsetY = my - wy * MAP.scale;
    drawFullMap();
    updatePlayerMarker();
  }, { passive: false });

  drawFullMap();
  updatePlayerMarker();
}

function centerMapOnWorld(wx, wy) {
  if (!MAP.canvas) return;
  MAP.offsetX = MAP.canvas.width  / 2 - wx * MAP.scale;
  MAP.offsetY = MAP.canvas.height / 2 - wy * MAP.scale;
}

function mapZoomIn()  { MAP.scale = Math.min(MAP.scale * 1.25, MAP.maxScale); drawFullMap(); updatePlayerMarker(); }
function mapZoomOut() { MAP.scale = Math.max(MAP.scale * 0.8,  MAP.minScale); drawFullMap(); updatePlayerMarker(); }
function centerOnPlayer() {
  if (!G) return;
  centerMapOnWorld(G.playerX, G.playerY);
  drawFullMap();
  updatePlayerMarker();
}

// ── COORDINATE HELPERS ────────────────────────────────────────────────
function w2s(wx, wy) {
  return { x: wx * MAP.scale + MAP.offsetX, y: wy * MAP.scale + MAP.offsetY };
}
function s2w(sx, sy) {
  return { x: (sx - MAP.offsetX) / MAP.scale, y: (sy - MAP.offsetY) / MAP.scale };
}
function w2m(wx, wy) { // world -> minimap screen
  return { x: wx * MAP.miniScale + 5, y: wy * MAP.miniScale + 5 };
}

// ── NIGHT / DAY TINT HELPER ───────────────────────────────────────────
function getNightAlpha() {
  if (!G) return 0;
  const h = G.hour;
  if (h >= 7 && h <= 18)  return 0;          // day
  if (h >= 20 || h <= 5)  return 0.62;       // night
  if (h === 19)           return 0.25;
  if (h === 6)            return 0.18;
  return 0.42;
}

function getTimeOfDayGradient(ctx, h, w) {
  if (!G) return '#0A1520';
  const hour = G.hour;
  if (hour >= 6  && hour <= 8)  return '#1A2B4A'; // dawn
  if (hour >= 9  && hour <= 17) return '#0A1520'; // day (dark water bg still)
  if (hour >= 18 && hour <= 20) return '#1A0A2A'; // dusk
  return '#020508'; // night
}

// ── DRAW BOROUGH SHAPES ────────────────────────────────────────────────
function drawBoroughs(ctx) {
  const f = (color, alpha, fn) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.strokeStyle = '#2A2A2A'; ctx.lineWidth = 1 / MAP.scale;
    ctx.beginPath(); fn(); ctx.fill(); ctx.stroke(); ctx.restore();
  };

  // Manhattan
  f('#1A1A18', 1, () => {
    ctx.moveTo(490,705); ctx.lineTo(500,715); ctx.lineTo(512,720); ctx.lineTo(525,718);
    ctx.lineTo(540,714); ctx.lineTo(558,700); ctx.lineTo(568,680); ctx.lineTo(580,665);
    ctx.lineTo(590,640); ctx.lineTo(588,620); ctx.lineTo(582,600); ctx.lineTo(574,580);
    ctx.lineTo(558,558); ctx.lineTo(540,540); ctx.lineTo(520,524); ctx.lineTo(498,510);
    ctx.lineTo(478,500); ctx.lineTo(466,488); ctx.lineTo(462,468); ctx.lineTo(464,448);
    ctx.lineTo(470,425); ctx.lineTo(474,400); ctx.lineTo(477,370); ctx.lineTo(481,342);
    ctx.lineTo(488,312); ctx.lineTo(494,282); ctx.lineTo(502,252); ctx.lineTo(510,228);
    ctx.lineTo(520,208); ctx.lineTo(530,200); ctx.lineTo(542,196); ctx.lineTo(554,198);
    ctx.lineTo(566,206); ctx.lineTo(574,220); ctx.lineTo(580,244); ctx.lineTo(584,272);
    ctx.lineTo(590,306); ctx.lineTo(596,338); ctx.lineTo(604,372); ctx.lineTo(610,404);
    ctx.lineTo(614,432); ctx.lineTo(616,460); ctx.lineTo(612,486); ctx.lineTo(604,508);
    ctx.lineTo(592,524); ctx.lineTo(582,540); ctx.lineTo(580,558); ctx.lineTo(584,580);
    ctx.lineTo(590,604); ctx.lineTo(592,630); ctx.lineTo(588,652); ctx.lineTo(578,670);
    ctx.lineTo(562,684); ctx.lineTo(546,696); ctx.lineTo(530,706); ctx.lineTo(512,714);
    ctx.closePath();
  });

  // Brooklyn
  f('#181818', 1, () => {
    ctx.moveTo(578,668); ctx.lineTo(596,660); ctx.lineTo(614,658); ctx.lineTo(632,658);
    ctx.lineTo(650,656); ctx.lineTo(668,654); ctx.lineTo(686,652); ctx.lineTo(700,650);
    ctx.lineTo(714,644); ctx.lineTo(722,636); ctx.lineTo(726,622); ctx.lineTo(724,608);
    ctx.lineTo(720,594); ctx.lineTo(718,578); ctx.lineTo(720,560); ctx.lineTo(722,540);
    ctx.lineTo(724,520); ctx.lineTo(722,500); ctx.lineTo(720,482); ctx.lineTo(762,478);
    ctx.lineTo(776,492); ctx.lineTo(786,508); ctx.lineTo(800,520); ctx.lineTo(810,540);
    ctx.lineTo(814,564); ctx.lineTo(810,590); ctx.lineTo(806,616); ctx.lineTo(804,640);
    ctx.lineTo(800,660); ctx.lineTo(790,676); ctx.lineTo(776,690); ctx.lineTo(758,700);
    ctx.lineTo(740,708); ctx.lineTo(720,714); ctx.lineTo(700,718); ctx.lineTo(680,720);
    ctx.lineTo(660,722); ctx.lineTo(640,724); ctx.lineTo(620,724); ctx.lineTo(602,722);
    ctx.lineTo(586,714); ctx.lineTo(574,700); ctx.lineTo(570,686); ctx.lineTo(572,674);
    ctx.closePath();
  });

  // Queens
  f('#171717', 1, () => {
    ctx.moveTo(620,492); ctx.lineTo(638,478); ctx.lineTo(654,466); ctx.lineTo(670,454);
    ctx.lineTo(686,442); ctx.lineTo(700,430); ctx.lineTo(714,422); ctx.lineTo(728,416);
    ctx.lineTo(742,410); ctx.lineTo(756,408); ctx.lineTo(770,406); ctx.lineTo(786,406);
    ctx.lineTo(800,408); ctx.lineTo(820,414); ctx.lineTo(836,424); ctx.lineTo(846,440);
    ctx.lineTo(848,460); ctx.lineTo(844,482); ctx.lineTo(840,504); ctx.lineTo(836,528);
    ctx.lineTo(834,554); ctx.lineTo(830,578); ctx.lineTo(828,600); ctx.lineTo(826,624);
    ctx.lineTo(820,644); ctx.lineTo(810,656); ctx.lineTo(798,664); ctx.lineTo(784,668);
    ctx.lineTo(768,668); ctx.lineTo(752,666); ctx.lineTo(734,660); ctx.lineTo(720,652);
    ctx.lineTo(706,644); ctx.lineTo(700,650); ctx.lineTo(690,652); ctx.lineTo(676,654);
    ctx.lineTo(660,656); ctx.lineTo(646,656); ctx.lineTo(632,658); ctx.lineTo(618,656);
    ctx.lineTo(614,640); ctx.lineTo(614,622); ctx.lineTo(616,604); ctx.lineTo(618,586);
    ctx.lineTo(618,568); ctx.lineTo(618,550); ctx.lineTo(618,532); ctx.lineTo(620,514);
    ctx.closePath();
  });

  // Bronx
  f('#161616', 1, () => {
    ctx.moveTo(572,204); ctx.lineTo(586,190); ctx.lineTo(600,180); ctx.lineTo(618,174);
    ctx.lineTo(636,174); ctx.lineTo(654,178); ctx.lineTo(670,186); ctx.lineTo(684,196);
    ctx.lineTo(696,208); ctx.lineTo(706,222); ctx.lineTo(714,238); ctx.lineTo(720,254);
    ctx.lineTo(724,272); ctx.lineTo(726,290); ctx.lineTo(724,308); ctx.lineTo(718,322);
    ctx.lineTo(708,334); ctx.lineTo(696,342); ctx.lineTo(680,348); ctx.lineTo(666,350);
    ctx.lineTo(654,350); ctx.lineTo(640,348); ctx.lineTo(628,342); ctx.lineTo(616,334);
    ctx.lineTo(608,322); ctx.lineTo(602,308); ctx.lineTo(598,292); ctx.lineTo(596,274);
    ctx.lineTo(596,256); ctx.lineTo(594,240); ctx.lineTo(590,226); ctx.lineTo(582,214);
    ctx.closePath();
  });

  // Staten Island
  f('#151515', 1, () => {
    ctx.moveTo(390,696); ctx.lineTo(408,686); ctx.lineTo(428,680); ctx.lineTo(450,678);
    ctx.lineTo(468,682); ctx.lineTo(484,690); ctx.lineTo(494,702); ctx.lineTo(498,718);
    ctx.lineTo(496,736); ctx.lineTo(490,752); ctx.lineTo(480,766); ctx.lineTo(466,778);
    ctx.lineTo(450,786); ctx.lineTo(434,790); ctx.lineTo(418,788); ctx.lineTo(404,780);
    ctx.lineTo(392,768); ctx.lineTo(384,752); ctx.lineTo(380,736); ctx.lineTo(382,720);
    ctx.lineTo(386,708);
    ctx.closePath();
  });
}

// ── DRAW STREET GRID (Manhattan only) ────────────────────────────────
function drawStreetGrid(ctx) {
  if (MAP.scale < 0.45) return; // don't draw when too zoomed out

  // Avenues (N-S lines)
  ROAD_DATA.avenues.forEach(av => {
    ctx.beginPath();
    ctx.strokeStyle = av.major ? '#282828' : '#1E1E1E';
    ctx.lineWidth   = av.major ? 1.8 / MAP.scale : 1.0 / MAP.scale;
    ctx.moveTo(av.x, av.y1); ctx.lineTo(av.x, av.y2);
    ctx.stroke();
    // Label major avenues only when zoomed in
    if (av.major && MAP.scale > 0.8) {
      ctx.save();
      ctx.font = `${Math.max(7, 8/MAP.scale)}px IBM Plex Mono`;
      ctx.fillStyle = '#3A3A3A';
      ctx.translate(av.x, (av.y1+av.y2)/2);
      ctx.rotate(-Math.PI/2);
      ctx.fillText(av.name, -60, -3);
      ctx.restore();
    }
  });

  // Cross streets
  ROAD_DATA.streets.forEach(st => {
    ctx.beginPath();
    ctx.strokeStyle = '#1E1E1E';
    ctx.lineWidth   = 1.0 / MAP.scale;
    ctx.moveTo(462, st.y); ctx.lineTo(618, st.y);
    ctx.stroke();
    if (st.label && MAP.scale > 0.7) {
      ctx.font = `${Math.max(7, 8/MAP.scale)}px IBM Plex Mono`;
      ctx.fillStyle = '#3A3A3A';
      ctx.fillText(st.name, 464, st.y - 2);
    }
  });

  // Central Park fill
  ctx.fillStyle   = '#0F2010';
  ctx.strokeStyle = '#1A3A1A';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.rect(502, 345, 112, 165); ctx.fill(); ctx.stroke();
  if (MAP.scale > 0.65) {
    ctx.font = `${Math.max(9, 11/MAP.scale)}px IBM Plex Mono`;
    ctx.fillStyle = '#1E4A1E';
    ctx.fillText('CENTRAL PARK', 508, 430);
  }
}

// ── DRAW HIGHWAYS ─────────────────────────────────────────────────────
function drawHighways(ctx) {
  ROAD_DATA.highways.forEach(hw => {
    ctx.beginPath();
    ctx.strokeStyle = hw.color + 'CC';
    ctx.lineWidth   = hw.width * 1.5 / MAP.scale;
    ctx.lineCap     = 'round'; ctx.lineJoin = 'round';
    hw.points.forEach((p, i) => i===0 ? ctx.moveTo(p[0],p[1]) : ctx.lineTo(p[0],p[1]));
    ctx.stroke();
    // White center stripe for major highways
    if (hw.width >= 3 && MAP.scale > 0.7) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth   = hw.width * 0.4 / MAP.scale;
      ctx.setLineDash([6/MAP.scale, 8/MAP.scale]);
      hw.points.forEach((p, i) => i===0 ? ctx.moveTo(p[0],p[1]) : ctx.lineTo(p[0],p[1]));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
  // Outer avenues / Queens + Brooklyn roads
  ROAD_DATA.outerAvenues.forEach(av => {
    ctx.beginPath();
    ctx.strokeStyle = av.color + '88';
    ctx.lineWidth   = 1.4 / MAP.scale;
    av.points.forEach((p,i) => i===0 ? ctx.moveTo(p[0],p[1]) : ctx.lineTo(p[0],p[1]));
    ctx.stroke();
  });
}

// ── DRAW BRIDGES ──────────────────────────────────────────────────────
function drawBridges(ctx) {
  BRIDGES.forEach(br => {
    ctx.beginPath();
    ctx.strokeStyle = br.color;
    ctx.lineWidth   = br.width / MAP.scale;
    ctx.moveTo(br.p1[0], br.p1[1]); ctx.lineTo(br.p2[0], br.p2[1]);
    ctx.stroke();
    if (MAP.scale > 1.1) {
      const mx = (br.p1[0]+br.p2[0])/2, my = (br.p1[1]+br.p2[1])/2;
      ctx.font = `${8/MAP.scale}px IBM Plex Mono`;
      ctx.fillStyle = '#8B6543';
      ctx.fillText(br.name, mx+3, my-4);
    }
  });
}

// ── DRAW SUBWAY LINES ─────────────────────────────────────────────────
function drawSubwayLines(ctx) {
  SUBWAY_LINES.forEach(line => {
    ctx.beginPath();
    ctx.strokeStyle = line.color + 'AA';
    ctx.lineWidth   = line.width / MAP.scale;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    line.points.forEach((p,i) => i===0 ? ctx.moveTo(p[0],p[1]) : ctx.lineTo(p[0],p[1]));
    ctx.stroke();
  });
}

// ── DRAW BIKE LANES ───────────────────────────────────────────────────
function drawBikeLanes(ctx) {
  if (MAP.scale < 0.6) return;
  ROAD_DATA.bikeLanes.forEach(lane => {
    ctx.beginPath();
    ctx.strokeStyle = lane.color + '99';
    ctx.lineWidth   = 1.5 / MAP.scale;
    ctx.setLineDash([4/MAP.scale, 4/MAP.scale]);
    lane.points.forEach((p,i) => i===0 ? ctx.moveTo(p[0],p[1]) : ctx.lineTo(p[0],p[1]));
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

// ── DRAW LOCATION MARKERS ─────────────────────────────────────────────
function drawLocations(ctx) {
  const showLabels = MAP.scale > 0.55;
  const iconSize   = Math.max(10, 13 / MAP.scale);
  const labelSize  = Math.max(7,  9  / MAP.scale);

  NYC_LOCATIONS.forEach(loc => {
    const hovered = MAP.hoveredLoc && MAP.hoveredLoc.name === loc.name;
    const current = G && loc.name === G.location;
    const r = hovered ? 9/MAP.scale : 5/MAP.scale;

    if (!current) {
      ctx.beginPath();
      ctx.arc(loc.x, loc.y, r, 0, Math.PI*2);
      ctx.fillStyle   = hovered ? loc.color : loc.color + '77';
      ctx.fill();
      if (hovered) {
        ctx.strokeStyle = '#FFD100'; ctx.lineWidth = 2/MAP.scale; ctx.stroke();
      }
    }

    // Icon
    ctx.font = `${iconSize}px serif`;
    ctx.fillText(loc.icon, loc.x - iconSize*0.5, loc.y + iconSize*0.4);

    // Label
    if (showLabels && (hovered || current || MAP.scale > 0.9)) {
      ctx.font = `${current ? 'bold ' : ''}${labelSize}px IBM Plex Mono`;
      ctx.fillStyle = current ? '#FFD100' : (hovered ? '#FFD100' : '#888');
      ctx.fillText(loc.name, loc.x + iconSize*0.6, loc.y + 4);
    }
  });
}

// ── DRAW WATER LABELS ─────────────────────────────────────────────────
function drawWaterLabels(ctx) {
  if (MAP.scale < 0.5) return;
  const labels = [
    { t:"HUDSON RIVER",         x:390, y:460, a:-12 },
    { t:"EAST RIVER",           x:630, y:560, a:-8  },
    { t:"UPPER NEW YORK BAY",   x:388, y:700, a:0   },
    { t:"LOWER NEW YORK BAY",   x:500, y:800, a:0   },
    { t:"JAMAICA BAY",          x:780, y:690, a:0   },
    { t:"LONG ISLAND SOUND",    x:700, y:178, a:0   },
    { t:"THE BRONX",            x:630, y:210, a:0   },
    { t:"BROOKLYN",             x:640, y:700, a:0   },
    { t:"QUEENS",               x:720, y:490, a:0   },
    { t:"STATEN ISLAND",        x:426, y:736, a:0   },
    { t:"NEW JERSEY",           x:320, y:500, a:0   },
    { t:"LONG ISLAND",          x:840, y:500, a:0   },
  ];
  labels.forEach(l => {
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.a * Math.PI/180);
    ctx.font = `${Math.max(8, 9/MAP.scale)}px IBM Plex Mono`;
    ctx.fillStyle = '#1A3040';
    ctx.letterSpacing = '2px';
    ctx.fillText(l.t, 0, 0);
    ctx.restore();
  });
}

// ── NIGHT OVERLAY ─────────────────────────────────────────────────────
function drawNightOverlay(ctx, w, h) {
  const alpha = getNightAlpha();
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(5,5,25,${alpha})`;
  ctx.fillRect(0, 0, w, h);

  // City glow at night
  if (alpha > 0.3 && G) {
    const pos = w2s(G.playerX, G.playerY);
    const grad = ctx.createRadialGradient(pos.x, pos.y, 10, pos.x, pos.y, 200);
    grad.addColorStop(0, 'rgba(255,209,0,0.04)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

// ── MAIN DRAW (full map) ──────────────────────────────────────────────
function drawFullMap() {
  if (!MAP.canvas || !MAP.ctx) return;
  const ctx = MAP.ctx;
  const W = MAP.canvas.width, H = MAP.canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = getTimeOfDayGradient(ctx, G ? G.hour : 12, W);
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(MAP.offsetX, MAP.offsetY);
  ctx.scale(MAP.scale, MAP.scale);

  drawBoroughs(ctx);
  drawStreetGrid(ctx);
  drawHighways(ctx);
  drawBridges(ctx);
  drawSubwayLines(ctx);
  drawBikeLanes(ctx);
  drawWaterLabels(ctx);
  drawLocations(ctx);

  ctx.restore();

  drawNightOverlay(ctx, W, H);
}

// ── MINI MAP DRAW ─────────────────────────────────────────────────────
function drawMiniMap() {
  if (!MAP.mini || !MAP.miniCtx) return;
  const ctx = MAP.miniCtx;
  const S = MAP.miniScale;
  const W = MAP.MINI_W, H = MAP.MINI_H;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = getTimeOfDayGradient(null, G ? G.hour : 12, W);
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(5, 5);
  ctx.scale(S, S);

  // Draw simple borough fills
  const boroughPaths = [
    { color:'#1A1A18', fn: () => { ctx.moveTo(490,705);ctx.lineTo(512,720);ctx.lineTo(540,714);ctx.lineTo(568,680);ctx.lineTo(590,640);ctx.lineTo(582,600);ctx.lineTo(540,540);ctx.lineTo(478,500);ctx.lineTo(462,468);ctx.lineTo(477,370);ctx.lineTo(502,252);ctx.lineTo(520,208);ctx.lineTo(542,196);ctx.lineTo(566,206);ctx.lineTo(580,244);ctx.lineTo(604,372);ctx.lineTo(616,460);ctx.lineTo(592,524);ctx.lineTo(580,558);ctx.lineTo(592,630);ctx.lineTo(578,670);ctx.lineTo(512,714);ctx.closePath(); }},
    { color:'#181818', fn: () => { ctx.moveTo(578,668);ctx.lineTo(700,650);ctx.lineTo(722,636);ctx.lineTo(724,520);ctx.lineTo(762,478);ctx.lineTo(810,540);ctx.lineTo(806,616);ctx.lineTo(760,700);ctx.lineTo(700,718);ctx.lineTo(620,724);ctx.lineTo(574,700);ctx.closePath(); }},
    { color:'#171717', fn: () => { ctx.moveTo(620,492);ctx.lineTo(686,442);ctx.lineTo(742,410);ctx.lineTo(800,408);ctx.lineTo(848,460);ctx.lineTo(840,504);ctx.lineTo(826,624);ctx.lineTo(798,664);ctx.lineTo(700,650);ctx.lineTo(618,656);ctx.lineTo(614,622);ctx.lineTo(618,568);ctx.lineTo(620,514);ctx.closePath(); }},
    { color:'#161616', fn: () => { ctx.moveTo(572,204);ctx.lineTo(636,174);ctx.lineTo(684,196);ctx.lineTo(720,254);ctx.lineTo(726,290);ctx.lineTo(696,342);ctx.lineTo(654,350);ctx.lineTo(610,322);ctx.lineTo(596,274);ctx.lineTo(590,226);ctx.closePath(); }},
    { color:'#151515', fn: () => { ctx.moveTo(390,696);ctx.lineTo(450,678);ctx.lineTo(494,702);ctx.lineTo(498,718);ctx.lineTo(450,786);ctx.lineTo(392,768);ctx.lineTo(380,736);ctx.closePath(); }},
  ];

  boroughPaths.forEach(b => {
    ctx.beginPath(); b.fn();
    ctx.fillStyle = b.color; ctx.strokeStyle = '#2A2A2A'; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
  });

  // Mini subway lines
  SUBWAY_LINES.slice(0,5).forEach(line => {
    ctx.beginPath();
    ctx.strokeStyle = line.color + '88';
    ctx.lineWidth   = line.width * 1.5;
    line.points.forEach((p,i) => i===0 ? ctx.moveTo(p[0],p[1]) : ctx.lineTo(p[0],p[1]));
    ctx.stroke();
  });

  // Mini highways
  ROAD_DATA.highways.slice(0,4).forEach(hw => {
    ctx.beginPath(); ctx.strokeStyle = hw.color + '66'; ctx.lineWidth = 2;
    hw.points.forEach((p,i) => i===0 ? ctx.moveTo(p[0],p[1]) : ctx.lineTo(p[0],p[1]));
    ctx.stroke();
  });

  // Smaller location dots
  NYC_LOCATIONS.forEach(loc => {
    const isCur = G && loc.name === G.location;
    ctx.beginPath();
    ctx.arc(loc.x, loc.y, isCur ? 5 : 2, 0, Math.PI*2);
    ctx.fillStyle = isCur ? '#FFD100' : loc.color + '55';
    ctx.fill();
  });

  // Player pulse
  if (G) {
    ctx.beginPath();
    ctx.arc(G.playerX, G.playerY, 6, 0, Math.PI*2);
    ctx.fillStyle = '#FFD100';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(G.playerX, G.playerY, 4, 0, Math.PI*2);
    ctx.fillStyle = '#0A0A0A';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(G.playerX, G.playerY, 2, 0, Math.PI*2);
    ctx.fillStyle = '#FFD100';
    ctx.fill();
  }

  ctx.restore();

  // Night overlay on mini
  const na = getNightAlpha() * 0.7;
  if (na > 0) { ctx.fillStyle = `rgba(5,5,25,${na})`; ctx.fillRect(0,0,W,H); }

  // Border
  ctx.strokeStyle = '#2A2A2A'; ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, W, H);
}

// ── MOUSE / INTERACTION ───────────────────────────────────────────────
function onMapMouseMove(e) {
  const rect = MAP.canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;

  if (MAP.isDragging) {
    MAP.offsetX += e.clientX - MAP.lastMX;
    MAP.offsetY += e.clientY - MAP.lastMY;
    MAP.lastMX = e.clientX; MAP.lastMY = e.clientY;
    drawFullMap(); updatePlayerMarker();
    return;
  }

  const { x: wx, y: wy } = s2w(mx, my);
  let found = null;
  for (const loc of NYC_LOCATIONS) {
    const dx = wx - loc.x, dy = wy - loc.y;
    if (Math.sqrt(dx*dx + dy*dy) < 14/MAP.scale) { found = loc; break; }
  }

  if (found !== MAP.hoveredLoc) {
    MAP.hoveredLoc = found;
    drawFullMap();
    if (found) {
      const tt = document.getElementById('location-tooltip');
      if (tt) {
        tt.style.display = 'block';
        tt.style.left    = (mx + 14) + 'px';
        tt.style.top     = (my - 12) + 'px';
        document.getElementById('tt-name').textContent = found.name;
        document.getElementById('tt-type').textContent = found.type + ' — ' + found.borough;
        document.getElementById('tt-action').textContent = G && found.name === G.location ? '📍 You are here' : 'Click to travel here';
      }
    } else { hideMapTooltip(); }
  } else if (found) {
    const tt = document.getElementById('location-tooltip');
    if (tt) { tt.style.left = (mx+14)+'px'; tt.style.top = (my-12)+'px'; }
  }
}

function onMapClick() {
  if (!MAP.hoveredLoc) return;
  if (MAP.hoveredLoc.name === G.location) {
    showNotif('You are already here!', 'orange'); return;
  }
  travelTo(MAP.hoveredLoc.name, MAP.hoveredLoc.x, MAP.hoveredLoc.y);
}

function hideMapTooltip() {
  const tt = document.getElementById('location-tooltip');
  if (tt) tt.style.display = 'none';
}

// ── PLAYER MARKER ─────────────────────────────────────────────────────
function updatePlayerMarker() {
  if (!G || !MAP.canvas) return;
  const s = w2s(G.playerX, G.playerY);
  const marker = document.getElementById('player-marker');
  if (marker) { marker.style.left = s.x + 'px'; marker.style.top = s.y + 'px'; }
}

// ── ANIMATE TRAVEL ────────────────────────────────────────────────────
function animateTravelTo(wx, wy, cb) {
  if (!MAP.canvas) { if(cb)cb(); return; }
  const targetOffX = MAP.canvas.width/2  - wx * MAP.scale;
  const targetOffY = MAP.canvas.height/2 - wy * MAP.scale;
  const steps = 24, sX = MAP.offsetX, sY = MAP.offsetY;
  let step = 0;
  const anim = setInterval(() => {
    step++;
    const t = step / steps;
    const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    MAP.offsetX = sX + (targetOffX - sX) * ease;
    MAP.offsetY = sY + (targetOffY - sY) * ease;
    drawFullMap(); updatePlayerMarker();
    if (step >= steps) { clearInterval(anim); if(cb) cb(); }
  }, 14);
}

// ── OPEN / CLOSE FULL MAP ─────────────────────────────────────────────
function openFullMap() {
  const screen = document.getElementById('screen-fullmap');
  if (!screen) return;
  screen.classList.add('active');
  if (!MAP.ctx) {
    setTimeout(() => { initFullMap(); }, 50);
  } else {
    drawFullMap(); updatePlayerMarker();
  }
  document.getElementById('fullmap-location').textContent = G ? '📍 ' + G.location : '';
}

function closeFullMap() {
  const screen = document.getElementById('screen-fullmap');
  if (screen) screen.classList.remove('active');
}

// ── RESIZE HANDLER ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  if (MAP.canvas) {
    const wrap = document.getElementById('fullmap-canvas-wrap');
    if (wrap) { MAP.canvas.width = wrap.offsetWidth; MAP.canvas.height = wrap.offsetHeight; }
    drawFullMap(); updatePlayerMarker();
  }
  drawMiniMap();
});
