'use strict';
/* Naki text to speech.

   Two kinds of voice:
   - BROWSER voices (speechSynthesis): free and instant, but the browser only speaks them out loud, it cannot hand over a sound file.
     So they are for LISTENING ("Listen" in the panel).
   - OFFLINE voices (an engine such as Piper, see tts-piper.js and vendor/piper/README.txt): they produce real audio, so the speech can go on the
     timeline, be cut, moved, mixed and exported like any other sound.

   An engine is { id, name, offline: true, ready(), load(onStatus), voices() -> [{ id, label, lang, langLabel }], synth(text, voiceId, onStatus) -> Promise<{ samples: Float32Array, sampleRate }> }
   and is added with NakiTTS.register(engine). Everything else here works for any engine, and most of it is pure (tested in node):
   splitText (sentences, with pauses), encodeWav / decodeWav, trimSilence, timeStretch (speed without changing the pitch), resample,
   render (speed + pitch + loudness + fades -> a WAV), synthRaw (long text, cached). */
var NakiTTS = (function () {
  var PREF_KEY = 'naki.tts', engines = {}, cache = new Map(), audioEl = null;

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // ---------- text ----------
  function cleanText(t) { return String(t == null ? '' : t).replace(/\r/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
  // A piece of text longer than max is cut at a comma (or, failing that, a space).
  function chunk(s, max) {
    var out = [];
    while (s.length > max) {
      var cut = -1, i;
      for (i = max; i > max * 0.4; i--) if (/[,;:]/.test(s.charAt(i - 1))) { cut = i; break; }
      if (cut < 0) for (i = max; i > max * 0.4; i--) if (s.charAt(i) === ' ') { cut = i; break; }
      if (cut < 0) cut = max;
      out.push(s.slice(0, cut).trim()); s = s.slice(cut).trim();
    }
    if (s) out.push(s);
    return out;
  }
  // Cuts text into pieces an engine can speak well, each with the pause (ms) to leave after it: a sentence end, a comma cut, a new paragraph. The last pause is 0.
  // A full stop inside a number ("3.5") is not a sentence end.
  function splitText(text, maxChars) {
    maxChars = maxChars || 220;
    var s = cleanText(text), out = [];
    if (!s) return out;
    var paras = s.split(/\n+/);
    paras.forEach(function (para, pi) {
      var sentences = para.replace(/([.!?\u2026]+["')\]]*)(\s+|$)/g, '$1\u0001').split('\u0001').map(function (x) { return x.trim(); }).filter(Boolean);
      sentences.forEach(function (sen, si) {
        var pieces = chunk(sen, maxChars);
        pieces.forEach(function (pc, k) {
          var last = k === pieces.length - 1, endsPara = last && si === sentences.length - 1, pause;
          if (!last) pause = 140;
          else if (endsPara) pause = pi < paras.length - 1 ? 520 : 0;
          else pause = /[.!?\u2026]["')\]]*$/.test(pc) ? 320 : 200;
          out.push({ text: pc, pauseMs: pause });
        });
      });
    });
    if (out.length) out[out.length - 1].pauseMs = 0;
    return out;
  }
  function hasSpeech(text) { try { return /[\p{L}\p{N}]/u.test(String(text || '')); } catch (e) { return /[A-Za-z0-9]/.test(String(text || '')); } }
  // A rough length for a text spoken at speed (for messages only).
  function estimateMs(text, speed) { var words = cleanText(text).split(/\s+/).filter(Boolean).length; return Math.round(words / 2.6 / (speed || 1) * 1000); }

  // ---------- WAV ----------
  function encodeWav(samples, sr) {
    var n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), i;
    function w(o, s) { for (var k = 0; k < s.length; k++) v.setUint8(o + k, s.charCodeAt(k)); }
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (i = 0; i < n; i++) { var s = clamp(samples[i], -1, 1); v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true); }
    return buf;
  }
  // Reads a WAV (8, 16, 24 or 32 bit whole numbers, or 32 bit float; any number of channels, mixed down to one). Returns { samples, sampleRate }.
  function decodeWav(ab) {
    var v = new DataView(ab);
    if (ab.byteLength < 44 || v.getUint32(0, false) !== 0x52494646 || v.getUint32(8, false) !== 0x57415645) throw new Error('This is not a WAV file.');
    var pos = 12, fmt = null, dataAt = -1, dataLen = 0;
    while (pos + 8 <= ab.byteLength) {
      var id = v.getUint32(pos, false), len = v.getUint32(pos + 4, true);
      if (id === 0x666d7420) fmt = { tag: v.getUint16(pos + 8, true), ch: v.getUint16(pos + 10, true), sr: v.getUint32(pos + 12, true), bits: v.getUint16(pos + 22, true) };
      else if (id === 0x64617461) { dataAt = pos + 8; dataLen = Math.min(len, ab.byteLength - dataAt); break; }
      pos += 8 + len + (len & 1);
    }
    if (!fmt || dataAt < 0) throw new Error('This WAV file has no sound in it.');
    var bytes = fmt.bits / 8, frames = Math.floor(dataLen / (bytes * fmt.ch)), out = new Float32Array(frames), i, c;
    for (i = 0; i < frames; i++) {
      var sum = 0;
      for (c = 0; c < fmt.ch; c++) {
        var o = dataAt + (i * fmt.ch + c) * bytes, s;
        if (fmt.tag === 3 && fmt.bits === 32) s = v.getFloat32(o, true);
        else if (fmt.bits === 16) s = v.getInt16(o, true) / 32768;
        else if (fmt.bits === 8) s = (v.getUint8(o) - 128) / 128;
        else if (fmt.bits === 24) { var x = v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getUint8(o + 2) << 16); if (x & 0x800000) x -= 0x1000000; s = x / 8388608; }
        else if (fmt.bits === 32) s = v.getInt32(o, true) / 2147483648;
        else throw new Error('This WAV format is not supported.');
        sum += s;
      }
      out[i] = sum / fmt.ch;
    }
    return { samples: out, sampleRate: fmt.sr };
  }

  // ---------- sound processing ----------
  function joinSamples(parts, sr, gapsMs) {
    var total = 0, i;
    parts.forEach(function (p, k) { total += p.length + (k < parts.length - 1 ? Math.round((gapsMs[k] || 0) / 1000 * sr) : 0); });
    var out = new Float32Array(total), at = 0;
    parts.forEach(function (p, k) { out.set(p, at); at += p.length + (k < parts.length - 1 ? Math.round((gapsMs[k] || 0) / 1000 * sr) : 0); });
    return out;
  }
  // Takes quiet off the start and end (keeps padMs of it), using 10 ms stretches.
  function trimSilence(x, sr, thresholdDb, padMs) {
    var thr = Math.pow(10, (thresholdDb == null ? -45 : thresholdDb) / 20), win = Math.max(1, Math.round(sr * 0.01)), n = Math.floor(x.length / win), first = -1, last = -1, i, j;
    for (i = 0; i < n; i++) {
      var s = 0; for (j = 0; j < win; j++) { var v = x[i * win + j]; s += v * v; }
      if (Math.sqrt(s / win) > thr) { if (first < 0) first = i; last = i; }
    }
    if (first < 0) return new Float32Array(0);
    var pad = Math.round((padMs == null ? 40 : padMs) / 1000 * sr), a = Math.max(0, first * win - pad), b = Math.min(x.length, (last + 1) * win + pad);
    return x.slice(a, b);
  }
  // Plays the sound factor times faster by reading it faster (the pitch goes up by the same factor).
  function resample(x, factor) {
    if (Math.abs(factor - 1) < 1e-6) return Float32Array.from(x);
    var n = Math.max(1, Math.floor((x.length - 1) / factor) + 1), y = new Float32Array(n);
    for (var i = 0; i < n; i++) { var p = i * factor, k = Math.floor(p), f = p - k; y[i] = x[k] * (1 - f) + (x[Math.min(x.length - 1, k + 1)]) * f; }
    return y;
  }
  // Speed without changing the pitch (WSOLA): rate 2 = twice as fast and half as long. Pieces of the sound are laid over each other where the waves line up.
  function timeStretch(x, sr, rate) {
    if (!(rate > 0)) rate = 1;
    if (Math.abs(rate - 1) < 0.01 || x.length < 256) return Float32Array.from(x);
    var frame = Math.max(128, Math.round(sr * 0.032) & ~1), hs = frame / 2, ha = hs * rate, tol = Math.round(sr * 0.008), n = x.length;
    var outLen = Math.ceil(n / rate) + frame, y = new Float32Array(outLen), norm = new Float32Array(outLen), win = new Float32Array(frame), i, j, k;
    for (i = 0; i < frame; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / frame);
    var prev = 0;
    for (k = 0; ; k++) {
      var target = Math.round(k * ha), outPos = k * hs, pos;
      if (outPos + frame > outLen || target > n - frame) break;
      if (k === 0) pos = 0;
      else {
        var nat = Math.min(prev + hs, n - frame), lo = Math.max(0, target - tol), hi = Math.min(n - frame, target + tol), best = -Infinity;
        pos = Math.min(hi, Math.max(lo, target));
        for (var c = lo; c <= hi; c++) {
          var s = 0, e = 1e-9;
          for (j = 0; j < frame; j += 2) { var a = x[c + j]; s += a * x[nat + j]; e += a * a; }
          var score = s / Math.sqrt(e);
          if (score > best) { best = score; pos = c; }
        }
      }
      for (j = 0; j < frame; j++) { y[outPos + j] += x[pos + j] * win[j]; norm[outPos + j] += win[j]; }
      prev = pos;
    }
    var len = Math.min(outLen, Math.round(n / rate)), out = new Float32Array(len);
    for (i = 0; i < len; i++) out[i] = norm[i] > 1e-3 ? y[i] / norm[i] : 0;
    return out;
  }
  function normalizePeak(x, target) {
    var pk = 0, i; for (i = 0; i < x.length; i++) { var a = Math.abs(x[i]); if (a > pk) pk = a; }
    if (!(pk > 0)) return x;
    var g = (target || 0.89) / pk, out = new Float32Array(x.length); for (i = 0; i < x.length; i++) out[i] = x[i] * g;
    return out;
  }
  function fadeEnds(x, sr, ms) {
    var n = Math.min(Math.floor(x.length / 2), Math.round(sr * (ms || 8) / 1000)), out = Float32Array.from(x);
    for (var i = 0; i < n; i++) { var g = i / n; out[i] *= g; out[out.length - 1 - i] *= g; }
    return out;
  }
  // Speed (0.5 to 3, pitch unchanged), pitch (-12 to +12 semitones, length unchanged), a steady loudness and soft ends. Returns { samples, sampleRate, durMs, blob }.
  function render(raw, o) {
    o = o || {};
    var sr = raw.sampleRate, speed = clamp(+o.speed || 1, 0.5, 3), st = clamp(Math.round(+o.pitch || 0), -12, 12), f = Math.pow(2, st / 12), x = raw.samples;
    if (st) x = resample(x, f);          // pitch changes by f and the sound gets f times shorter ...
    x = timeStretch(x, sr, speed / f);   // ... this brings the length to 1 / speed of the original
    x = fadeEnds(normalizePeak(x, 0.89), sr, 8);
    return { samples: x, sampleRate: sr, durMs: Math.round(x.length / sr * 1000), blob: (typeof Blob !== 'undefined') ? new Blob([encodeWav(x, sr)], { type: 'audio/wav' }) : null };
  }

  // ---------- engines ----------
  function register(e) { if (e && e.id) engines[e.id] = e; return e; }
  function engine(id) { return engines[id] || null; }
  function offlineEngine() { var ids = Object.keys(engines); for (var i = 0; i < ids.length; i++) if (engines[ids[i]].offline && engines[ids[i]].ready()) return engines[ids[i]]; return null; }
  // Loads an engine's script (tts-piper.js for 'piper'), then the engine itself. Resolves to the engine.
  function loadEngine(id, onStatus) {
    var file = id === 'piper' ? 'tts-piper.js' : null;
    return new Promise(function (resolve, reject) {
      if (engines[id]) return resolve(engines[id]);
      if (!file) return reject(new Error('Unknown voice engine: ' + id));
      var s = document.createElement('script'); s.src = file;
      s.onload = function () { engines[id] ? resolve(engines[id]) : reject(new Error('The voice engine file did not register itself.')); };
      s.onerror = function () { reject(new Error('Could not load ' + file + '.')); };
      document.head.appendChild(s);
    }).then(function (e) { return e.ready() ? e : Promise.resolve(e.load(onStatus)).then(function () { return e; }); });
  }
  // Speaks text with an offline voice. voiceKey = 'engineId:voiceId'. Long text is spoken a sentence at a time and joined with natural pauses.
  // The same text and voice is only made once. Resolves to { samples, sampleRate } at the speed and pitch the voice naturally has (use render() to change them).
  async function synthRaw(text, voiceKey, onStatus) {
    var ix = String(voiceKey || '').indexOf(':'), eid = ix > 0 ? voiceKey.slice(0, ix) : '', vid = ix > 0 ? voiceKey.slice(ix + 1) : '', eng = engines[eid];
    if (!eng || !eng.offline || !eng.ready()) throw new Error('The offline voices are not loaded.');
    var key = voiceKey + '|' + cleanText(text), hit = cache.get(key);
    if (hit) return hit;
    var parts = splitText(text); if (!parts.length) throw new Error('There is no text to speak.');
    var chunks = [], pauses = [], sr = 0;
    for (var i = 0; i < parts.length; i++) {
      if (onStatus) onStatus(parts.length > 1 ? 'Speaking part ' + (i + 1) + ' of ' + parts.length + '...' : 'Speaking...');
      var r = await eng.synth(parts[i].text, vid, onStatus);
      if (!r || !r.samples || !r.samples.length) continue;
      sr = r.sampleRate; chunks.push(r.samples); pauses.push(parts[i].pauseMs);
    }
    if (!chunks.length) throw new Error('The voice gave no sound for this text.');
    var raw = { samples: trimSilence(joinSamples(chunks, sr, pauses), sr), sampleRate: sr };
    if (!raw.samples.length) throw new Error('The voice gave no sound for this text.');
    cache.set(key, raw); if (cache.size > 24) cache.delete(cache.keys().next().value);
    return raw;
  }
  function clearCache() { cache.clear(); }

  // ---------- listening with the browser's own voices ----------
  function slim(v) { return { voiceURI: v.voiceURI, name: v.name, lang: v.lang, local: !!v.localService }; }
  function browserVoices() {
    return new Promise(function (res) {
      if (typeof speechSynthesis === 'undefined') return res([]);
      var get = function () { return (speechSynthesis.getVoices() || []).map(slim); }, v = get();
      if (v.length) return res(v);
      var done = false; function fin() { if (done) return; done = true; res(get()); }
      try { speechSynthesis.addEventListener('voiceschanged', fin); } catch (e) {}
      setTimeout(fin, 1500);
    });
  }
  function pitchToBrowser(semitones) { return clamp(Math.pow(2, (semitones || 0) / 12), 0.5, 2); }
  function previewSpeak(text, o) {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return false;
    o = o || {}; stopPreview();
    var u = new SpeechSynthesisUtterance(cleanText(text)), v = (speechSynthesis.getVoices() || []).filter(function (x) { return x.voiceURI === o.voiceURI; })[0];
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = clamp(o.rate || 1, 0.5, 2); u.pitch = clamp(o.pitch == null ? 1 : o.pitch, 0, 2); u.volume = clamp(o.volume == null ? 1 : o.volume, 0, 1);
    if (o.onEnd) { u.onend = o.onEnd; u.onerror = o.onEnd; }
    speechSynthesis.speak(u); return true;
  }
  function playBlob(blob, onEnd) {
    stopPreview();
    var url = URL.createObjectURL(blob), a = new Audio(url); audioEl = a;
    a.onended = function () { URL.revokeObjectURL(url); if (audioEl === a) audioEl = null; if (onEnd) onEnd(); };
    var p = a.play(); if (p && p.catch) p.catch(function () { if (onEnd) onEnd(); });
    return a;
  }
  function stopPreview() {
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch (e) {}
    if (audioEl) { try { audioEl.pause(); } catch (e) {} audioEl = null; }
  }
  function langName(code) {
    try { var base = String(code || '').replace('_', '-'), dn = new Intl.DisplayNames([typeof navigator !== 'undefined' && navigator.language || 'en'], { type: 'language' }); return dn.of(base) || code; } catch (e) { return String(code || ''); }
  }

  // ---------- remembered choices ----------
  function getPrefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function setPrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(Object.assign(getPrefs(), p))); } catch (e) {} }

  var api = { cleanText: cleanText, splitText: splitText, hasSpeech: hasSpeech, estimateMs: estimateMs, encodeWav: encodeWav, decodeWav: decodeWav, joinSamples: joinSamples, trimSilence: trimSilence,
    resample: resample, timeStretch: timeStretch, normalizePeak: normalizePeak, fadeEnds: fadeEnds, render: render, register: register, engine: engine, offlineEngine: offlineEngine,
    loadEngine: loadEngine, synthRaw: synthRaw, clearCache: clearCache, browserVoices: browserVoices, pitchToBrowser: pitchToBrowser, previewSpeak: previewSpeak, playBlob: playBlob,
    stopPreview: stopPreview, langName: langName, getPrefs: getPrefs, setPrefs: setPrefs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiTTS = api;
  return api;
})();

// Which version of this file is running (the Home screen lists these, so a stale copy is easy to spot).
if (typeof window !== 'undefined') { window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['tts.js'] = 'tts1'; }