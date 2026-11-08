'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const www = p => path.join(__dirname, '..', 'www', p);
const T = require('../www/tts.js'), P = require('../www/project.js');
let n = 0; const ok = (name, fn) => { const r = fn(); n++; console.log('  ok  ' + name); return r; };
const okAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };
const SR = 22050;
const sine = (f, sec, a = 0.5) => { const k = Math.round(SR * sec), x = new Float32Array(k); for (let i = 0; i < k; i++) x[i] = a * Math.sin(2 * Math.PI * f * i / SR); return x; };
const freq = x => { const a = Math.floor(x.length * 0.2), b = Math.floor(x.length * 0.8); let c = 0; for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) c++; return c / ((b - a) / SR); };

ok('text is cut into sentences with pauses; a number like 3.5 is not a sentence end; long pieces are cut at commas', () => {
  const sp = T.splitText('Hello there. It costs 3.5 dollars, ok? Yes!\n\nNew paragraph here');
  assert.deepStrictEqual(sp.map(s => s.text), ['Hello there.', 'It costs 3.5 dollars, ok?', 'Yes!', 'New paragraph here']); assert.deepStrictEqual(sp.map(s => s.pauseMs), [320, 320, 520, 0]);
  const long = T.splitText('word, '.repeat(80), 100); assert(long.length > 3 && long.every(s => s.text.length <= 100));
  assert.deepStrictEqual(T.splitText('   '), []); assert.strictEqual(T.splitText('no punctuation')[0].pauseMs, 0);
  assert(T.hasSpeech('Hi') && T.hasSpeech('mambo 5') && !T.hasSpeech('\u2026') && !T.hasSpeech(' . '));
});
ok('WAV files are written and read back (16-bit, 24-bit, float, stereo, streaming size); bad files are refused', () => {
  const d = T.decodeWav(T.encodeWav(sine(300, 0.5), SR)); assert.strictEqual(d.sampleRate, SR); assert.strictEqual(d.samples.length, Math.round(SR * 0.5)); assert(Math.abs(freq(d.samples) - 300) < 10);
  const mk = (ch, bits, tag, frames, size) => { const bps = bits / 8, buf = new ArrayBuffer(44 + frames * ch * bps), v = new DataView(buf), w = (o, s) => { for (let k = 0; k < s.length; k++) v.setUint8(o + k, s.charCodeAt(k)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + frames * ch * bps, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, tag, true); v.setUint16(22, ch, true); v.setUint32(24, 16000, true); v.setUint32(28, 16000 * ch * bps, true); v.setUint16(32, ch * bps, true); v.setUint16(34, bits, true); w(36, 'data'); v.setUint32(40, size != null ? size : frames * ch * bps, true);
    for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) { const val = c === 0 ? 0.5 : -0.5, o = 44 + (i * ch + c) * bps; if (tag === 3) v.setFloat32(o, val, true); else if (bits === 16) v.setInt16(o, val * 32767, true); else { const q = Math.round(val * 8388607) & 0xffffff; v.setUint8(o, q & 255); v.setUint8(o + 1, (q >> 8) & 255); v.setUint8(o + 2, (q >> 16) & 255); } } return buf; };
  [[2, 16, 1], [1, 32, 3], [2, 24, 1]].forEach(([ch, bits, tag]) => { const x = T.decodeWav(mk(ch, bits, tag, 100)); assert.strictEqual(x.samples.length, 100); assert(Math.abs(x.samples[10] - (ch === 2 ? 0 : 0.5)) < 0.01); });
  assert.strictEqual(T.decodeWav(mk(1, 16, 1, 100, 0xffffffff)).samples.length, 100); assert.throws(() => T.decodeWav(new ArrayBuffer(10)));
});
ok('quiet is trimmed from the ends, pieces are joined with the gaps asked for', () => {
  const padded = T.joinSamples([new Float32Array(SR), sine(200, 0.5), new Float32Array(SR)], SR, [0, 0]), tr = T.trimSilence(padded, SR); assert(tr.length / SR > 0.55 && tr.length / SR < 0.7);
  assert.strictEqual(T.trimSilence(new Float32Array(1000), SR).length, 0); assert.strictEqual(T.joinSamples([new Float32Array(10), new Float32Array(10)], 1000, [500]).length, 520);
});
ok('speed changes the length but not the pitch', () => {
  [0.6, 0.8, 1.25, 1.5, 2].forEach(rate => { const y = T.timeStretch(sine(200, 2), SR, rate); assert(Math.abs(y.length / SR - 2 / rate) < 0.06 * 2 / rate, 'length at ' + rate); assert(Math.abs(freq(y) - 200) < 8, 'pitch at ' + rate); });
  assert.strictEqual(T.timeStretch(sine(200, 1), SR, 1).length, SR);
});
ok('pitch changes the pitch but not the length; both together work; loudness is even and the ends are soft', () => {
  const raw = { samples: sine(200, 1.5), sampleRate: SR };
  let r = T.render(raw, { pitch: 12 }); assert(Math.abs(freq(r.samples) - 400) < 16 && Math.abs(r.durMs - 1500) < 90);
  r = T.render(raw, { pitch: -12 }); assert(Math.abs(freq(r.samples) - 100) < 6 && Math.abs(r.durMs - 1500) < 90);
  r = T.render(raw, { speed: 1.5, pitch: 5 }); assert(Math.abs(freq(r.samples) - 200 * Math.pow(2, 5 / 12)) < 12 && Math.abs(r.durMs - 1000) < 80);
  r = T.render({ samples: sine(200, 1.5, 0.1), sampleRate: SR }, {}); assert(Math.abs(Math.max(...r.samples) - 0.89) < 0.01 && r.samples[0] === 0);
  assert.strictEqual(r.blob.size, 44 + r.samples.length * 2);
});
const fake = (log) => ({ id: 'fake', name: 'Fake', offline: true, _r: true, ready() { return this._r; }, load() { return Promise.resolve(); }, voices() { return [{ id: 'v1', label: 'One', lang: 'en', langLabel: 'English' }]; },
  synth(text, voice) { log.push(text); return Promise.resolve({ samples: sine(200, 0.3 + 0.05 * text.length / 10), sampleRate: SR }); } });
