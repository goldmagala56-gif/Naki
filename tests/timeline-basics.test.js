'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../www/project.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const vclip = (id, start, dur) => ({ id, type: 'video', asset: 'movie', start, dur, in: start, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 });
const aclip = (id, start, dur) => ({ id, type: 'audio', asset: 'music', start, dur, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 });
const base = { naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, music: { type: 'audio', durMs: 60000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [vclip('vA', 0, 10000)] },
    { id: 't-music', kind: 'audio', role: 'music', muted: false, hidden: false, volume: 1, locked: false, clips: [aclip('m1', 0, 4000), aclip('m2', 4000, 4000)] }] };
const starts = (p, i) => p.tracks[i].clips.map(c => c.start);

ok('pasting a picture clip inside another goes after it, and the clips behind move later', () => {
  const s = P.splitAt(base, 5000), first = s.tracks[0].clips[0], cb = P.copyClip(s, first.id), out = {};
  const q = P.pasteClip(s, cb, 2000, out);
  assert.deepStrictEqual(starts(q, 0), [0, 5000, 10000]);
  const copy = P.findClip(q, out.id).clip; assert.strictEqual(copy.start, 5000); assert.strictEqual(copy.dur, 5000); assert.strictEqual(copy.in, first.in); assert.notStrictEqual(copy.id, first.id);
});
ok('a picture clip is pasted with its linked sound, under a new link', () => {
  const L = JSON.parse(JSON.stringify(base)); L.tracks[0].clips[0].link = 'L1';
  L.tracks.push({ id: 't-ms', kind: 'audio', role: 'movieSound', muted: false, hidden: false, volume: 1, locked: false,
    clips: [{ id: 'sA', type: 'audio', asset: 'movie', start: 0, dur: 10000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'L1' }] });
  const cb = P.copyClip(L, 'vA'); assert.strictEqual(cb.linked.length, 1);
  const out = {}, q = P.pasteClip(L, cb, 10000, out), pic = P.findClip(q, out.id).clip, ms = q.tracks[2].clips;
  assert.strictEqual(q.tracks[0].clips.length, 2); assert.strictEqual(ms.length, 2); assert(pic.link && pic.link !== 'L1'); assert.strictEqual(ms[1].link, pic.link); assert.strictEqual(ms[1].start, pic.start);
});
ok('an overlay goes on the same row when there is room and on a new row when there is not', () => {
  const o = {}; let p = P.addOverlay(base, 1000, { name: 'o', kind: 'image', w: 100, h: 100 }, o);
  const cb = P.copyClip(p, o.id), rows = q => q.tracks.filter(t => t.kind === 'overlay').length;
  const a = P.pasteClip(p, cb, 1500, {}); assert.strictEqual(rows(a), 2);
  const b = P.pasteClip(p, cb, 5000, {}); assert.strictEqual(rows(b), 1); assert.strictEqual(b.tracks.filter(t => t.kind === 'overlay')[0].clips.length, 2);
});
ok('a sound clip goes to the next free space on its row, and is cut short at the end of the video', () => {
  const cb = P.copyClip(base, 'm1'), out = {}, q = P.pasteClip(base, cb, 1000, out), c = P.findClip(q, out.id).clip;
  assert.strictEqual(c.start, 8000); assert.strictEqual(c.dur, 2000); assert.strictEqual(q.durationMs, 10000);
  assert.strictEqual(P.pasteClip(base, cb, 10000, {}), base, 'no room at the end');
  assert.strictEqual(P.pasteClip(base, null, 0, {}), base);
});
ok('paste look copies the look onto clips of the same kind, removes what the source lacks, and ignores other kinds', () => {
  let p = P.splitAt(base, 5000); const a = p.tracks[0].clips[0].id, b = p.tracks[0].clips[1].id;
  p = P.setFilter(p, a, { brightness: 1.3 }); p = P.setOpacity(p, a, 0.5);
  const look = P.captureLook(p, a); assert.strictEqual(look.kind, 'video'); assert(look.data.filter && look.data.opacity === 0.5);
  const q = P.pasteLook(p, look, [b]), cb = P.findClip(q, b).clip; assert.deepStrictEqual(cb.filter, P.findClip(p, a).clip.filter); assert.strictEqual(cb.opacity, 0.5);
  const plain = P.captureLook(P.splitAt(base, 5000), P.splitAt(base, 5000).tracks[0].clips[0].id), r = P.pasteLook(q, plain, [b]);
  assert.strictEqual(P.findClip(r, b).clip.filter, undefined); assert.strictEqual(P.findClip(r, b).clip.opacity, undefined);
  assert.strictEqual(P.pasteLook(p, look, ['m1']), p, 'a sound clip is not a picture');
  assert.strictEqual(P.pasteLook(q, look, [b]), q, 'already the same');
});
ok('sound looks (effects, volume) paste between sound clips', () => {
  let p = P.setAudioFx ? P.setAudioFx(base, 'm1', { bass: 6 }) : P.setClipProps(base, 'm1', { volume: 0.5 });
  const look = P.captureLook(p, 'm1'), q = P.pasteLook(p, look, ['m2']);
  assert.deepStrictEqual(P.captureLook(q, 'm2').data, look.data);
});
ok('select right finds clips from the playhead on, and moving them together works or is refused', () => {
  const s = P.splitAt(base, 5000), ids = P.selectRight(s, 5000);
  assert(ids.includes(s.tracks[0].clips[1].id)); assert(!ids.includes(s.tracks[0].clips[0].id));
  assert.strictEqual(P.selectRight(s, 0).length, s.tracks.reduce((n, t) => n + t.clips.length, 0));
  const m = P.moveClips(s, [s.tracks[0].clips[1].id], 1000); assert.strictEqual(m.tracks[0].clips[1].start, 6000);
  assert.strictEqual(P.moveClips(s, [s.tracks[0].clips[1].id], -2000), s, 'would land on the first clip');
  assert.strictEqual(P.moveClips(s, [s.tracks[0].clips[0].id], -500), s, 'cannot go before 0');
  const both = P.moveClips(base, ['m1', 'm2'], 1000); assert.deepStrictEqual(starts(both, 1), [1000, 5000]);
});
ok('deleting several clips at once', () => {
  const q = P.deleteClips(base, ['m1', 'm2']); assert.strictEqual(q.tracks.filter(t => t.role === 'music')[0].clips.length, 0);
  assert.strictEqual(P.deleteClips(base, []), base);
});
ok('the editor has the Select tool, the keys and the snapping switch', () => {
  const ed = read('editor.js');
  ["name: 'select'", 'ROWS.select =', 'PANELS.shiftclips =', 'function snapTh', 'function copySel', 'function pasteHere', 'pasteLookHere();', "id: 'edXPaste'"].forEach(s => assert(ed.includes(s), s));
  assert(!ed.includes('8 / E.ppm, snapPts()'), 'snapping goes through snapTh');
  new vm.Script(ed);
});
console.log('\n' + n + ' checks passed');