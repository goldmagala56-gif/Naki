'use strict';
// node tests/engine-choice.test.js
// The fast engine now draws titles, fades and colour filters itself. Only speed changes, reversed clips,
// sharpen, and filters on a browser whose canvas can't filter must go to the ffmpeg engine.
const assert = require('assert');
const { WebCodecsExport } = require('../www/webcodecs-export.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const plan = (o) => Object.assign({ durationMs: 10000, video: [{ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0 }], audio: [{ src: 'movie', startMs: 0, durMs: 4000, inMs: 0, points: [[0, 1]] }] }, o || {});
const can = (p) => WebCodecsExport.canRender(p);
const v = (extra) => plan({ video: [Object.assign({ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0 }, extra)] });

ok('a plain project (cuts, pauses, music, volume) can use the fast engine', () => assert.strictEqual(can(plan()), true));
ok('titles and fades are drawn by the fast engine', () => {
  assert.strictEqual(can(plan({ texts: [{ startMs: 0, durMs: 1000, text: 'Hi' }] })), true);
  assert.strictEqual(can(v({ vFadeIn: 500, vFadeOut: 750 })), true);
});
ok('a speed change on the picture or the sound sends it to the ffmpeg engine; normal speed does not', () => {
  assert.strictEqual(can(v({ speed: 2 })), false);
  assert.strictEqual(can(plan({ audio: [{ src: 'movie', startMs: 0, durMs: 4000, inMs: 0, speed: 0.5, points: [[0, 1]] }] })), false);
  assert.strictEqual(can(v({ speed: 1 })), true);
});
ok('reversed clips and sharpen go to the ffmpeg engine', () => {
  assert.strictEqual(can(v({ reverse: true })), false);
  assert.strictEqual(can(plan({ audio: [{ src: 'movie', startMs: 0, durMs: 4000, inMs: 0, reverse: true, points: [[0, 1]] }] })), false);
  assert.strictEqual(can(v({ filter: { brightness: 1, contrast: 1, saturate: 1, sharpen: 1 } })), false);
});
ok('a colour filter needs a canvas that can filter; a neutral filter never does', () => {
  const T = WebCodecsExport._test;
  const bright = v({ filter: { brightness: 0.8, contrast: 1, saturate: 1 } });
  T.setFilterSupport(false);
  assert.strictEqual(can(bright), false);
  assert.strictEqual(can(v({ filter: { brightness: 1, contrast: 1, saturate: 1 } })), true);
  T.setFilterSupport(true);
  assert.strictEqual(can(bright), true);
  T.setFilterSupport(null);
});
console.log('\n' + n + ' checks passed');