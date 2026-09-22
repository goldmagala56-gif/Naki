'use strict';
// Run with:  node tests/core.test.js   (or: npm test)
const assert = require('assert');
const C = require('../www/core.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

ok('decibel <-> byte mapping', () => {
  assert.strictEqual(C.dbToByte(0), 255); assert.strictEqual(C.dbToByte(-80), 0);
  assert(Math.abs(C.byteToDb(C.dbToByte(-40)) + 40) < 0.4);
});
ok('auto-lowering ducks under voice and recovers', () => {
  const d = new C.Ducker({ duckedGain: 0.2, thresholdDb: -40 });
  for (let i = 0; i < 20; i++) d.step(-20, 50);
  assert(d.gain < 0.25, 'should duck, got ' + d.gain);
  for (let i = 0; i < 70; i++) d.step(-70, 50);
  assert(d.gain > 0.95, 'should recover, got ' + d.gain);
  assert.strictEqual(new C.Ducker({ enabled: false }).step(-10, 50), 1);
});

const events = [
  { t: 0, type: 'rec_start', movieMs: 0 }, { t: 0, type: 'vol', value: 1 },
  { t: 0, type: 'duck', enabled: true, thresholdDb: -40, duckedGain: 0.2 },
  { t: 4000, type: 'play', movieMs: 0 }, { t: 65000, type: 'pause', movieMs: 61000 },
  { t: 82000, type: 'play', movieMs: 61000 }, { t: 90000, type: 'jump', fromMs: 69000, toMs: 59000 },
  { t: 100000, type: 'rec_stop' }
];
ok('movie state at a session time', () => {
  let s = C.stateAt(events, 2000); assert(!s.playing && s.movieMs === 0);
  s = C.stateAt(events, 10000); assert(s.playing && s.movieMs === 6000);
  s = C.stateAt(events, 70000); assert(!s.playing && s.movieMs === 61000);
  s = C.stateAt(events, 95000); assert(s.playing && s.movieMs === 64000);
});
ok('video spans cover the whole session with no gaps', () => {
  const spans = C.buildVideoSpans(events, 100000);
  assert.strictEqual(spans.length, 5);
  assert.deepStrictEqual(spans[0], { type: 'freeze', sessionStart: 0, sessionEnd: 4000, movieAt: 0 });
  assert.deepStrictEqual(spans[2], { type: 'freeze', sessionStart: 65000, sessionEnd: 82000, movieAt: 61000 });
  assert.deepStrictEqual(spans[4], { type: 'play', sessionStart: 90000, sessionEnd: 100000, movieStart: 59000 });
  let cur = 0; spans.forEach(sp => { assert.strictEqual(sp.sessionStart, cur); cur = sp.sessionEnd; });
  assert.strictEqual(cur, 100000);
});
ok('movie loudness follows voice and volume, and simplifies cleanly', () => {
  const nn = Math.ceil(100000 / 50) + 1, levels = [];
  for (let i = 0; i < nn; i++) { const t = i * 50; levels.push(C.dbToByte(t >= 10000 && t < 20000 ? -20 : -75)); }
  const s = { events, levels, durationMs: 100000, movieName: 'x.mp4', movieDurMs: 7200000, voiceOffsetMs: 120, voiceNudgeMs: -30 };
  const g = C.buildGainSeries(s);
  assert(g[100] > 0.99); assert(g[300] < 0.25); assert(g[600] > 0.95);
  const plan = C.buildExportPlan(s);
  assert.strictEqual(plan.voice.offsetMs, 90);
  const pts = plan.movieGain.points;
  const interp = t => { for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return b[0] === a[0] ? b[1] : a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); } return pts[pts.length - 1][1]; };
  let maxErr = 0; g.forEach((v, i) => { maxErr = Math.max(maxErr, Math.abs(interp(i * 50) - v)); });
  assert(maxErr < 0.06, 'interpolation error ' + maxErr);
  const ev2 = events.concat([{ t: 30000, type: 'vol', value: 0.5 }]).sort((a, b) => a.t - b.t);
  const g2 = C.buildGainSeries({ events: ev2, levels, durationMs: 100000 });
  assert(Math.abs(g2[800] - 0.5) < 0.02);
});
ok('time formatting', () => { assert.strictEqual(C.fmt(65000), '1:05'); assert.strictEqual(C.fmt(3725000), '1:02:05'); });
console.log('\n' + n + ' checks passed');
