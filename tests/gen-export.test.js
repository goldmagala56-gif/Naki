'use strict';
// node tests/gen-export.test.js
// Shapes, arrows, spotlights and frames must reach the exported video: they have no file, so the export's missing-file check has to let them through.
const assert = require('assert'), fs = require('fs'), path = require('path');
const P = require('../www/project.js'), NP = require('../www/plan.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
    { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' }] }] };

ok('the plan: a shape, an arrow, a spotlight and a frame become overlays that carry their drawing and name no real file', () => {
  let p = base; const kinds = [[500, { kind: 'shape', shape: 'star' }], [4000, { kind: 'arrow' }], [7000, { kind: 'spotlight' }], [9000, { kind: 'frame', frame: 'film' }]];
  kinds.forEach(([t, g]) => { p = P.addGen(p, t, g, {}); });
  const ov = NP.projectToPlan(p).overlays; assert.strictEqual(ov.length, 4);
  ov.forEach(o => { assert(o.gen && o.gen.kind, 'carries its drawing'); assert(/^gen_/.test(o.asset), o.asset); });
});

// the real code from index.html: from where the overlay files are collected, to where they are handed to the engines
const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const a = html.indexOf('var ovFiles = {};'), b = html.indexOf('ffmpegOpts.overlayFiles = webcodecsOpts.overlayFiles = ovFiles;');
ok('the page: the code that checks the overlay files is where it should be', () => { assert(a > 0 && b > a, 'markers found'); });
const snippet = html.slice(a, b);
const run = (overlays, held) => {
  const toasts = [], plan = { overlays: overlays }, S = { overlays: {} };
  held.forEach(k => { S.overlays[k] = { file: { name: k } }; });
  const fn = new Function('plan', 'S', 'toast', snippet + '\nreturn ovFiles;'), ovFiles = fn(plan, S, (m) => toasts.push(m));
  return { plan, toasts, ovFiles };
};
ok('the export: shapes, spotlights and frames are kept, and nothing is said about a missing file', () => {
  const r = run([{ asset: 'gen_c1', gen: { kind: 'spotlight' } }, { asset: 'gen_c2', gen: { kind: 'frame' } }], []);
  assert.strictEqual(r.plan.overlays.length, 2); assert.strictEqual(r.toasts.length, 0, 'no warning: ' + r.toasts.join(' | '));
});
ok('the export: a picture or video overlay whose file is there is kept too, together with the shapes', () => {
  const r = run([{ asset: 'gen_c1', gen: { kind: 'shape' } }, { asset: 'ov1' }], ['ov1']);
  assert.deepStrictEqual(r.plan.overlays.map(o => o.asset), ['gen_c1', 'ov1']); assert.strictEqual(r.toasts.length, 0); assert.deepStrictEqual(Object.keys(r.ovFiles), ['ov1']);
});
ok('the export: an overlay whose file really is missing is still left out and reported, and the shapes stay', () => {
  const r = run([{ asset: 'gen_c1', gen: { kind: 'arrow' } }, { asset: 'ov1' }, { asset: 'ov2' }], ['ov1']);
  assert.deepStrictEqual(r.plan.overlays.map(o => o.asset), ['gen_c1', 'ov1']); assert.strictEqual(r.toasts.length, 1); assert(/overlay file is missing/i.test(r.toasts[0]));
  const only = run([{ asset: 'ov9' }], []); assert.strictEqual(only.plan.overlays, undefined, 'nothing left: the list is removed'); assert.strictEqual(only.toasts.length, 1);
});
console.log('\n' + n + ' checks passed');