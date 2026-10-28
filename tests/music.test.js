'use strict';
// node tests/music.test.js
// The music pack: every track renders, is a whole number of bars, is loud enough but never clipping, never silent, always the same, and the WAV file is right.
const assert = require('assert');
const M = require('../www/music.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const SR = 16000, opts = { seconds: 12, sr: SR };   // small, so the checks are quick

ok('tracks: ten, each with a unique key, a name, a tempo and a category, and an unknown one gives nothing', () => {
  assert.strictEqual(M.LIST.length, 10); assert.strictEqual(new Set(M.LIST.map(t => t.key)).size, 10);
  M.LIST.forEach(t => { assert(t.label && t.bpm >= 50 && t.bpm <= 160 && t.cat, t.key); assert.strictEqual(M.find(t.key), t); });
  assert.strictEqual(M.render('nope', opts), null); assert.strictEqual(M.find('nope'), null);
});
ok('every track: a whole number of bars at its tempo, close to the length asked for, stereo, and not a single bad number', () => {
  M.LIST.forEach(t => {
    const r = M.render(t.key, opts), barSamples = Math.round(4 * 60 / t.bpm * SR);
    assert.strictEqual(r.left.length, r.right.length, t.key); assert.strictEqual(r.sr, SR); assert.strictEqual(r.bpm, t.bpm);
    assert(Math.abs(r.left.length - r.bars * barSamples) <= r.bars, t.key + ' is ' + r.bars + ' bars');
    assert(Math.abs(r.durMs - 12000) <= 4 * 60 / t.bpm * 1000, t.key + ' is close to 12 s: ' + r.durMs);
    for (let i = 0; i < r.left.length; i++) assert(Number.isFinite(r.left[i]) && Number.isFinite(r.right[i]), t.key + ' sample ' + i);
  });
});
ok('every track: loudest sample is 0.8 (never clipping), it is really playing (not silent, not a wall of noise), and both ears hear something different', () => {
  M.LIST.forEach(t => {
    const r = M.render(t.key, opts); let pk = 0, e = 0, diff = 0;
    for (let i = 0; i < r.left.length; i++) { pk = Math.max(pk, Math.abs(r.left[i]), Math.abs(r.right[i])); e += r.left[i] * r.left[i] + r.right[i] * r.right[i]; if (Math.abs(r.left[i] - r.right[i]) > 1e-4) diff++; }
    const rms = Math.sqrt(e / (2 * r.left.length));
    assert(Math.abs(pk - 0.8) < 0.01, t.key + ' peak ' + pk); assert(rms > 0.03 && rms < 0.5, t.key + ' loudness (rms) ' + rms.toFixed(3)); assert(diff > r.left.length * 0.05, t.key + ' is stereo');
  });
});
ok('every track: it keeps playing from start to end (no quiet half), and starts and ends softly so it can loop without a click', () => {
  M.LIST.forEach(t => {
    const r = M.render(t.key, opts), q = Math.floor(r.left.length / 4), rms = (a, b) => { let e = 0; for (let i = a; i < b; i++) e += r.left[i] * r.left[i]; return Math.sqrt(e / (b - a)); };
    [0, 1, 2, 3].forEach(k => assert(rms(k * q, (k + 1) * q) > 0.015, t.key + ' part ' + k + ' is too quiet: ' + rms(k * q, (k + 1) * q).toFixed(3)));
    assert(Math.abs(r.left[0]) < 0.05 && Math.abs(r.left[r.left.length - 1]) < 0.05, t.key + ' starts and ends near silence');
  });
});
ok('the same numbers always make the same music, and different tracks are different', () => {
  const a = M.render('lofi', opts), b = M.render('lofi', opts), c = M.render('upbeat', opts);
  assert.strictEqual(a.left.length, b.left.length); for (let i = 0; i < a.left.length; i += 37) { assert.strictEqual(a.left[i], b.left[i]); assert.strictEqual(a.right[i], b.right[i]); }
  let same = 0, cnt = 0; for (let i = 0; i < Math.min(a.left.length, c.left.length); i += 41) { cnt++; if (a.left[i] === c.left[i]) same++; } assert(same < cnt * 0.5, 'two tracks should not match');
});
ok('length: the target is followed, short and long targets are kept inside 2 bars and 180 seconds, and the default is about a minute', () => {
  const s = M.render('calm', { seconds: 30, sr: 8000 }), tiny = M.render('upbeat', { seconds: 0.1, sr: 8000 }), huge = M.render('upbeat', { seconds: 100000, sr: 4000 }), def = M.render('suspense', { sr: 4000 });
  assert(Math.abs(s.durMs - 30000) < 4 * 60 / 66 * 1000); assert(tiny.bars >= 2); assert(huge.durMs <= 180000 + 1000, 'long: ' + huge.durMs); assert(Math.abs(def.durMs - 60000) < 4 * 60 / 60 * 1000 + 1, 'default: ' + def.durMs);
});
ok('the WAV file: right header, stereo, right size, and the same samples', () => {
  const r = M.render('hiphop', { seconds: 6, sr: 8000 }), w = M.toWav(r.left, r.right, 8000), v = new DataView(w.buffer), s4 = (o) => String.fromCharCode(w[o], w[o + 1], w[o + 2], w[o + 3]);
  assert.strictEqual(s4(0), 'RIFF'); assert.strictEqual(s4(8), 'WAVE'); assert.strictEqual(v.getUint16(22, true), 2, 'stereo'); assert.strictEqual(v.getUint32(24, true), 8000); assert.strictEqual(v.getUint16(34, true), 16);
  assert.strictEqual(v.getUint32(40, true), r.left.length * 4); assert.strictEqual(w.length, 44 + r.left.length * 4);
  [100, 1000, 5000].forEach(i => { assert(Math.abs(v.getInt16(44 + i * 4, true) / 32767 - r.left[i]) < 1e-4); assert(Math.abs(v.getInt16(46 + i * 4, true) / 32767 - r.right[i]) < 1e-4); });
});
console.log('\n' + n + ' checks passed');
