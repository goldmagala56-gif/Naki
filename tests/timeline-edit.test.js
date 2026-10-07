'use strict';
// node tests/timeline-edit.test.js
// Dragging clips into gaps, pushing clips aside, closing gaps, and joining clips (the CapCut-style timeline).
const assert = require('assert');
const P = require('../www/project.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

// Four picture clips A B C D (4 s each, each from a different part of the movie) with their movie sound, plus one long voice clip.
function make() {
  const v = [], s = [];
  ['A', 'B', 'C', 'D'].forEach((k, i) => {
    v.push({ id: 'v' + k, type: 'video', asset: 'movie', start: i * 4000, dur: 4000, in: i * 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'l' + k });
    s.push({ id: 's' + k, type: 'audio', asset: 'movie', start: i * 4000, dur: 4000, in: i * 10000, speed: 1, volume: 1, gain: [[0, 1], [4000, 0.5]], fadeIn: 0, fadeOut: 0, link: 'l' + k });
  });
  return { naki: 'project', version: 1, fps: 30, durationMs: 16000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 16000 } },
    tracks: [
      { id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: v },
      { id: 't-moviesound', kind: 'audio', role: 'movieSound', muted: false, hidden: false, volume: 1, locked: false, clips: s },
      { id: 't-voice', kind: 'audio', role: 'voice', muted: false, hidden: false, volume: 1, locked: false,
        clips: [{ id: 'vo', type: 'audio', asset: 'voice', start: 0, dur: 16000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
}
const lane = (p, role) => p.tracks.find(t => t.role === role).clips.slice().sort((a, b) => a.start - b.start);
const order = (p, role) => lane(p, role || 'movie').map(c => c.in / 10000).join(',');   // which part of the movie, in timeline order
const base = make();

ok('the test project is valid', () => assert.deepStrictEqual(P.validate(base), []));

ok('after deleting a piece, dragging the next one into the gap puts it exactly there, with its sound', () => {
  const gap = P.deleteClip(base, 'vA');                              // empty space 0 - 4 s
  const q = P.placeClip(gap, 'vB', 500);
  assert.strictEqual(P.findClip(q, 'vB').clip.start, 500); assert.strictEqual(P.findClip(q, 'sB').clip.start, 500);
  assert.strictEqual(P.findClip(q, 'vC').clip.start, 8000, 'nothing else moved');
  assert.deepStrictEqual(P.validate(q), []);
  assert.strictEqual(P.findClip(P.placeClip(gap, 'vB', 0), 'vB').clip.start, 0);
  assert.strictEqual(P.findClip(P.placeClip(gap, 'vB', -900), 'vB').clip.start, 0, 'never before 0');
});
ok('dropping onto other clips pushes them later, just far enough; nobody is cut in two', () => {
  const q = P.placeClip(base, 'vD', 1000);       // D's middle is past A's middle: it goes after A
  assert.strictEqual(order(q), '0,3,1,2'); assert.strictEqual(order(q, 'movieSound'), '0,3,1,2');
  assert.deepStrictEqual(lane(q, 'movie').map(c => c.start), [0, 4000, 8000, 12000]);
  assert.strictEqual(q.durationMs, 16000); assert.deepStrictEqual(P.validate(q), []);
  assert.strictEqual(JSON.stringify(q.tracks[2].clips), JSON.stringify(base.tracks[2].clips), 'the voice is not touched');
  const q2 = P.placeClip(base, 'vA', 5000);      // into the second half of B: lands after B
  assert.strictEqual(order(q2), '1,0,2,3'); assert.deepStrictEqual(lane(q2, 'movie').map(c => c.start), [4000, 8000, 12000, 16000], 'the old place of A is left empty');
  assert.deepStrictEqual(lane(P.closeGaps(q2), 'movie').map(c => c.start), [0, 4000, 8000, 12000], 'and Close gaps takes it away');
  const early = P.placeClip(base, 'vC', 3000);   // C's middle is before B's middle: lands before B
  assert.strictEqual(order(early), '0,2,1,3'); assert.deepStrictEqual(P.validate(early), []);
});
ok('a drop into a gap that is too small pushes only what is in the way', () => {
  const g = P.deleteClip(P.deleteClip(base, 'vB'), 'vD');            // A [0,4) then gap, C [8,12), then gap
  const q = P.placeClip(g, 'vA', 6000);                              // A is 4 s, C starts at 8 s: C is pushed to 10 s
  assert.strictEqual(P.findClip(q, 'vA').clip.start, 6000); assert.strictEqual(P.findClip(q, 'vC').clip.start, 10000); assert.strictEqual(P.findClip(q, 'sC').clip.start, 10000);
  assert.strictEqual(P.findClip(q, 'vC').clip.start + P.findClip(q, 'vC').clip.dur, 14000, 'the picture now ends later');
});
ok('dropping a clip where it already is changes nothing', () => {
  assert.strictEqual(P.placeClip(base, 'vB', 4000), base);
  assert.strictEqual(P.placeClip(base, 'nope', 4000), base);
  assert.strictEqual(P.planPlace(base, 'nope', 0), null);
});
ok('voice, music and text clips can be dragged too (the ones in the way are pushed)', () => {
  const p = JSON.parse(JSON.stringify(base)), t = p.tracks[2];
  t.clips = [{ id: 'x1', type: 'audio', asset: 'voice', start: 0, dur: 3000, in: 0, speed: 1, volume: 1 }, { id: 'x2', type: 'audio', asset: 'voice', start: 3000, dur: 3000, in: 3000, speed: 1, volume: 1 }];
  const q = P.placeClip(p, 'x2', 0);
  assert.deepStrictEqual(lane(q, 'voice').map(c => c.id + '@' + c.start), ['x2@0', 'x1@3000']);
  assert.deepStrictEqual(P.validate(q), []);
});
ok('close gaps: the picture and its sound slide together to touch; voice stays', () => {
  const gaps = P.deleteClip(P.deleteClip(base, 'vA'), 'vC');          // B [4,8)  D [12,16)
  const q = P.closeGaps(gaps);
  assert.deepStrictEqual(lane(q, 'movie').map(c => c.id + '@' + c.start), ['vB@0', 'vD@4000']);
  assert.deepStrictEqual(lane(q, 'movieSound').map(c => c.id + '@' + c.start), ['sB@0', 'sD@4000']);
  assert.strictEqual(P.findClip(q, 'vo').clip.start, 0); assert.strictEqual(P.findClip(q, 'vo').clip.dur, 16000);
  assert.deepStrictEqual(P.validate(q), []);
  const one = P.closeGaps(gaps, 1000);                                // only the gap at 1 s
  assert.deepStrictEqual(lane(one, 'movie').map(c => c.start), [0, 8000]);
  assert.strictEqual(P.closeGaps(gaps, 5000), gaps, 'on a clip, not in a gap: nothing happens');
  assert.deepStrictEqual(lane(P.closeGaps(gaps, 9000), 'movie').map(c => c.start), [4000, 8000], 'the gap at 9 s is the later one');
  assert.strictEqual(P.closeGaps(base), base, 'no gaps: the same project comes back');
});
ok('join: a split that was never changed becomes one clip again (picture, sound and the volume curve)', () => {
  const s = P.splitAt(base, 6000);                                    // B split into 4-6 and 6-8
  assert.strictEqual(lane(s, 'movie').length, 5);
  const out = {}, q = P.joinWithNext(s, 'vB', out);
  assert(out.merged, out.msg); assert.strictEqual(lane(q, 'movie').length, 4); assert.strictEqual(lane(q, 'movieSound').length, 4);
  const b = P.findClip(q, 'vB').clip, sb = P.findClip(q, 'sB').clip;
  assert.strictEqual(b.dur, 4000); assert.strictEqual(b.in, 10000); assert.strictEqual(sb.dur, 4000);
  [0, 1000, 2500, 3999].forEach(t => assert(Math.abs(P.gainAt(sb.gain, t) - P.gainAt(base.tracks[1].clips[1].gain, t)) < 0.01, 'volume curve at ' + t));
  assert.deepStrictEqual(P.validate(q), []);
  const v = P.splitAt(base, 6000), vo = P.joinWithNext(v, 'vo', {});  // the voice was split too: join its two halves
  assert.strictEqual(lane(vo, 'voice').length, 1); assert.strictEqual(lane(vo, 'voice')[0].dur, 16000);
});
ok('join: with a gap it pulls the next clip up; clips from different places stay two clips', () => {
  const g = P.deleteClip(base, 'vB'), out = {}, q = P.joinWithNext(g, 'vA', out);
  assert(!out.merged && /Gap closed/.test(out.msg));
  assert.deepStrictEqual(lane(q, 'movie').map(c => c.id + '@' + c.start), ['vA@0', 'vC@4000', 'vD@8000']);
  assert.deepStrictEqual(lane(q, 'movieSound').map(c => c.start), [0, 4000, 8000]);
  const o2 = {}; assert.strictEqual(P.joinWithNext(base, 'vA', o2), base); assert(/different places/.test(o2.msg));
  const o3 = {}; assert.strictEqual(P.joinWithNext(base, 'vD', o3), base); assert(/nothing after/i.test(o3.msg));
});
ok('join: a piece with a different look is not merged', () => {
  const s = P.splitAt(base, 6000), p = JSON.parse(JSON.stringify(s));
  p.tracks[0].clips.find(c => c.start === 6000).opacity = 0.5;
  const out = {}; assert.strictEqual(P.joinWithNext(p, 'vB', out), p); assert(!out.merged);
});
ok('snapping can ignore the clip being dragged', () => {
  assert.strictEqual(P.snapTime(base, 4050, 100, []), 4000);
  assert.strictEqual(P.snapTime(base, 4050, 100, [], ['vA', 'sA', 'vB', 'sB']), 4050, 'its own edges (and its sound) are skipped');
  assert.strictEqual(P.snapTime(base, 4050, 100, [4100], ['vA', 'sA', 'vB', 'sB']), 4100, 'the playhead still counts');
});
ok('none of these change the project they started from', () => {
  const snap = JSON.stringify(base);
  P.placeClip(base, 'vD', 1000); P.closeGaps(P.deleteClip(base, 'vA')); P.joinWithNext(P.splitAt(base, 6000), 'vB', {}); P.planPlace(base, 'vB', 0);
  assert.strictEqual(JSON.stringify(base), snap);
});
console.log('\n' + n + ' checks passed');
