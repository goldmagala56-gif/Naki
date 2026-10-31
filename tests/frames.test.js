'use strict';
// node tests/frames.test.js
// The frames list: more than sixty, in groups, each drawn by code, each with its own colour and thickness, each usable on a project and reaching the export plan.
const assert = require('assert'), fs = require('fs'), path = require('path');
const F = require('../www/fx.js'), P = require('../www/project.js'), NP = require('../www/plan.js');
const G = F.gen;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

// a pretend canvas that remembers what was drawn (the same idea as in shapes.test.js)
function pretend() {
  const log = [];
  const g = new Proxy({ globalCompositeOperation: 'source-over', globalAlpha: 1 }, {
    get: (t, k) => { if (k === 'createImageData') return (a, b) => ({ data: new Uint8ClampedArray(a * b * 4) }); if (k === 'putImageData') return () => {}; return k in t ? t[k] : (...a) => { log.push(k); }; },
    set: (t, k, v) => { t[k] = v; return true; } });
  return { g, log };
}
const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
    { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' }] }] };
const OLD = ['border', 'polaroid', 'film', 'camcorder', 'rounded', 'mat', 'scallop', 'corners'];

ok('the list: more than sixty frames, the first eight are the old ones in their old order, every key and name is unique and every frame is in a group', () => {
  assert(G.FRAMES.length >= 60, 'frames: ' + G.FRAMES.length); assert.deepStrictEqual(G.FRAMES.slice(0, 8).map(f => f.key), OLD);
  assert.strictEqual(new Set(G.FRAMES.map(f => f.key)).size, G.FRAMES.length); assert.strictEqual(new Set(G.FRAMES.map(f => f.label)).size, G.FRAMES.length);
  G.FRAMES.forEach(f => assert(f.label && f.cat, f.key));
  const cats = [...new Set(G.FRAMES.map(f => f.cat))]; assert(cats.length >= 8 && cats[0] === 'Classic', cats.join()); cats.forEach(c => assert(G.FRAMES.filter(f => f.cat === c).length >= 3, c + ' has a few'));
});
ok('tidying: every frame is kept as it is, with its own colour and thickness, inside the allowed range', () => {
  G.FRAMES.forEach(f => {
    const c = G.clean({ kind: 'frame', frame: f.key }), d = G.frameDefaults(f.key);
    assert.strictEqual(c.frame, f.key); assert.strictEqual(c.color, d.color); assert.strictEqual(c.width, d.width); assert(/^#[0-9a-f]{6}$/.test(d.color), f.key); assert(d.width >= 0.02 && d.width <= 0.3, f.key); assert(G.label(c).length > 6, f.key);
  });
  assert.strictEqual(G.clean({ kind: 'frame', frame: 'nope' }).frame, 'border', 'an unknown name still becomes the plain border');
});
ok('drawing: every frame draws something in a wide and in a tall picture, small and large, and nothing throws', () => {
  G.FRAMES.forEach(f => [[320, 180], [180, 320], [1280, 720], [720, 1280], [1080, 1080], [64, 36]].forEach(([w, h]) => {
    const t = pretend(); G.draw(t.g, { kind: 'frame', frame: f.key, color: G.frameDefaults(f.key).color, width: G.frameDefaults(f.key).width }, w, h); assert(t.log.length > 3, f.key + ' in ' + w + 'x' + h);
    const t2 = pretend(); G.draw(t2.g, { kind: 'frame', frame: f.key, color: '#00ff88', width: 0.3 }, w, h); assert(t2.log.length > 3, f.key + ' at the widest, in another colour');
  }));
});
ok('project: every frame can be put on the picture, lasts to the end, and reaches the export plan as an overlay that carries its drawing', () => {
  G.FRAMES.forEach(f => {
    const o = {}, d = G.frameDefaults(f.key), p = P.addGen(base, 1000, { kind: 'frame', frame: f.key, color: d.color, width: d.width }, o);
    assert.strictEqual(P.validate(p).length, 0, f.key); const ov = NP.projectToPlan(p).overlays[0];
    assert(ov && ov.gen && ov.gen.frame === f.key && /^gen_/.test(ov.asset) && ov.gen.full === true, f.key);
  });
});
ok('editor: the Frames panel has a row of group buttons above the frames', () => {
  const ed = fs.readFileSync(path.join(__dirname, '..', 'www', 'editor.js'), 'utf8'); assert(ed.includes("chipKey('framepick'"), 'group buttons in the Frames panel');
});
console.log('\n' + n + ' checks passed');