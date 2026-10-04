'use strict';
// Checks More adjust (warmth, sharpen, vignette, faded look) and replacing the movie.  Run with:  node tests/more-adjust.test.js
const assert = require('assert'), cp = require('child_process');
const C = require('../www/core.js'), P = require('../www/project.js'), PL = require('../www/plan.js'), LK = require('../www/look.js');
const W = require('../www/webcodecs-export.js').WebCodecsExport, T = W._test;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const events = [{ t: 0, type: 'rec_start', movieMs: 0 }, { t: 0, type: 'vol', value: 1 }, { t: 0, type: 'duck', enabled: true, thresholdDb: -40, duckedGain: 0.2 },
  { t: 4000, type: 'play', movieMs: 0 }, { t: 30000, type: 'pause', movieMs: 26000 }, { t: 40000, type: 'play', movieMs: 26000 }, { t: 60000, type: 'rec_stop' }];
const levels = []; for (let i = 0; i < 1201; i++) levels.push(C.dbToByte(-60));
const base = P.compileFromSession({ events, levels, durationMs: 60000, movieName: 'm.mp4', movieDurMs: 600000, voiceOffsetMs: 100, voiceNudgeMs: 0 });
const pics = (p) => p.tracks.filter(t => t.kind === 'video')[0].clips;
const play1 = pics(base)[1];

