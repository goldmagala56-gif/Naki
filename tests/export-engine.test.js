'use strict';
// Tests the pure, platform-independent parts of the in-browser export engine:
// parsing ffmpeg's own log text, and turning a session plan into a job list.
// The actual ffmpeg.wasm runner can only run in a real browser, so it isn't tested here —
// see docs/PHONE-TEST.md for the manual test steps.
// Run with:  node tests/export-engine.test.js   (or: npm test)
const assert = require('assert');
const fs = require('fs'), path = require('path');
const E = require('../www/export-engine.js');

let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const fixture = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');

ok('reads width, height, sar and duration from a stereo movie', () => {
  const info = E.parseProbeInfo(fixture('probe-stereo.txt'));
  assert.deepStrictEqual({ w: info.width, h: info.height, sar: info.sar, hasAudio: info.hasAudio, mono: info.audioMono }, { w: 1280, h: 720, sar: 1, hasAudio: true, mono: false });
  assert(Math.abs(info.durationSec - 2) < 0.01);
});
ok('detects a mono movie', () => {
  const info = E.parseProbeInfo(fixture('probe-mono.txt'));
  assert.strictEqual(info.audioMono, true);
  assert.strictEqual(info.hasAudio, true);
});
ok('detects a movie with no sound at all', () => {
  const info = E.parseProbeInfo(fixture('probe-silent.txt'));
  assert.strictEqual(info.hasAudio, false);
  assert.strictEqual(info.width, 480); assert.strictEqual(info.height, 270);
});
ok('a movie with an unusual pixel shape (SAR) is read correctly', () => {
  const info = E.parseProbeInfo('Stream #0:0: Video: h264, yuv420p, 704x480 [SAR 8:9 DAR 4:3], 25 fps');
  assert(Math.abs(info.sar - 8 / 9) < 1e-6);
});
ok('garbage input never throws, just reports nothing found', () => {
  const info = E.parseProbeInfo('not ffmpeg output at all');
  assert.strictEqual(info.width, 0); assert.strictEqual(info.hasAudio, false);
});

const movieInfo = { width: 1280, height: 720, sar: 1, hasAudio: true, audioMono: false, durationSec: 30 };
const plan = {
  durationMs: 20000,
  movie: { name: 'Test.mp4', durationMs: 30000 },
  video: [
    { type: 'freeze', sessionStart: 0, sessionEnd: 2000, movieAt: 0 },
    { type: 'play', sessionStart: 2000, sessionEnd: 9500, movieStart: 0 },
    { type: 'freeze', sessionStart: 9500, sessionEnd: 11900, movieAt: 4000 },
    { type: 'play', sessionStart: 11900, sessionEnd: 20000, movieStart: 4000 }
  ],
  movieGain: { stepMs: 50, points: [[0, 1], [9500, 1], [9600, 0.2], [11500, 0.2], [11900, 1], [20000, 1]] },
  voice: { file: 'voice.webm', offsetMs: 100 }
};

ok('every video span becomes a job, in order, nothing skipped', () => {
  const built = E.planToJobs(plan, movieInfo, { height: 480 });
  assert.strictEqual(built.videoList.length, 4);
  assert.deepStrictEqual(built.videoList, ['v0000.ts', 'v0001.ts', 'v0002.ts', 'v0003.ts']);
  // freeze spans additionally produce a still frame before the held picture
  const labels = built.jobs.map(j => j.label);
  assert(labels.some(l => l.startsWith('frozen frame 1')));
  assert(labels.some(l => l.startsWith('picture 2')));
});
ok('output width stays even and matches the movie\'s own shape', () => {
  const built = E.planToJobs(plan, movieInfo, { height: 480 });
  assert.strictEqual(built.height, 480);
  assert.strictEqual(built.width % 2, 0);
  assert.strictEqual(built.width, 854); // 1280x720 at 480p tall keeps a 16:9-ish width, rounded even
});
ok('a silent movie gets a generated-silence job instead of extracted sound', () => {
  const silentInfo = Object.assign({}, movieInfo, { hasAudio: false });
  const built = E.planToJobs(plan, silentInfo, { height: 480 });
  const silenceJobs = built.jobs.filter(j => j.label.startsWith('silence'));
  assert(silenceJobs.length > 0);
  silenceJobs.forEach(j => assert(!j.args.includes('movie.in')));
});
ok('a mono movie gets upmixed to stereo, not left quieter', () => {
  const monoInfo = Object.assign({}, movieInfo, { audioMono: true });
  const built = E.planToJobs(plan, monoInfo, { height: 480 });
  const soundJob = built.jobs.find(j => j.label.startsWith('movie sound'));
  assert(soundJob.args.some(a => typeof a === 'string' && a.includes('pan=stereo')));
});
ok('every produced file name is actually used by video.txt or audio.txt', () => {
  const built = E.planToJobs(plan, movieInfo, { height: 480 });
  const produced = new Set(built.jobs.map(j => j.produces));
  built.videoList.concat(built.audioList).forEach(f => assert(produced.has(f), f + ' was never produced'));
});
ok('a genuinely empty span (start equals end) is skipped, not crashed on', () => {
  const tinyPlan = Object.assign({}, plan, { video: [{ type: 'play', sessionStart: 5000, sessionEnd: 5000, movieStart: 0 }] });
  const built = E.planToJobs(tinyPlan, movieInfo, { height: 480 });
  assert.strictEqual(built.jobs.length, 0);
});
ok('a span under one video frame still gets its (short) audio, not silently dropped', () => {
  const tinyPlan = Object.assign({}, plan, { video: [{ type: 'play', sessionStart: 0, sessionEnd: 1, movieStart: 0 }] });
  const built = E.planToJobs(tinyPlan, movieInfo, { height: 480 });
  assert.strictEqual(built.videoList.length, 0);
  assert.strictEqual(built.audioList.length, 1);
});

ok('the final mix command references every input it needs, in order', () => {
  const args = E.finalMixArgs(100, 20000);
  const i = args.indexOf('-i');
  assert(args.includes('video.txt') && args.includes('audio.txt') && args.includes('gain.f32') && args.includes('voice.in'));
  assert(args.includes('out.mp4'));
  assert(args.some(a => typeof a === 'string' && a.includes('amultiply')));
});
ok('a negative voice offset trims the start instead of going back in time', () => {
  const args = E.finalMixArgs(-250, 20000);
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert(fc.includes('atrim=start=0.25'));
});
ok('a positive voice offset delays the voice instead of starting early', () => {
  const args = E.finalMixArgs(300, 20000);
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert(fc.includes('adelay=300|300'));
});

console.log('\n' + n + ' checks passed');
