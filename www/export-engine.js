'use strict';
/*
  Naki in-app export engine, ffmpeg.wasm version (the fallback when hardware export is unavailable).

  Turns a finished, possibly EDITED session into one MP4, entirely on this device, using ffmpeg.wasm
  (the single-thread build, which needs no special server settings, so it works on GitHub Pages).
  It renders an export plan v2 (see plan.js):
   - video: each "play" part is cut from the movie, each "pause" becomes a held frame, gaps are black;
   - audio: every audio clip (movie sound, your voice, music) is cut from its source, shaped by its own
     volume curve (ducking, fades, mute) and placed on its track; the tracks are then mixed.

  Two halves:
  - Pure functions (parseProbeInfo, planToJobs, buildGainRaw, finalMixArgs) that do no I/O and are
    covered by tests/export-engine.test.js.
  - The runner (NakiExport.run) that drives ffmpeg.wasm. It only works in a real browser.
*/

var FPS = 30;
var SR = 48000;
var GAIN_HZ = 1000;

/* ---------- pure: parse ffmpeg's own "-i" log text for basic movie info ---------- */
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

/* ---------- pure: a volume curve as a raw float file ffmpeg can read ---------- */
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
function fitFilter(outW, outH, vertical) {
  return vertical
    ? 'scale=' + outW + ':' + outH + ':force_original_aspect_ratio=decrease:flags=bicubic,pad=' + outW + ':' + outH + ':(ow-iw)/2:(oh-ih)/2:color=0x111b24'
    : 'scale=' + outW + ':' + outH + ':flags=bicubic';
}

function watermarkFilter(outW, corner, marginRatio) {
  var logoW = Math.round(outW * 0.16 / 2) * 2;
  var m = Math.round(outW * (marginRatio != null ? marginRatio : 0.035));
  var pos = { br: 'W-w-' + m + ':H-h-' + m, bl: m + ':H-h-' + m, tr: 'W-w-' + m + ':' + m, tl: m + ':' + m }[corner || 'br'];
  return { logoW: logoW, overlayPos: pos };
}

var SRC_FILE = { movie: 'movie.in', voice: 'voice.in', music: 'music.in' };

// Audio cleanup applied to each source before its volume curve.
function sourceChain(src, movieInfo) {
  var base = 'aresample=' + SR;
  if (src === 'movie') {
    return base + (movieInfo.audioMono ? ',pan=stereo|c0=c0|c1=c0' : ',aformat=channel_layouts=stereo');
  }
  if (src === 'voice') return 'highpass=f=80,' + base + ',aformat=channel_layouts=mono,pan=stereo|c0=c0|c1=c0';
  return base + ',aformat=channel_layouts=stereo';
}

