'use strict';
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), path = require('path');
const V = require('../www/voice.js');
const { pathToFileURL } = require('url');
const dir = path.join(__dirname, 'voice-tmp'); fs.mkdirSync(dir, { recursive: true });
// The real-file checks need ffmpeg, ffprobe and python3+numpy on this computer; without them they are skipped.
const has = (cmd, args) => { try { return cp.spawnSync(cmd, args, { encoding: 'utf8' }).status === 0; } catch (e) { return false; } };
const CAN_RUN_FILES = has('ffmpeg', ['-version']) && has('ffprobe', ['-version']) && has('python3', ['-c', 'import numpy']);
let M = null;
const sh = (cmd, args) => { const r = cp.spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' }); if (r.status !== 0) throw new Error(cmd + ' failed: ' + r.stderr.slice(-400)); return r.stdout; };
// every second of this file is a different pitch: second k plays (base + 100k) Hz
function tones(name, base, secs, extra) {
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'aevalsrc=0.5*sin(2*PI*(' + base + '+100*floor(t))*t):s=48000:d=' + secs, '-ac', '1', '-c:a', 'libopus', '-b:a', '32k'].concat(extra || [], [name]));
  return new Blob([fs.readFileSync(path.join(dir, name))], { type: 'audio/webm' });
}
// dominant pitch of a 0.4 s slice centred at t seconds of a file
function pitchAt(file, t) {
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, t - 0.2)), '-t', '0.4', '-i', file, '-ac', '1', '-ar', '48000', 'slice.wav']);
  const py = "import numpy as np,sys,wave\nw=wave.open('slice.wav');x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(float)\nx*=np.hanning(len(x));s=np.abs(np.fft.rfft(x,n=1<<16));print(int(np.argmax(s)*48000/(1<<16)))";
  return parseInt(sh('python3', ['-c', py]));
}
const dur = f => parseFloat(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));
const near = (got, want, tol, what) => assert(Math.abs(got - want) <= tol, what + ': got ' + got + ', wanted ~' + want);
const save = (r, name) => { fs.writeFileSync(path.join(dir, name), Buffer.from(r.blob ? new Uint8Array(r.blob.__bytes || []) : [])); };
async function toFile(res, name) { fs.writeFileSync(path.join(dir, name), Buffer.from(await res.blob.arrayBuffer())); return name; }

