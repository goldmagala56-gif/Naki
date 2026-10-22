'use strict';
// node tests/look2.test.js
// Text templates, the extra Adjust sliders (highlights, shadows, tint, hue, grain) and the video effects (shake, glitch, blur, flash, RGB split, film grain).
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const L = require('../www/look2.js'), T = require('../www/templates.js'), M = require('../www/motion.js'), P = require('../www/project.js'), NP = require('../www/plan.js'), E = require('../www/export-engine.js');
const { WebCodecsExport } = require('../www/webcodecs-export.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' }] }] };

ok('templates: ten looks, each made only of settings a text really has, so applying one gives exactly that look', () => {
  assert.strictEqual(T.LIST.length, 10);
  T.LIST.forEach(tp => {
    const out = {}; let p = P.addTextClip(base, 1000, 3000, out); p = P.setTextProps(p, out.id, Object.assign({ text: tp.text }, tp.style)); p = P.setTextAnim(p, out.id, tp.anim);
    const c = P.findClip(p, out.id).clip;
    assert.strictEqual(c.text, tp.text); assert.strictEqual(c.size, tp.style.size, tp.key + ' size'); assert.strictEqual(c.color, tp.style.color); assert.strictEqual(c.pos, tp.style.pos); assert.strictEqual(!!c.bg, tp.style.bg);
    assert.strictEqual(c.font || 'sans', tp.style.font, tp.key + ' font'); assert.strictEqual(c.outline || 0, tp.style.outline, tp.key + ' outline'); assert.strictEqual(c.shadow == null ? 1 : c.shadow, tp.style.shadow, tp.key + ' shadow');
    assert(c.anim, tp.key + ' animates'); assert.strictEqual(c.anim.in, tp.anim.in, tp.key + ' in'); assert.strictEqual(c.anim.out, tp.anim.out, tp.key + ' out'); assert.strictEqual(c.anim.loop || 'none', tp.anim.loop, tp.key + ' loop');
    assert(M.has(M.TEXT_IN, tp.anim.in) && M.has(M.TEXT_OUT, tp.anim.out) && M.has(M.TEXT_LOOP, tp.anim.loop), tp.key + ' uses names the animation library knows');
  });
  assert.strictEqual(T.find('neon').anim.loop, 'pulse'); assert.strictEqual(T.find('nope'), null);
});
ok('adjust: highlights, shadows, tint, hue and grain are kept within range, and a zero is not stored', () => {
  const a = P.setFilter(base, 'vA', { hue: 0.5, shadows: 0.4, grain: 3, tint: -9 }), f = P.findClip(a, 'vA').clip.filter;
  assert.deepStrictEqual([f.hue, f.shadows, f.grain, f.tint], [0.5, 0.4, 1, -1]); assert.strictEqual(f.highlights, undefined);
  assert.strictEqual(P.findClip(P.setFilter(a, 'vA', { hue: 0, shadows: 0, grain: 0, tint: 0 }), 'vA').clip.filter, undefined, 'all back to normal removes the filter');
  const h = P.setFilter(base, 'vA', { highlights: -0.3 }); assert.strictEqual(P.findClip(h, 'vA').clip.filter.highlights, -0.3, 'one alone is not lost');
  assert.strictEqual(P.findClip(P.setFilter(a, 'vA', { warmth: 0.2 }), 'vA').clip.filter.hue, 0.5, 'and does not disturb the older ones');
  const plan = NP.projectToPlan(a).video[0].filter; assert.deepStrictEqual([plan.hue, plan.shadows, plan.grain, plan.tint], [0.5, 0.4, 1, -1], 'the plan carries them');
  assert.strictEqual(L.hasExtras(plan), true); assert.strictEqual(L.hasExtras({ brightness: 1, warmth: 0.3 }), false); assert.strictEqual(L.hasExtras(null), false);
  assert.strictEqual(WebCodecsExport.canRender({ durationMs: 1000, video: [{ type: 'play', filter: plan }], audio: [] }), false, 'the fast engine leaves them to ffmpeg');
});
ok('effects: an effect at the playhead with a strength; overlapping ones get their own row; an empty row goes away; the plan lists them', () => {
  const o1 = {}, o2 = {}; let p = P.addFx(base, 1000, 'shake', o1); assert.deepStrictEqual(P.validate(p), []);
  const c = P.findClip(p, o1.id).clip, tr = P.findClip(p, o1.id).track; assert.deepStrictEqual([c.fx, c.start, c.dur, c.strength, tr.kind, tr.role], ['shake', 1000, 2000, 0.5, 'fx', 'fx']);
  assert.strictEqual(P.addFx(base, 1000, 'flash', {}).tracks.find(t => t.kind === 'fx').clips[0].dur, 500, 'a flash is short'); assert.strictEqual(P.addFx(base, 0, 'nope', {}), base);
  p = P.addFx(p, 2000, 'blur', o2); assert.strictEqual(p.tracks.filter(t => t.kind === 'fx').length, 2, 'overlapping in time: a second row');
  assert.deepStrictEqual(P.fxAt(p, 2500).map(x => x.fx).sort(), ['blur', 'shake']); assert.strictEqual(P.fxAt(p, 100).length, 0);
  const s = P.setFxProps(p, o1.id, { strength: 9, fx: 'glitch' }), sc = P.findClip(s, o1.id).clip; assert.deepStrictEqual([sc.fx, sc.strength], ['glitch', 1]); assert.strictEqual(P.setFxProps(p, o1.id, {}), p); assert.strictEqual(P.setFxProps(p, 'vA', { strength: 1 }), p);
  assert.strictEqual(P.setTextAnim(p, o1.id, { in: 'fade' }), p, 'an effect is not a title');
  const del = P.deleteClip(P.deleteClip(p, o2.id), o1.id); assert.strictEqual(del.tracks.filter(t => t.kind === 'fx').length, 0, 'the empty row is gone');
  const ids = P.addFx(del, 0, 'blur', {}).tracks.map(t => t.id); assert.strictEqual(new Set(ids).size, ids.length);
  const plan = NP.projectToPlan(p); assert.deepStrictEqual(plan.fx.map(x => [x.startMs, x.durMs, x.fx, x.strength]), [[1000, 2000, 'shake', 0.5], [2000, 2000, 'blur', 0.5]]); assert.strictEqual(NP.projectToPlan(base).fx, undefined);
  assert.strictEqual(WebCodecsExport.canRender(plan), false, 'effects are made by the ffmpeg engine');
  const fz = P.insertFreeze(p, 1500, 1000); assert.strictEqual(P.findClip(fz, o1.id).clip.dur, 3000, 'a held picture keeps the effect on');
  assert.strictEqual(P.splitAt(p, 1500).tracks.find(t => t.kind === 'fx').clips.length >= 2, true, 'an effect splits like any clip');
});

