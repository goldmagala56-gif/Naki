'use strict';
// node tests/fx.test.js
// Blend modes, shape masks and chroma key on overlays: the maths, the project edits, the export plan, and what the ffmpeg engine builds and renders.
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const F = require('../www/fx.js'), P = require('../www/project.js'), NP = require('../www/plan.js'), E = require('../www/export-engine.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

// ---------- the library ----------
ok('blend modes: every one has a name for the preview, the fast engine and ffmpeg; normal is not stored', () => {
  assert.strictEqual(F.BLEND[0].key, 'normal'); assert(F.BLEND.length >= 10);
  F.BLEND.slice(1).forEach(b => { assert(b.label && b.css && b.canvas && b.ff, b.key); assert.strictEqual(F.cleanBlend(b.key), b.key); assert.strictEqual(F.ffBlend(b.key), b.ff); });
  assert.strictEqual(F.cleanBlend('normal'), null); assert.strictEqual(F.cleanBlend('sparkle'), null); assert.strictEqual(F.cleanBlend(undefined), null);
  assert.strictEqual(F.ffBlend('normal'), null); assert.strictEqual(F.cssBlend('add'), 'plus-lighter'); assert.strictEqual(F.blendOf('sparkle').key, 'normal');
});
ok('masks and chroma settings are tidied: limits, defaults, colours, and "off" is not stored', () => {
  assert.strictEqual(F.cleanMask(null), null); assert.strictEqual(F.cleanMask({ shape: 'none' }), null); assert.strictEqual(F.cleanMask({ shape: 'star' }), null);
  assert.deepStrictEqual(F.cleanMask({ shape: 'rounded' }), { shape: 'rounded', amount: 0.25 }); assert.deepStrictEqual(F.cleanMask({ shape: 'rounded', amount: 9 }), { shape: 'rounded', amount: 1 });
  assert.deepStrictEqual(F.cleanMask({ shape: 'ellipse', amount: 0.7 }), { shape: 'ellipse', amount: 0 });
  assert.strictEqual(F.cleanChroma(null), null); assert.deepStrictEqual(F.cleanChroma({}), { color: '#00ff00', similarity: 0.3, blend: 0.1 });
  assert.deepStrictEqual(F.cleanChroma({ color: '0000FF', similarity: 5, blend: -1 }), { color: '#0000ff', similarity: 0.9, blend: 0 });
  assert.strictEqual(F.cleanChroma({ color: 'nope' }).color, '#00ff00'); assert.strictEqual(F.cleanChroma({ similarity: 0 }).similarity, 0.01);
});
ok('chroma key: removes about what the ffmpeg chromakey filter removes (measured with real clips), keeps other colours, and softens the edge', () => {
  const k = F.keyOf('#00ff00'), at = (hex, s, b) => { const c = F.hexRgb(hex); return F.chromaAlpha(c[0], c[1], c[2], k, s, b || 0); };
  assert.strictEqual(at('#00ff00', 0.1), 0, 'the key colour itself');
  assert.strictEqual(at('#40ff40', 0.1), 255, 'a pale green is kept at a low similarity'); assert.strictEqual(at('#40ff40', 0.2), 0, 'and removed at a higher one');
  assert.strictEqual(at('#80ff00', 0.2), 0); assert.strictEqual(at('#ffff00', 0.3), 255); assert.strictEqual(at('#ffff00', 0.4), 0);
  assert.strictEqual(at('#0000ff', 0.6), 255); assert.strictEqual(at('#0000ff', 0.8), 0); assert.strictEqual(at('#ff0000', 0.6), 255); assert.strictEqual(at('#ff0000', 0.8), 0);
  const mid = at('#80ff00', 0.1, 0.2); assert(mid > 20 && mid < 235, 'a soft edge: ' + mid);
  const kb = F.keyOf('#0000ff'); assert.strictEqual(F.chromaAlpha(0, 0, 255, kb, 0.2, 0), 0); assert.strictEqual(F.chromaAlpha(0, 255, 0, kb, 0.2, 0), 255, 'a blue screen keeps green');
  assert.strictEqual(F.chromaFilter({}), 'chromakey=color=0x00ff00:similarity=0.300:blend=0.100'); assert.strictEqual(F.chromaFilter({ color: '#112233', similarity: 0.5, blend: 0 }), 'chromakey=color=0x112233:similarity=0.500:blend=0.000');
});
ok('masks: the preview shape, the canvas path and the ffmpeg expression describe the same shapes', () => {
  assert.strictEqual(F.maskCss(null), ''); assert.strictEqual(F.maskCss({ shape: 'ellipse' }), 'ellipse(50% 50% at 50% 50%)'); assert(F.maskCss({ shape: 'diamond' }).startsWith('polygon('));
  assert.strictEqual(F.maskCss({ shape: 'rounded', amount: 0.5 }, 200, 100), 'inset(0px round 25.0px)', 'round corners from the shorter side'); assert.strictEqual(F.maskCss({ shape: 'rounded', amount: 0.5 }), 'inset(0 round 25%)');
  const calls = []; const g = new Proxy({}, { get: (t, k) => (...a) => { calls.push([k, ...a]); } });
  F.maskPath(g, { shape: 'ellipse' }, 200, 100); assert.deepStrictEqual(calls[0], ['ellipse', 0, 0, 100, 50, 0, 0, Math.PI * 2]);
  calls.length = 0; F.maskPath(g, { shape: 'diamond' }, 200, 100); assert.deepStrictEqual(calls.filter(c => c[0] === 'lineTo').length, 3); assert.deepStrictEqual(calls[0], ['moveTo', 0, -50]);
  calls.length = 0; F.maskPath(g, { shape: 'rounded', amount: 0.5 }, 200, 100); assert.strictEqual(calls.filter(c => c[0] === 'arcTo').length, 4); assert.deepStrictEqual(calls.find(c => c[0] === 'arcTo'), ['arcTo', 100, -50, 100, -25, 25]);
  assert.strictEqual(F.maskAlphaExpr(null), null); assert.strictEqual(F.maskAlphaExpr({ shape: 'none' }), null);
  assert(/^clip\(\(1-hypot\(/.test(F.maskAlphaExpr({ shape: 'ellipse' }))); assert(F.maskAlphaExpr({ shape: 'diamond' }).includes('abs(')); assert(F.maskAlphaExpr({ shape: 'rounded', amount: 0.5 }).includes('0.500*min(W,H)/2'));
});
ok('drawing on a canvas: a blend mode, a mask and the turn are all applied, and a plain overlay draws as before', () => {
  const calls = []; const g = new Proxy({ globalCompositeOperation: 'source-over', globalAlpha: 1 }, {
    get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); }), set: (t, k, v) => { t[k] = v; calls.push(['set ' + k, v]); return true; } });
  const R = { cx: 100, cy: 50, w: 80, h: 40, rot: 30, opacity: 0.5 };
  F.drawFx(g, 'IMG', R, {}); assert.deepStrictEqual(calls.filter(c => c[0] === 'set globalCompositeOperation').map(c => c[1]), ['source-over']); assert(!calls.some(c => c[0] === 'clip'));
  assert.deepStrictEqual(calls.find(c => c[0] === 'drawImage'), ['drawImage', 'IMG', -40, -20, 80, 40]); assert.deepStrictEqual(calls.find(c => c[0] === 'translate'), ['translate', 100, 50]);
  calls.length = 0; F.drawFx(g, 'IMG', R, { blend: 'multiply', mask: { shape: 'ellipse' } });
  assert.deepStrictEqual(calls.filter(c => c[0] === 'set globalCompositeOperation').map(c => c[1]), ['multiply']); assert(calls.some(c => c[0] === 'clip') && calls.some(c => c[0] === 'ellipse'));
  assert(calls.findIndex(c => c[0] === 'clip') < calls.findIndex(c => c[0] === 'drawImage'), 'the shape is set before the picture is drawn');
  assert(calls.findIndex(c => c[0] === 'save') < calls.findIndex(c => c[0] === 'clip') && calls.some(c => c[0] === 'restore'), 'and put back afterwards');
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
  assert.strictEqual(c(p).blend, undefined); assert.strictEqual(c(p).mask, undefined); assert.strictEqual(c(p).chroma, undefined);
  let q = P.setOverlayFx(p, id, { blend: 'multiply' }); assert.strictEqual(c(q).blend, 'multiply'); assert.strictEqual(P.validate(q).length, 0);
  assert.strictEqual(P.setOverlayFx(q, id, { blend: 'multiply' }), q, 'no change: the same project'); assert.strictEqual(c(P.setOverlayFx(q, id, { blend: 'normal' })).blend, undefined); assert.strictEqual(P.setOverlayFx(p, id, { blend: 'sparkle' }), p);
  q = P.setOverlayFx(q, id, { mask: { shape: 'rounded' } }); assert.deepStrictEqual(c(q).mask, { shape: 'rounded', amount: 0.25 });
  q = P.setOverlayFx(q, id, { mask: { amount: 0.8 } }); assert.deepStrictEqual(c(q).mask, { shape: 'rounded', amount: 0.8 }, 'a change to one part keeps the rest');
  q = P.setOverlayFx(q, id, { mask: { shape: 'ellipse' } }); assert.deepStrictEqual(c(q).mask, { shape: 'ellipse', amount: 0 });
  q = P.setOverlayFx(q, id, { mask: { shape: 'none' } }); assert.strictEqual(c(q).mask, undefined);
  q = P.setOverlayFx(q, id, { chroma: {} }); assert.deepStrictEqual(c(q).chroma, { color: '#00ff00', similarity: 0.3, blend: 0.1 });
  q = P.setOverlayFx(q, id, { chroma: { similarity: 0.5 } }); assert.deepStrictEqual(c(q).chroma, { color: '#00ff00', similarity: 0.5, blend: 0.1 });
  q = P.setOverlayFx(q, id, { chroma: { color: '#0000ff' } }); assert.strictEqual(c(q).chroma.color, '#0000ff'); assert.strictEqual(c(q).chroma.similarity, 0.5);
  q = P.setOverlayFx(q, id, { chroma: null }); assert.strictEqual(c(q).chroma, undefined);
  assert.strictEqual(P.setOverlayFx(base, 'vA', { blend: 'screen' }), base, 'only overlays'); assert.strictEqual(P.setOverlayFx(base, 'nope', { blend: 'screen' }), base);
  assert.strictEqual(JSON.stringify(P.setOverlayFx(p, id, { blend: 'screen' }).tracks[0]), JSON.stringify(p.tracks[0]), 'the picture is untouched'); assert.strictEqual(c(p).blend, undefined, 'the old project is untouched');
});
ok('overlay fx: they stay on both pieces when the overlay is split, and on a copy', () => {
  const o = {}; let p = P.addOverlay(base, 0, info, o); p = P.setOverlayFx(P.setOverlayFx(P.setOverlayFx(p, o.id, { blend: 'screen' }), o.id, { mask: { shape: 'diamond' } }), o.id, { chroma: {} });
  const s = P.splitAt(p, 2000), row = s.tracks.find(t => t.kind === 'overlay');
  assert.strictEqual(row.clips.length, 2); row.clips.forEach(c => { assert.strictEqual(c.blend, 'screen'); assert.deepStrictEqual(c.mask, { shape: 'diamond', amount: 0 }); assert.strictEqual(c.chroma.color, '#00ff00'); });
  const out = {}, d = P.duplicateClip(p, o.id, out); assert.strictEqual(P.findClip(d, out.id).clip.blend, 'screen');
});

// ---------- the export plan ----------
ok('plan: overlays carry their blend mode, mask and chroma key, and only when they have them', () => {
  const o = {}; let p = P.addOverlay(base, 2000, info, o); assert(!('blend' in NP.projectToPlan(p).overlays[0]) && !('mask' in NP.projectToPlan(p).overlays[0]) && !('chroma' in NP.projectToPlan(p).overlays[0]));
  p = P.setOverlayFx(P.setOverlayFx(P.setOverlayFx(p, o.id, { blend: 'multiply' }), o.id, { mask: { shape: 'rounded', amount: 0.4 } }), o.id, { chroma: { color: '#0000ff' } });
  const ov = NP.projectToPlan(p).overlays[0];
  assert.strictEqual(ov.blend, 'multiply'); assert.deepStrictEqual(ov.mask, { shape: 'rounded', amount: 0.4 }); assert.deepStrictEqual(ov.chroma, { color: '#0000ff', similarity: 0.3, blend: 0.1 });
});

// ---------- the ffmpeg engine ----------
const info0 = { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 6 };
const plan0 = (extra) => Object.assign({ naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 6000 }, audio: [],
  video: [{ type: 'play', sessionStart: 0, sessionEnd: 2000, movieStart: 0 }, { type: 'play', sessionStart: 2000, sessionEnd: 4000, movieStart: 4000 }] }, extra || {});
