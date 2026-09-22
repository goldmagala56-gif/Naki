'use strict';
/*
  Naki in-app export engine (beta).

  Turns a finished session into one MP4, entirely on this device, using ffmpeg.wasm
  (the single-thread build, which needs no special server settings, so it works on
  GitHub Pages as-is). This mirrors the same rendering logic as tools/export/naki-export.js
  (the desktop tool): each "play" part of the session is cut from the movie, each "pause"
  becomes a held frame, the movie's own sound is lowered wherever you spoke, and your
  voice plays over everything.

  This file has two halves:
  - Pure functions (parseProbeInfo, planToJobs, buildGainRaw) that do no I/O and are
    covered by tests/export-engine.test.js.
  - The runner (NakiExport.run) that actually drives ffmpeg.wasm. It can only be
    exercised on a real device, since ffmpeg.wasm refuses to run outside a browser.
*/

var FPS = 30;
var SR = 48000;
var GAIN_HZ = 1000;

/* ---------- pure: parse ffmpeg's own "-i" log text for basic movie info ---------- */
// Mirrors tools/export/naki-export.js's probeMovie(), but reads ffmpeg.wasm's log
// lines (captured via the 'log' event) instead of spawning a separate ffprobe process.
function parseProbeInfo(logText) {
  var t = logText || '';
  var info = {
    hasAudio: /Stream #\d+:\d+.*Audio:/.test(t),
    audioMono: /Stream #\d+:\d+[^\n]*Audio:[^\n]*?,\s*mono\b/.test(t),
    width: 0, height: 0, sar: 1, durationSec: 0
  };
  var vm = /Stream #\d+:\d+.*Video:.*?,\s*(\d{2,5})x(\d{2,5})/.exec(t);
  if (vm) { info.width = +vm[1]; info.height = +vm[2]; }
  var sm = /SAR (\d+):(\d+)/.exec(t);
  if (sm && +sm[2] > 0 && +sm[1] > 0) info.sar = +sm[1] / +sm[2];
  var dm = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(t);
  if (dm) info.durationSec = (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3]);
  return info;
}

/* ---------- pure: the movie-loudness curve as a raw float file ffmpeg can read ---------- */
// Same math as naki-export.js's writeGainRaw(), just returning bytes instead of writing a file.
function buildGainRaw(points, totalMs) {
  var n = Math.ceil(totalMs / 1000 * GAIN_HZ) + GAIN_HZ;
  var f = new Float32Array(n * 2);
  var pts = (points && points.length) ? points : [[0, 1]];
  var j = 0;
  for (var k = 0; k < n; k++) {
    var t = k * 1000 / GAIN_HZ;
    while (j + 1 < pts.length && pts[j + 1][0] <= t) j++;
    var g;
    if (t <= pts[0][0]) g = pts[0][1];
    else if (j + 1 >= pts.length) g = pts[pts.length - 1][1];
    else {
      var a = pts[j], b = pts[j + 1];
      g = b[0] === a[0] ? b[1] : a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
    }
    f[2 * k] = g; f[2 * k + 1] = g;
  }
  return new Uint8Array(f.buffer);
}

