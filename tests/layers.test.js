'use strict';
// node tests/layers.test.js
// Rows (layers): moving a clip to another row of its kind, or onto a row of its own, the way CapCut does.
const assert = require('assert'), P = require('../www/project.js'), NP = require('../www/plan.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
function make() {
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] },
      { id: 't-voice', kind: 'audio', role: 'voice', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vo', type: 'audio', asset: 'voice', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
}
const base = make(), rows = (p, kind) => p.tracks.filter(t => t.kind === kind), where = (p, id) => P.findClip(p, id).track.id;
ok('rows: only overlays, stickers, titles, effects and sound effects can change rows', () => {
  const o = {}; const st = P.addSticker(base, 0, 3000, '★', o);
  assert.strictEqual(P.rowFamily(P.findClip(st, o.id).track), 'sticker'); assert.strictEqual(P.rowFamily(base.tracks[0]), null); assert.strictEqual(P.rowFamily(base.tracks[1]), null); assert.strictEqual(P.rowFamily(null), null);
  assert.strictEqual(P.moveClipToRow(base, 'vA', 'new', 0, 'below'), base, 'the picture stays on its row'); assert.strictEqual(P.moveClipToRow(base, 'vo', 'new', 0, 'below'), base);
  assert.strictEqual(P.moveClipToRow(st, 'nope', 'new', 0, 'below'), st);
});
ok('rows: a clip moves to another free row of its kind, and the row it left goes away when it is empty', () => {
  const a = {}, b = {}; let p = P.addSticker(base, 0, 3000, '★', a); p = P.addSticker(p, 1000, 3000, '♥', b);
  assert.strictEqual(rows(p, 'sticker').length, 2); const r1 = where(p, a.id), r2 = where(p, b.id);
  const q = P.moveClipToRow(p, b.id, r1, 5000); assert.deepStrictEqual(P.validate(q), []); assert.strictEqual(where(q, b.id), r1); assert.strictEqual(P.findClip(q, b.id).clip.start, 5000); assert.strictEqual(rows(q, 'sticker').length, 1, 'the empty row is gone');
  assert.strictEqual(q.durationMs, 12000); assert.strictEqual(JSON.stringify(q.tracks.slice(0, 2)), JSON.stringify(base.tracks), 'picture and voice are untouched'); assert.strictEqual(where(p, b.id), r2, 'the old project is untouched');
  assert.strictEqual(P.moveClipToRow(p, a.id, r1, 100), p, 'the row it is already on: nothing to do');
});
ok('rows: dropped onto something, it goes on a row of its own on top; "new" puts it above or below the rows of its kind', () => {
  const a = {}, b = {}; let p = P.addSticker(base, 0, 3000, '★', a); p = P.addSticker(p, 1000, 3000, '♥', b); const r1 = where(p, a.id);
  const q = P.moveClipToRow(p, b.id, r1, 500); assert.strictEqual(rows(q, 'sticker').length, 2, 'it did not land on the other one'); assert.notStrictEqual(where(q, b.id), r1); assert.deepStrictEqual(P.validate(q), []);
  const ids = P.moveClipToRow(q, a.id, 'new', 100, 'below').tracks.map(t => t.id); assert.strictEqual(new Set(ids).size, ids.length, 'row ids stay unique');
  const o = {}; const one = P.addSticker(base, 0, 3000, '★', o), two = P.addSticker(one, 5000, 2000, '♥', {});
  const below = P.moveClipToRow(two, o.id, 'new', 0, 'below'), above = P.moveClipToRow(two, o.id, 'new', 0, 'above');
  const order = (pp) => pp.tracks.filter(t => t.kind === 'sticker').map(t => t.clips[0].id);
  assert.strictEqual(order(below).pop(), o.id, 'below: after the others'); assert.strictEqual(order(above)[0], o.id, 'above: before the others'); assert.strictEqual(below.tracks.indexOf(below.tracks.filter(t => t.kind === 'sticker').pop()) > 1, true);
  assert.strictEqual(rows(P.moveClipToRow(one, o.id, 'new', 0, 'below'), 'sticker').length, 1, 'the only clip of its row: the old row goes, the new one stays');
});
ok('rows: a locked row, a row of another kind, or the end of the video are respected', () => {
  const a = {}, b = {}; let p = P.addSticker(base, 0, 3000, '★', a); p = P.addSticker(p, 1000, 3000, '♥', b); const r1 = where(p, a.id), r2 = where(p, b.id);
  assert.strictEqual(P.moveClipToRow(P.setTrackProps(p, r1, { locked: true }), a.id, 'new', 0, 'below').tracks.length, p.tracks.length, 'a clip on a locked row stays');
  assert.strictEqual(P.moveClipToRow(P.setTrackProps(p, r1, { locked: true }), b.id, r1, 6000).tracks.filter(t => t.kind === 'sticker').length, 2, 'nothing lands on a locked row');
  const ov = {}; const mixed = P.addOverlay(p, 0, { name: 'x.png', kind: 'image', w: 10, h: 10 }, ov);
  assert.strictEqual(P.moveClipToRow(mixed, ov.id, r1, 6000), mixed, 'an overlay does not go onto a sticker row'); assert.strictEqual(P.moveClipToRow(mixed, a.id, 't-voice', 6000), mixed);
  const late = P.moveClipToRow(p, a.id, r2, 11900); assert.strictEqual(P.findClip(late, a.id).clip.start, 9000); assert.strictEqual(late.durationMs, 12000, 'the video does not get longer');
});
ok('rows: sound effects on different rows play together, titles on two rows both show, and an overlay keeps its look', () => {
  const f1 = {}, f2 = {}; let p = P.addSfx(base, 0, { name: 'a', durMs: 3000 }, f1); p = P.addSfx(p, 6000, { name: 'b', durMs: 2000 }, f2); assert.strictEqual(rows(p, 'audio').filter(t => t.role === 'sfx').length, 1);
  const q = P.moveClipToRow(p, f2.id, 'new', 1000, 'below'), plan = NP.projectToPlan(q), lanes = plan.audio.filter(a => a.file).map(a => a.src); assert.strictEqual(new Set(lanes).size, 2, 'two lanes: ' + lanes);
  const t1 = {}, t2 = {}; let tp = P.addTextClip(base, 0, 3000, t1); tp = P.addTextClip(tp, 4000, 2000, t2); const tq = P.moveClipToRow(tp, t2.id, 'new', 1000, 'below');
  assert.strictEqual(P.textsAt(tq, 1500).length, 2, 'both titles show at once'); assert.strictEqual(NP.projectToPlan(tq).texts.length, 2); assert.strictEqual(tq.tracks.filter(t => t.kind === 'text').length, 2);
  const back = P.moveClipToRow(tq, t2.id, 't-text', 4000); assert.strictEqual(back.tracks.filter(t => t.kind === 'text').length, 1, 'the extra title row goes away when it is empty'); assert.deepStrictEqual(P.validate(back), []);
  const o = {}; let ov = P.addOverlay(base, 0, { name: 'c.mp4', kind: 'video', durMs: 3000, w: 100, h: 100 }, o); ov = P.setOverlayFx ? P.setOverlayFx(ov, o.id, { blend: 'screen' }) : ov;
  const moved = P.moveClipToRow(ov, o.id, 'new', 2000, 'below'), c = P.findClip(moved, o.id).clip; assert.strictEqual(c.start, 2000); assert.strictEqual(c.asset, 'ov1'); if (P.setOverlayFx) assert.strictEqual(c.blend, 'screen');
});
console.log('\n' + n + ' checks passed');