ok('the four looks are kept per clip, within range, and only stored when they are used', () => {
  let q = P.setFilter(base, play1.id, { warmth: 5, sharpen: -1, vignette: 0.456, matte: 0.5 });
  assert.deepStrictEqual(P.findClip(q, play1.id).clip.filter, { brightness: 1, contrast: 1, saturate: 1, warmth: 1, vignette: 0.456, matte: 0.5 });
  q = P.setFilter(q, play1.id, { warmth: -0.5, vignette: 0 });
  assert.deepStrictEqual(P.findClip(q, play1.id).clip.filter, { brightness: 1, contrast: 1, saturate: 1, warmth: -0.5, matte: 0.5 });
  q = P.setFilter(q, play1.id, { warmth: 0, matte: 0 }); assert.strictEqual(P.findClip(q, play1.id).clip.filter, undefined, 'all back to normal removes the filter');
  assert.strictEqual(P.findClip(P.setFilter(base, play1.id, { warmth: 'x' }), play1.id).clip.filter, undefined, 'rubbish is ignored');
  const all = P.setFilter(P.setFilter(base, play1.id, { vignette: 0.4, brightness: 1.2 }), null, { vignette: 0.4 });
  pics(all).forEach(c => assert.strictEqual(c.filter.vignette, 0.4)); assert.strictEqual(P.findClip(all, play1.id).clip.filter.brightness, 1.2);
  const cut = P.rippleDelete(P.setFilter(base, play1.id, { warmth: 0.3 }), 10000, 12000); assert.strictEqual(P.findClip(cut, play1.id).clip.filter.warmth, 0.3, 'kept after a cut');
  const fz = P.insertFreeze(P.setFilter(base, play1.id, { matte: 0.6 }), 10000, 1000); assert.strictEqual(pics(fz).find(c => c.type === 'freeze' && c.start === 10000).filter.matte, 0.6, 'kept by a freeze frame');
});
ok('the export plan carries the looks, and a plain filter is exactly what it was before', () => {
  const plain = PL.projectToPlan(P.setFilter(base, play1.id, { brightness: 0.8 })).video.find(v => v.sessionStart === 4000);
  assert.deepStrictEqual(plain.filter, { brightness: 0.8, contrast: 1, saturate: 1 });
  const v = PL.projectToPlan(P.setFilter(base, play1.id, { warmth: 0.5, sharpen: 0.4 })).video.find(x => x.sessionStart === 4000);
  assert.deepStrictEqual(v.filter, { brightness: 1, contrast: 1, saturate: 1, warmth: 0.5, sharpen: 0.4 });
});
ok('look maths: warm and cool tints, the faded veil, and a vignette that darkens only toward the corners', () => {
  assert.deepStrictEqual(LK.tint(1), { r: 1, g: 0.94, b: 0.85 }); assert.strictEqual(LK.tint(0), null);
  const cool = LK.tint(-1); assert(cool.r < 1 && cool.b === 1);
  assert.strictEqual(LK.tintCss(1), 'rgb(255,240,217)'); assert.strictEqual(LK.matteCss(1), 'rgba(140,140,140,0.35)'); assert.strictEqual(LK.matteCss(0), null);
  assert.strictEqual(LK.vignetteLevel(0.8, 0), 1);
  let prev = 1; for (let t = 0.1; t <= 1.001; t += 0.1) { const l = LK.vignetteLevel(0.8, t); assert(l < prev); prev = l; }
  assert(LK.vignetteLevel(1, 1) < LK.vignetteLevel(0.3, 1), 'a stronger vignette is darker');
  const st = LK.vignetteStops(0.7); assert.strictEqual(st.length, 13); assert.strictEqual(st[0][1], 0);
  assert(LK.vignetteCss(0.7).startsWith('radial-gradient(circle farthest-corner at 50% 50%, rgba(0,0,0,0) 0%'));
  assert.strictEqual(LK.extras({ warmth: 'a', sharpen: 9 }).sharpen, 1);
});
ok('the ffmpeg engine gets one filter per look, in a fixed order, and nothing when nothing is set', () => {
  assert.deepStrictEqual(LK.ffmpegExtras({ brightness: 1.2, contrast: 1, saturate: 1 }), []);
  const f = LK.ffmpegExtras({ warmth: 1, sharpen: 1, matte: 1, vignette: 1 });
  assert.strictEqual(f.length, 4);
  assert.strictEqual(f[0], 'colorchannelmixer=rr=1.0000:gg=0.9400:bb=0.8500,format=yuv420p'); assert.strictEqual(f[1], 'unsharp=5:5:1.500:5:5:0');
  assert(f[2].startsWith("lutyuv=y='val*0.6500+")); assert.strictEqual(f[3], 'vignette=angle=0.9000:eval=init');
});
ok('the fast engine draws warmth, the faded veil and the vignette, in that order, and leaves sharpen to ffmpeg', () => {
  const calls = [], g = { globalCompositeOperation: 'source-over', fillStyle: '' };
  ['save', 'restore', 'fillRect'].forEach(k => { g[k] = function () { calls.push([k, g.globalCompositeOperation, typeof g.fillStyle === 'string' ? g.fillStyle : 'gradient']); }; });
  const stops = []; g.createRadialGradient = (a, b, c, d, e, r) => { stops.push(['r', r]); return { addColorStop: (o, col) => stops.push([o, col]) }; };
  T.applyExtras(g, { brightness: 1, contrast: 1, saturate: 1 }, 800, 600); assert.strictEqual(calls.length, 0, 'a plain filter draws nothing extra');
  T.applyExtras(g, { warmth: 1, matte: 0.5, vignette: 0.6 }, 800, 600);
  assert.deepStrictEqual(calls.map(c => c[0]), ['save', 'fillRect', 'restore', 'fillRect', 'fillRect']);
  assert.deepStrictEqual(calls[1].slice(1), ['multiply', 'rgb(255,240,217)']); assert.strictEqual(calls[3][2], 'rgba(140,140,140,0.175)'); assert.strictEqual(calls[4][2], 'gradient');
  assert.strictEqual(stops[0][1], 500); assert.strictEqual(stops.length, 14);   // radius = half the diagonal; 13 colour stops
  const plan = (f) => ({ video: [{ type: 'play', sessionStart: 0, sessionEnd: 1000, movieStart: 0, filter: f }], audio: [] });
  T.setFilterSupport(true);
  assert.strictEqual(W.canRender(plan({ brightness: 1, contrast: 1, saturate: 1, warmth: 0.5, matte: 0.3, vignette: 0.5 })), true);
  assert.strictEqual(W.canRender(plan({ brightness: 1, contrast: 1, saturate: 1, sharpen: 0.2 })), false);
  T.setFilterSupport(false);
  assert.strictEqual(W.canRender(plan({ brightness: 1, contrast: 1, saturate: 1, warmth: 0.5, vignette: 0.5 })), true, 'these looks need no canvas filter support');
});
// ---- the real ffmpeg: each look must come out the way the canvas formulas say ----
const hasFfmpeg = cp.spawnSync('ffmpeg', ['-version']).status === 0;
const frame = (src, vf) => {
  const r = cp.spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', src + ',format=yuv420p', '-vf', vf + ',format=rgb24', '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1e7 });
  assert.strictEqual(r.status, 0, String(r.stderr)); const d = r.stdout; return (x, y) => { const i = (y * 320 + x) * 3; return [d[i], d[i + 1], d[i + 2]]; };
};
const SRC = (c) => 'color=c=' + c + ':s=320x180:r=30';
if (hasFfmpeg) {
  ok('ffmpeg: warmth multiplies the colours as the canvas does', () => {
    [1, -1, 0.5].forEach(w => {
      const t = LK.tint(w), got = frame(SRC('0x808080'), LK.ffmpegExtras({ warmth: w }).join(','))(160, 90), want = [t.r, t.g, t.b].map(k => 128 * k);
      got.forEach((v, i) => assert(Math.abs(v - want[i]) <= 3, 'warmth ' + w + ' channel ' + i + ': ' + v + ' vs ' + want[i]));
    });
  });
  ok('ffmpeg: the faded look blends toward the same light grey as the canvas', () => {
    [1, 0.5].forEach(m => [['black', 0], ['white', 255], ['0x808080', 128]].forEach(([c, v]) => {
      const a = LK.matteAlpha(m), want = v * (1 - a) + LK.MATTE_GRAY * a, got = frame(SRC(c), LK.ffmpegExtras({ matte: m }).join(','))(160, 90)[0];
      assert(Math.abs(got - want) <= 3, 'matte ' + m + ' on ' + c + ': ' + got + ' vs ' + want);
    }));
  });
  ok('ffmpeg: the vignette keeps the centre and darkens toward the corners like the canvas curve (within 10%)', () => {
    [0.4, 0.8, 1].forEach(v => {
      const px = frame(SRC('white'), LK.ffmpegExtras({ vignette: v }).join(',')), mid = px(160, 90)[0] / 255, dmax = Math.hypot(160, 90);
      assert(mid > 0.99, 'centre untouched');
      [60, 100, 140].forEach(r => { const got = px(160 + r, 90)[0] / 255, want = LK.vignetteLevel(v, r / dmax); assert(Math.abs(got - want) < 0.1, 'vignette ' + v + ' at ' + r + ': ' + got.toFixed(2) + ' vs ' + want.toFixed(2)); });
    });
  });
  ok('ffmpeg: sharpen overshoots on both sides of a soft edge, which is what makes it look crisper', () => {
    const edge = "color=c=gray:s=320x180:r=30,geq=lum='80+clip((X-140)*5,0,100)':cb=128:cr=128", plain = frame(edge, 'null'), sharp = frame(edge, LK.ffmpegExtras({ sharpen: 1 }).join(','));
    assert(sharp(140, 90)[0] < plain(140, 90)[0] - 2, 'darker just before the edge: ' + sharp(140, 90)[0] + ' vs ' + plain(140, 90)[0]);
    assert(sharp(160, 90)[0] > plain(160, 90)[0] + 2, 'brighter just after it: ' + sharp(160, 90)[0] + ' vs ' + plain(160, 90)[0]);
    assert(Math.abs(sharp(40, 90)[0] - plain(40, 90)[0]) <= 1, 'flat areas are left alone');
  });
} else console.log('  (ffmpeg not found: the real-ffmpeg checks were skipped)');
ok('replacing the movie: only the name and length change, and the edits stay', () => {
  let p = P.setTransform(P.setFilter(base, play1.id, { warmth: 0.4 }), play1.id, { rot: 90 });
  const q = P.setMovieAsset(p, { name: 'better.mp4', durMs: 650000 });
  assert.strictEqual(q.assets.movie.name, 'better.mp4'); assert.strictEqual(q.assets.movie.durMs, 650000); assert.strictEqual(p.assets.movie.name, 'm.mp4', 'the old project is untouched');
  assert.strictEqual(JSON.stringify(q.tracks), JSON.stringify(p.tracks)); assert.deepStrictEqual(P.validate(q), []);
  assert.strictEqual(P.setMovieAsset(p, { name: 'x.mp4' }).assets.movie.durMs, null, 'an unknown length is not guessed');
  assert.strictEqual(P.trimClipEnd(P.setMovieAsset(p, { name: 'short.mp4', durMs: 20000 }), play1.id, 30000).tracks[0].clips[1].dur, 20000, 'the new length is what trimming respects');
});
ok('how far into the movie the edits reach', () => {
  assert.strictEqual(P.movieNeeded(base), 26000 + 20000, 'the last stretch ends 46 s in');
  assert.strictEqual(P.movieNeeded(P.setClipSpeed(base, play1.id, 2)), 46000, 'speed 2 plays the same stretch');
  const slow = P.setClipSpeed(base, play1.id, 0.5); assert.strictEqual(P.movieNeeded(slow), 46000);
  assert.strictEqual(P.movieNeeded(P.rippleDelete(base, 40000, 60000)), 26000 + 0, 'cutting the last part shortens what is needed');
  assert.strictEqual(P.movieNeeded({ tracks: [] }), 0);
});
console.log('\n' + n + ' checks passed');