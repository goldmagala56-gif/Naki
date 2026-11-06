'use strict';
/* Naki timeline markers (flags on the ruler). Pure functions on a project object: every change returns a NEW project
   (or the same one when nothing changed), so they work with the editor's undo history exactly like the P.* functions.
   A marker is { id, t (ms on the timeline), name, color }. Stored in project.markers. */
var NakiMarkers = (function () {
  var MAX = 300, NEAR_MS = 60;
  var COLORS = [
    { key: 'red', label: 'Red', css: '#ff4d4f' }, { key: 'orange', label: 'Orange', css: '#ff9f1c' }, { key: 'yellow', label: 'Yellow', css: '#ffd23f' },
    { key: 'green', label: 'Green', css: '#41d99b' }, { key: 'blue', label: 'Blue', css: '#4da3ff' }, { key: 'purple', label: 'Purple', css: '#a77bff' },
    { key: 'pink', label: 'Pink', css: '#ff6fb5' }
  ];
  function colorKnown(k) { return COLORS.some(function (c) { return c.key === k; }); }
  function colorCss(k) { for (var i = 0; i < COLORS.length; i++) if (COLORS[i].key === k) return COLORS[i].css; return COLORS[0].css; }
  function cleanName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 40); }
  function byTime(a, b) { return a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }
  // All markers, in time order. Anything malformed in a saved project is ignored.
  function list(p) {
    var a = p && Array.isArray(p.markers) ? p.markers : [];
    return a.filter(function (m) { return m && m.id && isFinite(m.t); }).sort(byTime);
  }
  function times(p) { return list(p).map(function (m) { return m.t; }); }
  function withList(p, arr) { return Object.assign({}, p, { markers: arr }); }
  function clampT(p, t) { var d = (p && p.durationMs) || 0, v = Math.max(0, Math.round(t)); return d > 0 ? Math.min(v, d) : v; }
  function nextId(p) {
    var n = 0; list(p).forEach(function (m) { var k = +String(m.id).replace(/^mk/, ''); if (k > n) n = k; });
    return 'mk' + (n + 1);
  }
  // The marker at time t (within tol ms), or null.
  function at(p, t, tol) {
    tol = tol == null ? NEAR_MS : tol; var best = null, bd = tol + 1;
    list(p).forEach(function (m) { var d = Math.abs(m.t - t); if (d <= tol && d < bd) { best = m; bd = d; } });
    return best;
  }
  // Adds a marker at t. If one is already there, nothing is added and out.id / out.exists say which. out.full when there are too many.
  function add(p, t, opts, out) {
    out = out || {}; opts = opts || {};
    var tt = clampT(p, t), ex = at(p, tt);
    if (ex) { out.id = ex.id; out.exists = true; return p; }
    if (list(p).length >= MAX) { out.full = true; return p; }
    var id = nextId(p), m = { id: id, t: tt, name: cleanName(opts.name), color: colorKnown(opts.color) ? opts.color : 'red' };
    out.id = id;
    return withList(p, list(p).concat([m]));
  }
  function update(p, id, patch) {
    patch = patch || {}; var changed = false;
    var next = list(p).map(function (m) {
      if (m.id !== id) return m;
      var n = Object.assign({}, m);
      if ('name' in patch) n.name = cleanName(patch.name);
      if ('color' in patch && colorKnown(patch.color)) n.color = patch.color;
      if ('t' in patch) n.t = clampT(p, patch.t);
      if (n.name !== m.name || n.color !== m.color || n.t !== m.t) { changed = true; return n; }
      return m;
    });
    return changed ? withList(p, next) : p;
  }
  function remove(p, id) {
    var l = list(p), next = l.filter(function (m) { return m.id !== id; });
    return next.length === l.length ? p : withList(p, next);
  }
  function clear(p) { return list(p).length ? withList(p, []) : p; }
  // The next (dir 1) or previous (dir -1) marker from time t, or null.
  function neighbour(p, t, dir) {
    var l = list(p), i;
    if (dir > 0) { for (i = 0; i < l.length; i++) if (l[i].t > t + 1) return l[i]; }
    else { for (i = l.length - 1; i >= 0; i--) if (l[i].t < t - 1) return l[i]; }
    return null;
  }
  return { MAX: MAX, COLORS: COLORS, colorCss: colorCss, list: list, times: times, at: at, add: add, update: update, remove: remove, clear: clear, neighbour: neighbour };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NakiMarkers;
if (typeof window !== 'undefined') { window.NakiMarkers = NakiMarkers; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['markers.js'] = 'markers'; }