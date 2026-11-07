'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const www = p => path.join(__dirname, '..', 'www', p);
const P = require('../www/project.js'), RF = require('../www/reframe.js'), PL = require('../www/plan.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const vclip = (id, start, dur, link) => ({ id, type: 'video', asset: 'movie', start, dur, in: start, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link });
const aclip = (id, start, dur, link) => ({ id, type: 'audio', asset: 'movie', start, dur, in: start, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link });
const base = { naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } }, tracks: [
  { id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [vclip('vA', 0, 10000, 'L1')] },
  { id: 't-ms', kind: 'audio', role: 'movieSound', muted: false, hidden: false, volume: 1, locked: false, clips: [aclip('aA', 0, 10000, 'L1')] }] };
const track = []; for (let t = 0; t <= 10000; t += 250) track.push({ ms: t, x: t < 4000 ? 0.2 : 0.8, y: 0.5 });
const SRC = { srcW: 1920, srcH: 1080 };

// ---- reframe.js (pure parts) ----
const grid = (w, h, fn) => { const a = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = fn(x, y); return a; };
ok('a block that moves is found where it moved; two identical plain pictures give nothing', () => {
  const w = 48, h = 27, a = grid(w, h, () => 20), b = grid(w, h, (x, y) => (x >= 36 && x < 44 && y >= 8 && y < 18) ? 230 : 20);
  const c = RF.frameCenter(a, b, w, h); assert.strictEqual(c.kind, 'motion'); assert(c.x > 0.7 && c.x < 0.9, 'x ' + c.x); assert(c.y > 0.3 && c.y < 0.6, 'y ' + c.y); assert(c.conf > 0.1);
  assert.strictEqual(RF.frameCenter(a, a, w, h), null);
});
ok('when nothing moves, the busiest part of the picture is used, with low confidence', () => {
  const w = 48, h = 27, a = grid(w, h, (x, y) => (x < 12 && (x + y) % 2 ? 200 : 20)), c = RF.frameCenter(a, a, w, h);
  assert.strictEqual(c.kind, 'detail'); assert(c.x < 0.3 && c.conf < 0.5);
});
ok('smoothing fills the moments with no clear subject, removes spikes, and keeps values inside 0..1', () => {
  const raw = [0, 1, 2, 3, 4, 5, 6].map(i => ({ ms: i * 500, x: i === 3 ? 0.95 : 0.3, y: 0.5, w: i === 5 ? 0 : 1 }));
  const s = RF.smoothTrack(raw); assert.strictEqual(s.length, 7);
  s.forEach(p => { assert(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1); }); assert(Math.abs(s[3].x - 0.3) < 0.15, 'spike gone: ' + s[3].x); assert(Math.abs(s[5].x - 0.3) < 0.1, 'gap filled');
  assert.deepStrictEqual(RF.smoothTrack([{ ms: 0, x: 0.1, y: 0.1, w: 0 }, { ms: 500, x: 0.9, y: 0.9, w: 0 }]).map(p => [p.x, p.y]), [[0.5, 0.5], [0.5, 0.5]], 'nothing sure: stay in the middle');
  assert.deepStrictEqual(RF.smoothTrack([]), []);
});
ok('trackAt goes in a straight line between points and holds at the ends; ratioOf reads "9:16"', () => {
  const t = [{ ms: 0, x: 0, y: 1 }, { ms: 1000, x: 1, y: 0 }]; const m = RF.trackAt(t, 500); assert(Math.abs(m.x - 0.5) < 1e-9 && Math.abs(m.y - 0.5) < 1e-9);
  assert.strictEqual(RF.trackAt(t, -5).x, 0); assert.strictEqual(RF.trackAt(t, 5000).x, 1);
  assert.deepStrictEqual(RF.ratioOf('9:16'), [9, 16]); assert.strictEqual(RF.ratioOf('nope'), null);
});

