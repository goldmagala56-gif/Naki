'use strict';
/* Naki auto speed ramps: ready-made speed curves (points are [position 0..1, speed 0.25..4], see speedcurve.js). */
var NakiRamp = (function () {
  var PRESETS = [
    { key: 'smooth', label: 'Ease in/out', pts: [[0, 0.5], [0.3, 1], [0.7, 1], [1, 0.5]] },
    { key: 'hero', label: 'Hero time', pts: [[0, 1.6], [0.3, 1], [0.5, 0.35], [0.7, 1], [1, 1.6]] },
    { key: 'launch', label: 'Slow, then fast', pts: [[0, 0.35], [0.4, 0.6], [0.7, 2], [1, 3]] },
    { key: 'brake', label: 'Fast, then slow', pts: [[0, 3], [0.3, 2], [0.6, 0.6], [1, 0.35]] },
    { key: 'pulse', label: 'Pulse', pts: [[0, 1], [0.2, 2.5], [0.4, 0.5], [0.6, 2.5], [0.8, 0.5], [1, 1]] }
  ];
  function points(key) { var p = PRESETS.filter(function (x) { return x.key === key; })[0]; return p ? p.pts.map(function (q) { return q.slice(); }) : null; }
  // Which preset "Auto" uses for clip i of n (durMs = its length): the first speeds up, the last slows down, short clips stay gentle.
  function auto(i, n, durMs) {
    if (durMs < 1500) return 'smooth';
    if (n <= 1) return durMs >= 4000 ? 'hero' : 'smooth';
    if (i === 0) return 'launch';
    if (i === n - 1) return 'brake';
    return i % 2 ? 'smooth' : 'hero';
  }
  var api = { PRESETS: PRESETS, points: points, auto: auto };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiRamp = api;
  return api;
})();