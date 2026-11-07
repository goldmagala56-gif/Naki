'use strict';
// node tests/volume-keyframes.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../www/project.js'), NP = require('../www/plan.js'), A = require('../www/anim.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const vclip = (id, start, dur) => ({ id, type: 'video', asset: 'movie', start, dur, in: start, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 });
const aclip = (id, start, dur) => ({ id, type: 'audio', asset: 'music', start, dur, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 });
const base = { naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, music: { type: 'audio', durMs: 60000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [vclip('vA', 0, 10000)] },
    { id: 't-music', kind: 'audio', role: 'music', muted: false, hidden: false, volume: 1, locked: false, clips: [aclip('m1', 0, 4000)] }] };
const music = p => p.tracks[1], clip = p => p.tracks[1].clips[0];
const withKf = () => {   // 100% at the start, 20% at 2 s
  let p = P.toggleKeyframe(base, 'm1', 'volume', 0); p = P.toggleKeyframe(p, 'm1', 'volume', 2000); return P.setAnimated(p, 'm1', 'volume', 0.2, 2000);
};

ok('a sound clip can be keyframed on its volume, a picture clip still on zoom and position', () => {
  assert.deepStrictEqual(P.keyframeProps(base, 'm1'), ['volume']); assert.deepStrictEqual(P.keyframeProps(base, 'vA'), ['zoom', 'x', 'y']);
});
ok('without keyframes the volume is the one fixed number, as before', () => {
  const q = P.setAnimated(base, 'm1', 'volume', 0.5, 1000); assert.strictEqual(clip(q).volume, 0.5); assert.strictEqual(clip(q).kf, undefined);
  assert.strictEqual(Math.round(P.clipGainAt(music(q), clip(q), 1000) * 100) / 100, 0.5);
  assert.strictEqual(P.setAnimated(base, 'm1', 'volume', 9, 0).tracks[1].clips[0].volume, 2, 'kept in range');
});
ok('with keyframes the volume glides between them and stays put before and after', () => {
  const p = withKf(), c = clip(p), tr = music(p);
  assert.deepStrictEqual(c.kf.volume.map(k => k[0]), [0, 2000]); assert.strictEqual(P.validate(p).length, 0);
  const g = t => Math.round(P.clipGainAt(tr, c, t) * 1000) / 1000;
  assert.strictEqual(g(0), 1); assert.strictEqual(g(1000), 0.6); assert.strictEqual(g(2000), 0.2); assert.strictEqual(g(3500), 0.2);
  assert.strictEqual(P.sourceAt(p, 1000).audio[0].gain.toFixed(2), '0.60', 'the preview reads the same number');
});
ok('the track volume, fades and mute still apply on top', () => {
  let p = withKf(); p = P.setTrackProps(p, 't-music', { volume: 0.5 });
  assert.strictEqual(Math.round(P.clipGainAt(music(p), clip(p), 0) * 1000) / 1000, 0.5);
  const m = P.setTrackProps(withKf(), 't-music', { muted: true }); assert.strictEqual(P.clipGainAt(music(m), clip(m), 0), 0);
});
ok('the export plan carries the volume curve', () => {
  const pts = NP.projectToPlan(withKf()).audio[0].points, at = ms => { let v = pts[0][1]; pts.forEach(q => { if (q[0] <= ms) v = q[1]; }); return v; };
  assert(at(0) > 0.95 && at(1000) > 0.5 && at(1000) < 0.7 && at(3000) < 0.25, JSON.stringify(pts.slice(0, 6)));
});
ok('cutting the clip keeps the curve in both pieces', () => {
  const s = P.splitAt(withKf(), 1000), a = s.tracks[1].clips[0], b = s.tracks[1].clips[1];
  assert(a.kf && b.kf && Math.abs(P.clipGainAt(s.tracks[1], b, 1000) - 0.6) < 0.01 && Math.abs(P.clipGainAt(s.tracks[1], a, 500) - 0.8) < 0.01);
});
ok('clearing the keyframes leaves the volume where the playhead was', () => {
  const q = P.clearKeyframes(withKf(), 'm1', 'volume', 1000); assert.strictEqual(clip(q).kf, undefined); assert.strictEqual(clip(q).volume, 0.6);
});
ok('the editor shows the keyframe buttons in Clip sound, and the edited files still parse', () => {
  const ed = read('editor.js'); assert(ed.includes("keyframeActions(c, 'volume')") && ed.includes("NANIM.valueOf(c, 'audio'"));
  ['editor.js', 'project.js', 'anim.js'].forEach(f => new vm.Script(read(f))); assert.deepStrictEqual(A.RANGE.audio.volume, [0, 2]);
});
console.log('\n' + n + ' checks passed');