const ov0 = (o) => Object.assign({ startMs: 1000, durMs: 2000, asset: 'ov1', kind: 'video', inMs: 0, x: 0.75, y: 0.25, size: 0.35, rot: 0, opacity: 1, w: 160, h: 90 }, o || {});
const argsFor = (r, f) => r.jobs.find(j => j.produces === f).args;
const graph = (a) => a[a.indexOf('-filter_complex') + 1];
ok('ffmpeg engine: a key colour is taken out first, and a mask is cut before the overlay is turned', () => {
  const r = E.planToJobs(plan0({ overlays: [ov0({ chroma: { color: '#00ff00', similarity: 0.3, blend: 0.1 }, mask: { shape: 'ellipse', amount: 0 }, rot: 20 })] }), info0, { height: 360 });
  const g = graph(argsFor(r, 'v0000.ts')), i0 = g.indexOf('chromakey=color=0x00ff00:similarity=0.300:blend=0.100'), i1 = g.indexOf('scale=224:126'), i2 = g.indexOf("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(clip("), i3 = g.indexOf('rotate=a=');
  assert(i0 > 0 && i0 < i1 && i1 < i2 && i2 < i3, 'key, then size, then mask, then turn: ' + g);
  assert(!g.includes('blend=all_mode'), 'no blend mode: no extra frame');
  const plain = E.planToJobs(plan0({ overlays: [ov0()] }), info0, { height: 360 }), pg = graph(argsFor(plain, 'v0000.ts')); assert(!pg.includes('chromakey') && !pg.includes('clip(') && !pg.includes('blend='), 'an overlay with none of these is built as before: ' + pg);
});
ok('ffmpeg engine: a blend mode puts the overlay on a see-through frame, mixes it with a copy of the picture and lays that back where the overlay is', () => {
  const r = E.planToJobs(plan0({ overlays: [ov0({ blend: 'multiply' })] }), info0, { height: 360 }), a = argsFor(r, 'v0000.ts'), g = graph(a);
  assert(a.join(' ').includes('-f lavfi -i color=c=black@0:s=640x360:r=30:d=3.000,format=rgba'), 'a see-through frame with its alpha kept: ' + a.join(' '));
  ['overlay=x=', 'split[', 'alphaextract', 'format=gbrp', 'blend=all_mode=multiply', 'alphamerge', "enable='between(t,1.000,2.000)'"].forEach(s => assert(g.includes(s), s + ' in ' + g));
  assert(a.join(' ').includes('-ss 0.000 -t 1.000 -i ov1.in'), 'the overlay file is still cut to the part');
  const b = argsFor(r, 'v0001.ts'), gb = graph(b); assert(gb.includes('blend=all_mode=multiply') && gb.includes("between(t,0.000,1.000)"), 'the next part carries on: ' + gb);
  const two = E.planToJobs(plan0({ overlays: [ov0({ blend: 'screen' }), ov0({ startMs: 1500, durMs: 1000, asset: 'ov2', blend: 'difference', x: 0.3 })] }), info0, { height: 360 }), tg = graph(argsFor(two, 'v0000.ts'));
  assert(tg.includes('blend=all_mode=screen') && tg.includes('blend=all_mode=difference'), 'two blended overlays in one part'); const labels = tg.match(/\[bm\d+g\]/g); assert.strictEqual(new Set(labels).size, labels.length, 'every label is used once: ' + labels);
  const kf = E.planToJobs(plan0({ overlays: [ov0({ blend: 'add', kf: { size: [[0, 0.2], [2000, 0.5]] }, mask: { shape: 'rounded', amount: 0.3 } })] }), info0, { height: 360 }); assert(graph(argsFor(kf, 'v0000.ts')).includes('blend=all_mode=addition'), 'with keyframes and a mask too');
  const norm = E.planToJobs(plan0({ overlays: [ov0({ blend: 'normal' })] }), info0, { height: 360 }); assert(!graph(argsFor(norm, 'v0000.ts')).includes('blend='));
});
// ---- real ffmpeg, only when this computer has a recent one ----
function ffmpegOk() { const r = cp.spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }); const m = r.status === 0 && /version\s+n?(\d+)/.exec(r.stdout); return !!m && +m[1] >= 5; }
if (ffmpegOk()) {
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
    const frames = +cp.spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path.join(dir, 'out.mp4')], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
    return { px, frames, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
  };
  const mid = { startMs: 0, durMs: 4000, x: 0.5, y: 0.5, size: 0.5 };
  ok('real ffmpeg: a chroma key makes the green see-through and keeps the rest of the overlay', () => {
    const r = render(plan0({ overlays: [ov0(Object.assign({}, mid, { chroma: { color: '#00ff00', similarity: 0.3, blend: 0.1 } }))] }), 'drawbox=x=60:y=25:w=40:h=40:color=magenta:t=fill');
    try {
      assert.strictEqual(r.frames, 120); const keyed = r.px(1, 0.35, 0.5), block = r.px(1, 0.5, 0.5), right = r.px(1, 0.65, 0.5);
      assert(keyed[0] > 200 && keyed[1] < 60 && keyed[2] < 60, 'the red picture shows through: ' + keyed); assert(block[0] > 200 && block[2] > 200 && block[1] < 60, 'the magenta block stays: ' + block); assert(right[2] > 200 && right[1] < 60, 'the blue half shows through: ' + right);
    } finally { r.done(); }
  });
  ok('real ffmpeg: a mask cuts the overlay to its shape', () => {
    const r = render(plan0({ overlays: [ov0(Object.assign({}, mid, { mask: { shape: 'ellipse', amount: 0 } }))] }));
    try {
      assert.strictEqual(r.frames, 120); const c = r.px(1, 0.5, 0.5), corner = r.px(1, 0.27, 0.28), cornerR = r.px(1, 0.73, 0.28);
      assert(c[1] > 200 && c[0] < 60, 'the middle is the overlay: ' + c); assert(corner[0] > 200 && corner[1] < 60, 'the corner is cut away, red shows: ' + corner); assert(cornerR[2] > 200 && cornerR[1] < 60, 'and blue on the other side: ' + cornerR);
    } finally { r.done(); }
  });
  ok('real ffmpeg: blend modes mix the overlay with the picture, only where the overlay is, and the video keeps its length', () => {
    let r = render(plan0({ overlays: [ov0({ startMs: 0, durMs: 4000, x: 0.25, y: 0.5, size: 0.3, blend: 'screen' })] }));
    try { assert.strictEqual(r.frames, 120); const a = r.px(1, 0.25, 0.5), out = r.px(1, 0.05, 0.9); assert(a[0] > 200 && a[1] > 200 && a[2] < 80, 'green screened onto red is yellow: ' + a); assert(out[0] > 200 && out[1] < 60 && out[2] < 60, 'outside the overlay nothing changes: ' + out); } finally { r.done(); }
    r = render(plan0({ overlays: [ov0({ startMs: 0, durMs: 4000, x: 0.25, y: 0.5, size: 0.3, blend: 'multiply' })] }));
    try { const a = r.px(1, 0.25, 0.5), out = r.px(1, 0.05, 0.9); assert(a[0] < 60 && a[1] < 60 && a[2] < 60, 'green multiplied with red is black: ' + a); assert(out[0] > 200, 'outside is still red: ' + out); } finally { r.done(); }
    r = render(plan0({ overlays: [ov0({ startMs: 1000, durMs: 2000, x: 0.25, y: 0.5, size: 0.3, blend: 'screen' })] }));
    try { const before = r.px(0.5, 0.25, 0.5), during = r.px(1.5, 0.25, 0.5), after = r.px(3.5, 0.25, 0.5); assert(before[1] < 60 && after[1] < 60 && during[1] > 200, 'only while it shows: ' + [before, during, after].join(' | ')); } finally { r.done(); }
  });
  ok('real ffmpeg: a key, a mask, a blend mode, a turn and a fade together, and next to a transition and a blurred background', () => {
    let r = render(plan0({ overlays: [ov0(Object.assign({}, mid, { blend: 'multiply', rot: 25, opacity: 0.8, chroma: { color: '#00ff00', similarity: 0.3, blend: 0.1 }, mask: { shape: 'rounded', amount: 0.4 } }))] }), 'drawbox=x=60:y=25:w=40:h=40:color=magenta:t=fill');
    try { assert.strictEqual(r.frames, 120); const keyed = r.px(1, 0.3, 0.55); assert(keyed[0] > 200 && keyed[1] < 60, 'the keyed part leaves the picture alone: ' + keyed); } finally { r.done(); }
    const p2 = plan0({ overlays: [ov0({ startMs: 1000, durMs: 2000, blend: 'screen' })] }); p2.video[1].transitionIn = { type: 'fade', durMs: 600 };
    r = render(p2); try { assert.strictEqual(r.frames, 120); } finally { r.done(); }
  });
} else console.log('  --  real-file checks skipped (need ffmpeg 5 or newer on this computer)');
console.log('\n' + n + ' checks passed');
