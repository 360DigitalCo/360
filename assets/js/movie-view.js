(function () {
  var WD = 'https://www.wikidata.org/w/api.php';
  var SCORE_BY = { Q105584: 'Rotten Tomatoes', Q150248: 'Metacritic', Q37312: 'IMDb', Q1366112: 'Rotten Tomatoes' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function json(u) {
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function val(c) { return c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value; }

  function load(title) {
    return json(WD + '?action=wbgetentities&sites=enwiki&titles=' + encodeURIComponent(title) +
      '&props=claims|labels&languages=en&format=json&origin=*').then(function (d) {
      var e = d && d.entities && Object.values(d.entities)[0];
      if (!e || !e.claims) return null;
      var c = e.claims;
      var inst = (c.P31 || []).map(function (x) { var v = val(x); return v && v.id; });
      var film = inst.some(function (id) { return ['Q11424', 'Q24862', 'Q202866', 'Q5398426', 'Q21191270', 'Q506240'].indexOf(id) > -1; });
      if (!film) return null;
      var scores = [];
      (c.P444 || []).forEach(function (s) {
        var by = s.qualifiers && s.qualifiers.P447 && s.qualifiers.P447[0].datavalue && s.qualifiers.P447[0].datavalue.value.id;
        var v = val(s);
        var label = by && SCORE_BY[by];
        if (label && typeof v === 'string' && !scores.some(function (x) { return x.src === label; })) scores.push({ src: label, v: v });
      });
      var yt = (c.P1651 || []).map(val).filter(function (x) { return typeof x === 'string'; });
      var imdb = (c.P345 || []).map(val)[0];
      var ids = {};
      ['P57', 'P161', 'P577', 'P2047', 'P136'].forEach(function (p) {
        (c[p] || []).forEach(function (x) { var v = val(x); if (v && v.id) ids[v.id] = 1; });
      });
      var runtime = (c.P2047 || []).map(val)[0];
      var year = (c.P577 || []).map(val).map(function (t) { return t && t.time && t.time.slice(1, 5); })[0];
      return { scores: scores, yt: yt[0], imdb: imdb, runtime: runtime && runtime.amount && Math.round(+runtime.amount), year: year };
    });
  }

  function ring(s) {
    var pct = parseFloat(s.v);
    var shown = s.v;
    if (/\//.test(s.v)) { var p = s.v.split('/'); pct = p[1] ? (parseFloat(p[0]) / parseFloat(p[1])) * 100 : pct; }
    pct = isNaN(pct) ? 0 : Math.max(0, Math.min(100, pct));
    return '<div class="mv-score"><div class="mv-ring" style="--p:' + pct.toFixed(0) + '"><span>' + esc(shown) + '</span></div><div class="mv-src">' + esc(s.src) + '</div></div>';
  }

  window.MovieView = {
    mount: function (o) {
      load(o.title).then(function (m) {
        if (!m || !o.isValid()) return;
        if (!m.scores.length && !m.yt && !m.imdb) return;
        var tq = encodeURIComponent(o.title + ' official trailer');
        var meta = [m.year, m.runtime ? m.runtime + ' min' : ''].filter(Boolean).join(' · ');
        var html = '<div class="mv-card">' +
          (meta ? '<div class="mv-meta">' + esc(meta) + '</div>' : '') +
          (m.scores.length ? '<div class="mv-scores">' + m.scores.map(ring).join('') + '</div>' : '') +
          (m.yt ? '<div class="mv-trailer"><button type="button" class="mv-play" data-yt="' + esc(m.yt) + '" style="background-image:url(https://i.ytimg.com/vi/' + esc(m.yt) + '/hqdefault.jpg)"><span>Watch trailer</span></button></div>' : '') +
          (m.yt ? '' : '<a class="mv-link" href="https://www.youtube.com/results?search_query=' + tq + '" target="_blank" rel="noopener noreferrer">Find official trailer</a>') +
          (m.imdb ? '<a class="mv-link" href="https://www.imdb.com/title/' + esc(m.imdb) + '/" target="_blank" rel="noopener noreferrer">View on IMDb</a>' : '') +
          '</div>';
        o.host.insertAdjacentHTML('beforeend', html);
        var b = o.host.querySelector('.mv-play');
        if (b) b.addEventListener('click', function () {
          var w = b.parentNode;
          w.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(b.dataset.yt) + '?autoplay=1&rel=0" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
        });
      });
    }
  };
})();
