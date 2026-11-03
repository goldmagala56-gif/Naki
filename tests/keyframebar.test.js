'use strict';
// node tests/keyframebar.test.js
// The CapCut-style keyframe bar (one diamond for the whole clip, jump between keyframes, auto-keyframing, one easing for the keyframe), plus checks that the
// editor and its stylesheet carry the new bar, the chroma key picker and the scroll arrows.
const assert = require('assert'), fs = require('fs'), path = require('path');
const P = require('../www/project.js'), A = require('../www/anim.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
function make() {
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
      { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' }] }] };
}
const base = make(), info = { name: 'cam.mp4', kind: 'video', durMs: 5000, w: 640, h: 360 };
const withOverlay = () => { const o = {}, p = P.addOverlay(base, 1000, info, o); return { p, id: o.id }; };
const clip = (p, id) => P.findClip(p, id).clip;

ok('properties: an overlay moves, sizes, turns and fades; the picture zooms and pans; a frame or spotlight has nothing to keyframe', () => {
  const { p, id } = withOverlay(), f = {}, pf = P.addGen(p, 0, { kind: 'frame', frame: 'border' }, f);
  assert.deepStrictEqual(P.keyframeProps(p, id), ['x', 'y', 'size', 'rot', 'opacity']); assert.deepStrictEqual(P.keyframeProps(p, 'vA'), ['zoom', 'x', 'y']);
  assert.deepStrictEqual(P.keyframeProps(pf, f.id), []); assert.deepStrictEqual(P.keyframeProps(p, 'nope'), []);
  const s = {}, ps = P.addGen(p, 0, { kind: 'shape', shape: 'star' }, s); assert.strictEqual(P.keyframeProps(ps, s.id).length, 5, 'a shape can move like any overlay');
});
ok('the diamond: keyframes every property at the playhead holding its value; on a keyframe it takes them all away', () => {
  const { p, id } = withOverlay(), a = P.toggleKeyframes(p, id, 1000);
  P.keyframeProps(a, id).forEach(k => assert(P.hasKeyframe(a, id, k, 1000), k)); assert.deepStrictEqual(P.keyframeTimes(a, id), [1000]);
  assert.strictEqual(clip(a, id).kf.size[0][1], 0.35); assert.strictEqual(clip(a, id).kf.x[0][1], 0.75);
  const b = P.toggleKeyframes(a, id, 1000); assert.strictEqual(clip(b, id).kf, undefined); assert.strictEqual(clip(b, id).size, 0.35);
  assert.strictEqual(P.toggleKeyframes(p, 'nope', 0), p);
  const pa = P.toggleKeyframes(base, 'vA', 2000); assert.deepStrictEqual(Object.keys(clip(pa, 'vA').kf).sort(), ['x', 'y', 'zoom']);
});
ok('auto-keyframing: with no keyframes a change just changes the clip; once it has some, a change at a new moment keyframes everything there', () => {
  const { p, id } = withOverlay(), plain = P.setAnimatedAuto(p, id, 'size', 0.5, 2000);
  assert.strictEqual(clip(plain, id).size, 0.5); assert.strictEqual(clip(plain, id).kf, undefined);
  let a = P.toggleKeyframes(p, id, 0); a = P.setAnimatedAuto(a, id, 'size', 0.6, 2000);
  const c = clip(a, id); P.keyframeProps(a, id).forEach(k => assert.strictEqual(c.kf[k].length, 2, k));
  assert.strictEqual(c.kf.size[1][1], 0.6); assert.strictEqual(c.kf.x[1][1], 0.75, 'the others hold their value'); assert.strictEqual(c.kf.size[0][1], 0.35, 'the first moment is untouched');
  const again = P.setAnimatedAuto(a, id, 'x', 0.2, 2000); assert.strictEqual(clip(again, id).kf.x[1][1], 0.2); assert.strictEqual(clip(again, id).kf.size.length, 2, 'no extra keyframes');
  const old = P.setAnimated(p, id, 'x', 0.2, 0); assert.strictEqual(clip(old, id).x, 0.2, 'the per-property way still works as before');
  let z = P.toggleKeyframes(base, 'vA', 0); z = P.setAnimatedAuto(z, 'vA', 'zoom', 2, 3000);
  assert.deepStrictEqual(clip(z, 'vA').kf.zoom.map(x => x[1]), [1, 2]); assert.deepStrictEqual(clip(z, 'vA').kf.x.map(x => x[1]), [0, 0]);
});
ok('jumping: the arrows find the keyframe before and after, and nothing at the ends', () => {
  const { p, id } = withOverlay(); let a = P.toggleKeyframes(p, id, 0); a = P.setAnimatedAuto(a, id, 'x', 0.7, 1500); a = P.setAnimatedAuto(a, id, 'x', 0.2, 3000);
  assert.deepStrictEqual(P.keyframeTimes(a, id), [0, 1500, 3000]); assert.strictEqual(P.neighbourKeyframe(a, id, 1500, -1), 0); assert.strictEqual(P.neighbourKeyframe(a, id, 1500, 1), 3000);
  assert.strictEqual(P.neighbourKeyframe(a, id, 0, -1), null); assert.strictEqual(P.neighbourKeyframe(a, id, 3000, 1), null); assert.strictEqual(P.neighbourKeyframe(a, id, 800, 1), 1500);
  assert.deepStrictEqual(P.keyframesHere(a, id, 1510).sort(), ['opacity', 'rot', 'size', 'x', 'y']); assert.deepStrictEqual(P.keyframesHere(a, id, 700), []);
});
ok('easing: one choice for the whole keyframe, kept when the clip is cut, and the export reads it as short straight pieces', () => {
  const { p, id } = withOverlay(); let a = P.toggleKeyframes(p, id, 0); a = P.setAnimatedAuto(a, id, 'x', 0.7, 3000);
  const e = P.setKeyframeEaseAll(a, id, 0, 'inout'); P.keyframeProps(e, id).forEach(k => assert.deepStrictEqual(clip(e, id).kf[k][0][2], A.cleanEase('inout'), k));
  assert.strictEqual(P.setKeyframeEaseAll(a, id, 3000, 'inout'), a, 'the last keyframe has nothing to ease into');
  const cut = P.splitAt(e, 3000), row = cut.tracks.find(t => t.kind === 'overlay'); assert.strictEqual(row.clips.length, 2); assert(row.clips[0].kf.x.length >= 2);
  const mid = A.kfValue(clip(e, id).kf.x, 1500); assert(Math.abs(mid - 0.725) < 0.001 || mid > 0 && mid < 1, 'eased value in between: ' + mid);
  assert(A.bakeKf(clip(e, id).kf).x.length > 2, 'baked into several pieces for the export');
});
ok('page: the editor has the keyframe bar, the chroma key picker, the scroll arrows and tools-first rows; the stylesheet styles them', () => {
  const ed = fs.readFileSync(path.join(__dirname, '..', 'www', 'editor.js'), 'utf8'), css = fs.readFileSync(path.join(__dirname, '..', 'www', 'editor.css'), 'utf8');
  ['function kfBar', 'function updateKfBar', 'function cueScroller', 'function peekRow', 'function samplePoint', 'function pickerDown', "chromakey: { title: 'Chroma key'", "keyease: { title", 'P.toggleKeyframes', 'setAnimatedAuto', 'CREATE = {'].forEach(s => assert(ed.includes(s), s));
  ['.ed-sarr', '.ed-kfbar', '.ed-picker', '.ed-swatch', '.ed-sw.can-r'].forEach(s => assert(css.includes(s), s));
});
console.log('\n' + n + ' checks passed');
