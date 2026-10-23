'use strict';
// node tests/timeline.test.js
// The filmstrip, the waveforms on sound clips, and locked rows.
const assert = require('assert');
const T = require('../www/thumbs.js'), K = require('../www/peaks.js'), P = require('../www/project.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

ok('filmstrip: the tiles across a clip show the moments of the movie where they sit, with speed and reverse worked in', () => {
  const tiles = (c, w, ppm, tw) => T.plan(c, w, ppm, tw).map(t => t.bucket);
  assert.deepStrictEqual(T.plan({ dur: 4000, in: 10000, speed: 1, type: 'video' }, 400, 0.1, 100).map(t => [t.x, t.w, t.bucket]), [[0, 100, 42], [100, 100, 46], [200, 100, 50], [300, 100, 54]]);
  assert.deepStrictEqual(tiles({ dur: 4000, in: 10000, speed: 2, type: 'video' }, 400, 0.1, 100), [44, 52, 60, 68], 'twice as fast: twice as far into the movie');
  assert.deepStrictEqual(tiles({ dur: 4000, in: 10000, speed: 1, type: 'video', reverse: true }, 400, 0.1, 100), [54, 50, 46, 42], 'reversed: last picture first');
  assert.deepStrictEqual(T.plan({ dur: 1000, in: 5000, type: 'freeze' }, 100, 0.1, 100), [{ x: 0, w: 100, bucket: 20 }], 'a held picture is one picture');
  assert.strictEqual(T.plan({ dur: 1000, in: 0, speed: 1, type: 'video' }, 250, 0.25, 100).length, 3); assert.strictEqual(T.plan({ dur: 1000, in: 0, speed: 1, type: 'video' }, 250, 0.25, 100)[2].w, 50, 'the last tile is the leftover');
});
ok('filmstrip: pictures that are there are drawn, the missing ones are asked for only when on screen, and the count of missing ones comes back', () => {
  const calls = []; const g = new Proxy({}, { get: (t, k) => (...a) => { calls.push([k].concat(a)); }, set: () => true });
  const store = { reqs: [], get: (u, k) => (k === 42 ? { width: 160, height: 90 } : null), request(u, k, im) { this.reqs.push([u, k, im]); } };
  const miss = T.paint(g, 400, 52, { dur: 4000, in: 10000, speed: 1, type: 'video' }, 0.1, { url: 'u', store, tileW: 100, k: 1, visible: [0, 250] });
  assert.strictEqual(miss, 3); assert.deepStrictEqual(store.reqs.map(r => r[1]), [46, 50], 'only the two tiles in view were asked for'); assert.strictEqual(calls.filter(c => c[0] === 'drawImage').length, 1);
  const di = calls.find(c => c[0] === 'drawImage'); assert.strictEqual(di[1].width, 160); assert.deepStrictEqual(di.slice(6), [0, 0, 100, 52], 'drawn over the first tile');
  store.reqs.length = 0; assert.strictEqual(T.paint(g, 100, 52, { dur: 1000, in: 0, speed: 1, type: 'video' }, 0.1, { url: '', store, tileW: 100, k: 1 }), 0, 'no file: nothing to wait for'); assert.strictEqual(store.reqs.length, 0);
  T.paint(g, 100, 52, { dur: 1000, in: 0, type: 'freeze' }, 0.1, { url: 'p', image: true, store, tileW: 100, k: 1 }); assert.deepStrictEqual(store.reqs[0], ['p', 'img', true], 'a photo overlay is asked for as an image');
});
ok('waveform: the loudest sample of every 50 ms is kept, also when a sound arrives in pieces', () => {
  const sr = 1000, ch = new Float32Array(sr * 2); for (let i = 0; i < ch.length; i++) ch[i] = i >= 500 && i < 600 ? 0.8 : (i >= 1500 && i < 1530 ? -0.4 : 0.01);
  const pk = K.make(2000); K.addSamples(pk, [ch], sr, 0);
  assert.strictEqual(pk.v[10], 204); assert.strictEqual(pk.v[30], 102); assert.strictEqual(pk.v[0], 3); assert.strictEqual(pk.max, 204); assert.strictEqual(pk.have[39], 1); assert.strictEqual(pk.have[41], 0);
  const p2 = K.make(1000); K.addSamples(p2, [new Float32Array(25).fill(0.5)], 1000, 25); K.addSamples(p2, [new Float32Array(25).fill(0.9)], 1000, 50);
  assert.deepStrictEqual([p2.v[0], p2.v[1]], [128, 229], 'a piece that starts in the middle of a bin fills its part of it');
  const two = K.make(100); K.addSamples(two, [new Float32Array(50).fill(0.2), new Float32Array(50).fill(0.6)], 1000, 0); assert.strictEqual(two.v[0], 153, 'the louder channel counts');
});
ok('waveform: columns for a clip follow where it starts, its speed and reverse; what is not read yet is reported', () => {
  const sr = 1000, ch = new Float32Array(sr * 2); for (let i = 500; i < 600; i++) ch[i] = 0.8; const pk = K.make(2000); K.addSamples(pk, [ch], sr, 0);
  let r = K.columns(pk, 0, 2000, 40, false); assert.strictEqual(r.vals[10], 204); assert.strictEqual(r.vals[30], 0); assert.strictEqual(r.missing, null);
  r = K.columns(pk, 0, 2000, 40, true); assert.strictEqual(r.vals[29], 204, 'reversed: the loud part is mirrored');
  r = K.columns(pk, 500, 1000, 20, false); assert.strictEqual(r.vals[0], 204, 'a clip that starts 0.5 s into the file');
  r = K.columns(pk, 1000, 3000, 30, false); assert.deepStrictEqual(r.missing, [2000, 4000], 'past what has been read');
  K.markRead(pk, 0, 5000); assert.strictEqual(K.columns(pk, 3000, 1000, 10, false).missing, null, 'marked as read: not asked for again');
  assert.deepStrictEqual(K.windows(0, 45000), [[0, 20000], [20000, 40000], [40000, 60000]]); assert.deepStrictEqual(K.windows(25000, 26000), [[20000, 40000]]);
  const out = []; K.drawBars({ fillRect: (x, y, w, h) => out.push([x, y, w, h]) }, new Uint8Array([0, 0, 255, 255, 100, 100]), 6, 34, 255);
  assert.deepStrictEqual(out[1], [2, 0, 1.5, 34], 'a full-height bar is as tall as the canvas'); assert(out[0][3] === 1 && out[2][3] < 34 && out[2][3] > 1);
});

// ---------- locked rows ----------
function make() {
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [
      { id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] },
      { id: 't-voice', kind: 'audio', role: 'voice', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vo', type: 'audio', asset: 'voice', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
}
ok('locked rows: a split leaves a locked row alone and cuts everything else', () => {
  const base = make(), locked = P.setTrackProps(base, 't-voice', { locked: true }), s = P.splitAt(locked, 5000);
  assert.strictEqual(s.tracks[0].clips.length, 2, 'the picture is cut'); assert.strictEqual(s.tracks[1].clips.length, 1, 'the locked voice is not'); assert.deepStrictEqual(P.validate(s), []);
  assert.strictEqual(P.splitAt(base, 5000).tracks[1].clips.length, 2, 'unlocked: cut as before');
  assert.strictEqual(P.setTrackProps(locked, 't-voice', { locked: false }).tracks[1].locked, false); assert.strictEqual(P.setTrackProps(base, 't-movie', { hidden: true }).tracks[0].hidden, true);
  assert.strictEqual(P.sourceAt(P.setTrackProps(base, 't-movie', { hidden: true }), 1000).video, null, 'a hidden picture row shows nothing');
});
console.log('\n' + n + ' checks passed');
