'use strict';
// Tests the pure, platform-independent parts of the in-browser export engine (ffmpeg.wasm version):
// parsing ffmpeg's own log text, and turning an export plan (v2, see www/plan.js) into a job list.
// The actual ffmpeg.wasm runner can only run in a real browser, so it isn't tested here --
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
  naki: 'export-plan', version: 2, durationMs: 20000,
  movie: { name: 'Test.mp4', durationMs: 30000 },
  video: [
    { type: 'freeze', sessionStart: 0, sessionEnd: 2000, movieAt: 0 },
    { type: 'play', sessionStart: 2000, sessionEnd: 9500, movieStart: 0 },
    { type: 'freeze', sessionStart: 9500, sessionEnd: 11900, movieAt: 4000 },
    { type: 'play', sessionStart: 11900, sessionEnd: 20000, movieStart: 4000 }
  ],
  audio: [
    { src: 'movie', startMs: 2000, durMs: 7500, inMs: 0, points: [[0, 1], [7500, 1]] },
    { src: 'movie', startMs: 11900, durMs: 8000, inMs: 4000, points: [[0, 1], [8000, 1]] },
    { src: 'voice', startMs: 100, durMs: 19800, inMs: 0, points: [[0, 1]] },
    { src: 'music', startMs: 15000, durMs: 4900, inMs: 0, points: [[0, 0.7]] }
  ]
};
const filterOf = (job) => job.args[job.args.indexOf('-filter_complex') + 1];

