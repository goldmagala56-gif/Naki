'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const P = require('../www/project.js'), PL = require('../www/plan.js'), E = require('../www/export-engine.js');
const WC = require('../www/webcodecs-export.js').WebCodecsExport;
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const aclip = (id, start, dur) => ({ id, type: 'audio', asset: 'music', start, dur, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 });
const base = { naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, music: { type: 'audio', durMs: 60000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 10000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] },
    { id: 't-music', kind: 'audio', role: 'music', muted: false, hidden: false, volume: 1, locked: false, clips: [aclip('m1', 0, 4000), aclip('m2', 4000, 4000)] }] };
const afx = (p, id) => P.findClip(p, id).clip.afx;

ok('effects are kept inside their ranges, neutral ones are not stored, and 0 takes one away', () => {
  let p = P.setAudioFx(base, 'm1', { bass: 40, pitch: -30, echo: 2, normalize: true });
  assert.deepStrictEqual(afx(p, 'm1'), { bass: 12, pitch: -12, echo: 1, normalize: true });
  p = P.setAudioFx(p, 'm1', { bass: 0, pitch: 0, echo: 0, normalize: false }); assert.strictEqual(afx(p, 'm1'), undefined);
  assert.strictEqual(P.setAudioFx(base, 'm1', { bass: 0 }), base, 'nothing changes, same project');
  assert.strictEqual(P.setAudioFx(base, 'vA', { bass: 5 }), base, 'not for picture clips');
});
ok('only what is mentioned changes, and Whole row reaches every clip on the row', () => {
  let p = P.setAudioFx(base, 'm1', { bass: 6 }); p = P.setAudioFx(p, 'm1', { treble: -3 });
  assert.deepStrictEqual(afx(p, 'm1'), { bass: 6, treble: -3 }); assert.strictEqual(afx(p, 'm2'), undefined);
  const all = P.setAudioFx(base, 'm1', { pitch: 4 }, true); assert.strictEqual(afx(all, 'm1').pitch, 4); assert.strictEqual(afx(all, 'm2').pitch, 4);
});
ok('a cut keeps the effects on both pieces, and differently treated neighbours are not joined', () => {
  const p = P.splitAt(P.setAudioFx(base, 'm1', { echo: 0.5 }), 2000), cs = p.tracks[1].clips;
  assert.strictEqual(cs.length, 3); assert.deepStrictEqual(cs[0].afx, { echo: 0.5 }); assert.deepStrictEqual(cs[1].afx, { echo: 0.5 });
  const q = P.setAudioFx(p, cs[1].id, { echo: 0 }), out = {}; P.joinWithNext(q, cs[0].id, out); assert(!out.merged);
});
ok('the effects reach the export plan', () => {
  const p = P.setAudioFx(base, 'm1', { bass: 6, pitch: 3 });
  const a = PL.projectToPlan(p).audio.filter(x => x.src === 'music'); assert.deepStrictEqual(a[0].afx, { bass: 6, pitch: 3 }); assert.strictEqual(a[1].afx, undefined);
});
ok('the ffmpeg job builds the equalizer, pitch, echo and loudness filters, and a plain clip is unchanged', () => {
  const info = { width: 320, height: 180, sar: 1, hasAudio: true, audioMono: false, durationSec: 8 };
  const mk = afx => ({ durationMs: 1000, movie: { name: 'm', durationMs: 8000 }, video: [{ type: 'play', sessionStart: 0, sessionEnd: 1000, movieStart: 0 }],
    audio: [Object.assign({ src: 'movie', startMs: 0, durMs: 1000, inMs: 0, points: [[0, 1]] }, afx ? { afx } : {})] });
  const snd = plan => E.planToJobs(plan, info, { height: 180 }).jobs.filter(j => /^sound/.test(j.label))[0].args.join(' ');
  const s = snd(mk({ bass: 6, mid: -3, treble: 4, pitch: 12, echo: 0.5, normalize: true }));
  ['bass=g=6:f=100', 'equalizer=f=1000:t=q:w=1:g=-3', 'treble=g=4:f=5000', 'asetrate=96000', 'atempo=0.50000', 'aecho=', 'loudnorm='].forEach(x => assert(s.includes(x), x + ' in ' + s));
  const plain = snd(mk(null)); ['bass=', 'asetrate', 'aecho', 'loudnorm'].forEach(x => assert(!plain.includes(x), x));
});
ok('a plan with sound effects goes to the ffmpeg engine; one without can still use the fast engine', () => {
  const v = [{ type: 'play', sessionStart: 0, sessionEnd: 1000, movieStart: 0 }], au = { src: 'music', startMs: 0, durMs: 1000, inMs: 0, points: [[0, 1]] };
  assert.strictEqual(WC.canRender({ durationMs: 1000, video: v, audio: [au] }), true);
  assert.strictEqual(WC.canRender({ durationMs: 1000, video: v, audio: [Object.assign({ afx: { echo: 0.3 } }, au)] }), false);
});
ok('the editor has the Sound FX button and panel', () => {
  const ed = read('editor.js'); ["id: 'edAudioFx'", 'PANELS.audiofx =', 'P.setAudioFx'].forEach(s => assert(ed.includes(s), s));
});
console.log('\n' + n + ' checks passed');