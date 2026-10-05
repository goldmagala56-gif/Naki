'use strict';
/*
  Naki hardware-accelerated export engine, built on WebCodecs (via the mediabunny library, hosted
  in vendor/mediabunny/ so it works offline) instead of ffmpeg.wasm.

  It renders an export plan v2 (see plan.js), so your EDITS are what get exported:
   - picture: every "play" part is drawn from the movie by TIME, every "pause" becomes a held frame,
     gaps are drawn as the navy background. Each frame is composed on a canvas: the picture (with its
     zoom / turn / flip, opacity and colour look), then fade-to-black, then the logo, then titles.
   - sound: movie sound, your voice and music are mixed from the plan's audio clips, each shaped by its
     own volume curve, in 20-second windows so a long movie never sits decoded in memory.

  index.html tries this engine first (when isSupported() and canRender(plan) say yes) and falls back to
  the ffmpeg.wasm engine (export-engine.js) if it is unsupported, if the edits need something only that
  engine can do (speed changes, or colour filters on a browser whose canvas cannot filter), or if
  anything here throws.

  The picture geometry (layout) matches the editor preview and export-engine.js: flip, then turn, then
  zoom into what you see. Fade goes to BLACK, like export-engine.js.

  IMPORTANT: the hardware encode path, canvas drawing and audio mixing here have only been checked
  against mediabunny's published API and mock canvases, not run on a real phone. Test an export on your phone.
*/

