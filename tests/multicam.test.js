'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const www = p => path.join(__dirname, '..', 'www', p);
const MC = require('../www/multicam.js'), P = require('../www/project.js'), NP = require('../www/plan.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

// a made-up event: sound bursts at random moments; camera B started `shift` ms earlier, so everything happens later in its file
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function scene(total, shift, seed, noise) {
  const r = rng(seed), events = []; for (let t = 500; t < 100000; t += 300 + Math.floor(r() * 1500)) events.push([t, 60 + Math.floor(r() * 250), 0.2 + r() * 3]);
  const mk = (sh, s2) => { const r2 = rng(s2), k = Math.round(total / 10), p = new Float32Array(k); for (let i = 0; i < k; i++) p[i] = 1e-6 * (0.5 + r2() * noise);
    events.forEach(([t, d, a]) => { const s = Math.round((t + sh) / 10), e = Math.round((t + sh + d) / 10); for (let i = Math.max(0, s); i < e && i < k; i++) p[i] += a * a * 1e-2 * (0.6 + 0.4 * Math.sin(i)); }); return p; };
  return { A: mk(0, seed + 1), B: mk(shift, seed + 2) };
}
const match = (A, B, o) => MC.matchEnvelopes(MC.envelopeFromPower(A), MC.envelopeFromPower(B), o || {});

ok('the offset between two recordings is found to within 20 ms, whichever started first', () => {
  [7340, -12500, 0, 31020].forEach(shift => { const s = scene(90000, shift, 42, 1), r = match(s.A, s.B, { maxLagMs: 60000 }); assert(Math.abs(r.offsetMs - shift) <= 20, shift + ' -> ' + r.offsetMs); assert(r.confidence > 0.6); });
});
ok('a different, quieter, noisier microphone still lines up', () => {
  const s = scene(90000, 4500, 7, 40); for (let i = 0; i < s.B.length; i++) s.B[i] *= 0.1;
  assert(Math.abs(match(s.A, s.B).offsetMs - 4500) <= 30);
});
ok('two recordings of different events give no confident match, and too little sound gives nothing', () => {
  const r = match(scene(90000, 0, 1, 1).A, scene(90000, 0, 99, 1).B); assert(!r || r.confidence < 0.35);
  assert.strictEqual(MC.matchEnvelopes(new Float32Array(100), new Float32Array(100), {}), null);
});

const base = { naki: 'project', version: 1, fps: 30, durationMs: 20000, levels: [], assets: { movie: { type: 'video', name: 'main.mp4', durMs: 100000 }, v1: { type: 'video', name: 'cam2.mp4', durMs: 60000 }, ov1: { type: 'video', name: 'overlay.mp4', durMs: 5000 }, v2: { type: 'video', name: 'cam3.mp4', durMs: 30000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
    { id: 'a', type: 'video', asset: 'movie', start: 0, dur: 10000, in: 5000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'L' },
    { id: 'b', type: 'video', asset: 'movie', start: 10000, dur: 10000, in: 15000, speed: 2, volume: 1, fadeIn: 0, fadeOut: 0 }] },
  { id: 't-ms', kind: 'audio', role: 'movieSound', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 's', type: 'audio', asset: 'movie', start: 0, dur: 10000, in: 5000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'L' }] }] };