// ---- project.js ----
ok('a subject that moves from the left to the right cuts the clip in two, each piece cropped on the subject, in the new shape', () => {
  const out = {}, q = P.reframeClip(base, 'vA', [9, 16], track, SRC, out), v = q.tracks[0].clips;
  assert.strictEqual(out.pieces, 2); assert.strictEqual(v.length, 2); assert.strictEqual(v[0].start, 0); assert.strictEqual(v[0].dur + v[1].dur, 10000);
  assert(v[0].crop.x < 0.2 && v[1].crop.x > 0.5, 'left then right');
  v.forEach(c => assert(Math.abs(c.crop.w * 1920 / (c.crop.h * 1080) - 9 / 16) < 0.01, 'shape 9:16'));
});
ok('the movie sound is cut in step with the picture, so they stay linked and in the same places', () => {
  const q = P.reframeClip(base, 'vA', [9, 16], track, SRC), v = q.tracks[0].clips, a = q.tracks[1].clips;
  assert.strictEqual(v.length, a.length); v.forEach((c, i) => { assert.strictEqual(c.start, a[i].start); assert.strictEqual(c.dur, a[i].dur); assert.strictEqual(c.link, a[i].link); assert.strictEqual(a[i].crop, undefined); });
  assert.deepStrictEqual(P.validate(q), []);
});
ok('a steady subject stays one piece; the shape it already has changes nothing; a reversed or paused clip is left alone', () => {
  const steady = track.map(p => ({ ms: p.ms, x: 0.5, y: 0.5 })), o = {};
  assert.strictEqual(P.reframeClip(base, 'vA', [9, 16], steady, SRC, o).tracks[0].clips.length, 1); assert.strictEqual(o.pieces, 1);
  const o2 = {}; assert.strictEqual(P.reframeClip(base, 'vA', [16, 9], steady, SRC, o2), base); assert(o2.same);
  assert.strictEqual(P.reframeClip(base, 'nope', [9, 16], track, SRC), base); assert.strictEqual(P.reframeClip(base, 'vA', [9, 16], [], SRC), base);
  const r = P.setReverse(base, 'vA'); assert.strictEqual(P.reframeClip(r, 'vA', [9, 16], track, SRC), r);
  const fz = P.insertFreeze(base, 3000, 2000), f = fz.tracks[0].clips.filter(c => c.type === 'freeze')[0]; assert.strictEqual(P.reframeClip(fz, f.id, [9, 16], track, SRC), fz);
});
ok('a clip that plays at double speed is followed at the right moments of the movie', () => {
  let p = P.setClipSpeed(base, 'vA', 2), c = p.tracks[0].clips[0];   // 5 s long, plays the movie from 0 to 10 s
  const q = P.reframeClip(p, c.id, [9, 16], track, SRC), v = q.tracks[0].clips;
  assert.strictEqual(v.length, 2); assert(Math.abs(v[0].dur - 2000) <= 250, 'the subject leaves at movie time 4 s = 2 s of clip: ' + v[0].dur);
});
ok('the crops reach the export plan', () => {
  const plan = PL.projectToPlan(P.reframeClip(base, 'vA', [9, 16], track, SRC)); assert.strictEqual(plan.video.length, 2); plan.video.forEach(s => assert(s.crop));
});

// ---- wiring ----
ok('the editor has the Auto reframe button and panel; reframe.js is loaded before the editor and cached by the service worker', () => {
  const ed = fs.readFileSync(www('editor.js'), 'utf8'), html = fs.readFileSync(www('index.html'), 'utf8'), sw = fs.readFileSync(www('sw.js'), 'utf8');
  new vm.Script(ed, { filename: 'editor.js' });
  ["id: 'edReframe'", 'PANELS.reframe = ', 'function runReframe', 'P.reframeClip(q, j.id', 'NRF.analyzeVideo', 'P.setFormat(q, { ratio: o.ratio })'].forEach(s => assert(ed.includes(s), s));
  assert(html.includes('<script src="reframe.js"></script>') && html.indexOf('reframe.js') < html.indexOf('src="editor.js"'));
  assert(sw.includes("'./reframe.js'"));
});
console.log('\n' + n + ' checks passed');