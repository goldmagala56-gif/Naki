'use strict';
// node tests/textanim-more.test.js
// The extra text animations: every one gives sane numbers all the way through, starts / ends where the text normally sits, and the old ones are untouched.
const assert = require('assert'), M = require('../www/motion.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const OLD_IN = ['none', 'fade', 'slideup', 'slidedown', 'slideleft', 'slideright', 'pop', 'bounce', 'spin', 'typewriter'], OLD_OUT = ['none', 'fade', 'slideup', 'slidedown', 'slideleft', 'slideright', 'pop', 'typewriter'], OLD_LOOP = ['none', 'pulse', 'float', 'wiggle'];
const keys = l => l.map(x => x.key);
ok('the old animations are still first and in the same order; the new ones are added, with unique names in each list', () => {
  assert.deepStrictEqual(keys(M.TEXT_IN).slice(0, OLD_IN.length), OLD_IN); assert.deepStrictEqual(keys(M.TEXT_OUT).slice(0, OLD_OUT.length), OLD_OUT); assert.deepStrictEqual(keys(M.TEXT_LOOP).slice(0, OLD_LOOP.length), OLD_LOOP);
  [M.TEXT_IN, M.TEXT_OUT, M.TEXT_LOOP].forEach(l => { assert.strictEqual(new Set(keys(l)).size, l.length); assert.strictEqual(new Set(l.map(x => x.label)).size, l.length); });
  assert(M.TEXT_IN.length >= 26 && M.TEXT_OUT.length >= 19 && M.TEXT_LOOP.length >= 14);
});
const sane = (st, what) => { ['alpha', 'dx', 'dy', 'scale', 'rot', 'chars'].forEach(k => assert(Number.isFinite(st[k]), what + ' ' + k)); assert(st.alpha >= 0 && st.alpha <= 1 && st.chars >= 0 && st.chars <= 1 && st.scale > 0, what + ' ' + JSON.stringify(st)); };
const near = (st, what) => { const r = ((st.rot % 360) + 540) % 360 - 180; assert(Math.abs(st.alpha - 1) < 0.02 && Math.abs(st.dx) < 0.02 && Math.abs(st.dy) < 0.02 && Math.abs(st.scale - 1) < 0.06 && Math.abs(r) < 3 && st.chars > 0.97, what + ' should rest at the normal look: ' + JSON.stringify(st)); };
ok('every "in" animation moves smoothly and ends at the normal look; every "out" starts there', () => {
  keys(M.TEXT_IN).filter(k => k !== 'none').forEach(k => { const an = { in: k, inMs: 600 }, d = 3000; for (let t = 0; t <= 600; t += 20) sane(M.textState(an, t, d), 'in ' + k + ' @' + t); near(M.textState(an, 599, d), 'in ' + k + ' end'); near(M.textState(an, 1500, d), 'in ' + k + ' after'); });
  keys(M.TEXT_OUT).filter(k => k !== 'none').forEach(k => { const an = { out: k, outMs: 600 }, d = 3000; near(M.textState(an, 1500, d), 'out ' + k + ' before'); near(M.textState(an, d - 600 + 1, d), 'out ' + k + ' start'); for (let t = d - 600; t <= d; t += 20) sane(M.textState(an, t, d), 'out ' + k + ' @' + t); });
});
ok('every loop stays sane for a long time and never hides the text for good', () => {
  keys(M.TEXT_LOOP).filter(k => k !== 'none').forEach(k => { let seen = 0; for (let t = 0; t < 12000; t += 17) { const st = M.textState({ loop: k }, t, 20000); sane(st, 'loop ' + k + ' @' + t); if (st.alpha > 0.9) seen++; } assert(seen > 100, k + ' is nearly always hidden'); });
});
ok('the ffmpeg engine can make pictures for each one: a short list of stills that cover the text, none of them empty', () => {
  keys(M.TEXT_IN).filter(k => k !== 'none').forEach(k => { const tl = M.textTimeline({ in: k, out: 'fade' }, 3000, 12); assert(tl && tl.length > 0 && tl.length <= 2 * M.MAX_STATES, 'in ' + k + ' ' + (tl && tl.length)); tl.forEach(s => assert(s.b > s.a && s.st.alpha > 0)); });
  keys(M.TEXT_OUT).filter(k => k !== 'none').forEach(k => { const tl = M.textTimeline({ out: k }, 3000, 12); assert(tl && tl.length > 0 && tl.length <= 2 * M.MAX_STATES, 'out ' + k); });
  keys(M.TEXT_LOOP).filter(k => k !== 'none').forEach(k => { const tl = M.textTimeline({ loop: k }, 4000, 12); assert(tl && tl.length > 0 && tl.length <= 2 * M.MAX_STATES, 'loop ' + k); });
});
console.log('\n' + n + ' checks passed');
