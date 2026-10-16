/* Religions Timeline — v2
 * Static, no build step. Data: one JSON file per tradition (data/*.json),
 * a texts registry (data/texts.json), and an index (data/index.json).
 * Adding a tradition/text/idea never requires code changes.
 *
 * Years are SIGNED: negative = BCE, positive = CE.
 *
 * v2 viewport: the timeline is a window (state.viewFrom..state.viewTo) onto
 * the full span. Drag to pan, wheel to zoom, use the era tabs to fly to a
 * period, or drag the window on the minimap. Filters/search/tags unchanged.
 */
(function () {
  'use strict';

  var W = 1120, LABEL_W = 190, PAD_R = 30, TOP = 46, TRACK_H = 78;
  var MINI_H = 34;
  var state = {
    view: 'texts', idea: 'all', query: '', selected: null,
    span: { from: -2600, to: 2000 },
    viewFrom: -2600, viewTo: 2000
  };
  var traditions = [];   // {id,name,region,color,events:[...]}
  var texts = {};        // text_id -> registry entry
  var ideaColors = {};
  var anim = null;       // viewport animation handle

  var palette = d3.schemeTableau10;

  function fmtYear(y) {
    if (y < 0) return (-y) + ' BCE';
    if (y === 0) return '1 BCE'; // no year zero in historical notation
    return y + ' CE';
  }
  function fmtRange(a, b) {
    return a === b ? fmtYear(a) : fmtYear(a) + ' – ' + fmtYear(b);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- data ---------------- */

  function loadData() {
    return fetch('data/index.json').then(function (r) { return r.json(); })
      .then(function (index) {
        state.span = index.timespan;
        state.viewFrom = index.timespan.from;
        state.viewTo = index.timespan.to;
        return fetch(index.texts_registry).then(function (r) { return r.json(); })
          .then(function (reg) {
            texts = reg.texts || {};
            var files = index.traditions.filter(function (t) { return t.id !== 'template'; });
            return Promise.all(files.map(function (t) {
              return fetch(t.file).then(function (r) { return r.json(); })
                .then(function (data) {
                  data.color = t.color;
                  data.region = t.region;
                  return data;
                });
            }));
          });
      })
      .then(function (loaded) { traditions = loaded; });
  }

  function allIdeas() {
    var set = {};
    traditions.forEach(function (tr) {
      tr.events.forEach(function (e) { e.ideas.forEach(function (i) { set[i] = true; }); });
    });
    return Object.keys(set).sort();
  }

  function eventMatches(e) {
    var q = state.query.trim().toLowerCase();
    if (!q) return true;
    var reg = texts[e.text_id] || {};
    var hay = [e.title, e.description, reg.title, reg.what, e.ideas.join(' ')].join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  /* ---------------- viewport ---------------- */

  function spanWidth() { return state.span.to - state.span.from; }

  function clampView() {
    var w = state.viewTo - state.viewFrom;
    var minW = 60, maxW = spanWidth();
    if (w < minW) { var c = (state.viewFrom + state.viewTo) / 2; state.viewFrom = c - minW / 2; state.viewTo = c + minW / 2; w = minW; }
    if (w > maxW) { state.viewFrom = state.span.from; state.viewTo = state.span.to; return; }
    if (state.viewFrom < state.span.from) { state.viewFrom = state.span.from; state.viewTo = state.viewFrom + w; }
    if (state.viewTo > state.span.to) { state.viewTo = state.span.to; state.viewFrom = state.viewTo - w; }
  }

  function setView(from, to) {
    state.viewFrom = from; state.viewTo = to;
    clampView();
    syncEraTabs();
    render();
  }

  function animateView(toFrom, toTo) {
    if (anim) cancelAnimationFrame(anim);
    var f0 = state.viewFrom, t0 = state.viewTo;
    var start = null, dur = 600;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; // easeInOutCubic
      state.viewFrom = f0 + (toFrom - f0) * e;
      state.viewTo = t0 + (toTo - t0) * e;
      clampView();
      render();
      if (p < 1) anim = requestAnimationFrame(step);
      else { anim = null; syncEraTabs(); }
    }
    anim = requestAnimationFrame(step);
  }

  function zoomAt(centerYear, factor) {
    var w = (state.viewTo - state.viewFrom) * factor;
    w = Math.max(60, Math.min(spanWidth(), w));
    var c = Math.max(state.viewFrom, Math.min(state.viewTo, centerYear));
    var ratio = (c - state.viewFrom) / (state.viewTo - state.viewFrom);
    setView(c - ratio * w, c + (1 - ratio) * w);
  }

  function tickStep() {
    var w = state.viewTo - state.viewFrom;
    var steps = [10, 25, 50, 100, 200, 250, 500, 1000];
    for (var i = 0; i < steps.length; i++) {
      if (w / steps[i] <= 11) return steps[i];
    }
    return 1000;
  }

  /* ---------------- render ---------------- */

  function render() {
    var ideas = allIdeas();
    ideas.forEach(function (idea, i) { if (!ideaColors[idea]) ideaColors[idea] = palette[i % palette.length]; });

    var H = TOP + traditions.length * TRACK_H + 26;
    var x = d3.scaleLinear()
      .domain([state.viewFrom, state.viewTo])
      .range([LABEL_W, W - PAD_R]);

    var main = d3.select('#tl-main');
    main.selectAll('*').remove();
    var svg = main.append('svg')
      .attr('viewBox', '0 0 ' + W + ' ' + H)
      .attr('role', 'img')
      .attr('aria-label', 'Timeline of religious traditions, 2600 BCE to 2000 CE. Drag to pan, scroll to zoom.');

    var defs = svg.append('defs');
    defs.append('clipPath').attr('id', 'plot-clip')
      .append('rect')
      .attr('x', LABEL_W).attr('y', 0)
      .attr('width', W - PAD_R - LABEL_W).attr('height', H);

    var plot = svg.append('g').attr('clip-path', 'url(#plot-clip)');

    // gridlines + axis
    var step = tickStep();
    var t0 = Math.ceil(state.viewFrom / step) * step;
    var ticks = d3.range(t0, state.viewTo + 1, step);
    var grid = plot.append('g').attr('class', 'grid');
    ticks.forEach(function (t) {
      grid.append('line')
        .attr('x1', x(t)).attr('x2', x(t))
        .attr('y1', TOP - 8).attr('y2', H - 18);
    });
    // the BCE/CE divide
    if (state.viewFrom < 0 && state.viewTo > 0) {
      plot.append('line').attr('class', 'era-line')
        .attr('x1', x(0)).attr('x2', x(0))
        .attr('y1', TOP - 8).attr('y2', H - 18);
      plot.append('text').attr('class', 'era-marker')
        .attr('x', x(0) + 5).attr('y', H - 22).text('1 CE →');
    }
    var axis = svg.append('g').attr('class', 'axis')
      .attr('transform', 'translate(0,' + (TOP - 14) + ')')
      .call(d3.axisTop(x).tickValues(ticks).tickFormat(fmtYear));
    axis.select('.domain').remove();
    axis.selectAll('line,path').remove();

    // idea links (under the bars)
    var showLines = state.view !== 'texts';
    var linkLayer = plot.append('g');
    var barLayer = plot.append('g');

    var visibleIdeas = state.idea === 'all' ? ideas : [state.idea];
    if (showLines) {
      visibleIdeas.forEach(function (idea) {
        var pts = [];
        traditions.forEach(function (tr, ti) {
          tr.events.forEach(function (e) {
            var mid = (e.year_from + e.year_to) / 2;
            if (e.ideas.indexOf(idea) !== -1 && eventMatches(e) && mid >= state.viewFrom && mid <= state.viewTo) {
              pts.push({ x: x(mid), y: TOP + ti * TRACK_H + TRACK_H / 2, e: e, tr: tr });
            }
          });
        });
        if (pts.length >= 2) {
          pts.sort(function (a, b) { return a.x - b.x; });
          var line = d3.line().x(function (p) { return p.x; }).y(function (p) { return p.y; }).curve(d3.curveMonotoneX);
          linkLayer.append('path')
            .attr('class', 'idea-link' + (state.idea !== 'all' && state.idea !== idea ? ' dim' : ''))
            .attr('d', line(pts))
            .attr('stroke', ideaColors[idea])
            .append('title').text(idea + ': shared by ' + pts.length + ' texts');
          pts.forEach(function (p) {
            linkLayer.append('circle')
              .attr('class', 'idea-dot')
              .attr('cx', p.x).attr('cy', p.y).attr('r', 5)
              .attr('fill', ideaColors[idea])
              .append('title').text(p.e.title + ' — ' + idea);
          });
        }
      });
    }

    // tracks + event bars
    var showBars = state.view !== 'ideas';
    traditions.forEach(function (tr, ti) {
      var cy = TOP + ti * TRACK_H + TRACK_H / 2;
      plot.append('line')
        .attr('x1', x(state.viewFrom)).attr('x2', x(state.viewTo))
        .attr('y1', cy).attr('y2', cy)
        .attr('stroke', tr.color).attr('stroke-width', 2).attr('opacity', 0.25);
      svg.append('text').attr('class', 'track-label')
        .attr('x', 12).attr('y', cy - 4).text(tr.name);
      svg.append('text').attr('class', 'track-sub')
        .attr('x', 12).attr('y', cy + 13).text(tr.region);

      tr.events.forEach(function (e) {
        if (e.year_to < state.viewFrom || e.year_from > state.viewTo) return;
        var g = barLayer.append('g')
          .attr('class', 'event-bar' + ((!eventMatches(e) || (state.idea !== 'all' && e.ideas.indexOf(state.idea) === -1)) ? ' dim' : ''))
          .style('display', showBars ? null : 'none')
          .on('click', function () { selectEvent(e, tr); });
        var x1 = x(e.year_from), x2 = x(e.year_to);
        var bw = Math.max(6, x2 - x1);
        var bh = 30;
        g.append('rect')
          .attr('x', x1).attr('y', cy - bh / 2)
          .attr('width', bw).attr('height', bh).attr('rx', 7)
          .attr('fill', tr.color).attr('fill-opacity', 0.62)
          .attr('stroke', tr.color)
          .append('title').text(e.title + ' (' + fmtRange(e.year_from, e.year_to) + ', ' + e.certainty + ')');
        if (bw > 110) {
          g.append('text')
            .attr('x', x1 + 8).attr('y', cy + 4)
            .text(e.title.length > 26 ? e.title.slice(0, 25) + '…' : e.title);
        }
      });
    });

    renderMini(x);
    attachPanZoom(svg, x);
    renderLegend(ideas);
  }

  function renderMini() {
    var mini = d3.select('#tl-mini');
    mini.selectAll('*').remove();
    var mx = d3.scaleLinear().domain([state.span.from, state.span.to]).range([LABEL_W, W - PAD_R]);
    var svg = mini.append('svg')
      .attr('viewBox', '0 0 ' + W + ' ' + MINI_H)
      .attr('aria-hidden', 'true');
    traditions.forEach(function (tr, ti) {
      var y = 4 + ti * ((MINI_H - 8) / Math.max(1, traditions.length - 1));
      svg.append('line')
        .attr('x1', mx(state.span.from)).attr('x2', mx(state.span.to))
        .attr('y1', y).attr('y2', y)
        .attr('stroke', tr.color).attr('stroke-width', 2).attr('opacity', 0.35);
      tr.events.forEach(function (e) {
        svg.append('rect')
          .attr('x', mx(e.year_from)).attr('y', y - 2)
          .attr('width', Math.max(2, mx(e.year_to) - mx(e.year_from))).attr('height', 4)
          .attr('fill', tr.color).attr('opacity', 0.6);
      });
    });
    svg.append('text').attr('class', 'track-sub')
      .attr('x', 12).attr('y', MINI_H / 2 + 4).text('Overview — drag the window');
    var win = svg.append('rect').attr('class', 'mini-window')
      .attr('x', mx(state.viewFrom)).attr('y', 1)
      .attr('width', Math.max(8, mx(state.viewTo) - mx(state.viewFrom)))
      .attr('height', MINI_H - 2).attr('rx', 4);

    // drag the window (or click) to pan
    var drag = d3.drag()
      .on('start drag', function (event) {
        if (anim) { cancelAnimationFrame(anim); anim = null; }
        var px = d3.pointer(event, svg.node())[0];
        var w = state.viewTo - state.viewFrom;
        var center = mx.invert(px);
        setView(center - w / 2, center + w / 2);
      });
    svg.call(drag);
    win.style('pointer-events', 'none');
  }

  function attachPanZoom(svg, x) {
    var node = svg.node();
    var dragState = null;

    node.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('.event-bar')) return;
      if (anim) { cancelAnimationFrame(anim); anim = null; }
      dragState = { x: ev.clientX, from: state.viewFrom, to: state.viewTo, moved: false };
      node.setPointerCapture(ev.pointerId);
      node.classList.add('panning');
    });
    node.addEventListener('pointermove', function (ev) {
      if (!dragState) return;
      var rect = node.getBoundingClientRect();
      var yearsPerPx = (dragState.to - dragState.from) / (rect.width * (W - PAD_R - LABEL_W) / W);
      var dxYears = (ev.clientX - dragState.x) * yearsPerPx;
      if (Math.abs(ev.clientX - dragState.x) > 3) dragState.moved = true;
      if (dragState.moved) setView(dragState.from - dxYears, dragState.to - dxYears);
    });
    function endPan() { dragState = null; node.classList.remove('panning'); }
    node.addEventListener('pointerup', endPan);
    node.addEventListener('pointercancel', endPan);

    node.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var rect = node.getBoundingClientRect();
      var frac = (ev.clientX - rect.left) / rect.width;         // 0..1 across the element
      var svgX = frac * W;
      var year = x.invert(Math.max(LABEL_W, Math.min(W - PAD_R, svgX)));
      zoomAt(year, ev.deltaY > 0 ? 1.18 : 0.85);
    }, { passive: false });

    node.addEventListener('dblclick', function (ev) {
      var rect = node.getBoundingClientRect();
      var svgX = ((ev.clientX - rect.left) / rect.width) * W;
      zoomAt(x.invert(Math.max(LABEL_W, Math.min(W - PAD_R, svgX))), 0.5);
    });
  }

  function renderLegend(ideas) {
    var legend = d3.select('#legend');
    legend.selectAll('*').remove();
    if (state.view === 'texts') return;
    ideas.forEach(function (idea) {
      legend.append('span')
        .attr('class', 'chip' + (state.idea === idea ? ' active' : ''))
        .html('<span class="dot" style="background:' + ideaColors[idea] + '"></span>' + esc(idea))
        .on('click', function () {
          state.idea = (state.idea === idea) ? 'all' : idea;
          d3.select('#idea-filter').property('value', state.idea);
          render();
        });
    });
  }

  /* ---------------- detail panel ---------------- */

  function selectEvent(e, tr) {
    state.selected = e;
    var reg = texts[e.text_id] || {};
    var panel = document.getElementById('detail');
    panel.innerHTML =
      '<h2>' + esc(e.title) + '</h2>' +
      '<div class="trad">' + esc(tr.name) + ' · ' + esc(tr.region) + '</div>' +
      '<div class="dates">' + esc(fmtRange(e.year_from, e.year_to)) +
        '<span class="certainty ' + esc(e.certainty) + '">' + esc(e.certainty) + '</span></div>' +
      '<p>' + esc(e.description) + '</p>' +
      (reg.date_range && reg.date_range.note ? '<p><em>Dating note:</em> ' + esc(reg.date_range.note) + '</p>' : '') +
      '<div class="tags">' + e.ideas.map(function (i) {
        return '<span class="tag" data-idea="' + esc(i) + '">' + esc(i) + '</span>';
      }).join('') + '</div>' +
      '<div class="src"><strong>Source:</strong> ' + esc(reg.source_label || '—') + '<br>' +
        (reg.source_url ? '<a href="' + esc(reg.source_url) + '" target="_blank" rel="noopener">About this text ↗</a>' : '') +
      '</div>' +
      (reg.content && reg.content.url ? '<a class="read" href="' + esc(reg.content.url) + '" target="_blank" rel="noopener">' +
        esc(reg.content.label || 'Read the text') + ' ↗</a>' : '');
    panel.querySelectorAll('.tag').forEach(function (el) {
      el.addEventListener('click', function () {
        state.idea = el.getAttribute('data-idea');
        if (state.view === 'texts') setViewMode('both');
        document.getElementById('idea-filter').value = state.idea;
        render();
      });
    });
  }

  /* ---------------- controls ---------------- */

  function setViewMode(v) {
    state.view = v;
    document.querySelectorAll('.view-toggle button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === v);
    });
  }

  function syncEraTabs() {
    document.querySelectorAll('.era-tab').forEach(function (b) {
      var f = +b.getAttribute('data-from'), t = +b.getAttribute('data-to');
      b.classList.toggle('active', Math.abs(f - state.viewFrom) < 2 && Math.abs(t - state.viewTo) < 2);
    });
  }

  function initControls() {
    document.querySelectorAll('.view-toggle button').forEach(function (b) {
      b.addEventListener('click', function () { setViewMode(b.getAttribute('data-view')); render(); });
    });
    document.getElementById('search').addEventListener('input', function (ev) {
      state.query = ev.target.value; render();
    });
    document.getElementById('idea-filter').addEventListener('change', function (ev) {
      state.idea = ev.target.value; render();
    });
    document.querySelectorAll('.era-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        animateView(+b.getAttribute('data-from'), +b.getAttribute('data-to'));
      });
    });
    document.getElementById('zoom-in').addEventListener('click', function () {
      zoomAt((state.viewFrom + state.viewTo) / 2, 0.55);
    });
    document.getElementById('zoom-out').addEventListener('click', function () {
      zoomAt((state.viewFrom + state.viewTo) / 2, 1.8);
    });
    document.getElementById('zoom-reset').addEventListener('click', function () {
      animateView(state.span.from, state.span.to);
    });
  }

  loadData().then(function () {
    initControls();
    var sel = document.getElementById('idea-filter');
    allIdeas().forEach(function (idea) {
      var o = document.createElement('option');
      o.value = idea; o.textContent = idea;
      sel.appendChild(o);
    });
    render();
    syncEraTabs();
  }).catch(function (err) {
    document.getElementById('tl-main').innerHTML =
      '<p style="padding:20px">Could not load timeline data: ' + esc(err.message) +
      '. Serve this folder over HTTP (e.g. <code>python3 -m http.server</code>) rather than file://.</p>';
  });
})();
