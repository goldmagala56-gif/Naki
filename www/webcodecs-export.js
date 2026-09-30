'use strict';
/*
  Naki hardware-accelerated export engine, built on WebCodecs (via the mediabunny library)
  instead of ffmpeg.wasm. Real hardware video encoding from inside a browser is only reachable
  through WebCodecs -- ffmpeg.wasm is a single-threaded WASM *software* encoder, and roughly
  5-20x slower than realtime on a phone is normal for it, not a bug. This is what actually
  closes the gap with apps like CapCut/Canva, which use the device's hardware encoder chip.

  Mirrors the same rendering logic as export-engine.js (NakiExport): each "play" part of the
  session is drawn frame-by-frame from the movie, each "pause" becomes a held frame, the
  movie's own sound is lowered wherever you spoke, and your voice plays over everything.

  index.html tries this engine first (when isSupported() says yes) and falls back to the
  existing ffmpeg.wasm engine automatically if it's unsupported or if anything here throws --
  see the bExport handler. Nothing about the fallback engine changes.

  IMPORTANT: this file was built and unit-verified against the mediabunny API surface and a
  synthetic test in Node (which has no real hardware and no Canvas, so only the *shape* of the
  calls was checked there, not real device behavior or speed). The actual hardware encode path,
  the canvas-drawing path, and the audio-mixing path have NOT been run on a real device yet.
  Test thoroughly before trusting this for real exports.
*/

