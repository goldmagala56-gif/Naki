'use strict';
// node tests/engine-choice.test.js
// The fast engine can't draw titles, speed changes, colour filters or fades yet, so a project that uses any
// of them must be sent to the ffmpeg engine instead of losing those edits.
const assert = require('assert');
const { WebCodecsExport } = require('../www/webcodecs-export.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const plan = (o) => Object.assign({ durationMs: 10000, video: [{ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0 }], audio: [{ src: 'movie', startMs: 0, durMs: 4000, inMs: 0, points: [[0, 1]] }] }, o || {});
const can = (p) => WebCodecsExport.canRender(p);

ok('a plain project (cuts, pauses, music, volume) can use the fast engine', () => assert.strictEqual(can(plan()), true));
ok('a title sends the project to the ffmpeg engine; an empty title does not', () => {
  assert.strictEqual(can(plan({ texts: [{ startMs: 0, durMs: 1000, text: 'Hi' }] })), false);
  assert.strictEqual(can(plan({ texts: [{ startMs: 0, durMs: 1000, text: '   ' }] })), true);
});
ok('a speed change on the picture or the sound sends it to the ffmpeg engine; normal speed does not', () => {
  assert.strictEqual(can(plan({ video: [{ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0, speed: 2 }] })), false);
  assert.strictEqual(can(plan({ audio: [{ src: 'movie', startMs: 0, durMs: 4000, inMs: 0, speed: 0.5, points: [[0, 1]] }] })), false);
  assert.strictEqual(can(plan({ video: [{ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0, speed: 1 }] })), true);
});
ok('a colour filter or a fade sends it to the ffmpeg engine; a neutral filter does not', () => {
  const v = (extra) => plan({ video: [Object.assign({ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0 }, extra)] });
  assert.strictEqual(can(v({ filter: { brightness: 0.8, contrast: 1, saturate: 1 } })), false);
  assert.strictEqual(can(v({ filter: { brightness: 1, contrast: 1, saturate: 0 } })), false);
  assert.strictEqual(can(v({ vFadeIn: 500 })), false);
  assert.strictEqual(can(v({ vFadeOut: 750 })), false);
  assert.strictEqual(can(v({ filter: { brightness: 1, contrast: 1, saturate: 1 }, vFadeIn: 0, vFadeOut: 0 })), true);
});
console.log('\n' + n + ' checks passed');