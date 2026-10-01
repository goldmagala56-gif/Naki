'use strict';
// Run with:  node tests/project.test.js   (or: npm test)
const assert = require('assert');
const C = require('../www/core.js');
const P = require('../www/project.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const events = [
  { t: 0, type: 'rec_start', movieMs: 0 }, { t: 0, type: 'vol', value: 1 },
  { t: 0, type: 'duck', enabled: true, thresholdDb: -40, duckedGain: 0.2 },
  { t: 4000, type: 'play', movieMs: 0 }, { t: 65000, type: 'pause', movieMs: 61000 },
  { t: 82000, type: 'play', movieMs: 61000 }, { t: 90000, type: 'jump', fromMs: 69000, toMs: 59000 },
  { t: 100000, type: 'rec_stop' }
];
const nn = Math.ceil(100000 / 50) + 1, levels = [];
for (let i = 0; i < nn; i++) { const t = i * 50; levels.push(C.dbToByte(t >= 10000 && t < 20000 ? -20 : (t >= 66000 && t < 80000 ? -78 : -60))); }
const sess = { events, levels, durationMs: 100000, movieName: 'x.mp4', movieDurMs: 7200000, voiceOffsetMs: 120, voiceNudgeMs: -30,
  music: { startMs: 5000, volume: 0.5, fadeInMs: 1000, fadeOutMs: 2000 } };
const base = P.compileFromSession(sess);

// what the viewer sees/hears at time t, in a comparable form
const view = (p, t) => {
  const s = P.sourceAt(p, t), a = {};
  s.audio.forEach(x => { a[x.role] = { src: x.sourceMs, gain: x.gain }; });
  return { v: s.video && { type: s.video.type, ms: s.video.movieMs }, a };
};
const same = (x, y, msg) => {
  assert.deepStrictEqual(x.v, y.v, msg + ' (picture)');
  assert.deepStrictEqual(Object.keys(x.a).sort(), Object.keys(y.a).sort(), msg + ' (tracks)');
  Object.keys(x.a).forEach(k => { assert.strictEqual(x.a[k].src, y.a[k].src, msg + ' (' + k + ' source)'); assert(Math.abs(x.a[k].gain - y.a[k].gain) < 2e-3, msg + ' (' + k + ' gain ' + x.a[k].gain + ' vs ' + y.a[k].gain + ')'); });
};
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

