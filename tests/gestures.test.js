'use strict';
// node tests/gestures.test.js
// Batch 2, moving things directly on the picture: the gesture maths, the text edits, the export plan, the drawing of a turned title,
// and the editor's gesture layer driven by simulated fingers (no screen needed).
const assert = require('assert'), fs = require('fs'), path = require('path');
const A = require('../www/anim.js'), P = require('../www/project.js'), PL = require('../www/plan.js'), LK = require('../www/look.js'), MO = require('../www/motion.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const near = (a, b, m, eps) => assert(Math.abs(a - b) <= (eps || 0.001), (m || '') + ' ' + a + ' vs ' + b);

// ---------- the maths ----------
ok('wrapDeg keeps a turn inside (-180, 180] and snapTo / snapRot click onto the nearest target', () => {
  [[190, -170], [-190, 170], [360, 0], [540, 180], [-180, 180], [45, 45], [725, 5]].forEach(([a, b]) => near(A.wrapDeg(a), b, 'wrapDeg ' + a));
  assert.deepStrictEqual(A.snapTo(0.51, [0.5], 0.012), { v: 0.5, hit: true });
  assert.deepStrictEqual(A.snapTo(0.52, [0.5], 0.012), { v: 0.52, hit: false });
  assert.deepStrictEqual(A.snapTo(5, [0, 4, 10], 2), { v: 4, hit: true }, 'the nearer of two');
  assert.deepStrictEqual(A.snapRot(87), { rot: 90, hit: true }); assert.deepStrictEqual(A.snapRot(30), { rot: 30, hit: false });
  assert.deepStrictEqual(A.snapRot(-178), { rot: 180, hit: true }, 'one way round the circle, never -180 and 180 both');
});
ok('a point is inside a turned box only where the box really is', () => {
  const b = { cx: 100, cy: 100, w: 100, h: 20, rot: 0 };
  assert(A.pointInBox(140, 105, b)); assert(!A.pointInBox(140, 130, b)); assert(A.pointInBox(140, 118, b, 10), 'pad');
  const t = { cx: 100, cy: 100, w: 100, h: 20, rot: 90 };   // turned on its side: now tall and thin
  assert(A.pointInBox(100, 140, t)); assert(!A.pointInBox(140, 100, t));
  const d = { cx: 0, cy: 0, w: 100, h: 20, rot: 45 }; assert(A.pointInBox(30, 30, d)); assert(!A.pointInBox(30, -30, d));
});
ok('the corner handle sits at the corner of the turned box, and dragging it gives a size and a turn', () => {
  const h = A.handlePos({ cx: 100, cy: 100, w: 40, h: 20, rot: 0 }); near(h.x, 120); near(h.y, 110);
  const r = A.handlePos({ cx: 100, cy: 100, w: 40, h: 20, rot: 90 }); near(r.x, 90, 'turned a quarter: the corner is now bottom-left'); near(r.y, 120);
  const k = A.scaleRotate({ x: 100, y: 100 }, { x: 120, y: 100 }, { x: 160, y: 100 }); near(k.scale, 3); near(k.dRot, 0);
  const q = A.scaleRotate({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }); near(q.scale, 1); near(q.dRot, 90, 'a quarter turn clockwise on screen');
  assert.deepStrictEqual(A.scaleRotate({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 50, y: 50 }), { scale: 1, dRot: 0 }, 'a handle on the centre does nothing');
});
ok('a pinch gives the scale, the twist and how far the middle moved', () => {
  const p = A.pinch({ x: 180, y: 100 }, { x: 220, y: 100 }, { x: 160, y: 100 }, { x: 240, y: 100 }); near(p.scale, 2); near(p.dRot, 0); near(p.dx, 0); near(p.dy, 0);
  const t = A.pinch({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 100 }); near(t.scale, 1); near(t.dRot, 90); near(t.dx, -50); near(t.dy, 50);
  assert.deepStrictEqual(A.pinch({ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 0, y: 0 }, { x: 90, y: 0 }), { scale: 1, dRot: 0, dx: 39.5, dy: -5 }, 'fingers that start on top of each other do not make a wild scale');
});
ok('panFor is the exact inverse of how the preview and the export move a zoomed picture', () => {
  const W = 300, H = 200;
  // preview CSS: shift = -x * (zoom - 1) * 0.5 * W
  const shift = (t, w) => -(t.x) * (t.zoom - 1) * 0.5 * w;
  let t0 = { zoom: 2, x: 0.5, y: -0.25 }, p = A.panFor(t0, 2, 30, -20, W, H);
  near(shift({ zoom: 2, x: p.x }, W), shift(t0, W) + 30, 'x moved by the drag'); near(shift({ zoom: 2, x: p.y }, H), shift({ zoom: 2, x: t0.y }, H) - 20, 'y moved by the drag');
  p = A.panFor({ zoom: 1, x: 0, y: 0 }, 3, 0, 0, W, H); near(p.x, 0); near(p.y, 0);
  p = A.panFor({ zoom: 2, x: 0, y: 0 }, 2, 9999, -9999, W, H); assert.deepStrictEqual([p.x, p.y], [-1, 1], 'never past the edge of the picture');
  assert.deepStrictEqual(A.panFor({ zoom: 3, x: 0.7, y: 0.7 }, 1, 50, 50, W, H), { x: 0, y: 0 }, 'back at zoom 1 there is nothing to move');
  // dragging the picture right makes the crop window go left: x goes DOWN (the export crops from x = (iw - ow) / 2 * (1 + x))
  assert(A.panFor({ zoom: 2, x: 0, y: 0 }, 2, 40, 0, W, H).x < 0);
});

// ---------- the project: a text can be turned, put anywhere, and made big ----------
const base = { naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 10000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 10000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
const withText = (() => { const o = {}; return { p: P.addTextClip(base, 1000, 4000, o), id: o.id }; })();
const tclip = (p, id) => P.findClip(p, id || withText.id).clip;
ok('text turn: wrapped into -180..180, tidy, and not stored when it is nothing', () => {
  const T = (o) => tclip(P.setTextProps(withText.p, withText.id, o));
  assert.strictEqual(T({ rot: 370 }).rot, 10); assert.strictEqual(T({ rot: -190 }).rot, 170); assert.strictEqual(T({ rot: 12.34 }).rot, 12.3); assert.strictEqual(T({ rot: 90 }).rot, 90); assert.strictEqual(T({ rot: -90 }).rot, -90);
  assert.strictEqual('rot' in T({ rot: 0 }), false); assert.strictEqual('rot' in T({ rot: 0.04 }), false); assert.strictEqual('rot' in T({ rot: 360 }), false);
  const q = P.setTextProps(withText.p, withText.id, { rot: 30 }); assert.strictEqual('rot' in tclip(P.setTextProps(q, withText.id, { rot: 0 })), false, 'turning it back removes it');
  assert.strictEqual(P.setTextProps(withText.p, withText.id, { rot: 0 }), withText.p, 'no change: the same project, no empty undo step');
  assert.strictEqual(P.setTextProps(q, withText.id, { rot: 30 }), q);
});
ok('text size goes up to 30 now, and down to 3; other looks are untouched', () => {
  const T = (o) => tclip(P.setTextProps(withText.p, withText.id, o));
  assert.strictEqual(T({ size: 99 }).size, 30); assert.strictEqual(T({ size: 1 }).size, 3); assert.strictEqual(T({ size: 12.3456 }).size, 12.346); assert.strictEqual(T({ size: 16 }).size, 16);
  const q = P.setTextProps(withText.p, withText.id, { rot: 20, size: 20, color: '#ff0000' }); const c = tclip(q); assert.deepStrictEqual([c.rot, c.size, c.color, c.pos, c.text], [20, 20, '#ff0000', 'bottom', 'Your text']);
});
ok('text offset: dx / dy are kept within the frame, and Top / Middle / Bottom can clear them', () => {
  const T = (o, p) => tclip(P.setTextProps(p || withText.p, withText.id, o));
  assert.deepStrictEqual([T({ dx: 5 }).dx, T({ dy: -5 }).dy, T({ dx: 0.1234 }).dx], [1, -1, 0.123]);
  const moved = P.setTextProps(withText.p, withText.id, { dx: 0.2, dy: -0.3 });
  const back = tclip(P.setTextProps(moved, withText.id, { pos: 'top', dx: 0, dy: 0 })); assert.strictEqual(back.pos, 'top'); assert.strictEqual('dx' in back, false); assert.strictEqual('dy' in back, false);
  // the ordinary drag: setAnimated on a text writes the offset (and a keyframe when the text already moves)
  const d = tclip(P.setAnimated(P.setAnimated(withText.p, withText.id, 'x', 0.25, 500), withText.id, 'y', -0.4, 500)); assert.deepStrictEqual([d.dx, d.dy, d.kf], [0.25, -0.4, undefined]);
  const kf = P.toggleKeyframe(withText.p, withText.id, 'x', 0), k2 = tclip(P.setAnimated(kf, withText.id, 'x', 0.3, 1500)); assert.deepStrictEqual(k2.kf.x.map(a => a[1]), [0, 0.3]);
});
ok('the turn and the offset reach the export plan, and a plain title has neither', () => {
  const q = P.setTextProps(withText.p, withText.id, { rot: -25, dx: 0.1, dy: 0.2 }), t = PL.projectToPlan(q).texts[0];
  assert.strictEqual(t.rot, -25); assert.strictEqual(t.dx, 0.1); assert.strictEqual(t.dy, 0.2);
  const plain = PL.projectToPlan(withText.p).texts[0]; assert.strictEqual('rot' in plain, false); assert.strictEqual('dx' in plain, false);
});

// ---------- drawing a turned title ----------
function fakeCtx() {
  const calls = [], g = { calls, font: '', measureText: (s) => ({ width: String(s).length * 10 }) };
  ['save', 'restore', 'translate', 'rotate', 'fillText', 'strokeText', 'fillRect', 'scale', 'drawImage'].forEach(k => { g[k] = (...a) => calls.push([k].concat(a)); });
  return g;
}
ok('a turned title is drawn turned around the middle of its lines, an unturned one has no turn at all', () => {
  const t = { text: 'Hi', size: 10, pos: 'bottom' }, W = 500, H = 1000;   // 100px letters, one line of 120, top at 0.76 * 1000
  let g = fakeCtx(); LK.drawTitle(g, t, W, H); assert.strictEqual(g.calls.filter(c => c[0] === 'rotate').length, 0); assert.strictEqual(g.calls.filter(c => c[0] === 'translate').length, 0);
  g = fakeCtx(); const lines = LK.drawTitle(g, Object.assign({ rot: 30 }, t), W, H);
  assert.deepStrictEqual(g.calls.slice(0, 4), [['save'], ['translate', 250, 820], ['rotate', 30 * Math.PI / 180], ['translate', -250, -820]], JSON.stringify(g.calls.slice(0, 4)));
  assert.strictEqual(g.calls[g.calls.length - 1][0], 'restore'); assert.deepStrictEqual(lines, ['Hi'], 'the lines come back, like before');
  assert.strictEqual(MO.pivotY(t, H, 1), 820, 'the very point an animated title turns around');
  g = fakeCtx(); LK.drawTitle(g, Object.assign({ rot: 400 }, t), W, H); near(g.calls[2][1], 40 * Math.PI / 180, 'wrapped', 1e-9);
});
ok('a turned title with effects is turned too, and two lines turn around the middle of both', () => {
  const g = fakeCtx(); g.createLinearGradient = () => ({ addColorStop() {} });
  LK.drawTitle(g, { text: 'Hi', size: 10, pos: 'bottom', rot: -20, extrude: { color: '#ff0000', depth: 0.5 } }, 500, 1000);
  assert.strictEqual(g.calls.filter(c => c[0] === 'rotate').length, 1); assert.deepStrictEqual(g.calls[1], ['translate', 250, 820]);
  const two = fakeCtx(); LK.drawTitle(two, { text: 'one\ntwo', size: 10, pos: 'top', rot: 15 }, 500, 1000);   // top 70, two lines of 120: middle at 70 + 120
  assert.deepStrictEqual(two.calls[1], ['translate', 250, 190]);
});
ok('titleBox says where a title is: centre, size and lines, wrapped like the drawing', () => {
  const g = fakeCtx(), b = LK.titleBox({ text: 'Hello', size: 10, pos: 'bottom' }, 500, 1000, g);   // 10 per letter
  assert.deepStrictEqual([b.cx, b.cy, b.w, b.h, b.lines, b.px], [250, 820, 130, 160, 1, 100]);
  const long = LK.titleBox({ text: 'aaaaa bbbbb ccccc', size: 5, pos: 'top' }, 300, 400, g);   // 20px letters, 88% of 300 = 264, each word is 50 wide: all fit on one line
  assert.strictEqual(long.lines, 1);
  const wrap = LK.titleBox({ text: 'aaaaa bbbbb ccccc', size: 50, pos: 'top' }, 100, 400, g);   // 88% of 100 = 88 wide: two words (110) never fit, every word gets its own line
  assert.strictEqual(wrap.lines, 3); assert.strictEqual(wrap.cy, Math.round(0.07 * 400) + 3 * Math.round(200 * 1.2) / 2);
  assert.strictEqual(LK.titleBox({ text: 'x', size: 7 }, 320, 240).lines, 1, 'works with no canvas at all (an estimate)');
});

// ---------- the editor's gesture layer, driven by simulated fingers ----------
const src = fs.readFileSync(path.join(__dirname, '..', 'www', 'editor.js'), 'utf8').replace(/\r\n/g, '\n');
const a0 = src.indexOf('// ---------- moving things directly on the picture ----------'), a1 = src.indexOf('// ---------- zoom and position ----------');
assert(a0 > 0 && a1 > a0, 'the gesture block is in editor.js (run tools/apply-gestures.js first)');
function rig(project, sel, t) {
  const win = { l: {}, addEventListener(k, f) { (this.l[k] = this.l[k] || []).push(f); }, removeEventListener(k, f) { this.l[k] = (this.l[k] || []).filter(x => x !== f); }, fire(k, e) { (this.l[k] || []).slice().forEach(f => f(e)); }, count() { return Object.keys(this.l).reduce((s, k) => s + this.l[k].length, 0); } };
  const E = { isOpen: true, cropOn: false, eye: null, panel: null, playing: false, t: t == null ? 1500 : t, sel: sel, proj: project, hist: { cur: project, commit(p) { this.cur = p; } }, ui: {}, stickerEls: {}, overlayEls: {} };
  const el = () => ({ style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} });
  E.ui.handles = Object.assign(el(), { clientWidth: 400, clientHeight: 300, getBoundingClientRect: () => ({ left: 0, top: 0 }) });
  const log = { commits: 0, selected: [] };
  const live = (p) => { E.proj = p; }, commit = (p) => { if (p === E.hist.cur) return; E.hist.commit(p); E.proj = p; log.commits++; }, select = (id) => { E.sel = id; log.selected.push(id); };
  const relNow = (c) => Math.max(0, Math.min(Math.round(c.dur), Math.round(E.t - c.start)));
  const f = new Function('E', 'P', 'NANIM', 'NMO', 'lookLib', 'mk', 'live', 'commit', 'select', 'renderTimeline', 'syncDock', 'relNow', 'window',
    src.slice(a0, a1) + '\nreturn { GP: GP, stageDown: stageDown, stageBare: stageBare, gpMove: gpMove, gpUp: gpUp, syncHandles: syncHandles, gestureTarget: gestureTarget, boxOf: boxOf, handleDown: handleDown };');
  const h = f(E, P, A, MO, () => LK, el, live, commit, select, () => {}, () => {}, relNow, win);
  let seq = 0;
  const ev = (type, id, x, y, target) => ({ type, pointerId: id, clientX: x, clientY: y, pointerType: 'touch', button: 0, target: target || {}, stopped: false, prevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } });
  const down = (id, x, y, target) => { const e = ev('pointerdown', id, x, y, target); h.stageDown(e); if (!e.stopped) h.stageBare(e); return e; };
  const move = (id, x, y) => win.fire('pointermove', ev('pointermove', id, x, y)), up = (id, x, y) => win.fire('pointerup', ev('pointerup', id, x, y)), cancel = (id, x, y) => win.fire('pointercancel', ev('pointercancel', id, x, y));
  const HANDLE = {}; const grab = (id, x, y) => { E.ui.hhandle = HANDLE; const e = ev('pointerdown', id, x, y, HANDLE); h.stageDown(e); h.handleDown(e); return e; };   // like a real touch: the layer sees it first, then the handle
  return { E, h, win, log, down, move, up, cancel, ev, grab };
}
// the text sits at the bottom: in the 400 x 300 layer its box is about 121 x 29 around (200, 240)
ok('drag a text anywhere: it follows the finger, snaps to the middle, one undo step, and is chosen by the touch', () => {
  const r = rig(withText.p, null);
  const e = r.down(1, 200, 240); assert(e.stopped && e.prevented, 'the text took the touch'); assert.strictEqual(r.E.sel, withText.id, 'and it is chosen now');
  r.move(1, 230, 140); let c = tclip(r.E.proj); near(c.dx, 0.075, 'dx'); near(c.dy, -100 / 300, 'dy'); assert.strictEqual(r.log.commits, 0, 'nothing kept while the finger is down'); assert.strictEqual(tclip(r.E.hist.cur).dx, undefined);
  r.move(1, 232, 99); r.up(1, 232, 99); c = tclip(r.E.hist.cur); near(c.dx, 32 / 400); near(c.dy, -141 / 300); assert.strictEqual(r.log.commits, 1, 'one undo step'); assert.strictEqual(r.win.count(), 0, 'listeners are gone');
  const s = rig(withText.p, withText.id); s.down(1, 200, 240); s.move(1, 202, 241); s.up(1, 202, 241);   // a nudge of 2 px: the centre line pulls the title back to the middle, so there is no change
  assert.strictEqual(s.log.commits, 0); assert.strictEqual(s.E.proj, withText.p);
  const m = rig(withText.p, withText.id); m.down(1, 200, 240); m.move(1, 205, 240); m.move(1, 190, 120); m.up(1, 190, 120); near(tclip(m.E.hist.cur).dx, -10 / 400, 'just outside the snap zone it keeps the exact place');
  const z = rig(withText.p, withText.id); z.down(1, 200, 240); z.move(1, 200, 180); z.up(1, 200, 180); assert.strictEqual('dx' in tclip(z.E.hist.cur), false, 'x on the middle line: no offset stored');
  const snapY = rig(withText.p, withText.id), bb = LK.titleBox(tclip(withText.p), 400, 300); snapY.down(1, 200, 240); snapY.move(1, 200, 240 + (150 - bb.cy) + 3); snapY.up(1, 200, 240 + (150 - bb.cy) + 3);
  near(tclip(snapY.E.hist.cur).dy, (150 - bb.cy) / 300, 'y snapped to the middle of the frame', 1e-3);
});
ok('a touch beside the text does not take it, and a text that is not on screen now is not touched', () => {
  const r = rig(withText.p, null); const e = r.down(1, 40, 40); assert(!e.stopped, 'the touch carries on to whatever is there'); r.up(1, 40, 40); assert.strictEqual(r.E.sel, 'vA', 'a tap on the bare picture chooses the picture, not the text');
  const late = rig(withText.p, null, 8000); const e2 = late.down(1, 200, 240); assert(!e2.stopped); late.up(1, 200, 240);
});
ok('a cancelled drag puts everything back', () => {
  const r = rig(withText.p, null); r.down(1, 200, 240); r.move(1, 300, 100); assert(tclip(r.E.proj).dx); r.cancel(1, 300, 100);
  assert.strictEqual(r.E.proj, r.E.hist.cur); assert.strictEqual(r.log.commits, 0); assert.strictEqual(r.win.count(), 0);
});
ok('two fingers pinch a text bigger and twist it, in one undo step, and it only turns by what the fingers turn', () => {
  const r = rig(withText.p, withText.id), a = { x: 180, y: 100 }, b = { x: 220, y: 100 };
  const d1 = r.down(1, a.x, a.y); assert(!d1.stopped, 'one finger beside the text: not taken yet');
  const d2 = r.down(2, b.x, b.y); assert(d2.stopped, 'the second finger starts the pinch'); assert.strictEqual(r.h.GP.seq, 1, 'older one-finger drags are told to stand down');
  r.move(1, 160, 100); r.move(2, 240, 100); let c = tclip(r.E.proj); assert.strictEqual(c.size, 14, 'twice as far apart: twice as big'); assert.strictEqual(r.log.commits, 0);
  const bx = b.x - a.x, ang = 30 * Math.PI / 180; r.move(2, 180 + 40 * Math.cos(ang), 100 + 40 * Math.sin(ang)); r.move(1, 180, 100);
  c = tclip(r.E.proj); assert.strictEqual(c.size, 7); near(c.rot, 30, 'twist', 0.11);
  r.up(2, 180 + 40 * Math.cos(ang), 100 + 40 * Math.sin(ang)); assert.strictEqual(r.log.commits, 1); c = tclip(r.E.hist.cur); assert.strictEqual(c.size, 7); near(c.rot, 30, 'twist', 0.11);
  r.up(1, 180, 100); assert.strictEqual(r.log.commits, 1, 'lifting the other finger adds nothing'); assert.strictEqual(r.win.count(), 0);
  const big = rig(withText.p, withText.id); big.down(1, 190, 100); big.down(2, 210, 100); big.move(2, 390, 100); big.move(1, 10, 100); big.up(2, 390, 100); big.up(1, 10, 100); assert.strictEqual(tclip(big.E.hist.cur).size, 30, 'never past the biggest');
  const tiny = rig(withText.p, withText.id); tiny.down(1, 100, 100); tiny.down(2, 300, 100); tiny.move(2, 101, 100); tiny.up(2, 101, 100); tiny.up(1, 100, 100); assert.strictEqual(tclip(tiny.E.hist.cur).size, 3, 'never smaller than the smallest');
});
ok('a pinch that drops one finger and a finger that was only resting do not leave a stray change', () => {
  const r = rig(withText.p, withText.id); r.down(1, 180, 100); r.down(2, 220, 100); r.up(1, 180, 100); r.up(2, 220, 100);
  assert.strictEqual(r.log.commits, 0); assert.strictEqual(r.E.proj, withText.p);
  const c = rig(withText.p, withText.id); c.down(1, 180, 100); c.down(2, 220, 100); c.move(2, 300, 100); c.cancel(1, 180, 100); assert.strictEqual(c.E.proj, c.E.hist.cur); assert.strictEqual(c.log.commits, 0);
  const three = rig(withText.p, withText.id); three.down(1, 180, 100); three.down(2, 220, 100); const e3 = three.down(3, 300, 100); assert(e3.stopped, 'a third finger is swallowed while pinching'); three.up(3, 300, 100); three.up(2, 220, 100); three.up(1, 180, 100);
});
ok('with nothing chosen that a pinch can work on, two fingers do nothing', () => {
  const r = rig(base, 'nope'); r.down(1, 100, 100); const e = r.down(2, 200, 100); assert(!e.stopped); r.move(2, 300, 100); r.up(2, 300, 100); r.up(1, 100, 100); assert.strictEqual(r.E.proj, base); assert.strictEqual(r.log.commits, 0);
});

