'use strict';
/* Naki auto captions. Two helpers that work offline for any language, and one that listens:
   - chunkRanges: turns the stretches where you were talking into caption slots (you type the words);
   - segmentsFromChunks / splitLines: tidy what a speech model returns into caption lines;
   - recognize: runs a Whisper speech model on THIS device (transformers.js, loaded from the internet the first time, and kept by the browser).
   Whisper knows English well and some other languages; Luganda is not one of them, so check every line. */
var NakiCaptions = (function () {
  var LIB_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
  var MODELS = { english: { id: 'onnx-community/whisper-tiny.en', mb: 40 }, other: { id: 'onnx-community/whisper-base', mb: 90 } };
  var LANGS = [
    { key: 'english', label: 'English', model: 'english', lang: null },
    { key: 'swahili', label: 'Swahili', model: 'other', lang: 'swahili' },
    { key: 'auto', label: 'Other (detect)', model: 'other', lang: null }
  ];
  var loaded = {};

  // [{ start, end }] stretches of speech: none longer than maxMs (a long one is cut into equal slots).
  function chunkRanges(ranges, maxMs) {
    var out = [];
    (ranges || []).forEach(function (r) {
      var len = r.end - r.start, k = Math.max(1, Math.ceil(len / maxMs)), step = len / k;
      for (var i = 0; i < k; i++) out.push({ start: Math.round(r.start + i * step), end: Math.round(r.start + (i + 1) * step) });
    });
    return out;
  }
  // The model's chunks [{ timestamp: [startSec, endSec | null], text }] as [{ startMs, endMs, text }]; the last one has no end, so it runs to the end of the recording.
  function segmentsFromChunks(chunks, totalMs) {
    var out = [];
    (chunks || []).forEach(function (c, i) {
      var t = c.timestamp || [], s = t[0], e = t[1], nx = null;
      if (s == null || isNaN(s)) return;
      for (var j = i + 1; j < chunks.length && nx == null; j++) { var ns = chunks[j] && chunks[j].timestamp && chunks[j].timestamp[0]; if (ns != null && !isNaN(ns)) nx = ns; }
      if (e == null || isNaN(e)) e = nx != null ? nx : (totalMs || 0) / 1000;
      var text = String(c.text == null ? '' : c.text).replace(/\s+/g, ' ').trim();
      if (!text || /^[\[(].*[\])]$/.test(text)) return;   // "[BLANK_AUDIO]", "(music)"
      var sm = Math.round(s * 1000), em = Math.max(Math.round(e * 1000), sm + 400);
      out.push({ startMs: sm, endMs: totalMs ? Math.min(em, Math.max(totalMs, sm + 400)) : em, text: text });
    });
    return out;
  }
  // Long lines are broken at word boundaries into lines of at most maxChars, each getting time in proportion to its length.
  function splitLines(segs, maxChars) {
    var out = [];
    (segs || []).forEach(function (sg) {
      var words = sg.text.split(' '), lines = [], cur = '';
      words.forEach(function (w) { if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; });
      if (cur) lines.push(cur);
      var len = sg.endMs - sg.startMs, total = lines.join('').length || 1, at = sg.startMs, used = 0;
      lines.forEach(function (l, i) {
        used += l.length; var end = i === lines.length - 1 ? sg.endMs : sg.startMs + Math.round(len * used / total);
        out.push({ startMs: at, endMs: end, text: l }); at = end;
      });
    });
    return out;
  }
  // The voice recording as mono samples at 16000 Hz, which is what the model reads.
  async function toMono16k(blob) {
    var AC = (typeof OfflineAudioContext !== 'undefined') ? OfflineAudioContext : window.webkitOfflineAudioContext;
    var ab = await new AC(1, 1, 16000).decodeAudioData(await blob.arrayBuffer());
    var n = ab.length, ch = ab.numberOfChannels, out = new Float32Array(n);
    for (var c = 0; c < ch; c++) { var d = ab.getChannelData(c); for (var i = 0; i < n; i++) out[i] += d[i] / ch; }
    return { samples: out, durMs: Math.round(ab.duration * 1000) };
  }
  // opts: { language: 'english' | 'swahili' | 'auto', onStatus(text), lib / decode (for tests) }.  Resolves with [{ startMs, endMs, text }] in the time of the voice file.
  async function recognize(blob, opts) {
    opts = opts || {};
    var say = opts.onStatus || function () {}, L = LANGS.filter(function (l) { return l.key === opts.language; })[0] || LANGS[0], M = MODELS[L.model];
    say('Reading your voice recording...');
    var audio = await (opts.decode || toMono16k)(blob);
    say('Loading the speech model. The first time this downloads about ' + M.mb + ' MB, so it needs internet.');
    var lib = opts.lib || await import(/* webpackIgnore: true */ LIB_URL);
    if (!loaded[M.id]) {
      loaded[M.id] = await lib.pipeline('automatic-speech-recognition', M.id, { progress_callback: function (p) {
        if (p && p.status === 'progress' && typeof p.progress === 'number') say('Downloading the speech model... ' + Math.round(p.progress) + '%');
      } });
    }
    say('Listening to your recording. This can take a few minutes.');
    var o = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 };
    if (L.model !== 'english') { o.task = 'transcribe'; if (L.lang) o.language = L.lang; }   // English-only models take no language
    var res = await loaded[M.id](audio.samples, o);
    return segmentsFromChunks(res && res.chunks || [], audio.durMs);
  }
  var api = { LIB_URL: LIB_URL, MODELS: MODELS, LANGS: LANGS, chunkRanges: chunkRanges, segmentsFromChunks: segmentsFromChunks, splitLines: splitLines, recognize: recognize,
    _reset: function () { loaded = {}; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiCaptions = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['captions.js'] = 'sound'; }
  return api;
})();
