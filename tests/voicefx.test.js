'use strict';
// node tests/voicefx.test.js
// Voice enhance: the presets, the filter numbers for both engines, the gate, the project setting, the export plan, and what the ffmpeg engine builds.
const assert = require('assert');
const F = require('../www/fx.js'), P = require('../www/project.js'), NP = require('../www/plan.js'), E = require('../www/export-engine.js');
const V = F.voice;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

ok('presets: four, each tidied with a strength; off or nonsense gives nothing', () => {
  assert.deepStrictEqual(V.PRESETS.map(x => x.key), ['clean', 'podcast', 'warm', 'bright']);
  assert.strictEqual(V.clean(null), null); assert.strictEqual(V.clean({ preset: 'robot' }), null); assert.strictEqual(V.clean({ preset: 'clean', amount: 0 }), null);
  assert.deepStrictEqual(V.clean({ preset: 'warm' }), { preset: 'warm', amount: 0.6 }); assert.strictEqual(V.clean({ preset: 'warm', amount: 9 }).amount, 1);
});
ok('numbers: a stronger setting does more, the gate follows the noise floor, and everything stays inside what ffmpeg and Web Audio accept', () => {
  V.PRESETS.forEach(pr => [0.05, 0.5, 1].forEach(a => [-70, -50, -30].forEach(fl => {
    const p = V.params({ preset: pr.key, amount: a }, fl), f = V.ffmpegChain({ preset: pr.key, amount: a }, fl);
    assert(p.gate.thrDb >= -51 && p.gate.thrDb <= -26 && p.gate.depthDb > 0 && p.comp.ratio >= 1 && p.comp.ratio <= 20 && p.comp.make >= 0, pr.key);
    assert(f[0].startsWith('agate=') && f[f.length - 1].startsWith('acompressor='), f.join(' | '));
    f.forEach(s => assert(!/NaN|undefined|Infinity/.test(s), s));
    const thr = +/agate=threshold=([\d.]+)/.exec(f[0])[1], rng = +/range=([\d.]+)/.exec(f[0])[1], mk = +/makeup=([\d.]+)/.exec(f[f.length - 1])[1];
    assert(thr >= 0.001 && thr <= 1 && rng >= 0.001 && rng <= 1 && mk >= 1 && mk <= 64, f.join(' | '));
  })));
  const lo = V.params({ preset: 'podcast', amount: 0.3 }), hi = V.params({ preset: 'podcast', amount: 1 });
  assert(hi.bands[2].g > lo.bands[2].g && hi.comp.ratio > lo.comp.ratio && hi.gate.depthDb > lo.gate.depthDb);
  assert(V.params({ preset: 'clean' }, -58).gate.thrDb < V.params({ preset: 'clean' }, -40).gate.thrDb, 'a noisier recording gates higher');
  assert.deepStrictEqual(V.ffmpegChain(null), []);
});
ok('Web Audio nodes: the numbers go in, and off puts everything back to neutral', () => {
  const param = () => ({ value: 0 }), node = () => ({ connect() {}, frequency: param(), gain: param(), Q: param(), type: '' });
  const ctx = { createBiquadFilter: node, createGain: () => ({ connect() {}, gain: param() }), createDynamicsCompressor: () => ({ connect() {}, threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }) };
  const fx = V.makeNodes(ctx); V.setNodes(fx, { preset: 'podcast', amount: 1 }, -50);
  assert.deepStrictEqual([fx.bands[0].type, fx.bands[0].frequency.value, fx.bands[0].gain.value], ['lowshelf', 120, 2.5]); assert.strictEqual(fx.comp.ratio.value, 3.5); assert(fx.make.gain.value > 1.5);
  V.setNodes(fx, null); assert.deepStrictEqual(fx.bands.map(b => b.gain.value), [0, 0, 0]); assert.strictEqual(fx.comp.ratio.value, 1); assert.strictEqual(fx.make.gain.value, 1);
});
ok('gate: the hiss between words goes down by about the depth, the speech is left alone, and quiet-only strength does nothing', () => {
  const sr = 8000, len = 16000, d = new Float32Array(len); for (let i = 0; i < len; i++) d[i] = i < 8000 ? 0.001 * Math.sin(i) : 0.3 * Math.sin(i * 0.2);
  const buf = { sampleRate: sr, length: len, numberOfChannels: 1, getChannelData: () => d };
  const mk = (c, l, s) => { const a = new Float32Array(l); return { sampleRate: s, length: l, numberOfChannels: c, getChannelData: () => a }; };
  const rms = (a, s, e) => { let t = 0; for (let i = s; i < e; i++) t += a[i] * a[i]; return Math.sqrt(t / (e - s)); };
  const o = V.gateBuffer(buf, mk, { preset: 'clean', amount: 1 }, -58).getChannelData(0);
  assert(rms(o, 2000, 8000) < rms(d, 2000, 8000) * 0.3, 'hiss down'); assert(Math.abs(rms(o, 9000, 16000) - rms(d, 9000, 16000)) < 0.002, 'speech the same');
  assert.strictEqual(V.gateBuffer(buf, mk, null, -58), buf);
});