(async () => {
  await okAsync('a long text is spoken a sentence at a time and joined; the same text is only made once; no engine or no text is a clear error', async () => {
    const log = [], e = T.register(fake(log)); assert.strictEqual(T.offlineEngine(), e);
    const r1 = await T.synthRaw('One sentence here. Another sentence there! Third one', 'fake:v1'); assert.strictEqual(log.length, 3); assert(r1.samples.length > SR * 0.8);
    await T.synthRaw('One sentence here. Another sentence there! Third one', 'fake:v1'); assert.strictEqual(log.length, 3, 'cached');
    const status = []; await T.synthRaw('Different words. Again.', 'fake:v1', m => status.push(m)); assert(status.some(s => /part 2 of 2/.test(s)));
    await assert.rejects(() => T.synthRaw('x', 'nope:v1'), /not loaded/); await assert.rejects(() => T.synthRaw('   ', 'fake:v1'), /no text/);
    e._r = false; assert.strictEqual(T.offlineEngine(), null); await assert.rejects(() => T.synthRaw('x', 'fake:v1'), /not loaded/);
  });
  // ---- project ----
  const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
  ok('speech is remembered on its asset, tidied, and read back; the same value gives the same project', () => {
    const o = {}; let p = P.addSfx(base, 2000, { name: 'Speech: hi', durMs: 3000 }, o); assert.strictEqual(P.ttsOf(p, o.id), null);
    p = P.setAssetTts(p, o.asset, { text: 'hello', voice: 'piper:x', speed: 9, pitch: -99 }); assert.deepStrictEqual(P.ttsOf(p, o.id), { text: 'hello', voice: 'piper:x', speed: 3, pitch: -12 });
    assert.strictEqual(P.setAssetTts(p, o.asset, { text: 'hello', voice: 'piper:x', speed: 9, pitch: -99 }), p); assert.strictEqual(P.setAssetTts(p, 'nope', {}), p); assert.strictEqual(P.ttsOf(P.setAssetTts(p, o.asset, null), o.id), null);
  });
  ok('a new take replaces the sound in place: same start, stops at the next clip or the end, gets its own asset, and a clip that is not a sound is refused', () => {
    const o = {}, o2 = {}; let p = P.addSfx(base, 2000, { name: 'a', durMs: 3000 }, o); p = P.addSfx(p, 6000, { name: 'b', durMs: 1000 }, o2);
    const out = {}, q = P.replaceSpeech(p, o.id, { durMs: 5000, name: 'Speech: new' }, { text: 'longer', voice: 'piper:y', speed: 1, pitch: 0 }, out), f = P.findClip(q, o.id);
    assert.strictEqual(f.clip.dur, 4000); assert(out.cut); assert.strictEqual(f.clip.start, 2000); assert.notStrictEqual(out.asset, o.asset); assert.strictEqual(f.clip.asset, out.asset); assert.strictEqual(P.ttsOf(q, o.id).text, 'longer');
    const out2 = {}; assert.strictEqual(P.findClip(P.replaceSpeech(p, o.id, { durMs: 1500 }, null, out2), o.id).clip.dur, 1500); assert(!out2.cut);
    assert.strictEqual(P.replaceSpeech(p, 'vA', { durMs: 1000 }, null), p); assert.strictEqual(P.replaceSpeech(p, o.id, { durMs: 50 }, null), p);
    assert.deepStrictEqual(P.validate(q), []);
  });
  ok('speech clips cut and export like any sound (the sound file is named after the asset)', () => {
    const NP = require('../www/plan.js'), o = {}; let p = P.addSfx(base, 2000, { name: 'Speech: hi', durMs: 3000 }, o); p = P.setAssetTts(p, o.asset, { text: 'hi', voice: 'piper:x', speed: 1, pitch: 0 });
    assert.strictEqual(P.splitAt(p, 3000).tracks.find(t => t.role === 'sfx').clips.length, 2);
    const plan = NP.projectToPlan(p); assert(plan.audio.some(a => a.file === o.asset + '.in'));
  });
  ok('the editor has the panel, the buttons and the files are wired in', () => {
    const ed = fs.readFileSync(www('editor.js'), 'utf8'), html = fs.readFileSync(www('index.html'), 'utf8'), sw = fs.readFileSync(www('sw.js'), 'utf8');
    new vm.Script(ed, { filename: 'editor.js' });
    ["id: 'edTts'", "id: 'edTextSpeak'", 'PANELS.tts = ', 'function ttsGenerate', 'function ttsReadCaptions', 'P.replaceSpeech(q, editId', 'NTTS.synthRaw(job.text'].forEach(s => assert(ed.includes(s), s));
    assert(html.includes('<script src="tts.js"></script>') && html.indexOf('tts.js') < html.indexOf('src="editor.js"')); assert(sw.includes("'./tts.js'") && sw.includes("'./tts-piper.js'"));
    ['tts.js', 'tts-piper.js'].forEach(f => assert(fs.existsSync(www(f)), f)); new vm.Script(fs.readFileSync(www('tts-piper.js'), 'utf8'));
  });
  console.log('\n' + n + ' checks passed');
})().catch(e => { console.error(e); process.exit(1); });