ok('a compiled project is valid and covers the whole session', () => {
  assert.deepStrictEqual(P.validate(base), []);
  assert.strictEqual(base.durationMs, 100000);
  const v = base.tracks[0].clips; let cur = 0; v.forEach(c => { assert.strictEqual(c.start, cur); cur += c.dur; }); assert.strictEqual(cur, 100000);
});
ok('compiled project matches the original playback logic at every moment', () => {
  for (let t = 0; t < 100000; t += 137) {
    const st = C.stateAt(events, t), s = P.sourceAt(base, t);
    assert.strictEqual(s.video.type, st.playing ? 'video' : 'freeze', 'type at ' + t);
    assert.strictEqual(s.video.movieMs, st.movieMs, 'movie position at ' + t);
  }
});
ok('movie sound only exists while the movie plays; voice and music are placed correctly', () => {
  assert(!P.sourceAt(base, 1000).audio.some(a => a.role === 'movieSound'));
  assert(P.sourceAt(base, 5000).audio.some(a => a.role === 'movieSound'));
  const v = base.tracks[2].clips[0]; assert.strictEqual(v.start, 90); assert.strictEqual(v.in, 0);
  const m = P.sourceAt(base, 5500).audio.find(a => a.role === 'music'); assert(Math.abs(m.gain - 0.25) < 1e-6, 'music fades in: ' + m.gain);
  assert(!P.sourceAt(base, 4000).audio.some(a => a.role === 'music'));
});
ok('the movie sound is lowered while the voice is loud (same curve as before)', () => {
  assert(P.sourceAt(base, 15000).audio.find(a => a.role === 'movieSound').gain < 0.25);
  assert(P.sourceAt(base, 30000).audio.find(a => a.role === 'movieSound').gain > 0.95);
});
ok('splitting changes nothing you see or hear, and keeps linked pieces linked', () => {
  let p = base; [7000, 30000, 30000, 65000, 91000, 4000].forEach(t => { p = P.splitAt(p, t); });
  assert.deepStrictEqual(P.validate(p), []);
  for (let t = 0; t < 100000; t += 211) same(view(base, t), view(p, t), 'at ' + t);
  assert(p.tracks[0].clips.length > base.tracks[0].clips.length);
  const c = p.tracks[0].clips.find(c => c.start === 30000), a = p.tracks[1].clips.find(c => c.start === 30000);
  assert(c.link && c.link === a.link);
});
ok('cutting out a section moves everything after it earlier, exactly', () => {
  for (let k = 0; k < 60; k++) {
    let a = Math.round(rnd() * 90000), b = a + 1 + Math.round(rnd() * 15000);
    if (b > 100000) b = 100000;
    const q = P.rippleDelete(base, a, b), gap = b - a;
    assert.deepStrictEqual(P.validate(q), [], 'valid after cutting ' + a + '-' + b);
    assert.strictEqual(q.durationMs, 100000 - gap);
    for (let i = 0; i < 25; i++) {
      const t = Math.floor(rnd() * q.durationMs), orig = t < a ? t : t + gap;
      same(view(base, orig), view(q, t), 'cut ' + a + '-' + b + ' at ' + t);
    }
  }
});
ok('several cuts at once give the same result as one after another', () => {
  const r = [{ start: 10000, end: 12000 }, { start: 50000, end: 53000 }, { start: 70000, end: 71000 }];
  const q = P.rippleDeleteRanges(base, r), q2 = P.rippleDelete(P.rippleDelete(P.rippleDelete(base, 70000, 71000), 50000, 53000), 10000, 12000);
  assert.strictEqual(q.durationMs, 94000); for (let t = 0; t < 94000; t += 301) same(view(q, t), view(q2, t), 'at ' + t);
});
ok('cutting also removes that stretch of the microphone history', () => {
  const q = P.rippleDelete(base, 10000, 20000);
  assert.strictEqual(q.levels.length, base.levels.length - 200);
  assert.strictEqual(base.levels.length, nn);
});
ok('trimming the end and start of a clip', () => {
  const p1 = base.tracks[0].clips.find(c => c.type === 'video' && c.start === 4000);
  const q = P.trimClipEnd(base, p1.id, 50000);
  const c = P.findClip(q, p1.id).clip; assert.strictEqual(c.dur, 46000);
  assert.strictEqual(P.findClip(q, base.tracks[1].clips.find(x => x.link === p1.link).id).clip.dur, 46000);
  assert.deepStrictEqual(P.validate(q), []);
  const q2 = P.trimClipStart(base, p1.id, 9000), c2 = P.findClip(q2, p1.id).clip;
  assert.strictEqual(c2.start, 9000); assert.strictEqual(c2.in, 5000); assert.strictEqual(c2.dur, 56000);
  same(view(base, 20000), view(q2, 20000), 'trim start keeps the picture at the same moment');
  assert.strictEqual(P.trimClipEnd(base, p1.id, 999999999), base, 'stretching into the next clip is refused');
});
ok('moving a clip is refused if it would overlap another one', () => {
  const m = base.tracks[2].clips[0], q = P.moveClip(base, m.id, 500); assert.strictEqual(P.findClip(q, m.id).clip.start, 500);
  const fz = base.tracks[0].clips[1]; assert.strictEqual(P.moveClip(base, fz.id, fz.start + 10), base);
});
ok('fades survive cutting and trimming', () => {
  const m = base.tracks.find(t => t.role === 'music');
  const q = P.splitAt(P.splitAt(base, 5400), 60000), g = [];
  for (let t = 5000; t < 7000; t += 100) g.push(P.sourceAt(q, t).audio.find(a => a.role === 'music').gain);
  for (let i = 1; i < g.length; i++) assert(g[i] >= g[i - 1] - 1e-9, 'fade-in stays smooth across a cut');
  const tail = P.sourceAt(base, 99000).audio.find(a => a.role === 'music').gain, tail2 = P.sourceAt(q, 99000).audio.find(a => a.role === 'music').gain;
  assert(Math.abs(tail - tail2) < 1e-9 && tail < 0.5);
  const id = m.clips[0].id, tr = P.trimClipEnd(base, id, 80000);
  assert(P.sourceAt(tr, 79999).audio.find(a => a.role === 'music').gain < 0.01, 'fade-out moves to the new end');
});
ok('deleting a clip removes its linked sound and leaves a gap', () => {
  const c = base.tracks[0].clips.find(c => c.type === 'video' && c.start === 4000), q = P.deleteClip(base, c.id);
  assert(!P.sourceAt(q, 10000).video); assert(!P.sourceAt(q, 10000).audio.some(a => a.role === 'movieSound')); assert(P.sourceAt(q, 10000).audio.some(a => a.role === 'voice'));
});
ok('muting a track silences it; track and clip volume multiply', () => {
  const m = P.setTrackProps(base, 't-voice', { muted: true }); assert.strictEqual(P.sourceAt(m, 20000).audio.find(a => a.role === 'voice').gain, 0);
  const v = P.setTrackProps(P.setClipProps(base, base.tracks[2].clips[0].id, { volume: 0.5 }), 't-voice', { volume: 0.5 });
  assert(Math.abs(P.sourceAt(v, 20000).audio.find(a => a.role === 'voice').gain - 0.25) < 1e-9);
});
ok('quiet stretches are found, and only dead air on a held picture can be picked out', () => {
  const lv = []; for (let i = 0; i < nn; i++) { const t = i * 50; lv.push(C.dbToByte((t >= 66000 && t < 80000) || (t >= 30000 && t < 32000) ? -78 : -20)); }
  const sil = P.findSilentRanges(lv, { thresholdDb: -45, minMs: 700, padMs: 150 });
  assert.deepStrictEqual(sil, [{ start: 30150, end: 31850 }, { start: 66150, end: 79850 }]);
  assert.deepStrictEqual(P.findSilentRanges(lv, { minMs: 20000 }), []);
  const dead = P.intersectRanges(sil, P.freezeRanges(base));
  assert.deepStrictEqual(dead, [{ start: 66150, end: 79850 }]);
  const q = P.rippleDeleteRanges(base, dead); assert.strictEqual(q.durationMs, 100000 - 13700);
});
ok('undo and redo step through edits', () => {
  const h = new P.EditHistory(); h.reset(base);
  const a = h.commit(P.splitAt(base, 30000)), b = h.commit(P.rippleDelete(a, 1000, 2000));
  assert.strictEqual(h.undo(), a); assert.strictEqual(h.undo(), base); assert.strictEqual(h.undo(), base);
  assert.strictEqual(h.redo(), a); assert.strictEqual(h.redo(), b);
  h.undo(); const c = h.commit(P.splitAt(a, 40000)); assert.strictEqual(h.redo(), c, 'a new edit clears redo');
});
ok('snapping lands on clip edges and the playhead, otherwise leaves time alone', () => {
  assert.strictEqual(P.snapTime(base, 4050, 100), 4000); assert.strictEqual(P.snapTime(base, 4500, 100), 4500);
  assert.strictEqual(P.snapTime(base, 12080, 100, [12000]), 12000);
});
ok('edits never change the project they started from', () => {
  const before = JSON.stringify(base.tracks);
  P.splitAt(base, 30000); P.rippleDelete(base, 100, 5000); P.trimClipEnd(base, base.tracks[0].clips[1].id, 20000); P.deleteClip(base, base.tracks[0].clips[1].id);
  assert.strictEqual(JSON.stringify(base.tracks), before);
});

