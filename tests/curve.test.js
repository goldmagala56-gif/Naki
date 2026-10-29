'use strict';
// node tests/curve.test.js
// The speed curve (the graph under Speed): the maths, the pieces a clip is cut into, and what the export plan gets.
const assert = require('assert'), CV = require('../www/speedcurve.js'), P = require('../www/project.js'), NP = require('../www/plan.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const near = (a, b, m, tol) => assert(Math.abs(a - b) <= (tol == null ? 1e-6 : tol), (m || '') + ' ' + a + ' vs ' + b);

ok('curve maths: tidied, smooth in steps of equal ratio, and the average speed counts slow moments for more', () => {
  assert.strictEqual(CV.clean(null), null); assert.strictEqual(CV.clean([[0, 1]]), null);
  assert.deepStrictEqual(CV.clean([[0.5, 9], [0.2, 0.01], [0.9, 2]]), [[0, 0.25], [0.5, 4], [1, 2]], 'sorted, ends moved to 0 and 1, speeds kept in range');
  assert.deepStrictEqual(CV.clean([[0, 1], [0.01, 2], [1, 1]]).length, 2, 'a point on top of the first is dropped');
  const many = []; for (let i = 0; i <= 30; i++) many.push([i / 30, 1 + (i % 3)]); assert(CV.clean(many).length <= CV.MAXPTS);
  near(CV.valueAt([[0, 1], [1, 4]], 0.5), 2, 'halfway between 1x and 4x is 2x'); near(CV.valueAt([[0, 0.5], [1, 2]], 0.5), 1); assert.strictEqual(CV.valueAt([[0, 1], [1, 4]], 0), 1); assert.strictEqual(CV.valueAt([[0, 1], [1, 4]], 1), 4);
  near(CV.harmonic([[0, 2], [1, 2]], 0, 1), 2); near(CV.outputFactor([[0, 2], [1, 2]]), 0.5); near(CV.outputFactor([[0, 1], [1, 1]]), 1);
  const h = CV.harmonic([[0, 0.5], [0.5, 0.5], [0.5001, 4], [1, 4]], 0, 1); assert(h < 1.2, 'half the movie at 0.5x and half at 4x averages well under 2.25x: ' + h);
  CV.PRESETS.forEach(p => { assert.deepStrictEqual(CV.clean(p.pts), p.pts, p.key + ' is already tidy'); assert(CV.outputFactor(p.pts) > 0); });
  assert(CV.PRESETS.length >= 6);
});

function make() {
  const sc = (id, s, d, i, link) => ({ id, type: 'audio', asset: 'movie', start: s, dur: d, in: i, speed: 1, volume: 1, gain: [[0, 1], [d, 1]], fadeIn: 0, fadeOut: 0, link });
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
      { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 8000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' }, { id: 'vB', type: 'video', asset: 'movie', start: 8000, dur: 4000, in: 40000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lB' }] },
      { id: 't-moviesound', kind: 'audio', role: 'movieSound', muted: false, hidden: false, volume: 1, locked: false, clips: [sc('sA', 0, 8000, 10000, 'lA'), sc('sB', 8000, 4000, 40000, 'lB')] },
      { id: 't-voice', kind: 'audio', role: 'voice', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vo', type: 'audio', asset: 'voice', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
}
const base = make(), montage = CV.PRESETS.filter(p => p.key === 'montage')[0].pts, hero = CV.PRESETS.filter(p => p.key === 'hero')[0].pts;
const piecesOf = (p) => P.curvePieces(p, p.tracks[0].clips.filter(c => c.curve)[0].curve.g);