var WebCodecsExport = (function () {
  var LK = (typeof module !== 'undefined' && module.exports) ? require('./look.js') : window.NakiLook;
  var FPS = 30;
  var AUDIO_SR = 48000;
  var WINDOW_S = 20;   // seconds of sound rendered at a time
  var NAVY = '#111b24';
  var TITLE_POS = { top: 0.07, center: 0.40, bottom: 0.76 };   // same numbers as plan.js / the editor preview

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

  function makeCanvas(w, h) {
    var c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Not every browser's canvas can apply brightness / contrast / saturate (older Safari cannot).
  // Tested by really drawing, because reading ctx.filter back says nothing.
  var filterOk = null;
  function filterSupported() {
    if (filterOk !== null) return filterOk;
    try {
      var g = makeCanvas(2, 2).getContext('2d');
      g.filter = 'brightness(0)'; g.fillStyle = '#fff'; g.fillRect(0, 0, 2, 2);
      filterOk = g.getImageData(0, 0, 1, 1).data[0] < 10;
    } catch (e) { filterOk = false; }
    return filterOk;
  }

  function neutralFilter(f) {
    return !f || ((f.brightness == null || f.brightness === 1) && (f.contrast == null || f.contrast === 1) && (f.saturate == null || f.saturate === 1));
  }

  // Can this engine draw every edit in the plan? Speed changes stay on the ffmpeg engine because the sound has to
  // change speed without changing pitch, which Web Audio cannot do. Colour filters need a canvas that can filter.
  function canRender(plan) {
    if ((plan.video || []).some(function (s) { return s.speed && s.speed !== 1; })) return false;
    if ((plan.video || []).some(function (s) { return s.reverse; }) || (plan.audio || []).some(function (a) { return a.reverse; })) return false;   // reversed clips are made by the ffmpeg engine
    if ((plan.video || []).some(function (s) { return s.filter && s.filter.sharpen > 0; })) return false;   // sharpen only exists in the ffmpeg engine
    if ((plan.audio || []).some(function (a) { return a.speed && a.speed !== 1; })) return false;
    if ((plan.video || []).some(function (s) { return !neutralFilter(s.filter); }) && !filterSupported()) return false;
    return true;
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

  /* ---------- picture geometry ---------- */
  function contain(iw, ih, W, H) {
    var s = Math.min(W / iw, H / ih), w = iw * s, h = ih * s;
    return { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h };
  }
  // Where and how big to draw a picture of size iw x ih into a W x H frame, given a clip's transform
  // ({ zoom, x, y, rot, flipH }). Landscape: the picture fills the frame, or (turned on its side) is fitted
  // inside it with navy bars, and zoom works on the whole frame. Vertical: the picture is fitted inside the
  // tall frame, and zoom works inside the picture only.
  function layout(t, W, H, vertical, iw, ih) {
    t = t || {};
    var z = t.zoom || 1, rot = t.rot || 0, sideways = rot === 90 || rot === 270;
    var rw = sideways ? ih : iw, rh = sideways ? iw : ih;                     // size after turning
    var D = (!vertical && !sideways) ? { x: 0, y: 0, w: W, h: H } : contain(rw, rh, W, H);
    var box = vertical ? D : { x: 0, y: 0, w: W, h: H };
    return {
      zoom: z, rot: rot, flip: !!t.flipH,
      panX: 0 - (t.x || 0) * (z - 1) * 0.5 * box.w, panY: 0 - (t.y || 0) * (z - 1) * 0.5 * box.h,
      dw: sideways ? D.h : D.w, dh: sideways ? D.w : D.h,                     // size to draw the UNTURNED picture
      clip: (vertical && z > 1) ? box : null, fillFrame: !vertical
    };
  }
  function filterCss(f) { return 'brightness(' + f.brightness + ') contrast(' + f.contrast + ') saturate(' + f.saturate + ')'; }

  // Draws one picture (flip, turn, zoom, opacity, colour look) onto g. img is anything drawImage accepts.
  function drawPicture(g, img, iw, ih, W, H, vertical, sp) {
    var L = layout(sp.transform, W, H, vertical, iw, ih);
    g.save();
    if (L.clip) { g.beginPath(); g.rect(L.clip.x, L.clip.y, L.clip.w, L.clip.h); g.clip(); }
    if (sp.opacity != null && sp.opacity < 1) g.globalAlpha = Math.max(0, sp.opacity);
    if (!neutralFilter(sp.filter)) g.filter = filterCss(Object.assign({ brightness: 1, contrast: 1, saturate: 1 }, sp.filter));
    g.translate(W / 2 + L.panX, H / 2 + L.panY);
    g.scale(L.zoom, L.zoom);
    if (L.fillFrame) { g.fillStyle = NAVY; g.fillRect(-W / 2, -H / 2, W, H); }   // the bars move with the zoom
    g.rotate(L.rot * Math.PI / 180);
    if (L.flip) g.scale(-1, 1);
    g.drawImage(img, -L.dw / 2, -L.dh / 2, L.dw, L.dh);
    g.restore();
  }

  // The "More adjust" colour layers (look.js), laid over the picture in the same order as the ffmpeg engine:
  // warmth (multiplies the colours), faded look (a light grey veil), then the vignette (a dark ring).
  function applyExtras(g, f, W, H) {
    if (!LK) return;   // look.js is not loaded: the looks cannot be drawn
    var x = LK.extras(f);
    if (x.warmth) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = LK.tintCss(x.warmth); g.fillRect(0, 0, W, H); g.restore(); }
    if (x.matte) { g.fillStyle = LK.matteCss(x.matte); g.fillRect(0, 0, W, H); }
    if (x.vignette) {
      var gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W / 2, H / 2));
      LK.vignetteStops(x.vignette).forEach(function (st) { gr.addColorStop(st[0], 'rgba(0,0,0,' + st[1] + ')'); });
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
  }

  // How visible the picture is at relMs into its part, from its fade in / fade out (1 = fully, 0 = black).
  function fadeLevel(sp, relMs) {
    var span = sp.sessionEnd - sp.sessionStart, o = 1;
    if (sp.vFadeIn && relMs < sp.vFadeIn) o = Math.min(o, relMs / sp.vFadeIn);
    if (sp.vFadeOut && span - relMs < sp.vFadeOut) o = Math.min(o, (span - relMs) / sp.vFadeOut);
    return Math.max(0, Math.min(1, o));
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

  // Titles: same drawing as export-engine.js (wrapped to 88% of the width, same heights as the editor preview).
  function drawTitle(g, t, W, H) {
    var px = Math.max(10, Math.round((t.size || 7) / 100 * H));
    g.font = (t.weight || 700) + ' ' + px + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'top';
    var maxW = W * 0.88, lines = [];
    String(t.text || '').split('\n').forEach(function (par) {
      var line = '';
      par.split(' ').forEach(function (w) {
        var test = line ? line + ' ' + w : w;
        if (line && g.measureText(test).width > maxW) { lines.push(line); line = w; } else line = test;
      });
      lines.push(line);
    });
    var lh = Math.round(px * 1.2), y0 = Math.round((TITLE_POS[t.pos] != null ? TITLE_POS[t.pos] : TITLE_POS.bottom) * H);
    if (t.bg) {
      var widest = 0; lines.forEach(function (l) { widest = Math.max(widest, g.measureText(l).width); });
      var bw = Math.min(W, widest + px * 0.8);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(Math.round(W / 2 - bw / 2), Math.round(y0 - px * 0.2), Math.round(bw), Math.round(lines.length * lh + px * 0.4));
    }
    g.fillStyle = t.color || '#ffffff';
    g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = Math.max(2, px * 0.08); g.shadowOffsetY = Math.max(1, px * 0.04);
    lines.forEach(function (l, i) { g.fillText(l, W / 2, y0 + i * lh); });
    return lines;
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
    var W = size.width, H = size.height, vertical = !!opts.vertical;

    var canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');       // what the encoder sees
    var layer = makeCanvas(W, H), lctx = layer.getContext('2d');        // the picture part of the current frame

    var logoImg = null;
    if (opts.logoFile) {
      say('Loading your logo...');
      logoImg = await createImageBitmap(opts.logoFile);
    }
    // each title is drawn once onto its own transparent picture, then laid over the frames it shows in
    var titles = (plan.texts || []).filter(function (t) { return t && String(t.text || '').trim(); }).map(function (t) {
      var c = makeCanvas(W, H); drawTitle(c.getContext('2d'), t, W, H);
      return { c: c, a: t.startMs, b: t.startMs + t.durMs };
    });

    // paints the picture part: navy, then the picture with its flip / turn / zoom / opacity / look
    function paintLayer(img, iw, ih, sp) {
      lctx.fillStyle = NAVY; lctx.fillRect(0, 0, W, H);
      if (img) { drawPicture(lctx, img, iw, ih, W, H, vertical, sp); applyExtras(lctx, sp.filter, W, H); }
    }
    function paintSample(sample, sp) {
      var img = sample.toCanvasImageSource();   // must be used right now, before the sample is closed
      paintLayer(img, sample.displayWidth || img.displayWidth || img.width, sample.displayHeight || img.displayHeight || img.height, sp);
    }
    // puts one finished frame on the encoder's canvas: picture, fade to black, logo, titles
    function compose(sp, tMs) {
      ctx.globalAlpha = 1;
      ctx.drawImage(layer, 0, 0);
      var lv = fadeLevel(sp, tMs - sp.sessionStart);
      if (lv < 1) { ctx.globalAlpha = 1 - lv; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      if (logoImg) drawWatermark(ctx, logoImg, W, H, opts.logoCorner);
      for (var k = 0; k < titles.length; k++) if (tMs >= titles[k].a && tMs < titles[k].b) ctx.drawImage(titles[k].c, 0, 0);
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
          if (sample) { paintSample(sample, sp); sample.close(); }   // null => keep the last picture
          var t = sp.sessionStart + i * 1000 / FPS;
          compose(sp, t);
          await videoSource.add(t / 1000, 1 / FPS);
          i++; framesDone++;
        }
        while (i < nFrames) {   // safety net if the source ended early
          var t2 = sp.sessionStart + i * 1000 / FPS;
          compose(sp, t2);
          await videoSource.add(t2 / 1000, 1 / FPS);
          i++; framesDone++;
        }
      } else {
        if (sp.type === 'freeze') {
          var held = await sink.getSample(sp.movieAt / 1000);
          if (held) { paintSample(held, sp); held.close(); } else paintLayer(null, 0, 0, sp);
        } else {   // 'black': the navy background (and the logo, if any)
          paintLayer(null, 0, 0, sp);
        }
        for (var j = 0; j < nFrames; j++) {
          var tf = sp.sessionStart + j * 1000 / FPS;
          compose(sp, tf);   // redrawn every frame, because fades and titles can change from frame to frame
          await videoSource.add(tf / 1000, 1 / FPS);
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

  return { isSupported: isSupported, canRender: canRender, hasHardwareEncoder: hasHardwareEncoder, run: run,
    _test: { gainOfClip: gainOfClip, automate: automate, targetSize: targetSize, renderAudio: renderAudio,
      layout: layout, drawPicture: drawPicture, applyExtras: applyExtras, fadeLevel: fadeLevel, drawTitle: drawTitle,
      setFilterSupport: function (v) { filterOk = v; } } };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebCodecsExport: WebCodecsExport };
}