'use strict';
// node tests/ease.test.js
// Keyframe easing (the graph under the keyframe buttons): the maths, the project edits, the export plan, and ffmpeg.
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const A = require('../www/anim.js'), P = require('../www/project.js'), NP = require('../www/plan.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const near = (a, b, m, tol) => assert(Math.abs(a - b) <= (tol == null ? 1e-6 : tol), (m || '') + ' ' + a + ' vs ' + b);
const E_IO = [0.42, 0, 0.58, 1], CUSTOM = [0.2, 0.1, 0.7, 0.95];

ok('easing: names and handles are tidied, a straight line is stored as nothing, and the presets are what they say', () => {
  assert.strictEqual(A.cleanEase(null), null); assert.strictEqual(A.cleanEase('linear'), null); assert.strictEqual(A.cleanEase([0.3, 0.3, 0.7, 0.7]), null, 'handles on the diagonal are a straight line');
  assert.deepStrictEqual(A.cleanEase([2, -1, 0.5, 0.5]), [1, 0, 0.5, 0.5], 'kept inside the square, so a value never overshoots'); assert.strictEqual(A.cleanEase('hold'), 'hold');
  assert.deepStrictEqual(A.cleanEase('in'), [0.42, 0, 1, 1]); assert.strictEqual(A.cleanEase('nonsense'), null); assert.strictEqual(A.cleanEase([1, 2, 3]), null);
  assert.deepStrictEqual([A.easeName(null), A.easeName('hold'), A.easeName([0.42, 0, 1, 1]), A.easeName([0, 0, 0.58, 1]), A.easeName(E_IO), A.easeName(CUSTOM)], ['linear', 'hold', 'in', 'out', 'inout', 'custom']);
  assert(A.EASES.length === 5); assert.deepStrictEqual(A.bezierOf(null), [0.333, 0.333, 0.667, 0.667]); assert.deepStrictEqual(A.bezierOf(E_IO), E_IO);
});
ok('easing: progress follows the curve (slow start, slow end, a jump for hold), never goes backwards, and a value between keyframes uses it', () => {
  near(A.easeProgress(null, 0.3), 0.3); assert.strictEqual(A.easeProgress('hold', 0.99), 0); assert.strictEqual(A.easeProgress('hold', 1), 1);
  assert(A.easeProgress([0.42, 0, 1, 1], 0.5) < 0.5 && A.easeProgress([0, 0, 0.58, 1], 0.5) > 0.5); near(A.easeProgress(E_IO, 0.5), 0.5, 'in-out is even in the middle', 1e-4);
  for (const f of [0, 0.1, 0.3, 0.7, 1]) near(A.easeProgress(E_IO, f) + A.easeProgress(E_IO, 1 - f), 1, 'in-out is mirrored at ' + f, 1e-4);
  let prev = -1; for (let i = 0; i <= 100; i++) { const y = A.easeProgress([0.9, 0, 0.1, 1], i / 100); assert(y >= prev - 1e-9); prev = y; }
  near(A.kfValue([[0, 1], [1000, 3]], 500), 2); near(A.kfValue([[0, 1, 'in'], [1000, 3]], 500), 1 + 2 * A.easeProgress('in', 0.5)); assert.strictEqual(A.kfValue([[0, 1, 'hold'], [1000, 3]], 999), 1); assert.strictEqual(A.kfValue([[0, 1, 'hold'], [1000, 3]], 1000), 3);
  assert.deepStrictEqual(A.shiftKf({ x: [[500, 1, 'hold'], [900, 2]] }, 500), { x: [[0, 1, 'hold'], [400, 2]] }, 'the ease travels with its keyframe');
});
ok('easing: cutting a move in pieces, or adding a keyframe in the middle of it, keeps the motion exactly (to a hair)', () => {
  const pts = [[0, 0, CUSTOM], [1000, 10]];
  [0.2, 0.5, 0.8].forEach(cut => {
    const L = A.sliceKf(pts, 0, 1000 * cut), R = A.sliceKf(pts, 1000 * cut, 1000); let worst = 0;
    for (let i = 0; i <= 40; i++) { const t = 1000 * cut * i / 40; worst = Math.max(worst, Math.abs(A.kfValue(L, t) - A.kfValue(pts, t))); }
    for (let i = 0; i <= 40; i++) { const t = 1000 * cut + (1000 - 1000 * cut) * i / 40; worst = Math.max(worst, Math.abs(A.kfValue(R, t - 1000 * cut) - A.kfValue(pts, t))); }
    assert(worst < 0.01, 'split at ' + cut + ': ' + worst);
  });
  const p3 = [[0, 0, [0.42, 0, 1, 1]], [400, 4, 'hold'], [900, 8, [0, 0, 0.58, 1]], [1500, 12]], w = A.sliceKf(p3, 200, 1100); let worst = 0;
  for (let i = 0; i <= 60; i++) { const t = 200 + 900 * i / 60; worst = Math.max(worst, Math.abs(A.kfValue(w, t - 200) - A.kfValue(p3, t))); } assert(worst < 0.01, 'a piece with a hold and two moves in it: ' + worst);
  assert.deepStrictEqual(A.sliceKf([[0, 1], [1000, 5]], 250, 750), [[0, 2], [500, 4]], 'plain keyframes: as before, with no third item');
  const q = [[0, 0, CUSTOM], [1000, 10]], before = []; for (let i = 0; i <= 20; i++) before.push(A.kfValue(q, i * 50)); A.insertKf(q, 300, A.kfValue(q, 300));
  assert.strictEqual(q.length, 3); for (let i = 0; i <= 20; i++) near(A.kfValue(q, i * 50), before[i], 'after adding a keyframe, at ' + i * 50, 0.01);
});
ok('easing: for the export every eased move becomes straight pieces close to the curve, a hold becomes a jump, and plain keyframes are untouched', () => {
  const kf = { x: [[0, 0, CUSTOM], [1000, 10]], y: [[0, 1], [500, 2, 'hold'], [1000, 5]], z: [[0, 1], [1000, 3]] }, b = A.bakeKf(kf);
  assert.strictEqual(b.x.length, 13); assert.deepStrictEqual(b.y, [[0, 1], [500, 2], [999, 2], [1000, 5]]); assert.deepStrictEqual(b.z, [[0, 1], [1000, 3]]); assert(b.x.every(p => p.length === 2));
  let worst = 0; for (let i = 0; i <= 200; i++) worst = Math.max(worst, Math.abs(A.kfValue(b.x, i * 5) - A.kfValue(kf.x, i * 5))); assert(worst < 0.1, 'within 1% of the move: ' + worst);
  assert.strictEqual(A.bakeKf(null), null); assert.strictEqual(kf.x[0].length, 3, 'the original is not changed');
});

// ---------- the project ----------
function make() {
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
      { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 6000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' },
      { id: 'vB', type: 'video', asset: 'movie', start: 6000, dur: 6000, in: 30000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lB' }] }] };
}
const base = make(), info = { name: 'cam.mp4', kind: 'video', durMs: 5000, w: 640, h: 360 };
function eased() { const o = {}; let p = P.addOverlay(base, 0, info, o); p = P.toggleKeyframe(p, o.id, 'x', 0); p = P.setAnimated(p, o.id, 'x', 0.2, 4000); p = P.setKeyframeEase(p, o.id, 'x', 0, CUSTOM); return { p, id: o.id }; }
ok('project: the ease is set on a keyframe, read back, removed, and refused where there is nothing to ease into', () => {
  const o = {}; let p = P.addOverlay(base, 0, info, o), id = o.id; p = P.toggleKeyframe(p, id, 'x', 0); p = P.setAnimated(p, id, 'x', 0.2, 4000);
  assert.deepStrictEqual(P.keyframeEase(p, id, 'x', 0), { index: 0, count: 2, ease: null, hasNext: true }); assert.strictEqual(P.keyframeEase(p, id, 'x', 2000), null, 'no keyframe there'); assert.strictEqual(P.keyframeEase(p, id, 'y', 0), null);
  assert.strictEqual(P.keyframeEase(p, id, 'x', 4000).hasNext, false);
  const q = P.setKeyframeEase(p, id, 'x', 0, 'inout'); assert.deepStrictEqual(P.findClip(q, id).clip.kf.x[0], [0, 0.75, E_IO]); assert.strictEqual(P.setKeyframeEase(q, id, 'x', 0, 'inout'), q, 'no change: the same project');
  assert.strictEqual(P.setKeyframeEase(q, id, 'x', 4000, 'in'), q, 'the last keyframe has no next one'); assert.strictEqual(P.setKeyframeEase(q, 'vA', 'x', 0, 'in'), q); assert.deepStrictEqual(P.findClip(P.setKeyframeEase(q, id, 'x', 0, 'linear'), id).clip.kf.x[0], [0, 0.75]);
  assert.deepStrictEqual(P.findClip(P.setKeyframeEase(q, id, 'x', 0, 'hold'), id).clip.kf.x[0], [0, 0.75, 'hold']); assert.deepStrictEqual(P.findClip(q, id).clip.kf.x[0], [0, 0.75, E_IO], 'the old project is untouched');
  assert.deepStrictEqual(P.findClip(P.setAnimated(q, id, 'x', 0.1, 0), id).clip.kf.x[0], [0, 0.1, E_IO], 'changing the value at a keyframe keeps its ease');
});
ok('project: a clip that is split, trimmed or sped up keeps moving the same way, and a new keyframe in the middle of a move does not change it', () => {
  const { p, id } = eased(), c0 = P.findClip(p, id).clip, at = (cl, t) => A.overlayState(cl, t - cl.start).x, want = (t) => at(c0, t);
  const s = P.splitAt(p, 2000), row = s.tracks.find(t => t.kind === 'overlay'), L = row.clips[0], R = row.clips[1];
  for (let t = 0; t <= 4000; t += 250) near(at(t < 2000 ? L : R, t), want(t), 'split, at ' + t, 0.01);
  const tr = P.trimClipStart(p, id, 1000), ct = P.findClip(tr, id).clip; for (let t = 1000; t <= 4000; t += 250) near(at(ct, t), want(t), 'trimmed, at ' + t, 0.01);
  const sp = P.setClipSpeed(P.setAnimated(P.toggleKeyframe(base, 'vA', 'zoom', 0), 'vA', 'zoom', 2, 3000), 'vA', 2); assert.strictEqual(P.findClip(sp, 'vA').clip.kf.zoom.length, 2);
  const z = P.setKeyframeEase(P.setAnimated(P.toggleKeyframe(base, 'vA', 'zoom', 0), 'vA', 'zoom', 2, 3000), 'vA', 'zoom', 0, 'in'), zs = P.setClipSpeed(z, 'vA', 2); assert.deepStrictEqual(P.findClip(zs, 'vA').clip.kf.zoom.map(k => k[0]), [0, 1500]); assert.deepStrictEqual(P.findClip(zs, 'vA').clip.kf.zoom[0][2], [0.42, 0, 1, 1], 'the ease survives a speed change');
  const k = P.toggleKeyframe(p, id, 'x', 1500), ck = P.findClip(k, id).clip; assert.strictEqual(ck.kf.x.length, 3); for (let t = 0; t <= 4000; t += 250) near(at(ck, t), want(t), 'extra keyframe, at ' + t, 0.01);
  assert.deepStrictEqual(P.validate(s), []);
});
ok('plan: the export gets straight pieces that follow the eased move, for overlays and for the picture', () => {
  const { p, id } = eased(), plan = NP.projectToPlan(p), ov = plan.overlays[0], c0 = P.findClip(p, id).clip;
  assert.strictEqual(ov.kf.x.length, 13); assert(ov.kf.x.every(k => k.length === 2), 'no ease in the plan'); let worst = 0; for (let t = 0; t <= 4000; t += 40) worst = Math.max(worst, Math.abs(A.kfValue(ov.kf.x, t) - A.kfValue(c0.kf.x, t))); assert(worst < 0.01, 'close to the curve: ' + worst);
  let q = P.setAnimated(P.toggleKeyframe(base, 'vB', 'zoom', 0), 'vB', 'zoom', 3, 4000); q = P.setKeyframeEase(q, 'vB', 'zoom', 0, 'hold'); const sp = NP.projectToPlan(q).video[1]; assert.deepStrictEqual(sp.kf.zoom, [[0, 1], [3999, 1], [4000, 3]], 'a hold is a jump');
  const plain = P.setAnimated(P.toggleKeyframe(base, 'vA', 'zoom', 0), 'vA', 'zoom', 2, 3000); assert.deepStrictEqual(NP.projectToPlan(plain).video[0].kf, { zoom: [[0, 1], [3000, 2]] }, 'plain keyframes are as before');
});
// ---- real ffmpeg, only when this computer has a recent one ----
function ffmpegOk() { const r = cp.spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }); const m = r.status === 0 && /version\s+n?(\d+)/.exec(r.stdout); return !!m && +m[1] >= 5; }
if (ffmpegOk()) {
  ok('real ffmpeg: the straight pieces the export is built from give the same numbers as the eased move', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-ease-')), kf = [[500, 0.1, CUSTOM], [2500, 0.9, 'hold'], [3000, 0.3]], b = A.bakeKf({ v: kf }).v;
    try {
      const expr = A.kfExpr(b, 0, 1, 'T'), r = cp.spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', "nullsrc=s=4x4:r=10:d=3.5,format=gray,geq=lum='clip(255*(" + expr + "),0,255)'", '-f', 'image2', 'f%02d.png'], { cwd: dir, encoding: 'utf8' }); assert.strictEqual(r.status, 0, r.stderr);
      [0, 3, 6, 9, 12, 18, 24, 27, 29, 31].forEach(i => {
        const o = cp.spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(dir, 'f' + String(i + 1).padStart(2, '0') + '.png'), '-frames:v', '1', '-vf', 'crop=1:1:0:0,format=gray', '-f', 'rawvideo', '-'], { encoding: null });
        const want = A.kfValue(kf, i * 100) * 255; assert(Math.abs(o.stdout[0] - want) <= 4, 'at ' + i / 10 + ' s: ' + o.stdout[0] + ' vs ' + want.toFixed(1));
      });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
} else console.log('  --  real-file checks skipped (need ffmpeg 5 or newer on this computer)');
console.log('\n' + n + ' checks passed');