function planToJobs(plan, movieInfo, opts) {
  opts = opts || {};
  var tier = opts.height || 480;
  var preset = opts.preset || 'veryfast';
  var crf = opts.crf != null ? opts.crf : 26;
  var vertical = !!opts.vertical;
  var width, height;
  if (vertical) {
    width = tier;
    height = Math.max(2, Math.round(tier * 16 / 9 / 2) * 2);
  } else {
    height = tier;
    width = Math.max(2, Math.round((tier * (movieInfo.width * movieInfo.sar / movieInfo.height)) / 2) * 2);
  }
  var wm = opts.hasLogo ? watermarkFilter(width, opts.logoCorner) : null;
  var R = function (ms) { return Math.round(ms * FPS / 1000); };
  var Sm = function (ms) { return Math.round(ms * SR / 1000); };
  var enc = ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-profile:v', 'main', '-g', String(FPS * 2), '-r', String(FPS)];
  var ts = ['-f', 'mpegts', '-muxdelay', '0', '-muxpreload', '0'];
  var maxMovieSec = Math.max(0, (plan.movie && plan.movie.durationMs ? plan.movie.durationMs / 1000 : movieInfo.durationSec) - 0.1);
  var clampSec = function (ms) { return Math.max(0, Math.min(ms / 1000, maxMovieSec || ms / 1000)); };

  function pictureArgs(sourceArgs, fitChain, nFrames, vfile) {
    var tailEnc = enc.concat(ts, [vfile]);
    if (!wm) {
      return sourceArgs.concat(['-an', '-vf', fitChain + ',setsar=1,fps=' + FPS + ',format=yuv420p', '-frames:v', String(nFrames)], tailEnc);
    }
    var fc = '[0:v]' + fitChain + ',setsar=1,fps=' + FPS + ',format=yuv420p[base];' +
      '[1:v]scale=' + wm.logoW + ':-1[wm];[base][wm]overlay=' + wm.overlayPos + '[outv]';
    return sourceArgs.concat(['-i', 'logo.png', '-an', '-filter_complex', fc, '-map', '[outv]', '-frames:v', String(nFrames)], tailEnc);
  }

  var jobs = [], videoList = [];
  var fit = fitFilter(width, height, vertical);

  /* --- picture --- */
  plan.video.forEach(function (sp, i) {
    var id = String(i).padStart(4, '0');
    var nFrames = R(sp.sessionEnd) - R(sp.sessionStart);
    if (nFrames <= 0) return;
    var vfile = 'v' + id + '.ts';
    var spanSec = (sp.sessionEnd - sp.sessionStart) / 1000;
    if (sp.type === 'play') {
      var playFit = fit + ',tpad=stop_mode=clone:stop_duration=' + Math.ceil(spanSec + 1);
      jobs.push({ label: 'picture ' + (i + 1), produces: vfile,
        args: pictureArgs(['-ss', clampSec(sp.movieStart).toFixed(3), '-i', 'movie.in'], playFit, nFrames, vfile) });
    } else if (sp.type === 'freeze') {
      var png = 'f' + id + '.png';
      jobs.push({ label: 'frozen frame ' + (i + 1), produces: png, args: ['-ss', clampSec(sp.movieAt).toFixed(3), '-i', 'movie.in', '-an', '-frames:v', '1',
        '-vf', fit + ',setsar=1', png] });
      jobs.push({ label: 'frozen picture ' + (i + 1), produces: vfile,
        args: pictureArgs(['-loop', '1', '-framerate', String(FPS), '-i', png], 'null', nFrames, vfile) });
    } else {
      jobs.push({ label: 'blank picture ' + (i + 1), produces: vfile,
        args: pictureArgs(['-f', 'lavfi', '-i', 'color=c=0x111b24:s=' + width + 'x' + height + ':r=' + FPS], 'null', nFrames, vfile) });
    }
    videoList.push(vfile);
  });

  /* --- sound: one lane per source, made of clip files and silent gaps --- */
  var lanes = { movie: [], voice: [], music: [] }, cursor = { movie: 0, voice: 0, music: 0 };
  var totalSamples = Sm(plan.durationMs);
  function silence(name, samples) {
    return { label: 'silence', produces: name, args: ['-f', 'lavfi', '-i', 'anullsrc=r=' + SR + ':cl=stereo',
      '-af', 'aformat=sample_fmts=s16:channel_layouts=stereo,atrim=end_sample=' + samples,
      '-t', (samples / SR + 0.05).toFixed(3), '-c:a', 'pcm_s16le', '-f', 'wav', name] };
  }
  (plan.audio || []).forEach(function (c, i) {
    var src = c.src;
    if (!lanes[src] || (src === 'movie' && !movieInfo.hasAudio)) return;
    var startS = Math.max(Sm(c.startMs), cursor[src]);
    var n = Sm(c.startMs + c.durMs) - startS;
    if (n <= 0) return;
    var id = String(i).padStart(4, '0');
    if (startS > cursor[src]) {
      var gname = 's' + src[0] + id + '.wav';
      jobs.push(silence(gname, startS - cursor[src]));
      lanes[src].push(gname);
    }
    var afile = 'a' + src[0] + id + '.wav', gfile = 'g' + id + '.f32';
    var lostMs = (startS - Sm(c.startMs)) * 1000 / SR;   // only non-zero if clips overlapped
    var fc = '[0:a]' + sourceChain(src, movieInfo) + ',aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=end_sample=' + n + '[a];' +
      '[1:a]aresample=' + SR + ',aformat=sample_fmts=fltp:channel_layouts=stereo[g];' +
      '[a][g]amultiply,aformat=sample_fmts=s16:channel_layouts=stereo[o]';
    var files = {}; files[gfile] = buildGainRaw(c.points, c.durMs + lostMs);
    jobs.push({ label: 'sound ' + src + ' ' + (i + 1), produces: afile, files: files,
      args: ['-ss', clampSec(c.inMs + lostMs).toFixed(3), '-i', SRC_FILE[src],
        '-f', 'f32le', '-ar', String(GAIN_HZ), '-ac', '2', '-i', gfile,
        '-filter_complex', fc, '-map', '[o]', '-t', (n / SR + 0.05).toFixed(3), '-c:a', 'pcm_s16le', '-f', 'wav', afile] });
    lanes[src].push(afile);
    cursor[src] = startS + n;
  });
  var laneLists = {};
  Object.keys(lanes).forEach(function (src) {
    if (!lanes[src].length) return;
    if (totalSamples > cursor[src]) {
      var tail = 't' + src[0] + '.wav';
      jobs.push(silence(tail, totalSamples - cursor[src]));
      lanes[src].push(tail);
    }
    laneLists[src] = lanes[src];
  });
  return { jobs: jobs, videoList: videoList, lanes: laneLists, width: width, height: height };
}