/* ---------- pure: turn the export plan into a list of ffmpeg.wasm jobs ---------- */
// Same design as naki-export.js's buildJobs(): one small ffmpeg run per segment, so a
// single mistake only costs one small piece, and progress can be shown as "part N of M".
// Filenames are plain virtual-FS names (no real paths), so this function has no
// platform-specific code and is exercised directly by the tests.
function planToJobs(plan, movieInfo, opts) {
  opts = opts || {};
  var height = opts.height || 480;
  var preset = opts.preset || 'ultrafast';
  var crf = opts.crf != null ? opts.crf : 26;
  var width = Math.max(2, Math.round((height * (movieInfo.width * movieInfo.sar / movieInfo.height)) / 2) * 2);
  var R = function (ms) { return Math.round(ms * FPS / 1000); };
  var Sm = function (ms) { return Math.round(ms * SR / 1000); };
  var enc = ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-profile:v', 'main', '-g', String(FPS * 2), '-r', String(FPS)];
  var ts = ['-f', 'mpegts', '-muxdelay', '0', '-muxpreload', '0'];
  var maxMovieSec = Math.max(0, (plan.movie && plan.movie.durationMs ? plan.movie.durationMs / 1000 : movieInfo.durationSec) - 0.1);
  var clampSec = function (ms) { return Math.max(0, Math.min(ms / 1000, maxMovieSec || ms / 1000)); };

  var jobs = [], videoList = [], audioList = [];
  plan.video.forEach(function (sp, i) {
    var id = String(i).padStart(4, '0');
    var nFrames = R(sp.sessionEnd) - R(sp.sessionStart);
    var nSamples = Sm(sp.sessionEnd) - Sm(sp.sessionStart);
    if (nFrames <= 0 && nSamples <= 0) return;
    var vfile = 'v' + id + '.ts', afile = 'a' + id + '.wav';
    var spanSec = (sp.sessionEnd - sp.sessionStart) / 1000;

    if (nFrames > 0) {
      if (sp.type === 'play') {
        jobs.push({ label: 'picture ' + (i + 1), produces: vfile, args: ['-ss', clampSec(sp.movieStart).toFixed(3), '-i', 'movie.in', '-an',
          '-vf', 'scale=' + width + ':' + height + ':flags=bicubic,setsar=1,fps=' + FPS + ',tpad=stop_mode=clone:stop_duration=' + Math.ceil(spanSec + 1) + ',format=yuv420p',
          '-frames:v', String(nFrames)].concat(enc, ts, [vfile]) });
      } else {
        var png = 'f' + id + '.png';
        jobs.push({ label: 'frozen frame ' + (i + 1), produces: png, args: ['-ss', clampSec(sp.movieAt).toFixed(3), '-i', 'movie.in', '-an', '-frames:v', '1',
          '-vf', 'scale=' + width + ':' + height + ':flags=bicubic,setsar=1', png] });
        jobs.push({ label: 'frozen picture ' + (i + 1), produces: vfile, args: ['-loop', '1', '-framerate', String(FPS), '-i', png, '-an',
          '-vf', 'format=yuv420p', '-frames:v', String(nFrames)].concat(enc, ts, [vfile]) });
      }
      videoList.push(vfile);
    }
    if (nSamples > 0) {
      var atrim = 'atrim=end_sample=' + nSamples;
      var tsec = (nSamples / SR + 0.05).toFixed(3);
      if (sp.type === 'play' && movieInfo.hasAudio) {
        jobs.push({ label: 'movie sound ' + (i + 1), produces: afile, args: ['-ss', clampSec(sp.movieStart).toFixed(3), '-i', 'movie.in', '-vn',
          '-af', (movieInfo.audioMono ? 'aresample=' + SR + ',pan=stereo|c0=c0|c1=c0,aformat=sample_fmts=s16'
            : 'aresample=' + SR + ',aformat=sample_fmts=s16:channel_layouts=stereo') + ',apad,' + atrim,
          '-t', tsec, '-c:a', 'pcm_s16le', '-f', 'wav', afile] });
      } else {
        jobs.push({ label: 'silence ' + (i + 1), produces: afile, args: ['-f', 'lavfi', '-i', 'anullsrc=r=' + SR + ':cl=stereo',
          '-af', 'aformat=sample_fmts=s16:channel_layouts=stereo,' + atrim,
          '-t', tsec, '-c:a', 'pcm_s16le', '-f', 'wav', afile] });
      }
      audioList.push(afile);
    }
  });
  return { jobs: jobs, videoList: videoList, audioList: audioList, width: width, height: height };
}

/* ---------- pure: the final concat + mix command ---------- */
function finalMixArgs(voiceOffsetMs, totalMs) {
  var offMs = Math.round(voiceOffsetMs || 0);
  var voiceChain = 'highpass=f=80,aresample=' + SR + ',aformat=channel_layouts=mono,pan=stereo|c0=c0|c1=c0';
  if (offMs > 0) voiceChain += ',adelay=' + offMs + '|' + offMs;
  else if (offMs < 0) voiceChain += ',atrim=start=' + (-offMs / 1000) + ',asetpts=PTS-STARTPTS';
  var fc = [
    '[1:a]aresample=' + SR + ',aformat=sample_fmts=fltp:channel_layouts=stereo[m]',
    '[2:a]aresample=' + SR + ',aformat=sample_fmts=fltp:channel_layouts=stereo[g]',
    '[m][g]amultiply[md]',
    '[3:a]' + voiceChain + '[v]',
    '[md][v]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[mx]',
    '[mx]alimiter=limit=0.95[aout]'
  ].join(';');
  return ['-f', 'concat', '-safe', '0', '-i', 'video.txt',
    '-f', 'concat', '-safe', '0', '-i', 'audio.txt',
    '-f', 'f32le', '-ar', String(GAIN_HZ), '-ac', '2', '-i', 'gain.f32',
    '-i', 'voice.in',
    '-filter_complex', fc,
    '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
    '-t', (totalMs / 1000).toFixed(3), '-movflags', '+faststart', 'out.mp4'];
}

/* ---------- runner: only works inside a real browser tab ---------- */
// Captured synchronously, right now, while this <script> is the one actually running —
// document.currentScript stops working the instant we go async (inside a promise/await),
// so every later use of this file's own location has to go through this captured value,
// not a fresh document.currentScript lookup.
var SELF_SCRIPT_URL = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src
  : (typeof location !== 'undefined' ? location.href : '');
var VENDOR_CACHE_NAME = 'naki-ffmpeg-vendor-v1';

