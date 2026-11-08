'use strict';
// node tests/motion-tracking.test.js
// The tracking maths is tested on made-up pictures (a patterned square moving over a noisy background). The seeking of the real movie needs a real phone.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const A = require('../www/anim.js'), P = require('../www/project.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 144665) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) % 256; };
function frame(w, h, objX, objY, size, seed) {   // noisy background, and a patterned square with its middle at (objX, objY) unless objX is null
  const d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = hash(x, y, 1) * 0.5 + 40 + ((hash(x, y, seed || 9) % 7) - 3);
  if (objX != null) for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const x = objX - size / 2 + i, y = objY - size / 2 + j; if (x >= 0 && y >= 0 && x < w && y < h) d[y * w + x] = hash(i, j, 77); }
  return { w, h, d };
}
const path_ = i => ({ x: 40 + 2 * i, y: 45 + Math.round(10 * Math.sin(i / 6)) });

ok('the tracker follows a patterned square across 40 pictures to within a pixel, step by step', () => {
  const p0 = path_(0), tr = A.makeTracker(frame(160, 90, p0.x, p0.y, 28, 1), p0.x, p0.y, 20, 20, 12);
  for (let i = 1; i < 40; i++) {
    const t = path_(i), r = tr.step(frame(160, 90, t.x, t.y, 28, 1 + i));
    assert(!r.lost, 'lost at ' + i); assert(Math.abs(r.x - (t.x - p0.x + tr.start.x)) <= 1.2 && Math.abs(r.y - (t.y - p0.y + tr.start.y)) <= 1.2, 'frame ' + i + ': ' + r.x + ',' + r.y + ' wanted ' + t.x + ',' + t.y);
  }
});
ok('it knows when the object has gone, then stays where it was', () => {
  const p0 = path_(0), tr = A.makeTracker(frame(160, 90, p0.x, p0.y, 28, 1), p0.x, p0.y, 20, 20, 12);
  const a = tr.step(frame(160, 90, path_(1).x, path_(1).y, 28, 2)), gone = tr.step(frame(160, 90, null, 0, 0, 3)), later = tr.step(frame(160, 90, path_(3).x, path_(3).y, 28, 4));
  assert(!a.lost && gone.lost && later.lost); assert(gone.x === a.x && later.x === a.x && later.y === a.y);
});
ok('a patch near the edge or a patch bigger than the picture does not crash', () => {
  const tr = A.makeTracker(frame(160, 90, 10, 10, 28, 1), 2, 2, 20, 20, 12); assert.doesNotThrow(() => tr.step(frame(160, 90, 12, 12, 28, 2)));
  assert.strictEqual(A.findBlock(new Float32Array(400), 20, 20, { w: 10, h: 10, d: new Uint8Array(100) }, 5, 5, 4), null);
});
ok('smoothing keeps the ends; simplifying keeps the shape of a path with far fewer keyframes', () => {
  assert.deepStrictEqual(A.smoothSeries([0, 10, 0, 10, 0], 3).map(Math.round), [0, 3, 7, 3, 0]);
  const pts = []; for (let i = 0; i <= 100; i++) pts.push([i * 100, i < 50 ? i * 0.004 : 0.2 - (i - 50) * 0.004]);
  const s = A.simplifyKf(pts, 0.004); assert(s.length <= 5 && s.length >= 3, 'kept ' + s.length); assert.deepStrictEqual(s[0], pts[0]); assert.deepStrictEqual(s[s.length - 1], pts[100]);
  pts.forEach((p, i) => { const k = s.findIndex(q => q[0] >= p[0]); const a = s[Math.max(0, k - 1)], b = s[k]; const f = b[0] === a[0] ? 0 : (p[0] - a[0]) / (b[0] - a[0]); assert(Math.abs(p[1] - (a[1] + (b[1] - a[1]) * f)) <= 0.0041); });
  assert.strictEqual(A.simplifyKf([[0, 0], [1, 1]], 0.01).length, 2);
});
const base = { naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
    { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 10000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
ok('a list of keyframes can be written to an overlay in one go; it is tidied, replaces the old ones, and reaches the export plan', () => {
  const o = {}; let p = P.addOverlay(base, 1000, { name: 'o', kind: 'image', w: 100, h: 100 }, o); const dur = P.findClip(p, o.id).clip.dur;
  p = P.setKeyframeSeries(p, o.id, { x: [[2000, 0.9], [0, 0.2], [1000, 1.4], [1000, 0.5]], y: [[0, 0.3], [2000, 0.6]] });
  const kf = P.findClip(p, o.id).clip.kf; assert.deepStrictEqual(kf.x, [[0, 0.2], [1000, 0.5], [2000, 0.9]], 'sorted, one per time, in range'); assert.deepStrictEqual(kf.y, [[0, 0.3], [2000, 0.6]]);
  assert.strictEqual(P.validate(p).length, 0); assert(dur >= 2000);
  const ov = require('../www/plan.js').projectToPlan(p).overlays[0]; assert(ov.kf && ov.kf.x.length >= 3 && ov.kf.y.length >= 2);
  const q = P.setKeyframeSeries(p, o.id, { x: [], y: [] }); assert.strictEqual(P.findClip(q, o.id).clip.kf, undefined);
  assert.strictEqual(P.setKeyframeSeries(p, 'vA', { x: [[0, 0.5]] }), p, 'only overlays'); assert.strictEqual(P.setKeyframeSeries(p, o.id, { x: [[0, 0.2], [1000, 0.5], [2000, 0.9]] }), p, 'no change, no new history');
});
ok('the editor has the Track motion button, the area chips and the tracking code, and the edited files parse', () => {
  const ed = read('editor.js'); ["id: 'edTrack'", "chipKey('trackarea'", 'function trackOverlay', 'P.setKeyframeSeries', 'NANIM.makeTracker'].forEach(s => assert(ed.includes(s), s));
  ['editor.js', 'anim.js', 'project.js'].forEach(f => new vm.Script(read(f)));
});
console.log('\n' + n + ' checks passed');