/* ---------- pure: the final concat + mix command ---------- */
function finalMixArgs(laneNames, totalMs) {
  var args = ['-f', 'concat', '-safe', '0', '-i', 'video.txt'];
  var fc = [];
  if (!laneNames.length) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=' + SR + ':cl=stereo');
    fc.push('[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo,alimiter=limit=0.95[aout]');
  } else {
    var labels = '';
    laneNames.forEach(function (src, k) {
      args.push('-f', 'concat', '-safe', '0', '-i', 'lane_' + src + '.txt');
      fc.push('[' + (k + 1) + ':a]aresample=' + SR + ',aformat=sample_fmts=fltp:channel_layouts=stereo[l' + k + ']');
      labels += '[l' + k + ']';
    });
    fc.push(laneNames.length > 1
      ? labels + 'amix=inputs=' + laneNames.length + ':duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]'
      : labels + 'alimiter=limit=0.95[aout]');
  }
  return args.concat(['-filter_complex', fc.join(';'),
    '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
    '-t', (totalMs / 1000).toFixed(3), '-movflags', '+faststart', 'out.mp4']);
}

/* ---------- reads a File/Blob/URL into raw bytes ---------- */
async function fetchFile(file) {
  if (typeof file === 'string') {
    var b64 = /^data:.*;base64,/.exec(file);
    if (b64) {
      var raw = atob(file.slice(b64[0].length));
      var arr = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return arr;
    }
    return new Uint8Array(await (await fetch(file)).arrayBuffer());
  }
  if (typeof URL !== 'undefined' && file instanceof URL) return new Uint8Array(await (await fetch(file)).arrayBuffer());
  if (typeof Blob !== 'undefined' && file instanceof Blob) return new Uint8Array(await file.arrayBuffer());
  return new Uint8Array();
}

/* ---------- runner: only works inside a real browser tab ---------- */
var SELF_SCRIPT_URL = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src
  : (typeof location !== 'undefined' ? location.href : '');
var VENDOR_CACHE_NAME = 'naki-ffmpeg-vendor-v1';