var NakiExport = (function () {
  var loaded = null; // the loaded FFmpeg instance, kept between exports so the 31MB core loads only once per visit

  function vendorURL(name) {
    return new URL('vendor/ffmpeg/' + name, SELF_SCRIPT_URL).href;
  }

  async function cacheVendorFilesForOffline() {
    try {
      if (!('caches' in window)) return;
      var cache = await caches.open(VENDOR_CACHE_NAME);
      var urls = ['ffmpeg.js', '814.ffmpeg.js', 'ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-util.js'].map(vendorURL);
      urls.push(SELF_SCRIPT_URL); // export-engine.js itself, so a repeat visit works offline too
      await Promise.all(urls.map(function (url) {
        return cache.match(url).then(function (hit) { return hit || fetch(url).then(function (r) { return cache.put(url, r); }); });
      }));
    } catch (e) { /* offline caching is a nice-to-have, never block export on it */ }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function ensureLoaded(onLog) {
    if (loaded) return loaded;
    if (!window.FFmpegWASM) await loadScript(vendorURL('ffmpeg.js'));
    if (!window.FFmpegUtil) await loadScript(vendorURL('ffmpeg-util.js'));
    var ffmpeg = new window.FFmpegWASM.FFmpeg();
    if (onLog) ffmpeg.on('log', function (e) { onLog(e.message || ''); });
    await ffmpeg.load({ coreURL: vendorURL('ffmpeg-core.js'), wasmURL: vendorURL('ffmpeg-core.wasm') });
    loaded = ffmpeg;
    cacheVendorFilesForOffline();
    return ffmpeg;
  }

  async function probe(ffmpeg, inputName) {
    var text = '';
    var off = function (e) { text += (e.message || '') + '\n'; };
    ffmpeg.on('log', off);
    try { await ffmpeg.exec(['-i', inputName]); } catch (e) { /* ffmpeg exits non-zero with no output file; that's expected */ }
    ffmpeg.off('log', off);
    return parseProbeInfo(text);
  }

  // opts: { height, preset, crf, voiceGainDb }
  // callbacks: onStatus(text), onProgress(0..1), onLog(line)
  async function run(movieFile, voiceBlob, plan, opts, callbacks) {
    callbacks = callbacks || {};
    var say = callbacks.onStatus || function () {};
    var prog = callbacks.onProgress || function () {};
    var log = callbacks.onLog || function () {};

    say('Starting the video engine (first time only, this can take a moment)...');
    var ffmpeg = await ensureLoaded(log);

    var util = window.FFmpegUtil;
    say('Loading your movie...');
    ffmpeg.writeFile('movie.in', await util.fetchFile(movieFile));
    say('Loading your voice recording...');
    ffmpeg.writeFile('voice.in', await util.fetchFile(voiceBlob));

    say('Reading the movie...');
    var info = await probe(ffmpeg, 'movie.in');
    if (!info.width) throw new Error('Naki could not read this movie file.');

    var built = planToJobs(plan, info, opts);
    var total = built.jobs.length;
    for (var i = 0; i < total; i++) {
      var job = built.jobs[i];
      say('Preparing part ' + (i + 1) + ' of ' + total + '...');
      prog((i / (total + 1)) * 0.85);
      await ffmpeg.exec(job.args);
    }

    ffmpeg.writeFile('video.txt', new TextEncoder().encode(built.videoList.map(function (f) { return "file '" + f + "'\n"; }).join('')));
    ffmpeg.writeFile('audio.txt', new TextEncoder().encode(built.audioList.map(function (f) { return "file '" + f + "'\n"; }).join('')));
    ffmpeg.writeFile('gain.f32', buildGainRaw(plan.movieGain && plan.movieGain.points, plan.durationMs));

    say('Mixing your voice with the movie...');
    prog(0.9);
    var offProgress = function (e) { if (e && typeof e.progress === 'number') prog(0.9 + Math.min(1, Math.max(0, e.progress)) * 0.1); };
    ffmpeg.on('progress', offProgress);
    await ffmpeg.exec(finalMixArgs((plan.voice && plan.voice.offsetMs) || 0, plan.durationMs));
    ffmpeg.off('progress', offProgress);

    say('Finishing up...');
    var data = await ffmpeg.readFile('out.mp4');

    // Free the finished session's working files so the next export starts clean
    // (the loaded engine itself is kept, so it doesn't have to reload next time).
    var cleanup = built.videoList.concat(built.audioList, ['movie.in', 'voice.in', 'video.txt', 'audio.txt', 'gain.f32', 'out.mp4']);
    for (var c = 0; c < cleanup.length; c++) { try { await ffmpeg.deleteFile(cleanup[c]); } catch (e) {} }

    prog(1);
    say('Done.');
    return new Blob([data.buffer], { type: 'video/mp4' });
  }

  return { run: run };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseProbeInfo: parseProbeInfo, buildGainRaw: buildGainRaw, planToJobs: planToJobs, finalMixArgs: finalMixArgs, FPS: FPS, SR: SR };
}
