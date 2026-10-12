'use strict';
// node tests/overlay.test.js
// Overlays (a second video or a photo over the picture) and keyframes: the animation maths, the project edits, the export plan, and what the
// ffmpeg engine builds and renders.
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const A = require('../www/anim.js'), P = require('../www/project.js'), NP = require('../www/plan.js'), E = require('../www/export-engine.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const near = (a, b, m) => assert(Math.abs(a - b) < 1e-6, (m || '') + ' ' + a + ' vs ' + b);

// ---------- the animation maths ----------
ok('keyframes: straight lines between them, holding before the first and after the last', () => {
  const k = [[1000, 10], [3000, 30]];
  assert.strictEqual(A.kfValue(k, 0), 10); assert.strictEqual(A.kfValue(k, 1000), 10); assert.strictEqual(A.kfValue(k, 2000), 20); assert.strictEqual(A.kfValue(k, 3000), 30); assert.strictEqual(A.kfValue(k, 9000), 30);
  assert.strictEqual(A.kfValue([], 5), null); assert.strictEqual(A.kfValue([[500, 7]], 0), 7);
  assert.strictEqual(A.kfValue([[1000, 1], [1000, 5]], 1000), 1, 'two keyframes at the same moment are a jump');
});
ok('keyframes: an overlay or a picture clip takes each property from its keyframes, else its fixed value', () => {
  const o = { x: 0.5, y: 0.5, size: 0.4, rot: 10, opacity: 1, kf: { x: [[0, 0], [1000, 1]] } };
  const s = A.overlayState(o, 250); near(s.x, 0.25); assert.strictEqual(s.size, 0.4); assert.strictEqual(s.rot, 10);
  assert.deepStrictEqual(A.overlayState({}, 0), A.OVERLAY, 'a bare clip uses the defaults');
  const t = A.pictureTransform({ rot: 90, flipH: true, zoom: 2 }, { zoom: [[0, 1], [1000, 3]], x: [[0, 0], [1000, 1]] }, 500);
  near(t.zoom, 2); near(t.x, 0.5); assert.strictEqual(t.rot, 90); assert.strictEqual(t.flipH, true);
  assert.deepStrictEqual(A.pictureTransform(null, null, 0), { zoom: 1, x: 0, y: 0, rot: 0, flipH: false });
  const sp = { type: 'play', transform: { zoom: 1.5 } }; assert.strictEqual(A.spanAt(sp, 100), sp, 'no keyframes: the same span');
  near(A.spanAt({ kf: { zoom: [[0, 1], [1000, 2]] } }, 500).transform.zoom, 1.5);
  assert.deepStrictEqual(A.shiftKf({ x: [[500, 1], [1500, 2]] }, 500), { x: [[0, 1], [1000, 2]] });
  const r = A.overlayRect({ w: 200, h: 100 }, { x: 0.5, y: 0.25, size: 0.5, rot: 30, opacity: 0.4 }, 720, 1280);
  assert.deepStrictEqual([r.cx, r.cy, r.w, r.h, r.rot, r.opacity], [360, 320, 360, 180, 30, 0.4]);
  assert.strictEqual(A.overlayRect({}, { x: 0, y: 0, size: 0.5, rot: 0, opacity: 1 }, 100, 100).h, 28.125, 'unknown shape: 16:9');
});

// ---------- the test project ----------
function make() {
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
      { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 6000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' },
      { id: 'vB', type: 'video', asset: 'movie', start: 6000, dur: 6000, in: 30000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lB' }] }] };
}
const base = make(), info = { name: 'cam.mp4', kind: 'video', durMs: 5000, w: 640, h: 360 };

ok('overlay: added at the playhead with its file details; overlapping ones get their own rows; empty rows go away', () => {
  const o1 = {}, o2 = {}, o3 = {};
  let p = P.addOverlay(base, 1000, info, o1); assert.deepStrictEqual(P.validate(p), []);
  const c = P.findClip(p, o1.id).clip; assert.deepStrictEqual([c.type, c.start, c.dur, c.in, c.asset], ['video', 1000, 5000, 0, 'ov1']); assert.strictEqual(P.findClip(p, o1.id).track.kind, 'overlay');
  assert.deepStrictEqual(p.assets.ov1, { type: 'video', name: 'cam.mp4', durMs: 5000, w: 640, h: 360 }); assert.strictEqual(c.size, 0.35);
  p = P.addOverlay(p, 2000, { name: 'logo.png', kind: 'image', w: 100, h: 100 }, o2); const im = P.findClip(p, o2.id).clip;
  assert.deepStrictEqual([im.type, im.dur, im.asset], ['freeze', 3000, 'ov2'], 'a photo is one held picture, 3 s'); assert.strictEqual(p.tracks.filter(t => t.kind === 'overlay').length, 2);
  p = P.addOverlay(p, 7000, info, o3); assert.strictEqual(p.tracks.filter(t => t.kind === 'overlay').length, 2, 'it fits on the first row');
  assert.strictEqual(P.overlaysAt(p, 2500).length, 2); assert.strictEqual(P.overlaysAt(p, 6500).length, 0); assert.strictEqual(P.overlaysAt(p, 7500).length, 1);
  const del = P.deleteClip(P.deleteClip(p, o3.id), o1.id); assert.strictEqual(del.tracks.filter(t => t.kind === 'overlay').length, 1, 'the empty row is gone');
  const again = P.addOverlay(del, 100, info, {}); const ids = again.tracks.map(t => t.id); assert.strictEqual(new Set(ids).size, ids.length, 'row ids stay unique: ' + ids);
  assert.strictEqual(P.addOverlay(base, 11000, { name: 'x', kind: 'video', durMs: 9000 }, {}).tracks[1].clips[0].dur, 1000, 'cut to fit the video');
  assert.strictEqual(P.sourceAt(p, 2500).audio.length, 0, 'an overlay makes no sound'); assert.strictEqual(P.sourceAt(p, 2500).video.clip.id, 'vA', 'and is not the picture');
  const sk = P.addSticker(P.addSticker(base, 0, 3000, '★', {}), 1000, 3000, '♥', {}), sdel = P.deleteClip(sk, sk.tracks[1].clips[0].id), sadd = P.addSticker(sdel, 500, 3000, '⭐', {});
  assert.strictEqual(new Set(sadd.tracks.map(t => t.id)).size, sadd.tracks.length, 'sticker row ids stay unique too');
});
ok('keyframes: without them a change sets the fixed value; with them it sets the keyframe at the playhead', () => {
  const o = {}; const p = P.addOverlay(base, 0, info, o), id = o.id;
  const a = P.setAnimated(p, id, 'x', 0.1, 500); assert.strictEqual(P.findClip(a, id).clip.x, 0.1); assert.strictEqual(P.findClip(a, id).clip.kf, undefined);
  assert.strictEqual(P.findClip(P.setAnimated(p, id, 'size', 9, 0), id).clip.size, 1.5, 'size is limited'); assert.strictEqual(P.findClip(P.setAnimated(p, id, 'rot', 400, 0), id).clip.rot, 180);
  assert.strictEqual(P.setAnimated(p, id, 'x', 0.75, 0), p, 'no change: the same project'); assert.strictEqual(P.setAnimated(p, id, 'zoom', 2, 0), p, 'not an overlay property');
  assert.strictEqual(P.setAnimated(p, 'vA', 'size', 2, 0), p, 'the picture has zoom and pan only');
  let k = P.toggleKeyframe(p, id, 'x', 1000); assert.deepStrictEqual(P.findClip(k, id).clip.kf, { x: [[1000, 0.75]] }, 'a keyframe holds the current value');
  k = P.setAnimated(k, id, 'x', 0.2, 3000); assert.deepStrictEqual(P.findClip(k, id).clip.kf.x, [[1000, 0.75], [3000, 0.2]]);
  k = P.setAnimated(k, id, 'x', 0.9, 1010); assert.deepStrictEqual(P.findClip(k, id).clip.kf.x[0], [1000, 0.9], 'a change at (nearly) the same moment replaces that keyframe');
  assert(P.hasKeyframe(k, id, 'x', 3000) && !P.hasKeyframe(k, id, 'x', 2000) && !P.hasKeyframe(k, id, 'y', 3000));
  const c = P.findClip(k, id).clip; near(A.overlayState(c, 2000).x, 0.55);
  const one = P.toggleKeyframe(k, id, 'x', 3000); assert.deepStrictEqual(P.findClip(one, id).clip.kf.x, [[1000, 0.9]]);
  const none = P.toggleKeyframe(one, id, 'x', 1000); assert.strictEqual(P.findClip(none, id).clip.kf, undefined); assert.strictEqual(P.findClip(none, id).clip.x, 0.9, 'the last keyframe taken away leaves its value');
  const cl = P.clearKeyframes(k, id, null, 2000); assert.strictEqual(P.findClip(cl, id).clip.kf, undefined); near(P.findClip(cl, id).clip.x, 0.55, 'cleared: it keeps the value it had');
  assert.strictEqual(P.findClip(P.toggleKeyframe(p, id, 'x', 99999), id).clip.kf.x[0][0], 5000, 'the playhead is kept inside the clip');
});
ok('keyframes: the picture clip animates zoom and pan, and sets its fixed zoom exactly as before', () => {
  const a = P.setAnimated(base, 'vA', 'zoom', 2, 0), c = P.findClip(a, 'vA').clip;
  assert.deepStrictEqual(c.transform, { zoom: 2, x: 0, y: 0, rot: 0, flipH: false }); assert.deepStrictEqual(a.tracks[0].clips[0].transform, P.setTransform(base, 'vA', { zoom: 2 }).tracks[0].clips[0].transform, 'same as the Zoom slider always did');
  let k = P.toggleKeyframe(a, 'vA', 'zoom', 0); k = P.setAnimated(k, 'vA', 'zoom', 3.5, 4000); k = P.setAnimated(P.toggleKeyframe(k, 'vA', 'x', 0), 'vA', 'x', 0.8, 4000);
  const t = A.pictureTransform(P.findClip(k, 'vA').clip.transform, P.findClip(k, 'vA').clip.kf, 2000); near(t.zoom, 2.75); near(t.x, 0.4);
  assert.strictEqual(P.setAnimated(base, 'vA', 'zoom', 1, 0), base, 'zoom 1 is the normal picture');
});
ok('keyframes: they stay in step when a clip is split, trimmed, cut or its speed changes', () => {
  const o = {}; let p = P.addOverlay(base, 0, info, o); const id = o.id;
  p = P.setAnimated(P.toggleKeyframe(p, id, 'size', 0), id, 'size', 0.2, 0); p = P.setAnimated(P.toggleKeyframe(p, id, 'size', 4000), id, 'size', 0.6, 4000);   // 0.2 at 0 s, 0.6 at 4 s
  const size = (pp, cid, t) => A.overlayState(P.findClip(pp, cid).clip, t - P.findClip(pp, cid).clip.start).size;
  near(size(p, id, 2000), 0.4);
  const s = P.splitAt(p, 2000), right = s.tracks.find(t => t.kind === 'overlay').clips.find(c => c.start === 2000);
  near(size(s, id, 1000), 0.3, 'left piece'); near(size(s, right.id, 2000), 0.4, 'right piece starts where it was'); near(size(s, right.id, 3000), 0.5); near(size(s, right.id, 4000), 0.6);
  const t = P.trimClipStart(p, id, 1000); near(size(t, id, 1000), 0.3, 'trimmed start'); near(size(t, id, 3000), 0.5);
  const e = P.trimClipStart(P.trimClipStart(p, id, 1000), id, 0); near(size(e, id, 0), 0.3, 'start brought back holds the first value'); near(size(e, id, 1000), 0.3); near(size(e, id, 2000), 0.4); near(size(e, id, 4000), 0.6);
  const cut = P.rippleDelete(p, 500, 1500), cc = P.findClip(cut, id).clip; near(size(cut, cc.id, 500), 0.25, 'the part before the cut ends where it was'); const after = cut.tracks.find(t => t.kind === 'overlay').clips.find(c => c.start === 500); near(size(cut, after.id, 500), 0.35, 'the part after the cut carries on from where it was'); near(size(cut, after.id, 1500), 0.45);
  const v = P.setAnimated(P.toggleKeyframe(base, 'vA', 'zoom', 0), 'vA', 'zoom', 3, 3000), sp = P.setClipSpeed(v, 'vA', 2);
  assert.deepStrictEqual(P.findClip(sp, 'vA').clip.kf.zoom.map(x => x[0]), [0, 1500], 'twice as fast: the keyframes come twice as soon');
});

// ---------- the export plan ----------
ok('plan: overlays carry their file name, shape and keyframes; a picture clip carries its zoom and pan keyframes', () => {
  const o = {}; let p = P.addOverlay(base, 2000, info, o); p = P.setAnimated(P.toggleKeyframe(p, o.id, 'x', 0), o.id, 'x', 0.1, 0);
  p = P.setAnimated(P.toggleKeyframe(p, 'vB', 'zoom', 0), 'vB', 'zoom', 2, 0);
  const plan = NP.projectToPlan(p), ov = plan.overlays[0];
  assert.deepStrictEqual([ov.startMs, ov.durMs, ov.asset, ov.kind, ov.inMs, ov.w, ov.h, ov.size, ov.opacity], [2000, 5000, 'ov1', 'video', 0, 640, 360, 0.35, 1]); assert.deepStrictEqual(ov.kf, { x: [[0, 0.1]] });
  assert.deepStrictEqual(plan.video[1].kf, { zoom: [[0, 2]] }); assert.strictEqual(plan.video[0].kf, undefined);
  const im = P.addOverlay(base, 0, { name: 'p.png', kind: 'image', w: 10, h: 10 }, {}); assert.strictEqual(NP.projectToPlan(im).overlays[0].kind, 'image');
  assert.strictEqual(NP.projectToPlan(base).overlays, undefined);
});

// ---------- the ffmpeg engine ----------
const info0 = { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 6 };
const plan0 = (extra, spanA) => Object.assign({ naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 6000 }, audio: [],
  video: [Object.assign({ type: 'play', sessionStart: 0, sessionEnd: 2000, movieStart: 0 }, spanA || {}), { type: 'play', sessionStart: 2000, sessionEnd: 4000, movieStart: 4000 }] }, extra || {});
const ov0 = (o) => Object.assign({ startMs: 1000, durMs: 2000, asset: 'ov1', kind: 'video', inMs: 0, x: 0.75, y: 0.25, size: 0.35, rot: 0, opacity: 1, w: 160, h: 90 }, o || {});
const argsFor = (r, f) => r.jobs.find(j => j.produces === f).args;
ok('ffmpeg engine: an overlay becomes an extra input cut to the part, laid over only where it shows', () => {
  const r = E.planToJobs(plan0({ overlays: [ov0()] }), info0, { height: 360 });
  const a = argsFor(r, 'v0000.ts'), g = a[a.indexOf('-filter_complex') + 1];
  assert(a.join(' ').includes('-ss 0.000 -t 1.000 -i ov1.in'), a.join(' ')); assert(g.includes('setpts=PTS-STARTPTS+1.000/TB,scale=224:126,format=rgba'), g);
  assert(g.includes("overlay=x='main_w*(0.75)-overlay_w/2':y='main_h*(0.25)-overlay_h/2':eof_action=pass:enable='between(t,1.000,2.000)'"), g);
  const b = argsFor(r, 'v0001.ts'), gb = b[b.indexOf('-filter_complex') + 1]; assert(b.join(' ').includes('-ss 1.000 -t 1.000 -i ov1.in') && gb.includes("between(t,0.000,1.000)"), 'the next part carries on from where it was: ' + b.join(' '));
  const none = E.planToJobs(plan0(), info0, { height: 360 }); assert(argsFor(none, 'v0000.ts').indexOf('-filter_complex') < 0, 'no overlay: the plain command');
  const img = E.planToJobs(plan0({ overlays: [ov0({ kind: 'image' })] }), info0, { height: 360 }); assert(argsFor(img, 'v0000.ts').join(' ').includes('-loop 1 -framerate 30 -t 1.000 -i ov1.in'));
});
ok('ffmpeg engine: keyframes become expressions that change over time; fixed values stay plain numbers', () => {
  const r = E.planToJobs(plan0({ overlays: [ov0({ kf: { size: [[0, 0.2], [2000, 0.5]], opacity: [[0, 1], [2000, 0.2]], rot: [[0, 0], [2000, 90]], x: [[0, 0.2], [2000, 0.8]] } })] }), info0, { height: 360 });
  const a = argsFor(r, 'v0000.ts'), g = a[a.indexOf('-filter_complex') + 1];
  assert(g.includes('eval=frame') && g.includes("rotate=a='(") && g.includes("geq=r='r(X,Y)'") && g.includes('alpha(X,Y)*(if(lt(T,'), g);
  assert(g.includes("overlay=x='main_w*(if(lt(t,1),0.2,if(lt(t,3),"), 'times are counted from the start of this part (the overlay starts 1 s in): ' + g);
  const z = E.planToJobs(plan0(null, { kf: { zoom: [[0, 1], [2000, 3]] } }), info0, { height: 360 }), za = argsFor(z, 'v0000.ts').join(' ');
  assert(za.includes("fps=30,zoompan=z='if(lt((on/30),0),1,if(lt((on/30),2)") && za.includes(':d=1:s=640x360:fps=30'), za);
  const fast = E.planToJobs(plan0(null, { kf: { zoom: [[0, 1], [2000, 3]] }, speed: 2 }), info0, { height: 360 }), fa = argsFor(fast, 'v0000.ts').join(' '); assert(fa.includes('lt((on/30),4)'), 'a faster picture reads its keyframes on the movie clock: ' + fa);
});
// ---- real ffmpeg, only when this computer has a recent one ----
function ffmpegOk() { const r = cp.spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }); const m = r.status === 0 && /version\s+n?(\d+)/.exec(r.stdout); return !!m && +m[1] >= 5; }
if (ffmpegOk()) {
  const mk = (dir) => (a, o) => cp.spawnSync('ffmpeg', ['-y', '-v', 'error'].concat(a), Object.assign({ cwd: dir, encoding: 'utf8' }, o || {}));
  ok('real ffmpeg: keyframe expressions give the same numbers as the maths', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-kf-')), sh = mk(dir);
    try {
      const pts = [[500, 0.2], [1500, 0.9], [2500, 0.4]];
      const expr = A.kfExpr(pts, 0, 1, 'T');
      const r = sh(['-f', 'lavfi', '-i', "nullsrc=s=4x4:r=10:d=3.2,format=gray,geq=lum='clip(255*(" + expr + "),0,255)'", '-f', 'image2', 'f%02d.png']); assert.strictEqual(r.status, 0, r.stderr);
      [0, 3, 6, 9, 12].forEach((i, k) => {
        const f = 'f' + String(i + 1).padStart(2, '0') + '.png', o = cp.spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(dir, f), '-frames:v', '1', '-vf', 'crop=1:1:0:0,format=gray', '-f', 'rawvideo', '-'], { encoding: null });
        const t = i / 10, want = A.kfValue(pts, t * 1000) * 255; assert(Math.abs(o.stdout[0] - want) <= 2, 'at ' + t + ' s: ' + o.stdout[0] + ' vs ' + want.toFixed(1));
      });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  const render = (plan, opts, withImage) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-ov-')), sh = mk(dir);
    let r = sh(['-f', 'lavfi', '-i', 'color=c=red:s=320x360:r=30:d=6', '-f', 'lavfi', '-i', 'color=c=blue:s=320x360:r=30:d=6', '-filter_complex', '[0:v][1:v]hstack,format=yuv420p', '-t', '6', 'm.mp4']); assert.strictEqual(r.status, 0, r.stderr);
    fs.renameSync(path.join(dir, 'm.mp4'), path.join(dir, 'movie.in'));
    r = sh(['-f', 'lavfi', '-i', 'color=c=0x00ff00:s=160x90:r=30:d=5', '-pix_fmt', 'yuv420p', 'ov1.mp4']); assert.strictEqual(r.status, 0, r.stderr); fs.renameSync(path.join(dir, 'ov1.mp4'), path.join(dir, 'ov1.in'));
    if (withImage) { r = sh(['-f', 'lavfi', '-i', 'color=c=0xffff00:s=100x100', '-frames:v', '1', 'ov1.png']); assert.strictEqual(r.status, 0, r.stderr); fs.renameSync(path.join(dir, 'ov1.png'), path.join(dir, 'ov1.in')); }
    const built = E.planToJobs(plan, info0, Object.assign({ height: 360 }, opts || {}));
    built.jobs.forEach(j => { const x = sh(j.args); assert.strictEqual(x.status, 0, j.label + ': ' + x.stderr); });
    fs.writeFileSync(path.join(dir, 'video.txt'), built.videoList.map(f => "file '" + f + "'\n").join(''));
    r = sh(E.finalMixArgs([], plan.durationMs)); assert.strictEqual(r.status, 0, r.stderr);
    const frame = (t) => { const o = cp.spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', path.join(dir, 'out.mp4'), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: null }); return { w: built.width, h: built.height, d: o.stdout }; };
    const px = (t, fx, fy) => { const f = frame(t), i = (Math.round(fy * f.h) * f.w + Math.round(fx * f.w)) * 3; return [f.d[i], f.d[i + 1], f.d[i + 2]]; };
    const green = (t) => { const f = frame(t); let c = 0, x0 = 1e9, x1 = -1; for (let y = 0; y < f.h; y += 2) for (let x = 0; x < f.w; x += 2) { const i = (y * f.w + x) * 3; if (f.d[i + 1] > f.d[i] + 60 && f.d[i + 1] > f.d[i + 2] + 60) { c++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); } } return { n: c, x0, x1 }; };
    const frames = +cp.spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path.join(dir, 'out.mp4')], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
    return { px, green, frames, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
  };
  ok('real ffmpeg: an overlay video shows only while it should, where it should, and the video keeps its length', () => {
    const r = render(plan0({ overlays: [ov0({ x: 0.25, y: 0.5, size: 0.3 })] }));
    try {
      assert.strictEqual(r.frames, 120); assert.strictEqual(r.green(0.5).n, 0, 'before it starts'); assert.strictEqual(r.green(3.5).n, 0, 'after it ends');
      const a = r.green(1.5), b = r.green(2.5); assert(a.n > 300 && b.n > 300, 'on screen across the two parts: ' + a.n + ', ' + b.n);
      const c = r.px(1.5, 0.25, 0.5); assert(c[1] > 200 && c[0] < 60, 'centred on x = 0.25: ' + c);
    } finally { r.done(); }
  });
  ok('real ffmpeg: keyframes move, grow and turn the overlay over time', () => {
    const r = render(plan0({ overlays: [ov0({ startMs: 0, durMs: 4000, kf: { x: [[0, 0.2], [2000, 0.8]], size: [[0, 0.2], [2000, 0.5]], rot: [[0, 0], [2000, 90]] } })] }));
    try {
      assert.strictEqual(r.frames, 120); const a = r.green(0.2), b = r.green(1.0), c = r.green(3.0);
      assert(a.n > 100 && b.n > 100 && c.n > 100, 'there all the time'); assert(a.x1 < 260, 'starts on the left: ' + JSON.stringify(a)); assert(c.x0 > 300, 'ends on the right: ' + JSON.stringify(c));
      assert(c.n > a.n * 3, 'and has grown: ' + a.n + ' -> ' + c.n); assert((b.x0 + b.x1) / 2 > (a.x0 + a.x1) / 2 && (b.x0 + b.x1) / 2 < (c.x0 + c.x1) / 2, 'moving across in between');
    } finally { r.done(); }
  });
  ok('real ffmpeg: a fading overlay, a photo overlay, and an overlay next to a transition and a blurred background', () => {
    let r = render(plan0({ overlays: [ov0({ startMs: 0, durMs: 4000, size: 0.5, x: 0.5, y: 0.5, kf: { opacity: [[0, 1], [3000, 0]] } })] }));
    try { assert.strictEqual(r.frames, 120); const a = r.px(0.1, 0.5, 0.5), z = r.px(3.2, 0.5, 0.5); assert(a[1] > 200 && z[1] < 120, 'solid, then gone: ' + a + ' / ' + z); } finally { r.done(); }
    r = render(plan0({ overlays: [ov0({ kind: 'image', startMs: 0, durMs: 4000, size: 0.3, x: 0.5, y: 0.5, w: 100, h: 100 })] }), null, true);
    try { assert.strictEqual(r.frames, 120); const a = r.px(1, 0.5, 0.5); assert(a[0] > 200 && a[1] > 200 && a[2] < 80, 'a yellow photo in the middle: ' + a); } finally { r.done(); }
    const sp = { transitionIn: { type: 'fade', durMs: 600 } }; const p2 = plan0({ overlays: [ov0({ startMs: 1000, durMs: 2000 })] }); Object.assign(p2.video[1], sp);
    r = render(p2, { ratio: '9:16', bg: { type: 'blur' } }); try { assert.strictEqual(r.frames, 120); assert(r.green(2.0).n > 100, 'visible through the transition'); } finally { r.done(); }
  });
  ok('real ffmpeg: a picture whose zoom and pan have keyframes really zooms and pans', () => {
    const r = render(plan0(null, { kf: { zoom: [[0, 1], [2000, 3]], x: [[0, 0], [2000, 1]] } }));
    try {
      assert.strictEqual(r.frames, 120);
      const a = r.px(0.05, 0.25, 0.5), a2 = r.px(0.05, 0.75, 0.5), z = r.px(1.9, 0.25, 0.5);
      assert(a[0] > 180 && a[2] < 80 && a2[2] > 180, 'starts as the whole picture (red left, blue right): ' + a + ' ' + a2); assert(z[2] > 180 && z[0] < 80, 'ends zoomed in and panned right: ' + z);
    } finally { r.done(); }
    [[{ ratio: '9:16', bg: { type: 'blur' } }, {}], [{ ratio: '1:1' }, { transform: { zoom: 1, x: 0, y: 0, rot: 90, flipH: true } }], [{ vertical: true }, { speed: 2 }]].forEach(([o, extra]) => {
      const q = render(plan0(null, Object.assign({ kf: { zoom: [[0, 1], [1500, 2]] } }, extra)), o); try { assert.strictEqual(q.frames, 120, JSON.stringify(o)); } finally { q.done(); }
    });
  });
} else console.log('  --  real-file checks skipped (need ffmpeg 5 or newer on this computer)');
console.log('\n' + n + ' checks passed');
