'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const www = p => path.join(__dirname, '..', 'www', p);
const P = require('../www/project.js'), PL = require('../www/plan.js'), E = require('../www/export-engine.js'), WC = require('../www/webcodecs-export.js').WebCodecsExport;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const vclip = (id, start, dur) => ({ id, type: 'video', asset: 'movie', start, dur, in: start, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 });
const base = { naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 10000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [vclip('vA', 0, 10000)] }] };
const stab = (p) => P.findClip(p, 'vA').clip.stabilize;

ok('stabilize is stored, clamped, switched off below 5%, and an unchanged value gives the same project', () => {
  let p = P.setStabilize(base, 'vA', 0.6); assert.strictEqual(stab(p), 0.6);
  assert.strictEqual(stab(P.setStabilize(base, 'vA', 7)), 1, 'clamped to 1');
  assert.strictEqual(stab(P.setStabilize(p, 'vA', 0)), undefined, 'off');
  assert.strictEqual(stab(P.setStabilize(p, 'vA', 0.02)), undefined, 'too small counts as off');
  assert.strictEqual(P.setStabilize(p, 'vA', 0.6), p, 'same value, same project');
  assert.strictEqual(P.setStabilize(base, 'vA', 'abc'), base);
  assert.strictEqual(P.setStabilize(base, 'nope', 0.5), base);
});
ok('a paused picture or a reversed clip cannot be stabilized, and id null reaches every playing clip', () => {
  let p = P.insertFreeze(base, 3000, 2000); const fr = p.tracks[0].clips.filter(c => c.type === 'freeze')[0];
  assert.strictEqual(P.setStabilize(p, fr.id, 0.5), p);
  const all = P.setStabilize(p, null, 0.5), cs = all.tracks[0].clips;
  assert(cs.filter(c => c.type === 'video').every(c => c.stabilize === 0.5)); assert(cs.filter(c => c.type === 'freeze').every(c => c.stabilize === undefined));
  const r = P.setReverse(base, 'vA'); assert.strictEqual(P.setStabilize(r, 'vA', 0.5), r);
});
ok('a cut keeps it on both pieces, and two halves with different values are not joined back together', () => {
  const p = P.setStabilize(base, 'vA', 0.4), cs = P.splitAt(p, 4000).tracks[0].clips; assert.strictEqual(cs.length, 2); cs.forEach(c => assert.strictEqual(c.stabilize, 0.4));
  let q = P.splitAt(P.setStabilize(base, 'vA', 0.4), 5000); const second = q.tracks[0].clips[1].id; q = P.setStabilize(q, second, 0.9);
  const out = {}; P.joinWithNext(q, q.tracks[0].clips[0].id, out); assert(!out.merged);
});
ok('the stabilize setting reaches the export plan (playing clips only)', () => {
  const plan = PL.projectToPlan(P.setStabilize(base, 'vA', 0.6)); assert.strictEqual(plan.video[0].stabilize, 0.6);
  assert.strictEqual(PL.projectToPlan(base).video[0].stabilize, undefined);
});
ok('the fast engine hands stabilized videos to ffmpeg', () => {
  assert.strictEqual(WC.canRender({ durationMs: 1000, video: [{ type: 'play', sessionStart: 0, sessionEnd: 1000, movieStart: 0 }], audio: [] }), true);
  assert.strictEqual(WC.canRender({ durationMs: 1000, video: [{ type: 'play', sessionStart: 0, sessionEnd: 1000, movieStart: 0, stabilize: 0.5 }], audio: [] }), false);
});
ok('the ffmpeg job steadies the picture first, before the crop and the fit', () => {
  const plan = { durationMs: 4000, movie: { name: 'm', durationMs: 8000 }, video: [{ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 1000, stabilize: 0.6, crop: { x: 0.25, y: 0, w: 0.5, h: 1 } }], audio: [] };
  const info = { width: 320, height: 180, sar: 1, hasAudio: false, audioMono: false, durationSec: 8 };
  const a = E.planToJobs(plan, info, { height: 180 }).jobs.filter(j => /^picture/.test(j.label))[0].args.join(' ');
  assert(a.includes('deshake=rx=42:ry=42:edge=mirror:blocksize=8:contrast=125'), a);
  assert(a.indexOf('deshake=') < a.indexOf('crop='), 'steady first, then crop'); assert(a.indexOf('crop=') < a.indexOf('scale='));
  const plain = E.planToJobs({ durationMs: 4000, movie: { name: 'm', durationMs: 8000 }, video: [{ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 1000 }], audio: [] }, info, { height: 180 }).jobs.filter(j => /^picture/.test(j.label))[0].args.join(' ');
  assert(!plain.includes('deshake'), 'nothing added when it is off');
});
ok('the editor has the Stabilize button and panel, and index.html can export without it if this device cannot', () => {
  const ed = fs.readFileSync(www('editor.js'), 'utf8'), html = fs.readFileSync(www('index.html'), 'utf8');
  ["id: 'edStabilize'", 'PANELS.stabilize = ', 'G.stabilize = ', 'P.setStabilize(E.hist.cur, c.id'].forEach(s => assert(ed.includes(s), s));
  assert(html.includes('s.transitionIn || s.stabilize') && html.includes('delete s.stabilize'));
});
console.log('\n' + n + ' checks passed');