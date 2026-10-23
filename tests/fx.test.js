'use strict';
// node tests/fx.test.js
// Blend modes, shape masks and chroma key on overlays: the maths, the project edits, the export plan, and what the ffmpeg engine builds and renders.
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const F = require('../www/fx.js'), P = require('../www/project.js'), NP = require('../www/plan.js'), E = require('../www/export-engine.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

// ---------- blend modes ----------
ok('blend modes: fifteen, each with a name for the preview, the fast engine and ffmpeg; normal is not stored', () => {
  assert.strictEqual(F.BLEND.length, 15); assert.strictEqual(F.BLEND[0].key, 'normal');
  F.BLEND.slice(1).forEach(b => { assert(b.label && b.css && b.canvas && b.ff && b.fmt, b.key); assert.strictEqual(F.cleanBlend(b.key), b.key); assert.strictEqual(F.ffBlend(b.key), b.ff); assert.strictEqual(F.ffBlendFormat(b.key), b.fmt); });
  assert.strictEqual(F.cleanBlend('normal'), null); assert.strictEqual(F.cleanBlend('sparkle'), null); assert.strictEqual(F.ffBlend('normal'), null); assert.strictEqual(F.cssBlend('add'), 'plus-lighter');
  assert.strictEqual(F.ffBlend('multiply'), "all_expr='A*B/255'"); assert.strictEqual(F.ffBlendFormat('multiply'), 'gbrp');
  assert.strictEqual(F.ffBlend('color'), 'c0_expr=A:c1_expr=B:c2_expr=B'); assert.strictEqual(F.ffBlendFormat('luminosity'), 'yuv444p');
});

// ---------- masks ----------
ok('masks: seven shapes, tidied with limits and defaults; "none" and nonsense are not stored; invert only when on', () => {
  assert.deepStrictEqual(F.MASKS.map(m => m.key), ['none', 'line', 'mirror', 'circle', 'rect', 'heart', 'star', 'diamond']);
  assert.strictEqual(F.cleanMask(null), null); assert.strictEqual(F.cleanMask({ shape: 'none' }), null); assert.strictEqual(F.cleanMask({ shape: 'hexagon' }), null);
  assert.deepStrictEqual(F.cleanMask({ shape: 'star' }), { shape: 'star', x: 0.5, y: 0.5, w: 0.6, h: 0.6, rot: 0, feather: 0, corner: 0 });
  assert.deepStrictEqual(F.cleanMask({ shape: 'rect', corner: 9, x: -3, w: 50, feather: 2, rot: 190, invert: true }), { shape: 'rect', x: 0, y: 0.5, w: 2, h: 0.6, rot: -170, feather: 1, corner: 1, invert: true });
  assert.strictEqual(F.cleanMask({ shape: 'circle', corner: 0.7 }).corner, 0, 'only a rectangle has round corners'); assert.strictEqual(F.cleanMask({ shape: 'mirror' }).h, 0.4);
});
ok('masks: projects made before (rounded, ellipse) keep working', () => {
  assert.deepStrictEqual(F.cleanMask({ shape: 'rounded', amount: 0.4 }), F.cleanMask({ shape: 'rect', corner: 0.4 })); assert.strictEqual(F.cleanMask({ shape: 'ellipse', amount: 0 }).shape, 'circle');
});
ok('masks: each shape shows its middle and not the far corner, and Invert, Feather, Turn and Position do what they say', () => {
  const W = 200, H = 120, a = (m, x, y) => F.maskAlpha(F.cleanMask(m), x, y, W, H);
  ['circle', 'rect', 'heart', 'star', 'diamond'].forEach(s => { assert(a({ shape: s }, 100, 62) > 0.99, s + ' middle'); assert(a({ shape: s }, 2, 2) < 0.01, s + ' corner'); assert(a({ shape: s, invert: true }, 100, 62) < 0.01, s + ' inverted'); });
  assert(a({ shape: 'line' }, 100, 20) > 0.99 && a({ shape: 'line' }, 100, 100) < 0.01, 'a line shows the top side'); assert(a({ shape: 'line', rot: 180 }, 100, 100) > 0.99, 'turned, it shows the other side');
  assert(a({ shape: 'mirror' }, 100, 60) > 0.99 && a({ shape: 'mirror' }, 100, 5) < 0.01 && a({ shape: 'mirror' }, 100, 115) < 0.01, 'a band across the middle');
  assert(a({ shape: 'circle', x: 0.25 }, 50, 60) > 0.99 && a({ shape: 'circle', x: 0.25 }, 150, 60) < 0.01, 'moved to the left');
  assert(a({ shape: 'circle', feather: 0 }, 163, 60) < 0.01 && a({ shape: 'circle', feather: 1 }, 163, 60) > 0.05, 'just outside the edge: sharp is hidden, feathered is still partly there');
  assert(a({ shape: 'rect', w: 1, h: 1, corner: 0 }, 1, 1) > 0.5 && a({ shape: 'rect', w: 1, h: 1, corner: 1 }, 1, 1) < 0.01, 'round corners cut the corner of a rectangle');
  const up = a({ shape: 'star' }, 100, 60 - 0.9 * 36 + 2); assert(up > 0, 'the star points up');
});
ok('masks: the ffmpeg expression has no alpha of its own (the engine multiplies it), and is made for every shape', () => {
  assert.strictEqual(F.maskAlphaExpr(null), null);
  ['line', 'mirror', 'circle', 'rect', 'heart', 'star', 'diamond'].forEach(s => { const e = F.maskAlphaExpr({ shape: s, rot: 20, feather: 0.3, invert: true }); assert(e.startsWith('st(0,') && !e.includes('alpha(') && e.includes('clip('), s); });
  assert.strictEqual(F.maskAlphaExpr({ shape: 'ellipse' }), F.maskAlphaExpr({ shape: 'circle' }), 'old names give the same');
});

// ---------- chroma key ----------
ok('chroma key: removes about what the ffmpeg chromakey filter removes (measured with real clips), keeps other colours, and softens the edge', () => {
  const k = F.keyOf('#00ff00'), at = (hex, s, b) => { const c = F.hexRgb(hex); return F.chromaAlpha(c[0], c[1], c[2], k, s, b || 0); };
  assert.strictEqual(at('#00ff00', 0.1), 0); assert.strictEqual(at('#40ff40', 0.1), 255); assert.strictEqual(at('#40ff40', 0.2), 0); assert.strictEqual(at('#80ff00', 0.2), 0);
  assert.strictEqual(at('#ffff00', 0.3), 255); assert.strictEqual(at('#ffff00', 0.4), 0); assert.strictEqual(at('#0000ff', 0.6), 255); assert.strictEqual(at('#0000ff', 0.8), 0);
  const mid = at('#80ff00', 0.1, 0.2); assert(mid > 20 && mid < 235, 'a soft edge: ' + mid);
  assert.strictEqual(F.chromaFilter({}), 'chromakey=color=0x00ff00:similarity=0.300:blend=0.100');
  assert.deepStrictEqual(F.cleanChroma({ color: '0000FF', similarity: 5, blend: -1 }), { color: '#0000ff', similarity: 0.9, blend: 0 });
});
ok('drawing on a canvas: the blend mode is applied, and a plain overlay draws as before', () => {
  const calls = []; const g = new Proxy({ globalCompositeOperation: 'source-over', globalAlpha: 1 }, {
    get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); }), set: (t, k, v) => { t[k] = v; calls.push(['set ' + k, v]); return true; } });
  const R = { cx: 100, cy: 50, w: 80, h: 40, rot: 30, opacity: 0.5 };
  F.drawFx(g, 'IMG', R, {}); assert.deepStrictEqual(calls.filter(c => c[0] === 'set globalCompositeOperation').map(c => c[1]), ['source-over']);
  assert.deepStrictEqual(calls.find(c => c[0] === 'drawImage'), ['drawImage', 'IMG', -40, -20, 80, 40]);
  calls.length = 0; F.drawFx(g, 'IMG', R, { blend: 'softlight' }); assert.deepStrictEqual(calls.filter(c => c[0] === 'set globalCompositeOperation').map(c => c[1]), ['soft-light']);
});

