'use strict';
/* Naki sound effects: a few effects made by code (no files to download), as mono sound at any sample rate, plus a WAV writer so an effect can be
   kept like any other audio file and used by the preview and by both export engines. The same numbers always make the same sound. */
var NakiSfx = (function () {
  var LIST = [
    { key: 'whoosh', label: 'Whoosh', durMs: 700 }, { key: 'swipe', label: 'Swipe', durMs: 350 }, { key: 'pop', label: 'Pop', durMs: 220 },
    { key: 'click', label: 'Click', durMs: 120 }, { key: 'ding', label: 'Ding', durMs: 1500 }, { key: 'coin', label: 'Coin', durMs: 650 },
    { key: 'laser', label: 'Laser', durMs: 500 }, { key: 'boom', label: 'Boom', durMs: 1400 }, { key: 'riser', label: 'Riser', durMs: 2500 },
    { key: 'drop', label: 'Drop', durMs: 900 }
  ];
  function find(key) { for (var i = 0; i < LIST.length; i++) if (LIST[i].key === key) return LIST[i]; return null; }
  function rng(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2147483648 - 1; }; }
  function lp(fc, sr) { return 1 - Math.exp(-2 * Math.PI * Math.max(20, fc) / sr); }   // one-pole low-pass coefficient
  var TAU = 2 * Math.PI;

  // Each effect fills out[i] from the time t (seconds) and the progress u (0 to 1). They keep their own little state (a filter, a phase).
  var MAKERS = {
    whoosh: function (sr, n, rnd) { var y = 0; return function (i, t, u) { var bell = Math.sin(Math.PI * u); y += lp(300 + 3700 * bell, sr) * (rnd() - y); return y * bell * bell * 2.2; }; },
    swipe: function (sr, n, rnd) { var y = 0; return function (i, t, u) { var bell = Math.sin(Math.PI * u); y += lp(800 + 5200 * u, sr) * (rnd() - y); return y * bell * 2; }; },
    pop: function (sr) { var ph = 0; return function (i, t) { ph += TAU * (250 + 650 * Math.exp(-t * 40)) / sr; return Math.sin(ph) * Math.exp(-t * 28); }; },
    click: function (sr, n, rnd) { var y = 0; return function (i, t) { var x = rnd(); y += lp(3000, sr) * (x - y); return (x - y) * Math.exp(-t * 300); }; },
    ding: function (sr) { return function (i, t) { return (Math.sin(TAU * 880 * t) * Math.exp(-t * 3) + 0.45 * Math.sin(TAU * 1320 * t) * Math.exp(-t * 4) + 0.2 * Math.sin(TAU * 2640 * t) * Math.exp(-t * 7)) * 0.7; }; },
    coin: function (sr) { return function (i, t) { var f = t < 0.1 ? 988 : 1319, tt = t < 0.1 ? t : t - 0.1; return Math.sin(TAU * f * t) * Math.exp(-tt * (t < 0.1 ? 4 : 7)) * 0.8; }; },
    laser: function (sr) { var ph = 0; return function (i, t, u) { ph += TAU * (2000 * Math.exp(-u * 2.3)) / sr; return Math.sin(ph) * (1 - u) * 0.8; }; },
    boom: function (sr, n, rnd) { var ph = 0, y = 0; return function (i, t) { ph += TAU * (30 + 45 * Math.exp(-t * 5)) / sr; y += lp(400, sr) * (rnd() - y); return (Math.sin(ph) * Math.exp(-t * 2.8) + y * Math.exp(-t * 14) * 1.5) * 0.9; }; },
    riser: function (sr, n, rnd) { var ph = 0, y = 0; return function (i, t, u) { ph += TAU * (200 + 1000 * u * u) / sr; y += lp(200 + 5800 * u, sr) * (rnd() - y); return (0.5 * Math.sin(ph) + y) * u * u; }; },
    drop: function (sr) { var ph = 0; return function (i, t, u) { ph += TAU * (60 + 540 * Math.exp(-u * 4.5)) / sr; return Math.sin(ph) * (1 - u) * 0.9; }; }
  };

  // The effect as mono samples (Float32Array, loudest sample 0.85), or null for an unknown name.
  function render(key, sr) {
    var def = find(key); if (!def) return null;
    sr = sr || 48000;
    var n = Math.round(def.durMs * sr / 1000), out = new Float32Array(n), f = MAKERS[key](sr, n, rng(12345)), peak = 0, i;
    for (i = 0; i < n; i++) { var v = f(i, i / sr, i / n); out[i] = v; if (Math.abs(v) > peak) peak = Math.abs(v); }
    var k = peak > 0 ? 0.85 / peak : 0, rin = Math.max(1, Math.round(sr * 0.001)), rout = Math.max(1, Math.round(sr * 0.004));   // a 1 ms fade in and a 4 ms fade out, so it never clicks
    for (i = 0; i < n; i++) { var g = Math.min(1, i / rin, (n - 1 - i) / rout); out[i] = out[i] * k * g; }
    peak = 0; for (i = 0; i < n; i++) if (Math.abs(out[i]) > peak) peak = Math.abs(out[i]);
    if (peak > 0) for (i = 0; i < n; i++) out[i] *= 0.85 / peak;   // the fades can only have lowered the loudest sample: bring it back to 0.85
    return out;
  }
  // 16-bit mono WAV file bytes.
  function toWav(samples, sr) {
    sr = sr || 48000;
    var n = samples.length, bytes = new Uint8Array(44 + n * 2), v = new DataView(bytes.buffer);
    function str(o, s) { for (var i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), true);
    return bytes;
  }
  var api = { LIST: LIST, find: find, render: render, toWav: toWav };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiSfx = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['sfx.js'] = 'sound'; }
  return api;
})();
