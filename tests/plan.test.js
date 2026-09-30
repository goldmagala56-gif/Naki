'use strict';
// node tests/plan.test.js
// Checks that exporting from the edited timeline (plan v2) gives the SAME result as the old
// export for a recording nobody edited, and that edits change the plan the way they should.
const assert = require('assert');
const C = require('../www/core.js');
const P = require('../www/project.js');
const Plan = require('../www/plan.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const events = [
  { t: 0, type: 'rec_start', movieMs: 0 }, { t: 0, type: 'vol', value: 1 },
  { t: 0, type: 'duck', enabled: true, thresholdDb: -40, duckedGain: 0.2 },
  { t: 4000, type: 'play', movieMs: 0 }, { t: 65000, type: 'pause', movieMs: 61000 },
  { t: 82000, type: 'play', movieMs: 61000 }, { t: 90000, type: 'jump', fromMs: 69000, toMs: 59000 },
  { t: 100000, type: 'rec_stop' }
];
const steps = Math.ceil(100000 / 50) + 1, levels = [];
for (let i = 0; i < steps; i++) { const t = i * 50; levels.push(C.dbToByte(t >= 10000 && t < 20000 ? -20 : -75)); }
const sess = { events, levels, durationMs: 100000, movieName: 'x.mp4', movieDurMs: 7200000, voiceOffsetMs: 120, voiceNudgeMs: -30 };

const project = P.compileFromSession(sess);
const plan = Plan.projectToPlan(project);
const legacy = C.buildExportPlan(sess);

ok('unedited recording: same picture as the old export', () => {
  assert.deepStrictEqual(plan.video, legacy.video);
  assert.strictEqual(plan.durationMs, 100000);
});
ok('unedited recording: voice starts where the old export put it', () => {
  const v = plan.audio.filter(c => c.src === 'voice');
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].startMs, legacy.voice.offsetMs);   // 90 ms
  assert.strictEqual(v[0].inMs, 0);
});
ok('unedited recording: movie sound follows the same loudness curve', () => {
  const legacyAt = t => Plan.gainOfClip(legacy.movieGain.points, t);
  const movie = plan.audio.filter(c => c.src === 'movie');
  assert.strictEqual(movie.length, legacy.video.filter(s => s.type === 'play').length);
  let worst = 0;
  movie.forEach(c => { for (let rel = 0; rel < c.durMs; rel += 250) worst = Math.max(worst, Math.abs(Plan.gainOfClip(c.points, rel) - legacyAt(c.startMs + rel))); });
  assert(worst < 0.05, 'gain differs by ' + worst);
});
ok('muting the movie sound removes it from the plan', () => {
  const q = P.setTrackProps(project, 't-moviesound', { muted: true });
  const pl = Plan.projectToPlan(q);
  assert.strictEqual(pl.audio.filter(c => c.src === 'movie').length, 0);
  assert.strictEqual(pl.audio.filter(c => c.src === 'voice').length, 1);
});
ok('cutting out a range shortens the plan and keeps the picture gap-free', () => {
  const q = P.rippleDelete(project, 10000, 20000);
  const pl = Plan.projectToPlan(q);
  assert.strictEqual(pl.durationMs, 90000);
  let cur = 0; pl.video.forEach(s => { assert.strictEqual(s.sessionStart, cur); cur = s.sessionEnd; });
  assert.strictEqual(cur, 90000);
});
ok('deleting a picture clip leaves a black span, not a hole', () => {
  const first = project.tracks[0].clips[0];
  const q = P.deleteClip(project, first.id);
  const pl = Plan.projectToPlan(q);
  assert.strictEqual(pl.video[0].type, 'black');
  assert.strictEqual(pl.video[0].sessionStart, 0);
  assert.strictEqual(pl.video[0].sessionEnd, first.dur);
});
console.log('\n' + n + ' checks passed');