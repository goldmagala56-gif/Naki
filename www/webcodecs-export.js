'use strict';
/*
  Naki hardware-accelerated export engine, built on WebCodecs (via the mediabunny library, hosted
  in vendor/mediabunny/ so it works offline) instead of ffmpeg.wasm.

  It renders an export plan v2 (see plan.js), so your EDITS are what get exported:
   - picture: every "play" part is drawn from the movie by TIME (so a 24 fps movie is not sped up),
     every "pause" becomes a held frame, gaps are drawn as the navy background;
   - sound: movie sound, your voice and music are mixed from the plan's audio clips, each shaped by its
     own volume curve. Sound is rendered in 20-second windows and handed to the encoder one window at a
     time, so a long movie never has to sit decoded in memory (the old version decoded the whole movie
     at once, which would crash a 2 GB phone).

  index.html tries this engine first (when isSupported() says yes) and falls back to the ffmpeg.wasm
  engine (export-engine.js) if it is unsupported or if anything here throws.

  IMPORTANT: the hardware encode path, canvas drawing and audio mixing here have only been checked
  against mediabunny's published API, not run on a real phone. Test an export on your phone.
*/

var WebCodecsExport = (function () {
  var FPS = 30;
  var AUDIO_SR = 48000;
  var WINDOW_S = 20;   // seconds of sound rendered at a time

  // Captured right now, while this script is running (document.currentScript is gone after the first await).
  var SELF_URL = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src
    : (typeof location !== 'undefined' ? location.href : '');
  var MEDIABUNNY_URL = new URL('vendor/mediabunny/mediabunny.min.mjs', SELF_URL || 'http://localhost/').href;
  var modPromise = null;

  function loadMediabunny() {
    if (!modPromise) modPromise = import(/* webpackIgnore: true */ MEDIABUNNY_URL);
    return modPromise;
  }

  // Feature check used by index.html before even attempting this engine.
  async function isSupported() {
    if (typeof VideoEncoder === 'undefined' || typeof OfflineAudioContext === 'undefined') return false;
    try {
      var M = await loadMediabunny();
      var okV = await M.canEncodeVideo('avc', { width: 1280, height: 720 });
      var okA = await M.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: AUDIO_SR });
      return !!(okV && okA);
    } catch (e) { return false; }
  }

  // Informational only: does this device report a hardware H.264 encoder?
  async function hasHardwareEncoder(width, height) {
    try {
      var support = await VideoEncoder.isConfigSupported({
        codec: 'avc1.640028', width: width || 1280, height: height || 720, hardwareAcceleration: 'prefer-hardware',
      });
      return !!(support && support.supported);
    } catch (e) { return false; }
  }

  // Same tier math as export-engine.js's planToJobs.
  function targetSize(tier, vertical, movieW, movieH) {
    var width, height;
    if (vertical) {
      width = tier;
      height = Math.max(2, Math.round(tier * 16 / 9 / 2) * 2);
    } else {
      height = tier;
      width = Math.max(2, Math.round((tier * (movieW / movieH)) / 2) * 2);
    }
    return { width: width, height: height };
  }

  function drawWatermark(ctx, logoImg, canvasW, canvasH, corner) {
    var logoW = Math.round(canvasW * 0.16 / 2) * 2;
    var logoH = Math.round(logoW * (logoImg.height / logoImg.width));
    var m = Math.round(canvasW * 0.035);
    var pos = {
      br: [canvasW - logoW - m, canvasH - logoH - m],
      bl: [m, canvasH - logoH - m],
      tr: [canvasW - logoW - m, m],
      tl: [m, m],
    }[corner || 'br'];
    ctx.drawImage(logoImg, pos[0], pos[1], logoW, logoH);
  }

  /* ---------- sound ---------- */
  // Gain of a clip's curve at ms since the clip started (linear between points).
  function gainOfClip(points, rel) {
    if (!points || !points.length) return 1;
    if (rel <= points[0][0]) return points[0][1];
    for (var i = 1; i < points.length; i++) if (rel <= points[i][0]) {
      var a = points[i - 1], b = points[i];
      return b[0] === a[0] ? b[1] : a[1] + (b[1] - a[1]) * (rel - a[0]) / (b[0] - a[0]);
    }
    return points[points.length - 1][1];
  }
  // Applies a clip's curve to a GainNode's parameter, for a window that starts at winStartMs.
  function automate(param, points, clipStartMs, winStartMs, winMs) {
    param.setValueAtTime(gainOfClip(points, winStartMs - clipStartMs), 0);
    for (var i = 0; i < points.length; i++) {
      var t = (clipStartMs + points[i][0] - winStartMs) / 1000;
      if (t > 0 && t <= winMs / 1000) param.linearRampToValueAtTime(points[i][1], t);
    }
  }

  async function decodeWhole(blob) {
    var tmp = new OfflineAudioContext(2, 1, AUDIO_SR);
    return tmp.decodeAudioData(await blob.arrayBuffer());
  }

  // Renders the whole session's sound, one window at a time, straight into the encoder.
  async function renderAudio(M, plan, sources, audioSource, prog) {
    var clips = plan.audio || [];
    var voiceBuf = null, musicBuf = null, movieSink = null;
    if (sources.voiceBlob && clips.some(function (c) { return c.src === 'voice'; })) {
      try { voiceBuf = await decodeWhole(sources.voiceBlob); } catch (e) { voiceBuf = null; }
    }
    if (sources.musicFile && clips.some(function (c) { return c.src === 'music'; })) {
      try { musicBuf = await decodeWhole(sources.musicFile); } catch (e) { musicBuf = null; }
    }
    if (sources.movieAudioTrack && clips.some(function (c) { return c.src === 'movie'; })) {
      movieSink = new M.AudioBufferSink(sources.movieAudioTrack);
    }

    var totalSamples = Math.round(plan.durationMs / 1000 * AUDIO_SR);
    var stepSamples = WINDOW_S * AUDIO_SR;
    for (var pos = 0; pos < totalSamples; pos += stepSamples) {
      var n = Math.min(stepSamples, totalSamples - pos);
      var winStartMs = pos / AUDIO_SR * 1000, winMs = n / AUDIO_SR * 1000, winEndMs = winStartMs + winMs;
      var ctx = new OfflineAudioContext(2, n, AUDIO_SR);
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 80;
      hp.connect(ctx.destination);

      for (var i = 0; i < clips.length; i++) {
        var c = clips[i];
        var cEnd = c.startMs + c.durMs;
        if (c.startMs >= winEndMs || cEnd <= winStartMs) continue;
        var oStart = Math.max(c.startMs, winStartMs), oEnd = Math.min(cEnd, winEndMs);
        var gainNode = ctx.createGain();
        gainNode.connect(c.src === 'voice' ? hp : ctx.destination);
        automate(gainNode.gain, c.points, c.startMs, winStartMs, winMs);

        var inStartSec = (c.inMs + (oStart - c.startMs)) / 1000;
        var spanSec = (oEnd - oStart) / 1000;
        if (c.src === 'voice' || c.src === 'music') {
          var buf = c.src === 'voice' ? voiceBuf : musicBuf;
          if (!buf || inStartSec >= buf.duration) continue;
          var src = ctx.createBufferSource();
          src.buffer = buf; src.connect(gainNode);
          src.start((oStart - winStartMs) / 1000, inStartSec, Math.min(spanSec, buf.duration - inStartSec));
        } else if (movieSink) {
          // decode only the little piece of movie sound this window needs
          for await (var wrapped of movieSink.buffers(inStartSec, inStartSec + spanSec)) {
            var cut = Math.max(0, inStartSec - wrapped.timestamp);          // buffer began before our piece
            var sessSec = c.startMs / 1000 + (wrapped.timestamp - c.inMs / 1000) + cut;
            var when = sessSec - winStartMs / 1000;
            var len = Math.min(wrapped.buffer.duration - cut, oEnd / 1000 - sessSec);
            if (len <= 0 || when < 0) continue;
            var ms = ctx.createBufferSource();
            ms.buffer = wrapped.buffer; ms.connect(gainNode);
            ms.start(when, cut, len);
          }
        }
      }
      var mixed = await ctx.startRendering();
      await audioSource.add(mixed);
      prog(0.85 + Math.min(1, (pos + n) / totalSamples) * 0.12);
    }
  }

  /* ---------- the export ---------- */
  // opts: { height, vertical, quality: 'faster'|'sharper', logoFile, logoCorner, musicFile }
  // callbacks: onStatus(text), onProgress(0..1)
  async function run(movieFile, voiceBlob, plan, opts, callbacks) {
    callbacks = callbacks || {};
    var say = callbacks.onStatus || function () {};
    var prog = callbacks.onProgress || function () {};
    opts = opts || {};

    say('Starting the video engine...');
    var M = await loadMediabunny();

    say('Reading your movie...');
    var input = new M.Input({ source: new M.BlobSource(movieFile), formats: M.ALL_FORMATS });
    var videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('Naki could not read this movie file.');
    var audioTrack = await input.getPrimaryAudioTrack();
    var sink = new M.VideoSampleSink(videoTrack);

    var tier = opts.height || 720;
    var size = targetSize(tier, !!opts.vertical, videoTrack.codedWidth || 1280, videoTrack.codedHeight || 720);

    var canvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(size.width, size.height) : document.createElement('canvas');
    if (!(typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas)) { canvas.width = size.width; canvas.height = size.height; }
    var ctx = canvas.getContext('2d');

    var logoImg = null;
    if (opts.logoFile) {
      say('Loading your logo...');
      logoImg = await createImageBitmap(opts.logoFile);
    }

    function paintBackground() {
      ctx.fillStyle = '#111b24';
      ctx.fillRect(0, 0, size.width, size.height);
    }
    function drawSampleFit(sample) {
      paintBackground();
      sample.drawWithFit(ctx, { fit: opts.vertical ? 'contain' : 'fill' });
      if (logoImg) drawWatermark(ctx, logoImg, size.width, size.height, opts.logoCorner);
    }

    var output = new M.Output({ format: new M.Mp4OutputFormat(), target: new M.BufferTarget() });
    var quality = opts.quality === 'sharper' ? M.QUALITY_HIGH : M.QUALITY_MEDIUM;
    var videoSource = new M.CanvasSource(canvas, {
      codec: 'avc', quality: quality, hardwareAcceleration: 'prefer-hardware', latencyMode: 'realtime',
    });
    output.addVideoTrack(videoSource);
    var audioSource = new M.AudioBufferSource({ codec: 'aac', quality: M.QUALITY_HIGH });
    output.addAudioTrack(audioSource);
    await output.start();

    say('Rendering video...');
    var totalFrames = 0;
    plan.video.forEach(function (sp) { totalFrames += Math.max(0, Math.round((sp.sessionEnd - sp.sessionStart) * FPS / 1000)); });
    if (!totalFrames) totalFrames = 1;
    var framesDone = 0;

    for (var s = 0; s < plan.video.length; s++) {
      var sp = plan.video[s];
      var nFrames = Math.max(0, Math.round((sp.sessionEnd - sp.sessionStart) * FPS / 1000));
      if (nFrames <= 0) continue;

      if (sp.type === 'play') {
        var i = 0;
        var startSec = sp.movieStart / 1000;
        // one requested timestamp per OUTPUT frame, so a 24 fps movie is sampled at 30 fps by time
        var stamps = (function* () {
          for (var k = 0; k < nFrames; k++) yield startSec + k / FPS;
        })();
        for await (var sample of sink.samplesAtTimestamps(stamps)) {
          if (sample) { drawSampleFit(sample); sample.close(); }   // null => keep the last drawn frame
          var t = (sp.sessionStart + i * 1000 / FPS) / 1000;
          await videoSource.add(t, 1 / FPS);
          i++; framesDone++;
        }
        while (i < nFrames) {   // safety net if the source ended early
          var t2 = (sp.sessionStart + i * 1000 / FPS) / 1000;
          await videoSource.add(t2, 1 / FPS);
          i++; framesDone++;
        }
      } else {
        if (sp.type === 'freeze') {
          var held = await sink.getSample(sp.movieAt / 1000);
          if (held) { drawSampleFit(held); held.close(); } else paintBackground();
        } else {   // 'black': the navy background (and the logo, if any)
          paintBackground();
          if (logoImg) drawWatermark(ctx, logoImg, size.width, size.height, opts.logoCorner);
        }
        for (var j = 0; j < nFrames; j++) {
          var tf = (sp.sessionStart + j * 1000 / FPS) / 1000;
          // Each add() re-captures the SAME unchanged canvas; see the note in the earlier version:
          // capturing fresh from the canvas avoids confusing the encoder's reorder buffer.
          await videoSource.add(tf, 1 / FPS);
          framesDone++;
        }
      }
      prog(0.05 + (framesDone / totalFrames) * 0.8);
      say('Rendering video... ' + Math.round((s + 1) / plan.video.length * 100) + '%');
    }
    videoSource.close();

    say('Mixing your voice with the movie...');
    prog(0.85);
    await renderAudio(M, plan, { movieAudioTrack: audioTrack, voiceBlob: voiceBlob, musicFile: opts.musicFile }, audioSource, prog);
    audioSource.close();

    say('Finishing up...');
    prog(0.98);
    await output.finalize();
    if (input.dispose) input.dispose();

    prog(1); say('Done.');
    return new Blob([output.target.buffer], { type: 'video/mp4' });
  }

  return { isSupported: isSupported, hasHardwareEncoder: hasHardwareEncoder, run: run,
    _test: { gainOfClip: gainOfClip, automate: automate, targetSize: targetSize, renderAudio: renderAudio } };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebCodecsExport: WebCodecsExport };
}