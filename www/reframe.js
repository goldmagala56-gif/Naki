'use strict';
/* Naki auto reframe: finds where the action is in a video, so a clip can be cropped to another shape
   (landscape to tall, say) with the moving part kept in view.

   This is a simple watcher, not a face or person detector: it looks at what MOVES between two nearby pictures
   and, when nothing moves, at where the most detail is. It works well for one person or one moving subject.
   A real detector can replace analyzeVideo() later: project.js only needs a track = [{ ms, x, y }] (x, y = where
   the subject is, as fractions 0 to 1 of the picture, at that moment of the movie FILE).

   frameCenter / smoothTrack / trackAt / ratioOf are pure (tested in node). analyzeVideo needs a browser. */
var NakiReframe = (function () {
  var MOVE_THR = 18, DETAIL_THR = 14;

  function ratioOf(key) {
    var p = String(key).split(':'), a = +p[0], b = +p[1];
    return (a > 0 && b > 0) ? [a, b] : null;
  }

  // The middle of the weighted pixels of a w x h map, as fractions; null when the map is empty.
  function centroid(map, w, h) {
    var m = 0, sx = 0, sy = 0;
    for (var y = 0; y < h; y++) {
      var row = y * w;
      for (var x = 0; x < w; x++) { var v = map[row + x]; if (v > 0) { m += v; sx += v * x; sy += v * y; } }
    }
    return m > 0 ? { x: (sx / m + 0.5) / w, y: (sy / m + 0.5) / h } : null;
  }

  // prev, cur = grey pictures (arrays of 0..255, w x h). Returns { x, y, conf, kind } or null when there is nothing to follow.
  function frameCenter(prev, cur, w, h) {
    var n = w * h, mot = new Float32Array(n), changed = 0, i;
    for (i = 0; i < n; i++) { var d = Math.abs(cur[i] - prev[i]) - MOVE_THR; if (d > 0) { mot[i] = d; changed++; } }
    if (changed / n >= 0.004) {
      var c = centroid(mot, w, h);
      if (c) return { x: c.x, y: c.y, conf: Math.min(1, changed / n / 0.04), kind: 'motion' };
    }
    var det = new Float32Array(n), edges = 0;
    for (var y = 0; y < h - 1; y++) for (var x = 0; x < w - 1; x++) {
      i = y * w + x;
      var g = Math.abs(cur[i] - cur[i + 1]) + Math.abs(cur[i] - cur[i + w]) - DETAIL_THR;
      if (g > 0) { det[i] = g; edges++; }
    }
    if (edges / n >= 0.02) { var c2 = centroid(det, w, h); if (c2) return { x: c2.x, y: c2.y, conf: 0.3, kind: 'detail' }; }
    return null;
  }

  function median3(a) {
    return a.map(function (v, i) {
      var x = a[Math.max(0, i - 1)], z = a[Math.min(a.length - 1, i + 1)];
      return Math.max(Math.min(x, v), Math.min(Math.max(x, v), z));
    });
  }
  // Smooths forwards and backwards, so the result lags behind nothing.
  function ema2(a, alpha) {
    var f = [], b = [], i;
    for (i = 0; i < a.length; i++) f[i] = i ? f[i - 1] + alpha * (a[i] - f[i - 1]) : a[i];
    for (i = a.length - 1; i >= 0; i--) b[i] = i < a.length - 1 ? b[i + 1] + alpha * (a[i] - b[i + 1]) : a[i];
    return a.map(function (_, k) { return (f[k] + b[k]) / 2; });
  }
  // raw = [{ ms, x, y, w }] (w = how sure). Moments with no clear subject borrow from their neighbours; spikes are removed; the path is smoothed.
  function smoothTrack(points, o) {
    o = o || {};
    var minConf = o.minConf != null ? o.minConf : 0.12, alpha = o.alpha != null ? o.alpha : 0.45;
    var pts = (points || []).filter(function (p) { return p && isFinite(p.ms); }).sort(function (a, b) { return a.ms - b.ms; });
    if (!pts.length) return [];
    var good = pts.filter(function (p) { return p.w >= minConf; });
    if (!good.length) return pts.map(function (p) { return { ms: p.ms, x: 0.5, y: 0.5 }; });
    var filled = pts.map(function (p) {
      if (p.w >= minConf) return { ms: p.ms, x: p.x, y: p.y };
      var a = null, b = null;
      for (var i = 0; i < good.length; i++) { if (good[i].ms <= p.ms) a = good[i]; if (good[i].ms > p.ms) { b = good[i]; break; } }
      if (a && b) { var f = (p.ms - a.ms) / (b.ms - a.ms); return { ms: p.ms, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; }
      var e = a || b; return { ms: p.ms, x: e.x, y: e.y };
    });
    var xs = ema2(median3(filled.map(function (p) { return p.x; })), alpha), ys = ema2(median3(filled.map(function (p) { return p.y; })), alpha);
    return filled.map(function (p, i) { return { ms: p.ms, x: xs[i], y: ys[i] }; });
  }
  // Where the subject is at ms (straight line between the two nearest points).
  function trackAt(track, ms) {
    var n = track.length;
    if (!n) return { x: 0.5, y: 0.5 };
    if (ms <= track[0].ms) return track[0];
    if (ms >= track[n - 1].ms) return track[n - 1];
    for (var i = 1; i < n; i++) if (ms <= track[i].ms) {
      var a = track[i - 1], b = track[i], f = b.ms === a.ms ? 0 : (ms - a.ms) / (b.ms - a.ms);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    return track[n - 1];
  }

  // Watches the part of a video file from fromMs to toMs (a second, hidden video, so the editor is not disturbed) and says where the action is.
  // Up to 80 moments, each looked at twice (120 ms apart). Resolves to raw points for smoothTrack(). o: { onProgress(0..1), isCancelled(), maxSamples }
  async function analyzeVideo(url, fromMs, toMs, o) {
    o = o || {};
    var v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.setAttribute('playsinline', ''); v.src = url;
    await new Promise(function (res, rej) { v.onloadedmetadata = res; v.onerror = function () { rej(new Error('Naki cannot read this video.')); }; });
    var vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) throw new Error('This video has no picture that Naki can read.');
    var W = 96, H = Math.max(8, Math.round(W * vh / vw)), cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d', { willReadFrequently: true });
    function seek(ms) {
      return new Promise(function (res) {
        var target = Math.max(0, Math.min((isFinite(v.duration) ? v.duration : 1e9) - 0.05, ms / 1000));
        if (Math.abs(v.currentTime - target) < 0.001 && v.readyState >= 2) return res();
        var to = setTimeout(done, 4000);
        function done() { clearTimeout(to); v.removeEventListener('seeked', done); res(); }
        v.addEventListener('seeked', done); v.currentTime = target;
      });
    }
    function grab() {
      g.drawImage(v, 0, 0, W, H);
      var d = g.getImageData(0, 0, W, H).data, a = new Uint8Array(W * H);
      for (var i = 0, j = 0; i < a.length; i++, j += 4) a[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
      return a;
    }
    var span = Math.max(1, toMs - fromMs), n = Math.max(2, Math.min(o.maxSamples || 80, Math.floor(span / 300))), step = span / n, out = [];
    try {
      for (var k = 0; k < n; k++) {
        if (o.isCancelled && o.isCancelled()) throw new Error('Cancelled');
        var t = fromMs + k * step;
        await seek(t); var a = grab();
        await seek(t + 120); var b = grab();
        var c = frameCenter(a, b, W, H);
        out.push({ ms: Math.round(t + 60), x: c ? c.x : 0.5, y: c ? c.y : 0.5, w: c ? c.conf : 0 });
        if (o.onProgress) o.onProgress((k + 1) / n);
      }
    } finally { try { v.removeAttribute('src'); v.load(); } catch (e) {} }
    return out;
  }

  var api = { ratioOf: ratioOf, frameCenter: frameCenter, smoothTrack: smoothTrack, trackAt: trackAt, analyzeVideo: analyzeVideo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiReframe = api;
  return api;
})();

// Which version of this file is running (the Home screen lists these, so a stale copy is easy to spot).
if (typeof window !== 'undefined') { window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['reframe.js'] = 'reframe'; }