var NakiExport = (function () {
  var loaded = null;

  function vendorURL(name) {
    return new URL('vendor/ffmpeg/' + name, SELF_SCRIPT_URL).href;
  }

  async function cacheVendorFilesForOffline() {
    try {
      if (!('caches' in window)) return;
      var cache = await caches.open(VENDOR_CACHE_NAME);
      var urls = ['ffmpeg.js', '814.ffmpeg.js', 'ffmpeg-core.js', 'ffmpeg-core.wasm'].map(vendorURL);
      urls.push(SELF_SCRIPT_URL);
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
    try { await ffmpeg.exec(['-i', inputName]); } catch (e) { /* expected: no output file */ }
    ffmpeg.off('log', off);
    return parseProbeInfo(text);
  }

  // opts: { height, preset, crf, vertical, logoFile, musicFile }
  // callbacks: onStatus(text), onProgress(0..1), onLog(line)
  async function run(movieFile, voiceBlob, plan, opts, callbacks) {
    callbacks = callbacks || {};
    var say = callbacks.onStatus || function () {};
    var prog = callbacks.onProgress || function () {};
    var log = callbacks.onLog || function () {};
    opts = opts || {};

    say('Starting the video engine (first time only, this can take a moment)...');
    var ffmpeg = await ensureLoaded(log);

    say('Loading your movie...');
    ffmpeg.writeFile('movie.in', await fetchFile(movieFile));
    say('Loading your voice recording...');
    ffmpeg.writeFile('voice.in', await fetchFile(voiceBlob));
    var extra = [];
    if (opts.musicFile) { say('Loading your music...'); ffmpeg.writeFile('music.in', await fetchFile(opts.musicFile)); extra.push('music.in'); }

    say('Reading the movie...');
    var info = await probe(ffmpeg, 'movie.in');
    if (!info.width) throw new Error('Naki could not read this movie file.');

    if (opts.logoFile) {
      say('Loading your logo...');
      ffmpeg.writeFile('logo.png', await fetchFile(opts.logoFile));
      opts = Object.assign({}, opts, { hasLogo: true });
      extra.push('logo.png');
    }

    var built = planToJobs(plan, info, opts);
    var total = built.jobs.length;
    for (var i = 0; i < total; i++) {
      var job = built.jobs[i];
      say('Preparing part ' + (i + 1) + ' of ' + total + '...');
      prog((i / (total + 1)) * 0.85);
      var names = job.files ? Object.keys(job.files) : [];
      for (var f = 0; f < names.length; f++) ffmpeg.writeFile(names[f], job.files[names[f]]);
      await ffmpeg.exec(job.args);
      for (var d = 0; d < names.length; d++) { try { await ffmpeg.deleteFile(names[d]); } catch (e) {} }
    }

    var enc = new TextEncoder(), listFiles = ['video.txt'];
    ffmpeg.writeFile('video.txt', enc.encode(built.videoList.map(function (n) { return "file '" + n + "'\n"; }).join('')));
    var laneNames = Object.keys(built.lanes);
    laneNames.forEach(function (src) {
      ffmpeg.writeFile('lane_' + src + '.txt', enc.encode(built.lanes[src].map(function (n) { return "file '" + n + "'\n"; }).join('')));
      listFiles.push('lane_' + src + '.txt');
    });

    say('Mixing your voice with the movie...');
    prog(0.9);
    var offProgress = function (e) { if (e && typeof e.progress === 'number') prog(0.9 + Math.min(1, Math.max(0, e.progress)) * 0.1); };
    ffmpeg.on('progress', offProgress);
    await ffmpeg.exec(finalMixArgs(laneNames, plan.durationMs));
    ffmpeg.off('progress', offProgress);

    say('Finishing up...');
    var data = await ffmpeg.readFile('out.mp4');

    var cleanup = built.videoList.slice();
    built.jobs.forEach(function (j) { cleanup.push(j.produces); });
    cleanup = cleanup.concat(['movie.in', 'voice.in', 'out.mp4'], listFiles, extra);
    for (var c = 0; c < cleanup.length; c++) { try { await ffmpeg.deleteFile(cleanup[c]); } catch (e) {} }

    prog(1);
    say('Done.');
    return new Blob([data.buffer], { type: 'video/mp4' });
  }

  // Turns a movie file that won't play directly into a standard MP4 (H.264 + AAC).
  async function convertToMp4(file, opts, callbacks) {
    callbacks = callbacks || {};
    var say = callbacks.onStatus || function () {};
    var prog = callbacks.onProgress || function () {};
    opts = opts || {};

    say('Starting the video engine (first time only, this can take a moment)...');
    var ffmpeg = await ensureLoaded(callbacks.onLog);

    say('Loading the file...');
    ffmpeg.writeFile('in.src', await fetchFile(file));

    say('Converting...');
    var offProgress = function (e) { if (e && typeof e.progress === 'number') prog(Math.min(1, Math.max(0, e.progress))); };
    ffmpeg.on('progress', offProgress);
    await ffmpeg.exec(['-i', 'in.src', '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', opts.preset || 'veryfast', '-crf', String(opts.crf != null ? opts.crf : 23),
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', 'out.mp4']);
    ffmpeg.off('progress', offProgress);

    say('Finishing up...');
    var data = await ffmpeg.readFile('out.mp4');
    try { await ffmpeg.deleteFile('in.src'); await ffmpeg.deleteFile('out.mp4'); } catch (e) {}
    prog(1); say('Done.');
    return new Blob([data.buffer], { type: 'video/mp4' });
  }

  return { run: run, convertToMp4: convertToMp4 };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseProbeInfo: parseProbeInfo, buildGainRaw: buildGainRaw, planToJobs: planToJobs, finalMixArgs: finalMixArgs, FPS: FPS, SR: SR };
}