ok('every video span becomes a job, in order, nothing skipped', () => {
  const built = E.planToJobs(plan, movieInfo, { height: 480 });
  assert.deepStrictEqual(built.videoList, ['v0000.ts', 'v0001.ts', 'v0002.ts', 'v0003.ts']);
  const labels = built.jobs.map(j => j.label);
  assert(labels.some(l => l.startsWith('frozen frame 1')));
  assert(labels.some(l => l.startsWith('picture 2')));
});
ok('a blank (black) span is drawn from a generated colour, not from the movie', () => {
  const p = Object.assign({}, plan, { video: [{ type: 'black', sessionStart: 0, sessionEnd: 2000 }, { type: 'play', sessionStart: 2000, sessionEnd: 4000, movieStart: 0 }] });
  const built = E.planToJobs(p, movieInfo, { height: 480 });
  const blank = built.jobs.find(j => j.label.startsWith('blank picture 1'));
  assert(blank, 'no blank picture job');
  assert(blank.args.some(a => typeof a === 'string' && a.startsWith('color=c=')));
  assert(!blank.args.includes('movie.in'));
  assert.deepStrictEqual(built.videoList, ['v0000.ts', 'v0001.ts']);
});
ok('output width stays even and matches the movie\'s own shape', () => {
  const built = E.planToJobs(plan, movieInfo, { height: 480 });
  assert.strictEqual(built.height, 480);
  assert.strictEqual(built.width % 2, 0);
  assert.strictEqual(built.width, 854);
});
ok('vertical export uses a tall 9:16 canvas', () => {
  const built = E.planToJobs(plan, movieInfo, { height: 480, vertical: true });
  assert.strictEqual(built.width, 480); assert.strictEqual(built.height, 854);
});
ok('a silent movie gets no movie-sound jobs, but voice and music still render', () => {
  const silentInfo = Object.assign({}, movieInfo, { hasAudio: false });
  const built = E.planToJobs(plan, silentInfo, { height: 480 });
  assert(!built.jobs.some(j => j.label.startsWith('sound movie')));
  assert(!built.lanes.movie);
  assert(built.lanes.voice && built.lanes.music);
});
ok('a mono movie gets upmixed to stereo, not left quieter', () => {
  const monoInfo = Object.assign({}, movieInfo, { audioMono: true });
  const built = E.planToJobs(plan, monoInfo, { height: 480 });
  const soundJob = built.jobs.find(j => j.label.startsWith('sound movie'));
  assert(filterOf(soundJob).includes('pan=stereo'));
});
ok('your voice is cleaned with a low-cut filter; music is not', () => {
  const built = E.planToJobs(plan, movieInfo, { height: 480 });
  assert(filterOf(built.jobs.find(j => j.label.startsWith('sound voice'))).includes('highpass'));
  assert(!filterOf(built.jobs.find(j => j.label.startsWith('sound music'))).includes('highpass'));
});
ok('each sound clip carries its own volume curve as a file the job reads', () => {
  const built = E.planToJobs(plan, movieInfo, { height: 480 });
  built.jobs.filter(j => j.label.startsWith('sound ')).forEach(j => {
    const names = Object.keys(j.files || {});
    assert.strictEqual(names.length, 1);
    assert(j.args.includes(names[0]), 'job does not read its gain file');
    assert(j.files[names[0]] instanceof Uint8Array && j.files[names[0]].length > 0);
  });
});
ok('every sound lane runs the whole session and only lists files that were produced', () => {
  const built = E.planToJobs(plan, movieInfo, { height: 480 });
  const produced = new Set(built.jobs.map(j => j.produces));
  Object.keys(built.lanes).forEach(src => {
    built.lanes[src].forEach(f => assert(produced.has(f), f + ' was never produced'));
    assert(/^t.\.wav$/.test(built.lanes[src][built.lanes[src].length - 1]), src + ' lane has no closing silence');
  });
  built.videoList.forEach(f => assert(produced.has(f), f + ' was never produced'));
});
ok('a lane that already ends exactly at the end of the video gets no extra silence', () => {
  const p = Object.assign({}, plan, { audio: [{ src: 'voice', startMs: 0, durMs: 20000, inMs: 0, points: [[0, 1]] }] });
  const built = E.planToJobs(p, movieInfo, { height: 480 });
  assert.deepStrictEqual(built.lanes.voice, ['av0000.wav']);
});
ok('a clip that starts late is preceded by silence, so it lands at the right time', () => {
  const built = E.planToJobs(plan, movieInfo, { height: 480 });
  assert(/^s.\d+\.wav$/.test(built.lanes.music[0]), 'music lane should open with a silent gap');
});
ok('a genuinely empty span (start equals end) is skipped, not crashed on', () => {
  const tiny = Object.assign({}, plan, { video: [{ type: 'play', sessionStart: 5000, sessionEnd: 5000, movieStart: 0 }], audio: [] });
  const built = E.planToJobs(tiny, movieInfo, { height: 480 });
  assert.strictEqual(built.videoList.length, 0);
  assert.strictEqual(built.jobs.length, 0);
});
ok('a sound clip under one video frame is still rendered, not silently dropped', () => {
  const tiny = Object.assign({}, plan, { video: [], audio: [{ src: 'voice', startMs: 0, durMs: 5, inMs: 0, points: [[0, 1]] }] });
  const built = E.planToJobs(tiny, movieInfo, { height: 480 });
  assert(built.jobs.some(j => j.label.startsWith('sound voice')));
});
ok('two clips that overlap a little on one lane do not break the lane', () => {
  const p = Object.assign({}, plan, { audio: [
    { src: 'voice', startMs: 0, durMs: 5000, inMs: 0, points: [[0, 1]] },
    { src: 'voice', startMs: 4900, durMs: 5000, inMs: 5000, points: [[0, 1]] }] });
  const built = E.planToJobs(p, movieInfo, { height: 480 });
  assert.strictEqual(built.jobs.filter(j => j.label.startsWith('sound voice')).length, 2);
});

ok('the final mix reads the picture list and one list per sound lane', () => {
  const args = E.finalMixArgs(['movie', 'voice', 'music'], 20000);
  ['video.txt', 'lane_movie.txt', 'lane_voice.txt', 'lane_music.txt', 'out.mp4'].forEach(f => assert(args.includes(f), f));
  assert(args[args.indexOf('-filter_complex') + 1].includes('amix=inputs=3'));
  assert(args[args.indexOf('-filter_complex') + 1].includes('normalize=0'));
});
ok('a single sound lane is not sent through the mixer', () => {
  const fc = E.finalMixArgs(['voice'], 20000);
  assert(!fc[fc.indexOf('-filter_complex') + 1].includes('amix'));
});
ok('a video with no sound at all still gets a silent audio track', () => {
  const args = E.finalMixArgs([], 20000);
  assert(args.some(a => typeof a === 'string' && a.startsWith('anullsrc')));
  assert(args.includes('out.mp4'));
});
ok('the gain file turns a volume curve into stereo floats', () => {
  const raw = E.buildGainRaw([[0, 1], [1000, 0]], 1000);
  const f = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  assert(Math.abs(f[0] - 1) < 1e-6 && f[0] === f[1]);            // both channels
  assert(Math.abs(f[2 * 500] - 0.5) < 0.01);                      // halfway down at 0.5 s
});

console.log('\n' + n + ' checks passed');