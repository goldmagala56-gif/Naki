'use strict';
// node tests/motion.test.js
// Text animation and clip motion: the numbers, the drawing, the project edits, the export plan and the pictures the ffmpeg engine makes.
const assert = require('assert'), fs = require('fs'), path = require('path');
const M = require('../www/motion.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

// ---------- the numbers ----------
ok('text state: fade, slide, pop and bounce start hidden or small and end exactly normal', () => {
  ['fade', 'slideup', 'slidedown', 'slideleft', 'slideright', 'pop', 'bounce', 'spin'].forEach(k => {
    const a = M.textState({ in: k }, 0, 3000), z = M.textState({ in: k }, 500, 3000);
    assert(a.alpha < 0.01 || a.scale < 0.05, k + ' starts hidden or small: ' + JSON.stringify(a));
    assert.deepStrictEqual([z.alpha, z.dx, z.dy, z.scale, z.rot, z.chars], [1, 0, 0, 1, 0, 1], k + ' ends normal');
  });
  assert.strictEqual(M.textState({ in: 'fade' }, 250, 3000).alpha, 0.5);
  assert(M.textState({ in: 'pop' }, 350, 3000).scale > 1, 'pop overshoots a little');
});
ok('text state: out mirrors in, the length is kept to half of the text, and a loop never hides the text', () => {
  assert.strictEqual(M.textState({ out: 'fade' }, 1000, 3000).alpha, 1);
  assert(M.textState({ out: 'fade' }, 2990, 3000).alpha < 0.05);
  assert.strictEqual(M.phaseMs({ inMs: 2000 }, 'in', 1000), 500, 'half of a 1 s title');
  assert.strictEqual(M.phaseMs({}, 'out', 4000), 500, 'default 0.5 s');
  for (let t = 0; t < 3000; t += 50) { const s = M.textState({ loop: 'pulse' }, t, 3000); assert(s.alpha === 1 && s.scale > 0.9 && s.scale < 1.1); }
  assert.strictEqual(M.textState({ in: 'typewriter' }, 250, 3000).chars, 0.5);
  assert.strictEqual(M.textState({ out: 'typewriter' }, 2750, 3000).chars, 0.5, 'erase: half gone halfway');
  assert.strictEqual(M.textState(null, 100, 1000).alpha, 1);
});
ok('typed text: the first letters, by whole characters', () => {
  assert.strictEqual(M.visibleText('hello', 0.4), 'he'); assert.strictEqual(M.visibleText('hello', 1), 'hello'); assert.strictEqual(M.visibleText('hello', 0), '');
  assert.strictEqual(M.visibleText('a😀b', 0.7), 'a😀', 'an emoji is one character');
});
ok('timeline: covers the title from start to end, merges the steady middle, and stays small', () => {
  const t = M.textTimeline({ in: 'fade', out: 'fade' }, 3000, 5);
  assert.strictEqual(t[0].a, 0); assert.strictEqual(t[t.length - 1].b, 3000);
  t.forEach((s, i) => { assert(s.b > s.a); if (i) assert(s.a >= t[i - 1].b); });
  const mid = t.filter(s => s.st.alpha === 1); assert.strictEqual(mid.length, 1, 'one picture for the steady part'); assert(mid[0].a <= 600 && mid[0].b >= 2400);
  assert(M.textTimeline({ in: 'fade', out: 'fade', loop: 'pulse' }, 3000, 5).length <= M.MAX_STATES);
  assert.strictEqual(M.textTimeline({ loop: 'pulse' }, 20000).length, 1, 'a long title cannot keep its loop in the ffmpeg engine');
  assert.strictEqual(M.textTimeline({}, 3000), null); assert.strictEqual(M.textTimeline(null, 3000), null);
  const ty = M.textTimeline({ in: 'typewriter' }, 3000, 10); assert(ty.length <= 10 && ty.every(s => s.st.chars > 0));
});
ok('clip presets: picture and overlay keyframes start and end where they should', () => {
  assert.deepStrictEqual(M.clipPreset('picture', 'zoomin', 4000), { zoom: [[0, 1], [4000, 1.3]] });
  assert.deepStrictEqual(M.clipPreset('picture', 'panright', 4000).x, [[0, -1], [4000, 1]]);
  assert.strictEqual(M.clipPreset('picture', 'nope', 4000), null);
  const base = { x: 0.7, y: 0.3, size: 0.4, rot: 0, opacity: 1 };
  assert(M.clipPreset('overlay', 'slideleft', 3000, base).x[0][1] < 0); assert.strictEqual(M.clipPreset('overlay', 'slideleft', 3000, base).x[1][1], 0.7);
  assert(M.clipPreset('overlay', 'slideright', 3000, base).x[0][1] > 1);
  assert.deepStrictEqual(M.clipPreset('overlay', 'fadeout', 3000, base).opacity, [[2500, 1], [3000, 0]]);
  ['slideleft', 'slideright', 'slideup', 'pop', 'spin', 'fadein', 'fadeout'].forEach(k => {
    [200, 600, 3000].forEach(d => { const kf = M.clipPreset('overlay', k, d, base); Object.keys(kf).forEach(p => kf[p].forEach((pt, i) => { assert(pt[0] >= 0 && pt[0] <= d); if (i) assert(pt[0] >= kf[p][i - 1][0]); })); });
  });
});
ok('drawing: the title is drawn once, moved, turned and faded; typed text redraws only when it changes', () => {
  const log = []; let drawn = 0;
  const mkc = () => ({ getContext: () => ({ clearRect() {}, save() {}, restore() {} }) });
  const g = { save() { log.push('save'); }, restore() { log.push('restore'); }, translate(...a) { log.push(['t', ...a]); }, rotate(a) { log.push(['r', a]); }, scale(...a) { log.push(['s', ...a]); }, drawImage(...a) { log.push(['d', a[1], a[2]]); }, set globalAlpha(v) { log.push(['a', v]); } };
  const o = { drawFn: (cg, t) => { drawn++; return ['l1', 'l2']; }, makeCanvas: mkc, cache: {} }, t = { text: 'Hello', size: 10, pos: 'bottom' };
  M.drawTitleState(g, t, { alpha: 0.5, dx: 0.1, dy: 0, scale: 2, rot: 0, chars: 1 }, 1000, 500, o);
  assert.strictEqual(drawn, 1); assert(log.some(c => c[0] === 'a' && c[1] === 0.5)); assert(log.some(c => c[0] === 's' && c[1] === 2)); assert.deepStrictEqual(log.find(c => c[0] === 't').slice(1, 2), [600]);
  M.drawTitleState(g, t, { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, chars: 1 }, 1000, 500, o); assert.strictEqual(drawn, 1, 'same text: not drawn again');
  M.drawTitleState(g, t, { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, chars: 0.4 }, 1000, 500, o); assert.strictEqual(drawn, 2, 'typed part changed');
  const before = log.length; M.drawTitleState(g, t, { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, chars: 0 }, 1000, 500, o); assert.strictEqual(log.length, before, 'nothing typed yet: nothing drawn');
});

// ---------- the project, the plan and the ffmpeg engine (need the rest of the app) ----------
const have = ['project.js', 'plan.js', 'export-engine.js'].every(f => fs.existsSync(path.join(__dirname, '../www', f)));
if (have) {
  const P = require('../www/project.js'), NP = require('../www/plan.js'), E = require('../www/export-engine.js');
  const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } }, tracks: [
    { id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [0, 1, 2].map(i => ({ id: 'v' + 'ABC'[i], type: 'video', asset: 'movie', start: i * 4000, dur: 4000, in: 10000 + i * 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 })) }] };
  const textAt = (p, id) => P.findClip(p, id).clip;

  ok('text animation: set, change, remove; only the allowed names; titles and captions but not stickers', () => {
    const o = {}; let p = P.addTextClip(base, 1000, 4000, o);
    p = P.setTextAnim(p, o.id, { in: 'fade' }); assert.deepStrictEqual(textAt(p, o.id).anim, { in: 'fade' });
    p = P.setTextAnim(p, o.id, { inMs: 800, loop: 'pulse' }); assert.deepStrictEqual(textAt(p, o.id).anim, { in: 'fade', inMs: 800, loop: 'pulse' });
    assert.strictEqual(P.setTextAnim(p, o.id, { in: 'fade' }), p, 'same setting: the same project');
    assert.strictEqual(P.setTextAnim(p, o.id, { in: 'sparkle' }).tracks.length, p.tracks.length); assert.deepStrictEqual(textAt(P.setTextAnim(p, o.id, { in: 'sparkle' }), o.id).anim.in, undefined, 'unknown name = none');
    p = P.setTextAnim(p, o.id, { in: 'none' }); assert.deepStrictEqual(textAt(p, o.id).anim, { loop: 'pulse' }, 'the length goes with it');
    p = P.setTextAnim(p, o.id, { loop: 'none' }); assert.strictEqual(textAt(p, o.id).anim, undefined);
    const so = {}, st = P.addSticker(base, 0, 2000, '🔥', so); assert.strictEqual(P.setTextAnim(st, so.id, { in: 'fade' }), st);
    assert.strictEqual(P.setTextAnim(base, 'vA', { in: 'fade' }), base);
  });
  ok('text animation: a split keeps the in on the first piece and the out on the last; loops stay on both', () => {
    const o = {}; let p = P.addTextClip(base, 1000, 4000, o); p = P.setTextAnim(p, o.id, { in: 'pop', out: 'fade', loop: 'float', inMs: 700, outMs: 600 });
    const s = P.splitAt(p, 3000), cs = s.tracks.find(t => t.kind === 'text').clips;
    assert.strictEqual(cs.length, 2); assert.deepStrictEqual(cs[0].anim, { in: 'pop', inMs: 700, loop: 'float' }); assert.deepStrictEqual(cs[1].anim, { out: 'fade', outMs: 600, loop: 'float' });
    assert.deepStrictEqual(P.validate(s), []); assert.deepStrictEqual(textAt(p, o.id).anim.in, 'pop', 'the original is untouched');
  });
  ok('caption animation: one look for every caption, and titles are left alone', () => {
    const o = {}; let p = P.addTextClip(base, 8000, 2000, o), out = {};
    p = P.addCaptions(p, [{ startMs: 0, endMs: 1500, text: 'a' }, { startMs: 2000, endMs: 3500, text: 'b' }], {}, out);
    const q = P.setCaptionAnim(p, { in: 'pop', out: 'fade' }), caps = q.tracks.find(t => t.role === 'captions').clips;
    assert(caps.length === 2 && caps.every(c => c.anim.in === 'pop' && c.anim.out === 'fade')); assert.strictEqual(textAt(q, o.id).anim, undefined);
    assert(P.setCaptionAnim(q, {}).tracks.find(t => t.role === 'captions').clips.every(c => c.anim === undefined), 'an empty look clears them');
    assert.strictEqual(P.setCaptionAnim(base, { in: 'pop' }), base, 'no captions: nothing to do');
  });
  ok('motion presets: picture and overlay clips get keyframes; None takes them away; sound clips are refused', () => {
    let p = P.setMotionPreset(base, 'vB', 'zoomin'); assert.deepStrictEqual(textAt(p, 'vB').kf, { zoom: [[0, 1], [4000, 1.3]] });
    p = P.setMotionPreset(p, 'vB', 'panright'); assert.deepStrictEqual(Object.keys(textAt(p, 'vB').kf).sort(), ['x', 'zoom'], 'a new preset replaces the old one');
    p = P.setMotionPreset(p, 'vB', 'none'); assert.strictEqual(textAt(p, 'vB').kf, undefined); assert.strictEqual(P.setMotionPreset(p, 'vB', 'none'), p);
    assert.strictEqual(P.setMotionPreset(base, 'vB', 'nonsense'), base);
    const o = {}, q = P.addOverlay(base, 1000, { name: 'o.png', kind: 'image', w: 100, h: 50 }, o), r = P.setMotionPreset(q, o.id, 'slideleft');
    assert(textAt(r, o.id).kf.x[0][1] < 0); assert.strictEqual(textAt(r, o.id).kf.x[1][1], textAt(q, o.id).x, 'it ends where the overlay sits');
    assert.deepStrictEqual(P.validate(r), []);
    const sp = P.splitAt(r, 2000), pieces = sp.tracks.find(t => t.kind === 'overlay').clips; assert.strictEqual(pieces.length, 2, 'keyframes survive a split');
  });
  ok('plan: titles carry their animation', () => {
    const o = {}; let p = P.addTextClip(base, 1000, 4000, o); p = P.setTextAnim(p, o.id, { in: 'typewriter', inMs: 900 });
    assert.deepStrictEqual(NP.projectToPlan(p).texts[0].anim, { in: 'typewriter', inMs: 900 }); assert.strictEqual(NP.projectToPlan(P.addTextClip(base, 1000, 4000, {})).texts[0].anim, undefined);
  });
  ok('ffmpeg engine: an animated title becomes a few pictures; a plain one is still one', () => {
    const info = { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 6 };
    const mk = (t) => ({ naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 6000 }, video: [{ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0 }], audio: [], texts: [t] });
    const plain = E.planToJobs(mk({ startMs: 0, durMs: 4000, text: 'Hi' }), info, { height: 360 });
    assert.deepStrictEqual(plain.textFiles.map(t => t.name), ['txt000.png']);
    const an = E.planToJobs(mk({ startMs: 0, durMs: 4000, text: 'Hi', anim: { in: 'fade', out: 'fade' } }), info, { height: 360 });
    assert(an.textFiles.length > 2 && an.textFiles.length <= M.MAX_STATES, 'pictures: ' + an.textFiles.length);
    assert(an.textFiles.every(t => /^txt000_\d\d\.png$/.test(t.name) && t.state)); assert.strictEqual(an.textFiles[an.textFiles.length - 1].clip.startMs + an.textFiles[an.textFiles.length - 1].clip.durMs <= 4000, true);
    const a = an.jobs.find(j => j.produces === 'v0000.ts').args; assert(a.some(x => /^txt000_\d\d\.png$/.test(x)), a.join(' '));
  });
} else console.log('  --  project, plan and engine checks skipped (the rest of the app is not next to this file)');
console.log('\n' + n + ' checks passed');
