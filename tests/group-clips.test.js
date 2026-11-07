'use strict';
// node tests/group-clips.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../www/project.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const vclip = (id, start, dur) => ({ id, type: 'video', asset: 'movie', start, dur, in: start, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 });
const aclip = (id, start, dur) => ({ id, type: 'audio', asset: 'music', start, dur, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 });
const base = { naki: 'project', version: 1, fps: 30, durationMs: 20000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, music: { type: 'audio', durMs: 60000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [vclip('vA', 0, 20000)] },
    { id: 't-music', kind: 'audio', role: 'music', muted: false, hidden: false, volume: 1, locked: false, clips: [aclip('m1', 0, 1000), aclip('m2', 1500, 1000), aclip('m3', 8000, 1000)] }] };
const starts = p => p.tracks[1].clips.map(c => c.start);

ok('grouping tags the clips, needs two, and keeps a group together when it is grouped again', () => {
  const g = P.groupClips(base, ['m1', 'm2']), t = g.tracks[1].clips;
  assert(t[0].group && t[0].group === t[1].group && t[2].group === undefined); assert.deepStrictEqual(P.groupIds(g, 'm1').sort(), ['m1', 'm2']); assert.deepStrictEqual(P.groupIds(g, 'm3'), ['m3']);
  assert.strictEqual(P.groupClips(base, ['m1']), base); assert.strictEqual(P.validate(g).length, 0);
  const big = P.groupClips(g, ['m2', 'm3']); assert.deepStrictEqual(P.groupIds(big, 'm1').sort(), ['m1', 'm2', 'm3']);
});
ok('clips on a locked row cannot join', () => {
  const L = JSON.parse(JSON.stringify(base)); L.tracks[1].locked = true; assert.strictEqual(P.groupClips(L, ['m1', 'm2']), L);
});
ok('moving one clip of a group moves all of them; if one has no room, nothing moves', () => {
  const g = P.groupClips(base, ['m1', 'm2']), m = P.moveClips(g, ['m1'], 2000); assert.deepStrictEqual(starts(m), [2000, 3500, 8000]);
  assert.strictEqual(P.moveClips(g, ['m1'], 6000), g, 'm2 would land on m3');
  assert.strictEqual(P.moveClips(g, ['m2'], -1500), g, 'the first clip cannot go before 0, so none move');
});
ok('deleting one clip of a group deletes the group; ungrouping lets them go separately', () => {
  const g = P.groupClips(base, ['m1', 'm2']), d = P.deleteClips(g, ['m2']); assert.deepStrictEqual(d.tracks[1].clips.map(c => c.id), ['m3']);
  const u = P.ungroupClips(g, 'm1'); assert(u.tracks[1].clips.every(c => c.group === undefined)); assert.deepStrictEqual(starts(P.moveClips(u, ['m1'], 100)), [100, 1500, 8000].map((v, i) => i === 0 ? 100 : v));
  assert.strictEqual(P.ungroupClips(base, 'm1'), base);
});
ok('copying a group pastes all of it, with the same gaps, as a new group', () => {
  const g = P.groupClips(base, ['m1', 'm2']), cb = P.copyGroup(g, 'm2'), out = {}, q = P.pasteGroup(g, cb, 5000, out);
  assert(cb && cb.group.length === 2); assert.strictEqual(out.ids.length, 2); assert.strictEqual(q.tracks[1].clips.length, 5); assert.strictEqual(P.validate(q).length, 0);
  const a = P.findClip(q, out.ids[0]).clip, b = P.findClip(q, out.ids[1]).clip; assert.strictEqual(a.start, 5000); assert.strictEqual(b.start, 6500);
  assert(a.group && a.group === b.group && a.group !== g.tracks[1].clips[0].group, 'a new group');
  assert.strictEqual(P.copyGroup(base, 'm1'), null);
});
ok('a group that does not fit is not pasted at all, and a single copy of a grouped clip is not in the group', () => {
  const g = P.groupClips(base, ['m1', 'm2']), cb = P.copyGroup(g, 'm1'); assert.strictEqual(P.pasteGroup(g, cb, 19500, {}), g, 'the second clip would start after the end of the video');
  const out = {}, q = P.pasteClip(g, P.copyClip(g, 'm1'), 12000, out); assert.strictEqual(P.findClip(q, out.id).clip.group, undefined);
});
ok('the editor has Pick clips, Group, Ungroup and the group drag, and the edited files parse', () => {
  const ed = read('editor.js'); ["id: 'edSelGroup'", "id: 'edSelUngroup'", "id: 'edSelPick'", 'P.pasteGroup', 'P.groupIds(cur0, d.id)'].forEach(s => assert(ed.includes(s), s));
  ['editor.js', 'project.js'].forEach(f => new vm.Script(read(f)));
});
console.log('\n' + n + ' checks passed');