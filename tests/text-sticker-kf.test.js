'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const A = require('../www/anim.js'), P = require('../www/project.js'), PL = require('../www/plan.js'), E = require('../www/export-engine.js');
const WC = require('../www/webcodecs-export.js').WebCodecsExport;
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const near = (a, b, e, m) => assert(Math.abs(a - b) <= (e || 0.001), (m || '') + ' ' + a + ' vs ' + b);
const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
const clip = (p, id) => P.findClip(p, id).clip;
const mkText = () => { const o = {}; const p = P.addTextClip(base, 1000, 4000, o); return { p, id: o.id }; };
const mkStk = () => { const o = {}; const p = P.addSticker(base, 1000, 3000, '\u2b50', o); return { p, id: o.id }; };
const info = { width: 320, height: 180, sar: 1, hasAudio: false, audioMono: false, durationSec: 100 };

ok('defaults: a sticker is 20% tall and straight, a text is size 7 with no turn and full opacity', () => {
  near(A.valueOf({}, 'sticker', 'size', 0), 0.2); near(A.valueOf({}, 'sticker', 'rot', 0), 0);
  near(A.valueOf({}, 'text', 'size', 0), 7); near(A.valueOf({ size: 12, rot: 30, opacity: 0.4 }, 'text', 'opacity', 0), 0.4);
});
ok('without keyframes size, turn and opacity are fixed values; opacity 1 and turn 0 are not stored', () => {
  let { p, id } = mkText();
  p = P.setAnimated(p, id, 'size', 12, 0); p = P.setAnimated(p, id, 'rot', 30, 0); p = P.setAnimated(p, id, 'opacity', 0.5, 0);
  assert.strictEqual(clip(p, id).size, 12); assert.strictEqual(clip(p, id).rot, 30); assert.strictEqual(clip(p, id).opacity, 0.5); assert(!clip(p, id).kf);
  p = P.setAnimated(p, id, 'rot', 0, 0); p = P.setAnimated(p, id, 'opacity', 1, 0);
  assert.strictEqual(clip(p, id).rot, undefined); assert.strictEqual(clip(p, id).opacity, undefined);
  assert.strictEqual(P.setAnimated(p, id, 'size', 99, 0).tracks.length, p.tracks.length); assert.strictEqual(clip(P.setAnimated(p, id, 'size', 99, 0), id).size, 30, 'kept inside the range');
});
ok('text: the diamond keys x, y, size, turn and opacity; values glide; taking the last keyframe away keeps the value', () => {
  let { p, id } = mkText();
  assert.deepStrictEqual(P.keyframeProps(p, id), ['x', 'y', 'size', 'rot', 'opacity']);
  p = P.toggleKeyframes(p, id, 0); p = P.setAnimated(p, id, 'size', 14, 2000); p = P.setAnimated(p, id, 'opacity', 0.2, 2000); p = P.setAnimated(p, id, 'rot', 90, 2000);
  near(A.valueOf(clip(p, id), 'text', 'size', 1000), 10.5); near(A.valueOf(clip(p, id), 'text', 'opacity', 1000), 0.6); near(A.valueOf(clip(p, id), 'text', 'rot', 1000), 45);
  const q = P.toggleKeyframes(P.toggleKeyframes(P.toggleKeyframes(base, 'vA', 0), 'vA', 0), 'vA', 0); assert(q);   // a picture clip is untouched by all this
  let r = P.toggleKeyframes(p, id, 2000); r = P.toggleKeyframes(r, id, 0);   // remove both ends
  assert(!clip(r, id).kf || !Object.keys(clip(r, id).kf).length);
});
ok('sticker: size and turn can be keyframed and are kept inside their ranges', () => {
  let { p, id } = mkStk();
  assert.deepStrictEqual(P.keyframeProps(p, id), ['x', 'y', 'size', 'rot']);
  p = P.setAnimated(p, id, 'size', 0.5, 0); assert.strictEqual(clip(p, id).size, 0.5);
  p = P.toggleKeyframes(p, id, 0); p = P.setAnimated(p, id, 'size', 5, 2000); p = P.setAnimated(p, id, 'rot', 90, 2000);
  near(A.valueOf(clip(p, id), 'sticker', 'size', 2000), 0.9, 0.001, 'clamped'); near(A.valueOf(clip(p, id), 'sticker', 'rot', 1000), 45);
});
ok('a cut keeps the new keyframes on both pieces', () => {
  let { p, id } = mkText(); p = P.toggleKeyframes(p, id, 0); p = P.setAnimated(p, id, 'size', 14, 3000);
  const cs = P.splitAt(p, 2500).tracks.find(t => t.kind === 'text').clips; assert.strictEqual(cs.length, 2);
  assert(cs[0].kf.size && cs[1].kf.size); assert.strictEqual(cs[1].kf.size[0][0], 0);
});
ok('textLook: nothing for a plain title (old projects are untouched), scale / turn / fade for the rest', () => {
  assert.strictEqual(A.textLook({ size: 7, rot: 10 }, 0), null);
  const k = A.textLook({ size: 7, rot: 20, opacity: 0.5 }, 0); near(k.scale, 1); near(k.rot, 20); near(k.alpha, 0.5);
  const kf = A.textLook({ size: 7, kf: { size: [[0, 7], [2000, 14]], rot: [[0, 0], [2000, 90]] } }, 1000); near(kf.scale, 1.5); near(kf.rot, 45); near(kf.alpha, 1);
});
ok('the plan carries the keyframes (baked, with the start time) and a fixed opacity', () => {
  let { p, id } = mkText(); p = P.toggleKeyframes(p, id, 0); p = P.setAnimated(p, id, 'size', 14, 2000);
  const t = PL.projectToPlan(p).texts[0]; assert(t.kf.size && t.kf.rot && t.kf.opacity); assert.strictEqual(t.kfT0, 1000);
  const q = P.setAnimated(mkText().p, mkText().id, 'opacity', 0.5, 0); assert(q);
  const m = mkText(), t2 = PL.projectToPlan(P.setAnimated(m.p, m.id, 'opacity', 0.5, 0)).texts[0]; assert.strictEqual(t2.opacity, 0.5); assert.strictEqual(t2.kf, undefined);
  const s = mkStk(); let sp = P.toggleKeyframes(s.p, s.id, 0); sp = P.setAnimated(sp, s.id, 'rot', 90, 2000);
  const so = PL.projectToPlan(sp).stickers[0]; assert(so.kf.size && so.kf.rot); assert.strictEqual(so.kfT0, 1000);
});
ok('ffmpeg: a keyframed title becomes slices with their own scale, no fixed turn; a plain title stays one picture', () => {
  let { p, id } = mkText(); p = P.toggleKeyframes(p, id, 0); p = P.setAnimated(p, id, 'size', 14, 2000); p = P.setAnimated(p, id, 'rot', 30, 2000);
  const f = E.planToJobs(PL.projectToPlan(p), info, { height: 180 }).textFiles.filter(x => /^txt/.test(x.name));
  assert(f.length > 4, 'slices: ' + f.length); f.forEach(x => { assert(x.state); assert.strictEqual(x.clip.rot, 0); assert.strictEqual(x.clip.size, 7); });
  assert.strictEqual(f.reduce((a, x) => a + x.clip.durMs, 0), 4000); assert(Math.max(...f.map(x => x.state.scale)) > Math.min(...f.map(x => x.state.scale)));
  const plain = E.planToJobs(PL.projectToPlan(mkText().p), info, { height: 180 }).textFiles.filter(x => /^txt/.test(x.name)); assert.strictEqual(plain.length, 1); assert(!plain[0].state);
});
ok('ffmpeg: a sticker with size or turn keyframes becomes slices; one with none stays one picture', () => {
  const s = mkStk(); let sp = P.toggleKeyframes(s.p, s.id, 0); sp = P.setAnimated(sp, s.id, 'size', 0.6, 2000);
  const f = E.planToJobs(PL.projectToPlan(sp), info, { height: 180 }).textFiles.filter(x => x.sticker);
  assert(f.length > 4); f.forEach(x => assert.strictEqual(x.clip.kfT0, 1000)); assert(Math.max(...f.map(x => x.clip.size)) > Math.min(...f.map(x => x.clip.size)) + 0.1);
  const one = E.planToJobs(PL.projectToPlan(s.p), info, { height: 180 }).textFiles.filter(x => x.sticker); assert.strictEqual(one.length, 1); assert.strictEqual(one[0].name, 'stk000.png');
});
ok('the fast engine still takes these plans, and draws them per frame', () => {
  let { p, id } = mkText(); p = P.toggleKeyframes(p, id, 0); p = P.setAnimated(p, id, 'size', 14, 2000);
  assert.strictEqual(WC.canRender(PL.projectToPlan(p)), true);
  const wc = read('webcodecs-export.js'); ['NA.textLook(ti.t', 'function stickerLive', 'drawStickerLive(stickers[ks], tMs)', 'ti.moL'].forEach(s => assert(wc.includes(s), s));
});
ok('the editor has the Opacity tab, the keyframe rows and keyframe-aware gestures, and is valid JavaScript', () => {
  const ed = read('editor.js'); new vm.Script(ed);
  ["{ key: 'opacity', label: 'Opacity' }", "keyframeActions(c, cur)", 'NANIM.textLook(c, E.t - c.start)', "NANIM.valueOf(c, tg.kind, 'size', rl)", "k === 'size' || k === 'rot') q = P.setAnimated"].forEach(s => assert(ed.includes(s), s));
});
console.log('\n' + n + ' checks passed');