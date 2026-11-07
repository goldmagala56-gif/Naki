'use strict';
/* Naki scopes: histogram, waveform and RGB parade, worked out from one small picture (RGBA bytes from a canvas).
   analyze() does the counting, the draw functions paint it on a canvas. Pure, so it is tested without a browser. */
var NakiScopes = (function () {
  function bin(v) { v = Math.round(v); return v < 0 ? 0 : v > 255 ? 255 : v; }
  // data = RGBA bytes, w x h pixels. hist: 256 counts per channel (and luma). wave: for every column, 256 counts of how many pixels have each level.
  function analyze(data, w, h) {
    var hist = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), l: new Uint32Array(256) };
    var wave = { l: new Uint16Array(w * 256), r: new Uint16Array(w * 256), g: new Uint16Array(w * 256), b: new Uint16Array(w * 256) };
    var x, y, i, r, g, b, l;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = (y * w + x) * 4; r = data[i]; g = data[i + 1]; b = data[i + 2]; l = bin(0.2126 * r + 0.7152 * g + 0.0722 * b);
      hist.r[r]++; hist.g[g]++; hist.b[b]++; hist.l[l]++;
      wave.l[x * 256 + l]++; wave.r[x * 256 + r]++; wave.g[x * 256 + g]++; wave.b[x * 256 + b]++;
    }
    return { w: w, h: h, hist: hist, wave: wave };
  }
  function grid(g, W, H) {
    g.fillStyle = '#0f1820'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1; g.beginPath();
    [0.25, 0.5, 0.75].forEach(function (f) { g.moveTo(0, Math.round(H * f) + 0.5); g.lineTo(W, Math.round(H * f) + 0.5); });
    g.stroke();
  }
  // Histogram: how many pixels at each level, red, green and blue added together, and the brightness as a white line.
  function drawHistogram(g, a, W, H) {
    grid(g, W, H);
    var chans = [['r', 'rgba(255,60,60,0.75)'], ['g', 'rgba(60,220,90,0.75)'], ['b', 'rgba(70,120,255,0.75)']], max = 1, k, i;
    ['r', 'g', 'b', 'l'].forEach(function (c) { for (i = 1; i < 255; i++) if (a.hist[c][i] > max) max = a.hist[c][i]; });   // the two ends can be huge (pure black or white): they do not set the height
    g.save(); g.globalCompositeOperation = 'lighter';
    chans.forEach(function (ch) {
      g.fillStyle = ch[1];
      for (i = 0; i < 256; i++) { var v = Math.min(1, Math.sqrt(a.hist[ch[0]][i] / max)), bh = v * (H - 4); if (bh > 0.5) g.fillRect(i / 256 * W, H - bh, Math.max(1, W / 256), bh); }
    });
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5; g.beginPath();
    for (i = 0; i < 256; i++) { var y = H - Math.min(1, Math.sqrt(a.hist.l[i] / max)) * (H - 4); if (i) g.lineTo((i + 0.5) / 256 * W, y); else g.moveTo(0.5 / 256 * W, y); }
    g.stroke();
  }
  // Waveform: left to right is the picture left to right, up is brighter. mode 'luma' = one panel, 'parade' = red, green and blue side by side.
  function drawWaveform(g, a, W, H, mode) {
    grid(g, W, H);
    var panels = mode === 'parade' ? [['r', '255,70,70'], ['g', '70,230,100'], ['b', '80,130,255']] : [['l', '150,255,170']], pw = W / panels.length, cw = pw / a.w, rowH = H / 256, gain = 6 / Math.max(1, a.h);
    g.save(); g.globalCompositeOperation = 'lighter';
    panels.forEach(function (pn, k) {
      var arr = a.wave[pn[0]];
      for (var x = 0; x < a.w; x++) for (var y = 0; y < 256; y++) {
        var c = arr[x * 256 + y]; if (!c) continue;
        g.fillStyle = 'rgba(' + pn[1] + ',' + Math.min(1, 0.12 + c * gain) + ')';
        g.fillRect(k * pw + x * cw, (255 - y) * rowH, cw + 0.6, Math.max(1, rowH));
      }
    });
    g.restore();
  }
  var api = { analyze: analyze, drawHistogram: drawHistogram, drawWaveform: drawWaveform };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiScopes = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['scopes.js'] = 'scopes'; }
  return api;
})();