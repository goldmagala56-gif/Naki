'use strict';
// node tests/smooth-slowmo.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../www/project.js'), NP = require('../www/plan.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const base = { naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
    { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 10000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
const first = p => p.tracks[0].clips[0];

ok('the switch turns smooth slow-mo on and off, and does nothing when nothing changes', () => {
  const on = P.setSmooth(base, 'vA'); assert.strictEqual(first(on).smooth, true); assert.strictEqual(P.setSmooth(on, 'vA', true), on);
  const off = P.setSmooth(on, 'vA'); assert.strictEqual(first(off).smooth, undefined); assert.strictEqual(P.validate(on).length, 0); assert.strictEqual(P.setSmooth(base, 'nope'), base);
});
ok('a reversed clip or a paused picture cannot have it', () => {
  const rv = P.setReverse(base, 'vA', true); assert.strictEqual(P.setSmooth(rv, 'vA', true), rv);
  const fz = JSON.parse(JSON.stringify(base)); fz.tracks[0].clips[0].type = 'freeze'; assert.strictEqual(P.setSmooth(fz, 'vA', true), fz);
});
ok('cutting a smooth clip keeps it smooth in both pieces', () => {
  const s = P.splitAt(P.setSmooth(base, 'vA', true), 5000); assert(s.tracks[0].clips.length === 2 && s.tracks[0].clips.every(c => c.smooth === true));
});
ok('the plan marks only slowed parts as smooth', () => {
  const slow = P.setSmooth(P.setClipSpeed(base, 'vA', 0.5), 'vA', true), sp = NP.projectToPlan(slow).video[0];
  assert.strictEqual(sp.smooth, true); assert.strictEqual(sp.speed, 0.5);
  const fast = P.setSmooth(P.setClipSpeed(base, 'vA', 2), 'vA', true); assert.strictEqual(NP.projectToPlan(fast).video[0].smooth, undefined);
  assert.strictEqual(NP.projectToPlan(P.setClipSpeed(base, 'vA', 0.5)).video[0].smooth, undefined, 'off unless switched on');
});
ok('the editor has the switch and the ffmpeg engine blends frames only for smooth slowed parts; edited files parse', () => {
  const ed = read('editor.js'), ee = read('export-engine.js');
  assert(ed.includes("id: 'edSmooth'") && ed.includes('P.setSmooth')); assert(ee.includes("sp.smooth && speed && speed < 1 ? ',framerate=fps='"));
  ['editor.js', 'export-engine.js', 'plan.js', 'project.js'].forEach(f => new vm.Script(read(f)));
});
console.log('\n' + n + ' checks passed');