// ---- stickers and overlays: the round handle ----
const sOut = {}, withSticker = { p: P.addSticker(base, 0, 5000, '\u2605', sOut), id: sOut.id };
ok('the round handle resizes and turns a sticker from the middle of it', () => {
  const r = rig(withSticker.p, withSticker.id); r.E.stickerEls[withSticker.id] = { offsetWidth: 40, offsetHeight: 40 };
  const tg = r.h.gestureTarget(); assert.strictEqual(tg.kind, 'sticker'); const bx = r.h.boxOf(tg, 400, 300); assert.deepStrictEqual([bx.cx, bx.cy, bx.w, bx.h, bx.rot], [200, 150, 40, 40, 0]);
  const hp = A.handlePos(bx); assert.deepStrictEqual([hp.x, hp.y], [220, 170]);
  r.grab(7, 220, 170); assert(r.h.GP.drag, 'the handle took the finger');
  r.move(7, 260, 190); const c = P.findClip(r.E.proj, withSticker.id).clip; near(c.size, 0.2 * Math.sqrt(60 * 60 + 40 * 40) / Math.sqrt(20 * 20 + 20 * 20), 'size', 0.002); assert.strictEqual(c.rot, -11);
  r.up(7, 260, 190); assert.strictEqual(r.log.commits, 1);
  const s = rig(withSticker.p, withSticker.id); s.E.stickerEls[withSticker.id] = { offsetWidth: 40, offsetHeight: 40 }; s.grab(7, 220, 170); s.move(7, 150, 200); s.up(7, 150, 200);
  const turned = P.findClip(s.E.hist.cur, withSticker.id).clip; assert.strictEqual(turned.rot, 90, 'a quarter turn clicks onto 90'); assert(turned.size > 0.2);
});
const ovProject = (() => { const p = JSON.parse(JSON.stringify(base)); p.assets.ov = { type: 'video', durMs: 5000, w: 640, h: 360 };
  p.tracks.push({ id: 't-ov1', kind: 'overlay', role: 'overlay', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'o1', type: 'video', asset: 'ov', start: 0, dur: 5000, in: 0, speed: 1, volume: 0, x: 0.5, y: 0.5, size: 0.4, rot: 0, opacity: 1 }] }); return p; })();
