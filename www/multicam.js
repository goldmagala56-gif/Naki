'use strict';
/* Naki multi-camera sync: finds how far apart two recordings of the same event started, by lining up their SOUND.
   Both files are listened to for up to 90 seconds; each is turned into a loudness curve (one value every 10 ms) and the two curves
   are slid against each other until they match best. Works with different microphones, because it follows when sounds happen, not how they sound.

   offsetMs means:  time in file B  =  time in file A  +  offsetMs   (positive: B started recording earlier than A).

   envelopeFromBins / matchEnvelopes are pure (tested in node). loadEnvelope / syncFiles need a browser and read the sound with the
   vendored mediabunny player (only the first part of each file is decoded, so a long movie is fine), or with the browser's own
   decoder (NakiBeats.decodeFile from beatsync.js) when that cannot read the file. */
var NakiMulticam = (function () {
  var HOP_MS = 10;

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // ---------- from mean power per 10 ms to a curve that can be compared ----------
  // power = mean squared sample per 10 ms. Returns the loudness (log), with slow changes taken out and the spread made 1.
  function envelopeFromPower(power) {
    var n = power.length, v = new Float32Array(n), i;
    for (i = 0; i < n; i++) v[i] = Math.log(1e-9 + power[i]);
    var half = 100, cum = new Float64Array(n + 1);   // moving average over about 2 s
    for (i = 0; i < n; i++) cum[i + 1] = cum[i] + v[i];
    var out = new Float32Array(n), s2 = 0;
    for (i = 0; i < n; i++) {
      var a = Math.max(0, i - half), b = Math.min(n, i + half + 1);
      out[i] = v[i] - (cum[b] - cum[a]) / (b - a); s2 += out[i] * out[i];
    }
    var sd = Math.sqrt(s2 / Math.max(1, n)) || 1;
    for (i = 0; i < n; i++) out[i] /= sd;
    return out;
  }

  // ---------- sliding one curve against the other ----------
  // Finds the lag (in 10 ms steps) at which B[i + lag] best matches A[i], looking up to maxLagMs either way and needing at least minOverlapMs of both
  // curves to overlap. Returns { offsetMs, confidence 0..1, score } or null. confidence is high when the best match is strong AND clearly better than every other.
  function matchEnvelopes(A, B, o) {
    o = o || {};
    var maxLag = Math.round((o.maxLagMs != null ? o.maxLagMs : 60000) / HOP_MS), minOv = Math.round((o.minOverlapMs != null ? o.minOverlapMs : 8000) / HOP_MS);
    if (!A || !B || A.length < minOv || B.length < minOv) return null;
    var scores = new Float32Array(2 * maxLag + 1), best = -Infinity, bi = -1, lag, i;
    for (lag = -maxLag; lag <= maxLag; lag++) {
      var i0 = Math.max(0, -lag), i1 = Math.min(A.length, B.length - lag), cnt = i1 - i0;
      if (cnt < minOv) { scores[lag + maxLag] = -1; continue; }
      var s = 0;
      for (i = i0; i < i1; i++) s += A[i] * B[i + lag];
      s /= cnt; scores[lag + maxLag] = s;
      if (s > best) { best = s; bi = lag + maxLag; }
    }
    if (bi < 0 || !(best > 0)) return null;
    var second = -1, gap = 100;   // the best match more than 1 s away from the winner
    for (i = 0; i < scores.length; i++) if (Math.abs(i - bi) > gap && scores[i] > second) second = scores[i];
    var l = scores[bi - 1], r = scores[bi + 1], d = 0;
    if (bi > 0 && bi < scores.length - 1 && l > -1 && r > -1) { var den = l - 2 * best + r; if (den < 0) d = clamp(0.5 * (l - r) / den, -0.5, 0.5); }
    var strength = clamp(best / 0.5, 0, 1), clear = best > 0 ? clamp((best - Math.max(0, second)) / best / 0.5, 0, 1) : 0;
    return { offsetMs: Math.round(((bi - maxLag) + d) * HOP_MS), confidence: Math.round(strength * clear * 100) / 100, score: Math.round(best * 1000) / 1000 };
  }

  // ---------- reading the sound (browser) ----------
  var mbPromise = null;
  function loadMediabunny() {
    if (!mbPromise) mbPromise = import(new URL('vendor/mediabunny/mediabunny.min.mjs', location.href).href);
    return mbPromise;
  }
  // Mean power per 10 ms of the part of a file from startMs for durMs. Tries the windowed player first; falls back to decoding the whole file.
  async function loadPower(file, startMs, durMs, onStatus) {
    var bins = Math.ceil(durMs / HOP_MS) + 2, sum = new Float64Array(bins), cnt = new Uint32Array(bins);
    function add(mono, sr, tSec) {
      var hop = sr * HOP_MS / 1000;
      for (var i = 0; i < mono.length; i++) { var b = Math.floor((tSec * sr + i) / hop); if (b < 0 || b >= bins) continue; sum[b] += mono[i] * mono[i]; cnt[b]++; }
    }
    var ok = false;
    try {
      var M = await loadMediabunny(), input = new M.Input({ source: new M.BlobSource(file), formats: M.ALL_FORMATS }), track = await input.getPrimaryAudioTrack();
      if (!track) throw new Error('This video has no sound to line up.');
      var sink = new M.AudioBufferSink(track), t0 = startMs / 1000;
      for await (var w of sink.buffers(t0, (startMs + durMs) / 1000)) {
        var b = w.buffer, nCh = b.numberOfChannels, n = b.length, mono = new Float32Array(n), c, i;
        for (c = 0; c < nCh; c++) { var d = b.getChannelData(c); for (i = 0; i < n; i++) mono[i] += d[i] / nCh; }
        add(mono, b.sampleRate, w.timestamp - t0); ok = true;
      }
      if (input.dispose) input.dispose();
    } catch (e) { if (e && /no sound/.test(e.message)) throw e; ok = false; }
    if (!ok) {
      var NB = typeof window !== 'undefined' ? window.NakiBeats : (typeof require !== 'undefined' ? require('./beatsync.js') : null);
      if (!NB || !NB.decodeFile) throw new Error('This browser cannot read the sound of this video.');
      if (file.size > 250e6) throw new Error('This video is too big to read the sound from on this device.');
      if (onStatus) onStatus('Reading the whole file (this can take a moment)...');
      var dec = await NB.decodeFile(file), ch = dec.channels, len = ch[0].length, from = Math.round(startMs / 1000 * dec.sr), to = Math.min(len, from + Math.round(durMs / 1000 * dec.sr));
      if (from >= len) throw new Error('The video is shorter than that.');
      var m2 = new Float32Array(to - from);
      for (var k = 0; k < ch.length; k++) for (var j = 0; j < m2.length; j++) m2[j] += ch[k][from + j] / ch.length;
      add(m2, dec.sr, 0);
    }
    var power = new Float32Array(bins);
    for (var q = 0; q < bins; q++) power[q] = cnt[q] ? sum[q] / cnt[q] : 0;
    return power;
  }
  // How far apart two files started. o: { startMs: 0, durMs: 90000, maxLagMs: 60000, onStatus(text) }. Resolves to { offsetMs, confidence } or null.
  async function syncFiles(fileA, fileB, o) {
    o = o || {};
    var say = o.onStatus || function () {}, st = o.startMs || 0, du = o.durMs || 90000;
    say('Listening to the main video...'); var pa = await loadPower(fileA, st, du, say);
    say('Listening to the other camera...'); var pb = await loadPower(fileB, st, du, say);
    say('Lining them up...');
    return matchEnvelopes(envelopeFromPower(pa), envelopeFromPower(pb), { maxLagMs: o.maxLagMs != null ? o.maxLagMs : 60000, minOverlapMs: 8000 });
  }

  var api = { HOP_MS: HOP_MS, envelopeFromPower: envelopeFromPower, matchEnvelopes: matchEnvelopes, loadPower: loadPower, syncFiles: syncFiles };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiMulticam = api;
  return api;
})();

// Which version of this file is running (the Home screen lists these, so a stale copy is easy to spot).
if (typeof window !== 'undefined') { window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['multicam.js'] = 'multicam'; }