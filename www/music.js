'use strict';
/* Naki music: ten background tracks made entirely by code (no recordings, so there is no licence to carry and nothing to download), as stereo sound,
   plus a WAV writer so a track can be kept like any other music file. The same numbers always make the same music.
   Each track is built bar by bar from a chord pattern, a bass line, drums and a few instruments, then softly limited and set to a safe loudness.
   A track is a whole number of bars and its tail wraps round to the start, so it also loops without a click.
   render(key, { seconds, sr }) -> { left, right, sr, bars, bpm, durMs } (seconds is a target: the length is the nearest whole number of bars, at most 180 s)
   toWav(left, right, sr)       -> 16-bit stereo WAV file bytes */
var NakiMusic = (function () {
  var TAU = 2 * Math.PI;
  var LIST = [
    { key: 'calm', label: 'Calm', bpm: 66, cat: 'Chill' }, { key: 'lofi', label: 'Lo-fi', bpm: 80, cat: 'Chill' }, { key: 'romantic', label: 'Romantic', bpm: 72, cat: 'Chill' },
    { key: 'upbeat', label: 'Upbeat', bpm: 118, cat: 'Happy' }, { key: 'funny', label: 'Funny', bpm: 112, cat: 'Happy' }, { key: 'afro', label: 'Afro groove', bpm: 104, cat: 'Happy' },
    { key: 'hiphop', label: 'Hip-hop', bpm: 90, cat: 'Beat' }, { key: 'action', label: 'Action', bpm: 140, cat: 'Beat' },
    { key: 'cinematic', label: 'Cinematic', bpm: 70, cat: 'Drama' }, { key: 'suspense', label: 'Suspense', bpm: 60, cat: 'Drama' }
  ];
  function find(key) { for (var i = 0; i < LIST.length; i++) if (LIST[i].key === key) return LIST[i]; return null; }

  // ---------- small tools ----------
  function rng(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2147483648 - 1; }; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function lp(fc, sr) { return 1 - Math.exp(-TAU * Math.max(20, fc) / sr); }
  function lpf(sr) { var y = 0; return function (x, fc) { y += lp(fc, sr) * (x - y); return y; }; }   // a low-pass that remembers its own state
  function ex(t, k) { return Math.exp(-t * k); }
  function saw(ph) { var x = ph / TAU; x -= Math.floor(x); return 2 * x - 1; }
  function adsr(tt, dur, a, rel) { if (tt < a) return tt / a; if (tt <= dur) return 1; var r = 1 - (tt - dur) / rel; return r > 0 ? r * r : 0; }
  function gate(t, a, b, ramp) { return Math.max(0, Math.min(1, (t - a) / ramp, (b - t) / ramp)); }
  var CH = { maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], sus2: [0, 2, 7] };
  function notes(root, type) { return CH[type].map(function (s) { return root + s; }); }

  // The song's workspace: left and right sound for a whole number of bars. Notes written past the end wrap round to the start.
  function Eng(sr, bpm, bars, seed) {
    var beat = 60 / bpm, N = Math.round(bars * 4 * beat * sr);
    return { sr: sr, beat: beat, bar: 4 * beat, bars: bars, N: N, L: new Float32Array(N), R: new Float32Array(N), rnd: rng(seed) };
  }
  function put(E, i, v, pan) { i %= E.N; var a = (pan + 1) * Math.PI / 4; E.L[i] += v * Math.cos(a); E.R[i] += v * Math.sin(a); }   // pan: -1 left, 0 middle, 1 right
  function run(E, t, secs, fn, pan) { var i0 = Math.round(t * E.sr), n = Math.round(secs * E.sr); for (var k = 0; k < n; k++) put(E, i0 + k, fn(k, k / E.sr), pan || 0); }
  function choice(E, list) { return list[Math.min(list.length - 1, Math.floor((E.rnd() + 1) / 2 * list.length))]; }
  // calls fn(bar, step, time) for the 16 steps of every bar; odd steps are pushed late by `swing` (a fraction of a step)
  function grid(E, swing, fn) {
    for (var b = 0; b < E.bars; b++) for (var s = 0; s < 16; s++) fn(b, s, b * E.bar + s * E.beat / 4 + ((s % 2) ? (swing || 0) * E.beat / 4 : 0));
  }
  function has(list, s) { return list.indexOf(s) >= 0; }

  // ---------- the instruments ----------
  var V = {
    kick: function (E, t, vel) { var ph = 0; run(E, t, 0.45, function (k, tt) { ph += TAU * (45 + 120 * ex(tt, 38)) / E.sr; return (Math.sin(ph) * ex(tt, 8) + 0.15 * E.rnd() * ex(tt, 300)) * vel; }, 0); },
    snare: function (E, t, vel, pan) { var f = lpf(E.sr); run(E, t, 0.3, function (k, tt) { var x = E.rnd(); return ((x - f(x, 1800)) * ex(tt, 17) + 0.5 * Math.sin(TAU * 185 * tt) * ex(tt, 30)) * vel; }, pan); },
    hat: function (E, t, vel, open, pan) { var f = lpf(E.sr), kk = open ? 10 : 60; run(E, t, open ? 0.4 : 0.1, function (k, tt) { var x = E.rnd(); return (x - f(x, 7000)) * ex(tt, kk) * vel * 0.7; }, pan); },
    clap: function (E, t, vel, pan) {
      var a = lpf(E.sr), b = lpf(E.sr);
      run(E, t, 0.35, function (k, tt) { var x = E.rnd(), band = a(x, 3000) - b(x, 600), e = 0; for (var j = 0; j < 3; j++) { var l = tt - j * 0.012; if (l >= 0 && l < 0.012) e = Math.max(e, ex(l, 120)); } if (tt >= 0.036) e = Math.max(e, 0.6 * ex(tt - 0.036, 16)); return band * e * 2.2 * vel; }, pan);
    },
    shaker: function (E, t, vel, pan) { var a = lpf(E.sr), b = lpf(E.sr); run(E, t, 0.12, function (k, tt) { var x = E.rnd(); return (a(x, 9000) - b(x, 3500)) * Math.min(1, tt / 0.008) * ex(tt, 40) * vel * 3; }, pan); },
    conga: function (E, t, freq, vel, pan) { var ph = 0; run(E, t, 0.3, function (k, tt) { ph += TAU * freq * (1 + 0.35 * ex(tt, 40)) / E.sr; return (Math.sin(ph) * ex(tt, 14) + 0.2 * E.rnd() * ex(tt, 200)) * vel; }, pan); },
    tom: function (E, t, vel) { var ph = 0; run(E, t, 0.6, function (k, tt) { ph += TAU * (90 + 60 * ex(tt, 12)) / E.sr; return Math.sin(ph) * ex(tt, 6) * vel; }, 0); },
    tick: function (E, t, vel, pan) { var f = lpf(E.sr); run(E, t, 0.05, function (k, tt) { var x = E.rnd(); return ((x - f(x, 5000)) * ex(tt, 400) + 0.5 * Math.sin(TAU * 1800 * tt) * ex(tt, 300)) * vel; }, pan); },
    bass: function (E, t, dur, freq, vel) { var ph = 0, f = lpf(E.sr); run(E, t, dur + 0.1, function (k, tt) { ph += TAU * freq / E.sr; return f(saw(ph) * 0.6 + Math.sin(ph) * 0.8, 500 + 300 * ex(tt, 10)) * adsr(tt, dur, 0.006, 0.08) * vel * 1.6; }, 0); },
    sub: function (E, t, dur, freq, vel) { var ph = 0; run(E, t, dur + 0.15, function (k, tt) { ph += TAU * freq * (1 + 0.6 * ex(tt, 25)) / E.sr; return Math.tanh(1.5 * Math.sin(ph)) * ex(tt, 2.2) * Math.min(1, (dur + 0.15 - tt) / 0.05) * vel; }, 0); },
    pad: function (E, t, dur, freqs, vel, pan, o) {
      o = o || {}; var a = o.a || Math.min(0.6, dur * 0.35), rel = o.rel || 0.7, cut = o.cut || 1100, det = [0.9954, 1.0046], ph = [], f = lpf(E.sr), i, j;
      for (i = 0; i < freqs.length * 2; i++) ph.push(0);
      run(E, t, dur + rel, function (k, tt) {
        var s = 0, c = 0;
        for (i = 0; i < freqs.length; i++) for (j = 0; j < 2; j++) { ph[c] += TAU * freqs[i] * det[j] / E.sr; s += saw(ph[c]); c++; }
        return f(s / c * 2.2, cut) * adsr(tt, dur, a, rel) * vel;
      }, pan);
    },
    keys: function (E, t, dur, freq, vel, pan) { run(E, t, Math.min(2.5, dur + 0.8), function (k, tt) { var w = TAU * freq * tt; return Math.sin(w + 1.3 * ex(tt, 5) * Math.sin(w)) * ex(tt, 2.4) * Math.min(1, tt / 0.004) * vel; }, pan); },
    pluck: function (E, t, freq, vel, pan, o) {
      o = o || {}; var len = Math.max(2, Math.round(E.sr / freq)), buf = new Float32Array(len), idx = 0, damp = o.damp || 0.996, i;
      for (i = 0; i < len; i++) buf[i] = E.rnd();
      run(E, t, o.secs || 1.2, function () { var out = buf[idx]; buf[idx] = 0.5 * (out + buf[(idx + 1) % len]) * damp; idx = (idx + 1) % len; return out * vel; }, pan);
    },
    marimba: function (E, t, freq, vel, pan) { run(E, t, 0.7, function (k, tt) { var w = TAU * freq * tt; return (Math.sin(w) * ex(tt, 6) + 0.25 * Math.sin(4 * w) * ex(tt, 25)) * Math.min(1, tt / 0.003) * vel; }, pan); },
    bell: function (E, t, freq, vel, pan) { var R = [1, 2.76, 5.4], A = [1, 0.5, 0.25], D = [1.5, 2.5, 4]; run(E, t, 3, function (k, tt) { var s = 0; for (var j = 0; j < 3; j++) s += A[j] * Math.sin(TAU * freq * R[j] * tt) * ex(tt, D[j]); return s * Math.min(1, tt / 0.003) * vel; }, pan); },
    lead: function (E, t, dur, freq, vel, pan) {
      var ph = 0, ph2 = 0, f = lpf(E.sr);
      run(E, t, dur + 0.12, function (k, tt) { ph += TAU * freq * (1 + 0.004 * Math.sin(TAU * 5.5 * tt)) / E.sr; ph2 += TAU * freq * 1.005 / E.sr; return f(saw(ph) + 0.7 * saw(ph2), 2400 + 2500 * ex(tt, 8)) * adsr(tt, dur, 0.005, 0.1) * vel * 0.5; }, pan);
    },
    boom: function (E, t, vel) { var ph = 0, f = lpf(E.sr); run(E, t, 2, function (k, tt) { ph += TAU * (28 + 42 * ex(tt, 4)) / E.sr; return (Math.sin(ph) * ex(tt, 1.8) + f(E.rnd(), 300) * ex(tt, 9) * 0.6) * vel; }, 0); },
    riser: function (E, t, dur, vel) { var f = lpf(E.sr); run(E, t, dur, function (k, tt) { var u = tt / dur; return f(E.rnd(), 250 + 7000 * u * u) * u * u * vel * 2; }, 0); },
    drone: function (E, t, dur, freq, vel, pan) {
      var p1 = 0, p2 = 0, f = lpf(E.sr);
      run(E, t, dur + 1.5, function (k, tt) { p1 += TAU * freq / E.sr; p2 += TAU * freq * 1.006 / E.sr; return f(saw(p1) + saw(p2), 350) * adsr(tt, dur, 1.5, 1.5) * (0.8 + 0.2 * Math.sin(TAU * 0.15 * tt)) * vel; }, pan);
    }
  };
  function vinyl(E, level) {
    var f = lpf(E.sr);
    for (var i = 0; i < E.N; i++) { var x = E.rnd(); put(E, i, f(x, 6000) * 0.012 * level + (E.rnd() > 0.9994 ? E.rnd() * 0.08 * level : 0), 0); }
  }

  // ---------- the tracks ----------
  var BUILD = {
    calm: function (E) {
      var P = [[48, 'maj7'], [45, 'm7'], [53, 'maj7'], [55, 'sus2']], pent = [72, 74, 76, 79, 81, 84];
      for (var b = 0; b < E.bars; b++) {
        var c = P[b % 4], t = b * E.bar;
        V.pad(E, t, E.bar, notes(c[0] + 12, c[1]).map(mtof), 0.5, 0, { a: 1.2, rel: 1.2, cut: 900 });
        V.sub(E, t, E.bar * 0.95, mtof(c[0]), 0.3);
        for (var k = 0; k < 2; k++) V.bell(E, t + (k * 1.5 + 0.5 + Math.abs(E.rnd()) * 0.6) * E.beat, mtof(choice(E, pent)), 0.18, E.rnd() * 0.7);
      }
    },
    lofi: function (E) {
      var P = [[50, 'm7'], [55, 'dom7'], [48, 'maj7'], [45, 'm7']];
      grid(E, 0.2, function (b, s, t) {
        var c = P[b % 4];
        if (s === 0 || s === 6) notes(c[0] + 12, c[1]).forEach(function (n, i) { V.keys(E, t + i * 0.012, E.beat * 1.4, mtof(n), 0.17, (i - 1.5) * 0.25); });
        if (s === 0) V.sub(E, t, E.beat * 1.6, mtof(c[0] - 12), 0.5);
        if (s === 10) V.sub(E, t, E.beat * 0.8, mtof(c[0] - 12), 0.4);
        if (s === 0 || s === 10 || (s === 7 && b % 2)) V.kick(E, t, 0.75);
        if (s === 4 || s === 12) V.snare(E, t, 0.4, 0.1);
        if (s % 2 === 0) V.hat(E, t, 0.2 + 0.1 * (s % 4 === 0), false, 0.3); else V.hat(E, t, 0.07, false, -0.3);
      });
      vinyl(E, 1);
    },
    romantic: function (E) {
      var P = [[48, 'maj'], [45, 'min'], [53, 'maj'], [55, 'maj']], pat = [0, 1, 2, 3, 4, 3, 2, 1];
      for (var b = 0; b < E.bars; b++) {
        var c = P[b % 4], t = b * E.bar, ch = notes(c[0] + 12, c[1]), tones = [ch[0], ch[1], ch[2], ch[0] + 12, ch[1] + 12];
        V.pad(E, t, E.bar, notes(c[0] + 12, c[1]).map(mtof), 0.35, 0, { a: 0.8, rel: 1, cut: 1000 });
        V.sub(E, t, E.beat * 3, mtof(c[0] - 12), 0.35);
        for (var i = 0; i < 8; i++) V.keys(E, t + i * E.beat / 2, E.beat, mtof(tones[pat[i]]), 0.17, (i % 2 ? 0.25 : -0.25));
        if (b % 4 === 3) V.bell(E, t + 2 * E.beat, mtof(ch[2] + 24), 0.14, 0.4);
      }
    },
    upbeat: function (E) {
      var P = [[48, 'maj'], [43, 'maj'], [45, 'min'], [41, 'maj']], pat = [0, 1, 2, 1];
      grid(E, 0, function (b, s, t) {
        var c = P[b % 4], ch = notes(c[0] + 12, c[1]);
        if (s % 4 === 0) V.kick(E, t, 0.85);
        if (s === 4 || s === 12) V.clap(E, t, 0.5, 0.1);
        if (s % 4 === 2) V.hat(E, t, 0.3, true, 0.3); else if (s % 2) V.hat(E, t, 0.12, false, -0.3);
        if (s % 2 === 0) V.bass(E, t, E.beat / 2 * 0.85, mtof(c[0] - 12 + ((s / 2) % 4 === 3 ? 12 : 0)), 0.5);
        if (s % 2 === 0) V.pluck(E, t, mtof(ch[pat[(s / 2) % 4]] + 12), 0.3, (s % 4 ? 0.35 : -0.35), { secs: 0.7 });
        if (s === 0) V.pad(E, t, E.bar, ch.map(mtof), 0.15, 0, { cut: 900 });
      });
    },
    funny: function (E) {
      var P = [[48, 'maj'], [53, 'maj'], [55, 'maj'], [48, 'maj']], scale = [60, 62, 64, 65, 67, 69, 72], walk = [0, 1, 2, 1];
      grid(E, 0, function (b, s, t) {
        var c = P[b % 4], ch = notes(c[0] - 12, c[1]);
        if (s % 4 === 0) V.pluck(E, t, mtof(ch[walk[s / 4]]), 0.55, -0.1, { secs: 0.5, damp: 0.99 });
        if (s % 4 === 2) V.tick(E, t, 0.4, 0.3);
        if (has([0, 3, 6, 8, 11, 14], s)) V.pluck(E, t, mtof(choice(E, scale) + (b % 2 ? 12 : 0)), 0.32, 0.3, { secs: 0.4, damp: 0.985 });
        if (s % 4 === 0) V.hat(E, t, 0.12, false, -0.3);
      });
    },
    afro: function (E) {
      var P = [[43, 'maj'], [48, 'maj'], [50, 'maj'], [48, 'maj']];
      grid(E, 0.05, function (b, s, t) {
        var c = P[b % 4], ch = notes(c[0] + 12, c[1]);
        if (has([0, 6, 10], s)) V.kick(E, t, 0.75);
        if (s === 4 || s === 12) V.clap(E, t, 0.35, 0.2);
        V.shaker(E, t, s % 4 === 0 ? 0.16 : 0.08, s % 2 ? -0.4 : 0.4);
        if (has([2, 5, 7, 10, 13, 15], s)) V.conga(E, t, (s % 3 ? 250 : 330), 0.4, s % 2 ? 0.5 : -0.5);
        if (has([0, 3, 6, 10, 12], s)) V.bass(E, t, E.beat * 0.3, mtof(c[0] - 12), 0.55);
        if (has([0, 3, 6, 10], s)) ch.forEach(function (n, i) { V.marimba(E, t + i * 0.01, mtof(n + 12), 0.2, (i - 1) * 0.3); });
        if (has([8, 9, 14], s)) V.pluck(E, t, mtof(ch[(s + b) % 3] + 12), 0.22, 0.4, { secs: 0.5 });
      });
    },
    hiphop: function (E) {
      var P = [[48, 'min'], [44, 'maj'], [51, 'maj'], [46, 'maj']];
      grid(E, 0.12, function (b, s, t) {
        var c = P[b % 4];
        if (has([0, 7, 10], s)) V.kick(E, t, 0.9);
        if (s === 4 || s === 12) { V.snare(E, t, 0.6, 0.1); V.clap(E, t, 0.25, 0.1); }
        if (s % 2 === 0) V.hat(E, t, 0.28, false, 0.3); else V.hat(E, t, 0.1, false, -0.3);
        if (s === 0) V.sub(E, t, E.beat * 2.2, mtof(c[0] - 12), 0.6);
        if (s === 10) V.sub(E, t, E.beat, mtof(c[0] - 12), 0.5);
        if (s === 0 || s === 6) notes(c[0] + 12, c[1]).forEach(function (n, i) { V.keys(E, t + i * 0.01, E.beat * 0.8, mtof(n), 0.16, (i - 1) * 0.3); });
      });
      vinyl(E, 0.5);
    },
    action: function (E) {
      var P = [[40, 'min'], [36, 'maj'], [43, 'maj'], [38, 'maj']];
      grid(E, 0, function (b, s, t) {
        var c = P[b % 4];
        if (s % 4 === 0 || (s === 10 && b % 2)) V.kick(E, t, 0.9);
        if (s === 4 || s === 12) { V.snare(E, t, 0.6, 0); V.clap(E, t, 0.3, 0.15); }
        V.hat(E, t, s % 4 === 0 ? 0.28 : 0.16, false, s % 2 ? -0.3 : 0.3);
        V.bass(E, t, E.beat / 4 * 0.8, mtof(c[0] + (s === 6 || s === 14 ? 12 : 0)), 0.5);
        if (has([0, 3, 6, 10], s)) { V.lead(E, t, E.beat * 0.25, mtof(c[0] + 24), 0.3, -0.2); V.lead(E, t, E.beat * 0.25, mtof(c[0] + 31), 0.3, 0.2); }
        if (s === 0 && b % 4 === 0) V.boom(E, t, 0.6);
        if (s === 0 && b % 8 === 7) V.riser(E, t, E.bar, 0.5);
      });
    },
    cinematic: function (E) {
      var P = [[45, 'min'], [41, 'maj'], [48, 'maj'], [43, 'maj']];
      for (var b = 0; b < E.bars; b++) {
        var c = P[b % 4], t = b * E.bar, ch = notes(c[0] + 12, c[1]);
        V.pad(E, t, E.bar, ch.map(mtof), 0.5, 0, { a: 0.9, rel: 1.2, cut: 1500 });
        V.pad(E, t, E.bar, notes(c[0] - 12, c[1]).map(mtof), 0.3, 0, { a: 0.9, rel: 1.2, cut: 600 });
        V.sub(E, t, E.bar * 0.95, mtof(c[0] - 12), 0.3);
        if (b % 4 === 0) V.boom(E, t, 0.7);
        if (b % 2 === 1) V.boom(E, t + 2 * E.beat, 0.25);
        if (b % 2 === 0) V.bell(E, t + 2 * E.beat, mtof(ch[2] + 24), 0.14, 0.4);
        if (b % 8 === 7) V.riser(E, t, E.bar, 0.45);
      }
    },
    suspense: function (E) {
      for (var b = 0; b < E.bars; b++) {
        var t = b * E.bar;
        if (b % 2 === 0) V.drone(E, t, E.bar * 2, mtof(40), 0.5, 0);
        V.pad(E, t, E.bar, [40, 41, 46, 52].map(mtof), 0.22, 0, { a: 1.5, rel: 1.5, cut: 700 });
        V.kick(E, t, 0.4); V.kick(E, t + 0.18, 0.25);
        for (var i = 0; i < 8; i++) V.tick(E, t + i * E.beat / 2, 0.22, i % 2 ? 0.3 : -0.3);
        if (b % 2 === 1) V.bell(E, t + 1.5 * E.beat, mtof(choice(E, [76, 82])), 0.13, E.rnd() * 0.6);
        if (b % 4 === 3) V.riser(E, t, E.bar, 0.35);
      }
    }
  };

  function render(key, o) {
    var def = find(key); if (!def) return null;
    o = o || {};
    var sr = o.sr || 32000, secs = Math.min(180, Math.max(4, o.seconds || 60)), barSec = 4 * 60 / def.bpm, bars = Math.max(2, Math.round(secs / barSec));
    if (bars * barSec > 180) bars = Math.max(2, Math.floor(180 / barSec));
    var E = Eng(sr, def.bpm, bars, 777 + def.bpm), i, peak = 0;
    BUILD[key](E);
    for (i = 0; i < E.N; i++) {   // a soft limiter first, then the loudest sample is set to 0.8
      E.L[i] = Math.tanh(1.3 * E.L[i]); E.R[i] = Math.tanh(1.3 * E.R[i]);
      var m = Math.max(Math.abs(E.L[i]), Math.abs(E.R[i])); if (m > peak) peak = m;
    }
    var k = peak > 0 ? 0.8 / peak : 0, fi = Math.max(1, Math.round(sr * 0.003));
    for (i = 0; i < E.N; i++) { var g = k * Math.min(1, i / fi, (E.N - 1 - i) / fi); E.L[i] *= g; E.R[i] *= g; }
    return { left: E.L, right: E.R, sr: sr, bars: bars, bpm: def.bpm, durMs: Math.round(E.N / sr * 1000) };
  }
  // 16-bit stereo WAV file bytes.
  function toWav(left, right, sr) {
    sr = sr || 32000;
    var n = left.length, bytes = new Uint8Array(44 + n * 4), v = new DataView(bytes.buffer);
    function str(o, s) { for (var i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true);
    for (var i = 0; i < n; i++) {
      v.setInt16(44 + i * 4, Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767))), true);
      v.setInt16(46 + i * 4, Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767))), true);
    }
    return bytes;
  }

  var api = { LIST: LIST, find: find, render: render, toWav: toWav };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiMusic = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['music.js'] = 'music'; }
  return api;
})();
