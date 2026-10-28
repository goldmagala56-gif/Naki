'use strict';
// node tests/tools-pack.test.js
// Picture-in-picture layouts and speed curves.
const assert = require('assert');
const PIP = require('../www/pip.js'), SC = require('../www/speedcurves.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const FRAMES = [{ w: 1280, h: 720 }, { w: 720, h: 1280 }, { w: 1080, h: 1080 }], MEDIA = [{ w: 576, h: 1024 }, { w: 1920, h: 1080 }, { w: 500, h: 500 }, null];
// the pixel box an overlay placed by { x, y, size } covers
const box = (p, f, m) => { const w = p.size * f.w, h = w * (m ? m.h / m.w : 9 / 16); return { x0: p.x * f.w - w / 2, x1: p.x * f.w + w / 2, y0: p.y * f.h - h / 2, y1: p.y * f.h + h / 2, w, h }; };
const T = 1;   // a pixel of rounding

ok('layouts: eleven, each with a name, and an unknown one gives nothing', () => {
  assert.strictEqual(PIP.LIST.length, 11); assert.strictEqual(new Set(PIP.LIST.map(x => x.key)).size, 11); PIP.LIST.forEach(x => assert(x.label && PIP.find(x.key)));
  assert.strictEqual(PIP.place('sideways', FRAMES[0], MEDIA[0]), null); assert.strictEqual(PIP.find('nope'), null);
});
ok('layouts: every layout keeps the overlay inside the frame (except Fill), in every frame shape and for tall, wide and square media', () => {
  FRAMES.forEach(f => MEDIA.forEach(m => PIP.LIST.forEach(l => {
    const p = PIP.place(l.key, f, m), b = box(p, f, m), what = l.key + ' in ' + f.w + 'x' + f.h + ' for ' + JSON.stringify(m);
    assert(p.size > 0 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, what);
    if (l.key === 'fill') { assert(b.x0 <= T && b.y0 <= T && b.x1 >= f.w - T && b.y1 >= f.h - T, what + ' covers the frame'); return; }
    assert(b.x0 >= -T && b.y0 >= -T && b.x1 <= f.w + T && b.y1 <= f.h + T, what + ' inside: ' + JSON.stringify(b));
  })));
});
ok('layouts: a corner overlay sits in its corner with the same gap from both edges, and is not too big', () => {
  const f = FRAMES[0], m = MEDIA[1], gap = 0.04 * f.w;
  const tl = box(PIP.place('tl', f, m), f, m), br = box(PIP.place('br', f, m), f, m), tr = box(PIP.place('tr', f, m), f, m), bl = box(PIP.place('bl', f, m), f, m);
  assert(Math.abs(tl.x0 - gap) <= T && Math.abs(tl.y0 - gap) <= T, 'top left'); assert(Math.abs(f.w - br.x1 - gap) <= T && Math.abs(f.h - br.y1 - gap) <= T, 'bottom right');
  assert(Math.abs(f.w - tr.x1 - gap) <= T && Math.abs(tr.y0 - gap) <= T, 'top right'); assert(Math.abs(bl.x0 - gap) <= T && Math.abs(f.h - bl.y1 - gap) <= T, 'bottom left');
  assert(tl.w <= 0.32 * f.w + T); const tall = box(PIP.place('tl', f, MEDIA[0]), f, MEDIA[0]); assert(tall.h <= 0.45 * f.h + T, 'a tall video is limited by height: ' + tall.h);
  const wide = PIP.place('tl', f, m, { corner: 0.2, margin: 0.1 }), wb = box(wide, f, m); assert(wb.w <= 0.2 * f.w + T && Math.abs(wb.x0 - 0.1 * f.w) <= T, 'the options work');
});
ok('layouts: halves fill their half, Fit keeps the shape inside the frame, Fill covers it, and the centre is the middle', () => {
  const f = FRAMES[0], m = MEDIA[1], l = box(PIP.place('left', f, m), f, m), r = box(PIP.place('right', f, m), f, m), t = box(PIP.place('top', f, m), f, m), b = box(PIP.place('bottom', f, m), f, m);
  assert(l.x1 <= f.w / 2 + T && Math.abs(l.w - f.w / 2) <= T, 'left half'); assert(r.x0 >= f.w / 2 - T && r.x1 <= f.w + T, 'right half');
  assert(t.y1 <= f.h / 2 + T && b.y0 >= f.h / 2 - T, 'top and bottom halves');
  const full = PIP.place('full', f, m); assert.deepStrictEqual(full, { x: 0.5, y: 0.5, size: 1 }, 'a wide movie in a wide frame fits exactly');
  const c = PIP.place('center', f, m); assert.strictEqual(c.x, 0.5); assert.strictEqual(c.y, 0.5);
  const fill = PIP.place('fill', FRAMES[1], MEDIA[1]); assert(fill.size * 720 / (16 / 9) >= 1280 - T, 'a wide picture in a tall frame is scaled up until it covers the height');
});
ok('layouts: split screen puts two overlays side by side or one above the other, each in its own half', () => {
  const f = FRAMES[0], [a, b] = PIP.split('sbs', f, MEDIA[1], MEDIA[0]); assert(box(a, f, MEDIA[1]).x1 <= f.w / 2 + T && box(b, f, MEDIA[0]).x0 >= f.w / 2 - T);
  const [c, d] = PIP.split('stack', FRAMES[1], MEDIA[1], MEDIA[2]); assert(box(c, FRAMES[1], MEDIA[1]).y1 <= 640 + T && box(d, FRAMES[1], MEDIA[2]).y0 >= 640 - T);
});

ok('speed curves: six of them, each with a name and points that stay inside what the editor allows', () => {
  assert.strictEqual(SC.LIST.length, 6); assert.strictEqual(new Set(SC.LIST.map(x => x.key)).size, 6);
  SC.LIST.forEach(c => { assert(c.label && c.pts.length >= 3, c.key); c.pts.forEach(p => assert(p[0] >= 0 && p[0] <= 1 && p[1] >= SC.MIN && p[1] <= SC.MAX, c.key)); assert.strictEqual(c.pts[0][0], 0); assert.strictEqual(c.pts[c.pts.length - 1][0], 1); });
});
ok('speed curves: the speed glides between the points, holds before the first and after the last', () => {
  const pts = [[0.2, 1], [0.6, 3]];
  assert.strictEqual(SC.speedAt(pts, 0), 1); assert.strictEqual(SC.speedAt(pts, 1), 3); assert.strictEqual(SC.speedAt(pts, 0.4), 2, 'halfway is the middle value'); assert(SC.speedAt(pts, 0.3) < 1.5 && SC.speedAt(pts, 0.5) > 2.5, 'smooth, not a straight line');
  assert.strictEqual(SC.speedAt([], 0.5), 1); assert.strictEqual(SC.speedAt(pts, -5), 1); assert.strictEqual(SC.speedAt(pts, 9), 3);
});
ok('speed curves: the pieces cover the whole clip with no gaps, every speed is allowed, and the cuts are the piece edges', () => {
  [1000, 2500, 8000, 60000].forEach(len => SC.LIST.forEach(c => {
    const p = SC.plan(c.key, len), ps = p.pieces; assert.strictEqual(ps[0].fromMs, 0, c.key); assert.strictEqual(ps[ps.length - 1].toMs, len, c.key);
    for (let i = 1; i < ps.length; i++) assert.strictEqual(ps[i].fromMs, ps[i - 1].toMs, 'no gap in ' + c.key);
    ps.forEach(x => { assert(x.speed >= SC.MIN && x.speed <= SC.MAX && x.toMs > x.fromMs && x.outMs > 0, c.key); assert(Math.abs(x.speed * 20 - Math.round(x.speed * 20)) < 1e-9, 'steps of 0.05'); });
    assert.deepStrictEqual(p.cuts, ps.slice(0, -1).map(x => x.toMs)); assert.strictEqual(p.outMs, ps.reduce((s, x) => s + x.outMs, 0));
  }));
});
ok('speed curves: hero time is slower in the middle than at the ends, jump is faster, and neighbours with one speed are joined', () => {
  const h = SC.plan('hero', 10000).pieces, mid = h[Math.floor(h.length / 2)];
  assert(mid.speed < h[0].speed && mid.speed < h[h.length - 1].speed && mid.speed <= 0.35, 'hero: ' + JSON.stringify(h.map(x => x.speed)));
  const j = SC.plan('jump', 10000).pieces; assert(Math.max.apply(null, j.map(x => x.speed)) >= 2.5 && j[0].speed <= 1.2, 'jump');
  const flat = SC.plan([[0, 1], [1, 1]], 5000); assert.strictEqual(flat.pieces.length, 1); assert.strictEqual(flat.outMs, 5000); assert.deepStrictEqual(flat.cuts, []);
  assert(SC.plan('hero', 10000).outMs > 10000 * 0.9 && SC.plan('hero', 10000).outMs > SC.plan('jump', 10000).outMs, 'slow-mo makes the clip longer than a jump makes it');
});
ok('speed curves: short clips get fewer pieces, the options work, and nonsense gives nothing', () => {
  assert(SC.plan('hero', 700).pieces.length <= 2); assert.strictEqual(SC.plan('hero', 100).pieces.length, 1);
  assert(SC.plan('montage', 60000, { slices: 4 }).pieces.length <= 4); assert(SC.plan('montage', 60000, { minPieceMs: 20000 }).pieces.length <= 3);
  assert.strictEqual(SC.plan('nope', 1000), null); assert.strictEqual(SC.plan('hero', 0), null); assert.strictEqual(SC.plan('hero', -5), null); assert.strictEqual(SC.plan(null, 1000), null);
  assert.deepStrictEqual(SC.plan([[0, 9], [1, 0.01]], 4000).pieces.map(x => x.speed).every(s => s >= 0.25 && s <= 4), true, 'a curve outside the limits is brought inside');
});
console.log('\n' + n + ' checks passed');
