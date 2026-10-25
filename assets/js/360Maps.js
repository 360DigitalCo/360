(function () {
  'use strict';

  const SB_URL = 'https://wiswfpfsjiowtrdyqpxy.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3dmcGZzamlvd3RyZHlxcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzg4OTcsImV4cCI6MjA4MzkxNDg5N30.z_4FtM2c8UwgrRlafPYjolQuod4IoHQats95XHio1zM';
  const NOMINATIM = 'https://nominatim.openstreetmap.org';
  const PHOTON = 'https://photon.komoot.io/api/';
  const GEOCODE_FN = SB_URL + '/functions/v1/maps-geocode';
  const ROUTERS = {
    driving: 'https://router.project-osrm.org/route/v1/driving/',
    cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/',
    walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/',
  };
  const TILES = {
    standard: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap contributors', max: 19 },
    satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Imagery &copy; Esri', max: 19 },
    terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap, SRTM, OpenTopoMap', max: 17 },
  };
  const POI = {
    restaurant: 'amenity=restaurant', cafe: 'amenity=cafe', fuel: 'amenity=fuel', atm: 'amenity=atm',
    pharmacy: 'amenity=pharmacy', hospital: 'amenity=hospital', supermarket: 'shop=supermarket', park: 'leisure=park',
  };
  const CATS = ['Home', 'Work', 'Food', 'Shopping', 'Nature', 'Favorite', 'Other'];
  const INCIDENTS = { accident: 'Accident', police: 'Police', hazard: 'Hazard', road_closed: 'Road closed', traffic: 'Heavy traffic', speed_trap: 'Speed trap' };
  const RECENT_KEY = '360_maps_recent';

  const sb = supabase.createClient(SB_URL, SB_KEY);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };

  const S = {
    map: null, tile: null, style: 'standard', user: null, me: null, meMarker: null, watch: null,
    place: null, pin: null, tab: 'saved', saved: [], trips: [], openTrip: null,
    route: null, routes: [], routeIdx: 0, mode: 'driving', routeLine: null, from: null,
    nav: false, stepIdx: 0, lastReroute: 0,
    poiLayer: null, poiType: null, incLayer: null,
    measuring: false, mPts: [], mLine: null, mDots: [],
    sugTimer: null, sugSeq: 0, sugIdx: -1, sugItems: [], saveCat: 'Other',
  };

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function fmtDist(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + ' m';
    return (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
  }
  function fmtDur(s) {
    const m = Math.round(s / 60);
    if (m < 60) return Math.max(m, 1) + ' min';
    const h = Math.floor(m / 60);
    return h + ' h ' + (m % 60 ? (m % 60) + ' min' : '');
  }
  function haversine(a, b) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function shortName(label) { return label ? String(label).split(',')[0].trim() : 'Dropped pin'; }

  async function nominatim(path) {
    const r = await fetch(NOMINATIM + path, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('Search is unavailable right now');
    return r.json();
  }

  function withTimeout(url, opts, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 6000);
    return fetch(url, Object.assign({}, opts, { signal: ctl.signal })).finally(() => clearTimeout(t));
  }

  function photonLabel(p) {
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const place = p.city || p.town || p.village || p.locality || p.district || p.county;
    const parts = [p.name, street && street !== p.name ? street : '', place && place !== p.name ? place : '', p.state, p.country];
    return parts.filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ');
  }

  async function geocodePhoton(q, c) {
    const r = await withTimeout(`${PHOTON}?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}`, {}, 5000);
    if (!r.ok) throw new Error('photon');
    const j = await r.json();
    return (j.features || []).filter((f) => f.geometry && f.geometry.coordinates).map((f) => {
      const p = f.properties || {};
      const name = p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || p.city || 'Place';
      return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name, label: photonLabel(Object.assign({}, p, { name })) };
    });
  }

  async function geocodeNominatim(q, b) {
    const vb = `&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`;
    let rows;
    try {
      const r = await withTimeout(GEOCODE_FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }) }, 7000);
      rows = r.ok ? await r.json() : null;
    } catch (_) { rows = null; }
    if (!Array.isArray(rows) || !rows.length) rows = await nominatim(`/search?format=jsonv2&limit=8&addressdetails=0&q=${encodeURIComponent(q)}${vb}`);
    return rows.map((r) => ({ lat: +r.lat, lon: +r.lon, name: r.name || shortName(r.display_name), label: r.display_name }));
  }

  async function geocode(q) {
    const c = S.map.getCenter(), b = S.map.getBounds();
    let rows = [];
    try { rows = await geocodePhoton(q, c); } catch (_) {}
    if (!rows.length) {
      try { rows = await geocodeNominatim(q, b); } catch (err) { if (!rows.length) throw err; }
    }
    const seen = new Set();
    return rows.filter((r) => { const k = r.name + '|' + r.lat.toFixed(3) + '|' + r.lon.toFixed(3); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  async function reverseGeocode(lat, lon) {
    try {
      const r = await withTimeout(`${NOMINATIM}/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lon}`, { headers: { Accept: 'application/json' } }, 6000);
      if (r.ok) return r.json();
    } catch (_) {}
    const r2 = await withTimeout(GEOCODE_FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reverse: true, lat, lon }) }, 7000);
    return r2.json();
  }

  function initMap() {
    const hash = location.hash.replace('#', '').split('/').map(Number);
    const last = store.get('360maps_view', null);
    let view = [39.8, -98.6], zoom = 4;
    if (hash.length === 3 && hash.every((n) => !isNaN(n))) { zoom = hash[0]; view = [hash[1], hash[2]]; }
    else if (last) { view = [last.lat, last.lon]; zoom = last.z; }
    S.map = L.map('map', { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView(view, zoom);
    S.style = store.get('360maps_style', 'standard');
    setStyle(S.style, true);
    S.poiLayer = L.layerGroup().addTo(S.map);
    S.incLayer = L.layerGroup().addTo(S.map);
    S.map.on('moveend', () => {
      const c = S.map.getCenter(), z = S.map.getZoom();
      history.replaceState(null, '', location.pathname + location.search + '#' + z + '/' + c.lat.toFixed(4) + '/' + c.lng.toFixed(4));
      store.set('360maps_view', { lat: c.lat, lon: c.lng, z });
    });
    S.map.on('click', onMapClick);
    new MutationObserver(applyDim).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function setStyle(style, silent) {
    if (S.tile) S.map.removeLayer(S.tile);
    const t = TILES[style] || TILES.standard;
    S.tile = L.tileLayer(t.url, { attribution: t.attr, maxZoom: t.max, subdomains: 'abc' }).addTo(S.map);
    S.style = style;
    if (!silent) store.set('360maps_style', style);
    document.querySelectorAll('#layers button').forEach((b) => b.classList.toggle('on', b.dataset.style === style));
    applyDim();
  }
  function applyDim() {
    const pane = S.map.getPane('tilePane');
    pane.classList.toggle('dim', document.body.classList.contains('dark') && S.style === 'standard');
  }

  function pinIcon() { return L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [26, 26], iconAnchor: [4, 26] }); }

  function recents() { return store.get(RECENT_KEY, []); }
  function addRecent(p) {
    const list = recents().filter((r) => r.label !== p.label);
    list.unshift({ label: p.label, lat: p.lat, lon: p.lon });
    store.set(RECENT_KEY, list.slice(0, 15));
  }

  function setBody(html) { $('body').innerHTML = html; $('body').scrollTop = 0; }
  function showTabs(on) { $('tabs').classList.toggle('hidden', !on); $('chips').style.display = on ? '' : 'none'; }

  async function onMapClick(e) {
    if (S.measuring) return addMeasurePoint(e.latlng);
    if (S.nav) return;
    const p = { lat: e.latlng.lat, lon: e.latlng.lng, label: 'Dropped pin', address: '' };
    selectPlace(p, { fly: false });
    try {
      const r = await reverseGeocode(p.lat, p.lon);
      if (S.place === p && r && r.display_name) {
        p.label = r.name || r.display_name;
        p.address = r.display_name;
        renderDetail();
      }
    } catch (_) {}
  }

  function selectPlace(p, opts) {
    opts = opts || {};
    clearRoute();
    S.place = p;
    if (S.pin) S.map.removeLayer(S.pin);
    S.pin = L.marker([p.lat, p.lon], { icon: pinIcon() }).addTo(S.map);
    if (opts.fly !== false) S.map.flyTo([p.lat, p.lon], Math.max(S.map.getZoom(), 15), { duration: 0.7 });
    renderDetail();
    expandPanel();
  }

  function renderDetail() {
    const p = S.place;
    if (!p) return showHome();
    showTabs(false);
    const title = shortName(p.label);
    const addr = p.address && p.address !== title ? p.address : (p.label !== title ? p.label : '');
    setBody(`
      <div class="detail">
        <button class="sub-back" id="dBack"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>Back</button>
        <div id="dPhoto"></div>
        <h2>${esc(title)}</h2>
        <div class="addr">${esc(addr)}</div>
        <div class="acts">
          <button class="ui-btn primary" id="dDir">Directions</button>
          <button class="ui-btn" id="dSave">Save</button>
          <button class="ui-btn" id="dTrip">Add to trip</button>
          <button class="ui-btn" id="dShare">Share</button>
        </div>
        <div id="dWiki"></div>
        <div class="meta">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div>
      </div>`);
    $('dBack').onclick = closePlace;
    $('dDir').onclick = () => openDirections();
    $('dSave').onclick = openSave;
    $('dTrip').onclick = openTripPicker;
    $('dShare').onclick = sharePlace;
    loadWiki(p);
  }

  async function loadWiki(p) {
    try {
      const g = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${p.lat}|${p.lon}&gsradius=250&gslimit=1&format=json&origin=*`)).json();
      const hit = g.query && g.query.geosearch && g.query.geosearch[0];
      if (!hit) return;
      const s = await (await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(hit.title))).json();
      if (S.place !== p || !$('dWiki') || !s.extract) return;
      if (s.thumbnail && s.thumbnail.source) $('dPhoto').innerHTML = `<img class="photo" src="${esc(s.thumbnail.source)}" alt=""/>`;
      $('dWiki').innerHTML = `<p class="sum">${esc(s.extract)}</p><div class="meta">From Wikipedia</div>`;
    } catch (_) {}
  }

  function closePlace() {
    S.place = null;
    clearRoute();
    if (S.pin) { S.map.removeLayer(S.pin); S.pin = null; }
    showHome();
  }

  function sharePlace() {
    const p = S.place;
    const url = location.origin + location.pathname + '?place=' + p.lat.toFixed(6) + ',' + p.lon.toFixed(6) + ',' + encodeURIComponent(shortName(p.label));
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Link copied'), () => toast(url));
  }

  function showHome() {
    showTabs(true);
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    if (S.tab === 'saved') return renderSaved();
    if (S.tab === 'recent') return renderRecent();
    renderTrips();
  }

  function renderRecent() {
    const list = recents();
    if (!list.length) return setBody('<div class="empty">Places you search for show up here.</div>');
    setBody(list.map((r, i) => `
      <div class="item" data-i="${i}"><div class="ico">${esc(shortName(r.label).slice(0, 1).toUpperCase())}</div>
      <div class="info"><div class="t">${esc(shortName(r.label))}</div><div class="s">${esc(r.label)}</div></div></div>`).join('') +
      '<div class="acts" style="margin-top:10px"><button class="ui-btn" id="clearRecent">Clear history</button></div>');
    $('body').querySelectorAll('.item').forEach((el) => el.onclick = () => selectPlace(Object.assign({ address: '' }, list[+el.dataset.i])));
    $('clearRecent').onclick = () => { store.set(RECENT_KEY, []); renderRecent(); };
  }

  async function loadUser() {
    const { data } = await sb.auth.getSession();
    S.user = data && data.session ? data.session.user : null;
    sb.auth.onAuthStateChange((_e, sess) => {
      S.user = sess ? sess.user : null;
      if (!S.place) showHome();
      loadIncidents();
    });
  }

  function gate(what) {
    return `<div class="gate">Sign in to ${what}.<br/><a href="/signin?next=${encodeURIComponent(location.pathname)}">Sign in</a></div>`;
  }

  async function renderSaved() {
    if (!S.user) return setBody(gate('keep saved places'));
    setBody('<div class="empty">Loading</div>');
    const { data, error } = await sb.from('saved_locations').select('*').order('created_at', { ascending: false });
    if (error) return setBody(`<div class="empty">${esc(error.message)}</div>`);
    S.saved = data || [];
    if (!S.saved.length) return setBody('<div class="empty">Nothing saved yet. Find a place and tap Save.</div>');
    setBody(S.saved.map((r, i) => `
      <div class="item" data-i="${i}"><div class="ico">${esc((r.category || 'O').slice(0, 1))}</div>
      <div class="info"><div class="t">${esc(r.label)}</div><div class="s">${esc(r.note || r.category || '')}</div></div>
      <button class="x" data-del="${esc(r.id)}" aria-label="Remove"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>`).join(''));
    $('body').querySelectorAll('.item').forEach((el) => el.onclick = (e) => {
      if (e.target.closest('.x')) return;
      const r = S.saved[+el.dataset.i];
      selectPlace({ lat: r.lat, lon: r.lon, label: r.label, address: r.note || '' });
    });
    $('body').querySelectorAll('.x').forEach((b) => b.onclick = async () => {
      await sb.from('saved_locations').delete().eq('id', b.dataset.del);
      renderSaved();
    });
  }

  function openSave() {
    if (!S.user) return toast('Sign in to save places');
    $('saveLabel').value = shortName(S.place.label);
    $('saveNote').value = '';
    S.saveCat = 'Other';
    $('saveCats').innerHTML = CATS.map((c) => `<button type="button" data-c="${c}" class="${c === 'Other' ? 'on' : ''}">${c}</button>`).join('');
    $('saveCats').querySelectorAll('button').forEach((b) => b.onclick = () => {
      S.saveCat = b.dataset.c;
      $('saveCats').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    });
    $('saveModal').classList.add('show');
    $('saveLabel').focus();
  }
  async function doSave() {
    const label = $('saveLabel').value.trim();
    if (!label) return;
    $('saveGo').disabled = true;
    const { error } = await sb.from('saved_locations').insert({
      user_id: S.user.id, label, lat: S.place.lat, lon: S.place.lon, note: $('saveNote').value.trim() || null, category: S.saveCat, icon: S.saveCat,
    });
    $('saveGo').disabled = false;
    if (error) return toast(error.message);
    $('saveModal').classList.remove('show');
    toast('Saved');
  }

  async function renderTrips() {
    if (!S.user) return setBody(gate('plan trips'));
    setBody('<div class="empty">Loading</div>');
    const mine = await sb.from('maps_trips').select('*').eq('user_id', S.user.id).order('updated_at', { ascending: false });
    const collab = await sb.from('maps_trip_collaborators').select('trip_id').eq('user_id', S.user.id);
    let shared = [];
    const ids = (collab.data || []).map((r) => r.trip_id);
    if (ids.length) shared = (await sb.from('maps_trips').select('*').in('id', ids)).data || [];
    S.trips = [...(mine.data || []), ...shared];
    setBody(`
      <form class="new-trip" id="newTrip"><input class="ui-input" id="newTripName" placeholder="New trip name" maxlength="60"/><button class="ui-btn primary" type="submit">Create</button></form>
      <form class="new-trip" id="joinTrip"><input class="ui-input" id="joinCode" placeholder="Join with a share code" maxlength="40"/><button class="ui-btn" type="submit">Join</button></form>
      ${S.trips.length ? S.trips.map((t) => `<div class="item" data-id="${esc(t.id)}"><div class="ico">T</div><div class="info"><div class="t">${esc(t.title)}</div><div class="s">${t.user_id === S.user.id ? 'Yours' : 'Shared with you'}</div></div></div>`).join('') : '<div class="empty">No trips yet.</div>'}`);
    $('newTrip').onsubmit = async (e) => {
      e.preventDefault();
      const title = $('newTripName').value.trim();
      if (!title) return;
      const { data, error } = await sb.from('maps_trips').insert({ user_id: S.user.id, title }).select().single();
      if (error) return toast(error.message);
      showTrip(data.id);
    };
    $('joinTrip').onsubmit = async (e) => {
      e.preventDefault();
      const code = $('joinCode').value.trim();
      if (!code) return;
      const { data: t } = await sb.from('maps_trips').select('*').eq('share_code', code).maybeSingle();
      if (!t) return toast('No trip with that code');
      if (t.user_id !== S.user.id) await sb.from('maps_trip_collaborators').insert({ trip_id: t.id, user_id: S.user.id, added_by: S.user.id });
      showTrip(t.id);
    };
    $('body').querySelectorAll('.item').forEach((el) => el.onclick = () => showTrip(el.dataset.id));
  }

  async function showTrip(id) {
    showTabs(false);
    const { data: trip } = await sb.from('maps_trips').select('*').eq('id', id).maybeSingle();
    if (!trip) return showHome();
    const { data: stops } = await sb.from('maps_trip_stops').select('*').eq('trip_id', id).order('position', { ascending: true });
    S.openTrip = { trip, stops: stops || [] };
    const own = trip.user_id === S.user.id;
    setBody(`
      <div class="detail">
        <button class="sub-back" id="tBack"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>Trips</button>
        <h2>${esc(trip.title)}</h2>
        <div class="addr">${S.openTrip.stops.length} stop${S.openTrip.stops.length === 1 ? '' : 's'}${trip.share_code ? ' &middot; code ' + esc(trip.share_code) : ''}</div>
        <div class="acts">
          <button class="ui-btn primary" id="tRoute"${S.openTrip.stops.length < 2 ? ' disabled' : ''}>Route all stops</button>
          ${own ? '<button class="ui-btn" id="tDel">Delete</button>' : ''}
        </div>
        <div style="margin-top:12px">
          ${S.openTrip.stops.length ? S.openTrip.stops.map((s, i) => `
            <div class="stop-row"><div class="n">${i + 1}</div><div class="nm" data-go="${i}" style="cursor:pointer">${esc(s.name)}</div>
            <button class="mini" data-up="${i}" aria-label="Move up">&uarr;</button><button class="mini" data-down="${i}" aria-label="Move down">&darr;</button>
            <button class="mini" data-rm="${esc(s.id)}" aria-label="Remove">&times;</button></div>`).join('') : '<div class="empty">Open a place and tap Add to trip.</div>'}
        </div>
      </div>`);
    $('tBack').onclick = () => { S.tab = 'trips'; clearTripLine(); showHome(); };
    const rb = $('tRoute');
    if (rb) rb.onclick = routeTrip;
    const del = $('tDel');
    if (del) del.onclick = async () => { await sb.from('maps_trips').delete().eq('id', id); S.tab = 'trips'; showHome(); };
    $('body').querySelectorAll('[data-go]').forEach((el) => el.onclick = () => { const s = S.openTrip.stops[+el.dataset.go]; S.map.flyTo([s.lat, s.lng], 15); });
    $('body').querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => { await sb.from('maps_trip_stops').delete().eq('id', b.dataset.rm); showTrip(id); });
    $('body').querySelectorAll('[data-up]').forEach((b) => b.onclick = () => swapStops(+b.dataset.up, -1));
    $('body').querySelectorAll('[data-down]').forEach((b) => b.onclick = () => swapStops(+b.dataset.down, 1));
  }
  async function swapStops(i, d) {
    const arr = S.openTrip.stops, j = i + d;
    if (j < 0 || j >= arr.length) return;
    const a = arr[i], b = arr[j];
    await Promise.all([
      sb.from('maps_trip_stops').update({ position: b.position }).eq('id', a.id),
      sb.from('maps_trip_stops').update({ position: a.position }).eq('id', b.id),
    ]);
    showTrip(S.openTrip.trip.id);
  }
  let tripLine = null;
  function clearTripLine() { if (tripLine) { S.map.removeLayer(tripLine); tripLine = null; } }
  async function routeTrip() {
    const stops = S.openTrip.stops;
    const coords = stops.map((s) => s.lng + ',' + s.lat).join(';');
    try {
      const r = await (await fetch(ROUTERS.driving + coords + '?overview=full&geometries=geojson')).json();
      if (!r.routes || !r.routes[0]) throw new Error('No route found');
      clearTripLine();
      tripLine = L.geoJSON(r.routes[0].geometry, { style: { color: '#3b82f6', weight: 5, opacity: 0.9 } }).addTo(S.map);
      S.map.fitBounds(tripLine.getBounds(), { padding: [60, 60] });
      toast(fmtDist(r.routes[0].distance) + ', ' + fmtDur(r.routes[0].duration));
    } catch (err) { toast(err.message); }
  }
  async function openTripPicker() {
    if (!S.user) return toast('Sign in to plan trips');
    const { data: mine } = await sb.from('maps_trips').select('id,title').eq('user_id', S.user.id).order('updated_at', { ascending: false });
    const list = mine || [];
    $('tripPick').innerHTML = list.length ? list.map((t) => `<button data-id="${esc(t.id)}">${esc(t.title)}</button>`).join('') : '<div class="empty">Create a trip in the Trips tab first.</div>';
    $('tripPick').querySelectorAll('button').forEach((b) => b.onclick = async () => {
      const { data: last } = await sb.from('maps_trip_stops').select('position').eq('trip_id', b.dataset.id).order('position', { ascending: false }).limit(1);
      const pos = last && last[0] ? last[0].position + 1 : 0;
      const { error } = await sb.from('maps_trip_stops').insert({ trip_id: b.dataset.id, name: shortName(S.place.label), lat: S.place.lat, lng: S.place.lon, position: pos, added_by: S.user.id });
      $('tripModal').classList.remove('show');
      toast(error ? error.message : 'Added to trip');
    });
    $('tripModal').classList.add('show');
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Location is not available on this device'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
        (e) => reject(new Error(e.code === 1 ? 'Location permission was denied' : 'Could not get your location')),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
      );
    });
  }
  function setMe(pos) {
    S.me = pos;
    if (!S.meMarker) S.meMarker = L.marker([pos.lat, pos.lon], { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false, zIndexOffset: 800 }).addTo(S.map);
    else S.meMarker.setLatLng([pos.lat, pos.lon]);
  }
  async function locate() {
    try {
      const pos = await getPosition();
      setMe(pos);
      S.map.flyTo([pos.lat, pos.lon], Math.max(S.map.getZoom(), 15), { duration: 0.8 });
    } catch (err) { toast(err.message); }
  }

  function clearRoute() {
    if (S.routeLine) { S.map.removeLayer(S.routeLine); S.routeLine = null; }
    S.routes = []; S.route = null;
  }

  async function openDirections(from) {
    showTabs(false);
    if (!from) {
      try { const pos = await getPosition(); setMe(pos); from = { lat: pos.lat, lon: pos.lon, label: 'Your location' }; }
      catch (err) { toast(err.message); }
    }
    S.from = from || null;
    renderDirections();
    if (S.from) fetchRoute();
  }

  function renderDirections() {
    const p = S.place;
    setBody(`
      <div class="detail">
        <button class="sub-back" id="rBack"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>Back</button>
        <div class="endpoints">
          <div><i></i><span>${esc(S.from ? S.from.label : 'Choose a start by searching, then tap Directions')}</span></div>
          <div><i></i><span>${esc(shortName(p.label))}</span></div>
        </div>
        <div class="modes" id="modes">
          <button data-m="driving" class="${S.mode === 'driving' ? 'on' : ''}">Drive</button>
          <button data-m="cycling" class="${S.mode === 'cycling' ? 'on' : ''}">Cycle</button>
          <button data-m="walking" class="${S.mode === 'walking' ? 'on' : ''}">Walk</button>
        </div>
        <div id="routeBox">${S.from ? '<div class="empty">Finding routes</div>' : ''}</div>
      </div>`);
    $('rBack').onclick = () => { clearRoute(); renderDetail(); };
    $('modes').querySelectorAll('button').forEach((b) => b.onclick = () => { S.mode = b.dataset.m; renderDirections(); if (S.from) fetchRoute(); });
  }

  async function fetchRoute(quiet) {
    const a = S.from, b = S.place;
    const url = ROUTERS[S.mode] + `${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=true&alternatives=${quiet ? 'false' : 'true'}`;
    try {
      const r = await (await fetch(url)).json();
      if (!r.routes || !r.routes.length) throw new Error('No route found');
      S.routes = r.routes;
      S.routeIdx = 0;
      drawRoute(!quiet);
      if (!quiet) renderRouteBox();
      return true;
    } catch (err) {
      if (!quiet && $('routeBox')) $('routeBox').innerHTML = `<div class="empty">${esc(err.message === 'No route found' ? 'No route found for this travel mode.' : 'Routing is unavailable right now. Try again in a moment.')}</div>`;
      return false;
    }
  }

  function drawRoute(fit) {
    if (S.routeLine) S.map.removeLayer(S.routeLine);
    S.route = S.routes[S.routeIdx];
    S.routeLine = L.geoJSON(S.route.geometry, { style: { color: '#3b82f6', weight: 6, opacity: 0.92 } }).addTo(S.map);
    if (fit) S.map.fitBounds(S.routeLine.getBounds(), { padding: [70, 70] });
  }

  const ARROWS = {
    left: 'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6', straight: 'M12 19V5M5 12l7-7 7 7', uturn: 'M7 20V9a5 5 0 0110 0v3M13 8l4 4 4-4',
  };
  function arrowFor(step) {
    const m = (step.maneuver && step.maneuver.modifier) || '';
    if (step.maneuver && step.maneuver.type === 'arrive') return 'M12 21s7-6.2 7-11a7 7 0 00-14 0c0 4.8 7 11 7 11z';
    if (m.includes('left')) return ARROWS.left;
    if (m.includes('right')) return ARROWS.right;
    if (m === 'uturn') return ARROWS.uturn;
    return ARROWS.straight;
  }
  function stepText(step) {
    const m = step.maneuver || {}, road = step.name ? ' onto ' + step.name : '';
    if (m.type === 'depart') return ('Head ' + (m.modifier || '') + (step.name ? ' on ' + step.name : '')).trim();
    if (m.type === 'arrive') return 'You have arrived';
    if (m.type === 'roundabout' || m.type === 'rotary') return 'Take the roundabout' + road;
    const verbs = { left: 'Turn left', right: 'Turn right', 'slight left': 'Bear left', 'slight right': 'Bear right', 'sharp left': 'Sharp left', 'sharp right': 'Sharp right', straight: 'Continue straight', uturn: 'Make a U-turn' };
    return (verbs[m.modifier] || 'Continue') + road;
  }

  function renderRouteBox() {
    const box = $('routeBox');
    if (!box) return;
    const r = S.route;
    const steps = r.legs.flatMap((l) => l.steps);
    const eta = new Date(Date.now() + r.duration * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    box.innerHTML = `
      <div class="route-sum"><span class="big">${fmtDur(r.duration)}</span><span class="dim">${fmtDist(r.distance)} &middot; arrive ${eta}</span></div>
      ${S.routes.length > 1 ? `<div class="alts">${S.routes.map((x, i) => `<button data-i="${i}" class="${i === S.routeIdx ? 'on' : ''}"><b>${fmtDur(x.duration)}</b>${fmtDist(x.distance)}</button>`).join('')}</div>` : ''}
      <div class="acts"><button class="ui-btn primary" id="startNav">Start navigation</button></div>
      <ul class="steps">${steps.map((s) => `<li><svg class="arrow" viewBox="0 0 24 24"><path d="${arrowFor(s)}"/></svg><div>${esc(stepText(s))}<div class="d">${fmtDist(s.distance)}</div></div></li>`).join('')}</ul>`;
    box.querySelectorAll('.alts button').forEach((b) => b.onclick = () => { S.routeIdx = +b.dataset.i; drawRoute(false); renderRouteBox(); });
    $('startNav').onclick = startNav;
  }

  function navSteps() { return S.route.legs.flatMap((l) => l.steps); }
  async function startNav() {
    try { setMe(await getPosition()); } catch (err) { return toast(err.message); }
    S.nav = true; S.stepIdx = 0;
    document.body.classList.add('navigating');
    $('navbar').hidden = false;
    S.map.setView([S.me.lat, S.me.lon], 17);
    renderNav();
    S.watch = navigator.geolocation.watchPosition(onNavPos, () => {}, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  }
  function renderNav() {
    const steps = navSteps();
    const cur = steps[Math.min(S.stepIdx + 1, steps.length - 1)];
    const remainingSteps = steps.slice(S.stepIdx);
    const dist = remainingSteps.reduce((a, s) => a + s.distance, 0);
    const dur = remainingSteps.reduce((a, s) => a + s.duration, 0);
    $('navStep').textContent = stepText(cur);
    const toTurn = S.me && cur.maneuver ? haversine(S.me, { lat: cur.maneuver.location[1], lon: cur.maneuver.location[0] }) : cur.distance;
    $('navSub').textContent = `In ${fmtDist(toTurn)} · ${fmtDist(dist)} left · ${fmtDur(dur)}`;
    $('navIcon').innerHTML = `<svg viewBox="0 0 24 24"><path d="${arrowFor(cur)}"/></svg>`;
  }
  function onNavPos(p) {
    const pos = { lat: p.coords.latitude, lon: p.coords.longitude };
    setMe(pos);
    S.map.panTo([pos.lat, pos.lon], { animate: true });
    const steps = navSteps();
    const next = steps[S.stepIdx + 1];
    if (next && next.maneuver && haversine(pos, { lat: next.maneuver.location[1], lon: next.maneuver.location[0] }) < 30 && S.stepIdx < steps.length - 1) S.stepIdx++;
    if (S.stepIdx >= steps.length - 1 && haversine(pos, S.place) < 40) { toast('You have arrived'); return endNav(); }
    let min = Infinity;
    for (const c of S.route.geometry.coordinates) { const d = haversine(pos, { lat: c[1], lon: c[0] }); if (d < min) min = d; }
    if (min > 90 && Date.now() - S.lastReroute > 10000) {
      S.lastReroute = Date.now();
      $('navSub').textContent = 'Rerouting';
      S.from = { lat: pos.lat, lon: pos.lon, label: 'Your location' };
      fetchRoute(true).then((ok) => { if (ok) S.stepIdx = 0; });
    }
    renderNav();
  }
  function endNav() {
    S.nav = false;
    if (S.watch != null) navigator.geolocation.clearWatch(S.watch);
    S.watch = null;
    document.body.classList.remove('navigating');
    $('navbar').hidden = true;
    if (S.place) { renderDirections(); renderRouteBox(); }
  }

  function setupSearch() {
    const input = $('q');
    input.addEventListener('input', () => {
      $('qClear').hidden = !input.value;
      clearTimeout(S.sugTimer);
      const v = input.value.trim();
      if (v.length < 2) return hideSuggest();
      S.sugTimer = setTimeout(() => suggest(v), 380);
    });
    input.addEventListener('keydown', (e) => {
      const n = S.sugItems.length;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); S.sugIdx = (S.sugIdx + 1) % n; markSuggest(); }
      else if (e.key === 'ArrowUp' && n) { e.preventDefault(); S.sugIdx = (S.sugIdx - 1 + n) % n; markSuggest(); }
      else if (e.key === 'Escape') { hideSuggest(); input.blur(); }
    });
    $('searchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (S.sugIdx >= 0 && S.sugItems[S.sugIdx]) return pickSuggest(S.sugItems[S.sugIdx]);
      const v = input.value.trim();
      if (v) suggest(v, true);
    });
    $('qClear').onclick = () => { input.value = ''; $('qClear').hidden = true; hideSuggest(); input.focus(); };
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); input.focus(); }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('#suggest') && !e.target.closest('#searchForm')) hideSuggest(); });
  }
  function hideSuggest() { $('suggest').hidden = true; S.sugItems = []; S.sugIdx = -1; }
  function markSuggest() { $('suggest').querySelectorAll('li').forEach((li, i) => li.classList.toggle('on', i === S.sugIdx)); }
  async function suggest(q, pickFirst) {
    const seq = ++S.sugSeq;
    try {
      const rows = await geocode(q);
      if (seq !== S.sugSeq) return;
      S.sugItems = rows;
      S.sugIdx = -1;
      if (pickFirst && S.sugItems[0]) return pickSuggest(S.sugItems[0]);
      const ul = $('suggest');
      ul.innerHTML = S.sugItems.length ? S.sugItems.map((s, i) => `<li data-i="${i}"><b>${esc(s.name)}</b><span>${esc(s.label)}</span></li>`).join('') : '<li><span>No results</span></li>';
      ul.hidden = false;
      ul.querySelectorAll('li[data-i]').forEach((li) => li.onclick = () => pickSuggest(S.sugItems[+li.dataset.i]));
    } catch (err) { toast(err.message); }
  }
  function pickSuggest(s) {
    hideSuggest();
    $('q').value = s.name;
    $('qClear').hidden = false;
    clearPoi();
    const p = { lat: s.lat, lon: s.lon, label: s.name, address: s.label };
    addRecent(p);
    selectPlace(p);
  }

  function clearPoi() {
    S.poiLayer.clearLayers();
    S.poiType = null;
    document.querySelectorAll('#chips button').forEach((b) => b.classList.remove('on'));
  }
  async function loadPoi(type) {
    if (S.poiType === type) return clearPoi();
    clearPoi();
    S.poiType = type;
    document.querySelector(`#chips button[data-poi="${type}"]`).classList.add('on');
    if (S.map.getZoom() < 13) S.map.setZoom(14);
    const b = S.map.getBounds();
    const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(',');
    const [k, v] = POI[type].split('=');
    const q = `[out:json][timeout:20];(node["${k}"="${v}"](${bbox});way["${k}"="${v}"](${bbox}););out center 60;`;
    showTabs(false);
    setBody('<div class="empty">Searching this area</div>');
    try {
      const r = await (await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) })).json();
      if (S.poiType !== type) return;
      const rows = (r.elements || []).map((e) => ({ lat: e.lat || (e.center && e.center.lat), lon: e.lon || (e.center && e.center.lon), name: e.tags && (e.tags.name || e.tags.brand), tags: e.tags || {} })).filter((e) => e.lat && e.lon);
      const c = S.map.getCenter();
      const ref = S.me || { lat: c.lat, lon: c.lng };
      rows.forEach((x) => x.d = haversine(ref, x));
      rows.sort((a, b2) => a.d - b2.d);
      rows.forEach((x) => {
        L.marker([x.lat, x.lon], { icon: L.divIcon({ className: '', html: '<div class="poi-dot"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }) })
          .addTo(S.poiLayer).on('click', () => selectPlace({ lat: x.lat, lon: x.lon, label: x.name || type, address: addrFromTags(x.tags) }, { fly: false }));
      });
      setBody(`<button class="sub-back" id="poiBack"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>Back</button>` +
        (rows.length ? rows.slice(0, 40).map((x, i) => `<div class="item" data-i="${i}"><div class="ico">${esc((x.name || type).slice(0, 1).toUpperCase())}</div><div class="info"><div class="t">${esc(x.name || 'Unnamed')}</div><div class="s">${fmtDist(x.d)}${addrFromTags(x.tags) ? ' &middot; ' + esc(addrFromTags(x.tags)) : ''}</div></div></div>`).join('') : '<div class="empty">Nothing found in this view. Zoom out or pan and try again.</div>'));
      $('poiBack').onclick = () => { clearPoi(); showHome(); };
      $('body').querySelectorAll('.item').forEach((el) => el.onclick = () => { const x = rows[+el.dataset.i]; selectPlace({ lat: x.lat, lon: x.lon, label: x.name || type, address: addrFromTags(x.tags) }); });
    } catch (_) {
      setBody('<div class="empty">Could not load places. Try again in a moment.</div>');
    }
  }
  function addrFromTags(t) {
    return [t['addr:housenumber'] && t['addr:street'] ? t['addr:housenumber'] + ' ' + t['addr:street'] : t['addr:street'], t['addr:city']].filter(Boolean).join(', ');
  }

  function startMeasure() {
    S.measuring = true;
    $('measure').classList.add('on');
    $('measureBar').hidden = false;
    S.map.getContainer().style.cursor = 'crosshair';
    updateMeasure();
  }
  function stopMeasure() {
    S.measuring = false;
    $('measure').classList.remove('on');
    $('measureBar').hidden = true;
    S.map.getContainer().style.cursor = '';
    clearMeasure();
  }
  function clearMeasure() {
    S.mPts = [];
    if (S.mLine) { S.map.removeLayer(S.mLine); S.mLine = null; }
    S.mDots.forEach((d) => S.map.removeLayer(d));
    S.mDots = [];
    updateMeasure();
  }
  function addMeasurePoint(ll) {
    S.mPts.push(ll);
    S.mDots.push(L.circleMarker(ll, { radius: 5, color: '#fff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(S.map));
    if (S.mLine) S.mLine.setLatLngs(S.mPts); else S.mLine = L.polyline(S.mPts, { color: '#3b82f6', weight: 4, dashArray: '6 8' }).addTo(S.map);
    updateMeasure();
  }
  function updateMeasure() {
    let d = 0;
    for (let i = 1; i < S.mPts.length; i++) d += haversine({ lat: S.mPts[i - 1].lat, lon: S.mPts[i - 1].lng }, { lat: S.mPts[i].lat, lon: S.mPts[i].lng });
    $('measureText').textContent = S.mPts.length < 2 ? 'Click the map to add points' : fmtDist(d) + ' · ' + (d / 1609.344).toFixed(2) + ' mi';
  }

  async function loadIncidents() {
    S.incLayer.clearLayers();
    const { data } = await sb.from('map_incidents').select('*').gt('expires_at', new Date().toISOString());
    (data || []).forEach((inc) => {
      const m = L.marker([inc.lat, inc.lng], { icon: L.divIcon({ className: '', html: '<div class="inc-dot">!</div>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(S.incLayer);
      m.bindPopup(`<div class="pop-t">${esc(INCIDENTS[inc.type] || inc.type)}</div><div class="pop-s">${inc.upvotes || 0} confirmed</div><button class="pop-btn" data-up="${esc(inc.id)}">Still there</button>`);
      m.on('popupopen', (e) => {
        const b = e.popup.getElement().querySelector('[data-up]');
        if (b) b.onclick = async () => {
          if (!S.user) return toast('Sign in to confirm');
          await sb.from('map_incidents').update({ upvotes: (inc.upvotes || 0) + 1 }).eq('id', inc.id);
          m.closePopup();
          loadIncidents();
        };
      });
    });
  }
  async function reportIncident(type) {
    if (!S.user) { $('incidentModal').classList.remove('show'); return toast('Sign in to report incidents'); }
    let pos = S.me;
    try { pos = await getPosition(); setMe(pos); } catch (_) {}
    if (!pos) { const c = S.map.getCenter(); pos = { lat: c.lat, lon: c.lng }; }
    const { error } = await sb.from('map_incidents').insert({ type, lat: pos.lat, lng: pos.lon, reported_by: S.user.id, expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString() });
    $('incidentModal').classList.remove('show');
    if (error) return toast(error.message);
    toast('Reported, thanks');
    loadIncidents();
  }

  function expandPanel() { $('panel').classList.remove('min'); document.body.classList.remove('min-panel'); }

  function wire() {
    $('zIn').onclick = () => S.map.zoomIn();
    $('zOut').onclick = () => S.map.zoomOut();
    $('locate').onclick = locate;
    $('measure').onclick = () => (S.measuring ? stopMeasure() : startMeasure());
    $('measureClear').onclick = clearMeasure;
    $('measureDone').onclick = stopMeasure;
    $('report').onclick = () => $('incidentModal').classList.add('show');
    $('incCancel').onclick = () => $('incidentModal').classList.remove('show');
    $('incGrid').querySelectorAll('button').forEach((b) => b.onclick = () => reportIncident(b.dataset.type));
    $('saveCancel').onclick = () => $('saveModal').classList.remove('show');
    $('saveGo').onclick = doSave;
    $('tripCancel').onclick = () => $('tripModal').classList.remove('show');
    $('navExit').onclick = endNav;
    document.querySelectorAll('.ui-modal-ov').forEach((o) => o.addEventListener('mousedown', (e) => { if (e.target === o) o.classList.remove('show'); }));
    document.querySelectorAll('#layers button').forEach((b) => b.onclick = () => setStyle(b.dataset.style));
    document.querySelectorAll('#chips button').forEach((b) => b.onclick = () => loadPoi(b.dataset.poi));
    document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => { S.tab = b.dataset.tab; clearTripLine(); showHome(); });
    $('handle').onclick = () => {
      const min = $('panel').classList.toggle('min');
      document.body.classList.toggle('min-panel', min);
    };
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') { if (S.measuring) stopMeasure(); else if (S.place && !S.nav) closePlace(); }
      if (e.key.toLowerCase() === 'm') $('measure').click();
    });
  }

  function openFromUrl() {
    const raw = new URLSearchParams(location.search).get('place');
    if (!raw) return;
    const parts = raw.split(',');
    const lat = parseFloat(parts[0]), lon = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lon)) return;
    selectPlace({ lat, lon, label: decodeURIComponent(parts.slice(2).join(',') || 'Shared place'), address: '' });
  }

  async function init() {
    initMap();
    wire();
    setupSearch();
    await loadUser();
    showHome();
    openFromUrl();
    loadIncidents();
    setInterval(loadIncidents, 5 * 60 * 1000);
  }
  init();
})();
