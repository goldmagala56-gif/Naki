'use strict';
// Checks the "apply to every clip", "freeze keeps the look", "fades only at the real ends" and "voice timing"
// changes.  Run with:  node tests/project-apply.test.js
const assert = require('assert');
const C = require('../www/core.js'), P = require('../www/project.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const events = [{ t: 0, type: 'rec_start', movieMs: 0 }, { t: 0, type: 'vol', value: 1 }, { t: 0, type: 'duck', enabled: true, thresholdDb: -40, duckedGain: 0.2 },
  { t: 4000, type: 'play', movieMs: 0 }, { t: 30000, type: 'pause', movieMs: 26000 }, { t: 40000, type: 'play', movieMs: 26000 }, { t: 60000, type: 'rec_stop' }];
const levels = []; for (let i = 0; i < 1201; i++) levels.push(C.dbToByte(-60));
const mkSess = (extra) => Object.assign({ events, levels, durationMs: 60000, movieName: 'm.mp4', movieDurMs: 600000, voiceOffsetMs: 100, voiceNudgeMs: 0 }, extra || {});
const base = P.compileFromSession(mkSess());
const pics = (p) => p.tracks.filter(t => t.kind === 'video')[0].clips;
const voice = (p) => p.tracks.find(t => t.role === 'voice').clips;

