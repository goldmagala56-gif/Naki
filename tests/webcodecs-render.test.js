'use strict';
// Checks what the fast export engine decides and where it draws things.  Run with:  node tests/webcodecs-render.test.js
const assert = require('assert');
const W = require('../www/webcodecs-export.js').WebCodecsExport, T = W._test;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const play = (o) => Object.assign({ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0 }, o || {});
const plan = (video, audio) => ({ video: video, audio: audio || [] });

ok('canRender: plain edits, opacity, zoom / turn / flip, fades and titles are drawn by the fast engine', () => {
  assert.strictEqual(W.canRender(plan([play()])), true);
  assert.strictEqual(W.canRender(plan([play({ opacity: 0.5 })])), true, 'opacity');
  assert.strictEqual(W.canRender(plan([play({ transform: { zoom: 2, x: 0, y: 0, rot: 90, flipH: true } })])), true, 'transform');
  assert.strictEqual(W.canRender(plan([play({ vFadeIn: 500, vFadeOut: 500 })])), true, 'fades');
  assert.strictEqual(W.canRender(Object.assign(plan([play()]), { texts: [{ startMs: 0, durMs: 1000, text: 'Hi' }] })), true, 'titles');
});
ok('canRender: speed always goes to the compatible engine; colour looks only if the canvas can filter', () => {
  assert.strictEqual(W.canRender(plan([play({ speed: 2 })])), false);
  assert.strictEqual(W.canRender(plan([play()], [{ src: 'movie', startMs: 0, durMs: 1000, inMs: 0, speed: 2, points: [[0, 1]] }])), false);
  const look = plan([play({ filter: { brightness: 1.2, contrast: 1, saturate: 1 } })]);
  T.setFilterSupport(false); assert.strictEqual(W.canRender(look), false);
  T.setFilterSupport(true); assert.strictEqual(W.canRender(look), true);
  assert.strictEqual(W.canRender(plan([play({ filter: { brightness: 1, contrast: 1, saturate: 1 } })])), true, 'a neutral look needs nothing');
  T.setFilterSupport(false); assert.strictEqual(W.canRender(plan([play({ filter: { brightness: 1, contrast: 1, saturate: 1 } })])), true);
});
ok('layout: an untouched picture fills the frame exactly', () => {
  const L = T.layout(null, 854, 480, false, 1280, 720);
  assert.deepStrictEqual([L.zoom, L.rot, L.flip, L.panX, L.panY, L.dw, L.dh, L.clip], [1, 0, false, 0, 0, 854, 480, null]);
});
ok('layout: turned on its side it is fitted inside the frame, like the export', () => {
  const L = T.layout({ zoom: 1, x: 0, y: 0, rot: 90, flipH: false }, 854, 480, false, 1280, 720);
  assert.strictEqual(L.dw, 480); assert.strictEqual(L.dh, 270);   // drawn 480x270, then turned = 270 wide, 480 tall
  assert.strictEqual(T.layout({ rot: 180 }, 854, 480, false, 1280, 720).dw, 854, '180 degrees keeps the shape');
});
ok('layout: zoom and pan move by the same amount as the preview', () => {
  const L = T.layout({ zoom: 2, x: 1, y: -1, rot: 0, flipH: false }, 854, 480, false, 1280, 720);
  assert.strictEqual(L.panX, -427); assert.strictEqual(L.panY, 240); assert.strictEqual(L.clip, null);
});
ok('layout: in a vertical video the picture is fitted first and zoom is clipped to the picture', () => {
  const L = T.layout({ zoom: 2, x: 0, y: 0, rot: 0, flipH: false }, 480, 854, true, 1280, 720);
  assert(Math.abs(L.dw - 480) < 1e-9 && Math.abs(L.dh - 270) < 1e-9, L.dw + 'x' + L.dh);
  assert(L.clip && Math.abs(L.clip.h - 270) < 1e-9 && Math.abs(L.clip.y - 292) < 1e-9);
  assert.strictEqual(T.layout(null, 480, 854, true, 1280, 720).clip, null, 'no zoom, no clipping');
});
ok('fade level: in from the start, out to the end, black at the very ends', () => {
  const sp = { sessionStart: 0, sessionEnd: 4000, vFadeIn: 500, vFadeOut: 1000 };
  assert.strictEqual(T.fadeLevel(sp, 0), 0); assert.strictEqual(T.fadeLevel(sp, 250), 0.5); assert.strictEqual(T.fadeLevel(sp, 2000), 1);
  assert.strictEqual(T.fadeLevel(sp, 3500), 0.5); assert.strictEqual(T.fadeLevel(sp, 4000), 0);
  assert.strictEqual(T.fadeLevel({ sessionStart: 0, sessionEnd: 1000 }, 500), 1, 'no fade set');
});
// a canvas that only writes down what it is asked to do
function mock() {
  const calls = [], g = { globalAlpha: 1, filter: '' };
  ['save', 'restore', 'beginPath', 'rect', 'clip', 'translate', 'scale', 'rotate', 'fillRect', 'drawImage'].forEach(k => { g[k] = function () { calls.push([k].concat([].slice.call(arguments))); }; });
  g.calls = calls; return g;
}
ok('drawing: flip, turn and zoom are applied in the order the preview uses, and opacity and colour are set', () => {
  const g = mock(); T.drawPicture(g, 'IMG', 1280, 720, 854, 480, false,
    { opacity: 0.5, filter: { brightness: 1.2, contrast: 1, saturate: 0 }, transform: { zoom: 2, x: 0, y: 0, rot: 90, flipH: true } });
  const names = g.calls.map(c => c[0]);
  assert.deepStrictEqual(names, ['save', 'translate', 'scale', 'fillRect', 'rotate', 'scale', 'drawImage', 'restore']);
  assert.deepStrictEqual(g.calls[2].slice(1), [2, 2]); assert.deepStrictEqual(g.calls[5].slice(1), [-1, 1]);
  assert.deepStrictEqual(g.calls[6], ['drawImage', 'IMG', -240, -135, 480, 270]);
  assert.strictEqual(g.globalAlpha, 0.5); assert.strictEqual(g.filter, 'brightness(1.2) contrast(1) saturate(0)');
});
ok('drawing: a plain picture is one simple draw, with no filter and no opacity', () => {
  const g = mock(); T.drawPicture(g, 'IMG', 1280, 720, 854, 480, false, {});
  assert.strictEqual(g.globalAlpha, 1); assert.strictEqual(g.filter, '');
  assert.deepStrictEqual(g.calls[g.calls.length - 2], ['drawImage', 'IMG', -427, -240, 854, 480]);
});
ok('drawing: zoom in a vertical video is clipped to the picture', () => {
  const g = mock(); T.drawPicture(g, 'IMG', 1280, 720, 480, 854, true, { transform: { zoom: 2, x: 0, y: 0, rot: 0, flipH: false } });
  assert.deepStrictEqual(g.calls.slice(0, 4).map(c => c[0]), ['save', 'beginPath', 'rect', 'clip']);
  assert(!g.calls.some(c => c[0] === 'fillRect'), 'no navy fill inside a vertical frame');
});
ok('titles wrap and sit at the same heights as before', () => {
  const calls = [], g = { measureText: s => ({ width: s.length * 10 }), fillText: (t, x, y) => calls.push([t, x, y]), fillRect() {} };
  const lines = T.drawTitle(g, { text: 'one two three four five six seven eight nine ten', size: 10, pos: 'center', color: '#fff' }, 400, 300);
  assert(lines.length > 1 && lines.every(l => l.length * 10 <= 400 * 0.88 + 1e-9));
  assert.strictEqual(calls[0][1], 200); assert.strictEqual(calls[0][2], Math.round(0.40 * 300));
});
console.log('\n' + n + ' checks passed');