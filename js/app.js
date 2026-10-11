/* Religions Timeline — v1
 * Static, no build step. Data: one JSON file per tradition (data/*.json),
 * a texts registry (data/texts.json), and an index (data/index.json).
 * Adding a tradition/text/idea never requires code changes.
 */
(function () {
  'use strict';

  var W = 1120, LABEL_W = 190, PAD_R = 30, TOP = 46, TRACK_H = 86;
  var state = { view: 'texts', idea: 'all', query: '', selected: null };
  var traditions = [];   // {id,name,region,color,events:[...]}
  var texts = {};        // text_id -> registry entry
  var ideaColors = {};

  var palette = d3.schemeTableau10;

  function bce(y) { return y + ' BCE'; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadData() {
    return fetch('data/index.json').then(function (r) { return r.json(); })
      .then(function (index) {
        state.span = index.timespan;
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

  function render() {
    var ideas = allIdeas();
    ideas.forEach(function (idea, i) { if (!ideaColors[idea]) ideaColors[idea] = palette[i % palette.length]; });

    var H = TOP + traditions.length * TRACK_H + 30;
    var x = d3.scaleLinear()
      .domain([state.span.from, state.span.to])
      .range([LABEL_W, W - PAD_R]);

    d3.select('#timeline').selectAll('*').remove();
    var svg = d3.select('#timeline').append('svg')
      .attr('viewBox', '0 0 ' + W + ' ' + H)
      .attr('role', 'img')
      .attr('aria-label', 'Timeline of religious traditions, 2600 to 500 BCE');

    // gridlines + axis
    var ticks = d3.range(state.span.from, state.span.to - 1, -200);
    var grid = svg.append('g').attr('class', 'grid');
    ticks.forEach(function (t) {
      grid.append('line')
        .attr('x1', x(t)).attr('x2', x(t))
        .attr('y1', TOP - 8).attr('y2', H - 20);
    });
    var axis = svg.append('g').attr('class', 'axis')
      .attr('transform', 'translate(0,' + (TOP - 14) + ')')
      .call(d3.axisTop(x).tickValues(ticks).tickFormat(bce));
    axis.select('.domain').remove();

    // idea links (under the bars)
    var showLines = state.view !== 'texts';
    var linkLayer = svg.append('g');
    var barLayer = svg.append('g');

    var visibleIdeas = state.idea === 'all' ? ideas : [state.idea];
    if (showLines) {
      visibleIdeas.forEach(function (idea) {
        var pts = [];
        traditions.forEach(function (tr, ti) {
          tr.events.forEach(function (e) {
            if (e.ideas.indexOf(idea) !== -1 && eventMatches(e)) {
              pts.push({ x: x((e.year_from + e.year_to) / 2), y: TOP + ti * TRACK_H + TRACK_H / 2, e: e, tr: tr });
            }
          });
        });
        if (pts.length >= 2) {
          pts.sort(function (a, b) { return b.x - a.x; });
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
      svg.append('line')
        .attr('x1', LABEL_W).attr('x2', W - PAD_R)
        .attr('y1', cy).attr('y2', cy)
        .attr('stroke', tr.color).attr('stroke-width', 2).attr('opacity', 0.25);
      svg.append('text').attr('class', 'track-label')
        .attr('x', 12).attr('y', cy - 4).text(tr.name);
      svg.append('text').attr('class', 'track-sub')
        .attr('x', 12).attr('y', cy + 13).text(tr.region);

      tr.events.forEach(function (e) {
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
          .append('title').text(e.title + ' (' + bce(e.year_from) + '–' + bce(e.year_to) + ', ' + e.certainty + ')');
        if (bw > 110) {
          g.append('text')
            .attr('x', x1 + 8).attr('y', cy + 4)
            .text(e.title.length > 26 ? e.title.slice(0, 25) + '…' : e.title);
        }
      });
    });

    renderLegend(ideas);
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

  function selectEvent(e, tr) {
    state.selected = e;
    var reg = texts[e.text_id] || {};
    var range = bce(e.year_from) + ' – ' + bce(e.year_to);
    var panel = document.getElementById('detail');
    panel.innerHTML =
      '<h2>' + esc(e.title) + '</h2>' +
      '<div class="trad">' + esc(tr.name) + ' · ' + esc(tr.region) + '</div>' +
      '<div class="dates">' + esc(range) +
        '<span class="certainty ' + esc(e.certainty) + '">' + esc(e.certainty) + '</span></div>' +
      '<p>' + esc(e.description) + '</p>' +
      (reg.date_range && reg.date_range.note ? '<p><em>Dating note:</em> ' + esc(reg.date_range.note) + '</p>' : '') +
      '<div class="tags">' + e.ideas.map(function (i) {
        return '<span class="tag" data-idea="' + esc(i) + '">' + esc(i) + '</span>';
      }).join('') + '</div>' +
      '<div class="src"><strong>Source:</strong> ' + esc(reg.source_label || '—') + '<br>' +
        (reg.source_url ? '<a href="' + esc(reg.source_url) + '" target="_blank" rel="noopener">About this text ↗</a>' : '') +
      '</div>' +
      (reg.content ? '<a class="read" href="' + esc(reg.content.url) + '" target="_blank" rel="noopener">' +
        esc(reg.content.label || 'Read the text') + ' ↗</a>' : '');
    panel.querySelectorAll('.tag').forEach(function (el) {
      el.addEventListener('click', function () {
        state.idea = el.getAttribute('data-idea');
        if (state.view === 'texts') setView('both');
        document.getElementById('idea-filter').value = state.idea;
        render();
      });
    });
  }

  function setView(v) {
    state.view = v;
    document.querySelectorAll('.view-toggle button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === v);
    });
  }

  function initControls() {
    document.querySelectorAll('.view-toggle button').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view')); render(); });
    });
    document.getElementById('search').addEventListener('input', function (ev) {
      state.query = ev.target.value; render();
    });
    document.getElementById('idea-filter').addEventListener('change', function (ev) {
      state.idea = ev.target.value; render();
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
  }).catch(function (err) {
    document.getElementById('timeline').innerHTML =
      '<p style="padding:20px">Could not load timeline data: ' + esc(err.message) +
      '. Serve this folder over HTTP (e.g. <code>python3 -m http.server</code>) rather than file://.</p>';
  });
})();
