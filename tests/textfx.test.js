'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const www = p => path.join(__dirname, '..', 'www', p);
const LK = require('../www/look.js'), P = require('../www/project.js'), PL = require('../www/plan.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
const text = (p, id) => P.findClip(p, id).clip;
const mkText = () => { const o = {}; const p = P.addTextClip(base, 1000, 4000, o); return { p, id: o.id }; };

// a canvas that only remembers what it was asked to draw
function mockCtx(log) {
  const g = { font: '', measureText(s) { const px = +/(\d+)px/.exec(this.font)[1]; return { width: String(s).length * px * 0.5 }; },
    save() {}, restore() {}, translate(x, y) { log.push(['translate', x, y]); }, rotate(a) { log.push(['rotate', a]); }, fillRect() {}, clearRect() {}, drawImage() { log.push(['drawImage']); },
    fillText(s) { log.push(['fillText', s, this.fillStyle]); }, strokeText(s) { log.push(['strokeText', s, this.strokeStyle]); },
    createLinearGradient() { return { addColorStop() {}, isGradient: true }; } };
  return g;
}
const layerMaker = () => function OffscreenCanvas() { const l = []; const c = mockCtx(l); this.getContext = () => c; };

ok('effect values are tidied: out-of-range is clamped, tiny means off, bad colours get a default', () => {
  assert.strictEqual(LK.cleanStyle('arc', 0.01), null); assert.strictEqual(LK.cleanStyle('arc', 5), 1); assert.strictEqual(LK.cleanStyle('arc', -0.5), -0.5);
  assert.deepStrictEqual(LK.cleanStyle('grad', { c1: 'zzz', c2: '#ABCDEF', angle: -90 }), { c1: '#ff512f', c2: '#abcdef', angle: 270 });
  assert.strictEqual(LK.cleanStyle('glow', { amount: 0 }), null); assert.deepStrictEqual(LK.cleanStyle('glow', {}), { color: '#00e5ff', amount: 0.7 });
  assert.strictEqual(LK.cleanStyle('bubble', 'x'), null); assert.strictEqual(LK.cleanStyle('extrude', null), null);
});
ok('every word-art look sets every effect, uses a valid font, and holds only valid values', () => {
  assert(LK.ART.length >= 10); const fonts = LK.fontList().map(f => f.key);
  LK.ART.forEach(a => {
    ['grad', 'arc', 'glow', 'bubble', 'extrude'].forEach(k => { assert(k in a.patch, a.key + ' sets ' + k); if (a.patch[k] != null) assert.notStrictEqual(LK.cleanStyle(k, a.patch[k]), null, a.key + ' ' + k); });
    if (a.patch.font) assert(fonts.includes(a.patch.font), a.key + ' font ' + a.patch.font);
  });
  assert.strictEqual(LK.art('nope'), null); assert.notStrictEqual(LK.art('neon'), LK.art('neon'), 'a copy each time');
});
ok('a title with no effects is drawn by the original code (nothing changed for old projects)', () => {
  assert(!LK.hasTitleFx({ text: 'a', size: 7, color: '#fff', outline: 0.4, font: 'serif' }));
  const log = []; const lines = LK.drawTitle(mockCtx(log), { text: 'Hello', size: 8 }, 640, 360); assert.deepStrictEqual(lines, ['Hello']);
});
ok('glow is drawn behind the letters; curve places letters one by one, ends lower for an arch and higher for a smile', () => {
  const log = []; LK.drawTitle(mockCtx(log), { text: 'Hello world', size: 8, pos: 'center', glow: { color: '#00e5ff', amount: 1 }, outline: 0.5 }, 640, 360);
  const fills = log.filter(x => x[0] === 'fillText'); assert(fills.length >= 4); assert(fills.slice(0, 3).every(f => f[2] === '#00e5ff')); assert.strictEqual(fills[fills.length - 1][2], '#ffffff'); assert(log.some(x => x[0] === 'strokeText'));
  const firstY = arc => { const l = []; LK.drawTitle(mockCtx(l), { text: 'ABCDEFG', size: 8, pos: 'center', arc }, 640, 360); return l.filter(x => x[0] === 'translate')[0][2]; };
  const mid = Math.round(0.40 * 360); assert(firstY(0.8) > mid, 'arch'); assert(firstY(-0.8) < mid, 'smile');
});
ok('a gradient is poured into the letters on a scratch picture, and still works where there is none', () => {
  const t = { text: 'Grad', size: 8, grad: { c1: '#ff0000', c2: '#0000ff', angle: 90 } };
  global.OffscreenCanvas = layerMaker(); let log = []; LK.drawTitle(mockCtx(log), t, 640, 360); assert(log.some(x => x[0] === 'drawImage'));
  delete global.OffscreenCanvas; log = []; LK.drawTitle(mockCtx(log), t, 640, 360); assert(log.some(x => x[0] === 'fillText' && x[2] && x[2].isGradient), 'filled directly');
});
ok('3D and bubble: stacked copies and a thick outline in its own colour', () => {
  const log = []; LK.drawTitle(mockCtx(log), { text: 'X', size: 10, extrude: { color: '#ff0000', depth: 1 }, bubble: { color: '#00ff00', width: 1 } }, 640, 360);
  assert(log.filter(x => x[0] === 'translate').length >= 3); assert(log.some(x => x[0] === 'strokeText' && x[2] === '#00ff00'));
});
ok('setTextProps stores, changes and removes effects; bad input is tidied; same value gives the same project', () => {
  const { p, id } = mkText(); let q = P.setTextProps(p, id, { grad: { c1: '#112233', c2: '#445566', angle: 45 }, arc: 0.4 });
  assert.deepStrictEqual(text(q, id).grad, { c1: '#112233', c2: '#445566', angle: 45 }); assert.strictEqual(text(q, id).arc, 0.4);
  q = P.setTextProps(q, id, { glow: { color: '#ff0000', amount: 5 } }); assert.strictEqual(text(q, id).glow.amount, 1); assert(text(q, id).grad, 'the others stay');
  assert.strictEqual(P.setTextProps(q, id, { arc: 0.4 }), q);
  q = P.setTextProps(q, id, { grad: null, arc: 0, glow: null }); ['grad', 'arc', 'glow'].forEach(k => assert.strictEqual(text(q, id)[k], undefined, k));
  const w = P.setTextProps(p, id, LK.art('neon')); assert(text(w, id).glow && text(w, id).font === 'righteous'); const pl = P.setTextProps(w, id, LK.art('plain')); assert.strictEqual(text(pl, id).glow, undefined);
});
ok('effects survive a cut (both pieces)', () => {
  const { p, id } = mkText(), q = P.setTextProps(p, id, { arc: -0.3, bubble: { color: '#00ff00', width: 0.5 } });
  const cs = P.splitAt(q, 3000).tracks.find(t => t.kind === 'text').clips; assert.strictEqual(cs.length, 2); cs.forEach(c => { assert.strictEqual(c.arc, -0.3); assert.strictEqual(c.bubble.color, '#00ff00'); });
});
ok('one look for every caption, including the effects', () => {
  let p = P.addCaptions(base, [{ startMs: 0, endMs: 1500, text: 'a' }, { startMs: 2000, endMs: 3500, text: 'b' }], {}, {});
  p = P.setCaptionStyle(p, { color: '#ffee00', font: 'sans', outline: 0, shadow: 1, grad: { c1: '#ff0000', c2: '#0000ff', angle: 0 }, arc: 0.5 });
  const caps = p.tracks.find(t => t.role === 'captions').clips; assert(caps.every(c => c.grad && c.arc === 0.5 && c.color === '#ffee00'));
  p = P.setCaptionStyle(p, { grad: null, arc: null }); assert(p.tracks.find(t => t.role === 'captions').clips.every(c => c.grad === undefined && c.arc === undefined));
});
ok('the effects reach the export plan, and a plain title adds nothing', () => {
  const { p, id } = mkText(), q = P.setTextProps(p, id, { text: 'Hi', grad: { c1: '#ff0000', c2: '#0000ff', angle: 90 }, glow: { color: '#00e5ff', amount: 0.5 }, arc: 0.3, bubble: { color: '#ff4fa3', width: 0.5 }, extrude: { color: '#000000', depth: 0.5 } });
  const t = PL.projectToPlan(q).texts[0]; ['grad', 'arc', 'glow', 'bubble', 'extrude'].forEach(k => assert(t[k] != null, k));
  const t2 = PL.projectToPlan(P.setTextProps(p, id, { text: 'Hi' })).texts[0]; ['grad', 'arc', 'glow', 'bubble', 'extrude'].forEach(k => assert.strictEqual(t2[k], undefined));
});
ok('both exports draw titles through look.js, so the effects match the preview', () => {
  const ee = fs.readFileSync(www('export-engine.js'), 'utf8'), wc = fs.readFileSync(www('webcodecs-export.js'), 'utf8');
  assert(wc.includes('LK.drawTitle'), 'fast engine'); assert(/NakiLook/.test(ee), 'ffmpeg engine draws titles through NakiLook (send me its drawTitle if not)');
});
ok('the editor has the Effects button and panel, and draws styled titles on a canvas with look.js', () => {
  const ed = fs.readFileSync(www('editor.js'), 'utf8'), html = fs.readFileSync(www('index.html'), 'utf8');
  new vm.Script(ed, { filename: 'editor.js' });
  ["id: 'edTextFx'", 'PANELS.textfx = ', 'function paintStyledText', 'function isStyledText', 'if (sty){ paintStyledText(layer, c); return; }', 'LK.drawTitle(g, Object.assign({}, c, { text: shown }), cw, ch)'].forEach(s => assert(ed.includes(s), s));
  assert(html.includes("'look.js': 'textfx'") && fs.readFileSync(www('look.js'), 'utf8').includes("['look.js'] = 'textfx'"));
});
console.log('\n' + n + ' checks passed');