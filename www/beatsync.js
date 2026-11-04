'use strict';
/* Naki beat sync: find the beat of the music, then cut and fit the picture to it. Pure helpers on top of project.js: nothing here touches the
   page except decodeFile (it needs the browser's sound decoder), and every edit returns a NEW project, so undo works like for any other edit.

   The beat grid is stored on the music clip itself: clip.beat = { bpm, offsetMs }, where offsetMs is the time of one beat in the music FILE.
   Because it lives on the clip, it follows the music when you move it, trim it or split it, and it is saved with the project.

   analyze(samples, sr)                      -> { bpm, offsetMs, confidence } or null   (finds the tempo and where the beats fall)
   tapTempo(timesMs)                         -> { bpm, offsetMs } or null               (times of taps, in the music file's own time)
   gridOf(p) / setGrid(p, grid | null)       the grid on the music clip, and changing it
   beatTimes(p, every)                       beat times on the timeline (every 1st, 2nd, 4th... beat)
   cutPoints(p, every) / cutOnBeats(p, o)    split the picture (and its sound) on the beats, nothing else is touched
   fitToBeats(p, o)                          make the ends of picture clips land on beats: by trimming, or by changing the speed */
var NakiBeats = (function () {
  var P = (typeof module !== 'undefined' && module.exports) ? require('./project.js') : (typeof window !== 'undefined' ? window.NakiProject : null);
  var MIN_BPM = 40, MAX_BPM = 240, MAX_CUTS = 400;

  function clone(x){ return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
  function mod(x, m){ return ((x % m) + m) % m; }
  function num(a, b){ return a - b; }

  // ---------- finding the tempo ----------
  // A curve of "something new just started" (drum hits, plucks), 100 values a second.
  function onsetCurve(x, sr){
    var hop = Math.max(1, Math.round(sr * 0.010)), n = Math.floor(x.length / hop), r = new Float32Array(n), i, j, mx = 0;
    for (i = 0; i < n; i++){
      var s = 0, base = i * hop;
      for (j = 1; j < hop; j++){ var d = x[base + j] - x[base + j - 1]; s += d * d; }   // the change from one sample to the next: loud at hits and hiss, quiet at low hum
      r[i] = Math.sqrt(s / hop); if (r[i] > mx) mx = r[i];
    }
    var o = new Float32Array(n), prev = 0;
    for (i = 0; i < n; i++){
      var c = mx > 0 ? Math.log(1 + 200 * r[i] / mx) : 0;
      o[i] = Math.max(0, c - prev); prev = c;
    }
    return { o: o, hopMs: hop / sr * 1000 };
  }
  function smooth3(a){
    var out = new Float32Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = 0.25 * (a[i - 1] || 0) + 0.5 * a[i] + 0.25 * (a[i + 1] || 0);
    return out;
  }
  // x = mono samples (-1..1), sr = samples a second. Needs a few seconds of sound. opts: minBpm / maxBpm (default 70 to 170).
  function analyze(x, sr, opts){
    opts = Object.assign({ minBpm: 70, maxBpm: 170 }, opts || {});
    if (!x || !sr || x.length < sr * 4) return null;
    var cv = onsetCurve(x, sr), env = smooth3(cv.o), hopMs = cv.hopMs, n = env.length, lag, i;
    var lagMin = Math.max(4, Math.floor(60000 / opts.maxBpm / hopMs)), lagMax = Math.ceil(60000 / opts.minBpm / hopMs), top = Math.min(n - 2, lagMax * 4);
    var acf = new Float32Array(top + 1);
    for (lag = 1; lag <= top; lag++){ var s = 0; for (i = 0; i + lag < n; i++) s += env[i] * env[i + lag]; acf[lag] = s / (n - lag); }
    var bestLag = 0, bestScore = -1;
    for (lag = lagMin; lag <= lagMax && lag <= top; lag++){
      var bpm = 60000 / (lag * hopMs), prior = Math.exp(-0.5 * Math.pow(Math.log(bpm / 120) / Math.LN2 / 0.9, 2));
      var sc = (acf[lag] + 0.5 * (acf[lag * 2] || 0) + 0.25 * (acf[lag * 4] || 0)) * prior;
      if (sc > bestScore){ bestScore = sc; bestLag = lag; }
    }
    if (!bestLag || !(bestScore > 0)) return null;
    // fine search: tempo near the coarse one, and where the first beat falls, by how strongly the onsets line up with the beats
    var b0 = 60000 / (bestLag * hopMs), best = { score: -1, bpm: b0, ph: 0 }, mean = 0;
    for (i = 0; i < n; i++) mean += env[i]; mean /= n;
    for (var b = b0 * 0.95; b <= b0 * 1.05; b += 0.1){
      var period = 60000 / b / hopMs;
      for (var ph = 0; ph < period; ph += 0.5){
        var sum = 0, k = 0;
        for (var pos = ph; pos < n - 1; pos += period){ sum += env[Math.round(pos)]; k++; }
        if (!k) continue;
        var score = sum / k;
        if (score > best.score){ best.score = score; best.bpm = b; best.ph = ph; }
      }
    }
    var bpmOut = Math.round(best.bpm * 10) / 10, beatMs = 60000 / bpmOut;
    return { bpm: bpmOut, offsetMs: Math.round(mod((best.ph + 0.5) * hopMs, beatMs) * 10) / 10, confidence: Math.round(clamp((best.score / (mean || 1) - 1) / 4, 0, 1) * 100) / 100 };
  }
  // channels = [Float32Array, ...] from a decoded file. Looks at maxMs of sound starting at startMs; the beat time it returns is in the file's own time.
  function analyzeBuffer(channels, sr, o){
    o = o || {};
    var len = channels[0].length, a = clamp(Math.round((o.startMs || 0) / 1000 * sr), 0, len), z = clamp(a + Math.round((o.maxMs || 90000) / 1000 * sr), a, len);
    var mono = new Float32Array(z - a), c, i;
    for (i = 0; i < mono.length; i++){ var s = 0; for (c = 0; c < channels.length; c++) s += channels[c][a + i]; mono[i] = s / channels.length; }
    var r = analyze(mono, sr, o); if (!r) return null;
    r.offsetMs = Math.round(mod(r.offsetMs + (o.startMs || 0), 60000 / r.bpm) * 10) / 10;
    return r;
  }
  // The browser decodes the file (any format it can play). Returns { channels, sr }.
  function decodeFile(file){
    var AC = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
    if (!AC) return Promise.reject(new Error('This browser cannot read sound files here.'));
    var read = file.arrayBuffer ? file.arrayBuffer() : new Promise(function (res, rej){ var r = new FileReader(); r.onload = function (){ res(r.result); }; r.onerror = rej; r.readAsArrayBuffer(file); });
    return read.then(function (buf){
      var ctx = new AC(1, 1, 44100);
      return new Promise(function (res, rej){ var p = ctx.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
    }).then(function (ab){
      var ch = []; for (var i = 0; i < ab.numberOfChannels; i++) ch.push(ab.getChannelData(i));
      return { channels: ch, sr: ab.sampleRate };
    });
  }
  // Taps in the music file's own time (ms). Taps that are far off the steady pace are ignored. Needs 4 taps or more.
  function tapTempo(times){
    var t = (times || []).filter(isFinite).slice().sort(num); if (t.length < 4) return null;
    var iv = []; for (var i = 1; i < t.length; i++) iv.push(t[i] - t[i - 1]);
    var med = iv.slice().sort(num)[Math.floor(iv.length / 2)];
    if (!(med > 60000 / MAX_BPM * 0.8)) return null;
    var good = []; t.forEach(function (x, j){ if (!j || Math.abs((x - t[j - 1]) - med) <= med * 0.25) good.push(x); });
    if (good.length < 4) return null;
    var span = (good[good.length - 1] - good[0]) / Math.round((good[good.length - 1] - good[0]) / med), beatMs = span;
    var bpm = clamp(Math.round(60000 / beatMs * 10) / 10, MIN_BPM, MAX_BPM); beatMs = 60000 / bpm;
    var sx = 0, sy = 0; good.forEach(function (x){ var a = 2 * Math.PI * x / beatMs; sx += Math.cos(a); sy += Math.sin(a); });
    return { bpm: bpm, offsetMs: Math.round(mod(Math.atan2(sy, sx) / (2 * Math.PI) * beatMs, beatMs) * 10) / 10 };
  }

  // ---------- the grid on the music clip ----------
  function musicClips(p){ var out = []; p.tracks.forEach(function (tr){ if (tr.role === 'music') tr.clips.forEach(function (c){ out.push(c); }); }); return out; }
  function gridOf(p){
    var c = musicClips(p).filter(function (x){ return x.beat; })[0];
    return c ? { clipId: c.id, bpm: c.beat.bpm, offsetMs: c.beat.offsetMs } : null;
  }
  function hasMusic(p){ return musicClips(p).length > 0; }
  // grid = { bpm, offsetMs } to set it on every music clip, or null to take it away. The same project comes back when nothing changes.
  function setGrid(p, grid){
    var clips = musicClips(p); if (!clips.length) return p;
    var g = null;
    if (grid){
      var bpm = clamp(Math.round(+grid.bpm * 100) / 100, MIN_BPM, MAX_BPM); if (!isFinite(bpm)) return p;
      g = { bpm: bpm, offsetMs: Math.round(mod(+grid.offsetMs || 0, 60000 / bpm) * 10) / 10 };
    }
    if (JSON.stringify(clips.map(function (c){ return c.beat || null; })) === JSON.stringify(clips.map(function (){ return g; }))) return p;
    var q = Object.assign({}, p, { tracks: clone(p.tracks), assets: clone(p.assets) });
    if (p.format) q.format = clone(p.format);
    musicClips(q).forEach(function (c){ if (g) c.beat = { bpm: g.bpm, offsetMs: g.offsetMs }; else delete c.beat; });
    return q;
  }
  // Beats on the timeline (ms), every `every` beats. A beat of the music clip is shown only while that part of the music is on the timeline.
  function beatTimes(p, every){
    every = Math.max(1, Math.round(every || 1));
    var out = [], seen = {};
    musicClips(p).forEach(function (c){
      if (!c.beat) return;
      var b = 60000 / c.beat.bpm, sp = c.speed || 1, off = c.beat.offsetMs, f0 = c.in, f1 = c.in + c.dur * sp;
      var k0 = Math.ceil((f0 - off) / b - 1e-9), k1 = Math.floor((f1 - off) / b + 1e-9);
      for (var k = k0; k <= k1 && k - k0 < 20000; k++){
        if (mod(k, every)) continue;
        var t = Math.round(c.start + (off + k * b - c.in) / sp);
        if (t < 0 || t > p.durationMs || seen[t]) continue;
        seen[t] = 1; out.push(t);
      }
    });
    return out.sort(num);
  }
  // A beat on the timeline and the length of one beat there (ms), for working out where beats fall outside the music too.
  function timelineGrid(p){
    var c = musicClips(p).filter(function (x){ return x.beat; })[0]; if (!c) return null;
    var sp = c.speed || 1, b = 60000 / c.beat.bpm, k0 = Math.ceil((c.in - c.beat.offsetMs) / b - 1e-9);
    return { t0: c.start + (c.beat.offsetMs + k0 * b - c.in) / sp, beat: b / sp };
  }
  // What the time at `tMs` on the timeline is in the music file (for tapping along while the music plays).
  function fileTimeAt(p, tMs){
    var c = musicClips(p).filter(function (x){ return tMs >= x.start && tMs <= x.start + x.dur; })[0] || musicClips(p)[0];
    return c ? (tMs - c.start) * (c.speed || 1) + c.in : null;
  }

  // ---------- cutting on the beat ----------
  function pictureLane(p){ return p.tracks.filter(function (t){ return t.role === 'movie'; })[0] || null; }
  // The moments a "cut on beats" would split at: beats that are not already a cut, and not right at the start or end.
  function cutPoints(p, every){
    var lane = pictureLane(p); if (!lane || !lane.clips.length) return [];
    var edges = []; lane.clips.forEach(function (c){ edges.push(c.start, c.start + c.dur); });
    var first = Math.min.apply(null, edges), last = Math.max.apply(null, edges);
    return beatTimes(p, every).filter(function (t){
      if (t < first + 120 || t > last - 120) return false;
      return !edges.some(function (e){ return Math.abs(e - t) < 120; });
    });
  }
  // Splits the picture (and its movie sound) on the beats. Your voice, music, titles and the rest are not cut. o.every = 1, 2, 4... (every Nth beat).
  function cutOnBeats(p, o, out){
    o = o || {}; out = out || {};
    if (!gridOf(p)){ out.error = 'Set the beat grid first.'; return p; }
    var pts = cutPoints(p, o.every || 1);
    if (!pts.length){ out.cuts = 0; return p; }
    if (pts.length > MAX_CUTS){ out.limited = pts.length - MAX_CUTS; pts = pts.slice(0, MAX_CUTS); }
    var keep = {}, q = p;
    p.tracks.forEach(function (tr){ if (tr.role !== 'movie' && tr.role !== 'movieSound'){ keep[tr.id] = !!tr.locked; q = P.setTrackProps(q, tr.id, { locked: true }); } });
    pts.forEach(function (t){ q = P.splitAt(q, t); });
    Object.keys(keep).forEach(function (id){ if (q.tracks.some(function (t){ return t.id === id; })) q = P.setTrackProps(q, id, { locked: keep[id] }); });
    out.cuts = pts.length;
    return q;
  }

  // ---------- fitting clips to the beat ----------
  // Makes the end of every picture clip land on a beat, one after the other from the start, then closes the gaps.
  // o.beats: 0 = the beat nearest to where the clip ends now; N = the clip lasts N beats (the first clip also holds the time before the first beat).
  // o.method: 'trim' only shortens a clip (its end moves back to a beat; one that is too short is left alone),
  //           'speed' makes the clip play faster or slower so its end lands exactly on the beat (between half and double speed).
  function fitToBeats(p, o, out){
    o = Object.assign({ beats: 0, method: 'trim' }, o || {}); out = out || {};
    var g = timelineGrid(p), lane = pictureLane(p);
    if (!g){ out.error = 'Set the beat grid first.'; return p; }
    if (!lane || !lane.clips.length) return p;
    var ids = lane.clips.slice().sort(function (a, b){ return a.start - b.start; }).map(function (c){ return c.id; });
    var q = p, cursor = 0, beat = g.beat, N = Math.max(0, Math.round(o.beats || 0)), minLen = beat * 0.75;
    out.fitted = 0; out.left = 0; out.limited = 0;
    function endFor(s, len, speedMode){
      var k;
      if (N > 0){ var b0 = Math.ceil((s - g.t0 - 1) / beat); k = b0 + N; }
      else k = speedMode ? Math.round((s + len - g.t0) / beat) : Math.floor((s + len - g.t0) / beat + 1e-6);
      var kmin = Math.ceil((s + minLen - g.t0) / beat - 1e-6); if (k < kmin) k = kmin;
      return Math.round(g.t0 + k * beat);
    }
    ids.forEach(function (id){
      var f = P.findClip(q, id); if (!f) return;
      var c = f.clip, s = cursor, len = c.dur;
      if (c.curve || (c.type !== 'video' && c.type !== 'freeze')){ cursor += len; out.left++; return; }   // a speed curve or something else: leave it as it is
      var speedMode = o.method === 'speed' && c.type === 'video', target = endFor(s, len, speedMode), want = target - s, before = c.dur;
      if (speedMode){
        var factor = clamp(len / want, 0.5, 2); if (Math.abs(factor - len / want) > 1e-6) out.limited++;
        q = P.setClipSpeed(q, id, Math.round((c.speed || 1) * factor * 100) / 100);
        var f2 = P.findClip(q, id), end2 = f2.clip.start + f2.clip.dur, wantEnd = f2.clip.start + want;
        if (Math.abs(end2 - wantEnd) > 1 && Math.abs(end2 - wantEnd) < 100) q = P.trimClipEnd(q, id, wantEnd);   // the speed is kept to hundredths, so trim off the last few ms
      } else {
        if (want > len + 1){ out.left++; cursor += len; return; }   // trimming can only make a clip shorter
        if (want < len - 1) q = P.trimClipEnd(q, id, c.start + want);
      }
      var f3 = P.findClip(q, id); cursor += f3.clip.dur;
      if (Math.abs(f3.clip.dur - before) > 1) out.fitted++;
    });
    var closed = P.closeGaps(q);
    return (out.fitted || closed !== q) && JSON.stringify(closed.tracks) !== JSON.stringify(p.tracks) ? closed : p;
  }

  function describe(out){
    if (out.error) return out.error;
    var bits = [];
    if (out.cuts != null) return out.cuts ? 'Cut on ' + out.cuts + ' beat' + (out.cuts === 1 ? '' : 's') + '. Your voice and music were not cut.' + (out.limited ? ' ' + out.limited + ' more beats were not cut (the most at once is ' + MAX_CUTS + ').' : '') : 'No new cuts: the beats are already cuts, or too close to the ends.';
    if (out.fitted) bits.push(out.fitted + ' clip' + (out.fitted === 1 ? '' : 's') + ' now end on a beat');
    if (out.left) bits.push(out.left + ' left as they were (too short to trim, or a paused picture or speed curve)');
    if (out.limited) bits.push(out.limited + ' could not reach the beat within half to double speed');
    return bits.length ? bits.join('; ') + '.' : 'Every clip already ends on a beat.';
  }

  var api = { analyze: analyze, analyzeBuffer: analyzeBuffer, decodeFile: decodeFile, tapTempo: tapTempo, gridOf: gridOf, setGrid: setGrid, hasMusic: hasMusic,
    beatTimes: beatTimes, fileTimeAt: fileTimeAt, cutPoints: cutPoints, cutOnBeats: cutOnBeats, fitToBeats: fitToBeats, describe: describe, MIN_BPM: MIN_BPM, MAX_BPM: MAX_BPM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiBeats = api;
  return api;
})();

// Which version of this file is running (the Home screen lists these, so a stale copy is easy to spot).
if (typeof window !== 'undefined'){ window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['beatsync.js'] = 'beats1'; }
