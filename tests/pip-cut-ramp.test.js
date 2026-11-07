'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../www/project.js'), AC = require('../www/autocut.js'), RP = require('../www/speedramp.js'), CV = require('../www/speedcurve.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const near = (a, b, m) => assert(Math.abs(a - b) < 0.001, (m || '') + ' ' + a + ' vs ' + b);
const vclip = (id, start, dur) => ({ id, type: 'video', asset: 'movie', start, dur, in: start, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 });
const base = { naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 10000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [vclip('vA', 0, 10000)] }] };

ok('sw.js is valid JavaScript (the comma that broke app.test.js)', () => { new vm.Script(read('sw.js')); });
ok('index.html loads the new scripts and sw.js caches them', () => {
  ['autocut.js', 'speedramp.js'].forEach(f => { assert(read('index.html').includes('src="' + f + '"'), f); assert(read('sw.js').includes("'./" + f + "'"), f); });
});
ok('PiP presets land in the right corner, half or middle', () => {
  const tl = P.pipPlacement('tl', 0.3, 16 / 9, 9 / 16); near(tl.size, 0.3); near(tl.x, 0.19, 'x'); near(tl.y, 0.04 * 16 / 9 + 0.15, 'y');
  const br = P.pipPlacement('br', 0.3, 16 / 9, 9 / 16); near(br.x, 0.81, 'x'); near(br.y, 1 - 0.04 * 16 / 9 - 0.15, 'y');
  const l = P.pipPlacement('left', 0.3, 16 / 9, 9 / 16); near(l.x, 0.25); near(l.size, 0.5);
  const f = P.pipPlacement('full', 0.3, 16 / 9, 9 / 16); near(f.size, 1);
  const tall = P.pipPlacement('full', 0.3, 16 / 9, 16 / 9); assert(tall.size < 1, 'a tall overlay is shrunk to fit');
  assert.strictEqual(P.pipPlacement('nope', 0.3, 1, 1), null);
});
ok('setOverlayPlace moves an overlay, uprights it, and drops its position keyframes', () => {
  const out = {}; let q = P.addOverlay(base, 1000, { name: 'o', kind: 'image', w: 1000, h: 500 }, out);
  q = P.toggleKeyframes(q, out.id, 500);
  q = P.setOverlayPlace(q, out.id, { x: 0.8, y: 0.2, size: 0.3 });
  const c = P.findClip(q, out.id).clip; near(c.x, 0.8); near(c.y, 0.2); near(c.size, 0.3); assert.strictEqual(c.rot, 0);
  assert(!c.kf || (!c.kf.x && !c.kf.y && !c.kf.size && !c.kf.rot));
  assert.strictEqual(P.setOverlayPlace(base, 'vA', { x: 0.5, y: 0.5, size: 0.3 }), base, 'not for picture clips');
});
ok('auto cut places scene changes by the movie time, skips ones too close to each other or to an end', () => {
  const out = {}, q = P.autoCutClip(base, 'vA', [3000, 3200, 6000, 9800], { minMs: 1000 }, out);
  assert.strictEqual(out.cuts, 2); assert.deepStrictEqual(q.tracks[0].clips.map(c => c.start), [0, 3000, 6000]);
  const b2 = JSON.parse(JSON.stringify(base)); b2.tracks[0].clips[0].in = 5000;
  const q2 = P.autoCutClip(b2, 'vA', [8000], { minMs: 1000 }); assert.deepStrictEqual(q2.tracks[0].clips.map(c => [c.start, c.in]), [[0, 5000], [3000, 8000]]);
  const rev = JSON.parse(JSON.stringify(base)); rev.tracks[0].clips[0].reverse = true;
  assert.strictEqual(P.autoCutClip(rev, 'vA', [3000], {}), rev);
});
ok('scene detection finds a real cut, ignores slow change, and keeps the stronger of two close cuts', () => {
  const mk = f => Array.from({ length: 20 }, (_, i) => ({ ms: i * 250, px: new Uint8Array(576).fill(f(i)) }));
  assert.deepStrictEqual(AC.detect(mk(i => i < 10 ? 50 : 200), { minMs: 1000 }), [2375]);
  assert.deepStrictEqual(AC.detect(mk(() => 80), {}), []);
  assert.deepStrictEqual(AC.detect(mk(i => 50 + i * 2), {}), []);
  const two = AC.detect(mk(i => i < 8 ? 40 : i < 9 ? 120 : 250), { minMs: 1000 }); assert.strictEqual(two.length, 1);
});
ok('every speed ramp is a valid curve and Auto picks sensibly', () => {
  RP.PRESETS.forEach(p => { const c = CV.clean(RP.points(p.key)); assert(c, p.key); assert.strictEqual(c.length, p.pts.length, p.key + ' keeps its points'); });
  assert.strictEqual(RP.auto(0, 1, 5000), 'hero'); assert.strictEqual(RP.auto(0, 3, 5000), 'launch'); assert.strictEqual(RP.auto(2, 3, 5000), 'brake');
  assert.strictEqual(RP.auto(1, 3, 5000), 'smooth'); assert.strictEqual(RP.auto(0, 3, 1000), 'smooth'); assert.strictEqual(RP.points('nope'), null);
});
ok('a ramp can be applied to a clip and taken away again', () => {
  const q = P.setSpeedCurve(base, 'vA', RP.points('hero')); assert.notStrictEqual(q, base); assert(P.speedCurveOf(q, 'vA'));
  const back = P.clearSpeedCurve(q, 'vA'); assert.strictEqual(P.speedCurveOf(back, back.tracks[0].clips[0].id), null);
});
ok('the editor has the PiP, Auto cut and Auto ramp panels and buttons', () => {
  const ed = read('editor.js');
  ['PANELS.pip =', 'PANELS.autocut =', 'PANELS.speedramp =', "id: 'edAutoCut'", "id: 'edSpeedRamp'", "id: 'edOverlayPip'", 'function applyRamp'].forEach(s => assert(ed.includes(s), s));
});
console.log('\n' + n + ' checks passed');