ok('the round handle resizes and turns an overlay, and with keyframes it keeps one at the playhead', () => {
  const r = rig(ovProject, 'o1'); r.E.overlayEls.o1 = { offsetWidth: 160, offsetHeight: 90 };
  const tg = r.h.gestureTarget(); assert.strictEqual(tg.kind, 'overlay'); const bx = r.h.boxOf(tg, 400, 300); assert.deepStrictEqual([bx.cx, bx.cy, bx.w, bx.h], [200, 150, 160, 90]);
  r.grab(3, 280, 195); r.move(3, 360, 240); r.up(3, 360, 240);
  const c = P.findClip(r.E.hist.cur, 'o1').clip; near(c.size, 0.8, 'twice as far: twice as big', 0.01); assert.strictEqual(c.rot, 0); assert.strictEqual(r.log.commits, 1);
  const kf = P.toggleKeyframe(ovProject, 'o1', 'size', 0), k = rig(kf, 'o1'); k.E.overlayEls.o1 = { offsetWidth: 160, offsetHeight: 90 };
  k.grab(3, 280, 195); k.move(3, 360, 240); k.up(3, 360, 240);
  assert.deepStrictEqual(P.findClip(k.E.hist.cur, 'o1').clip.kf.size.map(a => a[0]), [0, 1500], 'a keyframe at the playhead, the first one stays');
  const pn = rig(ovProject, 'o1'); pn.down(1, 100, 100); pn.down(2, 140, 100); pn.move(2, 220, 100); pn.up(2, 220, 100); pn.up(1, 100, 100); near(P.findClip(pn.E.hist.cur, 'o1').clip.size, 0.4 * 120 / 40, 'a pinch resizes an overlay too', 0.5);
});

