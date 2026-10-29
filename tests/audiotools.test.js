'use strict';
// node tests/audiotools.test.js
// Music that ducks under your voice, and removing quiet pauses.
const assert = require('assert');
const P = require('../www/project.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

// 12 seconds: you speak 0 to 3 s, are quiet 3 to 6 s, speak 6 to 12 s (the microphone history is one byte per 50 ms)
function make() {
  const levels = []; for (let i = 0; i < 240; i++) levels.push(i >= 60 && i < 120 ? 0 : 200);
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels, assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
      { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' }] }] };
}
const withMusic = P.ensureMusic(make(), { name: 'm.mp3', durMs: 12000 });
const music = (p) => p.tracks.filter(t => t.role === 'music')[0].clips[0];

ok('duck curve: down just before you speak, down while you speak, back up after, joined when the speech is close together', () => {
  const o = { attackMs: 250, releaseMs: 700, level: 0.3 }, g = (pts, t) => P.gainAt(pts, t);
  const pts = P.duckPoints([{ start: -500, end: 3000 }, { start: 6000, end: 12000 }], 12000, o);
  assert.deepStrictEqual(pts, [[0, 0.3], [3000, 0.3], [3700, 1], [5750, 1], [6000, 0.3], [12000, 0.3]]);
  assert.strictEqual(g(pts, 1500), 0.3); assert.strictEqual(g(pts, 4500), 1); assert.strictEqual(g(pts, 9000), 0.3); assert(g(pts, 3350) > 0.3 && g(pts, 3350) < 1, 'a glide, not a jump');
  assert.deepStrictEqual(P.duckPoints([{ start: 1000, end: 2000 }, { start: 2500, end: 3000 }], 12000, o), [[750, 1], [1000, 0.3], [3000, 0.3], [3700, 1]]);
  assert.deepStrictEqual(P.duckPoints([], 5000, o), []);
});
ok('auto duck: the music clip gets a curve that follows your speech; level 100% takes it away; no speech or no music changes nothing', () => {
  const p = P.autoDuckMusic(withMusic, { level: 0.3 }), c = music(p);
  assert(c.gain && c.gain.length > 2); assert.strictEqual(P.gainAt(c.gain, 1500), 0.3); assert.strictEqual(P.gainAt(c.gain, 4500), 1); assert.strictEqual(P.gainAt(c.gain, 9000), 0.3);
  assert.strictEqual(P.autoDuckMusic(p, { level: 0.3 }), p, 'the same again: nothing changes');
  const off = P.autoDuckMusic(p, { level: 1 }); assert.strictEqual(music(off).gain, undefined);
  assert.strictEqual(P.autoDuckMusic(make(), { level: 0.3 }).tracks.length, 1, 'no music: nothing to do');
  const mute = JSON.parse(JSON.stringify(withMusic)); mute.levels = mute.levels.map(() => 0); assert.strictEqual(P.autoDuckMusic(mute, { level: 0.3 }), mute, 'no speech: nothing to do');
  assert.strictEqual(P.validate(p).length, 0);
});
ok('auto duck: it follows the cuts you make (the curve is made again from the edited recording)', () => {
  const cut = P.rippleDelete(withMusic, 3000, 6000), q = P.autoDuckMusic(cut, { level: 0.3 }), c = music(q);
  assert.strictEqual(cut.durationMs, 9000); assert.strictEqual(P.gainAt(c.gain, 2000), 0.3); assert.strictEqual(P.gainAt(c.gain, 6000), 0.3, 'no quiet stretch left, so it stays down');
});
ok('remove pauses: only where the picture is held by default, or everywhere; the cut closes the gap in everything', () => {
  const all = P.silenceRanges(make(), { onlyPaused: false });
  assert.deepStrictEqual(all, [{ start: 3150, end: 5850 }]); assert.deepStrictEqual(P.silenceRanges(make(), {}), [], 'nothing is held still, so nothing to cut by default');
  const q = P.removeSilences(withMusic, { onlyPaused: false }); assert.strictEqual(q.durationMs, 9300); assert.strictEqual(q.tracks.filter(t => t.role === 'music')[0].clips.reduce((x, c) => x + c.dur, 0), 9300, 'the music is cut too'); assert.strictEqual(P.validate(q).length, 0);
  assert.deepStrictEqual(P.silenceRanges(make(), { onlyPaused: false, minMs: 4000 }), [], 'a shorter pause than asked for is kept');
  assert.deepStrictEqual(P.silenceRanges(make(), { onlyPaused: false, padMs: 400 }), [{ start: 3400, end: 5600 }]);
});
ok('remove pauses: with the picture held for a while the quiet part of the hold is cut and the video is the same length as before', () => {
  const held = P.insertFreeze(make(), 4000, 2000), r = P.silenceRanges(held, {});
  assert.deepStrictEqual(r, [{ start: 4000, end: 6000 }]); const q = P.removeSilences(held, {}); assert.strictEqual(q.durationMs, 12000); assert.strictEqual(P.freezeRanges(q).length, 0);
});
console.log('\n' + n + ' checks passed');