(async () => {
  M = await import(pathToFileURL(path.join(__dirname, '..', 'www', 'vendor', 'mediabunny', 'mediabunny.min.mjs')).href);
  let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

  // ---------- pure bookkeeping ----------
  await ok('cut inside the live recording keeps the start and opens a new stretch', () => {
    let p = [{ blob: 'live', ranges: [[0, null]] }];
    p = V.cutAt(p, 8, 12, 12.5);
    assert.deepStrictEqual(p[0].ranges, [[0, 8], [12.5, null]]);
    near(V.outLengthSec(p, 20), 8 + 7.5, 1e-9, 'length');
  });
  await ok('a second cut that lands inside the second stretch trims only that stretch', () => {
    let p = [{ blob: 'live', ranges: [[0, 8], [12.5, null]] }];
    p = V.cutAt(p, 10, 20, 21);
    assert.deepStrictEqual(p[0].ranges, [[0, 8], [12.5, 14.5], [21, null]]);
  });
  await ok('going back past an earlier cut drops the later stretches', () => {
    let p = [{ blob: 'live', ranges: [[0, 8], [12.5, 14.5], [21, null]] }];
    p = V.cutAt(p, 5, 30, 31);
    assert.deepStrictEqual(p[0].ranges, [[0, 5], [31, null]]);
  });
  await ok('with an earlier voice file, cutting before the live part trims the earlier file', () => {
    let p = [{ blob: 'base', ranges: [[0, 10]] }, { blob: 'live', ranges: [[0, null]] }];
    p = V.cutAt(p, 7, 4, 4.3);
    assert.deepStrictEqual(p[0].ranges, [[0, 7]]);
    assert.deepStrictEqual(p[1].ranges, [[4.3, null]]);
  });
  await ok('cutting to the very start keeps nothing before the new stretch', () => {
    let p = V.cutAt([{ blob: 'live', ranges: [[0, null]] }], 0, 5, 5.2);
    assert.deepStrictEqual(p[0].ranges, [[5.2, null]]);
  });

  await ok('a cut earlier than the voice start re-anchors the voice to the cut', () => {
    assert.deepStrictEqual(V.cutPoint(30, 50), { outSec: 0, voiceOffsetMs: 30 });
    near(V.cutPoint(7000, 50).outSec, 6.95, 1e-9, 'outSec');
  });

  // A realistic session: recording starts (voice file starts 50 ms in), then two Take Backs.
  // Session time s sits at real time t0+s; every cut moves t0 so that "now" becomes the cut point.
  function simulate() {
    const off = 50, segStart = 50; let t0 = 0, pieces = [{ blob: 'live', ranges: [[0, null]] }], voiceOffsetMs = off;
    const cut = (nowAbs, seconds) => {
      const cutT = Math.max(0, (nowAbs - t0) - seconds * 1000), cp = V.cutPoint(cutT, voiceOffsetMs), liveNow = (nowAbs - segStart) / 1000;
      voiceOffsetMs = cp.voiceOffsetMs; pieces = V.cutAt(pieces, cp.outSec, liveNow, liveNow); t0 = nowAbs - cutT; return cutT;
    };
    const c1 = cut(12000, 5), c2 = cut(15000, 2);
    return { pieces, c1, c2, endSession: 17000 - t0, voiceOffsetMs };
  }
  await ok('two take-backs: the kept voice ends exactly where the session timeline ends', () => {
    const r = simulate();
    assert.strictEqual(r.c1, 7000); assert.strictEqual(r.c2, 8000);
    assert.deepStrictEqual(r.pieces[0].ranges.map(x => x.map(v => v == null ? null : Math.round(v * 1000) / 1000)), [[0, 6.95], [11.95, 12.95], [14.95, null]]);
    const voiceEndSession = r.voiceOffsetMs / 1000 + V.outLengthSec(r.pieces, (17000 - 50) / 1000);
    near(voiceEndSession * 1000, r.endSession, 1, 'voice end vs session end (ms)');
  });

  // ---------- real files ----------
  if (!CAN_RUN_FILES) { console.log('  --  real-file checks skipped (need ffmpeg, ffprobe and python3 with numpy)'); console.log('\n' + n + ' checks passed'); return; }
  for (const variant of [['plain webm', []], ['live-style webm (unknown sizes, like a browser recorder)', ['-live', '1']]]) {
    const A = tones('a.webm', 300, 10, variant[1]);
    await ok('[' + variant[0] + '] keeping 0-3s and 6-10s gives 7s with the right pitches in the right order', async () => {
      const res = await V.assemble(M, [{ blob: A, ranges: [[0, 3], [6, 10]] }]);
      assert(res && res.mime === 'audio/webm');
      const f = await toFile(res, 'o1.webm');
      near(dur(path.join(dir, f)), 7, 0.1, 'duration'); near(res.durationSec, 7, 0.1, 'reported duration');
      [[0.5, 300], [1.5, 400], [2.5, 500], [3.5, 900], [4.5, 1000], [5.5, 1100], [6.5, 1200]].forEach(([t, hz]) => near(pitchAt(path.join(dir, f), t), hz, 30, 'pitch at ' + t + 's'));
    });
    await ok('[' + variant[0] + '] an open-ended last stretch runs to the end of the file', async () => {
      const res = await V.assemble(M, [{ blob: A, ranges: [[0, 2], [7, null]] }]);
      const f = await toFile(res, 'o2.webm');
      near(dur(path.join(dir, f)), 5, 0.1, 'duration');
      near(pitchAt(path.join(dir, f), 2.5), 1000, 30, 'pitch just after the join'); near(pitchAt(path.join(dir, f), 4.5), 1200, 30, 'pitch near the end');
    });
  }
  const A = tones('a2.webm', 300, 10), B = tones('b.webm', 2000, 4);
  await ok('an earlier voice file trimmed to 4s, then a new recording carried on straight after it', async () => {
    const res = await V.assemble(M, [{ blob: A, ranges: [[0, 4]] }, { blob: B, ranges: [[0, null]] }]);
    const f = await toFile(res, 'o3.webm');
    near(dur(path.join(dir, f)), 8, 0.1, 'duration');
    near(pitchAt(path.join(dir, f), 3.5), 600, 30, 'end of the old part'); near(pitchAt(path.join(dir, f), 4.5), 2000, 40, 'start of the new part'); near(pitchAt(path.join(dir, f), 7.5), 2300, 40, 'end of the new part');
  });
  await ok('the joined file has no gaps: timestamps run continuously', async () => {
    const res = await V.assemble(M, [{ blob: A, ranges: [[0, 4], [5, 6]] }, { blob: B, ranges: [[1, null]] }]);
    const inp = new M.Input({ source: new M.BlobSource(res.blob), formats: M.ALL_FORMATS });
    const tr = await inp.getPrimaryAudioTrack(), sink = new M.EncodedPacketSink(tr);
    let prevTs = null, bad = 0, count = 0, minD = 9, maxD = 0;
    for await (const p of sink.packets()) { if (prevTs !== null) { const d = p.timestamp - prevTs; minD = Math.min(minD, d); maxD = Math.max(maxD, d); if (Math.abs(d - 0.02) > 0.0015) bad++; } prevTs = p.timestamp; count++; }
    assert(count > 300 && bad === 0, bad + ' packets are not exactly 20 ms after the previous (min ' + minD + ', max ' + maxD + ') over ' + count);
  });
  await ok('after two take-backs, what you hear at each moment is what was said at that moment', async () => {
    const L = tones('live.webm', 300, 17, ['-live', '1']), r = simulate();
    r.pieces[0].blob = L;
    const res = await V.assemble(M, r.pieces), f = await toFile(res, 'o5.webm');
    // out time -> which second of the live recording it came from: 0-6.95 -> same, then 11.95.., then 14.95..
    [[6.5, 900], [7.45, 1500], [8.5, 1800], [9.5, 1900]].forEach(([t, hz]) => near(pitchAt(path.join(dir, f), t), hz, 40, 'pitch at out ' + t + 's'));
  });
  await ok('keeping nothing gives null instead of a broken file', async () => {
    assert.strictEqual(await V.assemble(M, [{ blob: A, ranges: [] }]), null);
  });
  await ok('the recorder\'s own file keeps playing in the browser as before (no decode errors in ffmpeg)', async () => {
    const res = await V.assemble(M, [{ blob: A, ranges: [[0, 4], [6, 9]] }]);
    const f = await toFile(res, 'o4.webm');
    sh('ffmpeg', ['-v', 'error', '-i', f, '-f', 'null', '-']);
  });
  console.log('\n' + n + ' checks passed');
})().catch(e => { console.error(e); process.exit(1); });