// ---- the picture ----
ok('the picture: pinch zooms, and moves with the fingers; the transform stays what setTransform would make', () => {
  const r = rig(base, 'vA'); assert.strictEqual(r.h.gestureTarget().kind, 'picture');
  r.down(1, 150, 150); r.down(2, 250, 150); r.move(2, 350, 150); r.move(1, 50, 150); r.up(2, 350, 150); r.up(1, 50, 150);   // 100 apart -> 300 apart: zoom 3, middle did not move
  const c = P.findClip(r.E.hist.cur, 'vA').clip; assert.deepStrictEqual(c.transform, { zoom: 3, x: 0, y: 0, rot: 0, flipH: false }); assert.strictEqual(r.log.commits, 1);
  const out = rig(base, 'vA'); out.down(1, 150, 150); out.down(2, 250, 150); out.move(2, 150, 150); out.up(2, 150, 150); out.up(1, 150, 150); assert.strictEqual(P.findClip(out.E.hist.cur, 'vA').clip.transform, undefined, 'pinching in at zoom 1 stays at 1');
  const nosel = rig(base, null); nosel.down(1, 150, 150); nosel.down(2, 250, 150); nosel.move(2, 350, 150); nosel.up(2, 350, 150); nosel.up(1, 150, 150); assert.strictEqual(P.findClip(nosel.E.hist.cur, 'vA').clip.transform.zoom, 2, 'with nothing chosen, the picture under the playhead is pinched');
  const big = rig(base, 'vA'); big.down(1, 190, 150); big.down(2, 210, 150); big.move(2, 400, 150); big.up(2, 400, 150); big.up(1, 190, 150); assert.strictEqual(P.findClip(big.E.hist.cur, 'vA').clip.transform.zoom, 4, 'never past 4');
  const mv = rig(base, 'vA'); mv.down(1, 150, 150); mv.down(2, 250, 150); mv.move(1, 80, 150); mv.move(2, 380, 150); mv.up(2, 380, 150); mv.up(1, 80, 150);
  const pm = P.findClip(mv.E.hist.cur, 'vA').clip.transform; assert.strictEqual(pm.zoom, 3, 'zoom'); near(pm.x, -30 / (1 * 400), 'the middle moved 30 px right, so the picture follows: x = -30 / ((3 - 1) / 2 * 400)'); near(pm.y, 0, 'y');
});
ok('the picture: one finger moves a zoomed picture once it is chosen; a first tap only chooses it', () => {
  const zoomed = P.setTransform(base, 'vA', { zoom: 2, x: 0.5, y: 0 });
  const r = rig(zoomed, 'vA'); const e = r.down(1, 100, 100); assert(!e.stopped && e.prevented);
  r.move(1, 130, 100); near(P.findClip(r.E.proj, 'vA').clip.transform.x, 0.35, 'dragged right: x goes down from 0.5 by 30 / (0.5 * 400)');
  r.move(1, 130, 150); near(P.findClip(r.E.proj, 'vA').clip.transform.y, -50 / (0.5 * 300), 'down: y goes down'); assert.strictEqual(r.log.commits, 0);
  r.up(1, 130, 150); assert.strictEqual(r.log.commits, 1); assert.strictEqual(r.log.selected.length, 0, 'it was already chosen');
  const tap = rig(zoomed, null); tap.down(1, 100, 100); tap.move(1, 160, 100); tap.up(1, 160, 100); assert.deepStrictEqual(tap.log.selected, ['vA']); assert.strictEqual(tap.log.commits, 0, 'not chosen yet, so the drag does not move it; the touch only chooses');
  const flat = rig(base, 'vA'); flat.down(1, 100, 100); flat.move(1, 200, 200); flat.up(1, 200, 200); assert.strictEqual(flat.log.commits, 0, 'at zoom 1 there is nothing to move');
  const keyed = P.toggleKeyframe(zoomed, 'vA', 'x', 0), k = rig(keyed, 'vA'); k.down(1, 100, 100); k.move(1, 130, 100); k.up(1, 130, 100);
  assert.deepStrictEqual(P.findClip(k.E.hist.cur, 'vA').clip.kf.x.map(a => a[0]), [0, 1500], 'a keyframe at the playhead when the picture already moves over time');
});
ok('the gestures stay out of the way of crop, tracking, eyedropper and playback', () => {
  ['cropOn', 'eye', 'panel'].forEach(k => { const r = rig(withText.p, null); r.E[k] = k === 'panel' ? 'track' : (k === 'eye' ? { drag: false } : true); const e = r.down(1, 200, 240); assert(!e.stopped, k); assert.strictEqual(r.win.count(), 0, k + ': nothing listens'); });
  const r = rig(withText.p, withText.id); r.E.playing = true; r.h.syncHandles();
});
ok('the editor is wired up: layer, listeners, text panel, turned title in the preview', () => {
  ['u.handles = mk(', "u.stage.style.touchAction = 'none'", "addEventListener('pointerdown', stageDown, true)", "E.ui.croplayer, E.ui.handles].filter(Boolean)", 'syncTrackBox(); syncHandles(); }', 'syncOverlays(); syncHandles(); syncSfx(s);',
    "{ key: 'rot', label: 'Turn' }", "sliderRow('Size', 3, 30, 1", "(c.rot ? ' rotate(' + c.rot + 'deg)' : '')", 'c.extrude, c.rot, cw, ch]', 'gSnap(st.cx + ', 'gSnap(s0.x + ', 'if (GP.seq !== seq0) return;'].forEach(s => assert(src.includes(s), 'missing: ' + s));
  assert.strictEqual(src.split('if (GP.seq !== seq0) return;').length - 1, 2, 'sticker and overlay drags both step aside');
});
console.log('\n' + n + ' checks passed');