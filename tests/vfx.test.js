'use strict';
// node tests/vfx.test.js
// Video effects: the list, the ffmpeg filter graphs, the preview numbers, the project edits, the export plan, and (when this computer has ffmpeg) every effect rendered for real.
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const F = require('../www/fx.js'), P = require('../www/project.js'), NP = require('../www/plan.js'), E = require('../www/export-engine.js');
const V = F.vfx;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

ok('list: more than 50 effects in seven groups, each with a name, a length, and the six that existed before', () => {
  assert(V.LIST.length >= 60, String(V.LIST.length)); assert.strictEqual(new Set(V.KEYS).size, V.KEYS.length, 'unique keys');
  ['shake', 'glitch', 'blur', 'flash', 'rgbsplit', 'grain'].forEach(k => assert(V.has(k), k));
  assert.strictEqual(V.CATS.length, 7); V.CATS.forEach(c => assert(V.inCat(c.key).length >= 5, c.key));
  V.LIST.forEach(e => { assert(e.label.length > 2 && V.label(e.key) === e.label); assert(V.defDur(e.key) >= 300 && V.defDur(e.key) <= 5000, e.key); });
  assert.strictEqual(V.has('sparkle'), false); assert.strictEqual(V.label('sparkle'), 'sparkle'); assert.strictEqual(V.isFixed('invert'), true); assert.strictEqual(V.isFixed('blur'), false);
});
ok('ffmpeg graph: every effect at every strength is one tidy piece (input, effect, laid back only between its start and end) with no bad numbers', () => {
  V.KEYS.forEach(k => [0, 0.5, 1].forEach(s => {
    const g = V.graph({ fx: k, strength: s }, 0.4, 1.9, 'v3', 'v4', 640, 360);
    assert(g.startsWith('[v3]split[') && g.endsWith('[v4]'), k + ': ' + g); assert(!/NaN|undefined|Infinity|\$[IOP]/.test(g), k + ': ' + g);
    assert(g.includes("overlay=enable='between(t,0.400,1.900)'"), k);
    const labels = (g.match(/\[[a-z0-9_]+\]/gi) || []).map(x => x.slice(1, -1)), cnt = {}; labels.forEach(l => { cnt[l] = (cnt[l] || 0) + 1; });
    Object.keys(cnt).forEach(l => assert.strictEqual(cnt[l], l === 'v3' || l === 'v4' ? 1 : 2, k + ': label ' + l + ' used ' + cnt[l] + ' times in ' + g));
  }));
  assert.strictEqual(V.graph({ fx: 'sparkle' }, 0, 1, 'a', 'b', 640, 360), null);
  assert(V.graph({ fx: 'pixel', strength: 1 }, 0, 1, 'v0', 'v1', 1080, 1920).includes('flags=neighbor'));
  assert(V.graph({ fx: 'shake', strength: 0.5 }, 0, 1, 'v0', 'v1', 1080, 1920).includes('scale=1080:1920'), 'the picture comes back to the output size');
});
ok('preview: every effect gives sane numbers at any moment, nothing at all when none is on, and several add up', () => {
  const none = V.preview([], 500); assert.deepStrictEqual([none.transform, none.filter, none.flash, none.grain, none.bars, none.tints.length, none.badge.length], ['', '', 0, 0, 0, 0, 0]);
  V.KEYS.forEach(k => [0, 0.5, 1].forEach(s => [0, 300, 1000, 1999].forEach(t => {
    const r = V.preview([{ fx: k, strength: s, start: 0, dur: 2000 }], t);
    assert(!/NaN|undefined/.test(r.transform + r.filter), k + ': ' + r.transform + ' ' + r.filter); assert(r.flash >= 0 && r.flash <= 1 && r.grain >= 0 && r.grain <= 1 && r.bars >= 0 && r.bars < 0.5, k);
  })));
  const two = V.preview([{ fx: 'shake', strength: 0.5, start: 0, dur: 2000 }, { fx: 'blur', strength: 0.5, start: 0, dur: 2000 }], 100); assert(two.transform.includes('translate') && two.filter.includes('blur('));
  assert(V.preview([{ fx: 'flash', strength: 1, start: 0, dur: 500 }], 0).flash > 0.9 && V.preview([{ fx: 'flash', strength: 1, start: 0, dur: 500 }], 499).flash < 0.05, 'a flash fades away');
  assert(V.preview([{ fx: 'letterbox', strength: 0.5, start: 0, dur: 2000 }], 100).bars > 0.1); assert(V.preview([{ fx: 'mirrorlr', start: 0, dur: 2000 }], 100).badge.length === 1, 'a note for what the preview cannot show');
});