ok('curve: a clip is cut into pieces that follow the curve, the picture stays in one stretch of the movie, and the old project is untouched', () => {
  const snap = JSON.stringify(base.tracks), q = P.setSpeedCurve(base, 'vA', montage), ps = piecesOf(q);
  assert.deepStrictEqual(P.validate(q), []); assert.strictEqual(JSON.stringify(base.tracks), snap); assert.strictEqual(ps.length, 16);
  assert.strictEqual(ps[0].id, 'vA', 'the first piece keeps the clip\'s id, so it stays selected'); assert.strictEqual(ps[0].in, 10000);
  for (let i = 1; i < ps.length; i++) { assert.strictEqual(ps[i - 1].start + ps[i - 1].dur, ps[i].start, 'no gaps'); assert(Math.abs(ps[i - 1].in + ps[i - 1].dur * ps[i - 1].speed - ps[i].in) <= Math.max(2, ps[i - 1].speed * 1.01), 'the movie carries on from piece to piece'); }
  const last = ps[ps.length - 1]; assert(Math.abs(last.in + last.dur * last.speed - 18000) <= 4, 'ends where the clip ended in the movie');
  assert(ps[0].speed < 1 && Math.max.apply(null, ps.map(p => p.speed)) > 2 && ps[ps.length - 1].speed < 1, 'slow, fast, slow');
  const total = ps.reduce((s, p) => s + p.dur, 0); near(total, 8000 * CV.outputFactor(montage), 'the new length', 160);
  assert.strictEqual(q.tracks[0].clips.filter(c => c.id === 'vB')[0].start, total, 'the next picture clip moved to follow');
});
ok('curve: the movie sound is cut and sped up with the picture, and the voice does not move', () => {
  const q = P.setSpeedCurve(base, 'vA', montage), ps = piecesOf(q), snd = q.tracks[1].clips;
  ps.forEach(p => { const s = snd.filter(x => x.link === p.link)[0]; assert(s, 'a sound piece for every picture piece'); assert.deepStrictEqual([s.start, s.dur, s.speed, s.in], [p.start, p.dur, p.speed, p.in]); });
  assert.strictEqual(JSON.stringify(q.tracks[2].clips), JSON.stringify(base.tracks[2].clips), 'voice is untouched'); assert.strictEqual(snd.length, 16 + 1, 'the next clip\'s sound is still one piece');
});
ok('curve: changing the curve changes only the speeds; the same curve changes nothing; Normal puts the pieces back together', () => {
  const q = P.setSpeedCurve(base, 'vA', montage), ps = piecesOf(q), q2 = P.setSpeedCurve(q, ps[7].id, hero), ps2 = piecesOf(q2);
  assert.deepStrictEqual(ps2.map(p => p.id), ps.map(p => p.id), 'the same pieces'); assert.deepStrictEqual(P.validate(q2), []); assert.notDeepStrictEqual(ps2.map(p => p.speed), ps.map(p => p.speed));
  assert.deepStrictEqual(P.speedCurveOf(q2, ps[3].id).pts, hero); assert.strictEqual(P.setSpeedCurve(q2, ps[0].id, hero), q2, 'no change: the same project');
  const flat = P.setSpeedCurve(base, 'vA', [[0, 2], [1, 2]]); near(piecesOf(flat).reduce((s, p) => s + p.dur, 0), 4000, 'a flat 2x curve halves it', 16);
  const back = P.clearSpeedCurve(q2, ps[5].id); assert.deepStrictEqual(P.validate(back), []); assert(back.tracks[0].clips.length <= 3, 'back to about one clip: ' + back.tracks[0].clips.length); assert(back.tracks[0].clips.every(c => !c.curve && (c.speed || 1) === 1));
  near(back.durationMs, 12000, 'the video is as long as it was', 40); assert.strictEqual(P.clearSpeedCurve(base, 'vA'), base);
});
ok('curve: only a picture that plays forwards and is long enough takes a curve', () => {
  const rev = JSON.parse(JSON.stringify(base)); rev.tracks[0].clips[0].reverse = true; assert.strictEqual(P.setSpeedCurve(rev, 'vA', montage), rev);
  assert.strictEqual(P.setSpeedCurve(base, 'vo', montage), base, 'not a picture'); assert.strictEqual(P.setSpeedCurve(base, 'vA', [[0, 1]]), base, 'no curve'); assert.strictEqual(P.setSpeedCurve(base, 'nope', montage), base);
  const short = make(); short.tracks[0].clips[0].dur = 300; assert.strictEqual(P.setSpeedCurve(short, 'vA', montage), short, 'too short to cut up');
  assert.strictEqual(piecesOf(P.setSpeedCurve(base, 'vB', montage, 8)).length, 8, 'a different number of pieces can be asked for');
});
ok('curve: the export plan gets a speed for every piece, for the picture and the sound, and nothing about the curve itself', () => {
  const q = P.setSpeedCurve(base, 'vA', montage), plan = NP.projectToPlan(q), ps = piecesOf(q);
  const sp = plan.video.filter(s => s.type === 'play'); assert.strictEqual(sp.length, 16 + 1); sp.slice(0, 16).forEach((s, i) => { if (ps[i].speed !== 1) assert.strictEqual(s.speed, ps[i].speed); assert.strictEqual('curve' in s, false); });
  assert.strictEqual(plan.audio.filter(a => a.src === 'movie' && a.speed).length >= 14, true, 'the movie sound has its speeds too'); assert.strictEqual(JSON.stringify(plan).includes('"curve"'), false);
});
console.log('\n' + n + ' checks passed');
