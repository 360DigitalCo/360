(function () {
  var WD = 'https://www.wikidata.org/w/api.php';
  var WP = 'https://en.wikipedia.org/w/api.php';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ICONS = {
    X: '<svg viewBox="0 0 24 24"><path d="M4 4l16 16M20 4L4 20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>',
    YouTube: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5.5" width="19" height="13" rx="4" fill="#f00"/><path d="M10 9.2v5.6l5-2.8z" fill="#fff"/></svg>',
    Facebook: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1877f2"/><path d="M13.4 20v-6.3h2.1l.4-2.6h-2.5V9.4c0-.8.3-1.3 1.4-1.3h1.2V5.8c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.3v2.1H8.8v2.6h2.1V20z" fill="#fff"/></svg>',
    Instagram: '<svg viewBox="0 0 24 24"><defs><linearGradient id="pvig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset=".5" stop-color="#d62976"/><stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs><rect x="3" y="3" width="18" height="18" rx="5" fill="url(#pvig)"/><circle cx="12" cy="12" r="4" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="17" cy="7" r="1.1" fill="#fff"/></svg>',
    LinkedIn: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="#0a66c2"/><path d="M7 10h2v7H7zM8 7a1.1 1.1 0 110 2.2A1.1 1.1 0 018 7zm3 3h2v1c.4-.7 1.2-1.2 2.3-1.2 2 0 2.7 1.2 2.7 3.1V17h-2v-3.6c0-.9-.3-1.5-1.2-1.5-.9 0-1.3.7-1.3 1.6V17h-2z" fill="#fff"/></svg>',
    TikTok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#111"/><path d="M13 7v7.2a2 2 0 11-2-2m2-5.2c.3 1.7 1.4 2.7 3 2.8" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>'
  };

  var state = { token: 0, host: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function jget(url) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 7000);
    return fetch(url, { signal: ctl.signal })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (v) { clearTimeout(timer); return v; });
  }

  function limit(promise, ms, fallback) {
    return Promise.race([promise, new Promise(function (resolve) { setTimeout(function () { resolve(fallback); }, ms); })]);
  }

  function sized(url, w) {
    return String(url || '').replace(/\/(\d+)px-/, '/' + w + 'px-');
  }

  function claimValue(claims, pid) {
    var c = (claims[pid] || []).filter(function (x) { return x.rank !== 'deprecated'; });
    return c.map(function (x) { return x; });
  }

  function timeLabel(t, precision) {
    var m = /^([+-])(\d+)-(\d{2})-(\d{2})/.exec(t || '');
    if (!m) return null;
    var y = parseInt(m[2], 10);
    if (precision <= 9) return String(y);
    if (precision === 10) return MONTHS[parseInt(m[3], 10) - 1] + ' ' + y;
    return MONTHS[parseInt(m[3], 10) - 1] + ' ' + parseInt(m[4], 10) + ', ' + y;
  }

  function yearOf(t) {
    var m = /^[+-](\d+)-/.exec(t || '');
    return m ? parseInt(m[1], 10) : null;
  }

  function ageFrom(t) {
    var m = /^\+(\d+)-(\d{2})-(\d{2})/.exec(t || '');
    if (!m) return null;
    var now = new Date();
    var age = now.getFullYear() - parseInt(m[1], 10);
    var mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (mo && (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && d && now.getDate() < d))) age--;
    return age > 0 && age < 130 ? age : null;
  }

  async function loadEntity(title) {
    var data = await jget(WD + '?action=wbgetentities&sites=enwiki&titles=' + encodeURIComponent(title) + '&props=claims&format=json&origin=*');
    var ent = data && Object.values(data.entities || {})[0];
    if (!ent || !ent.claims) return null;
    var cl = ent.claims;
    var isHuman = (cl.P31 || []).some(function (c) { return c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id === 'Q5'; });
    if (!isHuman) return null;

    var born = claimValue(cl, 'P569')[0];
    var died = claimValue(cl, 'P570')[0];
    var bornT = born && born.mainsnak.datavalue ? born.mainsnak.datavalue.value : null;
    var diedT = died && died.mainsnak.datavalue ? died.mainsnak.datavalue.value : null;

    var ids = {};
    function addId(c) { if (c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id) ids[c.mainsnak.datavalue.value.id] = 1; }
    var parties = claimValue(cl, 'P102');
    var currentParty = parties.filter(function (c) { return !(c.qualifiers && c.qualifiers.P582); }).pop() || parties.pop();
    addId(currentParty);
    var spouses = claimValue(cl, 'P26');
    spouses.forEach(addId);
    var children = claimValue(cl, 'P40');
    children.slice(0, 8).forEach(addId);
    var birthPlace = claimValue(cl, 'P19')[0];
    addId(birthPlace);
    var occupations = claimValue(cl, 'P106').slice(0, 2);
    occupations.forEach(addId);

    var labels = {};
    var partyLogo = null;
    var idList = Object.keys(ids);
    var partyId = currentParty && currentParty.mainsnak.datavalue ? currentParty.mainsnak.datavalue.value.id : null;
    var both = await Promise.all([
      idList.length ? jget(WD + '?action=wbgetentities&ids=' + idList.join('|') + '&props=labels&languages=en&format=json&origin=*') : null,
      partyId ? jget(WD + '?action=wbgetentities&ids=' + partyId + '&props=claims&format=json&origin=*') : null
    ]);
    var lab = both[0], pe = both[1];
    Object.keys((lab && lab.entities) || {}).forEach(function (q) { labels[q] = lab.entities[q].labels && lab.entities[q].labels.en ? lab.entities[q].labels.en.value : q; });
    var pc = pe && pe.entities && pe.entities[partyId] && pe.entities[partyId].claims;
    var logo = pc && pc.P154 && pc.P154[0] && pc.P154[0].mainsnak.datavalue ? pc.P154[0].mainsnak.datavalue.value : null;
    if (logo) partyLogo = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(logo) + '?width=160';

    function lbl(c) { var v = c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value; return v && v.id ? (labels[v.id] || null) : null; }
    function str(pid) { var c = claimValue(cl, pid)[0]; var v = c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value; return typeof v === 'string' ? v : null; }

    var spouseRows = spouses.map(function (c) {
      var n = lbl(c);
      if (!n) return null;
      var q = c.qualifiers || {};
      var s = q.P580 && q.P580[0].datavalue ? yearOf(q.P580[0].datavalue.value.time) : null;
      var e = q.P582 && q.P582[0].datavalue ? yearOf(q.P582[0].datavalue.value.time) : null;
      return { name: n, span: s ? '(m. ' + s + (e ? '–' + e : '') + ')' : '' };
    }).filter(Boolean);

    var social = [];
    var x = str('P2002'), ig = str('P2003'), fb = str('P2013'), yt = str('P2397'), li = str('P6634'), tt = str('P7085');
    if (x) social.push({ label: 'X', sub: 'X (Twitter)', url: 'https://x.com/' + encodeURIComponent(x.replace(/^@/, '')) });
    if (yt) social.push({ label: 'YouTube', sub: 'YouTube', url: 'https://www.youtube.com/channel/' + encodeURIComponent(yt) });
    if (fb) social.push({ label: 'Facebook', sub: 'Facebook', url: 'https://www.facebook.com/' + encodeURIComponent(fb) });
    if (ig) social.push({ label: 'Instagram', sub: 'Instagram', url: 'https://www.instagram.com/' + encodeURIComponent(ig.replace(/^@/, '')) + '/', handle: '@' + ig.replace(/^@/, '') });
    if (tt) social.push({ label: 'TikTok', sub: 'TikTok', url: 'https://www.tiktok.com/@' + encodeURIComponent(tt.replace(/^@/, '')) });
    if (li) social.push({ label: 'LinkedIn', sub: 'LinkedIn', url: 'https://www.linkedin.com/in/' + encodeURIComponent(li) });

    return {
      bornLabel: bornT ? timeLabel(bornT.time, bornT.precision) : null,
      age: !diedT && bornT ? ageFrom(bornT.time) : null,
      diedLabel: diedT ? timeLabel(diedT.time, diedT.precision) : null,
      birthPlace: lbl(birthPlace),
      party: partyId ? labels[partyId] : null,
      partyLogo: partyLogo,
      occupation: occupations.map(lbl).filter(Boolean).join(', '),
      spouses: spouseRows,
      children: children.map(lbl).filter(Boolean),
      website: str('P856'),
      social: social
    };
  }

  async function loadCommons(title, skipUrl) {
    var data = await jget('https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=' + encodeURIComponent(title) + '&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime&iiurlwidth=600&format=json&origin=*');
    var pages = Object.values((data && data.query && data.query.pages) || {});
    return pages.map(function (p) {
      var ii = p.imageinfo && p.imageinfo[0];
      return { title: p.title || '', url: ii ? (ii.thumburl || ii.url) : '', mime: ii ? ii.mime : '' };
    }).filter(function (p) { return /^https?:/.test(p.url) && /^image\/(jpeg|png|webp)/.test(p.mime) && p.url !== skipUrl; }).slice(0, 2);
  }

  async function loadRelated(title) {
    var data = await jget(WP + '?action=query&generator=search&gsrsearch=' + encodeURIComponent('morelike:' + title) + '&gsrnamespace=0&gsrlimit=14&prop=pageimages|description&piprop=thumbnail&pithumbsize=260&format=json&origin=*');
    var pages = Object.values((data && data.query && data.query.pages) || {});
    pages.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
    return pages.filter(function (p) { return p.thumbnail && p.title !== title; }).slice(0, 8).map(function (p) {
      return { name: p.title, sub: p.description || '', img: p.thumbnail.source };
    });
  }

  function shell() {
    return '' +
      '<section class="pv">' +
      '<header class="pv-head"><h2 class="pv-name"></h2><p class="pv-sub"></p></header>' +
      '<div class="pv-media" id="pv-media"><div class="pv-skel pv-sk-a"></div><div class="pv-skel pv-sk-b"></div><div class="pv-skel pv-sk-c"></div></div>' +
      '<div class="pv-cols">' +
      '<section class="pv-block" id="pv-stories"><h3 class="pv-h">Top stories</h3><div class="pv-story-grid" id="pv-story-grid"><div class="pv-skel pv-sk-story"></div><div class="pv-skel pv-sk-story"></div></div><div class="pv-headlines" id="pv-headlines"></div></section>' +
      '<section class="pv-block" id="pv-said" hidden><h3 class="pv-h">What people are saying</h3><div class="pv-said-row" id="pv-said-row"></div></section>' +
      '<div class="pv-bottom"><div class="pv-bcol">' +
      '<section class="pv-block" id="pv-overview"><h3 class="pv-h">Overview</h3><p class="pv-over"></p><div class="pv-facts" id="pv-facts"></div></section>' +
      '<section class="pv-block" id="pv-profiles" hidden><h3 class="pv-h">Profiles</h3><div class="pv-profiles" id="pv-profile-row"></div></section>' +
      '</div><div class="pv-bcol">' +
      '<section class="pv-block" id="pv-related"><h3 class="pv-h">People also search for</h3><div class="pv-rel-grid" id="pv-rel-grid"><div class="pv-skel pv-sk-rel"></div><div class="pv-skel pv-sk-rel"></div><div class="pv-skel pv-sk-rel"></div><div class="pv-skel pv-sk-rel"></div></div><button type="button" class="pv-more" id="pv-more" hidden>See more</button></section>' +
      '</div></div>' +
      '</div></section>';
  }

  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

  function ago(item) {
    return item.age || item.publishedAt || item.publishedDate || item.date || '';
  }

  function factRow(label, html) {
    return '<div class="pv-fact"><span class="pv-fl">' + esc(label) + '</span><span class="pv-fv">' + html + '</span></div>';
  }

  function renderMedia(root, wiki, ent, commons, social) {
    var media = root.querySelector('#pv-media');
    var hero = sized(wiki.thumbnail && wiki.thumbnail.source, 800) || '';
    var cells = [];
    if (hero || commons.length) {
      var side = commons.map(function (p) {
        return '<a class="pv-ph" href="https://commons.wikimedia.org/wiki/' + esc(p.title.replace(/ /g, '_')) + '" target="_blank" rel="noopener noreferrer"><img src="' + esc(p.url) + '" alt="" loading="lazy" onerror="PersonView.fb(this,1)"></a>';
      }).join('');
      cells.push('<div class="pv-photos' + (side ? '' : ' solo') + '">' +
        (hero ? '<a class="pv-ph pv-hero" href="' + esc((wiki.content_urls && wiki.content_urls.desktop && wiki.content_urls.desktop.page) || '#') + '" target="_blank" rel="noopener noreferrer"><img src="' + esc(hero) + '" alt="' + esc(wiki.title || '') + '" onerror="PersonView.fb(this,1)"></a>' : '') +
        (side ? '<div class="pv-stack">' + side + '</div>' : '') + '</div>');
    }
    if (!social && ent && ent.social && ent.social.length) {
      var pick = ent.social.filter(function (x) { return /^(X|Instagram)$/.test(x.label); })[0] || ent.social[0];
      social = { url: pick.url, title: 'Posts by ' + (wiki.title || '') + (pick.handle ? ' (' + pick.handle + ')' : ''), snippet: 'Open the ' + pick.label + ' profile for the latest posts.' };
    }
    if (social) {
      var thumb = social.thumb || social.thumbnail || social.image || '';
      var host = hostOf(social.url);
      var plat = /instagram/.test(host) ? 'Instagram' : /facebook/.test(host) ? 'Facebook' : /(^|\.)x\.com|twitter/.test(host) ? 'X' : /youtube/.test(host) ? 'YouTube' : /tiktok/.test(host) ? 'TikTok' : host;
      cells.push('<a class="pv-post" href="' + esc(social.url) + '" target="_blank" rel="noopener noreferrer">' +
        (/^https?:/.test(thumb) ? '<img class="pv-post-img" src="' + esc(thumb) + '" alt="" loading="lazy" onerror="PersonView.fb(this)">' : '<div class="pv-post-text">' + esc((social.snippet || social.desc || social.title || '').slice(0, 160)) + '</div>') +
        '<div class="pv-post-meta"><span class="pv-ico">' + (ICONS[plat] || '') + '</span><span><b>' + esc(plat) + '</b><br>' + esc(String(ago(social) || '')) + '</span></div></a>');
    }
    var stats = '';
    if (ent && ent.age != null) stats += '<div class="pv-stat"><span class="pv-stat-l">Age</span><span class="pv-stat-big">' + ent.age + ' years</span><span class="pv-stat-s">' + esc(ent.bornLabel || '') + '</span></div>';
    else if (ent && ent.bornLabel) stats += '<div class="pv-stat"><span class="pv-stat-l">Born</span><span class="pv-stat-big">' + esc(ent.bornLabel) + '</span></div>';
    if (ent && ent.party) stats += '<div class="pv-stat pv-party"><span class="pv-stat-l">Party</span><span class="pv-stat-mid">' + esc(ent.party) + '</span>' + (ent.partyLogo ? '<img class="pv-party-logo" src="' + esc(ent.partyLogo) + '" alt="" onerror="PersonView.fb(this)">' : '') + '</div>';
    else if (ent && ent.occupation) stats += '<div class="pv-stat pv-party"><span class="pv-stat-l">Occupation</span><span class="pv-stat-mid">' + esc(ent.occupation) + '</span></div>';
    var site = '';
    if (ent && ent.website) {
      site = '<a class="pv-site" href="' + esc(ent.website) + '" target="_blank" rel="noopener noreferrer"><span class="pv-site-top"><img src="https://www.google.com/s2/favicons?sz=32&domain_url=' + encodeURIComponent(ent.website) + '" alt="" width="16" height="16"> ' + esc(hostOf(ent.website)) + '</span><span class="pv-site-name">' + esc(wiki.title || '') + ' official site</span><span class="pv-site-url">' + esc(ent.website.replace(/^https?:\/\//, '')) + '</span></a>';
    }
    if (stats || site) cells.push('<div class="pv-statcol"><div class="pv-statrow">' + stats + '</div>' + site + '</div>');
    media.innerHTML = cells.join('');
  }

  function renderStories(root, stories) {
    var block = root.querySelector('#pv-stories');
    if (!stories.length) { block.hidden = true; return; }
    var withThumb = stories.filter(function (s) { return s.thumb; });
    var lead = withThumb[0] || stories[0];
    var rest = stories.filter(function (s) { return s !== lead; });
    var small = rest.filter(function (s) { return s.thumb; }).slice(0, 2);
    var tail = rest.filter(function (s) { return small.indexOf(s) < 0; });
    function meta(s) { return esc([s.source, s.age].filter(Boolean).join(' · ')); }
    var html = '<a class="pv-lead" href="' + esc(lead.url) + '" target="_blank" rel="noopener noreferrer">' +
      (lead.thumb ? '<img src="' + esc(lead.thumb) + '" alt="" loading="lazy" onerror="PersonView.fb(this)">' : '') +
      '<span class="pv-src">' + esc(lead.source || hostOf(lead.url)) + '</span><span class="pv-ttl">' + esc(lead.title) + '</span><span class="pv-age">' + esc(lead.age || '') + '</span></a>';
    html += '<div class="pv-smalls">' + small.map(function (s) {
      return '<a class="pv-small" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer"><span class="pv-small-t"><span class="pv-src">' + esc(s.source || hostOf(s.url)) + '</span><span class="pv-ttl">' + esc(s.title) + '</span><span class="pv-age">' + esc(s.age || '') + '</span></span><img src="' + esc(s.thumb) + '" alt="" loading="lazy" onerror="PersonView.fb(this)"></a>';
    }).join('') + '</div>';
    root.querySelector('#pv-story-grid').innerHTML = html;
    root.querySelector('#pv-headlines').innerHTML = tail.slice(0, 4).map(function (s) {
      return '<a class="pv-line" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer"><span class="pv-ttl">' + esc(s.title) + '</span><span class="pv-age">' + meta(s) + '</span></a>';
    }).join('');
    block.hidden = false;
  }

  function postText(s) {
    var t = String(s.snippet || s.description || s.desc || '').replace(/\s+/g, ' ').trim();
    var ttl = String(s.title || '').replace(/\s+/g, ' ').trim();
    var junk = /^(post on|posts? by|instagram|x |twitter|facebook|tiktok|youtube)/i.test(ttl) || ttl.length < 12;
    return { head: junk && t ? t.slice(0, 90) : ttl.slice(0, 90), body: t.slice(0, 260) };
  }

  function renderSaid(root, items) {
    var block = root.querySelector('#pv-said');
    var seen = {};
    items = items.filter(function (s) { if (!s || !s.url || seen[s.url]) return false; seen[s.url] = 1; return true; });
    if (!items.length) { block.hidden = true; return; }
    root.querySelector('#pv-said-row').innerHTML = items.map(function (s) {
      var host = hostOf(s.url);
      var plat = /instagram/.test(host) ? 'Instagram' : /facebook/.test(host) ? 'Facebook' : /(^|\.)x\.com|twitter/.test(host) ? 'X' : /youtube/.test(host) ? 'YouTube' : /tiktok/.test(host) ? 'TikTok' : /threads/.test(host) ? 'Threads' : host;
      var thumb = s.thumb || s.thumbnail || s.image || '';
      var tx = postText(s);
      var when = String(ago(s) || '');
      return '<a class="pv-said" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' +
        (/^https?:/.test(thumb) ? '<img src="' + esc(thumb) + '" alt="" loading="lazy" onerror="PersonView.fb(this)">' : '<span class="pv-said-fill"></span>') +
        '<span class="pv-said-txt"><span class="pv-said-ttl">' + esc(tx.head) + '</span>' +
        (tx.body && tx.body !== tx.head ? '<span class="pv-said-desc">' + esc(tx.body) + '</span>' : '') + '</span>' +
        '<span class="pv-said-by"><span class="pv-ico">' + (ICONS[plat] || '') + '</span>' + esc(plat) + (when ? ' · ' + esc(when) : '') + '</span></a>';
    }).join('');
    block.hidden = false;
  }

  function renderSide(root, wiki, ent, search) {
    root.querySelector('.pv-over').innerHTML = esc(wiki.extract || '') + (wiki.content_urls ? ' <a href="' + esc(wiki.content_urls.desktop.page) + '" target="_blank" rel="noopener noreferrer">Wikipedia</a>' : '');
    var f = '';
    if (ent) {
      if (ent.bornLabel) f += factRow('Born', esc(ent.bornLabel) + (ent.age != null ? ' (age ' + ent.age + ' years)' : '') + (ent.birthPlace ? ', <span class="pv-u">' + esc(ent.birthPlace) + '</span>' : ''));
      if (ent.diedLabel) f += factRow('Died', esc(ent.diedLabel));
      if (ent.party) f += factRow('Party', '<span class="pv-u">' + esc(ent.party) + '</span>');
      if (ent.spouses.length) f += factRow('Spouse', ent.spouses.map(function (s) { return '<span class="pv-u">' + esc(s.name) + '</span> ' + esc(s.span); }).join(', '));
      if (ent.children.length) f += factRow('Children', ent.children.map(function (c) { return '<span class="pv-u">' + esc(c) + '</span>'; }).join(', '));
    }
    root.querySelector('#pv-facts').innerHTML = f;
    if (ent && ent.social.length) {
      root.querySelector('#pv-profile-row').innerHTML = ent.social.map(function (p) {
        return '<a class="pv-prof" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer"><span class="pv-prof-i">' + (ICONS[p.label] || '') + '</span><span>' + esc(p.sub) + '</span></a>';
      }).join('');
      root.querySelector('#pv-profiles').hidden = false;
    }
  }

  function renderRelated(root, list, search) {
    var block = root.querySelector('#pv-related');
    if (!list.length) { block.hidden = true; return; }
    var grid = root.querySelector('#pv-rel-grid');
    var more = root.querySelector('#pv-more');
    var shown = 4;
    function paint() {
      grid.innerHTML = list.slice(0, shown).map(function (p, i) {
        return '<button type="button" class="pv-rel" data-i="' + i + '"><img src="' + esc(p.img) + '" alt="" loading="lazy" onerror="PersonView.fb(this)"><span class="pv-rel-n">' + esc(p.name) + '</span><span class="pv-rel-s">' + esc(p.sub.length > 26 ? p.sub.slice(0, 24) + '…' : p.sub) + '</span></button>';
      }).join('');
      more.hidden = shown >= list.length;
    }
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('.pv-rel');
      if (b && search) search(list[Number(b.dataset.i)].name);
    });
    more.addEventListener('click', function () { shown = list.length; paint(); });
    paint();
    block.hidden = false;
  }

  var PersonView = {
    fb: function (img, up) {
      var src = img.getAttribute('src') || '';
      if (!img.dataset.fb && /^https?:/.test(src) && src.indexOf('wsrv.nl') < 0) {
        img.dataset.fb = '1';
        img.referrerPolicy = 'no-referrer';
        img.src = 'https://wsrv.nl/?w=900&url=' + encodeURIComponent(src);
        return;
      }
      (up ? img.parentNode : img).remove();
    },

    clear: function () {
      state.token++;
      if (state.host) { state.host.innerHTML = ''; state.host.classList.remove('pv-on'); }
      document.body.classList.remove('pv-active');
    },

    sync: function (tab) {
      if (!state.host) return;
      var on = state.host.firstChild && tab === 'web' && document.body.classList.contains('classic-results');
      state.host.classList.toggle('pv-on', !!on);
      document.body.classList.toggle('pv-active', !!on);
    },

    mount: async function (opts) {
      var host = opts.host;
      state.host = host;
      var my = ++state.token;
      var wiki = opts.wiki || {};
      var title = opts.title;
      var ok = function () { return my === state.token && opts.isValid(); };

      var entityP = limit(loadEntity(title), 9000, null);
      var hero = sized(wiki.thumbnail && wiki.thumbnail.source, 800);
      var commonsP = limit(loadCommons(title, hero), 8000, []);
      var storiesP = limit(opts.fetchStories(title).catch(function () { return []; }), 12000, []);
      var socialP = limit(opts.fetchSocial(title).catch(function () { return []; }), 12000, []);
      var relatedP = limit(loadRelated(title), 8000, []);

      host.innerHTML = shell();
      var root = host;
      root.querySelector('.pv-name').textContent = wiki.title || title;
      root.querySelector('.pv-sub').textContent = wiki.description || '';
      root.querySelector('.pv-over').innerHTML = esc(wiki.extract || '');
      PersonView.sync(opts.getTab());

      var ent = await entityP;
      if (!ok()) return false;
      if (!ent) { PersonView.clear(); return false; }
      renderSide(root, wiki, ent, opts.search);

      var state2 = { commons: [], social: [] };
      var paint = function () { if (ok()) renderMedia(root, wiki, ent, state2.commons, state2.social[0] || null); };
      commonsP.then(function (c) { state2.commons = c; });
      socialP.then(function (sr) { state2.social = sr; if (ok()) renderSaid(root, sr.slice(0, 4)); });
      await limit(Promise.all([commonsP, socialP]), 2500, null);
      paint();
      Promise.all([commonsP, socialP]).then(paint);
      storiesP.then(function (st) { if (ok()) renderStories(root, st); });
      relatedP.then(function (r) { if (ok()) renderRelated(root, r, opts.search); });
      return true;
    }
  };

  window.PersonView = PersonView;
})();
