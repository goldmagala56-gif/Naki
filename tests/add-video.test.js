'use strict';
// node tests/add-video.test.js
// "Add video": another video file appended to the end of the picture line, with its own sound. The project edits, the export plan, what the ffmpeg engine
// builds and (when ffmpeg is installed) renders.
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const P = require('../www/project.js'), NP = require('../www/plan.js'), E = require('../www/export-engine.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

// ---------- the test project: two picture clips from the original movie, their sound and a voice ----------
function make() {
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', name: 'film.mp4', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [
      { id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
        { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 6000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' },
        { id: 'vB', type: 'video', asset: 'movie', start: 6000, dur: 6000, in: 30000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lB' }] },
      { id: 't-moviesound', kind: 'audio', role: 'movieSound', muted: false, hidden: false, volume: 1, locked: false, clips: [
        { id: 'sA', type: 'audio', asset: 'movie', start: 0, dur: 6000, in: 10000, speed: 1, volume: 1, gain: [[0, 1], [6000, 1]], fadeIn: 0, fadeOut: 0, link: 'lA' },
        { id: 'sB', type: 'audio', asset: 'movie', start: 6000, dur: 6000, in: 30000, speed: 1, volume: 1, gain: [[0, 1], [6000, 1]], fadeIn: 0, fadeOut: 0, link: 'lB' }] },
      { id: 't-voice', kind: 'audio', role: 'voice', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vo', type: 'audio', asset: 'voice', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
}
const base = make(), info = { name: 'extra.mp4', durMs: 5000, w: 640, h: 480 };
const lane = (p) => p.tracks.find(t => t.role === 'movie'), snd = (p) => p.tracks.find(t => t.role === 'movieSound');

ok('add video: it goes after the last picture clip with its own linked sound, and the video gets longer', () => {
  const out = {}, p = P.addVideoClip(base, info, out); assert.deepStrictEqual(P.validate(p), []);
  const c = P.findClip(p, out.id).clip; assert.deepStrictEqual([c.type, c.asset, c.start, c.dur, c.in, c.speed], ['video', 'v1', 12000, 5000, 0, 1]); assert.strictEqual(out.asset, 'v1');
  assert.deepStrictEqual(p.assets.v1, { type: 'video', name: 'extra.mp4', durMs: 5000, w: 640, h: 480 }); assert.strictEqual(p.durationMs, 17000, 'the project now ends with the new video');
  const mate = P.linkedClips(p, out.id).find(x => x.track.role === 'movieSound').clip; assert.deepStrictEqual([mate.asset, mate.start, mate.dur, mate.in], ['v1', 12000, 5000, 0]);
  assert.strictEqual(P.sourceAt(p, 14000).video.clip.id, out.id); assert.strictEqual(P.sourceAt(p, 14000).audio.filter(a => a.role === 'movieSound').length, 1);
  assert.strictEqual(base.tracks[0].clips.length, 2, 'the old project is untouched'); assert.strictEqual(base.assets.v1, undefined);
  const o2 = {}, p2 = P.addVideoClip(p, { name: 'b.mp4', durMs: 2000, w: 1280, h: 720 }, o2); assert.strictEqual(o2.asset, 'v2'); assert.strictEqual(P.findClip(p2, o2.id).clip.start, 17000); assert.deepStrictEqual(P.validate(p2), []);
  assert.strictEqual(P.addVideoClip(base, { name: 'x', durMs: 100 }, {}), base, 'too short: nothing happens'); assert.strictEqual(P.addVideoClip(base, null, {}), base);
});
ok('add video: it follows the end of the picture, not the end of the voice, and works after the picture was cut short', () => {
  const cut = P.deleteClip(base, 'vB'), out = {}, p = P.addVideoClip(cut, info, out);
  assert.strictEqual(P.findClip(p, out.id).clip.start, 6000, 'right after what is left of the picture'); assert.deepStrictEqual(P.validate(p), []);
});
ok('an added video splits, trims, moves, changes speed and is deleted like any picture clip, with its sound', () => {
  const out = {}, p = P.addVideoClip(base, info, out), id = out.id;
  const s = P.splitAt(p, 14000), parts = lane(s).clips.filter(c => c.asset === 'v1'); assert.strictEqual(parts.length, 2); assert.deepStrictEqual([parts[0].in, parts[1].in, parts[1].start], [0, 2000, 14000]); assert.strictEqual(snd(s).clips.filter(c => c.asset === 'v1').length, 2);
  const t = P.trimClipEnd(p, id, 99999); assert.strictEqual(P.findClip(t, id).clip.dur, 5000, 'cannot be made longer than the file'); const t2 = P.trimClipEnd(p, id, 15000); assert.strictEqual(P.findClip(t2, id).clip.dur, 3000);
  const sp = P.setClipSpeed(p, id, 2); assert.strictEqual(P.findClip(sp, id).clip.dur, 2500); assert.strictEqual(P.linkedClips(sp, id).find(x => x.track.role === 'movieSound').clip.speed, 2);
  const d = P.deleteClip(p, id); assert.strictEqual(lane(d).clips.length, 2); assert.strictEqual(snd(d).clips.length, 2);
  const cut = P.rippleDelete(p, 13000, 14000); assert.strictEqual(cut.durationMs, 16000); assert.deepStrictEqual(P.validate(cut), []);
});
ok('join: two halves of an added video become one clip again, but a clip never joins one from another file', () => {
  const out = {}, p = P.addVideoClip(base, info, out), s = P.splitAt(p, 14000), first = lane(s).clips.find(c => c.asset === 'v1' && c.start === 12000), o = {};
  const j = P.joinWithNext(s, first.id, o); assert.strictEqual(o.merged, true); assert.strictEqual(lane(j).clips.filter(c => c.asset === 'v1').length, 1);
  const o2 = {}; P.joinWithNext(p, 'vB', o2); assert.notStrictEqual(o2.merged, true, 'the end of the film does not join the added video');
});
ok('freeze frame of an added video holds a picture of that video, not of the original', () => {
  const out = {}, p = P.addVideoClip(base, info, out), f = P.insertFreeze(p, 14000, 2000), fr = lane(f).clips.find(c => c.type === 'freeze');
  assert.deepStrictEqual([fr.asset, fr.in, fr.start, fr.dur], ['v1', 2000, 14000, 2000]);
  const f0 = P.insertFreeze(base, 3000, 1000); assert.strictEqual(lane(f0).clips.find(c => c.type === 'freeze').asset, 'movie');
});
ok('reverse is refused on an added video, and replacing the movie only looks at the original', () => {
  const out = {}, p = P.addVideoClip(base, info, out); assert.strictEqual(P.setReverse(p, out.id), p); assert.notStrictEqual(P.setReverse(p, 'vA'), p);
  assert.strictEqual(P.movieNeeded(p), P.movieNeeded(base), 'an added video does not count as "movie used"');
});

// ---------- the export plan ----------
ok('plan: a picture and sound from an added video say which file they come from; nothing changes for the original movie', () => {
  const plain = NP.projectToPlan(base); plain.video.forEach(s => assert.strictEqual(s.asset, undefined)); plain.audio.forEach(a => assert.strictEqual(a.asset, undefined));
  const out = {}, p = P.addVideoClip(base, info, out), plan = NP.projectToPlan(p), last = plan.video[plan.video.length - 1];
  assert.deepStrictEqual([last.type, last.asset, last.sessionStart, last.sessionEnd, last.movieStart], ['play', 'v1', 12000, 17000, 0]);
  const a = plan.audio.find(x => x.asset === 'v1'); assert.deepStrictEqual([a.src, a.startMs, a.durMs, a.inMs], ['movie', 12000, 5000, 0]); assert.strictEqual(plan.audio.filter(x => x.src === 'movie' && !x.asset).length, 2);
  const f = NP.projectToPlan(P.insertFreeze(p, 14000, 2000)).video.find(s => s.type === 'freeze'); assert.strictEqual(f.asset, 'v1'); assert.strictEqual(f.movieAt, 2000);
});

// ---------- the ffmpeg engine ----------
const mainInfo = { hasAudio: true, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 6 };
const assets = { v1: { hasAudio: true, audioMono: true, width: 320, height: 240, sar: 1, durationSec: 5 }, v2: { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 5 } };
const aud = (s, e, asset) => Object.assign({ src: 'movie', startMs: s, durMs: e - s, inMs: 0, points: [[0, 1], [e - s, 1]] }, asset ? { asset: asset } : {});
const plan0 = (video, audio) => ({ naki: 'export-plan', version: 2, durationMs: video[video.length - 1].sessionEnd, movie: { durationMs: 6000 }, audio: audio || [], video: video });
const play = (s, e, extra) => Object.assign({ type: 'play', sessionStart: s, sessionEnd: e, movieStart: 0 }, extra || {});
const inputOf = (j) => j.args[j.args.indexOf('-i') + 1], job = (r, label) => r.jobs.find(j => j.label === label);
ok('ffmpeg engine: each part of the picture reads its own file, and a different shape is fitted inside the frame with bars', () => {
  const r = E.planToJobs(plan0([play(0, 2000), play(2000, 4000, { asset: 'v1' }), play(4000, 5000, { movieStart: 3000 })]), mainInfo, { height: 360, assets });
  assert.deepStrictEqual([1, 2, 3].map(i => inputOf(job(r, 'picture ' + i))), ['movie.in', 'v1.in', 'movie.in']);
  const a = job(r, 'picture 2').args.join(' '), b = job(r, 'picture 1').args.join(' ');
  const bars = (t) => /,pad=\d+:\d+:/.test(t);
  assert(a.includes('force_original_aspect_ratio=decrease') && bars(a), '4:3 inside a 16:9 frame: bars: ' + a); assert(!bars(b), 'the original movie is fitted as before: ' + b);
  const same = E.planToJobs(plan0([play(0, 2000, { asset: 'v2' })]), mainInfo, { height: 360, assets }); assert(!bars(job(same, 'picture 1').args.join(' ')), 'the same shape needs no bars');
  const nof = E.planToJobs(plan0([play(0, 2000, { asset: 'v1' })]), mainInfo, { height: 360 }); assert.strictEqual(inputOf(job(nof, 'picture 1')), 'v1.in', 'without its details it still reads its own file');
  const fz = E.planToJobs(plan0([{ type: 'freeze', sessionStart: 0, sessionEnd: 1000, movieAt: 1000, asset: 'v1' }]), mainInfo, { height: 360, assets }); assert.strictEqual(inputOf(job(fz, 'frozen frame 1')), 'v1.in');
  const lim = E.planToJobs(plan0([play(0, 2000, { asset: 'v1', movieStart: 99000 })]), mainInfo, { height: 360, assets }); const ss = job(lim, 'picture 1').args; assert(+ss[ss.indexOf('-ss') + 1] <= 4.9, 'seeks inside the added video, not the original: ' + ss.join(' '));
});
ok('ffmpeg engine: the sound of an added video comes from its own file, and a video with no sound makes none', () => {
  const r = E.planToJobs(plan0([play(0, 2000), play(2000, 4000, { asset: 'v1' })], [aud(0, 2000), aud(2000, 4000, 'v1')]), mainInfo, { height: 360, assets });
  const s = r.jobs.filter(j => /^sound movie/.test(j.label)); assert.deepStrictEqual(s.map(inputOf), ['movie.in', 'v1.in']); assert(s[1].args.join(' ').includes('pan=stereo|c0=c0|c1=c0'), 'a mono sound is made stereo using its own details');
  const q = E.planToJobs(plan0([play(0, 2000), play(2000, 4000, { asset: 'v2' })], [aud(0, 2000), aud(2000, 4000, 'v2')]), mainInfo, { height: 360, assets });
  assert.deepStrictEqual(q.jobs.filter(j => /^sound movie/.test(j.label)).map(inputOf), ['movie.in'], 'no sound track in that file: no sound job, and no crash');
  const nm = E.planToJobs(plan0([play(0, 2000), play(2000, 4000, { asset: 'v1' })], [aud(0, 2000), aud(2000, 4000, 'v1')]), Object.assign({}, mainInfo, { hasAudio: false }), { height: 360, assets });
  assert.deepStrictEqual(nm.jobs.filter(j => /^sound movie/.test(j.label)).map(inputOf), ['v1.in'], 'the original has no sound but the added video does');
});
ok('ffmpeg engine: a plan without added videos builds exactly what it built before', () => {
  const r = E.planToJobs(plan0([play(0, 2000), play(2000, 4000, { movieStart: 4000 })], [aud(0, 4000)]), mainInfo, { height: 360 });
  assert.deepStrictEqual([1, 2].map(i => inputOf(job(r, 'picture ' + i))), ['movie.in', 'movie.in']); assert(!r.jobs.some(j => j.args.join(' ').includes('v1.in')));
});

// ---- real ffmpeg, only when this computer has a recent one ----
function ffmpegOk() { const r = cp.spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }); const m = r.status === 0 && /version\s+n?(\d+)/.exec(r.stdout); return !!m && +m[1] >= 5; }
if (ffmpegOk()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-av-')), sh = (a) => { const r = cp.spawnSync('ffmpeg', ['-y', '-v', 'error'].concat(a), { cwd: dir, encoding: 'utf8' }); assert.strictEqual(r.status, 0, r.stderr); return r; };
  try {
    sh(['-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=30:d=6', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=6', '-shortest', '-pix_fmt', 'yuv420p', '-c:a', 'aac', 'm.mp4']); fs.renameSync(path.join(dir, 'm.mp4'), path.join(dir, 'movie.in'));
    sh(['-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=30:d=5', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=5', '-shortest', '-pix_fmt', 'yuv420p', '-c:a', 'aac', 'v.mp4']); fs.renameSync(path.join(dir, 'v.mp4'), path.join(dir, 'v1.in'));
    sh(['-f', 'lavfi', '-i', 'color=c=0x00aa00:s=320x240:r=30:d=5', '-pix_fmt', 'yuv420p', 'n.mp4']); fs.renameSync(path.join(dir, 'n.mp4'), path.join(dir, 'v2.in'));
    const probe = (f) => E.parseProbeInfo(cp.spawnSync('ffmpeg', ['-i', path.join(dir, f)], { encoding: 'utf8' }).stderr), info0 = probe('movie.in'), rassets = { v1: probe('v1.in'), v2: probe('v2.in') };
    let seq = 0;
    const render = (plan) => {
      const name = 'out' + (++seq) + '.mp4', built = E.planToJobs(plan, info0, { height: 360, assets: rassets });
      built.jobs.forEach(j => { if (j.files) Object.keys(j.files).forEach(f => fs.writeFileSync(path.join(dir, f), Buffer.from(j.files[f]))); sh(j.args); });
      fs.writeFileSync(path.join(dir, 'video.txt'), built.videoList.map(f => "file '" + f + "'\n").join(''));
      Object.keys(built.lanes).forEach(src => fs.writeFileSync(path.join(dir, 'lane_' + src + '.txt'), built.lanes[src].map(f => "file '" + f + "'\n").join('')));
      sh(E.finalMixArgs(Object.keys(built.lanes), plan.durationMs)); fs.renameSync(path.join(dir, 'out.mp4'), path.join(dir, name)); return name;
    };
    const px = (f, t, fx, fy) => { const r = cp.spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', path.join(dir, f), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: null }); const i = (Math.round(fy * 360) * 640 + Math.round(fx * 640)) * 3; return [r.stdout[i], r.stdout[i + 1], r.stdout[i + 2]]; };
    const level = (f, t0, t1) => { const r = cp.spawnSync('ffmpeg', ['-v', 'info', '-ss', String(t0), '-t', String(t1 - t0), '-i', path.join(dir, f), '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }); const m = /mean_volume: (-?[\d.]+|-inf) dB/.exec(r.stderr); return m ? +m[1] : -99; };
    const frames = (f) => +cp.spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path.join(dir, f)], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
    ok('real ffmpeg: the added video shows after the original, fitted inside the frame, with its own sound', () => {
      const f = render(plan0([play(0, 2000), play(2000, 4000, { asset: 'v1' }), play(4000, 5000, { movieStart: 3000 })], [aud(0, 2000), aud(2000, 4000, 'v1'), aud(4000, 5000)]));
      assert.strictEqual(frames(f), 150); const a = px(f, 1, 0.5, 0.5), b = px(f, 3, 0.5, 0.5), bar = px(f, 3, 0.05, 0.5), c = px(f, 4.5, 0.5, 0.5);
      assert(a[0] > 200 && a[2] < 60, 'the original: ' + a); assert(b[2] > 200 && b[0] < 60, 'the added video: ' + b); assert(bar[2] < 80 && bar[0] < 80, 'bars at the sides of the 4:3 picture: ' + bar); assert(c[0] > 200, 'the original again: ' + c);
      assert(level(f, 0.2, 1.8) > -40 && level(f, 2.2, 3.8) > -40, 'both can be heard');
    });
    ok('real ffmpeg: a video with no sound is silent there, and the original sound carries on elsewhere', () => {
      const f = render(plan0([play(0, 2000), play(2000, 4000, { asset: 'v2' })], [aud(0, 2000), aud(2000, 4000, 'v2')]));
      assert.strictEqual(frames(f), 120); const g = px(f, 3, 0.5, 0.5); assert(g[1] > 120 && g[0] < 60, 'the added picture: ' + g); assert(level(f, 0.2, 1.8) > -40 && level(f, 2.2, 3.8) < -60, 'silent where the added video has no sound');
    });
    ok('real ffmpeg: a held picture, a speed change and a transition work on an added video', () => {
      const f = render(plan0([play(0, 2000), { type: 'freeze', sessionStart: 2000, sessionEnd: 3000, movieAt: 1000, asset: 'v1', transitionIn: { type: 'fade', durMs: 600 } }, play(3000, 4000, { asset: 'v1', speed: 2 })], [aud(0, 2000)]));
      assert.strictEqual(frames(f), 120); const a = px(f, 2.5, 0.5, 0.5), b = px(f, 3.5, 0.5, 0.5), mid = px(f, 2.0, 0.5, 0.5);
      assert(a[2] > 200 && b[2] > 200, 'blue in both: ' + a + ' ' + b); assert(mid[0] > 60 && mid[2] > 60, 'a mix in the middle of the fade: ' + mid);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
} else console.log('  --  real-file checks skipped (need ffmpeg 5 or newer on this computer)');
console.log('\n' + n + ' checks passed');
