'use strict';
// node tests/sound.test.js
// Sound effects (made by code, or your own files) and auto captions (speech stretches, speech recognition, placing the words on the edited timeline).
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const S = require('../www/sfx.js'), CA = require('../www/captions.js'), P = require('../www/project.js'), NP = require('../www/plan.js'), E = require('../www/export-engine.js'), C = require('../www/core.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const okAsync = []; const later = (name, fn) => okAsync.push([name, fn]);

// ---------- sound effects made by code ----------
ok('effects: ten of them, each the right length, loud but not clipping, starting and ending in silence, and always the same', () => {
  assert.strictEqual(S.LIST.length, 10);
  S.LIST.forEach(x => {
    const a = S.render(x.key, 48000), b = S.render(x.key, 48000); assert.strictEqual(a.length, Math.round(x.durMs * 48) , x.key + ' length');
    let pk = 0; a.forEach(v => { pk = Math.max(pk, Math.abs(v)); }); assert(Math.abs(pk - 0.85) < 0.001, x.key + ' peak ' + pk);
    assert(Math.abs(a[0]) < 0.01 && Math.abs(a[a.length - 1]) < 0.01, x.key + ' ends'); assert.deepStrictEqual(Array.from(a.slice(0, 500)), Array.from(b.slice(0, 500)), x.key + ' repeatable');
    let e = 0; a.forEach(v => { e += v * v; }); assert(Math.sqrt(e / a.length) > 0.02, x.key + ' is not silent');
  });
  assert.strictEqual(S.render('nonsense'), null); assert.strictEqual(S.render('pop', 24000).length, Math.round(220 * 24), 'any sample rate');
});
ok('effects: the WAV file has the right header and the same samples', () => {
  const s = S.render('click', 48000), w = S.toWav(s, 48000), v = new DataView(w.buffer);
  assert.strictEqual(String.fromCharCode(w[0], w[1], w[2], w[3]) + String.fromCharCode(w[8], w[9], w[10], w[11]), 'RIFFWAVE');
  assert.strictEqual(w.length, 44 + s.length * 2); assert.strictEqual(v.getUint32(24, true), 48000); assert.strictEqual(v.getUint16(22, true), 1); assert.strictEqual(v.getUint16(34, true), 16); assert.strictEqual(v.getUint32(40, true), s.length * 2);
  let peak = 0; for (let i = 0; i < s.length; i++) peak = Math.max(peak, Math.abs(v.getInt16(44 + i * 2, true))); assert(Math.abs(peak / 32767 - 0.85) < 0.002, 'peak ' + peak);
});

// ---------- the test project: a picture, a voice recording of 12 s ----------
function make() {
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' }] },
      { id: 't-voice', kind: 'audio', role: 'voice', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vo', type: 'audio', asset: 'voice', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
}
const base = make();
const clipsOf = (p, role) => p.tracks.filter(t => t.role === role).reduce((a, t) => a.concat(t.clips), []);

ok('sound effect: an audio clip at the playhead; overlapping ones get their own row; an empty row goes away; row ids stay unique', () => {
  const o1 = {}, o2 = {}, o3 = {};
  let p = P.addSfx(base, 1000, { name: 'Whoosh', durMs: 700 }, o1); assert.deepStrictEqual(P.validate(p), []);
  const c = P.findClip(p, o1.id).clip, tr = P.findClip(p, o1.id).track;
  assert.deepStrictEqual([c.type, c.start, c.dur, c.in, c.asset, c.volume, tr.kind, tr.role], ['audio', 1000, 700, 0, 'fx1', 1, 'audio', 'sfx']); assert.deepStrictEqual(p.assets.fx1, { type: 'audio', name: 'Whoosh', durMs: 700 });
  p = P.addSfx(p, 1300, { name: 'Ding', durMs: 1500 }, o2); assert.strictEqual(p.tracks.filter(t => t.role === 'sfx').length, 2, 'overlapping in time: a second row');
  p = P.addSfx(p, 5000, { name: 'Pop', durMs: 200 }, o3); assert.strictEqual(p.tracks.filter(t => t.role === 'sfx').length, 2, 'fits on the first row'); assert.strictEqual(p.assets.fx3.name, 'Pop');
  const del = P.deleteClip(P.deleteClip(p, o3.id), o1.id); assert.strictEqual(del.tracks.filter(t => t.role === 'sfx').length, 1, 'the empty row is gone');
  const ids = P.addSfx(del, 100, { name: 'x', durMs: 300 }, {}).tracks.map(t => t.id); assert.strictEqual(new Set(ids).size, ids.length, 'unique: ' + ids);
  assert.strictEqual(P.addSfx(base, 11950, { name: 'x', durMs: 700 }, {}).tracks.find(t => t.role === 'sfx').clips[0].dur, 100, 'cut to what is left');
  assert.strictEqual(P.sourceAt(p, 1500).audio.filter(a => a.role === 'sfx').length, 2, 'both sound at once');
  const set = P.setClipProps(p, o1.id, { volume: 0.4, fadeOut: 300 }); assert.strictEqual(P.findClip(set, o1.id).clip.volume, 0.4, 'volume and fades work like any sound clip');
  const sp = P.splitAt(p, 1300); assert.strictEqual(P.findClip(sp, o1.id) !== null && sp.tracks.find(t => t.role === 'sfx').clips.length >= 2, true);
});
ok('plan: each effects row is its own sound lane, and each clip names its file', () => {
  const o1 = {}, o2 = {}; let p = P.addSfx(base, 1000, { name: 'Whoosh', durMs: 700 }, o1); p = P.addSfx(p, 1300, { name: 'Ding', durMs: 1500 }, o2);
  const a = NP.projectToPlan(p).audio.filter(x => x.file);
  assert.deepStrictEqual(a.map(x => [x.src, x.file, x.startMs, x.durMs, x.inMs]), [['sfx1', 'fx1.in', 1000, 700, 0], ['sfx2', 'fx2.in', 1300, 1500, 0]]);
  const m = P.setTrackProps(p, 't-fx1', { muted: true }); assert.deepStrictEqual(NP.projectToPlan(m).audio.filter(x => x.file).map(x => x.file), ['fx2.in'], 'a muted row is left out');
  assert.strictEqual(NP.projectToPlan(base).audio.some(x => x.file), false);
});

// ---------- auto captions ----------
ok('captions: the stretches where you talked, found from the microphone history on the edited timeline', () => {
  const lv = []; for (let i = 0; i < 200; i++) { const t = i * 50, talking = (t >= 500 && t < 3000) || (t >= 4000 && t < 4200) || (t >= 6000 && t < 9500); lv.push(C.dbToByte(talking ? -20 : -70)); }
  const p = Object.assign(make(), { levels: lv, durationMs: 10000 });
  assert.deepStrictEqual(P.speechRanges(p, { thresholdDb: -45 }).map(r => [r.start, r.end]), [[500, 3000], [6000, 9500]], 'the 0.2 s blip is too short; the first silence is not speech');
  assert.deepStrictEqual(P.speechRanges(p, { thresholdDb: -45, minSpeechMs: 150 }).map(r => r.start), [500, 4000, 6000]);
  assert.deepStrictEqual(P.speechRanges(Object.assign(make(), { levels: [] }), {}), []);
  assert.deepStrictEqual(CA.chunkRanges([{ start: 0, end: 14000 }, { start: 15000, end: 16000 }], 6000), [{ start: 0, end: 4667 }, { start: 4667, end: 9333 }, { start: 9333, end: 14000 }, { start: 15000, end: 16000 }]);
  const cut = P.rippleDelete(p, 3000, 6000); assert.deepStrictEqual(P.speechRanges(cut, { thresholdDb: -45 }).map(r => [r.start, r.end]), [[500, 6500]], 'after the pause is cut out, the two stretches of talking join into one');
});
ok('captions: what the model returns is tidied (no end time, noises, tiny pieces) and long lines are broken at words', () => {
  const segs = CA.segmentsFromChunks([{ timestamp: [0, 2.5], text: ' Hello there.' }, { timestamp: [2.5, 3], text: ' [BLANK_AUDIO]' }, { timestamp: [3, null], text: '  Second   part ' }, { timestamp: [null, 1], text: 'x' }, { timestamp: [7.9, 7.95], text: 'tiny' }], 9000);
  assert.deepStrictEqual(segs, [{ startMs: 0, endMs: 2500, text: 'Hello there.' }, { startMs: 3000, endMs: 7900, text: 'Second part' }, { startMs: 7900, endMs: 8300, text: 'tiny' }]);
  const lines = CA.splitLines([{ startMs: 0, endMs: 6000, text: 'one two three four five six seven eight nine ten' }], 20);
  assert.deepStrictEqual(lines.map(l => l.text), ['one two three four', 'five six seven eight', 'nine ten']); assert.strictEqual(lines[0].startMs, 0); assert.strictEqual(lines[2].endMs, 6000);
  lines.forEach((l, i) => { assert(l.endMs > l.startMs); if (i) assert.strictEqual(l.startMs, lines[i - 1].endMs, 'no gap or overlap'); });
  assert.deepStrictEqual(CA.splitLines([{ startMs: 0, endMs: 1000, text: 'short' }], 40), [{ startMs: 0, endMs: 1000, text: 'short' }]);
});
ok('captions: words found in the voice file land on the edited timeline, and only where that part of the voice is still used', () => {
  const segs = [{ startMs: 1000, endMs: 3000, text: 'before the cut' }, { startMs: 4000, endMs: 5000, text: 'inside the cut' }, { startMs: 5500, endMs: 7500, text: 'across the end of the cut' }, { startMs: 9000, endMs: 11000, text: 'after' }];
  assert.deepStrictEqual(P.captionsFromVoice(base, segs).map(c => [c.startMs, c.endMs]), [[1000, 3000], [4000, 5000], [5500, 7500], [9000, 11000]], 'untouched: same times');
  const cut = P.rippleDelete(base, 3500, 6000), it = P.captionsFromVoice(cut, segs);
  assert.deepStrictEqual(it.map(c => [c.startMs, c.endMs, c.text]), [[1000, 3000, 'before the cut'], [3500, 5000, 'across the end of the cut'], [6500, 8500, 'after']], 'the cut part is gone, the rest moves earlier');
  const moved = JSON.parse(JSON.stringify(base)); moved.tracks[1].clips[0].start = 500; moved.tracks[1].clips[0].in = 0; assert.strictEqual(P.captionsFromVoice(moved, [{ startMs: 1000, endMs: 2000, text: 'x' }])[0].startMs, 1500, 'a voice moved later moves its captions');
  const trimmed = JSON.parse(JSON.stringify(base)); Object.assign(trimmed.tracks[1].clips[0], { in: 2000, dur: 4000 }); assert.deepStrictEqual(P.captionsFromVoice(trimmed, [{ startMs: 1000, endMs: 3000, text: 'x' }]).map(c => [c.startMs, c.endMs]), [[0, 1000]], 'only the part still used');
  const out = {}, withCaps = P.addCaptions(cut, it, { replace: true }, out); assert.strictEqual(out.added, 3); assert.deepStrictEqual(P.captionList(withCaps).map(c => c.text), ['before the cut', 'across the end of the cut', 'after']);
});
later('captions: recognize() reads the voice, loads the right model once, asks for timestamps, and passes the language only to models that take one', async () => {
  CA._reset(); const calls = [], created = [];
  const lib = { pipeline: async (task, id, o) => { created.push([task, id]); o.progress_callback({ status: 'progress', progress: 42.4, file: 'm.onnx' }); return async (samples, opts) => { calls.push([samples.length, opts]); return { text: 'hi', chunks: [{ timestamp: [0.5, 2], text: ' Hello' }, { timestamp: [2, null], text: ' world' }] }; }; } };
  const decode = async (b) => ({ samples: new Float32Array(1600), durMs: 4000 }), msgs = [];
  let segs = await CA.recognize({}, { language: 'english', lib, decode, onStatus: m => msgs.push(m) });
  assert.deepStrictEqual(created[0], ['automatic-speech-recognition', 'onnx-community/whisper-tiny.en']); assert.deepStrictEqual(calls[0], [1600, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 }], 'English-only model: no language, no task');
  assert.deepStrictEqual(segs, [{ startMs: 500, endMs: 2000, text: 'Hello' }, { startMs: 2000, endMs: 4000, text: 'world' }]);
  assert(msgs.some(m => /Downloading the speech model\.\.\. 42%/.test(m)) && /Reading/.test(msgs[0]) && /Listening/.test(msgs[msgs.length - 1]), msgs.join(' | '));
  segs = await CA.recognize({}, { language: 'english', lib, decode }); assert.strictEqual(created.length, 1, 'the model is loaded once');
  await CA.recognize({}, { language: 'swahili', lib, decode }); assert.strictEqual(created[1][1], 'onnx-community/whisper-base'); assert.deepStrictEqual(calls[2][1], { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, task: 'transcribe', language: 'swahili' });
  await CA.recognize({}, { language: 'auto', lib, decode }); assert.strictEqual('language' in calls[3][1], false, 'detect the language');
  CA._reset(); assert.deepStrictEqual(await CA.recognize({}, { lib: { pipeline: async () => async () => ({ chunks: [] }) }, decode, language: 'auto' }), [], 'nothing heard: no lines');
});

// ---------- the ffmpeg engine ----------
const info0 = { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 6 };
const plan0 = (audio) => ({ naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 6000 }, video: [{ type: 'black', sessionStart: 0, sessionEnd: 4000 }], audio: audio });
const sfx = (src, file, startMs, durMs, extra) => Object.assign({ src, file, startMs, durMs, inMs: 0, points: [[0, 1]] }, extra || {});
ok('ffmpeg engine: each effects lane is cut from its own file, and the lanes are mixed with the rest', () => {
  const r = E.planToJobs(plan0([sfx('sfx1', 'fx1.in', 500, 1000), sfx('sfx2', 'fx2.in', 800, 1500)]), info0, { height: 360 });
  assert.deepStrictEqual(Object.keys(r.lanes).sort(), ['sfx1', 'sfx2']);
  const a = r.jobs.find(j => /sound sfx1/.test(j.label)).args, b = r.jobs.find(j => /sound sfx2/.test(j.label)).args;
  assert(a.join(' ').includes('-i fx1.in') && b.join(' ').includes('-i fx2.in'), a.join(' '));
  const tails = r.jobs.filter(j => /^t_sfx/.test(j.produces)).map(j => j.produces).sort(); assert.deepStrictEqual(tails, ['t_sfx1.wav', 't_sfx2.wav'], 'every lane has its own tail file');
  const mix = E.finalMixArgs(Object.keys(r.lanes), 4000).join(' '); assert(mix.includes('lane_sfx1.txt') && mix.includes('lane_sfx2.txt') && mix.includes('amix=inputs=2'));
  const none = E.planToJobs(plan0([]), info0, { height: 360 }); assert.deepStrictEqual(Object.keys(none.lanes), []);
});
// ---- real ffmpeg, only when this computer has a recent one ----
function ffmpegOk() { const r = cp.spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }); const m = r.status === 0 && /version\s+n?(\d+)/.exec(r.stdout); return !!m && +m[1] >= 5; }
if (ffmpegOk()) {
  const renderAudio = (audio, files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-sfx-')), sh = (a) => cp.spawnSync('ffmpeg', ['-y', '-v', 'error'].concat(a), { cwd: dir, encoding: 'utf8' });
    Object.keys(files).forEach(f => fs.writeFileSync(path.join(dir, f), Buffer.from(S.toWav(S.render(files[f], 48000), 48000))));
    const built = E.planToJobs(plan0(audio), info0, { height: 360 });
    built.jobs.forEach(j => { if (j.files) Object.keys(j.files).forEach(f => fs.writeFileSync(path.join(dir, f), Buffer.from(j.files[f]))); const x = sh(j.args); assert.strictEqual(x.status, 0, j.label + ': ' + x.stderr); });
    fs.writeFileSync(path.join(dir, 'video.txt'), built.videoList.map(f => "file '" + f + "'\n").join(''));
    Object.keys(built.lanes).forEach(l => fs.writeFileSync(path.join(dir, 'lane_' + l + '.txt'), built.lanes[l].map(f => "file '" + f + "'\n").join('')));
    let r = sh(E.finalMixArgs(Object.keys(built.lanes), 4000)); assert.strictEqual(r.status, 0, r.stderr);
    const o = cp.spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(dir, 'out.mp4'), '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { encoding: null });
    const pcm = new Int16Array(o.stdout.buffer, o.stdout.byteOffset, Math.floor(o.stdout.length / 2));
    const rms = (a, b) => { let s = 0, c = 0; for (let i = Math.floor(a * 8000); i < Math.min(pcm.length, Math.floor(b * 8000)); i++) { s += pcm[i] * pcm[i]; c++; } return Math.sqrt(s / Math.max(1, c)) / 32768; };
    const dur = +cp.spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(dir, 'out.mp4')], { encoding: 'utf8' }).stdout.trim();
    return { rms, dur, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
  };
  ok('real ffmpeg: an effect sounds where it was put, and nowhere else; two at once are louder than one', () => {
    let r = renderAudio([sfx('sfx1', 'fx1.in', 1000, 1500)], { 'fx1.in': 'ding' });
    try { assert(Math.abs(r.dur - 4) < 0.1, 'length ' + r.dur); assert(r.rms(0, 0.9) < 0.002 && r.rms(2.7, 3.9) < 0.002, 'silent outside: ' + r.rms(0, 0.9) + ' ' + r.rms(2.7, 3.9)); assert(r.rms(1.0, 1.4) > 0.05, 'sounds inside: ' + r.rms(1.0, 1.4)); } finally { r.done(); }
    const one = renderAudio([sfx('sfx1', 'fx1.in', 1000, 1500)], { 'fx1.in': 'ding' }), two = renderAudio([sfx('sfx1', 'fx1.in', 1000, 1500), sfx('sfx2', 'fx2.in', 1000, 900)], { 'fx1.in': 'ding', 'fx2.in': 'drop' });
    try { assert(two.rms(1.0, 1.5) > one.rms(1.0, 1.5) * 1.1, 'together: ' + two.rms(1.0, 1.5) + ' vs ' + one.rms(1.0, 1.5)); assert(Math.abs(two.dur - 4) < 0.1); } finally { one.done(); two.done(); }
  });
  ok('real ffmpeg: volume and where in the file to start both work, and one effect can follow another on the same row', () => {
    const loud = renderAudio([sfx('sfx1', 'fx1.in', 500, 600)], { 'fx1.in': 'whoosh' }), quiet = renderAudio([sfx('sfx1', 'fx1.in', 500, 600, { points: [[0, 0.25]] })], { 'fx1.in': 'whoosh' });
    try { const a = loud.rms(0.6, 1.0), b = quiet.rms(0.6, 1.0); assert(b < a * 0.4 && b > a * 0.1, 'a quarter of the volume: ' + a + ' -> ' + b); } finally { loud.done(); quiet.done(); }
    const seq = renderAudio([sfx('sfx1', 'fx1.in', 300, 400), sfx('sfx1', 'fx1.in', 2000, 400, { inMs: 200 })], { 'fx1.in': 'ding' });
    try { assert(seq.rms(0.35, 0.65) > 0.05 && seq.rms(2.05, 2.35) > 0.02 && seq.rms(1.0, 1.8) < 0.002, 'two on one row: ' + seq.rms(0.35, 0.65) + ' ' + seq.rms(2.05, 2.35) + ' ' + seq.rms(1.0, 1.8)); } finally { seq.done(); }
  });
} else console.log('  --  real-file checks skipped (need ffmpeg 5 or newer on this computer)');
(async () => { for (const [name, fn] of okAsync) { await fn(); n++; console.log('  ok  ' + name); } console.log('\n' + n + ' checks passed'); })().catch(e => { console.error(e); process.exit(1); });