function make() {
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
}
const base = make();
ok('project: every effect can be added at the playhead with its own length, switched to another, and given a strength', () => {
  V.KEYS.forEach(k => { const o = {}, p = P.addFx(base, 1000, k, o), c = P.findClip(p, o.id).clip; assert.strictEqual(c.fx, k); assert.strictEqual(c.start, 1000); assert.strictEqual(c.dur, V.defDur(k)); assert.strictEqual(P.validate(p).length, 0); });
  assert.strictEqual(P.addFx(base, 0, 'sparkle', {}), base);
  const o = {}, p = P.addFx(base, 0, 'blur', o); let q = P.setFxProps(p, o.id, { fx: 'vhs', strength: 0.9 }); assert.deepStrictEqual([P.findClip(q, o.id).clip.fx, P.findClip(q, o.id).clip.strength], ['vhs', 0.9]);
  assert.strictEqual(P.setFxProps(p, o.id, { fx: 'sparkle' }), p, 'an unknown effect is ignored');
  const o2 = {}, two = P.addFx(p, 500, 'pixel', o2); assert.strictEqual(two.tracks.filter(t => t.kind === 'fx').length, 2, 'effects at the same time go on separate rows');
  assert.strictEqual(P.fxAt(two, 800).length, 2);
});
ok('plan: effects travel with their strength', () => {
  const o = {}, p = P.setFxProps(P.addFx(base, 1000, 'kaleido', o), o.id, { strength: 0.3 }), fx = NP.projectToPlan(p).fx;
  assert.deepStrictEqual(fx, [{ startMs: 1000, durMs: 3000, fx: 'kaleido', strength: 0.3 }]); assert.strictEqual(NP.projectToPlan(base).fx, undefined);
});

const info0 = { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 6 };
const planFx = (fx) => ({ naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 6000 }, audio: [], video: [{ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0 }], fx });
const gOf = (r) => { const a = r.jobs.find(j => j.produces === 'v0000.ts').args; return a[a.indexOf('-filter_complex') + 1]; };
ok('ffmpeg engine: the new effects are used, in order, each with its own labels, only for the time they last', () => {
  const g = gOf(E.planToJobs(planFx([{ startMs: 500, durMs: 1500, fx: 'pixel', strength: 0.5 }, { startMs: 1000, durMs: 1000, fx: 'mirrorlr', strength: 0.5 }]), info0, { height: 360 }));
  assert(g.includes('flags=neighbor') && g.includes('hstack') && g.includes("between(t,0.500,2.000)") && g.includes("between(t,1.000,2.000)"), g);
  assert(g.indexOf('neighbor') < g.indexOf('hstack'), 'in the order they were added'); const lab = {}; (g.match(/\[xv\d+_[a-z]+\]/g) || []).forEach(l => { lab[l] = (lab[l] || 0) + 1; }); Object.keys(lab).forEach(l => assert.strictEqual(lab[l], 2, l));
});

ok('ffmpeg engine: the six effects that existed before are still made by the original effects code, the new ones by the library', () => {
  const g = gOf(E.planToJobs(planFx([{ startMs: 500, durMs: 1500, fx: 'blur', strength: 0.5 }, { startMs: 500, durMs: 1500, fx: 'pixel', strength: 0.5 }]), info0, { height: 360 }));
  assert(g.includes('flags=neighbor') && g.includes('xv2_'), g); assert(!g.includes('xv1_'), 'the first (blur) is not made by the library: ' + g);
});
// ---- real ffmpeg, only when this computer has a recent one ----
function ffmpegOk() { const r = cp.spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }); const m = r.status === 0 && /version\s+n?(\d+)/.exec(r.stdout); return !!m && +m[1] >= 5; }
if (ffmpegOk()) {
  ok('real ffmpeg: every effect renders at three strengths, keeps the video 60 frames long, and changes the picture only inside its time', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-vfx-')), sh = (a) => cp.spawnSync('ffmpeg', ['-y', '-v', 'error'].concat(a), { cwd: dir, encoding: 'utf8' });
    try {
      assert.strictEqual(sh(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=2,format=yuv420p', 'src.mp4']).status, 0);
      const frame = (f, t) => cp.spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', path.join(dir, f), '-frames:v', '1', '-vf', 'scale=64:36', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { encoding: null }).stdout;
      const early0 = frame('src.mp4', 0.1), mid0 = frame('src.mp4', 1.0), diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; };
      let changed = 0;
      V.KEYS.forEach(k => [0, 0.5, 1].forEach(s => {
        const r = sh(['-i', 'src.mp4', '-filter_complex', '[0:v]null[v0];' + V.graph({ fx: k, strength: s }, 0.3, 1.7, 'v0', 'v1', 640, 360), '-map', '[v1]', '-frames:v', '60', '-pix_fmt', 'yuv420p', 'o.mp4']);
        assert.strictEqual(r.status, 0, k + ' at ' + s + ': ' + r.stderr);
        if (s === 0.5) {
          const frames = +cp.spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path.join(dir, 'o.mp4')], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
          assert.strictEqual(frames, 60, k + ' frames'); assert(diff(frame('o.mp4', 0.1), early0) < 2, k + ' must not touch the picture before it starts');
          if (diff(frame('o.mp4', 1.0), mid0) > 0.5) changed++;
        }
      }));
      assert(changed >= V.KEYS.length - 8, 'most effects visibly change the picture: ' + changed + ' of ' + V.KEYS.length);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
} else console.log('  --  real-file checks skipped (need ffmpeg 5 or newer on this computer)');
console.log('\n' + n + ' checks passed');