ok('zoom / turn / flip and opacity can be set on every picture clip at once, and only on picture clips', () => {
  const q = P.setTransform(base, null, { rot: 90, flipH: true });
  assert.strictEqual(pics(q).length, 4);
  pics(q).forEach(c => assert.deepStrictEqual(c.transform, { zoom: 1, x: 0, y: 0, rot: 90, flipH: true }));
  q.tracks.filter(t => t.kind === 'audio').forEach(t => t.clips.forEach(c => assert.strictEqual('transform' in c, false)));
  const o = P.setOpacity(q, null, 0.3); pics(o).forEach(c => assert.strictEqual(c.opacity, 0.3));
  pics(P.setOpacity(o, null, 1)).forEach(c => assert.strictEqual(c.opacity, undefined));
  pics(P.setTransform(q, null, { rot: 0, flipH: false })).forEach(c => assert.strictEqual(c.transform, undefined));
  assert.deepStrictEqual(P.validate(o), []);
});
ok('one clip alone still works, and "all" keeps each clip\'s own pan', () => {
  const one = pics(base)[1], q1 = P.setTransform(base, one.id, { rot: 180 });
  assert.strictEqual(pics(q1).filter(c => c.transform).length, 1);
  assert.strictEqual(P.setTransform(base, 'nope', { rot: 90 }), base); assert.strictEqual(P.setOpacity(base, base.tracks[2].clips[0].id, 0.5), base);
  let a = P.setTransform(base, one.id, { zoom: 2, x: 1 }); a = P.setTransform(a, null, { zoom: 3 });
  assert.strictEqual(P.findClip(a, one.id).clip.transform.x, 1); assert.strictEqual(pics(a)[3].transform.x, 0); assert.strictEqual(pics(a)[3].transform.zoom, 3);
  assert.strictEqual(P.setOpacity(base, null, NaN), base);
});
ok('a frozen picture made inside a changed clip keeps its zoom, turn, opacity and colour', () => {
  const c = pics(base)[1];   // the movie playing from 4 s to 30 s
  let p = P.setTransform(base, c.id, { zoom: 2, rot: 90 }); p = P.setOpacity(p, c.id, 0.5); p = P.setFilter(p, c.id, { contrast: 1.3 }); p = P.setVFade(p, c.id, { vFadeIn: 400, vFadeOut: 600 });
  const q = P.insertFreeze(p, 10000, 2000), parts = pics(q).filter(x => x.start >= 4000 && x.start < 32000);
  assert.strictEqual(parts.length, 3); assert.deepStrictEqual(parts.map(x => x.type), ['video', 'freeze', 'video']);
  parts.forEach(x => { assert.deepStrictEqual(x.transform, { zoom: 2, x: 0, y: 0, rot: 90, flipH: false }); assert.strictEqual(x.opacity, 0.5); assert.strictEqual(x.filter.contrast, 1.3); });
  assert.strictEqual('vFadeIn' in parts[1] || 'vFadeOut' in parts[1], false, 'the held part has no fades of its own');
  assert.strictEqual(parts[0].vFadeIn, 400); assert.strictEqual('vFadeOut' in parts[0], false);
  assert.strictEqual(parts[2].vFadeOut, 600); assert.strictEqual('vFadeIn' in parts[2], false);
  assert.deepStrictEqual(P.validate(q), []);
  const plain = pics(P.insertFreeze(base, 10000, 2000)).find(x => x.start === 10000);
  assert.strictEqual('transform' in plain || 'opacity' in plain || 'filter' in plain, false, 'a plain picture adds nothing');
  const held = pics(base)[0], pz = P.setTransform(base, held.id, { rot: 270 }), grown = P.insertFreeze(pz, 2000, 1000);
  assert.strictEqual(P.findClip(grown, held.id).clip.transform.rot, 270, 'making a held picture longer keeps its look');
});
ok('splitting or cutting a clip with fades does not put fades at the cut', () => {
  const c = pics(base)[1], p = P.setVFade(base, c.id, { vFadeIn: 500, vFadeOut: 700 });
  const s = P.splitAt(p, 15000), l = P.findClip(s, c.id).clip, r = pics(s).find(x => x.start === 15000);
  assert.strictEqual(l.vFadeIn, 500); assert.strictEqual(l.vFadeOut, undefined); assert.strictEqual(r.vFadeIn, undefined); assert.strictEqual(r.vFadeOut, 700);
  const cut = P.rippleDelete(p, 10000, 12000), l2 = P.findClip(cut, c.id).clip, r2 = pics(cut).find(x => x.start === 10000);
  assert.strictEqual(l2.vFadeIn, 500); assert.strictEqual(l2.vFadeOut, undefined); assert.strictEqual(r2.vFadeIn, undefined); assert.strictEqual(r2.vFadeOut, 700);
  const two = P.splitAt(s, 20000); assert.strictEqual(pics(two).filter(x => x.vFadeIn || x.vFadeOut).length, 2, 'only the first start and the last end keep a fade');
});
ok('voice timing: shifting the voice gives exactly what building the project again would', () => {
  [null, 59000].forEach(vd => {
    const b0 = P.compileFromSession(mkSess({ voiceDurMs: vd }));
    [-500, -300, -101, -100, -50, 0, 50, 200, 500].forEach(N => {
      const want = voice(P.compileFromSession(mkSess({ voiceDurMs: vd, voiceNudgeMs: N })))[0], got = voice(P.shiftVoice(b0, N))[0];
      assert.deepStrictEqual([got.start, got.in, got.dur], [want.start, want.in, want.dur], 'nudge ' + N + ', recording length ' + vd);
    });
  });
  assert.strictEqual(P.shiftVoice(base, 0), base);
});
ok('voice timing: only the voice moves, the result is valid, and the original is untouched', () => {
  const snap = JSON.stringify(base.tracks), q = P.shiftVoice(base, 300);
  assert.strictEqual(JSON.stringify(base.tracks), snap); assert.deepStrictEqual(P.validate(q), []);
  assert.strictEqual(JSON.stringify(q.tracks.filter(t => t.role !== 'voice')), JSON.stringify(base.tracks.filter(t => t.role !== 'voice')));
  assert.strictEqual(q.durationMs, base.durationMs);
  const far = P.shiftVoice(base, -100000); assert.strictEqual(voice(far).length, 0, 'a voice moved wholly before the start is gone, not negative');
});
ok('voice timing keeps your other edits, also after cuts, and applies to every undo step', () => {
  const h = new P.EditHistory(); h.reset(base);
  const t1 = {}, a = h.commit(P.addTextClip(base, 5000, 3000, t1)), b = h.commit(P.rippleDelete(a, 20000, 22000));
  assert.strictEqual(voice(b).length, 2);
  h.mapAll(p => P.shiftVoice(p, 250));
  [h.cur].concat(h.past).forEach(p => { assert.strictEqual(voice(p)[0].start, 350); assert.deepStrictEqual(P.validate(p), []); });
  assert.strictEqual(P.textsAt(h.cur, 6000).length, 1); assert.strictEqual(h.cur.durationMs, 58000);
  assert.strictEqual(voice(h.cur)[1].start - voice(h.cur)[0].start, voice(b)[1].start - voice(b)[0].start, 'the cut keeps the same spacing');
  const u = h.undo(); assert.strictEqual(voice(u)[0].start, 350, 'undoing never brings back the old timing');
  assert.strictEqual(new P.EditHistory().mapAll(p => p), null, 'an empty history is fine');
});

console.log('\n' + n + ' checks passed');