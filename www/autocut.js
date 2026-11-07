'use strict';
/* Naki auto cut: finds where the picture changes scene, so a clip can be cut there. */
var NakiAutoCut = (function () {
  var SENS = { low: 0.30, medium: 0.20, high: 0.12 };
  var SENS_LIST = [{ key: 'low', label: 'Big changes only' }, { key: 'medium', label: 'Balanced' }, { key: 'high', label: 'Every change' }];
  var W = 32, H = 18;

  function diff(a, b) { var n = Math.min(a.length, b.length), s = 0; for (var i = 0; i < n; i++) s += Math.abs(a[i] - b[i]); return n ? s / (n * 255) : 0; }

  // samples = [{ ms, px }] in order (px = small grey picture). Returns the times (ms) where the scene changes.
  function detect(samples, o) {
    o = o || {};
    var thr = o.threshold != null ? o.threshold : (SENS[o.sensitivity] || SENS.medium), minMs = o.minMs || 1000, max = o.max || 60, d = [], cand = [], i, j;
    for (i = 1; i < samples.length; i++) d.push(diff(samples[i - 1].px, samples[i].px));
    for (i = 0; i < d.length; i++) {
      var sum = 0, cnt = 0;
      for (j = Math.max(0, i - 3); j < i; j++) { sum += d[j]; cnt++; }
      var local = cnt ? sum / cnt : 0;   // a big jump on top of lots of motion is not a cut
      if (d[i] >= thr && d[i] >= local * 2.5) cand.push({ i: i, score: d[i] });
    }
    // the change happened between sample i and i+1 (d[i] compares samples i and i+1)
    cand = cand.map(function (c) { return { ms: Math.round((samples[c.i].ms + samples[c.i + 1].ms) / 2), score: c.score }; });
    cand.sort(function (a, b) { return b.score - a.score; });
    var keep = [];
    cand.forEach(function (c) { if (keep.length < max && keep.every(function (k) { return Math.abs(k.ms - c.ms) >= minMs; })) keep.push(c); });
    return keep.map(function (k) { return k.ms; }).sort(function (a, b) { return a - b; });
  }

  function gray(data) {
    var out = new Uint8Array(data.length / 4);
    for (var i = 0, j = 0; i < data.length; i += 4, j++) out[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    return out;
  }

  function seekTo(v, ms) {
    return new Promise(function (res, rej) {
      if (Math.abs(v.currentTime - ms / 1000) < 0.001) return res();
      var done = false, tm = setTimeout(function () { if (!done) { done = true; v.removeEventListener('seeked', h); rej(new Error('the video did not seek')); } }, 6000);
      function h() { if (done) return; done = true; clearTimeout(tm); v.removeEventListener('seeked', h); res(); }
      v.addEventListener('seeked', h); v.currentTime = ms / 1000;
    });
  }

  // Looks at the video file from fromMs to toMs (about 4 pictures a second, never more than ~500 in all). Returns [{ ms, px }].
  async function analyzeVideo(url, fromMs, toMs, o) {
    o = o || {};
    var v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.setAttribute('playsinline', '');
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d', { willReadFrequently: true }), out = [];
    await new Promise(function (res, rej) { v.onloadeddata = res; v.onerror = function () { rej(new Error('this video cannot be read')); }; v.src = url; v.load(); });
    try {
      var span = Math.max(1, toMs - fromMs), step = Math.max(o.stepMs || 250, span / (o.maxSamples || 500)), n = Math.floor(span / step) + 1;
      for (var i = 0; i < n; i++) {
        if (o.isCancelled && o.isCancelled()) { var ce = new Error('cancelled'); ce.cancelled = true; throw ce; }
        var ms = Math.min(toMs, fromMs + i * step);
        await seekTo(v, ms);
        g.drawImage(v, 0, 0, W, H);
        out.push({ ms: Math.round(ms), px: gray(g.getImageData(0, 0, W, H).data) });
        if (o.onProgress) o.onProgress((i + 1) / n);
      }
    } finally { v.removeAttribute('src'); try { v.load(); } catch (e) {} }
    return out;
  }

  var api = { detect: detect, analyzeVideo: analyzeVideo, SENS_LIST: SENS_LIST, diff: diff };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiAutoCut = api;
  return api;
})();