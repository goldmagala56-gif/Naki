'use strict';
// Runs the REAL export jobs for a reversed clip through ffmpeg and checks every picture and the sound.
// Needs ffmpeg on the PATH (it is skipped without it) and the Reverse patch applied to www/export-engine.js.
// Run with:  node tests/export-reverse.test.js
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
if (cp.spawnSync('ffmpeg', ['-version']).status !== 0) { console.log('  (ffmpeg not found: the reverse export test was skipped)'); process.exit(0); }
const E = require('../www/export-engine.js'), RV = require('../www/reverse.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-rev-'));
const ff = (args, o) => { const r = cp.spawnSync('ffmpeg', ['-v', 'error', '-y'].concat(args), Object.assign({ cwd: dir, maxBuffer: 1e8 }, o || {})); assert.strictEqual(r.status, 0, 'ffmpeg failed: ' + args.join(' ').slice(0, 160) + '\n' + r.stderr); return r.stdout; };

// A movie where every picture shows its own number as 8 light / dark bands (bit i of the frame number), so a frame can be read back
// exactly even after compression; and a tone that gets steadily louder, so reversed sound is easy to tell.
ff(['-f', 'lavfi', '-i', "color=c=black:s=320x180:r=30:d=8,format=yuv420p,geq=lum='if(gte(mod(floor(N/pow(2,floor(X/40))),2),1),200,40)':cb=128:cr=128",
  '-f', 'lavfi', '-i', 'aevalsrc=0.9*t/8*sin(2*PI*440*t):s=48000:d=8', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-g', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-f', 'mp4', 'movie.in']);
const info = { width: 320, height: 180, sar: 1, hasAudio: true, audioMono: false, durationSec: 8 };
const frameNumbers = (file) => {   // the number written on every picture of a video
  const raw = ff(['-i', file, '-vf', 'scale=8:1:flags=area,format=gray', '-f', 'rawvideo', '-'], {}), out = [];
  for (let f = 0; f + 8 <= raw.length; f += 8) { let v = 0; for (let b = 0; b < 8; b++) if (raw[f + b] > 120) v |= 1 << b; out.push(v); }
  return out;
};
const rms = (file, from, len) => { const raw = ff(['-ss', String(from), '-t', String(len), '-i', file, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], {}), f = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length)); let s = 0; f.forEach(x => { s += x * x; }); return Math.sqrt(s / f.length); };
// does what the app's runner does, with the desktop ffmpeg
function exportPlan(plan, opts) {
  const built = E.planToJobs(plan, info, Object.assign({ height: 180, preset: 'ultrafast', crf: 18 }, opts));
  built.jobs.forEach(j => { Object.keys(j.files || {}).forEach(k => fs.writeFileSync(path.join(dir, k), j.files[k])); ff(j.args); });
  fs.writeFileSync(path.join(dir, 'video.txt'), built.videoList.map(f => "file '" + f + "'\n").join(''));
  Object.keys(built.lanes).forEach(src => fs.writeFileSync(path.join(dir, 'lane_' + src + '.txt'), built.lanes[src].map(f => "file '" + f + "'\n").join('')));
  ff(E.finalMixArgs(Object.keys(built.lanes), plan.durationMs)); return { built, file: path.join(dir, 'out.mp4') };
}
const mk = (reverse, speed, ms) => ({ durationMs: ms, movie: { name: 'm', durationMs: 8000 },
  video: [Object.assign({ type: 'play', sessionStart: 0, sessionEnd: ms, movieStart: 1000 }, reverse ? { reverse: true } : {}, speed ? { speed: speed } : {})],
  audio: [Object.assign({ src: 'movie', startMs: 0, durMs: ms, inMs: 1000, points: [[0, 1]] }, reverse ? { reverse: true } : {}, speed ? { speed: speed } : {})] });

ok('the test movie reads back exactly (frame numbers) and a plain export plays forwards', () => {
  const src = frameNumbers(path.join(dir, 'movie.in')); assert.strictEqual(src.length, 240); src.forEach((v, i) => assert.strictEqual(v, i, 'source frame ' + i));
  const r = exportPlan(mk(false, 0, 4000)), f = frameNumbers(r.file); assert.strictEqual(f.length, 120);
  f.forEach((v, k) => assert(Math.abs(v - (30 + k)) <= 1, 'forward frame ' + k + ' is ' + v));
  assert(rms(r.file, 3.4, 0.5) > rms(r.file, 0, 0.5) * 2, 'the tone gets louder when played forwards');
});
ok('a reversed part shows the same stretch of the movie, picture by picture, last one first', () => {
  const r = exportPlan(mk(true, 0, 4000)), f = frameNumbers(r.file); assert.strictEqual(f.length, 120, 'same length as the clip');
  f.forEach((v, k) => assert(Math.abs(v - (149 - k)) <= 1, 'output picture ' + k + ' should be source picture ' + (149 - k) + ' but is ' + v));
  assert(r.built.jobs.some(j => /^reversing/.test(j.label)));
});
ok('the sound of a reversed part is reversed too (it gets quieter instead of louder)', () => {
  const r = exportPlan(mk(true, 0, 4000)); assert(rms(r.file, 0, 0.5) > rms(r.file, 3.4, 0.5) * 2.5, 'start ' + rms(r.file, 0, 0.5) + ' end ' + rms(r.file, 3.4, 0.5));
});
ok('cut into several pieces (as a phone must), the joins lose no picture and repeat none', () => {
  const r = exportPlan(mk(true, 0, 4000), { reverseChunkFrames: 25 }), f = frameNumbers(r.file);
  assert.strictEqual(r.built.jobs.filter(j => /^reversing/.test(j.label)).length, 5, 'five pieces of 25 pictures'); assert.strictEqual(f.length, 120);
  f.forEach((v, k) => assert(Math.abs(v - (149 - k)) <= 1, 'picture ' + k + ': ' + v));
  for (let k = 1; k < f.length; k++) assert(f[k] < f[k - 1], 'picture ' + k + ' (' + f[k] + ') must come after ' + f[k - 1]);
});
ok('a reversed part that is also sped up keeps to the same stretch', () => {
  const r = exportPlan(mk(true, 2, 2000), { reverseChunkFrames: 25 }), f = frameNumbers(r.file); assert.strictEqual(f.length, 60);
  f.forEach((v, k) => assert(Math.abs(v - (148.5 - 2 * k)) <= 1.6, 'picture ' + k + ' is ' + v));
  for (let k = 1; k < f.length; k++) assert(f[k] < f[k - 1], 'always going backwards at ' + k);
  assert(rms(r.file, 0, 0.3) > rms(r.file, 1.6, 0.3) * 1.8, 'sound reversed too');
});
ok('the pieces are planned to fit in memory: no piece is bigger than the budget, and none is empty', () => {
  assert(RV.chunkFrames(854, 480) * 854 * 480 * 1.5 <= 100e6); assert(RV.chunkFrames(1280, 720) * 1280 * 720 * 1.5 <= 100e6); assert(RV.chunkFrames(1920, 1080) >= 8);
  const o = { id: '0000', nFrames: 120, width: 320, height: 180, speed: 1, fitChain: 'null', enc: [], ts: [], chunkFrames: 25 };
  const j = RV.reversePicture({ sessionStart: 0, sessionEnd: 4000, movieStart: 1000 }, o);
  assert.strictEqual(j.jobs.length, 5); assert.deepStrictEqual(j.jobs.map(x => x.args[1]), ['4.158', '3.325', '2.492', '1.658', '0.992']);
});
fs.rmSync(dir, { recursive: true, force: true });
console.log('\n' + n + ' checks passed');