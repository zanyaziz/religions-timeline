/* Religions Timeline — v2
 * Static, no build step. Data: one JSON file per tradition (data/*.json),
 * a texts registry (data/texts.json), and an index (data/index.json).
 * Adding a tradition/text/idea never requires code changes.
 *
 * Years are SIGNED: negative = BCE, positive = CE.
 *
 * v2 viewport: the timeline is a window (state.viewFrom..state.viewTo) onto
 * the full span. Drag to pan, wheel to zoom, use the era tabs to fly to a
 * period, or use the time-window scroller under the chart (drag the window,
 * drag its edges to resize). Tracks and idea tags dim when they have nothing
 * in the visible window. v2.1 adds the Idea Map tab (attestation over time
 * on a schematic map) and a phone-friendly responsive layout throughout.
 */
(function () {
  'use strict';

  var W = 1120, LABEL_W = 190, PAD_R = 30, TOP = 46, TRACK_H = 78;
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
                  data.map = t.map || null;
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
      // tracks with nothing in the visible window fade back
      var trOff = !tr.events.some(function (e) { return e.year_to >= state.viewFrom && e.year_from <= state.viewTo; });
      plot.append('line')
        .attr('x1', x(state.viewFrom)).attr('x2', x(state.viewTo))
        .attr('y1', cy).attr('y2', cy)
        .attr('class', trOff ? 'track-off' : '')
        .attr('stroke', tr.color).attr('stroke-width', 2).attr('opacity', 0.25);
      svg.append('text').attr('class', 'track-label' + (trOff ? ' track-off' : ''))
        .attr('x', 12).attr('y', cy - 4).text(tr.name);
      svg.append('text').attr('class', 'track-sub' + (trOff ? ' track-off' : ''))
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

    renderScroller();
    attachPanZoom(svg, x);
    renderLegend(ideas);
    updateIdeaAvailability();
  }

  /* Ideas actually present in the visible window — chips and filter options
   * for anything else stay dimmed/disabled. */
  function ideasInWindow() {
    var set = {};
    traditions.forEach(function (tr) {
      tr.events.forEach(function (e) {
        if (e.year_to >= state.viewFrom && e.year_from <= state.viewTo) {
          e.ideas.forEach(function (i) { set[i] = true; });
        }
      });
    });
    return set;
  }

  function updateIdeaAvailability() {
    var inWin = ideasInWindow();
    document.querySelectorAll('#idea-filter option').forEach(function (o) {
      if (o.value !== 'all') o.disabled = !inWin[o.value] && state.idea !== o.value;
    });
  }

  /* -------- time-window scroller (bottom) --------
   * A full-span overview under the chart. Drag the window to travel through
   * time, drag its edges to resize (zoom), or click outside it to jump.
   * Events outside the window are shaded/dimmed; inside, they light up. */
  function renderScroller() {
    var host = d3.select('#scroller-svg');
    host.selectAll('*').remove();
    var SH = 64, SX0 = 26, SX1 = W - 26;
    var mx = d3.scaleLinear().domain([state.span.from, state.span.to]).range([SX0, SX1]);
    var svg = host.append('svg')
      .attr('viewBox', '0 0 ' + W + ' ' + SH)
      .attr('role', 'slider')
      .attr('aria-label', 'Time window scroller: drag the window through time from 2600 BCE to 2000 CE');

    // shade everything outside the window
    svg.append('rect').attr('class', 'scroller-shade')
      .attr('x', SX0).attr('y', 2).attr('width', Math.max(0, mx(state.viewFrom) - SX0)).attr('height', SH - 16);
    svg.append('rect').attr('class', 'scroller-shade')
      .attr('x', mx(state.viewTo)).attr('y', 2).attr('width', Math.max(0, SX1 - mx(state.viewTo))).attr('height', SH - 16);

    // tradition rows + events (lit inside the window, dim outside)
    traditions.forEach(function (tr, ti) {
      var y = 8 + ti * ((SH - 26) / Math.max(1, traditions.length - 1));
      svg.append('line')
        .attr('x1', SX0).attr('x2', SX1).attr('y1', y).attr('y2', y)
        .attr('stroke', tr.color).attr('stroke-width', 2).attr('opacity', 0.3);
      tr.events.forEach(function (e) {
        var inWin = e.year_to >= state.viewFrom && e.year_from <= state.viewTo;
        svg.append('rect')
          .attr('x', mx(e.year_from)).attr('y', y - 2.4)
          .attr('width', Math.max(2.5, mx(e.year_to) - mx(e.year_from))).attr('height', 4.8)
          .attr('fill', tr.color).attr('opacity', inWin ? 0.95 : 0.25);
      });
    });

    // era ticks
    [-2000, -1000, 0, 1000, 2000].forEach(function (t) {
      svg.append('text').attr('class', 'scroller-tick')
        .attr('x', mx(t)).attr('y', SH - 2).attr('text-anchor', 'middle').text(fmtYear(t));
    });

    // the window + grab handles
    var wx = mx(state.viewFrom), ww = Math.max(10, mx(state.viewTo) - wx);
    svg.append('rect').attr('class', 'scroller-window')
      .attr('x', wx).attr('y', 3).attr('width', ww).attr('height', SH - 17).attr('rx', 5);
    [wx, wx + ww].forEach(function (hx) {
      svg.append('rect').attr('class', 'scroller-handle')
        .attr('x', hx - 5).attr('y', 10).attr('width', 10).attr('height', SH - 31).attr('rx', 4);
    });

    var rangeEl = document.getElementById('scroller-range');
    if (rangeEl) rangeEl.textContent = fmtRange(Math.round(state.viewFrom), Math.round(state.viewTo));

    // pointer interaction: move / resize-left / resize-right / jump
    var node = svg.node();
    var drag = null;
    function svgX(ev) {
      var rect = node.getBoundingClientRect();
      return (ev.clientX - rect.left) / rect.width * W;
    }
    node.addEventListener('pointerdown', function (ev) {
      if (anim) { cancelAnimationFrame(anim); anim = null; }
      var px = svgX(ev), x0 = mx(state.viewFrom), x1 = mx(state.viewTo), HIT = 26;
      var mode = 'move';
      if (Math.abs(px - x0) <= HIT && px <= x1) mode = 'left';
      else if (Math.abs(px - x1) <= HIT && px >= x0) mode = 'right';
      else if (px < x0 || px > x1) { // jump: centre the window on the tap, then drag-move
        var w = state.viewTo - state.viewFrom, c = mx.invert(px);
        setView(c - w / 2, c + w / 2);
        mode = 'move';
      }
      drag = { mode: mode, startX: px, from: state.viewFrom, to: state.viewTo };
      if (node.setPointerCapture) node.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    node.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var px = svgX(ev);
      var dYears = mx.invert(px) - mx.invert(drag.startX);
      var MINW = 80;
      if (drag.mode === 'move') setView(drag.from + dYears, drag.to + dYears);
      else if (drag.mode === 'left') setView(Math.min(drag.from + dYears, drag.to - MINW), drag.to);
      else setView(drag.from, Math.max(drag.to + dYears, drag.from + MINW));
    });
    function endDrag() { drag = null; }
    node.addEventListener('pointerup', endDrag);
    node.addEventListener('pointercancel', endDrag);
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
    var inWin = ideasInWindow();
    ideas.forEach(function (idea) {
      legend.append('span')
        .attr('class', 'chip' + (state.idea === idea ? ' active' : '') + (inWin[idea] ? '' : ' absent'))
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

  /* ---------------- idea map ----------------
   * Attestation only: a region lights up when the selected idea is first
   * attested there in the timeline data (the earliest event carrying the tag
   * in that tradition), and stays lit. Dashed lines join lit regions in
   * chronological order of first attestation — sequence, NOT transmission.
   * No arrows, no borrowing claims. Node geometry lives in data/index.json
   * (each tradition's "map" entry); the landmasses below are schematic. */
  var MAP_LAND = [
    'M55,120 L120,84 L210,66 L286,84 L318,120 L292,168 L236,196 L176,208 L120,182 L70,168 Z',
    'M238,238 L292,226 L318,272 L300,344 L262,386 L232,320 L226,272 Z',
    'M452,196 L520,168 L586,164 L616,196 L600,262 L556,322 L500,330 L462,272 Z',
    'M420,120 L470,84 L560,64 L680,58 L800,66 L900,88 L946,128 L920,176 L852,206 L770,196 L716,214 L664,196 L612,176 L560,158 L470,158 L428,150 Z',
    'M792,232 L836,226 L850,252 L820,276 L790,262 Z',
    'M836,306 L912,292 L944,318 L918,352 L852,352 L828,330 Z'
  ];
  var mapState = { idea: null, year: 2000, timer: null };

  function attestations(idea) {
    var out = [];
    traditions.forEach(function (tr) {
      var evs = tr.events.filter(function (e) { return e.ideas.indexOf(idea) !== -1; });
      if (!evs.length) return;
      var first = evs.reduce(function (a, b) { return a.year_from <= b.year_from ? a : b; });
      out.push({ tr: tr, event: first, year: first.year_from });
    });
    return out.sort(function (a, b) { return a.year - b.year; });
  }

  function showMapInfo(tr, att) {
    var el = document.getElementById('map-info');
    var entry = null;
    att.forEach(function (a) { if (a.tr === tr) entry = a; });
    var html = '<strong>' + esc(tr.name) + '</strong> · ' + esc(tr.map ? tr.map.label : tr.region) + '<br>';
    if (entry) {
      html += '“' + esc(mapState.idea) + '” is first attested here in the data by <em>' +
        esc(entry.event.title) + '</em> (' + esc(fmtRange(entry.event.year_from, entry.event.year_to)) +
        ', ' + esc(entry.event.certainty) + ').';
    } else {
      html += '“' + esc(mapState.idea) + '” is not attested in this tradition’s timeline data.';
    }
    el.innerHTML = html;
  }

  function renderMap() {
    if (!mapState.idea) return;
    var host = d3.select('#map-svg');
    host.selectAll('*').remove();
    var svg = host.append('svg')
      .attr('viewBox', '0 0 1000 460')
      .attr('role', 'img')
      .attr('aria-label', 'Schematic world map: where the selected idea is attested over time');
    MAP_LAND.forEach(function (d) { svg.append('path').attr('class', 'map-land').attr('d', d); });

    var att = attestations(mapState.idea);
    var attById = {};
    att.forEach(function (a) { attById[a.tr.id] = a; });
    var lit = att.filter(function (a) { return a.year <= mapState.year && a.tr.map; });

    // chronological chain between lit regions (no arrowheads — sequence only)
    for (var i = 1; i < lit.length; i++) {
      svg.append('line').attr('class', 'map-link')
        .attr('x1', lit[i - 1].tr.map.x).attr('y1', lit[i - 1].tr.map.y)
        .attr('x2', lit[i].tr.map.x).attr('y2', lit[i].tr.map.y);
    }

    traditions.forEach(function (tr) {
      if (!tr.map) return;
      var entry = attById[tr.id];
      var isLit = !!entry && entry.year <= mapState.year;
      var g = svg.append('g')
        .attr('class', 'map-node' + (entry ? (isLit ? '' : ' dim') : ' notattested'))
        .on('click', function () { showMapInfo(tr, att); });
      if (isLit) g.append('circle').attr('class', 'halo')
        .attr('cx', tr.map.x).attr('cy', tr.map.y).attr('r', 16).attr('stroke', tr.color);
      g.append('circle')
        .attr('cx', tr.map.x).attr('cy', tr.map.y).attr('r', 10)
        .attr('fill', tr.color).attr('stroke', '#fff').attr('stroke-width', 2)
        .append('title').text(tr.name + ' — ' + tr.map.label +
          (entry ? ': first attested ' + fmtYear(entry.year) + ' (' + entry.event.title + ')' : ': not attested for this idea'));
      g.append('circle') // generous invisible tap target for touch
        .attr('cx', tr.map.x).attr('cy', tr.map.y).attr('r', 20).attr('fill', 'transparent');
      g.append('text')
        .attr('x', tr.map.lx).attr('y', tr.map.ly)
        .attr('text-anchor', tr.map.anchor || 'middle').text(tr.map.label);
    });

    // legend row (also a tap target list)
    var legend = host.append('div').attr('class', 'map-legend');
    traditions.forEach(function (tr) {
      if (!tr.map) return;
      var entry = attById[tr.id];
      var isLit = !!entry && entry.year <= mapState.year;
      legend.append('button')
        .attr('class', 'ml-item' + (isLit ? '' : ' dim'))
        .html('<span class="dot" style="background:' + tr.color + '"></span>' + esc(tr.name))
        .on('click', function () { showMapInfo(tr, att); });
    });

    // attestation list beside the map
    var ul = document.getElementById('map-attest');
    ul.innerHTML = '';
    att.forEach(function (a) {
      var li = document.createElement('li');
      if (a.year > mapState.year) li.className = 'future';
      li.innerHTML = '<span class="dot" style="background:' + a.tr.color + '"></span>' +
        '<span class="when">' + esc(fmtYear(a.year)) + '</span>' +
        '<span><strong>' + esc(a.tr.name) + '</strong> — ' + esc(a.event.title) +
        ' (' + esc(fmtRange(a.event.year_from, a.event.year_to)) + ')</span>';
      li.addEventListener('click', function () { setMapYear(a.year); showMapInfo(a.tr, att); });
      ul.appendChild(li);
    });

    document.getElementById('map-year-label').textContent = fmtYear(Math.round(mapState.year));
  }

  function setMapYear(y) {
    mapState.year = Math.max(state.span.from, Math.min(state.span.to, y));
    var input = document.getElementById('map-year');
    if (input) input.value = mapState.year;
    renderMap();
  }

  function stopMapPlay() {
    if (mapState.timer) { clearInterval(mapState.timer); mapState.timer = null; }
    var btn = document.getElementById('map-play');
    if (btn) btn.textContent = '▶ Play';
  }

  function initMap() {
    // idea picker: most widely attested ideas first
    var counts = {};
    traditions.forEach(function (tr) {
      var seen = {};
      tr.events.forEach(function (e) { e.ideas.forEach(function (i) { seen[i] = true; }); });
      Object.keys(seen).forEach(function (i) { counts[i] = (counts[i] || 0) + 1; });
    });
    var ideas = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || (a < b ? -1 : 1);
    });
    var sel = document.getElementById('map-idea');
    ideas.forEach(function (idea) {
      var o = document.createElement('option');
      o.value = idea;
      o.textContent = idea + ' · ' + counts[idea] + (counts[idea] === 1 ? ' tradition' : ' traditions');
      sel.appendChild(o);
    });
    mapState.idea = ideas[0];
    sel.value = mapState.idea;
    sel.addEventListener('change', function () {
      mapState.idea = sel.value;
      renderMap();
    });
    var range = document.getElementById('map-year');
    range.min = state.span.from; range.max = state.span.to;
    range.addEventListener('input', function () { stopMapPlay(); setMapYear(+range.value); });
    document.getElementById('map-play').addEventListener('click', function () {
      if (mapState.timer) { stopMapPlay(); return; }
      if (mapState.year >= state.span.to) setMapYear(state.span.from);
      this.textContent = '❚❚ Pause';
      mapState.timer = setInterval(function () {
        var y = mapState.year + 25;
        if (y >= state.span.to) { setMapYear(state.span.to); stopMapPlay(); }
        else setMapYear(y);
      }, 50);
    });
    mapState.year = state.span.to;
    range.value = mapState.year;
    renderMap();
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
    document.querySelectorAll('.app-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        var tab = b.getAttribute('data-tab');
        document.querySelectorAll('.app-tab').forEach(function (x) {
          var on = x === b;
          x.classList.toggle('active', on);
          x.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.getElementById('view-timeline').hidden = tab !== 'timeline';
        document.getElementById('view-ideamap').hidden = tab !== 'ideamap';
        document.querySelector('.era-bar').style.display = tab === 'timeline' ? '' : 'none';
        document.querySelector('.controls').style.display = tab === 'timeline' ? '' : 'none';
        stopMapPlay();
        if (tab === 'ideamap') renderMap();
      });
    });
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
    initMap();
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