var WebCodecsExport = (function () {
  var FPS = 30;
  var AUDIO_SR = 48000;
  var MEDIABUNNY_URL = 'https://cdn.jsdelivr.net/npm/mediabunny@1/dist/bundles/mediabunny.mjs';
  var MB_CACHE_NAME = 'naki-mediabunny-v1';
  var modPromise = null;

  function loadMediabunny() {
    if (modPromise) return modPromise;
    modPromise = (async function () {
      // Try to serve from the Cache API first, same pattern the ffmpeg engine uses for its
      // vendor files, so this also works offline after the first successful export.
      try {
        if ('caches' in window) {
          var cache = await caches.open(MB_CACHE_NAME);
          var hit = await cache.match(MEDIABUNNY_URL);
          if (!hit) {
            var resp = await fetch(MEDIABUNNY_URL);
            if (resp.ok) await cache.put(MEDIABUNNY_URL, resp.clone());
          }
        }
      } catch (e) { /* caching is a nice-to-have, never block on it */ }
      return import(/* webpackIgnore: true */ MEDIABUNNY_URL);
    })();
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

  // Whether this device's encoder actually reports hardware acceleration for our target size.
  // Informational only (index.html can show this to the person); never blocks the export.
  async function hasHardwareEncoder(width, height) {
    try {
      var support = await VideoEncoder.isConfigSupported({
        codec: 'avc1.640028', width: width || 1280, height: height || 720, hardwareAcceleration: 'prefer-hardware',
      });
      return !!(support && support.supported);
    } catch (e) { return false; }
  }

  // Same tier math as export-engine.js's planToJobs -- landscape scales straight to the tier
  // height at the source's own aspect ratio; vertical uses the tier as the short (width) side
  // of a 9:16 canvas, letterboxed via drawWithFit's 'contain' rather than blurred/cropped.
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

  // Builds the final mixed audio track entirely with native Web Audio scheduling: each "play"
  // span becomes an AudioBufferSourceNode.start(sessionTime, movieOffset, duration) pulling
  // straight from the decoded movie audio, routed through a GainNode automated with the same
  // ducking envelope core.js already computed (plan.movieGain.points). The voice recording is
  // laid on top through a highpass filter, matching the old ffmpeg 'highpass=f=80' step. No
  // manual PCM chunking needed -- this replaces the old raw-gain-file ffmpeg filter entirely.
  async function renderAudio(plan, movieArrayBuffer, voiceArrayBuffer, movieHasAudio) {
    var totalSec = plan.durationMs / 1000;
    var offline = new OfflineAudioContext(2, Math.ceil((totalSec + 1) * AUDIO_SR), AUDIO_SR);

    var voiceBuf = await offline.decodeAudioData(voiceArrayBuffer.slice(0));
    var movieBuf = null;
    if (movieHasAudio) {
      try { movieBuf = await offline.decodeAudioData(movieArrayBuffer.slice(0)); }
      catch (e) { movieBuf = null; } // some containers' audio can fail to decode; export continues without movie sound rather than failing entirely
    }

    if (movieBuf) {
      var gainNode = offline.createGain();
      gainNode.connect(offline.destination);
      var pts = (plan.movieGain && plan.movieGain.points && plan.movieGain.points.length) ? plan.movieGain.points : [[0, 1]];
      gainNode.gain.setValueAtTime(pts[0][1], 0);
      for (var i = 1; i < pts.length; i++) {
        gainNode.gain.linearRampToValueAtTime(pts[i][1], Math.max(0.0001, pts[i][0] / 1000));
      }
      plan.video.forEach(function (sp) {
        if (sp.type !== 'play') return;
        var startSec = sp.sessionStart / 1000;
        var spanSec = (sp.sessionEnd - sp.sessionStart) / 1000;
        var movieStartSec = sp.movieStart / 1000;
        if (movieStartSec >= movieBuf.duration || spanSec <= 0) return;
        var src = offline.createBufferSource();
        src.buffer = movieBuf;
        src.connect(gainNode);
        var dur = Math.min(spanSec, movieBuf.duration - movieStartSec);
        if (dur > 0) src.start(startSec, movieStartSec, dur);
      });
    }

    var voiceHp = offline.createBiquadFilter();
    voiceHp.type = 'highpass'; voiceHp.frequency.value = 80;
    voiceHp.connect(offline.destination);
    var voiceSrc = offline.createBufferSource();
    voiceSrc.buffer = voiceBuf;
    voiceSrc.connect(voiceHp);
    var voiceOffsetSec = ((plan.voice && plan.voice.offsetMs) || 0) / 1000;
    if (voiceOffsetSec >= 0) voiceSrc.start(voiceOffsetSec, 0);
    else voiceSrc.start(0, -voiceOffsetSec);

    return offline.startRendering();
  }

  // opts: { height, vertical, quality: 'faster'|'sharper', logoFile, logoCorner }
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
    if (!(canvas instanceof OffscreenCanvas)) { canvas.width = size.width; canvas.height = size.height; }
    var ctx = canvas.getContext('2d');

    var logoImg = null;
    if (opts.logoFile) {
      say('Loading your logo...');
      logoImg = await createImageBitmap(opts.logoFile);
    }

    function drawSampleFit(sample) {
      ctx.fillStyle = '#111b24';
      ctx.fillRect(0, 0, size.width, size.height);
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
        for await (var sample of sink.samples(sp.movieStart / 1000)) {
          if (i >= nFrames) { sample.close(); break; }
          drawSampleFit(sample);
          var t = (sp.sessionStart + i * 1000 / FPS) / 1000;
          await videoSource.add(t, 1 / FPS);
          sample.close();
          i++; framesDone++;
        }
        // If the source ran out before nFrames were produced (session outlasted the movie),
        // pad with whatever's last on the canvas rather than leaving the span short.
        while (i < nFrames) {
          var t2 = (sp.sessionStart + i * 1000 / FPS) / 1000;
          await videoSource.add(t2, 1 / FPS);
          i++; framesDone++;
        }
      } else {
        var held = await sink.getSample(sp.movieAt / 1000);
        if (held) { drawSampleFit(held); held.close(); }
        for (var j = 0; j < nFrames; j++) {
          var tf = (sp.sessionStart + j * 1000 / FPS) / 1000;
          // Each add() re-captures the SAME unchanged canvas -- deliberately not redrawing
          // per frame here. An earlier prototyping pass found that repeatedly wrapping/cloning
          // an already-decoded frame for a "held" span could confuse an encoder's internal
          // reorder buffer; capturing fresh from canvas each time avoids that path entirely.
          await videoSource.add(tf, 1 / FPS);
          framesDone++;
        }
      }
      prog(0.05 + (framesDone / totalFrames) * 0.85);
      say('Rendering video... ' + Math.round((s + 1) / plan.video.length * 100) + '%');
    }
    videoSource.close();

    say('Mixing your voice with the movie...');
    prog(0.92);
    var movieBytes = await movieFile.arrayBuffer();
    var voiceBytes = await voiceBlob.arrayBuffer();
    var mixed = await renderAudio(plan, movieBytes, voiceBytes, !!audioTrack);
    await audioSource.add(mixed);
    audioSource.close();

    say('Finishing up...');
    prog(0.97);
    await output.finalize();
    if (input.dispose) input.dispose();

    prog(1); say('Done.');
    return new Blob([output.target.buffer], { type: 'video/mp4' });
  }

  return { isSupported: isSupported, hasHardwareEncoder: hasHardwareEncoder, run: run };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebCodecsExport: WebCodecsExport };
}

