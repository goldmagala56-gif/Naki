'use strict';
/* Naki peaks: the waveform on sound clips (movie sound, music, effects), the way CapCut shows it. The loudness of a sound file is kept in steps of 50 ms
   (a "bin" holds the loudest sample in it). The bins are only filled for the stretches the timeline really uses, 20 seconds at a time, by reading the
   file's sound the same way the export does (a piece at a time, so a whole movie is never held in memory).
   make / addSamples / columns / drawBars are plain maths (tested). Store reads the files in the browser. */
var NakiPeaks = (function () {
  var BIN_MS = 50, CHUNK_MS = 20000;
  var SELF_URL = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src : (typeof location !== 'undefined' ? location.href : '');

  function make(durMs) { var n = Math.max(2, Math.ceil((durMs || 0) / BIN_MS) + 2); return { n: n, v: new Uint8Array(n), have: new Uint8Array(n), max: 0 }; }
  function grow(pk, bins) {
    if (bins <= pk.n) return;
    var n = bins + 64, v = new Uint8Array(n), h = new Uint8Array(n); v.set(pk.v); h.set(pk.have); pk.v = v; pk.have = h; pk.n = n;
  }
  // chans = [Float32Array, ...] (one per channel), sampleRate, startMs = where the first sample is in the file. Keeps the loudest sample of each bin.
  function addSamples(pk, chans, sampleRate, startMs) {
    var len = chans[0].length, endMs = startMs + len * 1000 / sampleRate, b0 = Math.floor(startMs / BIN_MS + 1e-9), b1 = Math.floor((endMs - 1e-6) / BIN_MS);
    grow(pk, b1 + 1);
    for (var b = b0; b <= b1; b++) {
      var i0 = Math.max(0, Math.ceil((b * BIN_MS - startMs) * sampleRate / 1000 - 1e-9)), i1 = Math.min(len, Math.ceil(((b + 1) * BIN_MS - startMs) * sampleRate / 1000 - 1e-9)), m = 0;
      for (var c = 0; c < chans.length; c++) { var d = chans[c]; for (var i = i0; i < i1; i++) { var x = d[i] < 0 ? -d[i] : d[i]; if (x > m) m = x; } }
      var byte = Math.min(255, Math.round(m * 255));
      if (byte > pk.v[b]) pk.v[b] = byte;
      if (byte > pk.max) pk.max = byte;
      pk.have[b] = 1;
    }
  }
  // Marks the bins from aMs to bMs as read even if nothing was found there (past the end of the file), so they are not asked for again.
  function markRead(pk, aMs, bMs) { var b1 = Math.floor(bMs / BIN_MS); grow(pk, b1 + 1); for (var b = Math.floor(aMs / BIN_MS); b <= b1; b++) pk.have[b] = 1; }
  // The loudness for each of nCols columns across a clip that shows the file from inMs for spanMs (reverse: backwards). Columns whose bins are
  // not read yet are 0, and the stretch of the file that is missing is returned so it can be read: { vals, missing: [fromMs, toMs] | null }.
  function columns(pk, inMs, spanMs, nCols, reverse) {
    var vals = new Uint8Array(nCols), lo = Infinity, hi = -Infinity;
    for (var x = 0; x < nCols; x++) {
      var f0 = x / nCols, f1 = (x + 1) / nCols;
      if (reverse) { var t = f0; f0 = 1 - f1; f1 = 1 - t; }
      var t0 = inMs + f0 * spanMs, t1 = inMs + f1 * spanMs, b0 = Math.max(0, Math.floor(t0 / BIN_MS)), b1 = Math.max(b0, Math.floor((t1 - 1e-6) / BIN_MS)), m = 0, miss = false;
      for (var b = b0; b <= b1; b++) { if (b < pk.n && pk.have[b]) { if (pk.v[b] > m) m = pk.v[b]; } else miss = true; }
      vals[x] = m;
      if (miss) { lo = Math.min(lo, t0); hi = Math.max(hi, t1); }
    }
    return { vals: vals, missing: lo <= hi ? [Math.max(0, lo), hi] : null };
  }
  // Mirrored bars like the voice waveform. norm = the loudest value in this file, so a quiet file still shows.
  function drawBars(g, vals, W, H, norm) {
    var top = Math.max(40, norm || 255);
    for (var x = 0; x < W; x += 2) {
      var m = 0; for (var j = x; j < Math.min(W, x + 2); j++) if (vals[j] > m) m = vals[j];
      var a = Math.max(1, Math.pow(Math.min(1, m / top), 0.7) * H); g.fillRect(x, (H - a) / 2, 1.5, a);
    }
  }
  // Which 20-second windows of the file still need reading to cover fromMs..toMs.
  function windows(fromMs, toMs) {
    var out = [], a = Math.floor(Math.max(0, fromMs) / CHUNK_MS) * CHUNK_MS;
    for (; a < toMs; a += CHUNK_MS) out.push([a, a + CHUNK_MS]);
    return out;
  }

  // ---------- reading the files (browser only) ----------
  function Store(opts) { this.getFile = opts.getFile; this.onReady = opts.onReady || function () {}; this.pk = {}; this.queue = []; this.pending = {}; this.busy = false; this.dead = false; this.lib = null; }
  Store.prototype.entry = function (asset) {
    var f = this.getFile && this.getFile(asset), e = this.pk[asset];
    if (!f) return e || null;
    var key = (f.name || '') + ':' + f.size;
    if (!e || e.key !== key) { if (e && e.input && e.input.dispose) { try { e.input.dispose(); } catch (x) {} } e = this.pk[asset] = { key: key, file: f, pk: make(0), failed: false, input: null, track: undefined }; }
    return e;
  };
  // Returns { vals, norm } for the clip, or null when there is no sound file (or it failed). Asks for what is not read yet.
  Store.prototype.view = function (asset, inMs, spanMs, nCols, reverse) {
    var e = this.entry(asset); if (!e || e.failed) return null;
    var r = columns(e.pk, inMs, spanMs, nCols, reverse), self = this;
    if (r.missing) windows(r.missing[0], r.missing[1]).forEach(function (w) { var k = asset + '@' + w[0]; if (!self.pending[k]) { self.pending[k] = 1; self.queue.push({ asset: asset, a: w[0], b: w[1], k: k }); } });
    this.pump();
    return { vals: r.vals, norm: e.pk.max, done: !r.missing };
  };
  Store.prototype.pump = function () {
    var self = this; if (self.busy || self.dead) return;
    var job = self.queue.pop(); if (!job) return;
    self.busy = true;
    self.read(job).catch(function (err) { var e = self.pk[job.asset]; if (e) e.failed = true; console.warn('waveform not read', job.asset, err); }).then(function () {
      delete self.pending[job.k]; self.busy = false;
      if (!self.notify) self.notify = setTimeout(function () { self.notify = 0; if (!self.dead) self.onReady(); }, 80);
      self.pump();
    });
  };
  Store.prototype.library = function () {
    if (!this.lib) this.lib = import(/* webpackIgnore: true */ new URL('vendor/mediabunny/mediabunny.min.mjs', SELF_URL || 'http://localhost/').href);
    return this.lib;
  };
  Store.prototype.read = async function (job) {
    var e = this.entry(job.asset); if (!e || e.failed) return;
    var pk = e.pk;
    try {
      var M = await this.library();
      if (!e.input) e.input = new M.Input({ source: new M.BlobSource(e.file), formats: M.ALL_FORMATS });
      if (e.track === undefined) e.track = await e.input.getPrimaryAudioTrack();
      if (!e.track) { markRead(pk, job.a, job.b); return; }   // a file with no sound
      var sink = new M.AudioBufferSink(e.track);
      for await (var w of sink.buffers(job.a / 1000, job.b / 1000)) {
        var ab = w.buffer, chans = []; for (var i = 0; i < ab.numberOfChannels; i++) chans.push(ab.getChannelData(i));
        addSamples(pk, chans, ab.sampleRate, w.timestamp * 1000);
      }
      markRead(pk, job.a, job.b);
    } catch (err) {
      // the browser's own decoder, for a small file the reader above could not open
      if (e.file.size > 30e6) throw err;
      var AC = (typeof OfflineAudioContext !== 'undefined') ? OfflineAudioContext : window.webkitOfflineAudioContext;
      var ab2 = await new AC(1, 1, 22050).decodeAudioData(await e.file.arrayBuffer()), ch = []; for (var c = 0; c < ab2.numberOfChannels; c++) ch.push(ab2.getChannelData(c));
      addSamples(pk, ch, ab2.sampleRate, 0); markRead(pk, 0, ab2.duration * 1000 + BIN_MS);
    }
  };
  Store.prototype.release = function () {
    var self = this; self.queue = []; self.pending = {}; self.busy = false;
    Object.keys(self.pk).forEach(function (a) { var e = self.pk[a]; if (e.input && e.input.dispose) { try { e.input.dispose(); } catch (x) {} } e.input = null; e.track = undefined; });
  };

  var api = { BIN_MS: BIN_MS, CHUNK_MS: CHUNK_MS, make: make, addSamples: addSamples, markRead: markRead, columns: columns, drawBars: drawBars, windows: windows, Store: Store };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiPeaks = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['peaks.js'] = 'timeline'; }
  return api;
})();