ok('the cameras are the main video and the added videos (not overlays), and a sync is stored, tidied and removed', () => {
  assert.deepStrictEqual(P.angleList(base).map(a => [a.asset, a.sync]), [['movie', 0], ['v1', null], ['v2', null]]);
  const p = P.setAssetSync(base, 'v1', 7340); assert.strictEqual(p.assets.v1.syncMs, 7340); assert.strictEqual(P.setAssetSync(p, 'v1', 7340), p);
  assert.strictEqual(P.setAssetSync(p, 'movie', 5), p); assert.strictEqual(P.setAssetSync(p, 'ov1', 5), p); assert.strictEqual(P.setAssetSync(p, 'v1', 'x'), p);
  assert.strictEqual(P.setAssetSync(p, 'v1', 9e9).assets.v1.syncMs, 600000); assert.strictEqual(P.setAssetSync(p, 'v1', null).assets.v1.syncMs, undefined); assert.strictEqual(P.setAssetSync(base, 'v1', null), base);
});
ok('switching camera moves the clip to the same moment of the event in the other file, keeps the sound, and comes back exactly', () => {
  let o = {}; assert.strictEqual(P.switchAngle(base, 'a', 'v1', o), base); assert(/Sync/.test(o.error));
  const p = P.setAssetSync(base, 'v1', 7340); let q = P.switchAngle(p, 'a', 'v1', {}); const a = P.findClip(q, 'a').clip;
  assert.strictEqual(a.asset, 'v1'); assert.strictEqual(a.in, 12340); assert.strictEqual(a.dur, 10000); assert.strictEqual(a.link, 'L'); assert.strictEqual(P.findClip(q, 's').clip.asset, 'movie');
  q = P.switchAngle(q, 'a', 'movie', {}); assert.strictEqual(P.findClip(q, 'a').clip.in, 5000); assert.strictEqual(P.findClip(q, 'a').clip.asset, 'movie');
  assert.strictEqual(P.switchAngle(p, 'a', 'movie', {}), p, 'already showing it'); assert.deepStrictEqual(P.validate(P.switchAngle(p, 'a', 'v1', {})), []);
});
ok('a camera that did not film that moment is refused; two cameras switch through each other; reversed and sound clips are refused', () => {
  const p2 = P.setAssetSync(P.setAssetSync(base, 'v1', 7340), 'v2', 0); let o = {};
  assert.strictEqual(P.switchAngle(p2, 'b', 'v2', o), p2); assert(o.short);   // the double-speed clip needs 20 s of a 30 s file starting at 15 s
  assert.strictEqual(P.findClip(P.switchAngle(p2, 'b', 'v1', {}), 'b').clip.in, 22340);
  const p3 = P.setAssetSync(base, 'v1', -8000); o = {}; assert.strictEqual(P.switchAngle(p3, 'a', 'v1', o), p3); assert(o.short, 'that camera started after this moment');
  const p4 = P.setAssetSync(P.setAssetSync(base, 'v1', 7000), 'v2', 2000), viaV1 = P.switchAngle(p4, 'a', 'v1', {}); assert.strictEqual(P.findClip(P.switchAngle(viaV1, 'a', 'v2', {}), 'a').clip.in, 7000);
  const rv = P.setReverse(P.setAssetSync(base, 'v1', 7340), 'a'); o = {}; assert.strictEqual(P.switchAngle(rv, 'a', 'v1', o), rv); assert(/reversed/.test(o.error));
  o = {}; P.switchAngle(P.setAssetSync(base, 'v1', 1), 's', 'v1', o); assert(/picture clip/.test(o.error));
});
ok('a switched clip reaches the export plan with its camera and its place in that camera\'s file', () => {
  const q = P.switchAngle(P.setAssetSync(base, 'v1', 7340), 'a', 'v1', {}), sp = NP.projectToPlan(q).video[0];
  assert.strictEqual(sp.asset, 'v1'); assert.strictEqual(sp.movieStart, 12340);
});
ok('the editor has the Cameras button and panel, and multicam.js is loaded before the editor and cached', () => {
  const ed = fs.readFileSync(www('editor.js'), 'utf8'), html = fs.readFileSync(www('index.html'), 'utf8'), sw = fs.readFileSync(www('sw.js'), 'utf8');
  new vm.Script(ed, { filename: 'editor.js' });
  ["id: 'edCameras'", 'PANELS.cameras = ', 'function runCamSync', 'NMC.syncFiles', 'P.switchAngle(E.hist.cur, c.id, asset, out)', 'P.setAssetSync(E.hist.cur, asset, r.offsetMs)'].forEach(s => assert(ed.includes(s), s));
  assert(html.includes('<script src="multicam.js"></script>') && html.indexOf('multicam.js') < html.indexOf('src="editor.js"')); assert(sw.includes("'./multicam.js'"));
});
console.log('\n' + n + ' checks passed');