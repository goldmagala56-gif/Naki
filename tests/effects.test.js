'use strict';
// node tests/effects.test.js
// Transitions, preset filters and stickers: the numbers, the project edits, the export plan and the commands the ffmpeg engine builds.
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const S = require('../www/stickers.js'), R = require('../www/presets.js'), P = require('../www/project.js'), NP = require('../www/plan.js'), E = require('../www/export-engine.js');
const { WebCodecsExport } = require('../www/webcodecs-export.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

// ---------- preset filters ----------
ok('presets: none is the untouched picture, intensity moves between none and the full look', () => {
  assert.deepStrictEqual(R.apply('none', 1), { sharpen: 0, brightness: 1, contrast: 1, saturate: 1, warmth: 0, vignette: 0, matte: 0 });
  assert.deepStrictEqual(R.apply('cinema', 0), R.apply('none', 1));
  const full = R.apply('cinema', 1), half = R.apply('cinema', 0.5);
  assert.strictEqual(full.contrast, 1.2); assert.strictEqual(half.contrast, 1.1); assert.strictEqual(half.vignette, 0.225);
  assert.strictEqual(R.apply('bw', 1).saturate, 0); assert.strictEqual(R.apply('cinema').vignette, 0.45, 'no amount means full');
  assert.strictEqual(R.apply('nonsense', 1).saturate, 1, 'an unknown name changes nothing');
});
ok('presets: every one stays inside what the colour controls allow and never needs the ffmpeg-only sharpen', () => {
  assert(R.LIST.length >= 8);
  R.LIST.forEach(p => { const v = R.apply(p.key, 1);
    assert(v.brightness >= 0.4 && v.brightness <= 1.6 && v.contrast >= 0.4 && v.contrast <= 1.6 && v.saturate >= 0 && v.saturate <= 2, p.key);
    assert(v.warmth >= -1 && v.warmth <= 1 && v.vignette >= 0 && v.vignette <= 1 && v.matte >= 0 && v.matte <= 1, p.key); assert.strictEqual(v.sharpen, 0, p.key); });
});

// ---------- the test project: three touching picture clips with sound ----------
function make() {
  const v = [], s = [];
  ['A', 'B', 'C'].forEach((k, i) => {
    v.push({ id: 'v' + k, type: 'video', asset: 'movie', start: i * 4000, dur: 4000, in: 10000 + i * 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'l' + k });
    s.push({ id: 's' + k, type: 'audio', asset: 'movie', start: i * 4000, dur: 4000, in: 10000 + i * 10000, speed: 1, volume: 1, gain: [[0, 1], [4000, 1]], fadeIn: 0, fadeOut: 0, link: 'l' + k });
  });
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [
      { id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: v },
      { id: 't-moviesound', kind: 'audio', role: 'movieSound', muted: false, hidden: false, volume: 1, locked: false, clips: s },
      { id: 't-voice', kind: 'audio', role: 'voice', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vo', type: 'audio', asset: 'voice', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
}
const base = make();

// ---------- transitions ----------
ok('transition: set on the clip after the cut, changed, limited to 0.2 - 2 s, and removed', () => {
  const a = P.setTransition(base, 'vB', { type: 'fade' });
  assert.deepStrictEqual(P.findClip(a, 'vB').clip.transition, { type: 'fade', durMs: 600 }); assert.strictEqual(base.tracks[0].clips[1].transition, undefined);
  assert.strictEqual(P.findClip(P.setTransition(a, 'vB', { durMs: 9000 }), 'vB').clip.transition.durMs, 2000);
  assert.strictEqual(P.findClip(P.setTransition(a, 'vB', { durMs: 10 }), 'vB').clip.transition.durMs, 200);
  assert.strictEqual(P.findClip(P.setTransition(a, 'vB', { type: 'slideleft' }), 'vB').clip.transition.type, 'slideleft');
  assert.strictEqual(P.setTransition(a, 'vB', { type: 'fade' }), a, 'same setting: the same project comes back');
  assert.strictEqual(P.setTransition(a, 'vB', { type: 'sparkle' }), a, 'an unknown kind is ignored');
  assert.strictEqual(P.findClip(P.setTransition(a, 'vB', { type: 'none' }), 'vB').clip.transition, undefined);
  assert.strictEqual(P.setTransition(base, 'vB', { type: 'none' }), base);
  assert.strictEqual(P.setTransition(base, 'sB', { type: 'fade' }), base, 'sound clips have none');
  assert.strictEqual(P.setTransition(base, 'nope', { type: 'fade' }), base);
});
ok('transition: only counts where two clips touch, and never gives away more than a clip has', () => {
  let p = P.setTransition(P.setTransition(base, 'vB', { type: 'fade', durMs: 1000 }), 'vC', { type: 'wipeleft', durMs: 800 });
  assert.deepStrictEqual(P.transitionList(p).map(x => [x.at, x.durMs, x.type, x.aId, x.bId]), [[4000, 1000, 'fade', 'vA', 'vB'], [8000, 800, 'wipeleft', 'vB', 'vC']]);
  assert.deepStrictEqual(P.transitionList(P.deleteClip(p, 'vA')).map(x => x.bId), ['vC'], 'a clip with nothing before it has no transition');
  const gap = P.deleteClip(p, 'vB'); assert.deepStrictEqual(P.transitionList(gap), [], 'a gap means a hard cut');
  const rev = JSON.parse(JSON.stringify(p)); rev.tracks[0].clips[0].reverse = true; assert.deepStrictEqual(P.transitionList(rev).map(x => x.bId), ['vC'], 'a reversed neighbour: hard cut');
  const big = P.setTransition(P.setTransition(base, 'vB', { type: 'fade', durMs: 2000 }), 'vC', { type: 'fade', durMs: 2000 });
  const sm = JSON.parse(JSON.stringify(big)); sm.tracks[0].clips[1].dur = 1000; sm.tracks[0].clips[2].start = 5000; sm.tracks[0].clips[2].dur = 1000;
  const l = P.transitionList(sm); assert(l.length === 2 && (l[0].durMs + l[1].durMs) / 2 <= 900, JSON.stringify(l));
  assert.strictEqual(P.transitionList(P.setTransition(sm, 'vB', { type: 'fade', durMs: 200 })).length, 2);
});
ok('transition: a piece cut off a clip does not inherit its transition, and the preview finds the right moment', () => {
  const p = P.setTransition(base, 'vB', { type: 'fade', durMs: 1000 }), s = P.splitAt(p, 6000);
  assert(P.findClip(s, 'vB').clip.transition, 'the first piece keeps it'); assert.strictEqual(s.tracks[0].clips[2].transition, undefined, 'the second piece does not');
  assert.strictEqual(P.transitionAt(p, 3400), null); assert.strictEqual(P.transitionAt(p, 4600), null);
  const t = P.transitionAt(p, 4000); assert.strictEqual(t.type, 'fade'); assert.strictEqual(t.p, 0.5); assert.strictEqual(t.before, false);
  const e = P.transitionAt(p, 3500); assert(e.before && e.p === 0, JSON.stringify(e));
  assert.strictEqual(e.aMs, 10000 + 3500, 'the picture before the cut is shown from where it is'); assert.strictEqual(e.bMs, 20000 - 500, 'the next one from half a transition earlier in the movie');
  assert.strictEqual(P.transitionAt(P.deleteClip(p, 'vA'), 4000), null);
});

// ---------- stickers ----------
ok('stickers: added at the playhead, overlapping ones get their own rows, and an empty row goes away', () => {
  const o1 = {}, o2 = {}, o3 = {};
  let p = P.addSticker(base, 1000, 3000, '🔥', o1); assert.deepStrictEqual(P.validate(p), []);
  const c = P.findClip(p, o1.id).clip; assert.strictEqual(c.glyph, '🔥'); assert.strictEqual(c.start, 1000); assert.strictEqual(c.dur, 3000); assert.strictEqual(c.sticker, true); assert.strictEqual(P.findClip(p, o1.id).track.kind, 'sticker');
  p = P.addSticker(p, 2000, 3000, '♥', o2); assert.strictEqual(p.tracks.filter(t => t.kind === 'sticker').length, 2, 'overlapping in time: a second row');
  p = P.addSticker(p, 5000, 2000, '★', o3); assert.strictEqual(p.tracks.filter(t => t.kind === 'sticker').length, 2, 'fits on the first row');
  assert.strictEqual(P.stickersAt(p, 2500).length, 2); assert.strictEqual(P.stickersAt(p, 5500).length, 1); assert.strictEqual(P.stickersAt(p, 100).length, 0);
  assert.strictEqual(P.textsAt(p, 2500).length, 0, 'stickers are not titles');
  const del = P.deleteClip(P.deleteClip(p, o2.id), o1.id); assert.strictEqual(del.tracks.filter(t => t.kind === 'sticker').length, 1, 'the empty row is gone');
  const late = P.addSticker(base, 11900, 3000, '⭐', {}).tracks[3].clips[0]; assert.deepStrictEqual([late.start, late.dur], [11700, 300], 'at the very end it is pulled back so it still shows for a moment');
  assert.strictEqual(P.addSticker(base, 11500, 3000, '⭐', {}).tracks[3].clips[0].dur, 500, 'it is cut to fit the video');
});
ok('stickers: position, size and turn stay within range; the rest of the project is untouched', () => {
  const o = {}, p = P.addSticker(base, 0, 2000, '✔', o);
  const q = P.setStickerProps(p, o.id, { x: 5, y: -2, size: 5, rot: 190, color: '#FF0000', glyph: '♪' }), c = P.findClip(q, o.id).clip;
  assert.deepStrictEqual([c.x, c.y, c.size, c.rot, c.color, c.glyph], [1, 0, 0.9, -170, '#ff0000', '♪']);
  assert.strictEqual(P.findClip(P.setStickerProps(p, o.id, { size: 0 }), o.id).clip.size, 0.2, 'zero size falls back to the default');
  assert.strictEqual(P.setStickerProps(p, o.id, {}), p, 'nothing changes: the same project');
  assert.strictEqual(P.setStickerProps(p, 'vA', { x: 0.1 }), p, 'only stickers');
  assert.strictEqual(JSON.stringify(q.tracks.slice(0, 3)), JSON.stringify(base.tracks), 'picture, sound and voice are untouched');
  const sp = P.splitAt(p, 1000); assert.strictEqual(sp.tracks.find(t => t.kind === 'sticker').clips.length, 2, 'a sticker splits like any clip');
  const fz = P.insertFreeze(p, 1000, 3000); assert.strictEqual(P.findClip(fz, o.id).clip.dur, 5000, 'a held picture keeps the sticker on');
});
ok('stickers: drawn centred at their place, at their size and turn, symbols in their colour', () => {
  const calls = []; const g = { save() { calls.push('save'); }, restore() { calls.push('restore'); }, translate(...a) { calls.push(['translate', ...a]); }, rotate(a) { calls.push(['rotate', a]); },
    fillText(...a) { calls.push(['fillText', ...a, this.fillStyle]); }, set font(v) { calls.push(['font', v]); } };
  S.drawSticker(g, { glyph: '★', color: '#ff0000', x: 0.25, y: 0.5, size: 0.2, rot: 90 }, 720, 1280);
  assert.deepStrictEqual(calls.find(c => c[0] === 'translate'), ['translate', 180, 640]); assert(Math.abs(calls.find(c => c[0] === 'rotate')[1] - Math.PI / 2) < 1e-9);
  assert(calls.find(c => c[0] === 'font')[1].startsWith('256px ')); assert.deepStrictEqual(calls.find(c => c[0] === 'fillText').slice(0, 4), ['fillText', '★', 0, 0]); assert.strictEqual(calls.find(c => c[0] === 'fillText')[4], '#ff0000');
  calls.length = 0; S.drawSticker(g, { glyph: '🔥', color: '#ff0000' }, 100, 100); assert.strictEqual(calls.find(c => c[0] === 'fillText')[4], '#ffffff', 'emoji ignore the colour');
  calls.length = 0; S.drawSticker(g, { glyph: '' }, 100, 100); assert.strictEqual(calls.length, 0);
});

// ---------- the export plan ----------
ok('plan: the transition goes on the picture after the cut, and stickers travel with the plan', () => {
  const o = {}; let p = P.setTransition(base, 'vB', { type: 'fadeblack', durMs: 800 }); p = P.addSticker(p, 500, 2000, '🔥', o);
  const plan = NP.projectToPlan(p);
  assert.deepStrictEqual(plan.video.map(s => s.transitionIn || null), [null, { type: 'fadeblack', durMs: 800 }, null]);
  assert.deepStrictEqual(plan.stickers, [{ startMs: 500, durMs: 2000, glyph: '🔥', color: '#ffffff', x: 0.5, y: 0.5, size: 0.2, rot: 0 }]);
  assert.strictEqual(NP.projectToPlan(base).stickers, undefined); assert.strictEqual(NP.projectToPlan(base).video[1].transitionIn, undefined);
  assert.strictEqual(NP.projectToPlan(P.deleteClip(p, 'vA')).video.some(s => s.transitionIn), false, 'a hard cut has none');
});
ok('engine choice: a project with a transition goes to the ffmpeg engine; stickers do not force it', () => {
  const plan = (v) => ({ durationMs: 10000, video: v, audio: [] }), play = { type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0 };
  assert.strictEqual(WebCodecsExport.canRender(plan([play])), true);
  assert.strictEqual(WebCodecsExport.canRender(Object.assign(plan([play]), { stickers: [{ startMs: 0, durMs: 1000, glyph: '★' }] })), true);
  assert.strictEqual(WebCodecsExport.canRender(plan([play, Object.assign({}, play, { sessionStart: 4000, sessionEnd: 8000, transitionIn: { type: 'fade', durMs: 500 } })])), false);
});

// ---------- the ffmpeg engine ----------
const info = { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 6 };
const mkPlan = (extra, spanB) => Object.assign({ naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 6000 },
  video: [{ type: 'play', sessionStart: 0, sessionEnd: 2000, movieStart: 0 }, Object.assign({ type: 'play', sessionStart: 2000, sessionEnd: 4000, movieStart: 4000 }, spanB || {})], audio: [] }, extra || {});
const T = (type, d) => ({ transitionIn: { type, durMs: d || 1000 } });
ok('ffmpeg engine: no transitions means no transition pieces; with one the neighbours give up half each', () => {
  const a = E.planToJobs(mkPlan(), info, { height: 360 }), b = E.planToJobs(mkPlan(null, T('fade')), info, { height: 360 });
  assert.deepStrictEqual(a.videoList, ['v0000.ts', 'v0001.ts']); assert(!a.jobs.some(j => /transition/.test(j.label)));
  assert.deepStrictEqual(b.videoList, ['v0000.ts', 't0001.ts', 'v0001.ts']);
  const frames = (r, f) => { const j = r.jobs.find(x => x.produces === f); return +j.args[j.args.indexOf('-frames:v') + 1]; };
  assert.strictEqual(frames(b, 'v0000.ts'), 45); assert.strictEqual(frames(b, 'v0001.ts'), 45); assert.strictEqual(frames(b, 't0001.ts'), 30);
  assert.strictEqual(45 + 30 + 45, frames(a, 'v0000.ts') + frames(a, 'v0001.ts'), 'the video is exactly as long as before');
  const x = b.jobs.find(j => j.produces === 't0001.ts').args.join(' '); assert(x.includes('xfade=transition=fade:duration=1.000:offset=0'), x);
  const sA = b.jobs.find(j => j.produces === 'ta0001.ts').args, sB = b.jobs.find(j => j.produces === 'tb0001.ts').args;
  assert.strictEqual(sA[sA.indexOf('-ss') + 1], '1.500', 'the picture before the cut carries on from where it was'); assert.strictEqual(sB[sB.indexOf('-ss') + 1], '3.500', 'the next one starts half a transition early');
  const v1 = b.jobs.find(j => j.produces === 'v0001.ts').args; assert.strictEqual(v1[v1.indexOf('-ss') + 1], '4.500', 'and its own part starts after the transition');
  const early = E.planToJobs(mkPlan(null, Object.assign({ movieStart: 200 }, T('fade'))), info, { height: 360 }), tb = early.jobs.find(j => j.produces === 'tb0001.ts').args.join(' ');
  assert(tb.includes('tpad=start_mode=clone:start_duration=0.300'), 'no movie before the start: the first picture is held: ' + tb);
});
ok('ffmpeg engine: stickers become pictures laid over the video, under the titles', () => {
  const r = E.planToJobs(mkPlan({ stickers: [{ startMs: 500, durMs: 1000, glyph: '★', x: 0.5, y: 0.5, size: 0.2, rot: 0 }], texts: [{ startMs: 0, durMs: 4000, text: 'Hi' }] }), info, { height: 360 });
  assert.deepStrictEqual(r.textFiles.map(t => t.name + (t.sticker ? '*' : '')), ['stk000.png*', 'txt000.png']);
  const a = r.jobs.find(j => j.produces === 'v0000.ts').args, g = a[a.indexOf('-filter_complex') + 1]; assert(g.indexOf('stk000.png') < 0 && a.indexOf('stk000.png') > 0 && a.indexOf('stk000.png') < a.indexOf('txt000.png'), a.join(' '));
  assert(g.includes("enable='between(t,0.500,1.500)'"), g);
  const b = r.jobs.find(j => j.produces === 'v0001.ts').args; assert(b.indexOf('stk000.png') < 0, 'a sticker only goes on the parts it shows in');
});
// ---- real ffmpeg, only when this computer has a recent one ----
function ffmpegOk() { const r = cp.spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }); const m = r.status === 0 && /version\s+n?(\d+)/.exec(r.stdout); return !!m && +m[1] >= 5; }
if (ffmpegOk()) {
  const render = (plan, opts) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-fx-')), sh = (a) => cp.spawnSync('ffmpeg', ['-y', '-v', 'error'].concat(a), { cwd: dir, encoding: 'utf8' });
    let r = sh(['-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=30:d=3', '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:r=30:d=3', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p', '-t', '6', 'm.mp4']); assert.strictEqual(r.status, 0, r.stderr);
    fs.renameSync(path.join(dir, 'm.mp4'), path.join(dir, 'movie.in'));
    const built = E.planToJobs(plan, info, Object.assign({ height: 360 }, opts || {}));
    built.textFiles.forEach(t => { const x = sh(['-f', 'lavfi', '-i', 'color=c=0x00ff00:s=' + t.width + 'x' + t.height, '-vf', 'format=rgba', '-frames:v', '1', t.name]); assert.strictEqual(x.status, 0, x.stderr); });
    built.jobs.forEach(j => { const x = sh(j.args); assert.strictEqual(x.status, 0, j.label + ': ' + x.stderr); });
    fs.writeFileSync(path.join(dir, 'video.txt'), built.videoList.map(f => "file '" + f + "'\n").join(''));
    r = sh(E.finalMixArgs([], plan.durationMs)); assert.strictEqual(r.status, 0, r.stderr);
    const px = (t, fx, fy) => { const o = cp.spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', path.join(dir, 'out.mp4'), '-frames:v', '1', '-vf', 'crop=1:1:' + Math.round(fx * built.width) + ':' + Math.round(fy * built.height) + ',format=rgb24', '-f', 'rawvideo', '-'], { encoding: null }); return Array.from(o.stdout); };
    const frames = +cp.spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path.join(dir, 'out.mp4')], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
    return { px, frames, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
  };
  ok('real ffmpeg: a fade really mixes the two pictures, and the video keeps its exact length', () => {
    const r = render(mkPlan(null, T('fade')));
    try {
      assert.strictEqual(r.frames, 120, 'frames');
      const a = r.px(0.5, 0.5, 0.5), mid = r.px(2.0, 0.5, 0.5), b = r.px(3.5, 0.5, 0.5);
      assert(a[0] > 180 && a[2] < 70, 'red before: ' + a); assert(b[2] > 180 && b[0] < 70, 'blue after: ' + b);
      assert(mid[0] > 70 && mid[0] < 190 && mid[2] > 70 && mid[2] < 190, 'a mix in the middle: ' + mid);
    } finally { r.done(); }
  });
  ok('real ffmpeg: dip to black goes dark in the middle; a wipe shows both pictures side by side', () => {
    let r = render(mkPlan(null, T('fadeblack')));
    try { assert.strictEqual(r.frames, 120); const mid = r.px(2.0, 0.5, 0.5); assert(Math.max(mid[0], mid[1], mid[2]) < 110, 'dark: ' + mid); } finally { r.done(); }
    r = render(mkPlan(null, T('wipeleft')));
    try { assert.strictEqual(r.frames, 120); const l = r.px(2.0, 0.2, 0.5), rt = r.px(2.0, 0.8, 0.5); assert(l[0] > 150 && l[2] < 100, 'left is still red: ' + l); assert(rt[2] > 150 && rt[0] < 100, 'right is already blue: ' + rt); } finally { r.done(); }
  });
  ok('real ffmpeg: every kind of transition renders, with a sticker and a title on top', () => {
    ['fade', 'fadeblack', 'wipeleft', 'slideleft', 'zoomin', 'circleopen'].forEach(type => {
      const r = render(mkPlan({ stickers: [{ startMs: 2600, durMs: 800, glyph: '★', x: 0.5, y: 0.5, size: 0.2, rot: 0 }], texts: [{ startMs: 0, durMs: 4000, text: 'Hi' }] }, T(type, 800)), { vertical: true });
      try { assert.strictEqual(r.frames, 120, type); const s = r.px(3.0, 0.5, 0.5); assert(s[1] > 200 && s[0] < 60, type + ' sticker on top: ' + s); } finally { r.done(); }
    });
  });
  ok('real ffmpeg: a transition between two frozen pictures, and next to a blurred background', () => {
    const plan = { naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 6000 }, audio: [], video: [
      { type: 'freeze', sessionStart: 0, sessionEnd: 2000, movieAt: 1000 }, { type: 'freeze', sessionStart: 2000, sessionEnd: 4000, movieAt: 4500, transitionIn: { type: 'fade', durMs: 600 } }] };
    let r = render(plan); try { assert.strictEqual(r.frames, 120); const mid = r.px(2.0, 0.5, 0.5); assert(mid[0] > 60 && mid[2] > 60, 'frozen mix: ' + mid); } finally { r.done(); }
    r = render(mkPlan(null, T('fade', 600)), { ratio: '9:16', bg: { type: 'blur' } }); try { assert.strictEqual(r.frames, 120); } finally { r.done(); }
  });
} else console.log('  --  real-file checks skipped (need ffmpeg 5 or newer on this computer)');
console.log('\n' + n + ' checks passed');
