'use strict';
// Checks the editor looks the fast export engine now draws (filters, fades, titles).  Run with:  node tests/webcodecs-looks.test.js   (or: npm test)
const assert = require('assert');
const T = require('../www/webcodecs-export.js').WebCodecsExport._test;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

ok('speed changes are left to the other engine (it keeps the sound pitch)', () => {
  assert.strictEqual(T.needsOtherEngine({ video: [{ type: 'play' }], audio: [] }), false);
  assert.strictEqual(T.needsOtherEngine({ video: [{ type: 'play', speed: 1 }], audio: [{ src: 'movie' }] }), false);
  assert.strictEqual(T.needsOtherEngine({ video: [{ type: 'play', speed: 2 }], audio: [] }), true);
  assert.strictEqual(T.needsOtherEngine({ video: [], audio: [{ src: 'movie', speed: 0.5 }] }), true);
});
ok('the colour filter is the same CSS look the editor preview uses', () => {
  assert.strictEqual(T.filterCss({ brightness: 1.3, contrast: 0.8, saturate: 0 }), 'brightness(1.3) contrast(0.8) saturate(0)');
  assert.strictEqual(T.filterCss(undefined), 'none');
});
ok('fades go from black to the picture and back, with no jump', () => {
  const sp = { sessionStart: 0, sessionEnd: 2000, vFadeIn: 1000, vFadeOut: 500 };
  assert.strictEqual(T.fadeAlpha(sp, 0), 0); assert.strictEqual(T.fadeAlpha(sp, 15), 0.5); assert.strictEqual(T.fadeAlpha(sp, 30), 1);
  assert.strictEqual(T.fadeAlpha(sp, 45), 1); assert.strictEqual(T.fadeAlpha(sp, 52.5), 0.5); assert.strictEqual(T.fadeAlpha(sp, 60), 0);
  assert.strictEqual(T.fadeAlpha({ sessionStart: 0, sessionEnd: 2000 }, 10), 1);
});
ok('titles are found only while they should be showing', () => {
  const t = [{ startMs: 1000, durMs: 500, text: 'a' }, { startMs: 1200, durMs: 1000, text: 'b' }];
  assert.deepStrictEqual(T.textsAt(t, 999).map(x => x.text), []); assert.deepStrictEqual(T.textsAt(t, 1000).map(x => x.text), ['a']);
  assert.deepStrictEqual(T.textsAt(t, 1300).map(x => x.text), ['a', 'b']); assert.deepStrictEqual(T.textsAt(t, 1500).map(x => x.text), ['b']); assert.deepStrictEqual(T.textsAt(undefined, 5), []);
});
ok('titles wrap to the picture width and sit at the same heights as the editor preview and the other engine', () => {
  const calls = [], g = { save() {}, restore() {}, measureText: s => ({ width: s.length * 10 }), fillText: (t, x, y) => calls.push([t, x, y]), fillRect() {} };
  const lines = T.drawTitle(g, { text: 'one two three four five six seven eight nine ten', size: 10, pos: 'center', color: '#fff' }, 400, 300);
  assert(lines.length > 1 && lines.every(l => l.length * 10 <= 400 * 0.88 + 1e-9));
  assert.strictEqual(calls[0][1], 200); assert.strictEqual(calls[0][2], Math.round(0.40 * 300));
  const top = []; T.drawTitle(Object.assign({}, g, { fillText: (t, x, y) => top.push(y) }), { text: 'x', size: 5, pos: 'top' }, 400, 300); assert.strictEqual(top[0], Math.round(0.07 * 300));
});
console.log('\n' + n + ' checks passed');