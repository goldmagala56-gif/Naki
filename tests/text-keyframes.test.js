'use strict';
// node tests/text-keyframes.test.js
// A text can be keyframed left/right and up/down; the values glide between keyframes.
const assert = require('assert'), P = require('../www/project.js'), NA = require('../www/anim.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const base = { naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 10000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] },
    { id: 't-text', kind: 'text', role: 'text', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'x1', type: 'text', start: 1000, dur: 4000, text: 'Hello', size: 7, color: '#ffffff', pos: 'bottom' }] }] };
ok('a text now has left/right and up/down keyframes', () => { assert.deepStrictEqual(P.keyframeProps(base, 'x1'), ['x', 'y']); });
ok('keyframes make the text glide: the middle is half way', () => {
  let p = P.toggleKeyframes(base, 'x1', 500); p = P.setAnimatedAuto(p, 'x1', 'x', 0.3, 3500);
  const c = P.findClip(p, 'x1').clip; assert(c.kf && c.kf.x && c.kf.x.length === 2, JSON.stringify(c.kf));
  const mid = NA.shiftOf(c, 2000); assert(Math.abs(mid.x - 0.15) < 0.01, 'x at the middle: ' + mid.x); assert(Math.abs(NA.shiftOf(c, 0).x) < 0.001); assert(Math.abs(NA.shiftOf(c, 4000).x - 0.3) < 0.001);
});
ok('without keyframes a slider still just moves the text', () => { const p = P.setAnimated(base, 'x1', 'y', -0.2, 0), c = P.findClip(p, 'x1').clip; assert.strictEqual(c.dy, -0.2); assert(!c.kf); });
console.log('\n' + n + ' checks passed');
