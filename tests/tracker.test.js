'use strict';
// node tests/tracker.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const www = f => path.join(__dirname, '..', 'www', f);
const P = require('../www/project.js'), NP = require('../www/plan.js'), NTK = require('../www/tracker.js'), NANIM = require('../www/anim.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, (msg || '') + ' got ' + a + ', wanted ' + b);
const mkBase = () => ({ naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } }, tracks: [
  { id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
    { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 10000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] });

// a textured background with a bright square that moves 3 pixels to the right each frame
const W = 64, H = 36;
function frame(i, withSquare) {
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = ((x * 7 + y * 13) % 31) * 4;
  if (withSquare) { const sx = 10 + 3 * i, sy = 12; for (let b = 0; b < 10; b++) for (let a = 0; a < 10; a++) g[(sy + b) * W + sx + a] = 200 + ((a + b) % 5) * 10; }
  return g;
}
const BOX = { cx: 15 / 64, cy: 17 / 36, size: 10 / 36 };

ok('the square is followed as it moves', () => {
  const t = NTK.createTracker(frame(0, true), W, H, BOX); let r;
  for (let i = 1; i <= 7; i++) r = t.step(frame(i, true));
  assert.strictEqual(r.lost, false); near(r.cx * W, 36, 1.5, 'x'); near(r.cy * H, 17, 1.5, 'y'); assert(t.texture > 5);
});
ok('when the thing disappears the position is held and it is found again afterwards', () => {
  const t = NTK.createTracker(frame(0, true), W, H, BOX); let r;
  for (let i = 1; i <= 3; i++) r = t.step(frame(i, true));
  const before = r.cx, gone = t.step(frame(4, false));
  assert.strictEqual(gone.lost, true); assert.strictEqual(gone.cx, before);
  const back = t.step(frame(5, true)); assert.strictEqual(back.lost, false); near(back.cx * W, 30, 1.5, 'found again');
});
ok('a plain spot is flagged', () => {
  const flat = new Uint8Array(W * H).fill(100), t = NTK.createTracker(flat, W, H, BOX);
  assert(NTK.isPlain(t.texture));
});
ok('bars around the picture convert both ways', () => {
  [[9 / 16, 16 / 9], [16 / 9, 9 / 16], [1.5, 1.5], [1, 16 / 9]].forEach(([fa, ma]) => {
    const m = NTK.frameToMovie(0.3, 0.4, fa, ma), f = NTK.movieToFrame(m.u, m.v, fa, ma); near(f.x, 0.3, 1e-9); near(f.y, 0.4, 1e-9);
  });
  const c = NTK.frameToMovie(0.5, 0.5, 9 / 16, 16 / 9); near(c.u, 0.5, 1e-9); near(c.v, 0.5, 1e-9);
  near(NTK.sizeToMovie(0.1, 1.5, 1.5), 0.1, 1e-9); assert(NTK.sizeToMovie(0.1, 9 / 16, 16 / 9) > 0.1);
});
ok('picture geometry: plain, zoom, flip, turn, and back again through crop + zoom + pan + turn + flip', () => {
  const base = { vw: 1920, vh: 1080, fa: 16 / 9 };
  let f = NTK.makeGeo(Object.assign({ t: {} }, base)).toFrame(0.3, 0.4); near(f.x, 0.3, 1e-9); near(f.y, 0.4, 1e-9);
  f = NTK.makeGeo(Object.assign({ t: { zoom: 2 } }, base)).toFrame(0.6, 0.5); near(f.x, 0.7, 1e-9); near(f.y, 0.5, 1e-9);
  f = NTK.makeGeo(Object.assign({ t: { flipH: true } }, base)).toFrame(0.3, 0.4); near(f.x, 0.7, 1e-9); near(f.y, 0.4, 1e-9);
  f = NTK.makeGeo(Object.assign({ t: { rot: 90 } }, base)).toFrame(1, 0.5); near(f.x, 0.5, 1e-9); near(f.y, 1, 1e-9);   // the right edge turns to the bottom
  const g = NTK.makeGeo({ vw: 1280, vh: 720, fa: 9 / 16, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, boxPan: true, t: { zoom: 1.5, x: 0.4, y: -0.2, rot: 270, flipH: true } });
  [[0.2, 0.3], [0.5, 0.5], [0.7, 0.8]].forEach(([u, v]) => { const fr = g.toFrame(u, v), m = g.toMovie(fr.x, fr.y); near(m.u, u, 1e-9); near(m.v, v, 1e-9); });
  assert(g.k > 0 && g.vh === 720);
});
ok('a straight track becomes two keyframes, moved by the offset; a held stretch stays put; limits can be widened', () => {
  const track = [{ ms: 0, x: 0.2, y: 0.5 }, { ms: 1000, x: 0.6, y: 0.5 }], rels = NTK.sampleTimes(1000), movie = rels.slice();
  assert.strictEqual(rels.length, 32);
  const kf = NTK.toKeyframes(track, rels, movie, { fa: 1.5, ma: 1.5, offX: 0.1, offY: 0 });
  assert.strictEqual(kf.x.length, 2); near(kf.x[0][1], 0.3, 1e-6); near(kf.x[1][1], 0.7, 1e-6); assert.strictEqual(kf.y.length, 2); near(kf.y[0][1], 0.5, 1e-6);
  const held = NTK.toKeyframes(track, [0, 500, 1000], [0, null, null], { fa: 1.5, ma: 1.5 });
  near(held.x[held.x.length - 1][1], 0.2, 1e-6, 'keeps its last place when that video is not on screen');
  const infos = rels.map(r => ({ ms: r, toFrame: (u, v) => ({ x: u, y: v }) })), off = NTK.toKeyframes(track, rels, infos, { offX: -0.5, lo: -1, hi: 1 });
  near(off.x[0][1], -0.3, 1e-6, 'offsets below zero are kept for texts');
});
ok('setTrackedPath works on overlays, stickers and texts; clearTrackedPath takes it off; cutting keeps the movement', () => {
  const out = {}, q0 = P.addOverlay(mkBase(), 1000, { name: 'o', kind: 'image', w: 100, h: 100 }, out);
  const q = P.setTrackedPath(q0, out.id, { x: [[0, 0.2], [1000, 0.5], [3000, 0.8]], y: [[0, 0.5], [3000, 0.4]] });
  const c = P.findClip(q, out.id).clip; assert.strictEqual(c.kf.x.length, 3); assert.strictEqual(c.kf.y.length, 2); assert.deepStrictEqual(P.validate(q), []);
  const ov = NP.projectToPlan(q).overlays[0]; assert(ov.kf && ov.kf.x.length === 3 && ov.kf.y.length === 2);
  assert.strictEqual(P.setTrackedPath(q0, 'vA', { x: [[0, 0.5]] }), q0, 'not a picture clip');
  assert.strictEqual(P.setTrackedPath(q0, out.id, { x: [], y: [] }), q0);

  const o1 = {}, qs = P.addSticker(mkBase(), 1000, 3000, '\u2b50', o1), q1 = P.setTrackedPath(qs, o1.id, { x: [[0, 0.2], [3000, 0.7]], y: [[0, 0.5], [3000, 0.5]] });
  const sc = P.findClip(q1, o1.id).clip; assert.strictEqual(sc.kf.x.length, 2); near(NANIM.valueOf(sc, 'sticker', 'x', 1500), 0.45, 1e-9);
  const st = NP.projectToPlan(q1).stickers[0]; assert(st.kf && st.kf.x.length === 2 && st.kf.y.length === 2 && st.x === sc.x, 'the plan carries the movement');
  assert.deepStrictEqual(P.keyframeProps(q1, o1.id), ['x', 'y']);
  assert(P.splitAt(q1, 2000).tracks.filter(t => t.kind === 'sticker')[0].clips.every(x => x.kf && x.kf.x));

  const o2 = {}, qt = P.addTextClip(mkBase(), 5000, 3000, o2), q2 = P.setTrackedPath(qt, o2.id, { x: [[0, -0.2], [3000, 0.4]], y: [[0, 0], [3000, 0]] });
  const tc = P.findClip(q2, o2.id).clip; near(NANIM.valueOf(tc, 'text', 'x', 500), -0.1, 1e-9); assert.deepStrictEqual(P.keyframeProps(q2, o2.id), []);
  const tx = NP.projectToPlan(q2).texts[0]; assert(tx.kf && tx.kf.x.length === 2 && tx.kfT0 === 5000, 'the plan carries the text movement');
  near(NANIM.shiftOf(tx, 1500).x, 0.1, 1e-9);
  const cleared = P.clearTrackedPath(q2, o2.id, 0), cc = P.findClip(cleared, o2.id).clip; assert(!cc.kf && !cc.dx && !cc.dy, 'a text goes back to its usual place');
  const s2 = P.clearTrackedPath(q1, o1.id, 0), sc2 = P.findClip(s2, o1.id).clip; assert(!sc2.kf); near(sc2.x, 0.2, 1e-9, 'a sticker keeps the place it had');
  assert.strictEqual(P.clearTrackedPath(qt, o2.id, 0), qt);
});
ok('shiftOf: fixed offset, keyframes, nothing', () => {
  assert.deepStrictEqual(NANIM.shiftOf({}, 0), { x: 0, y: 0 });
  assert.deepStrictEqual(NANIM.shiftOf({ dx: 0.1, dy: -0.2 }, 0), { x: 0.1, y: -0.2 });
  near(NANIM.shiftOf({ dx: 0.1, kf: { x: [[0, 0], [1000, 0.2]] } }, 500).x, 0.1, 1e-9); assert.strictEqual(NANIM.shiftOf({ dy: 0.3, kf: { x: [[0, 0], [1000, 0.2]] } }, 500).y, 0.3);
});
ok('the editor has the Track tool for overlays, stickers and texts; the exports move them; edited files parse', () => {
  const ed = fs.readFileSync(www('editor.js'), 'utf8'), html = fs.readFileSync(www('index.html'), 'utf8'), sw = fs.readFileSync(www('sw.js'), 'utf8');
  const ee = fs.readFileSync(www('export-engine.js'), 'utf8'), wc = fs.readFileSync(www('webcodecs-export.js'), 'utf8');
  ['editor.js', 'project.js', 'tracker.js', 'anim.js', 'plan.js', 'export-engine.js', 'webcodecs-export.js'].forEach(f => new vm.Script(fs.readFileSync(www(f), 'utf8'), { filename: f }));
  ["id: 'edOverlayTrack'", "id: 'edStickerTrack'", "id: 'edTextTrack'", 'PANELS.track = ', 'function runTrack', 'function trackTarget', 'function trackInfoAt', 'P.setTrackedPath', 'NTK.analyze', 'syncTrackBox();', 'NANIM.shiftOf'].forEach(s => assert(ed.includes(s), s));
  assert(ee.includes('function tfShift') && ee.includes('tfShift(t, sp)'), 'ffmpeg engine moves titles and stickers');
  assert(wc.includes('function stickerShift') && wc.includes('NA.shiftOf'), 'fast engine moves titles and stickers');
  assert(html.includes('<script src="tracker.js"></script>') && html.indexOf('tracker.js') < html.indexOf('src="editor.js"'));
  assert(sw.includes("'./tracker.js'"), "add './tracker.js' to sw.js");
});
console.log('\n' + n + ' checks passed');