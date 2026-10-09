'use strict';
// Checks Reverse in the timeline model and the export plan.  Run with:  node tests/reverse.test.js
const assert = require('assert');
const C = require('../www/core.js'), P = require('../www/project.js'), PL = require('../www/plan.js'), W = require('../www/webcodecs-export.js').WebCodecsExport;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const events = [{ t: 0, type: 'rec_start', movieMs: 0 }, { t: 0, type: 'vol', value: 1 }, { t: 0, type: 'duck', enabled: true, thresholdDb: -40, duckedGain: 0.2 },
  { t: 4000, type: 'play', movieMs: 0 }, { t: 30000, type: 'pause', movieMs: 26000 }, { t: 40000, type: 'play', movieMs: 26000 }, { t: 60000, type: 'rec_stop' }];
const levels = []; for (let i = 0; i < 1201; i++) levels.push(C.dbToByte(-60));
const base = P.compileFromSession({ events, levels, durationMs: 60000, movieName: 'm.mp4', movieDurMs: 600000, voiceOffsetMs: 100, voiceNudgeMs: 0 });
const vid = (p) => p.tracks[0].clips, snd = (p) => p.tracks[1].clips;
const A = vid(base).find(c => c.start === 4000), B = vid(base).find(c => c.start === 40000);
const rev = P.setReverse(P.setReverse(base, A.id), B.id);
const seen = (p, t) => { const s = P.sourceAt(p, t); return s.video && { type: s.video.type, ms: s.video.movieMs }; };
let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

