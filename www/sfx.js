'use strict';
/* Naki sound effects: 50 effects made by code (no files to download), as mono sound at any sample rate, plus a WAV writer so an effect can be
   kept like any other audio file and used by the preview and by both export engines. The same numbers always make the same sound. */
var NakiSfx = (function () {
  var LIST = [
    // the first ten are the original effects, unchanged
    { key: 'whoosh', label: 'Whoosh', durMs: 700, cat: 'Motion' }, { key: 'swipe', label: 'Swipe', durMs: 350, cat: 'Motion' }, { key: 'pop', label: 'Pop', durMs: 220, cat: 'Fun' },
    { key: 'click', label: 'Click', durMs: 120, cat: 'Interface' }, { key: 'ding', label: 'Ding', durMs: 1500, cat: 'Interface' }, { key: 'coin', label: 'Coin', durMs: 650, cat: 'Fun' },
    { key: 'laser', label: 'Laser', durMs: 500, cat: 'Fun' }, { key: 'boom', label: 'Boom', durMs: 1400, cat: 'Impact' }, { key: 'riser', label: 'Riser', durMs: 2500, cat: 'Motion' },
    { key: 'drop', label: 'Drop', durMs: 900, cat: 'Motion' },
    // motion
    { key: 'sweep', label: 'Sweep up', durMs: 900, cat: 'Motion' }, { key: 'sweepdown', label: 'Sweep down', durMs: 900, cat: 'Motion' }, { key: 'zip', label: 'Zip', durMs: 260, cat: 'Motion' },
    { key: 'powerup', label: 'Power up', durMs: 800, cat: 'Motion' }, { key: 'powerdown', label: 'Power down', durMs: 900, cat: 'Motion' },
    // interface
    { key: 'blip', label: 'Blip', durMs: 140, cat: 'Interface' }, { key: 'beep', label: 'Beep', durMs: 300, cat: 'Interface' }, { key: 'notify', label: 'Notification', durMs: 600, cat: 'Interface' },
    { key: 'error', label: 'Error', durMs: 550, cat: 'Interface' }, { key: 'success', label: 'Success', durMs: 900, cat: 'Interface' }, { key: 'fail', label: 'Fail', durMs: 1200, cat: 'Interface' },
    { key: 'camera', label: 'Camera', durMs: 300, cat: 'Interface' }, { key: 'typing', label: 'Typing', durMs: 1200, cat: 'Interface' }, { key: 'phone', label: 'Phone ring', durMs: 1600, cat: 'Interface' },
    { key: 'doorbell', label: 'Doorbell', durMs: 1400, cat: 'Interface' }, { key: 'knock', label: 'Knock', durMs: 900, cat: 'Interface' },
    // drums and impact
    { key: 'kick', label: 'Kick', durMs: 400, cat: 'Drums' }, { key: 'snare', label: 'Snare', durMs: 300, cat: 'Drums' }, { key: 'hihat', label: 'Hi-hat', durMs: 150, cat: 'Drums' },
    { key: 'clap', label: 'Clap', durMs: 350, cat: 'Drums' }, { key: 'cymbal', label: 'Cymbal', durMs: 1800, cat: 'Drums' }, { key: 'tom', label: 'Tom', durMs: 500, cat: 'Drums' },
    { key: 'heartbeat', label: 'Heartbeat', durMs: 1400, cat: 'Impact' }, { key: 'explosion', label: 'Explosion', durMs: 2000, cat: 'Impact' }, { key: 'impact', label: 'Impact', durMs: 800, cat: 'Impact' },
    { key: 'punch', label: 'Punch', durMs: 200, cat: 'Impact' }, { key: 'stinger', label: 'Dramatic hit', durMs: 1500, cat: 'Impact' }, { key: 'footsteps', label: 'Footsteps', durMs: 1200, cat: 'Impact' },
    // bells and magic
    { key: 'bell', label: 'Bell', durMs: 2000, cat: 'Fun' }, { key: 'chime', label: 'Chime', durMs: 1500, cat: 'Fun' }, { key: 'glass', label: 'Glass', durMs: 900, cat: 'Fun' },
    { key: 'sparkle', label: 'Sparkle', durMs: 1200, cat: 'Fun' }, { key: 'tada', label: 'Ta-da', durMs: 1400, cat: 'Fun' }, { key: 'boing', label: 'Boing', durMs: 800, cat: 'Fun' },
    { key: 'scratch', label: 'Record scratch', durMs: 700, cat: 'Fun' }, { key: 'sword', label: 'Sword', durMs: 700, cat: 'Fun' }, { key: 'siren', label: 'Siren', durMs: 2500, cat: 'Fun' },
    // nature and crowd
    { key: 'wind', label: 'Wind', durMs: 3000, cat: 'Nature' }, { key: 'thunder', label: 'Thunder', durMs: 3000, cat: 'Nature' }, { key: 'applause', label: 'Applause', durMs: 3000, cat: 'Nature' }
  ];
  function find(key) { for (var i = 0; i < LIST.length; i++) if (LIST[i].key === key) return LIST[i]; return null; }
  function rng(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2147483648 - 1; }; }
  function lp(fc, sr) { return 1 - Math.exp(-2 * Math.PI * Math.max(20, fc) / sr); }   // one-pole low-pass coefficient
  var TAU = 2 * Math.PI;
  function lpf(sr) { var y = 0; return function (x, fc) { y += lp(fc, sr) * (x - y); return y; }; }   // a low-pass that remembers its own state
  function ex(t, k) { return Math.exp(-t * k); }
  function note(t, start, f, decay) { var l = t - start; return l < 0 ? 0 : Math.sin(TAU * f * l) * Math.exp(-l * decay); }   // a fading sine note that starts at zero, so it never clicks
  function gate(t, a, b, ramp) { return Math.max(0, Math.min(1, (t - a) / ramp, (b - t) / ramp)); }   // 1 between a and b, with short ramps
  function thump(l, f, k) { return l < 0 ? 0 : Math.sin(TAU * f * l) * Math.exp(-l * k); }
  function tadaNote(t, s, f, d) { return note(t, s, f, d) + 0.3 * note(t, s, 2 * f, d * 1.5); }
  function sq(x) { return Math.sin(x) > 0 ? 1 : -1; }

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
    drop: function (sr) { var ph = 0; return function (i, t, u) { ph += TAU * (60 + 540 * Math.exp(-u * 4.5)) / sr; return Math.sin(ph) * (1 - u) * 0.9; }; },

    // ---- motion ----
    sweep: function (sr, n, rnd) { var f = lpf(sr); return function (i, t, u) { return f(rnd(), 200 + 6000 * u * u) * Math.pow(u, 1.6) * Math.min(1, (1 - u) * 12) * 2; }; },
    sweepdown: function (sr, n, rnd) { var f = lpf(sr); return function (i, t, u) { return f(rnd(), 6200 - 6000 * u) * Math.pow(1 - u, 1.6) * Math.min(1, u * 40) * 2; }; },
    zip: function (sr, n, rnd) { var a = lpf(sr), b = lpf(sr); return function (i, t, u) { var x = rnd(); return (a(x, 1200 + 9000 * u) - b(x, 500 + 1500 * u)) * Math.sin(Math.PI * u) * 2.5; }; },
    powerup: function (sr) { var ph = 0, F = [330, 415, 523, 659, 831, 1047]; return function (i, t, u) { ph += TAU * F[Math.min(5, Math.floor(t / 0.07))] / sr; return (Math.sin(ph) + 0.25 * Math.sin(3 * ph) + 0.1 * Math.sin(5 * ph)) * (u < 0.6 ? 1 : (1 - u) / 0.4); }; },
    powerdown: function (sr) { var ph = 0; return function (i, t, u) { ph += TAU * (80 + 1100 * Math.exp(-u * 3.2)) / sr; return (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * (1 - u); }; },

    // ---- interface ----
    blip: function () { return function (i, t) { return (Math.sin(TAU * 1200 * t) + 0.3 * Math.sin(TAU * 3600 * t)) * ex(t, 22); }; },
    beep: function () { return function (i, t) { return Math.sin(TAU * 1000 * t) * gate(t, 0, 0.3, 0.004); }; },
    notify: function () { return function (i, t) { return note(t, 0, 880, 7) + note(t, 0.15, 1318, 6); }; },
    error: function () { return function (i, t) { return sq(TAU * 160 * t) * 0.5 * (gate(t, 0, 0.18, 0.006) + gate(t, 0.26, 0.5, 0.006)); }; },
    success: function () { return function (i, t) { return note(t, 0, 523, 5) + note(t, 0.1, 659, 5) + note(t, 0.2, 784, 5) + note(t, 0.3, 1047, 4); }; },
    fail: function (sr) { var ph = 0; return function (i, t, u) { ph += TAU * (380 - 230 * u) / sr; return (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * (1 - u) * (0.7 + 0.3 * Math.sin(TAU * 6 * t)); }; },
    camera: function (sr, n, rnd) { var f = lpf(sr); return function (i, t) { var x = rnd(), b = x - f(x, 4000), e = (t < 0.05 ? ex(t, 150) : 0) + (t >= 0.09 ? ex(t - 0.09, 90) : 0); return b * e + 0.3 * Math.sin(TAU * 200 * t) * ex(t, 60); }; },
    typing: function (sr, n, rnd) {
      var f = lpf(sr), ts = [], ps = [], k;
      for (k = 0; k < 9; k++) { ts.push(0.04 + k * 0.12 + rnd() * 0.02); ps.push(1700 + rnd() * 500); }
      return function (i, t) { var x = rnd(), b = x - f(x, 3500), s = 0; for (var j = 0; j < 9; j++) { var l = t - ts[j]; if (l >= 0 && l < 0.06) s += b * ex(l, 220) + 0.4 * Math.sin(TAU * ps[j] * l) * ex(l, 200); } return s; };
    },
    phone: function () { return function (i, t) { var g = gate(t, 0, 0.4, 0.005) + gate(t, 0.5, 0.9, 0.005) + gate(t, 1.0, 1.4, 0.005); return (Math.sin(TAU * 440 * t) + Math.sin(TAU * 480 * t)) * 0.5 * (0.6 + 0.4 * Math.sin(TAU * 20 * t)) * g; }; },
    doorbell: function () { return function (i, t) { return note(t, 0, 659, 3) + 0.3 * note(t, 0, 1318, 5) + note(t, 0.4, 523, 2.6) + 0.3 * note(t, 0.4, 1046, 4.5); }; },
    knock: function (sr, n, rnd) {
      var f = lpf(sr);
      return function (i, t) { var s = 0, nz = f(rnd(), 800); for (var k = 0; k < 3; k++) { var l = t - k * 0.22; if (l >= 0) { s += Math.sin(TAU * 150 * l) * ex(l, 35) + 0.5 * Math.sin(TAU * 390 * l) * ex(l, 60); if (l < 0.06) s += nz * ex(l, 80) * 0.8; } } return s; };
    },

    // ---- drums and impact ----
    kick: function (sr, n, rnd) { var ph = 0; return function (i, t) { ph += TAU * (45 + 130 * ex(t, 35)) / sr; return Math.sin(ph) * ex(t, 9) + 0.2 * rnd() * ex(t, 300); }; },
    snare: function (sr, n, rnd) { var f = lpf(sr); return function (i, t) { var x = rnd(); return Math.sin(TAU * 190 * t) * ex(t, 25) * 0.5 + (x - f(x, 2000)) * ex(t, 20); }; },
    hihat: function (sr, n, rnd) { var f = lpf(sr); return function (i, t) { var x = rnd(); return (x - f(x, 7000)) * ex(t, 50); }; },
    clap: function (sr, n, rnd) {
      var a = lpf(sr), b = lpf(sr);
      return function (i, t) { var x = rnd(), band = a(x, 3200) - b(x, 700), e = 0; for (var k = 0; k < 3; k++) { var l = t - k * 0.011; if (l >= 0 && l < 0.011) e = Math.max(e, ex(l, 150)); } if (t >= 0.033) e = Math.max(e, 0.7 * ex(t - 0.033, 14)); return band * e * 2; };
    },
    cymbal: function (sr, n, rnd) { var f = lpf(sr); return function (i, t) { var x = rnd(); return (x - f(x, 4000)) * ex(t, 2.6); }; },
    tom: function (sr) { var ph = 0; return function (i, t) { ph += TAU * (110 + 80 * ex(t, 14)) / sr; return Math.sin(ph) * ex(t, 7); }; },
    heartbeat: function () { return function (i, t) { var s = 0; for (var b = 0; b < 2; b++) { var o = b * 0.7; s += thump(t - o, 58, 14) + 0.7 * thump(t - o - 0.22, 50, 16); } return s; }; },
    explosion: function (sr, n, rnd) { var f = lpf(sr), ph = 0; return function (i, t) { var x = rnd(); ph += TAU * (28 + 30 * ex(t, 2)) / sr; return f(x, 80 + 3000 * ex(t, 3)) * ex(t, 2.2) * 2 + Math.sin(ph) * ex(t, 2.5) + x * ex(t, 40) * 0.5; }; },
    impact: function (sr, n, rnd) { var f = lpf(sr), ph = 0; return function (i, t) { ph += TAU * (80 + 60 * ex(t, 20)) / sr; return Math.sin(ph) * ex(t, 6) + f(rnd(), 1500) * ex(t, 30) * 1.6; }; },
    punch: function (sr, n, rnd) { var f = lpf(sr), ph = 0; return function (i, t) { ph += TAU * (70 + 180 * ex(t, 60)) / sr; return Math.sin(ph) * ex(t, 25) + f(rnd(), 2500) * ex(t, 90) * 0.8; }; },
    stinger: function (sr, n, rnd) { var ph = 0, f = lpf(sr); return function (i, t) { ph += TAU * (40 + 60 * ex(t, 6)) / sr; return Math.sin(ph) * ex(t, 3) + (note(t, 0, 220, 1.6) + note(t, 0, 233, 1.6) + 0.8 * note(t, 0, 311, 1.6)) * 0.35 + f(rnd(), 3000) * ex(t, 20); }; },
    footsteps: function (sr, n, rnd) {
      var f = lpf(sr);
      return function (i, t) { var s = 0, nz = f(rnd(), 600); for (var k = 0; k < 4; k++) { var l = t - k * 0.3; if (l >= 0 && l < 0.15) s += Math.sin(TAU * (k % 2 ? 70 : 85) * l) * ex(l, 30) + nz * ex(l, 40) * 0.8; } return s; };
    },

    // ---- bells and fun ----
    bell: function () { var R = [1, 2.76, 5.4, 8.93], A = [1, 0.6, 0.35, 0.2], D = [2.2, 3.2, 4.5, 6]; return function (i, t) { var s = 0; for (var k = 0; k < 4; k++) s += A[k] * Math.sin(TAU * 660 * R[k] * t) * ex(t, D[k]); return s; }; },
    chime: function () { var F = [1568, 2093, 2637, 3136]; return function (i, t) { var s = 0; for (var k = 0; k < 4; k++) s += note(t, k * 0.09, F[k], 3.5); return s; }; },
    glass: function (sr, n, rnd) { var f = lpf(sr); return function (i, t) { var x = rnd(); return note(t, 0, 2793, 6) + 0.7 * note(t, 0, 3729, 8) + 0.5 * note(t, 0, 5300, 12) + 0.5 * note(t, 0.18, 3520, 15) + 0.4 * note(t, 0.3, 4186, 15) + (x - f(x, 5000)) * ex(t, 60) * 0.4; }; },
    sparkle: function (sr, n, rnd) {
      var F = [2093, 2349, 2637, 3136, 3520, 4186], ts = [], fs = [], as = [], k;
      for (k = 0; k < 12; k++) { ts.push(Math.abs(rnd()) * 0.9); fs.push(F[Math.floor((rnd() + 1) / 2 * 5.999)]); as.push(0.4 + 0.3 * (rnd() + 1)); }
      return function (i, t) { var s = 0; for (var j = 0; j < 12; j++) s += as[j] * note(t, ts[j], fs[j], 10); return s; };
    },
    tada: function () { return function (i, t) { return tadaNote(t, 0, 392, 8) + tadaNote(t, 0.12, 523, 2.5) + tadaNote(t, 0.12, 659, 2.5) + tadaNote(t, 0.12, 784, 2.5); }; },
    boing: function (sr) { var ph = 0; return function (i, t) { ph += TAU * Math.max(80, 300 + 220 * ex(t, 3) * Math.sin(TAU * 9 * t)) / sr; return (Math.sin(ph) + 0.4 * Math.sin(2 * ph)) * ex(t, 3.5); }; },
    scratch: function (sr, n, rnd) { var a = lpf(sr), b = lpf(sr); return function (i, t, u) { var x = rnd(), band = a(x, 3200) - b(x, 500), m = Math.pow(Math.abs(Math.sin(TAU * 2.5 * t)), 0.6); return (band * 2 + 0.25 * Math.sin(TAU * (500 + 900 * m) * t)) * m * (1 - u); }; },
    sword: function (sr, n, rnd) { var f = lpf(sr); return function (i, t, u) { var x = rnd(), e = u < 0.08 ? u / 0.08 : ex(u - 0.08, 3.2); return ((x - f(x, 2000 + 3000 * u)) * 0.8 + 0.3 * Math.sin(TAU * (3000 + 2000 * u) * t)) * e; }; },
    siren: function (sr) { var ph = 0; return function (i, t) { ph += TAU * (900 + 300 * Math.sin(TAU * 0.8 * t)) / sr; return Math.sin(ph) + 0.3 * Math.sin(3 * ph); }; },

    // ---- nature and crowd ----
    wind: function (sr, n, rnd) { var f = lpf(sr); return function (i, t, u) { var c = 300 + 500 * (0.5 + 0.5 * Math.sin(TAU * 0.35 * t)); return f(rnd(), c) * Math.pow(Math.sin(Math.PI * u), 0.8) * (0.6 + 0.4 * Math.sin(TAU * 0.8 * t)) * 3; }; },
    thunder: function (sr, n, rnd) { var f = lpf(sr); return function (i, t) { var x = rnd(); return f(x, 180 + 600 * ex(t, 3)) * ex(t, 1.3) * (0.6 + 0.4 * Math.sin(TAU * 3.1 * t)) * 2.5 + x * ex(t, 30) * 0.4; }; },
    applause: function (sr, n, rnd) { var a = lpf(sr), b = lpf(sr), e = 0; return function (i, t, u) { var x = rnd(); e += lp(25, sr) * (Math.abs(rnd()) * 2 - e); return (a(x, 4500) - b(x, 600)) * (0.3 + 1.8 * e) * Math.min(1, u * 8) * Math.min(1, (1 - u) * 4) * 2; }; }
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