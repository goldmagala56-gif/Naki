'use strict';
/* Naki sound effects, part 2: well over a thousand more effects made by code (no files to download), in groups: birds, water, weather, sci-fi, cinema, UI, game, cartoon,
   bells, drums, African percussion, voices and more. It adds itself to NakiSfx (the list, render and a quick-listen preview); the same numbers always make the same sound.
   Load it right after sfx.js. In Node:  require('./sfx-more.js')(require('./sfx.js')). */
(function () {
  var TAU = Math.PI * 2;
  function mkRng(seed) { var s = (seed >>> 0) || 1, f = function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; f.state = function () { return s; }; return f; }
  function hashStr(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function U(r, a, b) { return a + r() * (b - a); }
  function L(r, a, b) { return a * Math.pow(b / a, r()); }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }
  function I(r, a, b) { return Math.floor(a + r() * (b - a + 1)); }
  function hz(n) { return 440 * Math.pow(2, (n - 69) / 12); }   // midi note to Hz
  var SCALES = { pent: [0, 2, 4, 7, 9], major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dim: [0, 3, 6, 9], whole: [0, 2, 4, 6, 8, 10] };

  // ---------------- the sound-making parts ----------------
  function mixIn(o, t0, buf, g) { for (var i = 0; i < buf.length && t0 + i < o.length; i++) if (t0 + i >= 0) o[t0 + i] += buf[i] * g; }
  function wave(w, a, harm, pw) {
    if (harm) { var s = 0; for (var k = 0; k < harm.length; k++) s += harm[k] * Math.sin(a * (k + 1)); return s; }
    if (w === 'sin') return Math.sin(a);
    if (w === 'tri') return 0.6366 * Math.asin(Math.sin(a));
    var u = (a / TAU) % 1; if (u < 0) u += 1;
    if (w === 'saw') return 2 * u - 1;
    return u < (pw || 0.5) ? 1 : -1;
  }
  // One note or sweep. f0 -> f1 (curve shapes the glide), wave, FM, vibrato, tremolo, attack/release (s) and an exponential decay.
  function tone(o, sr, p) {
    var t0 = Math.round((p.t0 || 0) * sr), len = Math.round(p.dur * sr); if (len < 2 || t0 >= o.length) return;
    len = Math.min(len, o.length - t0);
    var f0 = Math.max(10, p.f0), f1 = Math.max(10, p.f1 || p.f0), lg = Math.log(f1 / f0), cv = p.curve || 1, g = p.gain == null ? 1 : p.gain;
    var atk = Math.max(1, Math.round((p.atk == null ? 0.004 : p.atk) * sr)), rel = Math.max(1, Math.round((p.rel == null ? 0.01 : p.rel) * sr)), dec = p.dec || 0;
    var ph = 0, pm = 0, fr = p.fmR || 0, fd0 = p.fmD || 0, fd1 = p.fmD1 == null ? fd0 : p.fmD1, vr = p.vibR || 0, vd = p.vibD || 0, tr = p.tremR || 0, td = p.tremD || 0;
    var buf = new Float32Array(len);
    for (var i = 0; i < len; i++) {
      var x = i / len, tt = i / sr, f = f0 * Math.exp(lg * Math.pow(x, cv));
      if (vr) f *= 1 + vd * Math.sin(TAU * vr * tt);
      ph += TAU * f / sr; if (ph > TAU) ph -= TAU;
      var m = 0; if (fr) { pm += TAU * f * fr / sr; if (pm > TAU) pm -= TAU; m = (fd0 + (fd1 - fd0) * x) * Math.sin(pm); }
      var e = Math.min(1, i / atk, (len - 1 - i) / rel) * (dec ? Math.exp(-dec * tt) : 1);
      if (tr) e *= 1 - td * (0.5 + 0.5 * Math.sin(TAU * tr * tt));
      buf[i] = wave(p.wave || 'sin', ph + m, p.harm, p.pw) * e;
    }
    mixIn(o, t0, buf, g);
  }
  // Filtered noise: lp/hp (Hz, lp can glide lp0 -> lp1), or a band centred on bp0 -> bp1 with width q. shape(x) can draw the loudness over the length.
  function noise(o, sr, rng, p) {
    var t0 = Math.round((p.t0 || 0) * sr), len = Math.round(p.dur * sr); if (len < 2 || t0 >= o.length) return;
    len = Math.min(len, o.length - t0);
    var atk = Math.max(1, Math.round((p.atk == null ? 0.003 : p.atk) * sr)), rel = Math.max(1, Math.round((p.rel == null ? 0.01 : p.rel) * sr)), dec = p.dec || 0, cv = p.curve || 1;
    var lp0 = p.lp0 || p.lp || 0, lp1 = p.lp1 || lp0, hpF = p.hp || 0, b0 = p.bp0 || p.bp || 0, b1 = p.bp1 || b0, q = p.q || 1, tr = p.tremR || 0, td = p.tremD || 0, shape = p.shape;
    var lgl = lp0 ? Math.log(lp1 / lp0) : 0, lgb = b0 ? Math.log(b1 / b0) : 0, lpS = 0, hpS = 0, s1 = 0, s2 = 0, buf = new Float32Array(len), pk = 0, damp = 1 / q;
    for (var i = 0; i < len; i++) {
      var x = i / len, tt = i / sr, w = rng() * 2 - 1;
      if (b0) { var fc = Math.min(b0 * Math.exp(lgb * Math.pow(x, cv)), sr / 6.5), fq = 2 * Math.sin(Math.PI * fc / sr); s2 += fq * s1; var h = w - s2 - damp * s1; s1 += fq * h; w = s1; }
      if (lp0) { var fl = Math.min(lp0 * Math.exp(lgl * Math.pow(x, cv)), sr / 2.2); lpS += (1 - Math.exp(-TAU * fl / sr)) * (w - lpS); w = lpS; }
      if (hpF) { hpS += (1 - Math.exp(-TAU * hpF / sr)) * (w - hpS); w -= hpS; }
      var e = Math.min(1, i / atk, (len - 1 - i) / rel) * (dec ? Math.exp(-dec * tt) : 1) * (shape ? shape(x) : 1);
      if (tr) e *= 1 - td * (0.5 + 0.5 * Math.sin(TAU * tr * tt));
      w *= e; buf[i] = w; if (Math.abs(w) > pk) pk = Math.abs(w);
    }
    if (pk > 0) mixIn(o, t0, buf, (p.gain == null ? 1 : p.gain) / pk);   // each noise layer is levelled first, so the gains mean what they say
  }
  function burst(o, sr, rng, t, durMs, bp, q, g, dec) { noise(o, sr, rng, { t0: t, dur: durMs / 1000, bp: bp, q: q || 1.5, gain: g == null ? 1 : g, dec: dec || 300, atk: 0.0005, rel: 0.002 }); }
  function echo(o, sr, delay, fb, mix) { var d = Math.max(1, Math.round(delay * sr)), b = new Float32Array(o.length), i; for (i = 0; i < o.length; i++) b[i] = o[i] + (i >= d ? b[i - d] * fb : 0); for (i = 0; i < o.length; i++) o[i] = o[i] * (1 - mix) + b[i] * mix; }
  function reverb(o, sr, mix, size) {
    var n = o.length, s = size || 1, cs = [0.0297, 0.0371, 0.0411, 0.0437].map(function (t) { return Math.max(8, Math.round(t * s * sr)); }), out = new Float32Array(n);
    cs.forEach(function (d) { var b = new Float32Array(n); for (var i = 0; i < n; i++) { var x = o[i] + (i >= d ? b[i - d] * 0.78 : 0); b[i] = x; out[i] += x * 0.25; } });
    for (var i = 0; i < n; i++) o[i] = o[i] * (1 - mix * 0.5) + out[i] * mix;
  }
  function drive(o, k) { var nk = Math.tanh(k) || 1; for (var i = 0; i < o.length; i++) o[i] = Math.tanh(o[i] * k) / nk; }
  function crush(o, bits, down) { var st = Math.pow(2, bits - 1), h = 0; for (var i = 0; i < o.length; i++) { if (i % down === 0) h = Math.round(o[i] * st) / st; o[i] = h; } }
  function lowpass(o, sr, fc) { var a = 1 - Math.exp(-TAU * fc / sr), y = 0; for (var i = 0; i < o.length; i++) { y += a * (o[i] - y); o[i] = y; } }
  function ring(o, sr, f) { for (var i = 0; i < o.length; i++) o[i] *= Math.sin(TAU * f * i / sr); }
  function smooth(x) { return x * x * (3 - 2 * x); }

  // ---------------- the families of sounds ----------------
  var DEFS = [], BYKEY = {};
  // fam(category, name, how many, build(r, i) -> { dur (seconds), make(o, sr, rng) })   r is the seeded parameter generator.
  function fam(cat, name, count, build) {
    var r = mkRng(hashStr(cat + '|' + name));
    for (var i = 0; i < count; i++) {
      var snap = r.state(), sp = build(r, i), key = 'z_' + hashStr(cat + name + i).toString(36), label = name + ' ' + (i < 9 ? '0' : '') + (i + 1);
      var d = { key: key, label: label, cat: cat, durMs: Math.max(60, Math.round(sp.dur * 1000)), build: build, snap: snap, i: i };
      DEFS.push(d); BYKEY[key] = d;
    }
  }

  // ===== BIRDS =====
  fam('Birds', 'Songbird', 12, function (r) { var k = I(r, 2, 6), f = U(r, 2000, 4200), sw = U(r, 0.6, 1.8), cl = U(r, 0.04, 0.12), gap = U(r, 0.08, 0.2), vb = U(r, 0, 0.02);
    return { dur: k * (cl + gap) + 0.25, make: function (o, sr) { for (var j = 0; j < k; j++) tone(o, sr, { t0: 0.05 + j * (cl + gap), dur: cl, f0: f * (1 + 0.1 * j % 3), f1: f * sw, curve: 0.8, dec: 18, harm: [1, 0.25, 0.08], vibR: 30, vibD: vb, gain: 0.8 }); } } });
  fam('Birds', 'Tweet trill', 8, function (r) { var rate = U(r, 12, 26), f = U(r, 2600, 4600), dur = U(r, 0.5, 1.1), up = r() < 0.5;
    return { dur: dur + 0.15, make: function (o, sr) { for (var t = 0.03; t < dur; t += 1 / rate) tone(o, sr, { t0: t, dur: 0.6 / rate, f0: f, f1: f * (up ? 1.4 : 0.7), dec: 20, atk: 0.002, gain: 0.7 }); } } });
  fam('Birds', 'Warbler', 8, function (r) { var f = U(r, 2400, 4000), dur = U(r, 0.8, 1.6), vr = U(r, 8, 26), vd = U(r, 0.05, 0.2);
    return { dur: dur, make: function (o, sr) { tone(o, sr, { dur: dur - 0.02, f0: f, f1: f * U(r, 0.85, 1.2), vibR: vr, vibD: vd, tremR: U(r, 5, 12), tremD: 0.5, harm: [1, 0.3], atk: 0.05, rel: 0.1 }); } } });
  fam('Birds', 'Dove coo', 6, function (r) { var f = U(r, 380, 620), k = I(r, 3, 4);
    return { dur: k * 0.38 + 0.3, make: function (o, sr) { for (var j = 0; j < k; j++) tone(o, sr, { t0: 0.05 + j * (j === 0 ? 0.5 : 0.3), dur: j === 0 ? 0.4 : 0.22, f0: f * 0.9, f1: f * (j === 0 ? 1.1 : 0.95), atk: 0.05, rel: 0.08, harm: [1, 0.3, 0.1], fmR: 1, fmD: 0.3, gain: 0.9 }); } } });
  fam('Birds', 'Owl hoot', 6, function (r) { var f = U(r, 280, 420), tw = r() < 0.5;
    return { dur: tw ? 1.9 : 1.2, make: function (o, sr) { var t = [[0, 0.5]]; if (tw) t.push([0.8, 0.22], [1.1, 0.22], [1.4, 0.4]); t.forEach(function (x) { tone(o, sr, { t0: x[0] + 0.05, dur: x[1], f0: f * 1.05, f1: f * 0.9, atk: 0.06, rel: 0.1, harm: [1, 0.15], vibR: 5, vibD: 0.01 }); }); lowpass(o, sr, 1500); } } });
  fam('Birds', 'Crow caw', 8, function (r) { var f = U(r, 450, 900), k = I(r, 2, 4);
    return { dur: k * 0.42 + 0.2, make: function (o, sr, rng) { for (var j = 0; j < k; j++) { var t = 0.05 + j * 0.42; tone(o, sr, { t0: t, dur: 0.3, f0: f * 1.1, f1: f * 0.65, wave: 'saw', atk: 0.01, rel: 0.1, gain: 0.8, vibR: 40, vibD: 0.03 }); noise(o, sr, rng, { t0: t, dur: 0.3, bp: f * 2.5, q: 2, gain: 0.35, atk: 0.01, rel: 0.1 }); } } } });
  fam('Birds', 'Rooster', 4, function (r) { var f = U(r, 450, 650);
    return { dur: 1.8, make: function (o, sr) { var segs = [[0.0, 0.28, f, f * 2], [0.32, 0.25, f * 2.1, f * 2.5], [0.62, 0.3, f * 2.2, f * 2.8], [0.95, 0.7, f * 2.6, f * 1.2]]; segs.forEach(function (s) { tone(o, sr, { t0: s[0] + 0.03, dur: s[1], f0: s[2], f1: s[3], wave: 'saw', atk: 0.02, rel: 0.06, vibR: 30, vibD: 0.02, gain: 0.8 }); }); lowpass(o, sr, 5000); } } });
  fam('Birds', 'Woodpecker', 4, function (r) { var rate = U(r, 14, 22), dur = U(r, 0.4, 0.7), bp = U(r, 1800, 3200);
    return { dur: dur + 0.1, make: function (o, sr, rng) { for (var t = 0.02; t < dur; t += 1 / rate) burst(o, sr, rng, t, 9, bp, 1.2, 1, 250); } } });
  fam('Birds', 'Cuckoo', 4, function (r) { var f = U(r, 650, 900);
    return { dur: 1.1, make: function (o, sr) { tone(o, sr, { t0: 0.05, dur: 0.3, f0: f * 1.25, f1: f * 1.2, atk: 0.03, rel: 0.05, harm: [1, 0.2] }); tone(o, sr, { t0: 0.45, dur: 0.4, f0: f, f1: f * 0.97, atk: 0.03, rel: 0.1, harm: [1, 0.2] }); } } });

  // ===== INSECTS AND FROGS =====
  fam('Insects & Frogs', 'Cricket', 8, function (r) { var f = U(r, 4000, 5400), nb = I(r, 2, 4), pc = I(r, 3, 5), rate = U(r, 28, 44);
    return { dur: nb * 0.6 + 0.2, make: function (o, sr) { for (var b = 0; b < nb; b++) for (var c = 0; c < pc; c++) tone(o, sr, { t0: 0.05 + b * 0.6 + c / rate, dur: 0.6 / rate, f0: f, atk: 0.002, rel: 0.004, gain: 0.8 }); } } });
  fam('Insects & Frogs', 'Cicada', 6, function (r) { var bp = U(r, 4500, 7000), tr = U(r, 30, 70), dur = U(r, 1.5, 2.5);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, bp: bp, q: 4, tremR: tr, tremD: 0.6, atk: dur * 0.3, rel: dur * 0.3 }); } } });
  fam('Insects & Frogs', 'Bee buzz', 6, function (r) { var f = U(r, 110, 240), dur = U(r, 1, 1.6), vr = U(r, 4, 9);
    return { dur: dur, make: function (o, sr, rng) { tone(o, sr, { dur: dur - 0.02, f0: f, f1: f * 1.1, wave: 'saw', vibR: vr, vibD: 0.05, atk: dur * 0.4, rel: dur * 0.4, gain: 0.7 }); noise(o, sr, rng, { dur: dur - 0.02, bp: f * 5, q: 1.5, gain: 0.5, atk: dur * 0.4, rel: dur * 0.4 }); lowpass(o, sr, 3000); } } });
  fam('Insects & Frogs', 'Mosquito', 4, function (r) { var f = U(r, 480, 720);
    return { dur: 1.3, make: function (o, sr) { tone(o, sr, { dur: 1.25, f0: f, f1: f * U(r, 0.9, 1.15), harm: [1, 0.5, 0.25], vibR: 6, vibD: 0.03, atk: 0.4, rel: 0.4 }); } } });
  fam('Insects & Frogs', 'Frog croak', 8, function (r) { var f = U(r, 110, 210), k = I(r, 2, 3), tr = U(r, 25, 45);
    return { dur: k * 0.42 + 0.15, make: function (o, sr) { for (var j = 0; j < k; j++) tone(o, sr, { t0: 0.04 + j * 0.42, dur: 0.32, f0: f * 1.2, f1: f * 0.85, wave: 'sq', pw: 0.4, tremR: tr, tremD: 0.8, atk: 0.02, rel: 0.1 }); lowpass(o, sr, 900); } } });
  fam('Insects & Frogs', 'Tree frog', 4, function (r) { var f = U(r, 1800, 2800), k = I(r, 4, 8);
    return { dur: k * 0.14 + 0.2, make: function (o, sr) { for (var j = 0; j < k; j++) tone(o, sr, { t0: 0.04 + j * 0.14, dur: 0.07, f0: f, f1: f * 1.3, dec: 15, gain: 0.8 }); } } });
  fam('Insects & Frogs', 'Bullfrog', 4, function (r) { var f = U(r, 60, 90);
    return { dur: 1.1, make: function (o, sr) { tone(o, sr, { t0: 0.05, dur: 0.9, f0: f * 1.3, f1: f * 0.8, wave: 'sq', tremR: 12, tremD: 0.9, atk: 0.05, rel: 0.2 }); lowpass(o, sr, 500); } } });

  // ===== WATER =====
  fam('Water', 'Water drip', 10, function (r) { var k = I(r, 1, 4), f = U(r, 1200, 3200), gap = U(r, 0.3, 0.6);
    return { dur: k * gap + 0.4, make: function (o, sr) { for (var j = 0; j < k; j++) tone(o, sr, { t0: 0.03 + j * gap, dur: 0.12, f0: f * (1 + j * 0.08), f1: f * 1.9, curve: 0.5, dec: 35, gain: 1 - j * 0.15 }); echo(o, sr, 0.09, 0.4, 0.4); } } });
  fam('Water', 'Bubbles', 8, function (r) { var k = I(r, 6, 14), dur = U(r, 0.8, 1.6);
    return { dur: dur + 0.2, make: function (o, sr, rng) { for (var j = 0; j < k; j++) { var f = L(rng, 250, 900); tone(o, sr, { t0: rng() * dur, dur: 0.09, f0: f, f1: f * 2, curve: 0.6, dec: 30, gain: 0.4 + rng() * 0.6 }); } } } });
  fam('Water', 'Stream', 8, function (r) { var lp = U(r, 1500, 3500), dur = U(r, 2.5, 3.5);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, lp: lp, hp: 300, atk: 0.3, rel: 0.4, tremR: U(r, 3, 9), tremD: 0.3 }); noise(o, sr, rng, { dur: dur - 0.02, bp0: 700, bp1: 2200, q: 3, curve: 1, gain: 0.4, atk: 0.3, rel: 0.4, tremR: U(r, 6, 14), tremD: 0.7 }); } } });
  fam('Water', 'Ocean waves', 8, function (r) { var dur = U(r, 3.5, 5), sw = U(r, 0.2, 0.35);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, lp: 1200, hp: 80, atk: 0.1, rel: 0.3, shape: function (x) { var s = 0.5 + 0.5 * Math.sin(TAU * sw * x * dur - 1.5); return 0.15 + 0.85 * s * s; } }); } } });
  fam('Water', 'Splash', 8, function (r) { var bp = U(r, 2000, 4200), th = U(r, 90, 160);
    return { dur: 0.9, make: function (o, sr, rng) { noise(o, sr, rng, { dur: 0.7, bp0: bp, bp1: bp * 0.5, q: 0.8, dec: 7, atk: 0.002 }); tone(o, sr, { dur: 0.25, f0: th * 1.6, f1: th * 0.7, dec: 12, gain: 0.8 }); for (var j = 0; j < 5; j++) tone(o, sr, { t0: 0.1 + rng() * 0.5, dur: 0.06, f0: L(rng, 800, 2500), f1: 3000, dec: 40, gain: 0.3 }); } } });
  fam('Water', 'Pouring', 4, function (r) { var dur = U(r, 1.8, 2.6);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, bp0: 2500, bp1: 3200, q: 1, atk: 0.2, rel: 0.3 }); for (var j = 0; j < 14; j++) tone(o, sr, { t0: rng() * (dur - 0.2), dur: 0.07, f0: L(rng, 400, 1000), f1: 1800, dec: 30, gain: 0.25 }); } } });
  fam('Water', 'Rain on leaves', 4, function (r) { var dur = U(r, 2.5, 3.5);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, hp: 2500, lp: 9000, gain: 0.5, atk: 0.2, rel: 0.3 }); for (var j = 0; j < dur * 70; j++) burst(o, sr, rng, rng() * (dur - 0.05), 4, L(rng, 2500, 6000), 1.5, 0.15 + rng() * 0.4, 500); } } });

  // ===== WEATHER AND WIND =====
  fam('Weather', 'Wind gust', 14, function (r) { var dur = U(r, 2.4, 4), b0 = U(r, 250, 700), b1 = b0 * U(r, 1.6, 3), up = r() < 0.5;
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, bp0: up ? b0 : b1, bp1: up ? b1 : b0, q: 1.2, atk: dur * 0.35, rel: dur * 0.4, shape: function (x) { return 0.6 + 0.4 * Math.sin(TAU * 2 * x); } }); } } });
  fam('Weather', 'Howling wind', 8, function (r) { var f = U(r, 350, 800), dur = U(r, 3, 4.5);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, bp0: f, bp1: f * 1.4, q: 9, atk: 0.8, rel: 0.8, tremR: U(r, 0.3, 0.8), tremD: 0.4 }); noise(o, sr, rng, { dur: dur - 0.02, lp: 500, gain: 0.35, atk: 0.8, rel: 0.8 }); } } });
  fam('Weather', 'Thunder rumble', 10, function (r) { var dur = U(r, 3, 5), lp = U(r, 100, 260);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, lp0: lp * 2, lp1: lp * 0.6, atk: 0.3, dec: 0.7, rel: 0.5, tremR: U(r, 6, 14), tremD: 0.4 }); for (var j = 0; j < 4; j++) noise(o, sr, rng, { t0: rng() * dur * 0.6, dur: 0.6, lp: 150, gain: 0.5, atk: 0.1, dec: 4, rel: 0.2 }); } } });
  fam('Weather', 'Thunder crack', 6, function (r) { var lp = U(r, 3000, 8000);
    return { dur: 3.2, make: function (o, sr, rng) { noise(o, sr, rng, { dur: 0.35, lp: lp, hp: 200, dec: 9, atk: 0.0005 }); noise(o, sr, rng, { t0: 0.05, dur: 3, lp0: 400, lp1: 90, dec: 1.2, gain: 0.7, atk: 0.1, rel: 0.5 }); reverb(o, sr, 0.3, 1.5); } } });
  fam('Weather', 'Rain', 8, function (r) { var dur = U(r, 3, 4.5), hp = U(r, 600, 1500), lp = U(r, 5000, 9000);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, hp: hp, lp: lp, atk: 0.4, rel: 0.5 }); for (var j = 0; j < dur * 40; j++) burst(o, sr, rng, rng() * dur, 3, L(rng, 3000, 8000), 1.5, 0.12 + rng() * 0.2, 600); } } });
  fam('Weather', 'Storm', 4, function (r) { var dur = 4.5;
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, hp: 700, lp: 7000, gain: 0.6, atk: 0.5, rel: 0.6 }); noise(o, sr, rng, { dur: dur - 0.02, bp0: 400, bp1: 900, q: 3, gain: 0.7, atk: 1, rel: 1, tremR: 0.5, tremD: 0.5 }); noise(o, sr, rng, { t0: 1.2 + r() * 1.5, dur: 2.2, lp: 180, gain: 0.9, atk: 0.05, dec: 1.5, rel: 0.4 }); } } });

  // ===== FIRE AND EARTH =====
  fam('Fire & Earth', 'Fire crackle', 10, function (r) { var dur = U(r, 2, 3), dens = U(r, 25, 60);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, lp: 700, hp: 60, gain: 0.35, atk: 0.2, rel: 0.3, tremR: 9, tremD: 0.5 }); for (var j = 0; j < dur * dens; j++) burst(o, sr, rng, rng() * (dur - 0.05), 2 + rng() * 8, L(rng, 1200, 5000), 1.2, 0.2 + rng() * 0.8, 400); } } });
  fam('Fire & Earth', 'Flame whoosh', 6, function (r) { var dur = U(r, 1, 1.8);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, lp0: 500, lp1: 3000, hp: 100, atk: dur * 0.2, rel: dur * 0.6, curve: 0.8 }); noise(o, sr, rng, { dur: dur - 0.02, lp: 200, gain: 0.5, atk: 0.05, rel: dur * 0.6 }); } } });
  fam('Fire & Earth', 'Rockfall', 6, function (r) { var dur = U(r, 1.5, 2.5);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, lp: 300, atk: 0.05, dec: 1.5, rel: 0.3, gain: 0.7 }); for (var j = 0; j < 40; j++) { var t = rng() * dur * 0.85; tone(o, sr, { t0: t, dur: 0.08, f0: L(rng, 90, 400), f1: L(rng, 60, 200), dec: 40, gain: 0.5 * (1 - t / dur) }); burst(o, sr, rng, t, 6, L(rng, 600, 2500), 1, 0.4 * (1 - t / dur), 300); } } } });
  fam('Fire & Earth', 'Footsteps', 8, function (r) { var k = I(r, 3, 6), gap = U(r, 0.3, 0.55), bp = pick(r, [500, 900, 1600, 2600]);
    return { dur: k * gap + 0.25, make: function (o, sr, rng) { for (var j = 0; j < k; j++) { var t = 0.05 + j * gap + (rng() - 0.5) * 0.03; burst(o, sr, rng, t, 90, bp * (0.9 + rng() * 0.2), 0.9, 0.8, 35); tone(o, sr, { t0: t, dur: 0.08, f0: 120, f1: 70, dec: 40, gain: 0.5 }); } } } });

  // ===== WILD ANIMALS (stylised) =====
  fam('Wild Animals', 'Wolf howl', 6, function (r) { var f = U(r, 320, 480), dur = U(r, 2, 3);
    return { dur: dur, make: function (o, sr) { tone(o, sr, { dur: dur - 0.02, f0: f, f1: f * 1.8, curve: 0.5, vibR: 5.5, vibD: 0.015, harm: [1, 0.35, 0.15], atk: 0.3, rel: dur * 0.5, gain: 0.8 }); tone(o, sr, { t0: dur * 0.5, dur: dur * 0.5 - 0.02, f0: f * 1.8, f1: f * 1.1, vibR: 5.5, vibD: 0.02, harm: [1, 0.3], atk: 0.1, rel: 0.4, gain: 0.5 }); } } });
  fam('Wild Animals', 'Whale song', 6, function (r) { var f = U(r, 150, 300);
    return { dur: 4, make: function (o, sr) { for (var j = 0; j < 3; j++) tone(o, sr, { t0: 0.1 + j * 1.2, dur: 1.1, f0: f * (1 + 0.3 * j), f1: f * (2 - 0.3 * j), harm: [1, 0.4, 0.2, 0.1], vibR: 3, vibD: 0.02, atk: 0.3, rel: 0.5 }); echo(o, sr, 0.3, 0.4, 0.35); } } });
  fam('Wild Animals', 'Cat meow', 6, function (r) { var f = U(r, 420, 640);
    return { dur: 1, make: function (o, sr, rng) { tone(o, sr, { t0: 0.04, dur: 0.8, f0: f * 0.8, f1: f * 1.4, curve: 0.4, wave: 'saw', vibR: 6, vibD: 0.02, atk: 0.1, rel: 0.4, gain: 0.8 }); tone(o, sr, { t0: 0.4, dur: 0.45, f0: f * 1.4, f1: f * 0.7, wave: 'saw', atk: 0.02, rel: 0.3, gain: 0.7 }); lowpass(o, sr, 3000); } } });
  fam('Wild Animals', 'Dog bark', 6, function (r) { var f = U(r, 150, 300), k = I(r, 2, 3);
    return { dur: k * 0.4 + 0.2, make: function (o, sr, rng) { for (var j = 0; j < k; j++) { var t = 0.04 + j * 0.4; tone(o, sr, { t0: t, dur: 0.2, f0: f * 1.6, f1: f * 0.7, wave: 'saw', atk: 0.003, rel: 0.08, dec: 8 }); noise(o, sr, rng, { t0: t, dur: 0.18, bp: f * 5, q: 2, gain: 0.4, dec: 10, atk: 0.002 }); } lowpass(o, sr, 3500); } } });
  fam('Wild Animals', 'Lion roar', 4, function (r) { var f = U(r, 65, 95);
    return { dur: 2.5, make: function (o, sr, rng) { tone(o, sr, { dur: 2.4, f0: f * 1.5, f1: f * 0.7, wave: 'saw', tremR: 24, tremD: 0.7, atk: 0.3, rel: 1.2 }); noise(o, sr, rng, { dur: 2.4, lp: 900, gain: 0.6, atk: 0.3, rel: 1.2, tremR: 22, tremD: 0.6 }); drive(o, 2); lowpass(o, sr, 2000); } } });
  fam('Wild Animals', 'Elephant', 6, function (r) { var f = U(r, 350, 550);
    return { dur: 1.8, make: function (o, sr) { tone(o, sr, { t0: 0.05, dur: 1.5, f0: f * 0.7, f1: f * 1.9, curve: 0.5, wave: 'saw', vibR: 22, vibD: 0.03, atk: 0.15, rel: 0.5, gain: 0.8 }); tone(o, sr, { t0: 0.05, dur: 1.5, f0: f * 0.35, f1: f * 0.95, curve: 0.5, atk: 0.15, rel: 0.5, gain: 0.5 }); lowpass(o, sr, 4000); } } });
  fam('Wild Animals', 'Monkey', 6, function (r) { var k = I(r, 5, 10), f = U(r, 600, 1300);
    return { dur: k * 0.1 + 0.4, make: function (o, sr, rng) { for (var j = 0; j < k; j++) tone(o, sr, { t0: 0.05 + j * 0.1, dur: 0.08, f0: f * (0.8 + rng() * 0.6), f1: f * (1 + rng() * 0.8), wave: 'saw', dec: 15, gain: 0.7 }); lowpass(o, sr, 3500); } } });

  // ===== LASERS AND BLASTERS =====
  fam('Lasers', 'Laser zap', 20, function (r) { var f0 = L(r, 1800, 6000), f1 = L(r, 80, 600), dur = U(r, 0.15, 0.5), w = pick(r, ['saw', 'sq', 'sin']), fm = r() < 0.4;
    return { dur: dur + 0.05, make: function (o, sr) { tone(o, sr, { dur: dur, f0: f0, f1: f1, curve: 0.6, wave: w, fmR: fm ? 2 : 0, fmD: 3, fmD1: 0.2, dec: 4, atk: 0.001, rel: 0.02 }); } } });
  fam('Lasers', 'Blaster', 12, function (r) { var f = L(r, 120, 400);
    return { dur: 0.5, make: function (o, sr, rng) { noise(o, sr, rng, { dur: 0.1, bp: 3000, q: 1, dec: 30, atk: 0.0005 }); tone(o, sr, { dur: 0.4, f0: f * 8, f1: f, curve: 0.4, wave: 'sq', dec: 6, gain: 0.8 }); tone(o, sr, { dur: 0.3, f0: f * 1.2, f1: f * 0.5, dec: 12, gain: 0.7 }); } } });
  fam('Lasers', 'Pulse burst', 8, function (r) { var k = I(r, 3, 6), f = L(r, 800, 2500), gap = U(r, 0.07, 0.12);
    return { dur: k * gap + 0.25, make: function (o, sr) { for (var j = 0; j < k; j++) tone(o, sr, { t0: j * gap, dur: 0.08, f0: f, f1: f * 0.25, wave: 'sq', dec: 20, gain: 0.8 }); echo(o, sr, 0.1, 0.3, 0.2); } } });
  fam('Lasers', 'Plasma charge shot', 10, function (r) { var ch = U(r, 0.4, 0.9), f = L(r, 150, 400);
    return { dur: ch + 0.6, make: function (o, sr, rng) { tone(o, sr, { dur: ch, f0: f, f1: f * 8, curve: 2, wave: 'saw', fmR: 3, fmD: 1, fmD1: 4, atk: 0.1, rel: 0.01, gain: 0.7 }); tone(o, sr, { t0: ch, dur: 0.5, f0: f * 14, f1: f * 0.8, curve: 0.5, wave: 'sq', dec: 5, gain: 0.9 }); noise(o, sr, rng, { t0: ch, dur: 0.3, bp: 2500, q: 1, dec: 10, gain: 0.5 }); } } });
  fam('Lasers', 'Ricochet', 10, function (r) { var f = L(r, 1500, 3500);
    return { dur: 0.9, make: function (o, sr) { tone(o, sr, { dur: 0.15, f0: f, f1: f * 0.3, curve: 0.6, wave: 'saw', dec: 8 }); tone(o, sr, { t0: 0.17, dur: 0.5, f0: f * 1.5, f1: f * 0.6, wave: 'sin', vibR: 30, vibD: 0.15, dec: 6, gain: 0.5 }); echo(o, sr, 0.12, 0.45, 0.4); } } });

  // ===== POWER UPS AND DOWNS =====
  fam('Power Ups', 'Power up', 14, function (r) { var f = hz(U(r, 48, 62)), k = I(r, 4, 8), sc = pick(r, ['major', 'pent', 'minor']);
    return { dur: k * 0.07 + 0.5, make: function (o, sr) { var s = SCALES[sc]; for (var j = 0; j < k; j++) tone(o, sr, { t0: j * 0.07, dur: 0.12, f0: f * Math.pow(2, (s[j % s.length] + 12 * Math.floor(j / s.length)) / 12) * 2, wave: 'sq', pw: 0.3, dec: 6, gain: 0.7 }); tone(o, sr, { t0: k * 0.07, dur: 0.4, f0: f * 8, f1: f * 8.02, dec: 7, harm: [1, 0.4], gain: 0.6 }); } } });
  fam('Power Ups', 'Power down', 12, function (r) { var f = L(r, 600, 1800), dur = U(r, 0.6, 1.5);
    return { dur: dur + 0.05, make: function (o, sr) { tone(o, sr, { dur: dur, f0: f, f1: f * 0.06, curve: 0.7, wave: pick(r, ['saw', 'sq']), fmR: 1, fmD: 1, rel: 0.2, gain: 0.8 }); lowpass(o, sr, 5000); } } });
  fam('Power Ups', 'Charge up', 12, function (r) { var f = L(r, 80, 250), dur = U(r, 1, 2.2);
    return { dur: dur + 0.1, make: function (o, sr) { tone(o, sr, { dur: dur, f0: f, f1: f * 10, curve: 2.2, wave: 'saw', fmR: 2, fmD: 0.5, fmD1: 6, atk: 0.2, rel: 0.02, gain: 0.8 }); tone(o, sr, { dur: dur, f0: f * 2, f1: f * 20, curve: 2.5, atk: 0.3, rel: 0.02, gain: 0.4 }); } } });
  fam('Power Ups', 'Shield hum', 12, function (r) { var f = L(r, 70, 200), dur = U(r, 1.2, 2.2), on = r() < 0.5;
    return { dur: dur, make: function (o, sr) { tone(o, sr, { dur: dur - 0.02, f0: on ? f * 0.5 : f * 1.5, f1: on ? f * 1.5 : f * 0.5, wave: 'saw', fmR: 2, fmD: 1.5, tremR: 14, tremD: 0.4, atk: 0.1, rel: 0.3, gain: 0.7 }); tone(o, sr, { dur: dur - 0.02, f0: f * 4, f1: f * 4.05, tremR: 7, tremD: 0.6, atk: 0.2, rel: 0.3, gain: 0.35 }); lowpass(o, sr, 3000); } } });

  // ===== TELEPORT AND WARP =====
  fam('Teleport & Warp', 'Teleport', 14, function (r) { var f = L(r, 300, 900), up = r() < 0.5;
    return { dur: 1.3, make: function (o, sr, rng) { tone(o, sr, { dur: 1.2, f0: up ? f : f * 6, f1: up ? f * 6 : f, curve: 1.3, fmR: 3, fmD: 3, vibR: 12, vibD: 0.05, atk: 0.1, rel: 0.3, gain: 0.6 }); noise(o, sr, rng, { dur: 1.2, bp0: up ? 400 : 4000, bp1: up ? 4000 : 400, q: 3, gain: 0.5, atk: 0.1, rel: 0.3 }); echo(o, sr, 0.08, 0.4, 0.3); } } });
  fam('Teleport & Warp', 'Warp jump', 14, function (r) { var f = L(r, 60, 150);
    return { dur: 2.2, make: function (o, sr, rng) { tone(o, sr, { dur: 1.3, f0: f * 2, f1: f * 40, curve: 3, wave: 'saw', atk: 0.4, rel: 0.01, gain: 0.7 }); noise(o, sr, rng, { dur: 1.3, bp0: 300, bp1: 6000, q: 2, curve: 2.5, atk: 0.5, rel: 0.01, gain: 0.5 }); tone(o, sr, { t0: 1.3, dur: 0.9, f0: f * 1.5, f1: f * 0.5, dec: 4, gain: 0.9 }); noise(o, sr, rng, { t0: 1.3, dur: 0.6, lp: 800, dec: 5, gain: 0.7 }); } } });
  fam('Teleport & Warp', 'Portal', 12, function (r) { var f = L(r, 150, 420), dur = U(r, 1.8, 3);
    return { dur: dur, make: function (o, sr, rng) { tone(o, sr, { dur: dur - 0.02, f0: f, f1: f * 1.2, fmR: 1.5, fmD: 4, vibR: 6, vibD: 0.06, tremR: 9, tremD: 0.4, atk: 0.4, rel: 0.6, gain: 0.7 }); noise(o, sr, rng, { dur: dur - 0.02, bp0: 900, bp1: 1800, q: 5, atk: 0.4, rel: 0.6, gain: 0.4, tremR: 5, tremD: 0.7 }); reverb(o, sr, 0.25, 1.2); } } });

  // ===== ALIEN AND ROBOT =====
  fam('Alien & Robot', 'Alien chatter', 16, function (r) { var k = I(r, 6, 14), dur = U(r, 0.7, 1.4);
    return { dur: dur + 0.2, make: function (o, sr, rng) { for (var j = 0; j < k; j++) { var f = L(rng, 250, 2200); tone(o, sr, { t0: j * dur / k, dur: dur / k * U(rng, 0.5, 0.95), f0: f, f1: f * U(rng, 0.5, 1.8), fmR: U(rng, 1, 4), fmD: U(rng, 1, 5), vibR: 20, vibD: 0.03, dec: 5, gain: 0.8 }); } } } });
  fam('Alien & Robot', 'Robot voice', 16, function (r) { var k = I(r, 5, 9), ca = U(r, 60, 160), base = L(r, 90, 200);
    return { dur: k * 0.16 + 0.3, make: function (o, sr, rng) { for (var j = 0; j < k; j++) tone(o, sr, { t0: 0.04 + j * 0.16, dur: 0.14 * U(rng, 0.6, 1), f0: base * U(rng, 0.8, 2), wave: 'saw', atk: 0.01, rel: 0.02, gain: 0.8 }); ring(o, sr, ca); lowpass(o, sr, 4000); } } });
  fam('Alien & Robot', 'Vocoder beeps', 8, function (r) { var k = I(r, 4, 9);
    return { dur: k * 0.11 + 0.2, make: function (o, sr, rng) { for (var j = 0; j < k; j++) tone(o, sr, { t0: 0.03 + j * 0.11, dur: 0.08, f0: L(rng, 300, 1500), wave: 'sq', fmR: 2, fmD: 1, gain: 0.6, atk: 0.005 }); crush(o, 6, 2); } } });
  fam('Alien & Robot', 'Droid chirp', 10, function (r) { var k = I(r, 3, 7);
    return { dur: k * 0.09 + 0.25, make: function (o, sr, rng) { for (var j = 0; j < k; j++) { var f = L(rng, 700, 3500); tone(o, sr, { t0: 0.02 + j * 0.09, dur: 0.07, f0: f, f1: f * U(rng, 0.5, 2), fmR: 3, fmD: 2, dec: 10, gain: 0.8 }); } } } });

  // ===== COMPUTER AND HUD =====
  fam('Computer & HUD', 'Beep', 12, function (r) { var f = L(r, 500, 3000), w = pick(r, ['sin', 'sq', 'tri']);
    return { dur: 0.22, make: function (o, sr) { tone(o, sr, { dur: 0.15, f0: f, wave: w, atk: 0.003, rel: 0.02, gain: 0.8 }); } } });
  fam('Computer & HUD', 'Multi beep', 12, function (r) { var k = I(r, 2, 4), f = L(r, 500, 1800), st = pick(r, [1.25, 1.5, 2, 0.75]), w = pick(r, ['sin', 'sq']);
    return { dur: k * 0.13 + 0.15, make: function (o, sr) { for (var j = 0; j < k; j++) tone(o, sr, { t0: j * 0.13, dur: 0.09, f0: f * Math.pow(st, j % 2 + (j > 1 ? 1 : 0)), wave: w, atk: 0.003, rel: 0.015, gain: 0.8 }); } } });
  fam('Computer & HUD', 'Data stream', 12, function (r) { var dur = U(r, 0.8, 1.8), rate = U(r, 18, 40);
    return { dur: dur + 0.1, make: function (o, sr, rng) { for (var t = 0; t < dur; t += 1 / rate) tone(o, sr, { t0: t, dur: 0.5 / rate, f0: L(rng, 600, 4000), wave: pick(rng, ['sin', 'sq']), gain: 0.4 + rng() * 0.5, atk: 0.001, rel: 0.003 }); } } });
  fam('Computer & HUD', 'Scanner', 8, function (r) { var f = L(r, 300, 900), dur = U(r, 0.8, 1.6);
    return { dur: dur + 0.05, make: function (o, sr) { tone(o, sr, { dur: dur, f0: f, f1: f * 4, wave: 'tri', tremR: 18, tremD: 0.5, vibR: 5, vibD: 0.03, atk: 0.05, rel: 0.1, gain: 0.8 }); tone(o, sr, { dur: dur, f0: f * 4, f1: f, wave: 'tri', gain: 0.3, atk: 0.05, rel: 0.1 }); } } });
  fam('Computer & HUD', 'Access', 8, function (r) { var f = L(r, 400, 1000), ok = r() < 0.5;
    return { dur: 0.65, make: function (o, sr) { var a = ok ? [1, 1.5] : [1, 0.7]; a.forEach(function (m, j) { tone(o, sr, { t0: j * 0.17, dur: 0.22, f0: f * m, wave: ok ? 'sin' : 'sq', pw: 0.4, dec: 4, harm: ok ? [1, 0.3] : null, gain: 0.8 }); }); } } });
  fam('Computer & HUD', 'Boot up', 8, function (r) { var f = hz(U(r, 55, 65)), k = I(r, 5, 8);
    return { dur: k * 0.1 + 0.9, make: function (o, sr, rng) { for (var j = 0; j < k; j++) tone(o, sr, { t0: j * 0.1, dur: 0.14, f0: f * Math.pow(2, SCALES.pent[j % 5] / 12 + Math.floor(j / 5)), wave: 'sq', pw: 0.25, dec: 5, gain: 0.6 }); tone(o, sr, { t0: k * 0.1, dur: 0.7, f0: f * 4, harm: [1, 0.5, 0.3], dec: 4, gain: 0.5 }); noise(o, sr, rng, { dur: k * 0.1, hp: 4000, gain: 0.15 }); reverb(o, sr, 0.2, 0.8); } } });

  // ===== SPACE AMBIENCE =====
  fam('Space Ambience', 'Space drone', 14, function (r) { var f = L(r, 40, 110), dur = U(r, 3, 5), det = U(r, 0.003, 0.012);
    return { dur: dur, make: function (o, sr, rng) { [1, 1 + det, 1 - det, 2.003].forEach(function (m, j) { tone(o, sr, { dur: dur - 0.02, f0: f * m, wave: 'saw', atk: dur * 0.35, rel: dur * 0.4, gain: j === 3 ? 0.2 : 0.4 }); }); lowpass(o, sr, 700); reverb(o, sr, 0.3, 1.4); } } });
  fam('Space Ambience', 'Deep space rumble', 10, function (r) { var dur = U(r, 3, 5);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, lp: 90, atk: dur * 0.3, rel: dur * 0.4, tremR: U(r, 0.5, 2), tremD: 0.5 }); tone(o, sr, { dur: dur - 0.02, f0: 38, fmR: 0.5, fmD: 2, atk: dur * 0.3, rel: dur * 0.4, gain: 0.5 }); } } });
  fam('Space Ambience', 'Cosmic pad', 8, function (r) { var f = hz(U(r, 48, 60)), dur = U(r, 3.5, 5), sc = pick(r, [[0, 7, 12, 19], [0, 5, 12, 17], [0, 3, 7, 14]]);
    return { dur: dur, make: function (o, sr) { sc.forEach(function (s, j) { tone(o, sr, { dur: dur - 0.02, f0: f * Math.pow(2, s / 12), harm: [1, 0.2, 0.1], vibR: 0.3 + j * 0.2, vibD: 0.004, atk: dur * 0.4, rel: dur * 0.4, gain: 0.5 }); }); reverb(o, sr, 0.35, 1.5); } } });
  fam('Space Ambience', 'Alien ambience', 8, function (r) { var f = L(r, 100, 300), dur = U(r, 3, 4.5);
    return { dur: dur, make: function (o, sr, rng) { tone(o, sr, { dur: dur - 0.02, f0: f, f1: f * 1.3, fmR: 1.4, fmD: 3, tremR: 4, tremD: 0.5, atk: dur * 0.3, rel: dur * 0.4, gain: 0.7 }); noise(o, sr, rng, { dur: dur - 0.02, bp0: 1000, bp1: 2500, q: 6, gain: 0.3, atk: dur * 0.3, rel: dur * 0.4, tremR: 3, tremD: 0.8 }); ring(o, sr, 35); reverb(o, sr, 0.3, 1.3); } } });

  // ===== ENGINES AND MACHINES =====
  fam('Engines & Machines', 'Spaceship engine', 12, function (r) { var f = L(r, 40, 90), dur = U(r, 2.5, 4);
    return { dur: dur, make: function (o, sr, rng) { tone(o, sr, { dur: dur - 0.02, f0: f, wave: 'saw', tremR: U(r, 10, 22), tremD: 0.3, atk: 0.4, rel: 0.5 }); noise(o, sr, rng, { dur: dur - 0.02, lp: 600, gain: 0.7, atk: 0.4, rel: 0.5 }); lowpass(o, sr, 1200); } } });
  fam('Engines & Machines', 'Hover hum', 8, function (r) { var f = L(r, 90, 180), dur = U(r, 2, 3.5);
    return { dur: dur, make: function (o, sr) { tone(o, sr, { dur: dur - 0.02, f0: f, wave: 'tri', fmR: 1, fmD: 1.5, tremR: 6, tremD: 0.3, atk: 0.3, rel: 0.4 }); tone(o, sr, { dur: dur - 0.02, f0: f * 2.01, gain: 0.4, atk: 0.3, rel: 0.4 }); } } });
  fam('Engines & Machines', 'Mech servo', 10, function (r) { var f = L(r, 300, 900), k = I(r, 1, 3);
    return { dur: k * 0.4 + 0.2, make: function (o, sr, rng) { for (var j = 0; j < k; j++) tone(o, sr, { t0: 0.04 + j * 0.4, dur: 0.3, f0: f, f1: f * U(rng, 1.5, 3), wave: 'saw', fmR: 8, fmD: 0.6, atk: 0.04, rel: 0.1, gain: 0.7 }); lowpass(o, sr, 3500); } } });
  fam('Engines & Machines', 'Hydraulic hiss', 10, function (r) { var dur = U(r, 0.5, 1.2), hp = U(r, 2000, 5000);
    return { dur: dur + 0.1, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur, hp: hp, atk: 0.01, dec: 3, rel: 0.1 }); tone(o, sr, { dur: 0.12, f0: 140, f1: 70, dec: 25, gain: 0.5 }); } } });
  fam('Engines & Machines', 'Reactor pulse', 10, function (r) { var f = L(r, 45, 80), rate = U(r, 1.5, 3.5), dur = U(r, 2.5, 3.5);
    return { dur: dur, make: function (o, sr) { for (var t = 0.05; t < dur - 0.3; t += 1 / rate) tone(o, sr, { t0: t, dur: 0.4 / rate + 0.1, f0: f * 2, f1: f, dec: 6, harm: [1, 0.3], gain: 0.9 }); tone(o, sr, { dur: dur - 0.02, f0: f * 3, tremR: rate, tremD: 0.6, gain: 0.25, atk: 0.3, rel: 0.4 }); } } });

  // ===== CINEMATIC =====
  fam('Cinematic Hits', 'Cinematic hit', 20, function (r) { var f = L(r, 45, 85), lp = U(r, 3000, 9000);
    return { dur: 2.4, make: function (o, sr, rng) { tone(o, sr, { dur: 1.8, f0: f * 2.2, f1: f * 0.7, curve: 0.3, dec: 2.4, gain: 1 }); noise(o, sr, rng, { dur: 0.4, lp: lp, dec: 9, atk: 0.0005, gain: 0.8 }); noise(o, sr, rng, { dur: 2, lp: 400, dec: 2, gain: 0.5 }); reverb(o, sr, 0.35, 1.6); } } });
  fam('Cinematic Hits', 'Stinger', 15, function (r) { var f = hz(U(r, 52, 64)), ch = pick(r, [[0, 3, 6, 9], [0, 1, 7, 8], [0, 4, 7, 11], [0, 5, 6, 11]]);
    return { dur: 1.6, make: function (o, sr) { ch.forEach(function (s) { tone(o, sr, { dur: 1.4, f0: f * Math.pow(2, s / 12), wave: 'saw', atk: 0.003, dec: 3.2, gain: 0.5 }); }); lowpass(o, sr, 3500); reverb(o, sr, 0.25, 1); } } });
  fam('Cinematic Hits', 'Punch', 15, function (r) { var f = L(r, 70, 140);
    return { dur: 0.45, make: function (o, sr, rng) { tone(o, sr, { dur: 0.3, f0: f * 2.5, f1: f * 0.6, curve: 0.4, dec: 12, gain: 1 }); noise(o, sr, rng, { dur: 0.1, bp: L(rng, 800, 2500), q: 0.8, dec: 40, atk: 0.0005, gain: 0.7 }); } } });
  fam('Braams & Booms', 'Braam', 15, function (r) { var f = L(r, 38, 70), det = U(r, 0.004, 0.02), dur = U(r, 2.2, 3.2);
    return { dur: dur, make: function (o, sr) { [1, 1 + det, 1 - det, 2.01, 0.5].forEach(function (m, j) { tone(o, sr, { dur: dur - 0.02, f0: f * m, f1: f * m * 0.9, wave: 'saw', atk: 0.04, dec: 1.1, rel: 0.5, gain: j > 2 ? 0.3 : 0.6 }); }); drive(o, 2.5); lowpass(o, sr, 1800); reverb(o, sr, 0.25, 1.3); } } });
  fam('Braams & Booms', 'Boom', 15, function (r) { var f = L(r, 35, 70);
    return { dur: 2.6, make: function (o, sr, rng) { tone(o, sr, { dur: 2.2, f0: f * 3, f1: f * 0.55, curve: 0.25, dec: 2, gain: 1 }); noise(o, sr, rng, { dur: 1.2, lp: 500, dec: 3, gain: 0.6, atk: 0.001 }); noise(o, sr, rng, { dur: 0.1, lp: 5000, dec: 40, atk: 0.0005, gain: 0.5 }); reverb(o, sr, 0.35, 1.8); } } });
  fam('Risers & Downers', 'Riser', 25, function (r) { var dur = U(r, 1.5, 4), b0 = L(r, 150, 500), f = L(r, 80, 250);
    return { dur: dur + 0.05, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur, bp0: b0, bp1: b0 * 14, q: 2, curve: 2, atk: dur * 0.5, rel: 0.02, gain: 0.8 }); tone(o, sr, { dur: dur, f0: f, f1: f * 8, curve: 2.2, wave: 'saw', atk: dur * 0.5, rel: 0.02, gain: 0.35 }); } } });
  fam('Risers & Downers', 'Downer', 25, function (r) { var dur = U(r, 1.2, 3.5), b0 = L(r, 3000, 7000), f = L(r, 600, 1800);
    return { dur: dur + 0.05, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur, bp0: b0, bp1: b0 / 14, q: 2, curve: 0.6, atk: 0.01, dec: 1.2, rel: 0.2, gain: 0.8 }); tone(o, sr, { dur: dur, f0: f, f1: f / 12, curve: 0.6, wave: 'saw', atk: 0.01, dec: 1, rel: 0.2, gain: 0.35 }); } } });
  fam('Big Whooshes', 'Whoosh', 30, function (r) { var dur = U(r, 0.5, 1.6), b0 = L(r, 200, 1200), b1 = b0 * U(r, 3, 9), up = r() < 0.5, pk = U(r, 0.35, 0.65);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.01, bp0: up ? b0 : b1, bp1: up ? b1 : b0, q: 1.6, atk: 0.001, rel: 0.001, shape: function (x) { var d = (x - pk) / (x < pk ? pk : 1 - pk); return Math.exp(-3.2 * d * d); } }); } } });
  fam('Big Whooshes', 'Swish', 20, function (r) { var dur = U(r, 0.18, 0.4), b0 = L(r, 1500, 4000);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.005, bp0: b0, bp1: b0 * (r() < 0.5 ? 2 : 0.5), q: 1.2, shape: function (x) { return Math.sin(Math.PI * x); }, atk: 0.001, rel: 0.001 }); } } });
  fam('Glitch & Tape', 'Glitch', 20, function (r) { var k = I(r, 5, 12), dur = U(r, 0.4, 0.9);
    return { dur: dur + 0.1, make: function (o, sr, rng) { for (var j = 0; j < k; j++) { var t = rng() * dur, ln = U(rng, 0.01, 0.06); if (rng() < 0.5) tone(o, sr, { t0: t, dur: ln, f0: L(rng, 200, 5000), wave: pick(rng, ['sq', 'saw']), gain: 0.7, atk: 0.001, rel: 0.002 }); else burst(o, sr, rng, t, ln * 1000, L(rng, 1000, 7000), 1.2, 0.8, 5); } crush(o, I(r, 4, 8), I(r, 2, 8)); } } });
  fam('Glitch & Tape', 'Tape stop', 10, function (r) { var f = L(r, 300, 900), dur = U(r, 0.6, 1.4);
    return { dur: dur + 0.05, make: function (o, sr) { tone(o, sr, { dur: dur, f0: f, f1: 22, curve: 0.5, wave: 'saw', harm: null, rel: 0.05, gain: 0.8 }); tone(o, sr, { dur: dur, f0: f * 1.5, f1: 30, curve: 0.5, wave: 'sq', gain: 0.3, rel: 0.05 }); lowpass(o, sr, 3000); } } });
  fam('Glitch & Tape', 'Vinyl and rewind', 10, function (r) { var dur = U(r, 1, 2), rw = r() < 0.5;
    return { dur: dur + 0.05, make: function (o, sr, rng) { for (var j = 0; j < dur * 40; j++) burst(o, sr, rng, rng() * dur, 2, L(rng, 1500, 6000), 1, 0.2 + rng() * 0.6, 500); if (rw) { noise(o, sr, rng, { dur: dur * 0.6, bp0: 800, bp1: 5000, q: 1.5, gain: 0.7, atk: 0.02, rel: 0.1, tremR: 40, tremD: 0.6 }); tone(o, sr, { dur: dur * 0.6, f0: 300, f1: 2400, wave: 'saw', gain: 0.25, rel: 0.1 }); } } } });

  // ===== HORROR =====
  fam('Horror', 'Dark drone', 12, function (r) { var f = L(r, 35, 90), dur = U(r, 3.5, 5), bad = pick(r, [1.06, 1.414, 1.5, 1.335]);
    return { dur: dur, make: function (o, sr) { tone(o, sr, { dur: dur - 0.02, f0: f, wave: 'saw', tremR: U(r, 0.3, 1), tremD: 0.4, atk: dur * 0.4, rel: dur * 0.4, gain: 0.6 }); tone(o, sr, { dur: dur - 0.02, f0: f * bad * 2, wave: 'sin', vibR: 0.5, vibD: 0.01, atk: dur * 0.4, rel: dur * 0.4, gain: 0.3 }); lowpass(o, sr, 900); reverb(o, sr, 0.3, 1.4); } } });
  fam('Horror', 'Creak', 12, function (r) { var f = L(r, 120, 400), dur = U(r, 0.8, 1.8);
    return { dur: dur, make: function (o, sr, rng) { var t = 0; while (t < dur - 0.1) { var ln = U(rng, 0.05, 0.2); tone(o, sr, { t0: t, dur: ln, f0: f * U(rng, 0.8, 1.6), f1: f * U(rng, 0.8, 2.5), wave: 'saw', gain: 0.7, atk: 0.01, rel: 0.02, vibR: 40, vibD: 0.08 }); t += ln * U(rng, 0.7, 1.2); } noise(o, sr, rng, { dur: dur - 0.02, bp: f * 4, q: 5, gain: 0.3, atk: 0.1, rel: 0.2 }); lowpass(o, sr, 3500); } } });
  fam('Horror', 'Heartbeat', 8, function (r) { var bpm = U(r, 55, 100), k = I(r, 3, 5), f = L(r, 50, 80);
    return { dur: k * 60 / bpm + 0.3, make: function (o, sr) { for (var j = 0; j < k; j++) { var t = 0.05 + j * 60 / bpm; tone(o, sr, { t0: t, dur: 0.2, f0: f * 1.6, f1: f, dec: 20, gain: 1 }); tone(o, sr, { t0: t + 0.2, dur: 0.18, f0: f * 1.4, f1: f * 0.9, dec: 22, gain: 0.7 }); } lowpass(o, sr, 400); } } });
  fam('Horror', 'Whisper', 8, function (r) { var dur = U(r, 1.5, 2.5), b = U(r, 3000, 6000);
    return { dur: dur, make: function (o, sr, rng) { noise(o, sr, rng, { dur: dur - 0.02, bp: b, q: 1.5, atk: 0.1, rel: 0.2, tremR: U(r, 4, 7), tremD: 0.85 }); noise(o, sr, rng, { dur: dur - 0.02, bp: b * 0.45, q: 2, gain: 0.5, atk: 0.1, rel: 0.2, tremR: U(r, 3, 6), tremD: 0.8 }); reverb(o, sr, 0.3, 1.2); } } });
  fam('Horror', 'Screech', 10, function (r) { var f = L(r, 1200, 2800), dur = U(r, 0.6, 1.4);
    return { dur: dur, make: function (o, sr) { tone(o, sr, { dur: dur - 0.02, f0: f, f1: f * U(r, 1.2, 1.8), wave: 'saw', vibR: U(r, 5, 9), vibD: 0.04, atk: 0.05, rel: 0.2, fmR: 1, fmD: 0.4, gain: 0.7 }); tone(o, sr, { dur: dur - 0.02, f0: f * 1.06, f1: f * 1.9, wave: 'saw', atk: 0.05, rel: 0.2, gain: 0.5 }); lowpass(o, sr, 6000); reverb(o, sr, 0.2, 1); } } });

  // ===== UI =====
  fam('Clicks & Taps', 'Click', 20, function (r) { var bp = L(r, 1500, 5000), tn = r() < 0.5;
    return { dur: 0.07, make: function (o, sr, rng) { burst(o, sr, rng, 0, 14, bp, 1.2, 1, 150); if (tn) tone(o, sr, { dur: 0.05, f0: bp / 3, f1: bp / 5, dec: 60, gain: 0.5 }); } } });
  fam('Clicks & Taps', 'Tap', 15, function (r) { var f = L(r, 250, 900);
    return { dur: 0.16, make: function (o, sr) { tone(o, sr, { dur: 0.12, f0: f * 1.5, f1: f, dec: 35, gain: 1, atk: 0.001 }); } } });
  fam('Clicks & Taps', 'Toggle', 15, function (r) { var f = L(r, 500, 1400), on = r() < 0.5;
    return { dur: 0.22, make: function (o, sr) { [0, 1].forEach(function (j) { tone(o, sr, { t0: j * 0.06, dur: 0.07, f0: f * (on ? (j ? 1.5 : 1) : (j ? 0.67 : 1)), dec: 30, gain: 0.8, atk: 0.001 }); }); } } });
  fam('Notifications', 'Chime ping', 50, function (r) { var f = hz(U(r, 72, 96)), k = I(r, 1, 3), sc = SCALES[pick(r, ['pent', 'major'])], w = pick(r, [[1, 0.3, 0.1], [1, 0, 0.3], [1, 0.5, 0.25, 0.1]]), gap = U(r, 0.09, 0.2), de = U(r, 4, 9);
    return { dur: k * gap + 0.9, make: function (o, sr) { var n0 = I(r, 0, 3); for (var j = 0; j < k; j++) tone(o, sr, { t0: j * gap, dur: 0.8, f0: f * Math.pow(2, sc[(n0 + j * 2) % sc.length] / 12), harm: w, dec: de, atk: 0.002, gain: 0.8 }); reverb(o, sr, 0.15, 0.7); } } });
  fam('Success & Error', 'Success', 20, function (r) { var f = hz(U(r, 60, 72)), k = I(r, 2, 4), sc = pick(r, [[0, 4, 7, 12], [0, 2, 7, 9], [0, 5, 9, 12]]);
    return { dur: k * 0.1 + 0.8, make: function (o, sr) { for (var j = 0; j < k; j++) tone(o, sr, { t0: j * 0.1, dur: 0.6, f0: f * Math.pow(2, sc[j] / 12), harm: [1, 0.35, 0.12], dec: 5, gain: 0.7 }); reverb(o, sr, 0.15, 0.7); } } });
  fam('Success & Error', 'Error', 20, function (r) { var f = L(r, 120, 400), k = I(r, 1, 3), w = pick(r, ['sq', 'saw']);
    return { dur: k * 0.17 + 0.2, make: function (o, sr) { for (var j = 0; j < k; j++) tone(o, sr, { t0: j * 0.17, dur: 0.13, f0: f * (r() < 0.5 ? 1 : 0.84), wave: w, atk: 0.003, rel: 0.02, gain: 0.8 }); lowpass(o, sr, 2200); } } });

  // ===== GAME 8-BIT =====
  fam('Game 8-bit', 'Coin', 10, function (r) { var f = hz(U(r, 80, 88));
    return { dur: 0.6, make: function (o, sr) { tone(o, sr, { dur: 0.07, f0: f, wave: 'sq', pw: 0.5, atk: 0.001, rel: 0.005, gain: 0.8 }); tone(o, sr, { t0: 0.07, dur: 0.45, f0: f * 1.335, wave: 'sq', pw: 0.5, dec: 7, gain: 0.8 }); } } });
  fam('Game 8-bit', 'Jump', 10, function (r) { var f = L(r, 150, 400);
    return { dur: 0.4, make: function (o, sr) { tone(o, sr, { dur: 0.3, f0: f, f1: f * 4, curve: 0.8, wave: 'sq', pw: 0.25, dec: 3, gain: 0.8 }); } } });
  fam('Game 8-bit', 'Pickup', 8, function (r) { var f = hz(U(r, 72, 84)), k = I(r, 3, 5);
    return { dur: k * 0.05 + 0.3, make: function (o, sr) { for (var j = 0; j < k; j++) tone(o, sr, { t0: j * 0.05, dur: 0.08, f0: f * Math.pow(2, SCALES.major[j] / 12), wave: 'sq', pw: 0.5, dec: 8, gain: 0.8 }); } } });
  fam('Game 8-bit', 'Level up', 10, function (r) { var f = hz(U(r, 60, 68)), sc = pick(r, ['major', 'pent']);
    return { dur: 1.2, make: function (o, sr) { var s = SCALES[sc]; for (var j = 0; j < 6; j++) tone(o, sr, { t0: j * 0.09, dur: 0.12, f0: f * Math.pow(2, (s[j % s.length] + 12 * Math.floor(j / s.length)) / 12), wave: 'sq', pw: 0.3, dec: 6, gain: 0.7 }); tone(o, sr, { t0: 0.6, dur: 0.55, f0: f * 4, wave: 'sq', pw: 0.5, dec: 4, gain: 0.8 }); } } });
  fam('Game 8-bit', 'Hurt', 8, function (r) { var f = L(r, 200, 500);
    return { dur: 0.4, make: function (o, sr, rng) { tone(o, sr, { dur: 0.3, f0: f, f1: f * 0.3, wave: 'sq', dec: 5, gain: 0.8 }); noise(o, sr, rng, { dur: 0.2, hp: 1500, dec: 12, gain: 0.5 }); crush(o, 6, 3); } } });
  fam('Game 8-bit', '8-bit explosion', 8, function (r) { var lp = U(r, 1500, 4000);
    return { dur: 1, make: function (o, sr, rng) { noise(o, sr, rng, { dur: 0.9, lp0: lp, lp1: 200, dec: 3, gain: 1 }); crush(o, 5, 4); } } });
  fam('Game 8-bit', 'Game over', 6, function (r) { var f = hz(U(r, 55, 62));
    return { dur: 1.6, make: function (o, sr) { [0, -2, -4, -7, -12].forEach(function (s, j) { tone(o, sr, { t0: j * 0.22, dur: j === 4 ? 0.5 : 0.2, f0: f * Math.pow(2, s / 12), wave: 'sq', pw: 0.4, dec: j === 4 ? 4 : 8, gain: 0.8 }); }); } } });

  // ===== CARTOON AND FUN =====
  fam('Cartoon', 'Boing', 10, function (r) { var f = L(r, 150, 400), w = U(r, 12, 22);
    return { dur: 0.9, make: function (o, sr) { tone(o, sr, { dur: 0.85, f0: f, f1: f * 2.2, curve: 0.3, vibR: w, vibD: 0.35, dec: 4, fmR: 1, fmD: 1, gain: 0.9 }); } } });
  fam('Cartoon', 'Slide whistle', 10, function (r) { var f = L(r, 400, 900), up = r() < 0.5, dur = U(r, 0.5, 1);
    return { dur: dur + 0.05, make: function (o, sr) { tone(o, sr, { dur: dur, f0: up ? f : f * 4, f1: up ? f * 4 : f, vibR: 6, vibD: 0.01, atk: 0.03, rel: 0.05 }); } } });
  fam('Cartoon', 'Cartoon pop', 10, function (r) { var f = L(r, 300, 900);
    return { dur: 0.25, make: function (o, sr, rng) { tone(o, sr, { dur: 0.15, f0: f * 3, f1: f * 0.8, curve: 0.3, dec: 25, gain: 1 }); burst(o, sr, rng, 0, 12, 2500, 1, 0.4, 100); } } });
  fam('Cartoon', 'Squeak', 8, function (r) { var f = L(r, 1500, 3000), k = I(r, 1, 3);
    return { dur: k * 0.2 + 0.15, make: function (o, sr) { for (var j = 0; j < k; j++) tone(o, sr, { t0: j * 0.2, dur: 0.12, f0: f, f1: f * 1.5, curve: 0.5, harm: [1, 0.4, 0.2], vibR: 40, vibD: 0.03, dec: 10, gain: 0.8 }); } } });
  fam('Cartoon', 'Bonk', 6, function (r) { var f = L(r, 250, 500);
    return { dur: 0.5, make: function (o, sr) { tone(o, sr, { dur: 0.35, f0: f, f1: f * 0.7, dec: 14, harm: [1, 0.5, 0.2], gain: 0.9 }); tone(o, sr, { dur: 0.2, f0: f * 2.4, f1: f * 1.8, dec: 25, gain: 0.5 }); } } });
  fam('Cartoon', 'Honk', 6, function (r) { var f = L(r, 250, 420);
    return { dur: 0.5, make: function (o, sr) { tone(o, sr, { dur: 0.35, f0: f, f1: f * 0.95, wave: 'saw', atk: 0.01, rel: 0.06, gain: 0.8 }); tone(o, sr, { dur: 0.35, f0: f * 1.5, wave: 'sq', gain: 0.4, atk: 0.01, rel: 0.06 }); lowpass(o, sr, 2500); } } });

  // ===== BELLS, CHIMES, PLUCKS, KEYS =====
  var BELL = [[1, 1, 1], [2.76, 0.6, 1.6], [5.4, 0.4, 2.4], [8.93, 0.25, 3.4]];
  fam('Bells & Chimes', 'Bell', 20, function (r) { var f = hz(U(r, 60, 90)), de = U(r, 1.5, 3.5);
    return { dur: 2.6, make: function (o, sr) { BELL.forEach(function (b) { tone(o, sr, { dur: 2.4, f0: f * b[0], dec: de * b[2], gain: b[1], atk: 0.001 }); }); } } });
  fam('Bells & Chimes', 'Wind chimes', 15, function (r) { var k = I(r, 5, 10), sc = SCALES.pent, f = hz(U(r, 76, 88));
    return { dur: k * 0.13 + 1.6, make: function (o, sr, rng) { for (var j = 0; j < k; j++) tone(o, sr, { t0: j * 0.13 * U(rng, 0.5, 1.4), dur: 1.4, f0: f * Math.pow(2, sc[Math.floor(rng() * 5)] / 12 + Math.floor(rng() * 2)), harm: [1, 0, 0.12], dec: 3.2, gain: 0.5 + rng() * 0.4 }); reverb(o, sr, 0.2, 0.9); } } });
  fam('Bells & Chimes', 'Glockenspiel', 15, function (r) { var f = hz(U(r, 80, 100)), k = I(r, 1, 4), sc = SCALES.major;
    return { dur: k * 0.16 + 0.9, make: function (o, sr, rng) { for (var j = 0; j < k; j++) { var fr = f * Math.pow(2, sc[Math.floor(rng() * 7)] / 12); tone(o, sr, { t0: j * 0.16, dur: 0.8, f0: fr, dec: 6, gain: 0.8 }); tone(o, sr, { t0: j * 0.16, dur: 0.5, f0: fr * 4.1, dec: 12, gain: 0.25 }); } } } });
  function pluck(o, sr, rng, f, dur, damp, gain, t0) {
    var N = Math.max(2, Math.round(sr / f)), line = new Float32Array(N), len = Math.round(dur * sr), buf = new Float32Array(len), i, k = 0;
    for (i = 0; i < N; i++) line[i] = rng() * 2 - 1;
    for (i = 0; i < len; i++) { var a = line[k], b = line[(k + 1) % N], v = (a + b) * 0.5 * damp; line[k] = v; k = (k + 1) % N; buf[i] = a; }
    mixIn(o, Math.round((t0 || 0) * sr), buf, gain);
  }
  fam('Plucks & Keys', 'Guitar pluck', 20, function (r) { var f = hz(U(r, 40, 64)), damp = U(r, 0.992, 0.999), dur = U(r, 0.8, 1.6), k = I(r, 1, 3);
    return { dur: dur + k * 0.12, make: function (o, sr, rng) { for (var j = 0; j < k; j++) pluck(o, sr, rng, f * Math.pow(2, [0, 4, 7][j] / 12), dur, damp, 0.8, j * 0.05); lowpass(o, sr, 5000); } } });
  fam('Plucks & Keys', 'Marimba', 10, function (r) { var f = hz(U(r, 55, 80));
    return { dur: 0.9, make: function (o, sr) { tone(o, sr, { dur: 0.8, f0: f, dec: 7, gain: 1, atk: 0.001 }); tone(o, sr, { dur: 0.3, f0: f * 4, dec: 25, gain: 0.35 }); } } });
  fam('Plucks & Keys', 'Kalimba', 10, function (r) { var f = hz(U(r, 64, 84)), k = I(r, 1, 3), sc = SCALES.pent;
    return { dur: k * 0.2 + 1.1, make: function (o, sr, rng) { for (var j = 0; j < k; j++) { var fr = f * Math.pow(2, sc[Math.floor(rng() * 5)] / 12); tone(o, sr, { t0: j * 0.2, dur: 1, f0: fr, dec: 5, gain: 0.8 }); tone(o, sr, { t0: j * 0.2, dur: 0.2, f0: fr * 5.4, dec: 30, gain: 0.3 }); } } } });

  // ===== DRUM HITS =====
  fam('Drum Hits', 'Kick', 14, function (r) { var f = L(r, 45, 70), sw = U(r, 3, 6), de = U(r, 7, 14);
    return { dur: 0.5, make: function (o, sr, rng) { tone(o, sr, { dur: 0.45, f0: f * sw, f1: f, curve: 0.18, dec: de, gain: 1 }); burst(o, sr, rng, 0, 8, 2500, 1, 0.3, 120); } } });
  fam('Drum Hits', 'Snare', 14, function (r) { var f = L(r, 160, 260), nz = U(r, 0.6, 1);
    return { dur: 0.4, make: function (o, sr, rng) { tone(o, sr, { dur: 0.2, f0: f * 1.3, f1: f, dec: 22, gain: 0.8 }); noise(o, sr, rng, { dur: 0.3, hp: 1500, lp: 9000, dec: 14, gain: nz, atk: 0.0005 }); } } });
  fam('Drum Hits', 'Hi-hat', 12, function (r) { var op = r() < 0.4, hp = L(r, 6000, 9000);
    return { dur: op ? 0.5 : 0.12, make: function (o, sr, rng) { noise(o, sr, rng, { dur: op ? 0.45 : 0.08, hp: hp, bp: 9000, q: 0.7, dec: op ? 8 : 45, atk: 0.0005 }); } } });
  fam('Drum Hits', 'Tom', 10, function (r) { var f = L(r, 80, 220);
    return { dur: 0.6, make: function (o, sr, rng) { tone(o, sr, { dur: 0.55, f0: f * 1.6, f1: f, curve: 0.3, dec: 8, harm: [1, 0.2], gain: 1 }); burst(o, sr, rng, 0, 10, 1800, 1, 0.25, 100); } } });
  fam('Drum Hits', 'Clap', 10, function (r) { var bp = L(r, 1000, 2200), k = I(r, 3, 5);
    return { dur: 0.45, make: function (o, sr, rng) { for (var j = 0; j < k; j++) burst(o, sr, rng, j * 0.011, 14, bp, 1, 0.8, 80); noise(o, sr, rng, { t0: k * 0.011, dur: 0.25, bp: bp, q: 1, dec: 14, gain: 0.7 }); reverb(o, sr, 0.15, 0.6); } } });

  // ===== AFRICAN DRUMS =====
  fam('African Drums', 'Djembe bass', 10, function (r) { var f = L(r, 65, 100);
    return { dur: 0.8, make: function (o, sr, rng) { tone(o, sr, { dur: 0.7, f0: f * 2, f1: f, curve: 0.25, dec: 7, harm: [1, 0.25], gain: 1 }); burst(o, sr, rng, 0, 15, 700, 1, 0.3, 80); } } });
  fam('African Drums', 'Djembe tone', 10, function (r) { var f = L(r, 180, 300);
    return { dur: 0.5, make: function (o, sr, rng) { tone(o, sr, { dur: 0.4, f0: f * 1.4, f1: f, curve: 0.3, dec: 14, harm: [1, 0.35, 0.1], gain: 1 }); burst(o, sr, rng, 0, 8, 2500, 1, 0.5, 120); } } });
  fam('African Drums', 'Djembe slap', 10, function (r) { var bp = L(r, 1500, 3000);
    return { dur: 0.16, make: function (o, sr, rng) { burst(o, sr, rng, 0, 40, bp, 1.2, 1, 55); tone(o, sr, { dur: 0.1, f0: 420, f1: 300, dec: 40, gain: 0.4 }); } } });
  fam('African Drums', 'Shekere', 8, function (r) { var k = I(r, 4, 9), gap = U(r, 0.07, 0.12);
    return { dur: k * gap + 0.25, make: function (o, sr, rng) { for (var j = 0; j < k; j++) noise(o, sr, rng, { t0: j * gap, dur: gap * 0.9, hp: 4000, bp: 7000, q: 0.7, shape: function (x) { return Math.sin(Math.PI * x); }, gain: 0.6 + 0.4 * (j % 2) }); } } });
  fam('African Drums', 'Log drum', 6, function (r) { var f = L(r, 50, 85);
    return { dur: 0.9, make: function (o, sr) { tone(o, sr, { dur: 0.85, f0: f * 1.5, f1: f, curve: 0.2, dec: 4.5, harm: [1, 0.5, 0.25], gain: 1 }); drive(o, 2.2); lowpass(o, sr, 1800); } } });
  fam('African Drums', 'Thumb piano', 6, function (r) { var f = hz(U(r, 60, 76)), k = I(r, 2, 4);
    return { dur: k * 0.18 + 1, make: function (o, sr, rng) { for (var j = 0; j < k; j++) tone(o, sr, { t0: j * 0.18, dur: 0.9, f0: f * Math.pow(2, SCALES.pent[Math.floor(rng() * 5)] / 12), harm: [1, 0, 0.2, 0, 0.05], dec: 5, gain: 0.8 }); } } });

  // ===== VOICES AND PADS =====
  var FORM = { ah: [800, 1150], oo: [320, 800], ee: [300, 2300], eh: [530, 1840], oh: [500, 1000] };
  fam('Voices & Pads', 'Choir pad', 30, function (r) { var f = hz(U(r, 45, 70)), v = pick(r, ['ah', 'oo', 'oh', 'eh', 'ee']), dur = U(r, 2.5, 4), ch = pick(r, [[0, 7], [0, 4, 7], [0, 5, 12], [0, 3, 7]]);
    return { dur: dur, make: function (o, sr, rng) { var fm = FORM[v], tmp = new Float32Array(o.length); ch.forEach(function (s, j) { tone(tmp, sr, { dur: dur - 0.02, f0: f * Math.pow(2, s / 12) * (1 + (j - 1) * 0.002), wave: 'saw', vibR: 5 + j * 0.4, vibD: 0.008, atk: dur * 0.35, rel: dur * 0.4, gain: 0.5 }); }); [fm[0], fm[1]].forEach(function (c, j) { var b = new Float32Array(tmp), s1 = 0, s2 = 0, fq = 2 * Math.sin(Math.PI * Math.min(c, sr / 6.5) / sr), pk = 0; for (var i = 0; i < b.length; i++) { s2 += fq * s1; var h = b[i] - s2 - 0.18 * s1; s1 += fq * h; b[i] = s1; if (Math.abs(s1) > pk) pk = Math.abs(s1); } if (pk > 0) for (i = 0; i < b.length; i++) o[i] += b[i] / pk * (j ? 0.5 : 1); }); reverb(o, sr, 0.3, 1.3); } } });

  // ===== HOUSEHOLD AND EVERYDAY =====
  fam('Household', 'Knock', 8, function (r) { var k = I(r, 2, 4), bp = L(r, 250, 600);
    return { dur: k * 0.2 + 0.3, make: function (o, sr, rng) { for (var j = 0; j < k; j++) { burst(o, sr, rng, 0.04 + j * 0.2, 50, bp, 1.5, 1, 40); tone(o, sr, { t0: 0.04 + j * 0.2, dur: 0.1, f0: bp * 0.6, f1: bp * 0.4, dec: 40, gain: 0.7 }); } } } });
  fam('Household', 'Door close', 6, function (r) { var f = L(r, 70, 120);
    return { dur: 0.6, make: function (o, sr, rng) { tone(o, sr, { dur: 0.5, f0: f * 2, f1: f, dec: 10, gain: 1 }); noise(o, sr, rng, { dur: 0.3, lp: 1500, dec: 12, gain: 0.5 }); burst(o, sr, rng, 0.02, 20, 3000, 1, 0.4, 100); reverb(o, sr, 0.2, 0.7); } } });
  fam('Household', 'Paper rustle', 6, function (r) { var dur = U(r, 0.6, 1.2);
    return { dur: dur, make: function (o, sr, rng) { for (var j = 0; j < dur * 30; j++) burst(o, sr, rng, rng() * (dur - 0.05), 3 + rng() * 15, L(rng, 3000, 8000), 0.8, 0.2 + rng() * 0.8, 200); } } });
  fam('Household', 'Zipper', 4, function (r) { var dur = U(r, 0.4, 0.8), up = r() < 0.5;
    return { dur: dur + 0.05, make: function (o, sr, rng) { var n = Math.round(dur * 70); for (var j = 0; j < n; j++) { var x = j / n; burst(o, sr, rng, (up ? x : 1 - x) * dur, 4, 2500 + 2500 * (up ? x : 1 - x), 2, 0.7, 300); } } } });
  fam('Household', 'Clock tick', 6, function (r) { var f = L(r, 1500, 3500), k = I(r, 3, 6);
    return { dur: k * 0.5 + 0.2, make: function (o, sr, rng) { for (var j = 0; j < k; j++) { burst(o, sr, rng, j * 0.5 + 0.02, 12, f * (j % 2 ? 0.85 : 1), 2, 1, 160); tone(o, sr, { t0: j * 0.5 + 0.02, dur: 0.05, f0: f * (j % 2 ? 0.4 : 0.5), dec: 80, gain: 0.3 }); } } } });
  fam('Household', 'Camera shutter', 6, function (r) { var bp = L(r, 2000, 4000);
    return { dur: 0.35, make: function (o, sr, rng) { burst(o, sr, rng, 0.02, 14, bp, 1.5, 1, 120); burst(o, sr, rng, 0.11, 22, bp * 0.6, 1.5, 0.8, 90); tone(o, sr, { t0: 0.02, dur: 0.04, f0: 400, dec: 90, gain: 0.4 }); } } });
  fam('Household', 'Phone ring', 6, function (r) { var f = L(r, 1000, 1600), k = I(r, 2, 3);
    return { dur: k * 0.5 + 0.3, make: function (o, sr) { for (var j = 0; j < k; j++) { tone(o, sr, { t0: j * 0.5, dur: 0.4, f0: f, f1: f * 1.02, wave: 'sq', pw: 0.5, tremR: 22, tremD: 0.9, atk: 0.005, rel: 0.02, gain: 0.7 }); } lowpass(o, sr, 3500); } } });
  fam('Household', 'Alarm', 6, function (r) { var f = L(r, 800, 1500), k = I(r, 3, 5);
    return { dur: k * 0.25 + 0.15, make: function (o, sr) { for (var j = 0; j < k; j++) tone(o, sr, { t0: j * 0.25, dur: 0.15, f0: f, wave: 'sq', atk: 0.003, rel: 0.01, gain: 0.8 }); lowpass(o, sr, 4000); } } });
  fam('Household', 'Siren', 6, function (r) { var f = L(r, 500, 900), dur = U(r, 1.8, 3);
    return { dur: dur, make: function (o, sr) { var cyc = I(r, 2, 3); for (var j = 0; j < cyc; j++) { var seg = dur / cyc; tone(o, sr, { t0: j * seg, dur: seg * 0.5, f0: f, f1: f * 1.6, wave: 'saw', atk: 0.02, rel: 0.01, gain: 0.7 }); tone(o, sr, { t0: j * seg + seg * 0.5, dur: seg * 0.5 - 0.005, f0: f * 1.6, f1: f, wave: 'saw', atk: 0.01, rel: 0.02, gain: 0.7 }); } lowpass(o, sr, 3500); } } });
  fam('Household', 'Car horn', 6, function (r) { var f = L(r, 300, 450), k = I(r, 1, 2);
    return { dur: k * 0.5 + 0.2, make: function (o, sr) { for (var j = 0; j < k; j++) { tone(o, sr, { t0: j * 0.5, dur: 0.38, f0: f, wave: 'saw', atk: 0.01, rel: 0.03, gain: 0.7 }); tone(o, sr, { t0: j * 0.5, dur: 0.38, f0: f * 1.26, wave: 'saw', atk: 0.01, rel: 0.03, gain: 0.7 }); } lowpass(o, sr, 2500); } } });

  // ---------------- putting them into NakiSfx ----------------
  function finish(o, sr) {
    var n = o.length, i, pk = 0;
    for (i = 0; i < n; i++) { var v = o[i]; if (!isFinite(v)) v = 0; o[i] = v; if (Math.abs(v) > pk) pk = Math.abs(v); }
    var k = pk > 0 ? 0.85 / pk : 0, rin = Math.max(1, Math.round(sr * 0.001)), rout = Math.max(1, Math.round(sr * 0.004));
    for (i = 0; i < n; i++) o[i] = o[i] * k * Math.min(1, i / rin, (n - 1 - i) / rout);
    pk = 0; for (i = 0; i < n; i++) if (Math.abs(o[i]) > pk) pk = Math.abs(o[i]);
    if (pk > 0) for (i = 0; i < n; i++) o[i] *= 0.85 / pk;   // the fades can only lower the loudest sample: bring it back to 0.85
    return o;
  }
  function renderMore(key, sr) {
    var d = BYKEY[key]; if (!d) return null; sr = sr || 48000;
    var n = Math.round(d.durMs * sr / 1000), o = new Float32Array(n);
    d.build(mkRng(d.snap), d.i).make(o, sr, mkRng(hashStr(key)));   // the parameters are drawn again from the same start, so every render is identical
    return finish(o, sr);
  }
  var ctx = null, cur = null;
  function preview(key) {   // listen to an effect without adding it
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      ctx = ctx || new AC(); if (ctx.state === 'suspended') ctx.resume();
      var s = renderMore(key, 24000) || (window.NakiSfx && window.NakiSfx._orig ? window.NakiSfx._orig(key, 24000) : null); if (!s) return false;
      var b = ctx.createBuffer(1, s.length, 24000); b.getChannelData(0).set(s);
      if (cur) { try { cur.stop(); } catch (e) {} }
      cur = ctx.createBufferSource(); cur.buffer = b; cur.connect(ctx.destination); cur.start(); return true;
    } catch (e) { return false; }
  }
  function apply(api) {
    if (!api || api._more) return api;
    api._more = true; api._orig = api.render;
    DEFS.forEach(function (d) { api.LIST.push({ key: d.key, label: d.label, cat: d.cat, durMs: d.durMs }); });
    api.render = function (key, sr) { return BYKEY[key] ? renderMore(key, sr) : api._orig(key, sr); };
    api.preview = preview; api.MORE_COUNT = DEFS.length;
    if (typeof window !== 'undefined') { window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['sfx-more.js'] = 'sfx-more'; }
    return api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = apply;
  if (typeof window !== 'undefined' && window.NakiSfx) apply(window.NakiSfx);
})();