const info0 = { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 6 };
const plan0 = (extra, spanA) => Object.assign({ naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 6000 }, audio: [],
  video: [Object.assign({ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0 }, spanA || {})] }, extra || {});
const argsFor = (r, f) => r.jobs.find(j => j.produces === f).args, graph = (a) => a[a.indexOf('-filter_complex') + 1];
ok('ffmpeg engine: effects and the extra Adjust sliders become filters, only where they apply', () => {
  const fx = [{ startMs: 1000, durMs: 1000, fx: 'blur', strength: 0.5 }, { startMs: 1500, durMs: 1000, fx: 'shake', strength: 1 }, { startMs: 3000, durMs: 500, fx: 'flash', strength: 1 }];
  const r = E.planToJobs(plan0({ fx }), info0, { height: 360 }), g = graph(argsFor(r, 'v0000.ts'));
  assert(g.includes("gblur=sigma=11:enable='between(t,1.000,2.000)'") && g.includes('split[') && g.includes("overlay=enable='between(t,1.500,2.500)'") && g.includes("eq=brightness='1*max(0,1-(t-3.000)/0.350)':eval=frame"), g);
  const none = E.planToJobs(plan0(), info0, { height: 360 }); assert(argsFor(none, 'v0000.ts').indexOf('-filter_complex') < 0, 'no effect: the plain command');
  const adj = E.planToJobs(plan0(null, { filter: { brightness: 1, contrast: 1, saturate: 1, hue: 0.5, shadows: 0.5, grain: 0.4, tint: 0.3 } }), info0, { height: 360 }), ga = graph(argsFor(adj, 'v0000.ts'));
  assert(ga.includes('hue=h=90,colorbalance=gm=-0.09:gh=-0.045,curves=all=\'0/0 0.25/0.34 0.75/0.75 1/1\',noise=alls=14:allf=t'), ga);
});
ok('ffmpeg engine: an effect and an animated title can share one picture', () => {
  const r = E.planToJobs(plan0({ fx: [{ startMs: 1000, durMs: 1000, fx: 'blur', strength: 0.5 }], texts: [{ startMs: 500, durMs: 2000, text: 'Hi', size: 7, pos: 'bottom', anim: { in: 'fade', out: 'fade' } }] }), info0, { height: 360 });
  const a = argsFor(r, 'v0000.ts'); assert(graph(a).includes('gblur=') && a.some(x => /^txt000_\d\d\.png$/.test(x)), a.join(' '));
});

