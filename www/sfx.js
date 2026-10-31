'use strict';
/* Naki sound effects: more than a hundred effects made by code (no files to download), as mono sound at any sample rate, plus a WAV writer so an effect can be
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
    { key: 'wind', label: 'Wind', durMs: 3000, cat: 'Nature' }, { key: 'thunder', label: 'Thunder', durMs: 3000, cat: 'Nature' }, { key: 'applause', label: 'Applause', durMs: 3000, cat: 'Nature' },
    // more motion
    { key: 'whooshfast', label: 'Fast whoosh', durMs: 380, cat: 'Motion' }, { key: 'whooshslow', label: 'Slow whoosh', durMs: 1400, cat: 'Motion' }, { key: 'airhit', label: 'Air hit', durMs: 500, cat: 'Motion' },
    { key: 'reverse', label: 'Reverse swell', durMs: 1400, cat: 'Motion' }, { key: 'tapestop', label: 'Tape stop', durMs: 900, cat: 'Motion' }, { key: 'rewind', label: 'Rewind', durMs: 800, cat: 'Motion' },
    { key: 'spin', label: 'Spin up', durMs: 1000, cat: 'Motion' }, { key: 'glitch', label: 'Glitch', durMs: 450, cat: 'Motion' },
    // more interface
    { key: 'switch', label: 'Switch', durMs: 140, cat: 'Interface' }, { key: 'message', label: 'Message', durMs: 450, cat: 'Interface' }, { key: 'cash', label: 'Cash register', durMs: 1100, cat: 'Interface' },
    { key: 'dialtone', label: 'Dial tone', durMs: 800, cat: 'Interface' }, { key: 'alarmclock', label: 'Alarm clock', durMs: 1500, cat: 'Interface' },
    // comedy
    { key: 'slideup', label: 'Slide up', durMs: 700, cat: 'Comedy' }, { key: 'slidedown', label: 'Slide down', durMs: 700, cat: 'Comedy' }, { key: 'womp', label: 'Sad trombone', durMs: 1700, cat: 'Comedy' },
    { key: 'squeak', label: 'Squeak', durMs: 250, cat: 'Comedy' }, { key: 'bonk', label: 'Bonk', durMs: 300, cat: 'Comedy' }, { key: 'spring', label: 'Spring', durMs: 900, cat: 'Comedy' },
    { key: 'drumroll', label: 'Drum roll', durMs: 1800, cat: 'Comedy' }, { key: 'rimshot', label: 'Rimshot', durMs: 1000, cat: 'Comedy' },
    // sci-fi
    { key: 'zap', label: 'Zap', durMs: 350, cat: 'Sci-fi' }, { key: 'teleport', label: 'Teleport', durMs: 1100, cat: 'Sci-fi' }, { key: 'forcefield', label: 'Force field', durMs: 1600, cat: 'Sci-fi' },
    { key: 'scanner', label: 'Scanner', durMs: 1500, cat: 'Sci-fi' }, { key: 'hover', label: 'Hover', durMs: 2000, cat: 'Sci-fi' }, { key: 'scidoor', label: 'Sci-fi door', durMs: 900, cat: 'Sci-fi' },
    { key: 'radar', label: 'Radar ping', durMs: 1800, cat: 'Sci-fi' }, { key: 'computer', label: 'Computer', durMs: 1000, cat: 'Sci-fi' },
    // game
    { key: 'levelup', label: 'Level up', durMs: 1000, cat: 'Game' }, { key: 'gameover', label: 'Game over', durMs: 1600, cat: 'Game' }, { key: 'jump8', label: '8-bit jump', durMs: 300, cat: 'Game' },
    { key: 'coin8', label: '8-bit coin', durMs: 450, cat: 'Game' }, { key: 'hit8', label: '8-bit hit', durMs: 260, cat: 'Game' }, { key: 'extralife', label: 'Extra life', durMs: 1300, cat: 'Game' },
    { key: 'victory', label: 'Victory', durMs: 2000, cat: 'Game' },
    // horror
    { key: 'creepy', label: 'Creepy drone', durMs: 3000, cat: 'Horror' }, { key: 'scarehit', label: 'Jump scare', durMs: 1200, cat: 'Horror' }, { key: 'doorcreak', label: 'Door creak', durMs: 1800, cat: 'Horror' },
    { key: 'whispers', label: 'Whispers', durMs: 2500, cat: 'Horror' }, { key: 'heartfast', label: 'Fast heartbeat', durMs: 1600, cat: 'Horror' }, { key: 'ghost', label: 'Ghost wail', durMs: 2200, cat: 'Horror' },
    // water
    { key: 'drip', label: 'Water drop', durMs: 900, cat: 'Water' }, { key: 'splash', label: 'Splash', durMs: 1100, cat: 'Water' }, { key: 'bubbles', label: 'Bubbles', durMs: 1400, cat: 'Water' },
    { key: 'rain', label: 'Rain', durMs: 3000, cat: 'Water' }, { key: 'ocean', label: 'Ocean waves', durMs: 3500, cat: 'Water' },
    // more nature and fun
    { key: 'birds', label: 'Birds', durMs: 2200, cat: 'Nature' }, { key: 'crickets', label: 'Crickets', durMs: 2500, cat: 'Nature' }, { key: 'firecrackle', label: 'Fire crackle', durMs: 3000, cat: 'Nature' },
    { key: 'party', label: 'Party horn', durMs: 800, cat: 'Fun' }, { key: 'clock', label: 'Clock ticking', durMs: 2000, cat: 'Fun' }, { key: 'gong', label: 'Gong', durMs: 3000, cat: 'Fun' }
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
  function saw(ph) { var x = ph / TAU; x -= Math.floor(x); return 2 * x - 1; }
  function adsrg(t, dur, a, rel) { if (t < a) return t / a; if (t <= dur) return 1; var r = 1 - (t - dur) / rel; return r > 0 ? r * r : 0; }   // a note's loudness: quick rise, steady, short fade

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
    applause: function (sr, n, rnd) { var a = lpf(sr), b = lpf(sr), e = 0; return function (i, t, u) { var x = rnd(); e += lp(25, sr) * (Math.abs(rnd()) * 2 - e); return (a(x, 4500) - b(x, 600)) * (0.3 + 1.8 * e) * Math.min(1, u * 8) * Math.min(1, (1 - u) * 4) * 2; }; },

    // ---- more motion ----
    whooshfast: function (sr, n, rnd) { var y = 0; return function (i, t, u) { var bell = Math.sin(Math.PI * u); y += lp(600 + 6000 * bell, sr) * (rnd() - y); return y * bell * bell * 2.4; }; },
    whooshslow: function (sr, n, rnd) { var y = 0; return function (i, t, u) { var bell = Math.sin(Math.PI * u); y += lp(200 + 2200 * bell, sr) * (rnd() - y); return y * Math.pow(bell, 1.5) * 2.6; }; },
    airhit: function (sr, n, rnd) { var f = lpf(sr), ph = 0; return function (i, t) { ph += TAU * (70 + 60 * ex(t, 25)) / sr; return f(rnd(), 200 + 2500 * ex(t, 8)) * ex(t, 9) * 2 + Math.sin(ph) * ex(t, 12) * 0.6; }; },
    reverse: function (sr, n, rnd) { var f = lpf(sr); return function (i, t, u) { return f(rnd(), 300 + 7000 * u * u * u) * Math.pow(u, 3) * 2.2 * Math.min(1, (1 - u) * 40); }; },
    tapestop: function (sr) { var ph = 0, f = lpf(sr); return function (i, t, u) { ph += TAU * (600 * Math.pow(1 - u, 2.2) + 20) / sr; return f(saw(ph) * 0.6 + Math.sin(ph) * 0.5, 300 + 1500 * (1 - u)) * (1 - u * 0.4); }; },
    rewind: function (sr) { var ph = 0; return function (i, t) { ph += TAU * (400 + 2400 * ((t * 14) % 1)) / sr; return (Math.sin(ph) * 0.5 + saw(ph) * 0.25) * Math.min(1, t * 30) * Math.min(1, (0.8 - t) * 30); }; },
    spin: function (sr) { var ph = 0; return function (i, t, u) { ph += TAU * (80 + 900 * u * u) / sr; return (Math.sin(ph) + 0.4 * Math.sin(2 * ph)) * (0.6 + 0.4 * Math.sin(TAU * (8 + 30 * u) * t)) * Math.min(1, (1 - u) * 6) * Math.pow(u, 0.3); }; },
    glitch: function (sr, n, rnd) { var holds = [], k; for (k = 0; k < 120; k++) holds.push(Math.abs(rnd())); return function (i, t) { var hold = holds[Math.floor(t / 0.005) % 120], on = Math.floor(t * 30) % 3 !== 2; return (on ? sq(TAU * (300 + hold * 3000) * t) * 0.5 * (hold > 0.3 ? 1 : 0.25) : rnd() * 0.5) * gate(t, 0, 0.45, 0.004); }; },

    // ---- more interface ----
    switch: function (sr, n, rnd) { var f = lpf(sr); return function (i, t) { var x = rnd(), b = x - f(x, 3500); return b * (ex(t, 400) + (t > 0.07 ? ex(t - 0.07, 350) * 0.8 : 0)) + 0.4 * Math.sin(TAU * 300 * t) * ex(t, 60); }; },
    message: function () { return function (i, t) { return note(t, 0, 1318, 9) + note(t, 0.09, 1760, 8); }; },
    cash: function (sr, n, rnd) {
      var f = lpf(sr);
      return function (i, t) { var x = rnd(), b = x - f(x, 3000), s = b * (ex(t, 300) + (t > 0.06 ? ex(t - 0.06, 250) : 0)), l = t - 0.12; if (l >= 0) s += (Math.sin(TAU * 2093 * l) + 0.6 * Math.sin(TAU * 2093 * 2.76 * l) + 0.3 * Math.sin(TAU * 2093 * 5.4 * l)) * ex(l, 4) * 0.5; return s; };
    },
    dialtone: function () { return function (i, t) { return (Math.sin(TAU * 350 * t) + Math.sin(TAU * 440 * t)) * 0.5 * gate(t, 0, 0.8, 0.01); }; },
    alarmclock: function () { return function (i, t) { var p = t % 0.7, q = p % 0.1, on = p < 0.4 ? gate(q, 0, 0.06, 0.004) : 0; return Math.sin(TAU * 2400 * t) * on; }; },

    // ---- comedy ----
    slideup: function (sr) { var ph = 0; return function (i, t, u) { ph += TAU * (400 + 1400 * Math.pow(u, 1.5)) * (1 + 0.02 * Math.sin(TAU * 6 * t)) / sr; return (Math.sin(ph) + 0.15 * Math.sin(2 * ph)) * Math.min(1, u * 30) * Math.min(1, (1 - u) * 12); }; },
    slidedown: function (sr) { var ph = 0; return function (i, t, u) { ph += TAU * (1800 - 1400 * Math.pow(u, 0.8)) * (1 + 0.02 * Math.sin(TAU * 6 * t)) / sr; return (Math.sin(ph) + 0.15 * Math.sin(2 * ph)) * Math.min(1, u * 30) * Math.min(1, (1 - u) * 12); }; },
    womp: function (sr) {
      var ph = 0, f = lpf(sr), N = [[0, 0.35, 233], [0.4, 0.75, 220], [0.8, 1.15, 207], [1.2, 1.7, 185]];
      return function (i, t) { var fr = 0, g = 0, k; for (k = 0; k < 4; k++) if (t >= N[k][0] && t < N[k][1]) { fr = N[k][2] * (k === 3 ? 1 - 0.18 * (t - 1.2) / 0.5 : 1) * (1 + 0.012 * Math.sin(TAU * 5.5 * t) * (k + 1)); g = gate(t, N[k][0], N[k][1], 0.02); } ph += TAU * (fr || 100) / sr; return f(saw(ph) * 0.8 + Math.sin(ph) * 0.3, 1100) * g; };
    },
    squeak: function (sr) { var ph = 0; return function (i, t, u) { ph += TAU * (1500 + 1500 * u + 250 * Math.sin(TAU * 32 * t)) / sr; return Math.sin(ph) * Math.pow(1 - u, 0.5) * Math.min(1, u * 40); }; },
    bonk: function (sr, n, rnd) { var ph = 0; return function (i, t) { ph += TAU * (140 + 220 * ex(t, 12)) / sr; return Math.sin(ph) * ex(t, 28) + 0.25 * rnd() * ex(t, 300); }; },
    spring: function (sr) { var ph = 0; return function (i, t) { ph += TAU * Math.max(60, 250 + 350 * ex(t, 2) * Math.sin(TAU * 14 * t)) / sr; return (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * ex(t, 2.2); }; },
    drumroll: function (sr, n, rnd) {
      var hits = [], tt = 0, f = lpf(sr), k;
      while (tt < 1.6) { hits.push(tt); tt += 0.12 - 0.09 * (tt / 1.6); }
      return function (i, t) {
        var s = 0, x = rnd(), b = x - f(x, 1800), j, l, v;
        for (j = 0; j < hits.length; j++) { l = t - hits[j]; if (l >= 0 && l < 0.09) { v = 0.3 + 0.7 * hits[j] / 1.6; s += (b * ex(l, 40) + 0.4 * Math.sin(TAU * 190 * l) * ex(l, 45)) * v; } }
        if (t >= 1.6) s += (x - f(x, 4500)) * ex(t - 1.6, 4) * 0.9;
        return s;
      };
    },
    rimshot: function (sr, n, rnd) { var f = lpf(sr); return function (i, t) { var x = rnd(), b = x - f(x, 2000), s = Math.sin(TAU * 120 * t) * ex(t, 25) * 0.9 + 0.3 * rnd() * ex(t, 300), l = t - 0.14; if (l >= 0) s += Math.sin(TAU * 210 * l) * ex(l, 28) * 0.6 + b * ex(l, 22); l = t - 0.5; if (l >= 0) s += (x - f(x, 6000)) * ex(l, 4) * 0.8; return s; }; },

    // ---- sci-fi ----
    zap: function (sr, n, rnd) { var ph = 0; return function (i, t) { ph += TAU * (3000 * ex(t, 10) + 200) / sr; return (sq(ph) * 0.6 + rnd() * 0.4) * ex(t, 8); }; },
    teleport: function (sr) { var ph = 0; return function (i, t, u) { ph += TAU * (300 + 3000 * u * u + 400 * Math.sin(TAU * 25 * t)) / sr; return Math.sin(ph) * Math.sin(Math.PI * Math.min(1, u * 1.05)); }; },
    forcefield: function (sr) { var p1 = 0, p2 = 0, f = lpf(sr); return function (i, t) { p1 += TAU * 110 / sr; p2 += TAU * 113 / sr; return f(saw(p1) + saw(p2), 1500) * 0.5 * (0.7 + 0.3 * Math.sin(TAU * 7 * t)) * gate(t, 0, 1.6, 0.3); }; },
    scanner: function (sr) { var ph = 0; return function (i, t) { ph += TAU * (500 + 1500 * (0.5 + 0.5 * Math.sin(TAU * 1.6 * t))) / sr; return Math.sin(ph) * gate(t, 0, 1.5, 0.05); }; },
    hover: function (sr, n, rnd) { var f = lpf(sr), ph = 0; return function (i, t) { ph += TAU * 55 / sr; return (f(rnd(), 400) * 1.2 * (0.7 + 0.3 * Math.sin(TAU * 30 * t)) + 0.3 * saw(ph)) * gate(t, 0, 2, 0.25); }; },
    scidoor: function (sr, n, rnd) { var f = lpf(sr), ph = 0; return function (i, t) { var x = rnd(); ph += TAU * (100 + 500 * ex(t, 3)) / sr; return (x - f(x, 3000)) * ex(t, 6) * 0.6 + Math.sin(ph) * ex(t, 2.5) * 0.5; }; },
    radar: function () { return function (i, t) { return note(t, 0, 1250, 2.8) + 0.4 * note(t, 0.55, 1250, 3) + 0.2 * note(t, 1.1, 1250, 3); }; },
    computer: function (sr, n, rnd) { var tones = [], k; for (k = 0; k < 40; k++) tones.push(600 + Math.abs(rnd()) * 2400); return function (i, t) { var idx = Math.floor(t / 0.055), l = t - idx * 0.055; return Math.sin(TAU * tones[idx % 40] * t) * gate(l, 0, 0.045, 0.004); }; },

    // ---- game ----
    levelup: function () { var F = [523, 659, 784, 1047, 1319, 1568, 2093]; return function (i, t) { var s = 0, k; for (k = 0; k < 7; k++) { var l = t - k * 0.07; if (l >= 0) s += sq(TAU * F[k] * l) * ex(l, k === 6 ? 3 : 9) * 0.5; } return s; }; },
    gameover: function () { var N = [[0, 392], [0.3, 330], [0.6, 262], [0.9, 196]]; return function (i, t) { var s = 0, k; for (k = 0; k < 4; k++) { var l = t - N[k][0]; if (l >= 0) s += sq(TAU * N[k][1] * (k === 3 ? 1 + 0.01 * Math.sin(TAU * 7 * l) : 1) * l) * ex(l, k === 3 ? 2.2 : 6) * 0.5; } return s; }; },
    jump8: function (sr) { var ph = 0; return function (i, t, u) { ph += TAU * (250 + 450 * u) / sr; return sq(ph) * ex(t, 8) * Math.min(1, t * 400) * 0.6; }; },
    coin8: function () { return function (i, t) { return t < 0.07 ? sq(TAU * 988 * t) * 0.5 : sq(TAU * 1319 * t) * ex(t - 0.07, 9) * 0.5; }; },
    hit8: function (sr, n, rnd) { var ph = 0, held = 0; return function (i, t) { ph += TAU * (200 * ex(t, 15) + 60) / sr; if (i % 20 === 0) held = rnd(); return (sq(ph) * 0.5 + held * 0.5) * ex(t, 14); }; },
    extralife: function () { var F = [659, 784, 1319, 1047, 1175, 1568]; return function (i, t) { var s = 0, k; for (k = 0; k < 6; k++) { var l = t - k * 0.09; if (l >= 0) s += sq(TAU * F[k] * l) * ex(l, k === 5 ? 3 : 8) * 0.5; } return s; }; },
    victory: function (sr) {
      var N = [[0, 0.15, [392]], [0.18, 0.33, [392]], [0.36, 0.51, [392]], [0.54, 1.7, [523, 659, 784]]], f = lpf(sr), ph = [0, 0, 0, 0];
      return function (i, t) { var s = 0, k, j; for (k = 0; k < 4; k++) if (t >= N[k][0] && t < N[k][1] + 0.15) { var g = adsrg(t - N[k][0], N[k][1] - N[k][0], 0.01, 0.15); for (j = 0; j < N[k][2].length; j++) { ph[j] += TAU * N[k][2][j] / sr; s += saw(ph[j]) * g * 0.4; } } return f(s, 2600); };
    },

    // ---- horror ----
    creepy: function (sr, n, rnd) { var p1 = 0, p2 = 0, p3 = 0, f = lpf(sr), g = lpf(sr); return function (i, t, u) { p1 += TAU * 55 / sr; p2 += TAU * 58.3 / sr; p3 += TAU * 82.4 * (1 + 0.01 * Math.sin(TAU * 0.4 * t)) / sr; return (f(saw(p1) + saw(p2) + 0.6 * saw(p3), 450) * 0.6 + g(rnd(), 2500) * 0.05) * Math.pow(Math.sin(Math.PI * u), 0.7) * (0.8 + 0.2 * Math.sin(TAU * 0.5 * t)); }; },
    scarehit: function (sr, n, rnd) { var ph = 0, f = lpf(sr), q1 = 0, q2 = 0, q3 = 0; return function (i, t) { ph += TAU * (40 + 70 * ex(t, 6)) / sr; q1 += TAU * 233 / sr; q2 += TAU * 247 / sr; q3 += TAU * 330 / sr; return Math.sin(ph) * ex(t, 3) * 1.2 + f(saw(q1) + saw(q2) + saw(q3), 2500) * ex(t, 4) * 0.5 + rnd() * ex(t, 25) * 0.8; }; },
    doorcreak: function (sr) { var ph = 0, f = lpf(sr); return function (i, t, u) { ph += TAU * (180 + 120 * Math.sin(TAU * 1.7 * t) + 60 * Math.sin(TAU * 4.3 * t)) / sr; var stick = 0.55 + 0.45 * Math.sin(TAU * 18 * t + 3 * Math.sin(TAU * 1.1 * t)); return f(saw(ph) + 0.5 * saw(2 * ph), 900 + 600 * Math.sin(TAU * 2.2 * t)) * stick * Math.sin(Math.PI * u); }; },
    whispers: function (sr, n, rnd) { var a = lpf(sr), b = lpf(sr); return function (i, t, u) { var x = rnd(), env = Math.pow(Math.max(0, Math.sin(TAU * 3.1 * t) * Math.sin(TAU * 1.3 * t + 1)), 1.2); return (a(x, 3500) - b(x, 1500)) * env * 4 * Math.sin(Math.PI * u); }; },
    heartfast: function () { return function (i, t) { var s = 0, b; for (b = 0; b < 4; b++) s += thump(t - b * 0.4, 58, 14) + 0.7 * thump(t - b * 0.4 - 0.14, 50, 16); return s; }; },
    ghost: function () {
      function phi(t) { return TAU * (500 * t + 300 / (TAU * 0.8) * (1 - Math.cos(TAU * 0.8 * t))) + 3 * Math.sin(TAU * 5.5 * t); }
      function wail(t) { return t < 0 ? 0 : Math.sin(phi(t)) * Math.sin(Math.PI * Math.min(1, t / 1.8)); }
      return function (i, t) { return wail(t) + 0.5 * wail(t - 0.25) + 0.3 * wail(t - 0.5); };
    },

    // ---- water ----
    drip: function () {
      function phi(t) { return TAU * (800 * t + 1800 * (t - (1 - ex(t, 40)) / 40)); }
      function drop(t) { return t < 0 ? 0 : Math.sin(phi(t)) * ex(t, 22); }
      return function (i, t) { return drop(t) + 0.45 * drop(t - 0.28) + 0.2 * drop(t - 0.56); };
    },
    splash: function (sr, n, rnd) { var f = lpf(sr), ph = 0; return function (i, t) { var s = f(rnd(), 2500 * ex(t, 4) + 500) * ex(t, 5) * 2.2, l = t - 0.15; if (l >= 0) { ph += TAU * (500 + 1500 * l) / sr; s += Math.sin(ph) * ex(l, 14) * 0.3; } return s; }; },
    bubbles: function (sr, n, rnd) {
      var ev = [], k; for (k = 0; k < 14; k++) ev.push([Math.abs(rnd()) * 1.15, 300 + Math.abs(rnd()) * 600]);
      return function (i, t) { var s = 0, j, l; for (j = 0; j < 14; j++) { l = t - ev[j][0]; if (l >= 0 && l < 0.25) s += Math.sin(TAU * ev[j][1] * (l + 2 * l * l)) * ex(l, 18) * Math.min(1, l / 0.003) * 0.6; } return s; };
    },
    rain: function (sr, n, rnd) { var f = lpf(sr), d = lpf(sr); return function (i, t) { var x = rnd(), drop = rnd() > 0.995 ? rnd() * 0.5 : 0; return ((x - f(x, 1500)) * 0.5 + d(drop, 6000) * 2) * gate(t, 0, 3, 0.4); }; },
    ocean: function (sr, n, rnd) { var f = lpf(sr); return function (i, t) { var w = 0.5 + 0.5 * Math.sin(TAU * 0.3 * t - 1.5); return f(rnd(), 400 + 700 * w) * w * w * 3 * gate(t, 0, 3.5, 0.3); }; },

    // ---- more nature and fun ----
    birds: function (sr, n, rnd) {
      var ev = [], k; for (k = 0; k < 9; k++) ev.push([Math.abs(rnd()) * 2.0, 2200 + Math.abs(rnd()) * 1800, 0.08 + Math.abs(rnd()) * 0.12, 10 + Math.abs(rnd()) * 14]);
      return function (i, t) { var s = 0, j, l, d, A; for (j = 0; j < 9; j++) { l = t - ev[j][0]; d = ev[j][2]; if (l >= 0 && l < d) { A = 1500; s += Math.sin(TAU * (ev[j][1] * l - A / (TAU * ev[j][3]) * (Math.cos(TAU * ev[j][3] * l) - 1))) * Math.sin(Math.PI * l / d) * 0.6; } } return s; };
    },
    crickets: function () { return function (i, t) { var g1 = (t % 0.5) < 0.16 ? Math.max(0, Math.sin(TAU * 28 * t)) : 0, g2 = ((t + 0.17) % 0.62) < 0.18 ? Math.max(0, Math.sin(TAU * 24 * t)) : 0; return Math.sin(TAU * 4300 * t) * g1 * 0.6 + Math.sin(TAU * 3900 * t) * g2 * 0.5; }; },
    firecrackle: function (sr, n, rnd) {
      var pops = [], k, f = lpf(sr), g = lpf(sr); for (k = 0; k < 70; k++) pops.push([Math.abs(rnd()) * 2.95, 0.3 + Math.abs(rnd()) * 0.7]);
      return function (i, t) { var x = rnd(), s = g(x, 300) * 0.5, j, l; for (j = 0; j < 70; j++) { l = t - pops[j][0]; if (l >= 0 && l < 0.03) s += (x - f(x, 1500)) * ex(l, 180) * pops[j][1] * 1.5; } return s; };
    },
    party: function (sr, n, rnd) { var ph = 0, f = lpf(sr); return function (i, t) { ph += TAU * (400 + 700 * Math.min(1, t / 0.12)) / sr; var s = f(saw(ph), 3000) * (t < 0.12 ? t / 0.12 : ex(t - 0.12, 4)) * 0.7; if (t > 0.35) s += rnd() * ex(t - 0.35, 25) * 0.5; return s; }; },
    clock: function (sr, n, rnd) { var f = lpf(sr); return function (i, t) { var k = Math.floor(t / 0.5), l = t - k * 0.5, x = rnd(), b = x - f(x, 3500); return (b * ex(l, 250) + Math.sin(TAU * (k % 2 ? 900 : 1400) * l) * ex(l, 150) * 0.5) * 0.9; }; },
    gong: function () { var R = [1, 1.51, 2.05, 2.76, 3.4, 4.2], A = [1, 0.7, 0.5, 0.4, 0.3, 0.2], D = [0.7, 0.9, 1.2, 1.5, 1.9, 2.4]; return function (i, t) { var s = 0, k; for (k = 0; k < 6; k++) s += A[k] * Math.sin(TAU * 110 * R[k] * t + 0.4 * Math.sin(TAU * 3 * t)) * ex(t, D[k]); return s * Math.min(1, t / 0.01); }; }
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