// ---------- text, speed, fades, filters, freeze frames, music ----------
const vclip = (p, start) => p.tracks[0].clips.find(c => c.start === start);
ok('text: add, edit, see it at the right moments, and it survives cutting', () => {
  const out = {}; let p = P.addTextClip(base, 12000, 3000, out);
  assert(out.id); assert.deepStrictEqual(P.validate(p), []);
  assert.strictEqual(P.textsAt(p, 13000).length, 1); assert.strictEqual(P.textsAt(p, 15000).length, 0); assert.strictEqual(P.textsAt(p, 11999).length, 0);
  p = P.setTextProps(p, out.id, { text: 'Hello', size: 40, color: '#ff0000', pos: 'top' });
  const c = P.findClip(p, out.id).clip; assert.strictEqual(c.text, 'Hello'); assert.strictEqual(c.size, 16, 'size is kept within range'); assert.strictEqual(c.pos, 'top');
  assert.strictEqual(P.sourceAt(p, 13000).audio.filter(a => a.role === 'text').length, 0, 'text is not sound');
  const cut = P.rippleDelete(p, 10000, 13000);   // cuts the first second of the text
  assert.strictEqual(P.textsAt(cut, 10000).length, 1); assert.strictEqual(P.findClip(cut, out.id).clip.dur, 2000);
  const sp = P.splitAt(p, 13500); assert.strictEqual(P.textsAt(sp, 12500)[0].text, 'Hello'); assert.strictEqual(P.textsAt(sp, 14000)[0].text, 'Hello');
  assert.deepStrictEqual(P.validate(sp), []);
  assert.strictEqual(P.trimClipStart(p, out.id, 11000) !== p, true, 'text can be stretched to start earlier');
});
ok('text: a new text never overlaps another and never runs past the end of the video', () => {
  const a = {}, b = {}; let p = P.addTextClip(base, 5000, 4000, a); p = P.addTextClip(p, 6000, 4000, b);
  assert.strictEqual(P.findClip(p, b.id).clip.start, 9000); assert.deepStrictEqual(P.validate(p), []);
  const late = {}; const q = P.addTextClip(base, 99000, 5000, late); assert.strictEqual(P.findClip(q, late.id).clip.dur, 1000); assert.strictEqual(q.durationMs, 100000);
  assert.strictEqual(P.addTextClip(base, 99900, 5000, {}), base, 'too little room left: nothing is added');
});
ok('speed: the picture and its sound change together and the movie clips after it close up or move back', () => {
  const c = vclip(base, 4000), ms = base.tracks[1].clips.find(x => x.link === c.link), after = vclip(base, 65000), voiceBefore = JSON.stringify(base.tracks[2].clips);
  const q = P.setClipSpeed(base, c.id, 2), c2 = P.findClip(q, c.id).clip, m2 = P.findClip(q, ms.id).clip;
  assert.strictEqual(c2.dur, 30500); assert.strictEqual(m2.dur, 30500); assert.strictEqual(c2.speed, 2); assert.strictEqual(m2.speed, 2);
  assert.strictEqual(vclip(q, 65000 - 30500).id, after.id, 'the next picture clip moved up');
  assert.strictEqual(JSON.stringify(q.tracks[2].clips), voiceBefore, 'voice is not touched');
  assert.deepStrictEqual(P.validate(q), []);
  const a = P.sourceAt(q, 4000 + 10000);   // 10 s in at 2x = 20 s of movie
  assert.strictEqual(a.video.movieMs, 20000); assert.strictEqual(a.audio.find(x => x.role === 'movieSound').sourceMs, 20000);
  const e = P.sourceAt(q, 4000 + 30499); assert(Math.abs(e.video.movieMs - 60998) <= 2, 'the clip still covers the same stretch of movie');
  const slow = P.setClipSpeed(base, c.id, 0.5); assert.strictEqual(P.findClip(slow, c.id).clip.dur, 122000); assert.strictEqual(vclip(slow, 65000 + 61000).id, after.id); assert.deepStrictEqual(P.validate(slow), []);
  assert.strictEqual(P.setClipSpeed(base, c.id, 1), base, 'same speed changes nothing');
  assert.strictEqual(P.setClipSpeed(base, vclip(base, 0).id, 2), base, 'a paused picture has no speed');
  assert.strictEqual(P.findClip(P.setClipSpeed(base, c.id, 99), c.id).clip.speed, 4, 'speed is kept within 0.25x to 4x');
  const gainsBefore = P.sourceAt(base, 15000).audio.find(x => x.role === 'movieSound').gain;   // ducked under the voice at 10-20 s
  const fast = P.setClipSpeed(base, c.id, 2), gMid = P.sourceAt(fast, 4000 + 5500).audio.find(x => x.role === 'movieSound').gain;   // 15 s of movie-time = 5.5 s in
  assert(Math.abs(gMid - gainsBefore) < 0.35 || gMid < 0.5, 'the lowered-sound curve is stretched with the clip: ' + gMid);
});
ok('fades to black and filters are kept per clip and within range', () => {
  const c = vclip(base, 4000);
  let q = P.setVFade(base, c.id, { vFadeIn: 500, vFadeOut: 99999 }); const c2 = P.findClip(q, c.id).clip;
  assert.strictEqual(c2.vFadeIn, 500); assert.strictEqual(c2.vFadeOut, 1500);
  q = P.setVFade(q, c.id, { vFadeIn: 0 }); assert.strictEqual(P.findClip(q, c.id).clip.vFadeIn, undefined);
  assert.strictEqual(P.setVFade(base, base.tracks[2].clips[0].id, { vFadeIn: 500 }), base, 'only picture clips fade');
  const f = P.setFilter(base, c.id, { brightness: 9, contrast: 0.1 }); const fc = P.findClip(f, c.id).clip.filter;
  assert.deepStrictEqual(fc, { brightness: 1.6, contrast: 0.4, saturate: 1 });
  assert.strictEqual(P.findClip(P.setFilter(f, c.id, { brightness: 1, contrast: 1, saturate: 1 }), c.id).clip.filter, undefined, 'back to normal removes the filter');
  const all = P.setFilter(base, null, { saturate: 0 }); assert(all.tracks[0].clips.every(x => x.filter && x.filter.saturate === 0));
  assert.strictEqual(P.sourceAt(f, 10000).video.clip.filter.brightness, 1.6);
  const cut = P.rippleDelete(f, 20000, 30000); assert.deepStrictEqual(P.findClip(cut, c.id).clip.filter, fc, 'filter and fades stay on pieces after a cut');
});
ok('freeze frame: holds the picture, and everything after it moves later by the same amount', () => {
  const T = 30000, D = 2000, q = P.insertFreeze(base, T, D);
  assert.deepStrictEqual(P.validate(q), []); assert.strictEqual(q.durationMs, 100000 + D);
  for (let t = 0; t < T; t += 173) same(view(base, t), view(q, t), 'before at ' + t);
  const mid = P.sourceAt(q, T + 1000); assert.strictEqual(mid.video.type, 'freeze'); assert.strictEqual(mid.video.movieMs, C.stateAt(events, T).movieMs);
  assert(!mid.audio.some(a => a.role === 'movieSound'), 'no movie sound while held');
  for (let t = T + D; t < 100000; t += 211) {
    const a = view(base, t - D), b = view(q, t);
    assert.deepStrictEqual(a.v, b.v, 'picture after at ' + t);
    ['movieSound', 'voice'].forEach(k => { assert.strictEqual(!!a.a[k], !!b.a[k], k + ' present at ' + t); if (a.a[k]) assert.strictEqual(a.a[k].src, b.a[k].src, k + ' source at ' + t); });
  }
  assert.strictEqual(P.sourceAt(q, 50000).audio.find(a => a.role === 'music').sourceMs, P.sourceAt(base, 50000).audio.find(a => a.role === 'music').sourceMs, 'music keeps playing');
  assert.strictEqual(q.levels.length, base.levels.length + 40);
  assert.strictEqual(P.insertFreeze(base, 30000, 0), base);
});
ok('freeze frame on an already held picture makes it longer; and titles stay up through it', () => {
  const fz = base.tracks[0].clips.find(c => c.type === 'freeze' && c.start === 65000), T = 70000;
  const q = P.insertFreeze(base, T, 3000); assert.strictEqual(P.findClip(q, fz.id).clip.dur, fz.dur + 3000); assert.deepStrictEqual(P.validate(q), []);
  const tx = {}; const pt = P.addTextClip(base, 28000, 6000, tx), q2 = P.insertFreeze(pt, 30000, 2000);
  assert.strictEqual(P.findClip(q2, tx.id).clip.dur, 8000); assert.strictEqual(P.textsAt(q2, 31000).length, 1);
});
ok('music: added once, swappable, removable, and it follows the usual clip rules', () => {
  const noMusic = P.compileFromSession(Object.assign({}, sess, { music: null }));
  assert(!noMusic.tracks.some(t => t.role === 'music'));
  const a = P.ensureMusic(noMusic, { name: 'song.mp3', durMs: 60000 }), mt = a.tracks.find(t => t.role === 'music');
  assert.strictEqual(mt.clips.length, 1); assert.strictEqual(mt.clips[0].dur, 60000); assert.strictEqual(mt.clips[0].volume, 0.7); assert.deepStrictEqual(P.validate(a), []);
  assert(a.tracks.findIndex(t => t.role === 'music') < 4, 'music sits with the other sound tracks');
  const b = P.ensureMusic(a, { name: 'other.mp3', durMs: 40000 }); assert.strictEqual(b.tracks.filter(t => t.role === 'music').length, 1); assert.strictEqual(b.tracks.find(t => t.role === 'music').clips[0].dur, 40000); assert.strictEqual(b.assets.music.name, 'other.mp3');
  const long = P.ensureMusic(noMusic, { name: 's', durMs: 999999 }); assert.strictEqual(long.tracks.find(t => t.role === 'music').clips[0].dur, 100000, 'music is never longer than the video');
  const r = P.removeMusic(b); assert(!r.tracks.some(t => t.role === 'music')); assert(!r.assets.music);
  const split = P.splitAt(a, 20000); assert.strictEqual(split.tracks.find(t => t.role === 'music').clips.length, 2);
});
ok('edits that use the new tools also leave the original project untouched', () => {
  const snap = JSON.stringify(base.tracks), c = vclip(base, 4000);
  P.addTextClip(base, 10, 3000, {}); P.setClipSpeed(base, c.id, 2); P.setVFade(base, c.id, { vFadeIn: 500 }); P.setFilter(base, null, { contrast: 1.3 }); P.insertFreeze(base, 30000, 2000); P.ensureMusic(base, { name: 'x', durMs: 1000 });
  assert.strictEqual(JSON.stringify(base.tracks), snap);
});

console.log('\n' + n + ' checks passed');