function ffmpegOk() { const r = cp.spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }); const m = r.status === 0 && /version\s+n?(\d+)/.exec(r.stdout); return !!m && +m[1] >= 5; }
if (ffmpegOk()) {
  const render = (plan, opts, grey) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-look2-')), sh = (a) => cp.spawnSync('ffmpeg', ['-y', '-v', 'error'].concat(a), { cwd: dir, encoding: 'utf8' });
    let r = grey ? sh(['-f', 'lavfi', '-i', 'color=c=' + grey + ':s=640x360:r=30:d=6', '-pix_fmt', 'yuv420p', '-t', '6', 'm.mp4']) : sh(['-f', 'lavfi', '-i', 'color=c=red:s=320x360:r=30:d=6', '-f', 'lavfi', '-i', 'color=c=blue:s=320x360:r=30:d=6', '-filter_complex', '[0:v][1:v]hstack,format=yuv420p', '-t', '6', 'm.mp4']); assert.strictEqual(r.status, 0, r.stderr);
    fs.renameSync(path.join(dir, 'm.mp4'), path.join(dir, 'movie.in'));
    const built = E.planToJobs(plan, info0, Object.assign({ height: 360 }, opts || {}));
    built.jobs.forEach(j => { const x = sh(j.args); assert.strictEqual(x.status, 0, j.label + ': ' + x.stderr); });
    fs.writeFileSync(path.join(dir, 'video.txt'), built.videoList.map(f => "file '" + f + "'\n").join(''));
    r = sh(E.finalMixArgs([], plan.durationMs)); assert.strictEqual(r.status, 0, r.stderr);
    const frame = (t) => { const o = cp.spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', path.join(dir, 'out.mp4'), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: null }); return { w: built.width, h: built.height, d: o.stdout }; };
    const px = (t, fx, fy) => { const f = frame(t), i = (Math.round(fy * f.h) * f.w + Math.round(fx * f.w)) * 3; return [f.d[i], f.d[i + 1], f.d[i + 2]]; };
    const same = (t1, t2) => { const a = frame(t1).d, b = frame(t2).d; let d = 0; for (let i = 0; i < a.length; i += 7) d += Math.abs(a[i] - b[i]); return d; };
    const frames = +cp.spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path.join(dir, 'out.mp4')], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
    return { px, same, frames, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
  };
  ok('real ffmpeg: hue turns red toward green; shadows lift and sink a dark grey', () => {
    const f = (o) => Object.assign({ brightness: 1, contrast: 1, saturate: 1 }, o);
    const a = render(plan0()), b = render(plan0(null, { filter: f({ hue: 0.667 }) }));
    try { const r0 = a.px(1, 0.25, 0.5), r1 = b.px(1, 0.25, 0.5); assert(r0[0] > 180 && r0[1] < 80, 'red: ' + r0); assert(r1[1] > r1[0] + 40, 'red became ' + r1); } finally { a.done(); b.done(); }
    const m = render(plan0(null, { filter: f({}) }), null, '#404040'), l = render(plan0(null, { filter: f({ shadows: 1 }) }), null, '#404040'), d = render(plan0(null, { filter: f({ shadows: -1 }) }), null, '#404040');
    try { const x = m.px(1, 0.5, 0.5)[0], y = l.px(1, 0.5, 0.5)[0], z = d.px(1, 0.5, 0.5)[0]; assert(y > x + 20 && z < x - 8, z + ' < ' + x + ' < ' + y); } finally { m.done(); l.done(); d.done(); }
  });
  ok('real ffmpeg: every effect renders, only inside its time, and the video keeps its length', () => {
    ['blur', 'flash', 'rgbsplit', 'shake', 'grain', 'glitch'].forEach(fx => {
      const r = render(plan0({ fx: [{ startMs: 1000, durMs: 1000, fx, strength: 1 }] }));
      try { assert.strictEqual(r.frames, 120, fx); assert(r.same(0.2, 0.7) === 0 && r.same(2.5, 3.0) === 0, fx + ' leaves the rest of the video alone'); } finally { r.done(); }
    });
    const r = render(plan0({ fx: [{ startMs: 1000, durMs: 1000, fx: 'shake', strength: 1 }, { startMs: 1500, durMs: 1000, fx: 'blur', strength: 1 }] }), { ratio: '9:16', bg: { type: 'blur' } });
    try { assert.strictEqual(r.frames, 120, 'two effects at once, in another shape'); } finally { r.done(); }
  });
} else console.log('  --  real-file checks skipped (need ffmpeg 5 or newer on this computer)');
console.log('\n' + n + ' checks passed');