function make() {
  const levels = []; for (let i = 0; i < 240; i++) levels.push(i % 10 < 3 ? 40 : 200);
  return { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels, assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] },
      { id: 't-voice', kind: 'audio', role: 'voice', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vo', type: 'audio', asset: 'voice', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
}
const voiceOf = (p) => p.tracks.filter(t => t.role === 'voice')[0];
ok('project: the setting lives on the voice row, only what is mentioned changes, off removes it, and splitting keeps it', () => {
  const p0 = make(); let p = P.setVoiceEnhance(p0, { preset: 'podcast' });
  assert.deepStrictEqual(voiceOf(p).enhance, { preset: 'podcast', amount: 0.6 }); assert.strictEqual(P.setVoiceEnhance(p, { preset: 'podcast' }), p, 'same again: nothing changes');
  p = P.setVoiceEnhance(p, { amount: 1 }); assert.deepStrictEqual(voiceOf(p).enhance, { preset: 'podcast', amount: 1 });
  p = P.setVoiceEnhance(p, { preset: 'warm' }); assert.deepStrictEqual(voiceOf(p).enhance, { preset: 'warm', amount: 1 }, 'a new preset keeps the strength');
  assert.strictEqual(P.setVoiceEnhance(p0, { preset: 'robot' }), p0); assert.strictEqual(P.setVoiceEnhance(p0, { preset: 'none' }), p0);
  assert.strictEqual(voiceOf(P.setVoiceEnhance(p, { preset: 'none' })).enhance, undefined);
  assert.strictEqual(voiceOf(P.splitAt(p, 5000)).enhance.preset, 'warm'); assert.strictEqual(voiceOf(P.rippleDelete(p, 1000, 2000)).enhance.preset, 'warm');
  const noVoice = make(); noVoice.tracks.pop(); assert.strictEqual(P.setVoiceEnhance(noVoice, { preset: 'clean' }), noVoice);
});
ok('project: the noise floor comes from the quiet end of the microphone history, kept between -60 and -35', () => {
  const f = P.voiceFloorDb(make()); assert(f >= -60 && f <= -35, String(f)); assert.strictEqual(P.voiceFloorDb({ levels: [] }), -50);
  assert.strictEqual(P.voiceFloorDb({ levels: [255, 255, 255, 255] }), -35); assert.strictEqual(P.voiceFloorDb({ levels: [0, 0, 0, 0] }), -60);
});
ok('plan: the voice sound carries the setting and the floor, and nothing else does', () => {
  const p = P.setVoiceEnhance(make(), { preset: 'podcast', amount: 0.8 }), a = NP.projectToPlan(p).audio.filter(x => x.src === 'voice');
  assert.strictEqual(a.length, 1); assert.deepStrictEqual([a[0].enhance.preset, a[0].enhance.amount], ['podcast', 0.8]); assert.strictEqual(typeof a[0].enhance.floorDb, 'number');
  assert(!('enhance' in NP.projectToPlan(make()).audio[0]));
});
const info0 = { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 6 };
const planA = (enh) => ({ naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 6000 }, video: [{ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0 }],
  audio: [Object.assign({ src: 'voice', startMs: 0, durMs: 4000, inMs: 0, points: [[0, 1]] }, enh ? { enhance: enh } : {})] });
const filt = (r) => { const j = r.jobs.find(x => /^sound voice/.test(x.label)); return j.args[j.args.indexOf('-filter_complex') + 1]; };
ok('ffmpeg engine: the gate, tone and compressor come after the usual voice clean-up and before the speed and the volume curve; without the setting nothing changes', () => {
  const g = filt(E.planToJobs(planA({ preset: 'podcast', amount: 1, floorDb: -50 }), info0, { height: 360 }));
  const i0 = g.indexOf('pan=stereo'), i1 = g.indexOf('agate='), i2 = g.indexOf('equalizer='), i3 = g.indexOf('acompressor='), i4 = g.indexOf('aformat=sample_fmts=fltp');
  assert(i0 > 0 && i0 < i1 && i1 < i2 && i2 < i3 && i3 < i4, g);
  const plain = filt(E.planToJobs(planA(null), info0, { height: 360 })); assert(!/agate|equalizer|acompressor/.test(plain), plain);
});
console.log('\n' + n + ' checks passed');
