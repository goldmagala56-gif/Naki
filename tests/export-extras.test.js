'use strict';
// Checks the export engine's handling of speed, filters, fades and titles.  Run with:  node tests/export-extras.test.js   (or: npm test)
const assert = require('assert');
const E = require('../www/export-engine.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const info = { width: 1280, height: 720, sar: 1, hasAudio: true, audioMono: false, durationSec: 600 };
const mk = (video, extra) => Object.assign({ durationMs: 10000, movie: { name: 'm', durationMs: 600000 }, video: video, audio: [] }, extra || {});
const play = (o) => Object.assign({ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 1000 }, o || {});
const job = (built, label) => built.jobs.find(j => j.label.indexOf(label) === 0);
const fcOf = (j) => j.args[j.args.indexOf('-filter_complex') + 1];

ok('a plain clip gets exactly the command the earlier versions built', () => {
  const j = job(E.planToJobs(mk([play()]), info, { height: 480 }), 'picture');
  assert.strictEqual(j.args[j.args.indexOf('-vf') + 1], 'scale=854:480:flags=bicubic,tpad=stop_mode=clone:stop_duration=5,setsar=1,fps=30,format=yuv420p');
  assert(!j.args.includes('-filter_complex'));
  const fz = job(E.planToJobs(mk([{ type: 'freeze', sessionStart: 0, sessionEnd: 2000, movieAt: 500 }]), info, { height: 480 }), 'frozen picture');
  assert.strictEqual(fz.args[fz.args.indexOf('-vf') + 1], 'null,setsar=1,fps=30,format=yuv420p'.replace('null,', 'null,'));
});
ok('speed slows or speeds the picture, and the sound with it (0.25x and 4x take two steps)', () => {
  const b = E.planToJobs(mk([play({ speed: 2 })], { audio: [
    { src: 'movie', startMs: 0, durMs: 4000, inMs: 1000, speed: 2, points: [[0, 1], [4000, 1]] },
    { src: 'movie', startMs: 4000, durMs: 2000, inMs: 0, speed: 0.25, points: [[0, 1]] },
    { src: 'movie', startMs: 6000, durMs: 2000, inMs: 0, speed: 4, points: [[0, 1]] }, { src: 'voice', startMs: 0, durMs: 2000, inMs: 0, points: [[0, 1]] }] }), info, { height: 480 });
  assert(fcOf(job(b, 'picture')).includes('setpts=PTS/2,fps=30'));
  const snd = b.jobs.filter(j => j.label.indexOf('sound movie') === 0);
  assert(fcOf(snd[0]).includes(',atempo=2.0000,')); assert(fcOf(snd[1]).includes(',atempo=0.5,atempo=0.5000,')); assert(fcOf(snd[2]).includes(',atempo=2,atempo=2.0000,'));
  assert(!fcOf(b.jobs.find(j => j.label.indexOf('sound voice') === 0)).includes('atempo'));
  assert.strictEqual(snd[0].args[snd[0].args.indexOf('-ss') + 1], '1.000');
});
ok('colour and fades are applied inside the picture, with the fade-out timed from the end of the part', () => {
  const j = job(E.planToJobs(mk([play({ filter: { brightness: 0.8, contrast: 1.2, saturate: 0 }, vFadeIn: 500, vFadeOut: 750 })]), info, { height: 480 }), 'picture');
  const fc = fcOf(j);
  assert(fc.includes('eq=contrast=1.2:saturation=0')); assert(fc.includes("lutyuv=y='clip(val*0.8,16,235)'"));
  assert(fc.includes('fade=t=in:st=0:d=0.500')); assert(fc.includes('fade=t=out:st=3.250:d=0.750'));
  assert(fc.indexOf('format=yuv420p') < fc.indexOf('eq=') && fc.indexOf('eq=') < fc.indexOf('fade='), 'order: fit, colour, then fades');
  const only = job(E.planToJobs(mk([play({ filter: { brightness: 1, contrast: 1, saturate: 1 } })]), info, { height: 480 }), 'picture');
  assert(!fcOf(only).includes('eq=') && !fcOf(only).includes('lutyuv'), 'a neutral filter adds nothing');
});
ok('titles: one transparent picture per title, laid over only the parts it shows in, timed from the start of each part', () => {
  const plan = mk([play({ sessionStart: 0, sessionEnd: 4000 }), { type: 'freeze', sessionStart: 4000, sessionEnd: 8000, movieAt: 5000 }, { type: 'black', sessionStart: 8000, sessionEnd: 10000 }],
    { texts: [{ startMs: 3000, durMs: 3000, text: 'Hi', size: 7, color: '#fff', pos: 'bottom', weight: 700, bg: false }] });
  const b = E.planToJobs(plan, info, { height: 480 });
  assert.strictEqual(b.textFiles.length, 1); assert.strictEqual(b.textFiles[0].name, 'txt000.png'); assert.strictEqual(b.textFiles[0].width, 854); assert.strictEqual(b.textFiles[0].height, 480);
  const p1 = job(b, 'picture'), fz = job(b, 'frozen picture'), bl = job(b, 'blank');
  assert(p1.args.includes('txt000.png')); assert(fcOf(p1).includes("enable='between(t,3.000,4.000)'"));
  assert(fz.args.includes('txt000.png')); assert(fcOf(fz).includes("enable='between(t,0.000,2.000)'"));
  assert(!bl.args.includes('txt000.png'), 'a part the title does not reach is left alone');
  assert(p1.args.indexOf('-i') < p1.args.indexOf('txt000.png') && p1.args.lastIndexOf('-i') === p1.args.indexOf('txt000.png') - 1);
});
ok('logo and titles together build one valid chain with each input used once', () => {
  const plan = mk([play()], { texts: [{ startMs: 0, durMs: 2000, text: 'A', size: 7, color: '#fff', pos: 'top' }, { startMs: 1000, durMs: 2000, text: 'B', size: 7, color: '#fff', pos: 'center' }] });
  const j = job(E.planToJobs(plan, info, { height: 480, hasLogo: true }), 'picture'), fc = fcOf(j);
  assert(fc.includes('[1:v]scale=') && fc.includes('[2:v]') && fc.includes('[3:v]'));
  const labels = fc.match(/\[v\d\]/g); assert.deepStrictEqual([...new Set(labels)].sort(), ['[v0]', '[v1]', '[v2]', '[v3]']);
  assert.strictEqual(j.args[j.args.indexOf('-map') + 1], '[v3]');
  assert.deepStrictEqual(j.args.filter((a, i) => j.args[i - 1] === '-i'), ['movie.in', 'logo.png', 'txt000.png', 'txt001.png']);
});
ok('vertical output sizes the title pictures for the vertical frame', () => {
  const b = E.planToJobs(mk([play()], { texts: [{ startMs: 0, durMs: 1000, text: 'A' }] }), info, { height: 480, vertical: true });
  assert.strictEqual(b.textFiles[0].width, 480); assert.strictEqual(b.textFiles[0].height, 854);
});
ok('titles wrap to the picture width and are placed at the same heights as the editor preview', () => {
  const calls = [], g = { measureText: s => ({ width: s.length * 10 }), fillText: (t, x, y) => calls.push([t, x, y]), fillRect() {} };
  const lines = E.drawTitle(g, { text: 'one two three four five six seven eight nine ten', size: 10, pos: 'center', color: '#fff' }, 400, 300);
  assert(lines.length > 1 && lines.every(l => l.length * 10 <= 400 * 0.88 + 1e-9), JSON.stringify(lines));
  assert.strictEqual(calls[0][1], 200); assert.strictEqual(calls[0][2], Math.round(0.40 * 300));
  assert.strictEqual(E.drawTitle(Object.assign({}, g, { fillText: () => {} }), { text: 'a\nb', size: 5, pos: 'top' }, 400, 300).length, 2);
});
console.log('\n' + n + ' checks passed');