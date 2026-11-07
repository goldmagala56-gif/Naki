'use strict';
// node tests/small-tools-a.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../www/project.js'), NP = require('../www/plan.js'), EX = require('../www/export-engine.js'), WC = require('../www/webcodecs-export.js').WebCodecsExport;
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] },
    { id: 't-voice', kind: 'audio', role: 'voice', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'aV', type: 'audio', asset: 'voice', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
const info = { hasAudio: false, width: 640, height: 360, sar: 1, durationSec: 100 };
const allArgs = jobs => jobs.map(j => j.args.join(' ')).join('\n');

ok('noise reduction is set on a sound row, tidied, and left alone when nothing changes', () => {
  const p = P.setDenoise(base, 't-voice', 0.5); assert.strictEqual(p.tracks[1].denoise, 0.5); assert.strictEqual(base.tracks[1].denoise, undefined);
  assert.strictEqual(P.setDenoise(p, 't-voice', 0.5), p); assert.strictEqual(P.setDenoise(p, 't-voice', 9).tracks[1].denoise, 1);
  assert.strictEqual(P.setDenoise(p, 't-voice', 0).tracks[1].denoise, undefined); assert.strictEqual(P.setDenoise(base, 't-voice', 0), base);
  assert.strictEqual(P.setDenoise(base, 't-movie', 0.5), base, 'only sound rows');
  assert.strictEqual(P.splitAt(p, 4000).tracks[1].denoise, 0.5, 'survives an edit');
});
ok('the plan carries it, only the compatible engine takes it, and it becomes an afftdn filter', () => {
  const plan = NP.projectToPlan(P.setDenoise(base, 't-voice', 0.5)); assert.strictEqual(plan.audio[0].denoise, 0.5); assert.strictEqual(WC.canRender(plan), false);
  assert.strictEqual(NP.projectToPlan(base).audio[0].denoise, undefined); assert.strictEqual(WC.canRender(NP.projectToPlan(base)), true);
  const jobs = EX.planToJobs({ durationMs: 4000, movie: { durationMs: 60000 }, video: [{ type: 'black', sessionStart: 0, sessionEnd: 4000 }],
    audio: [{ src: 'voice', startMs: 0, durMs: 4000, inMs: 0, points: [[0, 1]], denoise: 0.5 }] }, info, { height: 360 }).jobs;
  assert(allArgs(jobs).includes('afftdn=nr=18.0'));
});
ok('motion blur is set only on pictures and overlays, and travels to the plan and the engines', () => {
  let p = P.toggleKeyframe(base, 'vA', 'zoom', 0); p = P.setAnimated(p, 'vA', 'zoom', 2, 2000);
  const q = P.setMotionBlur(p, 'vA', 0.5); assert.strictEqual(q.tracks[0].clips[0].mblur, 0.5); assert.strictEqual(P.setMotionBlur(q, 'vA', 0.5), q);
  assert.strictEqual(P.setMotionBlur(q, 'vA', 0.01).tracks[0].clips[0].mblur, undefined); assert.strictEqual(P.setMotionBlur(base, 'aV', 0.5), base);
  const plan = NP.projectToPlan(q); assert.strictEqual(plan.video[0].mblur, 0.5); assert.strictEqual(WC.canRender(plan), false);
  assert(allArgs(EX.planToJobs(plan, info, { height: 360 }).jobs).includes('tmix=frames=4'));
});
ok('an overlay with motion and blur gets its own blended layer in the ffmpeg graph', () => {
  const o = {}; let p = P.addOverlay(base, 1000, { name: 'a.png', kind: 'image', w: 100, h: 100 }, o);
  p = P.toggleKeyframes(p, o.id, 0); p = P.setAnimated(p, o.id, 'x', 0.8, 2000); p = P.setMotionBlur(p, o.id, 0.5);
  const plan = NP.projectToPlan(p); assert.strictEqual(plan.overlays[0].mblur, 0.5);
  const a = allArgs(EX.planToJobs(plan, info, { height: 360 }).jobs); assert(a.includes('tmix=frames=4') && a.includes('color=c=black@0'));
  const still = NP.projectToPlan(P.setMotionBlur(P.addOverlay(base, 1000, { name: 'a.png', kind: 'image', w: 100, h: 100 }, {}), 'nope', 0.5)); assert.strictEqual(still.overlays[0].mblur, undefined);
});
ok('title pieces are ordinary text clips with the right words', () => {
  assert(P.PIECES.length >= 6 && P.PIECES.some(x => x.numbered));
  const o = {}, p = P.addPiece(base, 1000, 'part', 3, o), c = P.findClip(p, o.id).clip;
  assert.strictEqual(c.text, 'Part 3'); assert.strictEqual(c.start, 1000); assert.strictEqual(c.dur, 2500); assert.strictEqual(c.pos, 'center'); assert.strictEqual(P.validate(p).length, 0);
  assert.strictEqual(P.findClip(P.addPiece(base, 0, 'thanks', 1, o), o.id).clip.text, 'Thanks for watching');
  assert.strictEqual(P.addPiece(base, 1000, 'nope', 1, {}), base);
});
ok('a countdown is one clip per second, back to back, and refuses when something is in the way', () => {
  const o = {}, p = P.addCountdown(base, 1000, 3, o), texts = [1000, 2000, 3000].map(t => P.textsAt(p, t + 100)[0]);
  assert.deepStrictEqual(texts.map(c => c.text), ['3', '2', '1']); assert.deepStrictEqual(texts.map(c => c.start), [1000, 2000, 3000]); assert(texts.every(c => c.dur === 1000));
  assert.strictEqual(o.ids.length, 3); assert.strictEqual(P.validate(p).length, 0);
  const blocked = P.addTextClip(base, 2000, 3000, {}); assert.strictEqual(P.addCountdown(blocked, 1000, 3, {}), blocked);
  assert.strictEqual(P.addCountdown(base, 11000, 5, {}), base, 'not enough video left');
});
ok('the editor has the three new buttons and panels, and the edited files parse', () => {
  const ed = read('editor.js');
  ["id: 'edMotionBlur'", "id: 'edOverlayMblur'", "id: 'edDenoise'", "id: 'edPieces'", 'PANELS.denoise = ', 'PANELS.motionblur = ', 'PANELS.pieces = ', 'function addCountdownHere'].forEach(s => assert(ed.includes(s), s));
  ['editor.js', 'project.js', 'plan.js', 'export-engine.js', 'webcodecs-export.js'].forEach(f => new vm.Script(read(f)));
});
console.log('\n' + n + ' checks passed');