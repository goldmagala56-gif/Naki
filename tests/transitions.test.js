'use strict';
// node tests/transitions.test.js
// 58 transitions: the list, the project, the export commands, and (when this computer has ffmpeg) every one rendered for real.
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const F = require('../www/fx.js'), P = require('../www/project.js'), NP = require('../www/plan.js'), E = require('../www/export-engine.js');
const T = F.trans;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

ok('list: more than 50, seven groups, each with a name, the six that existed before, and the project knows them all', () => {
  assert(T.LIST.length >= 50, String(T.LIST.length)); assert.strictEqual(new Set(T.KEYS).size, T.KEYS.length, 'unique keys'); assert.strictEqual(T.GROUPS.length, 7);
  T.GROUPS.forEach(g => assert(T.inGroup(g.key).length >= 5, g.key)); T.LIST.forEach(t => { assert(t.label.length > 2); assert(T.GROUPS.some(g => g.key === t.group), t.key); assert.strictEqual(T.XFADE[t.key], t.key); });
  ['fade', 'fadeblack', 'wipeleft', 'slideleft', 'zoomin', 'circleopen'].forEach(k => assert(T.KEYS.includes(k), k));
  assert.deepStrictEqual(P.TRANSITION_TYPES, T.KEYS); assert.strictEqual(T.label('radial'), 'Radial'); assert.strictEqual(T.label('nope'), 'nope');
});
function make() {
  const v = [], s = [];
  ['A', 'B', 'C'].forEach((k, i) => {
    v.push({ id: 'v' + k, type: 'video', asset: 'movie', start: i * 4000, dur: 4000, in: 10000 + i * 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'l' + k });
    s.push({ id: 's' + k, type: 'audio', asset: 'movie', start: i * 4000, dur: 4000, in: 10000 + i * 10000, speed: 1, volume: 1, gain: [[0, 1], [4000, 1]], fadeIn: 0, fadeOut: 0, link: 'l' + k });
  });
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: v }, { id: 't-moviesound', kind: 'audio', role: 'movieSound', muted: false, hidden: false, volume: 1, locked: false, clips: s }] };
}
const base = make();
ok('project: every transition can be set on a clip, reaches the export plan, and an unknown one is ignored', () => {
  T.KEYS.forEach(k => { const p = P.setTransition(base, 'vB', { type: k, durMs: 800 }); assert.deepStrictEqual(P.findClip(p, 'vB').clip.transition, { type: k, durMs: 800 }); assert.strictEqual(NP.projectToPlan(p).video[1].transitionIn.type, k); });
  assert.strictEqual(P.setTransition(base, 'vB', { type: 'sparkle' }), base);
});
const info0 = { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 6 };
const planT = (type) => ({ naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 6000 }, audio: [],
  video: [{ type: 'play', sessionStart: 0, sessionEnd: 2000, movieStart: 0 }, { type: 'play', sessionStart: 2000, sessionEnd: 4000, movieStart: 4000, transitionIn: { type, durMs: 1000 } }] });
ok('ffmpeg engine: each transition becomes the matching xfade, and the video keeps its length', () => {
  T.KEYS.forEach(k => {
    const r = E.planToJobs(planT(k), info0, { height: 360 }), x = r.jobs.find(j => j.produces === 't0001.ts').args.join(' ');
    assert(x.includes('xfade=transition=' + k + ':duration=1.000:offset=0'), k + ': ' + x); assert.deepStrictEqual(r.videoList, ['v0000.ts', 't0001.ts', 'v0001.ts'], k);
  });
});
function ffmpegOk() { const r = cp.spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }); const m = r.status === 0 && /version\s+n?(\d+)/.exec(r.stdout); return !!m && +m[1] >= 5; }
if (ffmpegOk()) {
  ok('real ffmpeg: all of them render a 1 second transition of 30 frames that starts on the first picture and ends on the second', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-tr-')), sh = (a) => cp.spawnSync('ffmpeg', ['-y', '-v', 'error'].concat(a), { cwd: dir, encoding: 'utf8' });
    try {
      T.KEYS.forEach(k => {
        const r = sh(['-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:r=30:d=1', '-filter_complex', '[0:v][1:v]xfade=transition=' + k + ':duration=1.000:offset=0[x]', '-map', '[x]', '-frames:v', '30', '-pix_fmt', 'yuv420p', 'o.mp4']);
        assert.strictEqual(r.status, 0, k + ': ' + r.stderr);
        const frames = +cp.spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path.join(dir, 'o.mp4')], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
        assert.strictEqual(frames, 30, k);
        const px = (t) => Array.from(cp.spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', path.join(dir, 'o.mp4'), '-frames:v', '1', '-vf', 'scale=16:9', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { encoding: null }).stdout);
        const avg = (a, c) => { let s = 0, m = 0; for (let i = c; i < a.length; i += 3) { s += a[i]; m++; } return s / m; };
        const first = px(0), last = px(0.95);
        assert(avg(first, 0) > avg(last, 0) + 20 && avg(last, 2) > avg(first, 2) + 20, k + ': red to blue ' + avg(first, 0).toFixed(0) + '/' + avg(last, 0).toFixed(0));
      });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
} else console.log('  --  real-file checks skipped (need ffmpeg 5 or newer on this computer)');
console.log('\n' + n + ' checks passed');