// ---------- the project ----------
function make() {
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
      { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 6000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' },
      { id: 'vB', type: 'video', asset: 'movie', start: 6000, dur: 6000, in: 30000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lB' }] }] };
}
const base = make(), info = { name: 'cam.mp4', kind: 'video', durMs: 5000, w: 640, h: 360 };
ok('overlay fx: blend, mask and chroma key are stored on the overlay, mixed into what is there, and taken away again', () => {
  const o = {}, p = P.addOverlay(base, 1000, info, o), id = o.id, c = (q) => P.findClip(q, id).clip;
  let q = P.setOverlayFx(p, id, { blend: 'luminosity' }); assert.strictEqual(c(q).blend, 'luminosity'); assert.strictEqual(P.validate(q).length, 0);
  assert.strictEqual(P.setOverlayFx(q, id, { blend: 'luminosity' }), q); assert.strictEqual(c(P.setOverlayFx(q, id, { blend: 'normal' })).blend, undefined); assert.strictEqual(P.setOverlayFx(p, id, { blend: 'sparkle' }), p);
  q = P.setOverlayFx(q, id, { mask: { shape: 'heart' } }); assert.strictEqual(c(q).mask.shape, 'heart'); assert.strictEqual(c(q).mask.w, 0.6);
  q = P.setOverlayFx(q, id, { mask: { w: 0.9, rot: 30, feather: 0.4 } }); assert.deepStrictEqual([c(q).mask.shape, c(q).mask.w, c(q).mask.rot, c(q).mask.feather], ['heart', 0.9, 30, 0.4], 'a change to one part keeps the rest');
  q = P.setOverlayFx(q, id, { mask: { shape: 'star' } }); assert.deepStrictEqual([c(q).mask.shape, c(q).mask.w, c(q).mask.rot], ['star', 0.9, 30], 'a new shape keeps size and turn');
  q = P.setOverlayFx(q, id, { mask: { invert: true } }); assert.strictEqual(c(q).mask.invert, true); q = P.setOverlayFx(q, id, { mask: { invert: false } }); assert.strictEqual(c(q).mask.invert, undefined);
  q = P.setOverlayFx(q, id, { mask: { shape: 'none' } }); assert.strictEqual(c(q).mask, undefined);
  q = P.setOverlayFx(q, id, { chroma: {} }); assert.deepStrictEqual(c(q).chroma, { color: '#00ff00', similarity: 0.3, blend: 0.1 }); q = P.setOverlayFx(q, id, { chroma: null }); assert.strictEqual(c(q).chroma, undefined);
  assert.strictEqual(P.setOverlayFx(base, 'vA', { blend: 'screen' }), base, 'only overlays');
  const old = JSON.parse(JSON.stringify(p)); P.findClip(old, id).clip.mask = { shape: 'rounded', amount: 0.4 }; const mig = P.setOverlayFx(old, id, { mask: { feather: 0.5 } }); assert.deepStrictEqual([c(mig).mask.shape, c(mig).mask.corner, c(mig).mask.feather], ['rect', 0.4, 0.5], 'an old rounded mask becomes a rectangle');
});
ok('overlay fx: they stay on both pieces when the overlay is split, and on a copy; the plan carries them only when they are there', () => {
  const o = {}; let p = P.addOverlay(base, 0, info, o); assert(!('mask' in NP.projectToPlan(p).overlays[0]));
  p = P.setOverlayFx(P.setOverlayFx(P.setOverlayFx(p, o.id, { blend: 'screen' }), o.id, { mask: { shape: 'mirror', rot: 20 } }), o.id, { chroma: {} });
  const s = P.splitAt(p, 2000), row = s.tracks.find(t => t.kind === 'overlay'); assert.strictEqual(row.clips.length, 2); row.clips.forEach(c => { assert.strictEqual(c.blend, 'screen'); assert.strictEqual(c.mask.shape, 'mirror'); assert.strictEqual(c.chroma.color, '#00ff00'); });
  const out = {}, d = P.duplicateClip(p, o.id, out); assert.strictEqual(P.findClip(d, out.id).clip.mask.rot, 20);
  const ov = NP.projectToPlan(p).overlays[0]; assert.strictEqual(ov.blend, 'screen'); assert.strictEqual(ov.mask.shape, 'mirror'); assert.strictEqual(ov.chroma.color, '#00ff00');
});

// ---------- the ffmpeg engine ----------
const info0 = { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 6 };
const plan0 = (extra) => Object.assign({ naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 6000 }, audio: [],
  video: [{ type: 'play', sessionStart: 0, sessionEnd: 2000, movieStart: 0 }, { type: 'play', sessionStart: 2000, sessionEnd: 4000, movieStart: 4000 }] }, extra || {});
const ov0 = (o) => Object.assign({ startMs: 1000, durMs: 2000, asset: 'ov1', kind: 'video', inMs: 0, x: 0.75, y: 0.25, size: 0.35, rot: 0, opacity: 1, w: 160, h: 90 }, o || {});
const argsFor = (r, f) => r.jobs.find(j => j.produces === f).args;
const graph = (a) => a[a.indexOf('-filter_complex') + 1];
ok('ffmpeg engine: a key colour is taken out first, and a mask is cut before the overlay is turned', () => {
  const r = E.planToJobs(plan0({ overlays: [ov0({ chroma: { color: '#00ff00', similarity: 0.3, blend: 0.1 }, mask: { shape: 'star', w: 0.8, h: 0.8, feather: 0.2 }, rot: 20 })] }), info0, { height: 360 });
  const g = graph(argsFor(r, 'v0000.ts')), i0 = g.indexOf('chromakey=color=0x00ff00:similarity=0.300:blend=0.100'), i1 = g.indexOf('scale=224:126'), i2 = g.indexOf("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(st(0,"), i3 = g.indexOf('rotate=a=');
  assert(i0 > 0 && i0 < i1 && i1 < i2 && i2 < i3, 'key, then size, then mask, then turn: ' + g); assert(!g.includes(']blend='), 'no blend mode: no extra frame');
  const plain = E.planToJobs(plan0({ overlays: [ov0()] }), info0, { height: 360 }), pg = graph(argsFor(plain, 'v0000.ts')); assert(!pg.includes('chromakey') && !pg.includes('clip(') && !pg.includes('blend='), 'an overlay with none of these is built as before: ' + pg);
});
ok('ffmpeg engine: a blend mode mixes the overlay with a copy of the picture with its own exact formula, and lays that back where the overlay is', () => {
  const r = E.planToJobs(plan0({ overlays: [ov0({ blend: 'multiply' })] }), info0, { height: 360 }), a = argsFor(r, 'v0000.ts'), g = graph(a);
  assert(a.join(' ').includes('-f lavfi -i color=c=black@0:s=640x360:r=30:d=3.000,format=rgba'), 'a see-through frame with its alpha kept');
  ['alphaextract', 'format=gbrp', "blend=all_expr='A*B/255'", 'alphamerge', "enable='between(t,1.000,2.000)'"].forEach(s => assert(g.includes(s), s + ' in ' + g));
  const col = graph(argsFor(E.planToJobs(plan0({ overlays: [ov0({ blend: 'color' })] }), info0, { height: 360 }), 'v0000.ts')); assert(col.includes('format=yuv444p') && col.includes('blend=c0_expr=A:c1_expr=B:c2_expr=B') && !col.includes('gbrp'), col);
  const two = E.planToJobs(plan0({ overlays: [ov0({ blend: 'screen' }), ov0({ startMs: 1500, durMs: 1000, asset: 'ov2', blend: 'softlight', x: 0.3 })] }), info0, { height: 360 }), tg = graph(argsFor(two, 'v0000.ts'));
  assert(tg.includes("all_expr='A+B-A*B/255'") && tg.includes('st(0,A/255)'), 'two blended overlays in one part');
  const labels = tg.match(/\[bm\d+g\]/g), cnt = {}; labels.forEach(l => { cnt[l] = (cnt[l] || 0) + 1; });
  Object.keys(cnt).forEach(l => assert.strictEqual(cnt[l], 2, 'each label is made once and used once: ' + l)); assert.strictEqual(Object.keys(cnt).length, 2, 'two sets of labels');
  const kf = E.planToJobs(plan0({ overlays: [ov0({ blend: 'add', kf: { size: [[0, 0.2], [2000, 0.5]] }, mask: { shape: 'heart', feather: 0.3 } })] }), info0, { height: 360 }); assert(graph(argsFor(kf, 'v0000.ts')).includes("all_expr='min(255,A+B)'"), 'with keyframes and a mask too');
  assert(!graph(argsFor(E.planToJobs(plan0({ overlays: [ov0({ blend: 'normal' })] }), info0, { height: 360 }), 'v0000.ts')).includes('blend='));
});

// ---- real ffmpeg, only when this computer has a recent one ----
function ffmpegOk() { const r = cp.spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }); const m = r.status === 0 && /version\s+n?(\d+)/.exec(r.stdout); return !!m && +m[1] >= 5; }
if (ffmpegOk()) {
  const sh0 = (a) => { const r = cp.spawnSync('ffmpeg', ['-y', '-v', 'error'].concat(a), { encoding: null, maxBuffer: 1e8 }); assert.strictEqual(r.status, 0, String(r.stderr)); return r.stdout; };
  ok('real ffmpeg: every mask shape, turned, soft, inverted, moved, makes the same picture as the preview (to within 2 of 255)', () => {
    const W = 200, H = 120;
    [{ shape: 'circle' }, { shape: 'circle', x: 0.3, y: 0.6, w: 0.5, h: 0.8, rot: 30, feather: 0.4 }, { shape: 'rect', corner: 0.5, rot: 15 }, { shape: 'rect', x: 0.7, w: 0.4, h: 0.7, corner: 0.3, feather: 0.3, invert: true },
      { shape: 'diamond', rot: 20, w: 0.8, h: 0.5, feather: 0.2 }, { shape: 'line', rot: 35, x: 0.4, y: 0.6, feather: 0.3 }, { shape: 'line', rot: -60, invert: true }, { shape: 'mirror', rot: 25, h: 0.25, x: 0.6, feather: 0.25 },
      { shape: 'heart', rot: 15, w: 0.8, h: 0.7, feather: 0.2 }, { shape: 'heart', x: 0.4, y: 0.45, invert: true }, { shape: 'star', rot: 36, w: 0.9, h: 0.9, feather: 0.2 }, { shape: 'star', x: 0.6, w: 0.5, h: 0.5, invert: true }].forEach(c => {
      const m = F.cleanMask(c), got = sh0(['-f', 'lavfi', '-i', 'color=c=white:s=' + W + 'x' + H + ':r=1:d=1,format=rgba', '-vf', "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(" + F.maskAlphaExpr(m) + ")',format=rgba,alphaextract,format=gray", '-frames:v', '1', '-f', 'rawvideo', '-']);
      let max = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) max = Math.max(max, Math.abs(got[y * W + x] - Math.round(F.maskAlpha(m, x, y, W, H) * 255)));
      assert(max <= 2, JSON.stringify(c) + ': ' + max);
    });
  });
  ok('real ffmpeg: every blend mode gives the browser\'s formula (to within 2 of 255)', () => {
    const N = 64, mul = (b, s) => b * s, scr = (b, s) => b + s - b * s, hard = (b, s) => s <= 0.5 ? mul(b, 2 * s) : scr(b, 2 * s - 1);
    const ref = { multiply: mul, screen: scr, overlay: (b, s) => hard(s, b), darken: Math.min, lighten: Math.max, add: (b, s) => Math.min(1, b + s), difference: (b, s) => Math.abs(b - s), exclusion: (b, s) => b + s - 2 * b * s,
      softlight: (b, s) => { if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b); const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b); return b + (2 * s - 1) * (d - b); },
      hardlight: hard, dodge: (b, s) => b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)), burn: (b, s) => b >= 1 ? 1 : s === 0 ? 0 : 1 - Math.min(1, (1 - b) / s) };
    F.BLEND.filter(x => ref[x.key]).forEach(b => {
      const g = "[0:v]geq=r='X*4':g='X*4':b='X*4',format=gbrp[a];[1:v]geq=r='Y*4':g='Y*4':b='Y*4',format=gbrp[b];[a][b]blend=" + b.ff + ',format=rgb24';
      const out = sh0(['-f', 'lavfi', '-i', 'color=c=black:s=' + N + 'x' + N + ':r=1:d=1', '-f', 'lavfi', '-i', 'color=c=black:s=' + N + 'x' + N + ':r=1:d=1', '-filter_complex', g, '-frames:v', '1', '-f', 'rawvideo', '-']);
      let max = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) max = Math.max(max, Math.abs(out[(y * N + x) * 3] - Math.round(ref[b.key]((x * 4) / 255, (y * 4) / 255) * 255)));
      assert(max <= 2, b.key + ': ' + max);
    });
  });
  const render = (plan, ovFilter) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-fx-')), sh = (a) => cp.spawnSync('ffmpeg', ['-y', '-v', 'error'].concat(a), { cwd: dir, encoding: 'utf8' });
    let r = sh(['-f', 'lavfi', '-i', 'color=c=red:s=320x360:r=30:d=6', '-f', 'lavfi', '-i', 'color=c=blue:s=320x360:r=30:d=6', '-filter_complex', '[0:v][1:v]hstack,format=yuv420p', '-t', '6', 'm.mp4']); assert.strictEqual(r.status, 0, r.stderr);
    fs.renameSync(path.join(dir, 'm.mp4'), path.join(dir, 'movie.in'));
    r = sh(['-f', 'lavfi', '-i', 'color=c=0x00ff00:s=160x90:r=30:d=5', '-vf', (ovFilter ? ovFilter + ',' : '') + 'format=yuv420p', 'ov1.mp4']); assert.strictEqual(r.status, 0, r.stderr); fs.renameSync(path.join(dir, 'ov1.mp4'), path.join(dir, 'ov1.in'));
    const built = E.planToJobs(plan, info0, { height: 360 });
    built.jobs.forEach(j => { const x = sh(j.args); assert.strictEqual(x.status, 0, j.label + ': ' + x.stderr); });
    fs.writeFileSync(path.join(dir, 'video.txt'), built.videoList.map(f => "file '" + f + "'\n").join(''));
    r = sh(E.finalMixArgs([], plan.durationMs)); assert.strictEqual(r.status, 0, r.stderr);
    const frame = (t) => { const o = cp.spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', path.join(dir, 'out.mp4'), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: null }); return { w: built.width, h: built.height, d: o.stdout }; };
    const px = (t, fx, fy) => { const f = frame(t), i = (Math.round(fy * f.h) * f.w + Math.round(fx * f.w)) * 3; return [f.d[i], f.d[i + 1], f.d[i + 2]]; };
    const pxAt = (t, x, y) => { const f = frame(t), i = (y * f.w + x) * 3; return [f.d[i], f.d[i + 1], f.d[i + 2]]; };
    const frames = +cp.spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path.join(dir, 'out.mp4')], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
    return { px, pxAt, frames, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
  };
  const mid = { startMs: 0, durMs: 4000, x: 0.5, y: 0.5, size: 0.5 };
  ok('real ffmpeg: each mask shape cuts a real overlay where the preview says it does', () => {
    ['line', 'mirror', 'circle', 'rect', 'heart', 'star', 'diamond'].forEach(shape => {
      const m = F.cleanMask({ shape: shape, rot: 20, w: 0.8, h: 0.8 }), r = render(plan0({ overlays: [ov0(Object.assign({}, mid, { mask: m }))] }));   // the overlay is 320 x 180 at (160, 90)
      try {
        assert.strictEqual(r.frames, 120); let seen = 0, hidden = 0;
        for (let ly = 6; ly < 180; ly += 12) for (let lx = 6; lx < 320; lx += 16) {
          const al = F.maskAlpha(m, lx, ly, 320, 180); if (al > 0.97) { const p = r.pxAt(1, 160 + lx, 90 + ly); assert(p[1] > 200 && p[0] < 80, shape + ' should show green at ' + lx + ',' + ly + ': ' + p); seen++; }
          else if (al < 0.03) { const p = r.pxAt(1, 160 + lx, 90 + ly); assert(p[1] < 90, shape + ' should hide the overlay at ' + lx + ',' + ly + ': ' + p); hidden++; }
        }
        assert(seen > 10 && hidden > 10, shape + ' shows and hides parts: ' + seen + ' / ' + hidden);
      } finally { r.done(); }
    });
  });
  ok('real ffmpeg: blend modes give the browser\'s colours on a real picture, only where the overlay is, and the video keeps its length', () => {
    const r = render(plan0({ overlays: [ov0({ startMs: 0, durMs: 4000, x: 0.25, y: 0.5, size: 0.3, blend: 'screen' })] }));
    try { assert.strictEqual(r.frames, 120); const a = r.px(1, 0.25, 0.5), out = r.px(1, 0.05, 0.9); assert(a[0] > 200 && a[1] > 200 && a[2] < 80, 'green screened onto red is yellow: ' + a); assert(out[0] > 200 && out[1] < 60, 'outside nothing changes: ' + out); } finally { r.done(); }
    const g = [0, 255, 0], red = [255, 0, 0], blue = [0, 0, 255], hard = (b, s) => s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
    const f = { multiply: (b, s) => b * s, overlay: (b, s) => hard(s, b), hardlight: hard, difference: (b, s) => Math.abs(b - s), exclusion: (b, s) => b + s - 2 * b * s, dodge: (b, s) => b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)),
      burn: (b, s) => b >= 1 ? 1 : s === 0 ? 0 : 1 - Math.min(1, (1 - b) / s), softlight: (b, s) => { if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b); const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b); return b + (2 * s - 1) * (d - b); } };
    Object.keys(f).forEach(mode => {
      const q = render(plan0({ overlays: [ov0({ startMs: 0, durMs: 4000, x: 0.25, y: 0.5, size: 0.3, blend: mode }), ov0({ startMs: 0, durMs: 4000, asset: 'ov2', x: 0.75, y: 0.5, size: 0.3, blend: mode })] }));
      try { [[0.25, red], [0.75, blue]].forEach(([fx, base]) => { const p = q.px(1, fx, 0.5), want = base.map((v, i) => Math.round(f[mode](v / 255, g[i] / 255) * 255)); assert(p.every((v, i) => Math.abs(v - want[i]) <= 12), mode + ' on ' + base + ': got ' + p + ' want ' + want); }); } finally { q.done(); }
    });
  });
} else console.log('  --  real-file checks skipped (need ffmpeg 5 or newer on this computer)');
console.log('\n' + n + ' checks passed');