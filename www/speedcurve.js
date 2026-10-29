'use strict';
/* Naki speed curve: the graph behind Speed > Curve, the way CapCut has it. A curve is a list of points [[u, speed], ...]: u (0 to 1) is how far
   through the clip's own picture you are, speed (0.25 to 4) is how fast it plays there. Between points the speed changes smoothly (in steps of
   equal ratio, so 1x to 2x is as big a change as 1x to 0.5x). The project turns a curve into short pieces that each play at one speed, which both
   the preview and the export already know how to play. Pure maths, no page code. */
var NakiCurve = (function () {
  var MIN = 0.25, MAX = 4, MAXPTS = 12, GAP = 0.02;
  var PRESETS = [
    { key: 'montage', label: 'Montage', pts: [[0, 0.5], [0.25, 0.5], [0.4, 2.5], [0.6, 2.5], [0.75, 0.5], [1, 0.5]] },
    { key: 'hero', label: 'Hero', pts: [[0, 1], [0.2, 1], [0.35, 0.3], [0.6, 0.3], [0.8, 2.5], [1, 2.5]] },
    { key: 'bullet', label: 'Bullet', pts: [[0, 3], [0.3, 3], [0.5, 0.25], [0.8, 0.25], [1, 3]] },
    { key: 'jumpcut', label: 'Jump cut', pts: [[0, 0.4], [0.2, 0.4], [0.25, 3], [0.45, 3], [0.5, 0.4], [0.7, 0.4], [0.75, 3], [1, 3]] },
    { key: 'flashin', label: 'Flash in', pts: [[0, 0.3], [0.3, 3], [0.6, 1], [1, 1]] },
    { key: 'flashout', label: 'Flash out', pts: [[0, 1], [0.4, 1], [0.7, 3], [1, 0.3]] }
  ];
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function r3(x) { return Math.round(x * 1000) / 1000; }
  // Tidies a curve: sorted, inside range, starting at 0 and ending at 1, points not on top of each other, at most 12. Null when there is nothing to work with.
  function clean(pts) {
    if (!pts || pts.length < 2) return null;
    var a = pts.map(function (p) { return [clamp(+p[0], 0, 1), clamp(+p[1], MIN, MAX)]; }).filter(function (p) { return !isNaN(p[0]) && !isNaN(p[1]); });
    if (a.length < 2) return null;
    a.sort(function (x, y) { return x[0] - y[0]; });
    a[0][0] = 0; a[a.length - 1][0] = 1;
    var out = [a[0]];
    for (var i = 1; i < a.length - 1; i++) if (a[i][0] - out[out.length - 1][0] >= GAP && 1 - a[i][0] >= GAP) out.push(a[i]);
    out.push(a[a.length - 1]);
    while (out.length > MAXPTS) {   // too many: drop the point that sits closest to its neighbour
      var k = 1, best = 9;
      for (var j = 1; j < out.length - 1; j++) { var g = out[j + 1][0] - out[j - 1][0]; if (g < best) { best = g; k = j; } }
      out.splice(k, 1);
    }
    return out.map(function (p) { return [r3(p[0]), r3(p[1])]; });
  }
  // The speed at u (0 to 1).
  function valueAt(pts, u) {
    if (u <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) if (u <= pts[i][0]) {
      var a = pts[i - 1], b = pts[i], f = b[0] === a[0] ? 1 : (u - a[0]) / (b[0] - a[0]);
      return Math.exp(Math.log(a[1]) + (Math.log(b[1]) - Math.log(a[1])) * f);
    }
    return pts[pts.length - 1][1];
  }
  // The one speed that takes as long, over u0 to u1, as the curve does (the harmonic mean: slow moments count for more).
  function harmonic(pts, u0, u1) {
    var K = 12, inv = 0;
    for (var i = 0; i < K; i++) inv += 1 / valueAt(pts, u0 + (u1 - u0) * (i + 0.5) / K);
    return clamp(K / inv, MIN, MAX);
  }
  // How long the whole thing takes compared with playing it at 1x (below 1: shorter).
  function outputFactor(pts) { return 1 / harmonic(pts, 0, 1); }
  var api = { MIN: MIN, MAX: MAX, MAXPTS: MAXPTS, GAP: GAP, PRESETS: PRESETS, clean: clean, valueAt: valueAt, harmonic: harmonic, outputFactor: outputFactor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiCurve = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['speedcurve.js'] = 'curve'; }
  return api;
})();
