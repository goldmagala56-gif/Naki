'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const www = p => path.join(__dirname, '..', 'www', p);
const ed = fs.readFileSync(www('editor.js'), 'utf8'), css = fs.readFileSync(www('editor.css'), 'utf8'), html = fs.readFileSync(www('index.html'), 'utf8');
const P = require('../www/project.js'), M = require('../www/markers.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };

ok('adding a marker returns a new project, keeps time order, and never changes the old one', () => {
  const o1 = {}, o2 = {}; let p = M.add(base, 5000, { name: 'Drop', color: 'blue' }, o1);
  assert.notStrictEqual(p, base); assert.strictEqual(M.list(base).length, 0);
  p = M.add(p, 2000, null, o2);
  assert.deepStrictEqual(M.times(p), [2000, 5000]);
  const m = M.list(p)[1]; assert.strictEqual(m.name, 'Drop'); assert.strictEqual(m.color, 'blue'); assert.strictEqual(m.id, o1.id);
  assert.notStrictEqual(o1.id, o2.id);
});
ok('a marker is kept inside the video, and a second one at the same spot is not added', () => {
  assert.strictEqual(M.list(M.add(base, 99999, null, {}))[0].t, 12000);
  assert.strictEqual(M.list(M.add(base, -50, null, {}))[0].t, 0);
  const o = {}, p = M.add(base, 3000, null, {}), q = M.add(p, 3030, null, o);
  assert.strictEqual(q, p); assert.strictEqual(o.exists, true); assert.strictEqual(o.id, M.list(p)[0].id);
});
ok('rename, recolour and move; a change that changes nothing returns the same project', () => {
  const o = {}; let p = M.add(base, 4000, null, o);
  assert.strictEqual(M.update(p, o.id, { name: '' }), p);
  p = M.update(p, o.id, { name: '  Big   drop ', color: 'green', t: 6500 });
  const m = M.list(p)[0]; assert.strictEqual(m.name, 'Big drop'); assert.strictEqual(m.color, 'green'); assert.strictEqual(m.t, 6500);
  assert.strictEqual(M.update(p, o.id, { color: 'nope' }), p, 'an unknown colour is ignored');
  assert.strictEqual(M.list(M.update(p, o.id, { name: 'x'.repeat(100) }))[0].name.length, 40);
});
ok('delete, clear, and finding the next or previous marker', () => {
  let p = base; ['a', 'b', 'c'].forEach((x, i) => { p = M.add(p, 2000 * (i + 1), { name: x }, {}); });
  assert.strictEqual(M.neighbour(p, 2000, 1).t, 4000); assert.strictEqual(M.neighbour(p, 2000, -1), null);
  assert.strictEqual(M.neighbour(p, 5000, -1).t, 4000); assert.strictEqual(M.neighbour(p, 6000, 1), null);
  const id = M.list(p)[1].id; p = M.remove(p, id); assert.deepStrictEqual(M.times(p), [2000, 6000]);
  assert.strictEqual(M.remove(p, 'zz'), p);
  assert.strictEqual(M.list(M.clear(p)).length, 0); assert.strictEqual(M.clear(base), base);
});
ok('bad saved data is ignored, and ids are never reused', () => {
  const bad = Object.assign({}, base, { markers: [null, { id: 'mk1' }, { id: 'mk7', t: 1000, name: 'ok', color: 'red' }, { t: 5 }] });
  assert.strictEqual(M.list(bad).length, 1);
  const o = {}; M.add(bad, 3000, null, o); assert.strictEqual(o.id, 'mk8');
});
ok('markers survive an ordinary edit (split) so they are saved and undone with the project', () => {
  const p = M.add(base, 9000, { name: 'keep' }, {}), q = P.splitAt(p, 4000);
  assert.strictEqual(M.list(q).length, 1); assert.strictEqual(M.list(q)[0].name, 'keep');
});
ok('the editor has the marker tool, the flags, the panel, snapping and the M key', () => {
  ['function addMarkerHere', 'function markerTap', 'function jumpMarker', 'function drawMarkerFlags', 'function snapPts', "ROWS.marker = ", "PANELS.markeredit = ",
    "name: 'marker'", "id: 'edMarkerAdd'", "k === 'm' || k === 'M'", "tg.closest('.ed-mflag')", 'drawMarkerFlags(ruler)'].forEach(s => assert(ed.includes(s), s));
  assert(!ed.includes('8 / E.ppm, [E.t])'), 'trimming snaps to markers too');
  assert((ed.match(/snapPts\(\)/g) || []).length >= 5, 'every snap point uses the markers');
});
ok('the flag style is in editor.css and markers.js loads before editor.js', () => {
  assert(css.includes('.ed-mflag'));
  assert(html.includes('<script src="markers.js"></script>')); assert(html.indexOf('markers.js') < html.indexOf('src="editor.js"'));
});

ok('cutting a part out moves the markers after it earlier; a marker inside the cut lands on the cut', () => {
  let p = base; [2000, 4000, 9000].forEach(t => { p = M.add(p, t, null, {}); });
  const q = P.rippleDelete(p, 3000, 5000);
  assert.deepStrictEqual(M.times(q), [2000, 3000, 7000]);
  assert.deepStrictEqual(M.times(p), [2000, 4000, 9000], 'the old project is left alone');
});
ok('holding a picture moves the markers after it later', () => {
  let p = base; [2000, 9000].forEach(t => { p = M.add(p, t, null, {}); });
  assert.deepStrictEqual(M.times(P.insertFreeze(p, 5000, 1000)), [2000, 10000]);
});
console.log('\n' + n + ' checks passed');