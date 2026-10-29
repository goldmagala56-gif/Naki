'use strict';
// node tests/shapes.test.js
// Shapes, arrows, spotlights and frames on the overlay rows: tidying, project edits, the export plan, the drawing, and what the ffmpeg engine builds.
const assert = require('assert');
const F = require('../www/fx.js'), P = require('../www/project.js'), NP = require('../www/plan.js'), E = require('../www/export-engine.js');
const G = F.gen;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

// a pretend canvas that remembers what was drawn
function pretend() {
  const img = { data: null }, log = [];
  const g = new Proxy({ globalCompositeOperation: 'source-over', globalAlpha: 1 }, {
    get: (t, k) => { if (k === 'createImageData') return (a, b) => ({ data: new Uint8ClampedArray(a * b * 4) }); if (k === 'putImageData') return (im) => { img.data = im.data; }; return k in t ? t[k] : (...a) => { log.push(k); }; },
    set: (t, k, v) => { t[k] = v; return true; } });
  return { g, img, log };
}
function make() {
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
      { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' }] }] };
}
const base = make();

ok('tidying: every kind has limits and defaults, nonsense is not stored', () => {
  assert.strictEqual(G.clean(null), null); assert.strictEqual(G.clean({ kind: 'sparkle' }), null);
  assert.deepStrictEqual(G.clean({ kind: 'shape' }), { kind: 'shape', shape: 'rect', fill: '#ffffff', stroke: null, strokeW: 0.04, ar: 0.6, corner: 0 });
  assert.strictEqual(G.clean({ kind: 'shape', fill: null }).fill, '#ffffff', 'a shape always shows something');
  assert.strictEqual(G.clean({ kind: 'shape', fill: null, stroke: '#ff0000' }).fill, null);
  assert.strictEqual(G.clean({ kind: 'shape', shape: 'line', ar: 5 }).ar, 0.5); assert.strictEqual(G.clean({ kind: 'shape', ar: 0 }).ar, 0.1);
  assert.strictEqual(G.clean({ kind: 'shape', shape: 'hexagon!' }).shape, 'rect'); assert.strictEqual(G.clean({ kind: 'shape', shape: 'circle', corner: 0.4 }).corner, 0, 'only rounded has corners');
  assert.deepStrictEqual(G.clean({ kind: 'arrow', thick: 9, curve: -5, color: 'zzz' }), { kind: 'arrow', style: 'classic', color: '#ff3b30', thick: 0.5, ar: 0.4, curve: -1 });
  const s = G.clean({ kind: 'spotlight', size: 9, dim: 2, cx: -1, rot: 190 }); assert.deepStrictEqual([s.full, s.size, s.dim, s.cx, s.rot, s.shape], [true, 1.5, 1, 0, -170, 'circle']);
  assert.strictEqual(G.clean({ kind: 'frame', frame: 'film' }).color, '#111111'); assert.strictEqual(G.clean({ kind: 'frame', frame: 'nope' }).frame, 'border'); assert.strictEqual(G.clean({ kind: 'frame', width: 5 }).width, 0.3);
  G.FRAMES.concat(G.SHAPES.map(x => ({ key: x.key, shape: 1 }))).forEach(x => assert(G.label(G.clean(x.shape ? { kind: 'shape', shape: x.key } : { kind: 'frame', frame: x.key })).length > 3));
  assert.deepStrictEqual(G.natural(G.clean({ kind: 'shape', shape: 'circle' }), 640, 360), { w: 1024, h: 1024 }); assert.deepStrictEqual(G.natural(G.clean({ kind: 'frame' }), 640, 360), { w: 640, h: 360 });
});

ok('project: a shape goes on an overlay row with no file, a frame lasts to the end, overlapping ones get their own rows', () => {
  const o = {}, p = P.addGen(base, 1000, { kind: 'shape', shape: 'star' }, o), f = P.findClip(p, o.id);
  assert.strictEqual(f.track.kind, 'overlay'); assert.strictEqual(f.clip.asset, null); assert.strictEqual(f.clip.type, 'freeze'); assert.strictEqual(f.clip.gen.shape, 'star');
  assert.deepStrictEqual([f.clip.start, f.clip.dur, f.clip.size], [1000, 3000, 0.3]); assert.strictEqual(P.validate(p).length, 0);
  const o2 = {}, p2 = P.addGen(p, 2000, { kind: 'frame', frame: 'polaroid' }, o2), f2 = P.findClip(p2, o2.id);
  assert.deepStrictEqual([f2.clip.dur, f2.clip.size, f2.clip.x], [10000, 1, 0.5]); assert.notStrictEqual(f2.track.id, f.track.id); assert.strictEqual(p2.tracks.filter(t => t.kind === 'overlay').length, 2);
  assert.strictEqual(P.addGen(base, 0, { kind: 'zzz' }), base); assert.strictEqual(P.findClip(P.addGen(base, 0, { kind: 'arrow' }, o), o.id).clip.size, 0.4);
});
ok('project: Edit changes only what is mentioned, and the usual overlay tools work on them (keyframes, blend, mask, split, copy, plan)', () => {
  const o = {}; let p = P.addGen(base, 1000, { kind: 'shape', shape: 'heart' }, o); const c = (q) => P.findClip(q, o.id).clip;
  let q = P.setGenProps(p, o.id, { fill: '#ff0000', strokeW: 0.1, ar: 99 }); assert.deepStrictEqual([c(q).gen.fill, c(q).gen.strokeW, c(q).gen.ar, c(q).gen.shape], ['#ff0000', 0.1, 3, 'heart']);
  assert.strictEqual(P.setGenProps(q, o.id, { fill: '#ff0000' }), q, 'no change, same project'); assert.strictEqual(P.setGenProps(base, 'vA', { fill: '#ff0000' }), base, 'only generated overlays');
  q = P.toggleKeyframe(q, o.id, 'x', 0); q = P.setAnimated(q, o.id, 'x', 0.8, 2000); assert.strictEqual(c(q).kf.x.length, 2);
  q = P.setOverlayFx(q, o.id, { blend: 'screen' }); assert.strictEqual(c(q).blend, 'screen');
  const s = P.splitAt(q, 2500), row = s.tracks.find(t => t.kind === 'overlay'); assert.strictEqual(row.clips.length, 2); row.clips.forEach(k => assert.strictEqual(k.gen.fill, '#ff0000'));
  const out = {}, d = P.duplicateClip(q, o.id, out); assert.strictEqual(P.findClip(d, out.id).clip.gen.shape, 'heart');
  const ov = NP.projectToPlan(q).overlays[0]; assert.strictEqual(ov.gen.shape, 'heart'); assert.strictEqual(ov.asset, 'gen_' + o.id); assert.strictEqual(ov.kind, 'image'); assert.strictEqual(ov.w, 1000); assert.strictEqual(ov.h, 3000, 'height 300% of the width (it was set to 99 and tidied to 3)'); assert.strictEqual(ov.blend, 'screen');
  const o3 = {}, fr = NP.projectToPlan(P.addGen(base, 0, { kind: 'frame', frame: 'film' }, o3)).overlays[0]; assert.deepStrictEqual([fr.w, fr.h, fr.size], [0, 0, 1]);
});

ok('drawing: every shape, arrow and frame draws something, and nothing throws', () => {
  G.SHAPES.forEach(s => { const t = pretend(); G.draw(t.g, { kind: 'shape', shape: s.key, stroke: '#000000' }, 200, 120); assert(t.log.length > 3, s.key); });
  G.ARROWS.forEach(a => [-1, 0, 1].forEach(cv => { const t = pretend(); G.draw(t.g, { kind: 'arrow', style: a.key, curve: cv }, 200, 80); assert(t.log.includes('stroke'), a.key); }));
  G.FRAMES.forEach(f => { const t = pretend(); G.draw(t.g, { kind: 'frame', frame: f.key }, 320, 180); assert(t.log.length > 3, f.key); const v = pretend(); G.draw(v.g, { kind: 'frame', frame: f.key }, 180, 320); assert(v.log.length > 3, f.key + ' tall'); });
  const t = pretend(); G.draw(t.g, { kind: 'zzz' }, 10, 10); assert.strictEqual(t.log.length, 0);
});
ok('spotlight: the spot is clear, the rest is dark by the Darkness amount, it moves, and a soft edge fades', () => {
  const W = 80, H = 60, at = (img, x, y) => img.data[(y * W + x) * 4 + 3], run = (o) => { const t = pretend(); G.draw(t.g, Object.assign({ kind: 'spotlight', feather: 0 }, o), W, H); return t.img; };
  let im = run({ size: 0.5, dim: 0.8 }); assert.strictEqual(at(im, 40, 30), 0); assert.strictEqual(at(im, 1, 1), 204);
  im = run({ size: 0.5, dim: 0.8, cx: 0.2 }); assert.strictEqual(at(im, 16, 30), 0); assert.strictEqual(at(im, 64, 30), 204);
  im = run({ size: 0.5, dim: 0 }); assert.strictEqual(at(im, 1, 1), 0);
  im = run({ size: 0.5, dim: 1, shape: 'rect', stretch: 2 }); assert.strictEqual(at(im, 40, 30), 0); assert.strictEqual(at(im, 40, 3), 255);
  const soft = run({ size: 0.5, dim: 1, feather: 1 }); assert(at(soft, 40, 30) < 40 && at(soft, 1, 1) > 200 && at(soft, 40, 5) > 0 && at(soft, 40, 5) < 255, 'soft edge: ' + at(soft, 40, 5));
});

// ---------- the ffmpeg engine ----------
const info0 = { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 6 };
const plan0 = (overlays) => ({ naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 6000 }, audio: [], video: [{ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0 }], overlays });
const ovg = (gen, o) => Object.assign({ startMs: 500, durMs: 2000, asset: 'gen_cx', kind: 'image', inMs: 0, x: 0.5, y: 0.5, size: 1, rot: 0, opacity: 1, w: 0, h: 0, gen: G.clean(gen) }, o || {});
const graphOf = (r) => { const a = r.jobs.find(j => j.produces === 'v0000.ts').args; return { a, g: a[a.indexOf('-filter_complex') + 1] }; };
ok('ffmpeg engine: a frame or spotlight is the size of the picture, a shape keeps its own shape, and both read a png the page draws', () => {
  let r = graphOf(E.planToJobs(plan0([ovg({ kind: 'frame', frame: 'film' })]), info0, { height: 360 }));
  assert(r.a.includes('gen_cx.png') && !r.a.includes('gen_cx.in')); assert(r.g.includes('scale=640:360'), r.g); assert(r.g.includes("enable='between(t,0.500,2.500)'"));
  r = graphOf(E.planToJobs(plan0([ovg({ kind: 'shape', shape: 'circle' }, { size: 0.3, w: 1000, h: 1000 })]), info0, { height: 360 })); assert(r.g.includes('scale=192:192'), r.g);
  r = graphOf(E.planToJobs(plan0([ovg({ kind: 'spotlight' }, { blend: 'multiply' })]), info0, { height: 360 })); assert(r.g.includes("blend=all_expr='A*B/255'"), 'blend works on them too');
  r = graphOf(E.planToJobs(plan0([ovg({ kind: 'frame' }, { kind: 'image' })]), info0, { height: 1080 })); assert(r.g.includes('scale=1920:1080'), 'a bigger export: ' + r.g);
});
console.log('\n' + n + ' checks passed');