'use strict';
const assert = require('assert');
const P = require('../www/project.js'), PL = require('../www/plan.js'), E = require('../www/export-engine.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const near = (a, b, m) => assert(Math.abs(a - b) < 0.001, (m || '') + ' ' + a + ' vs ' + b);
const vclip = (id, start, dur) => ({ id, type: 'video', asset: 'movie', start, dur, in: start, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 });
const base = { naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 10000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [vclip('vA', 0, 10000)] }] };
const crop = (p) => P.findClip(p, 'vA').clip.crop;

ok('ratio presets give the biggest centred rectangle of that shape', () => {
  const sq = P.cropRect(1, 1, 1920, 1080); near(sq.w, 0.5625, 'w'); near(sq.h, 1, 'h'); near(sq.x, 0.21875, 'x'); near(sq.y, 0, 'y');
  const tall = P.cropRect(9, 16, 1920, 1080); near(tall.w, 0.3164, 'w'); near(tall.h, 1, 'h');
  const same = P.cropRect(16, 9, 1920, 1080); assert.deepStrictEqual(same, { x: 0, y: 0, w: 1, h: 1 });
});
ok('a crop is kept inside the picture, is not stored when it covers everything, and can be removed', () => {
  let p = P.setCrop(base, 'vA', { x: 0.9, y: 0, w: 0.5, h: 0.5 }); near(crop(p).x, 0.5, 'pushed back inside');
  p = P.setCrop(p, 'vA', { x: 0, y: 0, w: 1, h: 1 }); assert.strictEqual(crop(p), undefined);
  p = P.setCrop(base, 'vA', { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }); assert(crop(p));
  assert.strictEqual(crop(P.setCrop(p, 'vA', null)), undefined);
  assert.strictEqual(P.setCrop(base, 'vA', { x: 0, y: 0, w: 1, h: 1 }), base, 'nothing changes, same project');
});
ok('a cut keeps the crop on both pieces, and a held picture is cropped like the clip it comes from', () => {
  const p = P.setCrop(base, 'vA', { x: 0.2, y: 0.1, w: 0.5, h: 0.6 });
  const s = P.splitAt(p, 4000), cs = s.tracks[0].clips; assert.strictEqual(cs.length, 2); cs.forEach(c => assert.deepStrictEqual(c.crop, { x: 0.2, y: 0.1, w: 0.5, h: 0.6 }));
  const f = P.insertFreeze(p, 3000, 2000).tracks[0].clips.filter(c => c.type === 'freeze')[0]; assert.deepStrictEqual(f.crop, { x: 0.2, y: 0.1, w: 0.5, h: 0.6 });
});
ok('two halves with different crops are not joined back into one clip', () => {
  let p = P.splitAt(P.setCrop(base, 'vA', { x: 0, y: 0, w: 0.5, h: 0.5 }), 5000);
  const second = p.tracks[0].clips[1].id; p = P.setCrop(p, second, { x: 0.3, y: 0.3, w: 0.5, h: 0.5 });
  const out = {}; P.joinWithNext(p, p.tracks[0].clips[0].id, out); assert(!out.merged);
});
ok('the crop reaches the export plan', () => {
  const p = P.setCrop(base, 'vA', { x: 0.25, y: 0, w: 0.5, h: 1 });
  assert.deepStrictEqual(PL.projectToPlan(p).video[0].crop, { x: 0.25, y: 0, w: 0.5, h: 1 });
});
ok('the ffmpeg job crops first, then fits the cropped picture inside the frame (never stretched)', () => {
  const plan = { durationMs: 4000, movie: { name: 'm', durationMs: 8000 }, video: [{ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 1000, crop: { x: 0.25, y: 0, w: 0.5, h: 1 } }], audio: [] };
  const info = { width: 320, height: 180, sar: 1, hasAudio: false, audioMono: false, durationSec: 8 };
  const a = E.planToJobs(plan, info, { height: 180 }).jobs.filter(j => /^picture/.test(j.label))[0].args.join(' ');
  assert(a.includes('crop=w=trunc(iw*0.5000/2)*2:h=trunc(ih*1.0000/2)*2:x=trunc(iw*0.2500/2)*2:y=trunc(ih*0.0000/2)*2'), a);
  assert(a.indexOf('crop=') < a.indexOf('scale='), 'crop comes before the fit'); assert(a.includes('pad='), 'fitted with bars');
});
console.log('\n' + n + ' checks passed');