ok('reverse flips a movie clip and its sound together, and only a playing clip can be reversed', () => {
  assert.strictEqual(P.findClip(rev, A.id).clip.reverse, true); assert.strictEqual(snd(rev).find(c => c.start === 4000).reverse, true);
  assert.strictEqual(P.setReverse(base, vid(base)[0].id), base, 'a paused picture cannot be reversed'); assert.strictEqual(P.setReverse(base, base.tracks[2].clips[0].id), base);
  assert.strictEqual(P.setReverse(rev, A.id, true), rev, 'already on'); const off = P.setReverse(rev, A.id);
  assert.strictEqual(P.findClip(off, A.id).clip.reverse, undefined); assert.strictEqual(snd(off).find(c => c.start === 4000).reverse, undefined);
  assert.deepStrictEqual(P.validate(rev), []);
});
ok('a reversed clip shows the same stretch of the movie, last picture first', () => {
  assert.strictEqual(seen(rev, 4000).ms, 26000); assert.strictEqual(seen(rev, 4000 + 6000).ms, 20000); assert(Math.abs(seen(rev, 29999).ms - 1) <= 1);
  assert.strictEqual(seen(rev, 40000).ms, 46000); assert.strictEqual(seen(rev, 50000).ms, 36000);
  assert.strictEqual(P.sourceAt(rev, 10000).audio.find(a => a.role === 'movieSound').sourceMs, 20000);
  assert.strictEqual(seen(rev, 1000).ms, 0, 'a paused picture is as before');
  const fast = P.setClipSpeed(rev, A.id, 2), c = P.findClip(fast, A.id).clip; assert.strictEqual(c.dur, 13000); assert.strictEqual(seen(fast, 4000).ms, 26000, 'speed keeps the same stretch'); assert.strictEqual(P.movieNeeded(fast), 46000);
});
ok('splitting and cutting a reversed clip changes nothing you see', () => {
  let p = rev; [7000, 20000, 20000, 45000, 31000].forEach(t => { p = P.splitAt(p, t); });
  assert.deepStrictEqual(P.validate(p), []);
  for (let t = 0; t < 60000; t += 97) assert.deepStrictEqual(seen(p, t), seen(rev, t), 'at ' + t);
  assert(vid(p).filter(c => c.reverse).length > 2);
  for (let k = 0; k < 40; k++) {
    const a = Math.round(rnd() * 55000), b = Math.min(60000, a + 1 + Math.round(rnd() * 12000)), q = P.rippleDelete(rev, a, b), gap = b - a;
    assert.deepStrictEqual(P.validate(q), []);
    for (let i = 0; i < 20; i++) { const t = Math.floor(rnd() * q.durationMs), orig = t < a ? t : t + gap, x = seen(q, t), y = seen(rev, orig); assert.deepStrictEqual(x && x.type, y && y.type); assert(Math.abs(x.ms - y.ms) <= 1, 'cut ' + a + '-' + b + ' at ' + t + ': ' + x.ms + ' vs ' + y.ms); }
  }
  const fz = P.insertFreeze(rev, 10000, 2000); assert.strictEqual(P.sourceAt(fz, 11000).video.movieMs, 20000, 'the held picture is the one the reversed clip showed'); assert.deepStrictEqual(P.validate(fz), []);
});
ok('trimming a reversed clip keeps the pictures that are left exactly where they were', () => {
  const end = P.trimClipEnd(rev, A.id, 20000), c = P.findClip(end, A.id).clip; assert.strictEqual(c.dur, 16000); assert.strictEqual(c.in, 10000);
  for (let t = 4000; t < 20000; t += 53) assert.strictEqual(seen(end, t).ms, seen(rev, t).ms);
  const start = P.trimClipStart(rev, A.id, 9000); assert.strictEqual(P.findClip(start, A.id).clip.in, 0);
  for (let t = 9000; t < 30000; t += 53) assert.strictEqual(seen(start, t).ms, seen(rev, t).ms);
  const longer = P.trimClipEnd(rev, B.id, 70000), l = P.findClip(longer, B.id).clip;   // lengthening reads the movie further back
  assert.strictEqual(l.dur, 30000); assert.strictEqual(l.in, 16000); assert.strictEqual(seen(longer, 40000).ms, 46000); assert.strictEqual(seen(longer, 69999).ms, 16001);
  assert.deepStrictEqual(P.validate(longer), []);
  assert.strictEqual(P.findClip(P.trimClipEnd(P.setReverse(base, A.id), A.id, 30000), A.id).clip.dur, 26000, 'it cannot read back past the start of the movie');
});
ok('a copy of a reversed clip is reversed too', () => {
  const out = {}, q = P.duplicateClip(rev, A.id, out); assert.strictEqual(P.findClip(q, out.id).clip.reverse, true);
  assert.strictEqual(q.tracks[1].clips.filter(c => c.reverse).length, 3);
});
ok('the export plan marks reversed parts; movieStart is then where the stretch STARTS in the movie', () => {
  const plan = PL.projectToPlan(rev), a = plan.video.find(v => v.sessionStart === 4000);
  assert.strictEqual(a.reverse, true); assert.strictEqual(a.movieStart, 0); assert.strictEqual(a.sessionEnd - a.sessionStart, 26000);
  const mv = plan.audio.find(x => x.src === 'movie' && x.startMs === 4000); assert.strictEqual(mv.reverse, true); assert.strictEqual(mv.inMs, 0);
  assert.strictEqual(plan.video.find(v => v.sessionStart === 40000).movieStart, 26000);
  plan.video.filter(v => v.sessionStart !== 4000 && v.sessionStart !== 40000).forEach(v => assert.strictEqual('reverse' in v, false));
  assert.strictEqual(plan.audio.filter(x => x.reverse).length, 2); assert(!plan.audio.some(x => x.src === 'voice' && x.reverse));
  const cut = PL.projectToPlan(P.rippleDelete(rev, 10000, 14000)).video.filter(v => v.reverse && v.sessionStart < 30000);
  assert.strictEqual(cut.length, 2); assert.deepStrictEqual([cut[0].movieStart, cut[0].sessionEnd - cut[0].sessionStart], [20000, 6000], 'the first piece is the END of the stretch');
  assert.deepStrictEqual([cut[1].movieStart, cut[1].sessionEnd - cut[1].sessionStart], [0, 16000], 'the second piece is the start of it');
  assert.strictEqual(PL.projectToPlan(P.setClipSpeed(P.setReverse(base, A.id), A.id, 2)).video.find(v => v.sessionStart === 4000).speed, 2);
});
ok('the fast engine leaves reversed clips to the ffmpeg engine', () => {
  assert.strictEqual(W.canRender(PL.projectToPlan(base)), true); assert.strictEqual(W.canRender(PL.projectToPlan(rev)), false);
});
console.log('\n' + n + ' checks passed');