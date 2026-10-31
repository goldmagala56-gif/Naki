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

var _RV = (typeof module !== 'undefined' && module.exports) ? require('./reverse.js') : window.NakiReverse;
var _FMT = (typeof module !== 'undefined' && module.exports) ? require('./format.js') : (typeof window !== 'undefined' ? window.NakiFormat : null);
var _NA = (typeof module !== 'undefined' && module.exports) ? require('./anim.js') : (typeof window !== 'undefined' ? window.NakiAnim : null);
var _FX = (typeof module !== 'undefined' && module.exports) ? require('./fx.js') : (typeof window !== 'undefined' ? window.NakiFx : null);
var _MO = (typeof module !== 'undefined' && module.exports) ? require('./motion.js') : (typeof window !== 'undefined' ? window.NakiMotion : null);
var _L2 = (typeof module !== 'undefined' && module.exports) ? require('./look2.js') : (typeof window !== 'undefined' ? window.NakiLook2 : null);
var FPS = 30;
var SR = 48000;
var GAIN_HZ = 1000;
var _LK = ((typeof module !== 'undefined' && module.exports) ? require('./look.js') : window.NakiLook) || { ffmpegExtras: function () { return []; } };

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
function fitFilter(outW, outH, vertical, padHex) {
  return vertical
    ? 'scale=' + outW + ':' + outH + ':force_original_aspect_ratio=decrease:flags=bicubic,pad=' + outW + ':' + outH + ':(ow-iw)/2:(oh-ih)/2:color=' + (padHex || '0x111b24')
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
  var ratio = opts.ratio || (opts.vertical ? '9:16' : 'original');
  var bg = _FMT ? _FMT.normalizeBg(opts.bg) : { type: 'navy', color: '#000000' };
  var vertical = ratio !== 'original';   // from here on, "vertical" means: fit the whole picture inside the frame, with space around it
  var width, height;
  if (vertical && _FMT && ratio !== '9:16') {
    var fsz = _FMT.frameSize(tier, ratio, movieInfo.width, movieInfo.height, movieInfo.sar); width = fsz.width; height = fsz.height;
  } else if (vertical) {
    width = tier;
    height = Math.max(2, Math.round(tier * 16 / 9 / 2) * 2);
  } else {
    height = tier;
    width = Math.max(2, Math.round((tier * (movieInfo.width * movieInfo.sar / movieInfo.height)) / 2) * 2);
  }
  var padHex = _FMT && bg.type === 'color' ? _FMT.ffmpegHex(bg.color) : '0x111b24', bgYUV = _FMT && bg.type === 'color' ? _FMT.yuv(bg.color) : [37, 133, 123];
  var blur = vertical && bg.type === 'blur' && !!_FMT;
  var wm = opts.hasLogo ? watermarkFilter(width, opts.logoCorner) : null;
  var R = function (ms) { return Math.round(ms * FPS / 1000); };
  var Sm = function (ms) { return Math.round(ms * SR / 1000); };
  var enc = ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-profile:v', 'main', '-g', String(FPS * 2), '-r', String(FPS)];
  var ts = ['-f', 'mpegts', '-muxdelay', '0', '-muxpreload', '0'];
  var maxMovieSec = Math.max(0, (plan.movie && plan.movie.durationMs ? plan.movie.durationMs / 1000 : movieInfo.durationSec) - 0.1);
  var clampSec = function (ms) { return Math.max(0, Math.min(ms / 1000, maxMovieSec || ms / 1000)); };
  // ---- videos added to the picture line (Add video): each part of the picture says which file it comes from (sp.asset); no asset means the original movie ----
  var assets = opts.assets || {};
  function assetOf(sp) { return sp && sp.asset && assets[sp.asset] ? assets[sp.asset] : null; }
  function fileOf(sp) { return sp && sp.asset ? sp.asset + '.in' : 'movie.in'; }
  function clampFor(sp, ms) {
    var a = assetOf(sp); if (!a) return clampSec(ms);
    var d = Math.max(0, (a.durationSec || 0) - 0.1); return Math.max(0, Math.min(ms / 1000, d || ms / 1000));
  }
  // A picture from another file is fitted inside the frame with bars when its shape is not the frame's shape.
  function baseFit(sp) {
    var a = assetOf(sp);
    if (a && a.width && a.height) {
      var asp = a.width * (a.sar || 1) / a.height, main = movieInfo.width * movieInfo.sar / movieInfo.height;
      if (Math.abs(asp / main - 1) > 0.02) return containFit;
    }
    return fit;
  }

  // Titles are drawn by the page as transparent full-size pictures (textFiles) and laid over the video
  // with ffmpeg's overlay, so ffmpeg never needs a font file.
  var texts = plan.texts || [], textFiles = [];
  texts.forEach(function (t, i) {   // a title with an animation becomes a few still pictures, each shown for its own stretch of time (see motion.js)
    var segs = (_MO && t.anim) ? _MO.textTimeline(t.anim, t.durMs, Array.from(String(t.text || '')).length) : null, nm = 'txt' + String(i).padStart(3, '0');
    if (!segs) { textFiles.push({ name: nm + '.png', clip: t, width: width, height: height }); return; }
    segs.forEach(function (sg, k) { textFiles.push({ name: nm + '_' + String(k).padStart(2, '0') + '.png', clip: Object.assign({}, t, { startMs: t.startMs + sg.a, durMs: sg.b - sg.a }), state: sg.st, width: width, height: height }); });
  });

  textFiles = (plan.stickers || []).map(function (s, i) { return { name: 'stk' + String(i).padStart(3, '0') + '.png', clip: s, sticker: true, width: width, height: height }; }).concat(textFiles);   // stickers go under the titles

  // The colour / speed / fade part of a picture chain. Empty for a plain clip.
  function lookChain(sp, spanSec) {
    var parts = [];
    var f = sp.filter;
    if (f && (f.contrast !== 1 || f.saturate !== 1)) parts.push('eq=contrast=' + f.contrast + ':saturation=' + f.saturate);
    if (f && f.brightness !== 1) parts.push("lutyuv=y='clip(val*" + f.brightness + ",16,235)'");
    if (sp.opacity != null && sp.opacity < 1) {   // mix the picture with the navy background, plane by plane (navy = Y 37, U 133, V 123)
      var o = sp.opacity, k = 1 - o;
      
      parts.push("lutyuv=y='val*" + o.toFixed(3) + '+' + (bgYUV[0] * k).toFixed(2) + "':u='val*" + o.toFixed(3) + '+' + (bgYUV[1] * k).toFixed(2) + "':v='val*" + o.toFixed(3) + '+' + (bgYUV[2] * k).toFixed(2) + "'");
    }
    (_LK.ffmpegExtras(f) || []).forEach(function (x) { parts.push(x); });
    if (_L2 && f) _L2.ffmpegAdjust(f).forEach(function (x) { parts.push(x); });
    if (sp.vFadeIn) parts.push('fade=t=in:st=0:d=' + (sp.vFadeIn / 1000).toFixed(3));
    if (sp.vFadeOut) parts.push('fade=t=out:st=' + Math.max(0, spanSec - sp.vFadeOut / 1000).toFixed(3) + ':d=' + (sp.vFadeOut / 1000).toFixed(3));
    return parts.join(',');
  }

  // sourceArgs: the input(s) for this part; fitChain: how to fit it to the output size; sp: the plan span;
  // speed: playback speed of a movie part; tpadSec: how long to keep repeating the last frame if the movie ends early.
  function pictureArgs(sourceArgs, fitChain, nFrames, vfile, sp, spanSec, speed, tpadSec, padStart) {
    var tailEnc = enc.concat(ts, [vfile]);
    var look = lookChain(sp, spanSec);
    var over = textFiles.filter(function (t) { return t.clip.startMs < sp.sessionEnd && t.clip.startMs + t.clip.durMs > sp.sessionStart; });
    var tpad = (padStart || tpadSec) ? 'tpad=' + (padStart ? 'start_mode=clone:start_duration=' + padStart.toFixed(3) + (tpadSec ? ':' : '') : '') + (tpadSec ? 'stop_mode=clone:stop_duration=' + tpadSec : '') : '';
    var isGraph = !!fitChain && typeof fitChain === 'object';
    var ovs = _NA ? overlayList.filter(function (o) { return o.startMs < sp.sessionEnd && o.startMs + o.durMs > sp.sessionStart; }) : [];
    var fxs = _L2 ? fxList.filter(function (x) { return x.startMs < sp.sessionEnd && x.startMs + x.durMs > sp.sessionStart; }) : [];   // a blurred background is a whole filter graph, not a chain
    if (!isGraph && !ovs.length && !fxs.length && !wm && !over.length && !look && !(speed && speed !== 1)) {
      // a plain clip: exactly the chain the earlier versions used
      return sourceArgs.concat(['-an', '-vf', fitChain + (tpad ? ',' + tpad : '') + ',setsar=1,fps=' + FPS + ',format=yuv420p', '-frames:v', String(nFrames)], tailEnc);
    }
    var inputs = sourceArgs.slice(), next = 1, fc = [], n = 0;
    var head = (isGraph || fitChain === 'null' ? '' : fitChain + ',') + 'setsar=1' + (speed && speed !== 1 ? ',setpts=PTS/' + speed : '') + ',fps=' + FPS +
      (tpad ? ',' + tpad : '') + ',format=yuv420p' + (look ? ',' + look : '');
    fc.push(isGraph ? fitChain.graph('[0:v]', '[f0]') + ';[f0]' + head + '[v0]' : '[0:v]' + head + '[v0]');
    var cur = 'v0';
    fxs.forEach(function (x) {
      var a0 = Math.max(0, (x.startMs - sp.sessionStart) / 1000), b0 = (Math.min(sp.sessionEnd, x.startMs + x.durMs) - sp.sessionStart) / 1000, out = 'v' + (++n);
      fc.push(_FX && _FX.vfx && _FX.vfx.has(x.fx) && !_FX.vfx.legacy(x.fx) ? _FX.vfx.graph(x, a0, b0, cur, out, width, height) : _L2.ffmpegFx(x, a0, b0, cur, out, width, height)); cur = out;
    });
    ovs.forEach(function (o) {
      var op = overlayParts(o, sp), bm = _FX && op.blend ? _FX.ffBlend(op.blend) : null;
      if (!bm) {   // the normal way: laid over the picture
        inputs.push.apply(inputs, op.inputs);
        fc.push('[' + next + ':v]' + op.chain + '[ov' + next + ']');
        fc.push('[' + cur + '][ov' + next + "]overlay=x='" + op.x + "':y='" + op.y + "':eof_action=pass:enable='between(t," + op.a.toFixed(3) + ',' + op.b.toFixed(3) + ")'[v" + (++n) + ']');
        cur = 'v' + n; next++;
        return;
      }
      // A blend mode: the overlay is put on a see-through frame the size of the picture, mixed with a copy of the picture, and that mix is laid back
      // over the picture only where the overlay is (its own see-through parts, from a mask or a key, stay see-through).
      var L = 'bm' + next, ci = next, oi = next + 1, part = ((sp.sessionEnd - sp.sessionStart) / 1000 + 1).toFixed(3);
      inputs.push('-f', 'lavfi', '-i', 'color=c=black@0:s=' + width + 'x' + height + ':r=' + FPS + ':d=' + part + ',format=rgba');   // the format inside the source is what keeps its see-through (alpha 0)
      inputs.push.apply(inputs, op.inputs);
      fc.push('[' + oi + ':v]' + op.chain + '[' + L + 'o]');
      fc.push('[' + ci + ':v][' + L + "o]overlay=x='" + op.x + "':y='" + op.y + "':eof_action=pass:format=auto[" + L + 'g]');
      fc.push('[' + cur + ']split[' + L + 's0][' + L + 's1]');
      fc.push('[' + L + 'g]split[' + L + 'ga][' + L + 'gb]');
      fc.push('[' + L + 'gb]alphaextract[' + L + 'al]');
      fc.push('[' + L + "ga]format=" + _FX.ffBlendFormat(op.blend) + '[' + L + 'gf]');
      fc.push('[' + L + "s1]format=" + _FX.ffBlendFormat(op.blend) + '[' + L + 'bf]');
      fc.push('[' + L + 'bf][' + L + 'gf]blend=' + bm + '[' + L + 'bl]');
      fc.push('[' + L + 'bl][' + L + 'al]alphamerge[' + L + 'ba]');
      fc.push('[' + L + 's0][' + L + "ba]overlay=eof_action=pass:enable='between(t," + op.a.toFixed(3) + ',' + op.b.toFixed(3) + ")'[v" + (++n) + ']');
      cur = 'v' + n; next += 2;
    });
    if (wm) {
      inputs.push('-i', 'logo.png');
      fc.push('[' + next + ':v]scale=' + wm.logoW + ':-1[wm]'); fc.push('[' + cur + '][wm]overlay=' + wm.overlayPos + '[v' + (++n) + ']');
      cur = 'v' + n; next++;
    }
    over.forEach(function (t) {
      var a = Math.max(0, (t.clip.startMs - sp.sessionStart) / 1000), b = (Math.min(sp.sessionEnd, t.clip.startMs + t.clip.durMs) - sp.sessionStart) / 1000;
      inputs.push('-i', t.name);
      fc.push('[' + cur + '][' + next + ':v]overlay=0:0:enable=\'between(t,' + a.toFixed(3) + ',' + b.toFixed(3) + ')\'[v' + (++n) + ']');
      cur = 'v' + n; next++;
    });
    return inputs.concat(['-an', '-filter_complex', fc.join(';'), '-map', '[' + cur + ']', '-frames:v', String(nFrames)], tailEnc);
  }

  var jobs = [], videoList = [];
  var fit = fitFilter(width, height, vertical, padHex);
  var containFit = fitFilter(width, height, true, padHex);   // fit inside the frame with navy bars (used when a picture is turned on its side)
  // Flip and turn first, then zoom into what is on screen, then fit to the output size. Same order as the editor preview.
  function transformFit(sp) {
    if (sp.kf && _NA) return animPre(sp) + ',' + ((sp.transform && (sp.transform.rot === 90 || sp.transform.rot === 270)) ? containFit : baseFit(sp));
    var t = sp.transform;
    if (!t) return baseFit(sp);
    var rot = t.rot || 0, parts = [], z = t.zoom || 1;
    if (t.flipH) parts.push('hflip');
    if (rot === 90) parts.push('transpose=1'); else if (rot === 180) parts.push('hflip,vflip'); else if (rot === 270) parts.push('transpose=2');
    var crop = z > 1 ? 'crop=w=trunc(iw/' + z + '/2)*2:h=trunc(ih/' + z + '/2)*2:x=(iw-ow)/2*(1+(' + (t.x || 0) + ')):y=(ih-oh)/2*(1+(' + (t.y || 0) + '))' : '';
    var sideways = rot === 90 || rot === 270;
    if (sideways && !vertical) {   // fit first, then zoom into the framed picture (the bars are part of what you see)
      parts.push(containFit); if (crop) parts.push(crop, 'scale=' + width + ':' + height + ':flags=bicubic');
    } else {
      if (crop) parts.push(crop);
      parts.push(sideways ? containFit : baseFit(sp));
    }
    return parts.join(',');
  }

  // The same flip, turn and zoom as transformFit, without the fitting (the blurred-background picture does its own fitting).
  function transformPre(sp) {
    if (sp.kf && _NA) return animPre(sp);
    var t = sp.transform; if (!t) return '';
    var rot = t.rot || 0, parts = [], z = t.zoom || 1;
    if (t.flipH) parts.push('hflip');
    if (rot === 90) parts.push('transpose=1'); else if (rot === 180) parts.push('hflip,vflip'); else if (rot === 270) parts.push('transpose=2');
    if (z > 1) parts.push('crop=w=trunc(iw/' + z + '/2)*2:h=trunc(ih/' + z + '/2)*2:x=(iw-ow)/2*(1+(' + (t.x || 0) + ')):y=(ih-oh)/2*(1+(' + (t.y || 0) + '))');
    return parts.join(',');
  }
  // How a picture is fitted to the frame: a filter chain (text), or for a blurred background a graph (an object with .graph(in, out)).
  function pictureFit(sp) {
    return blur ? { graph: function (a, b) { return _FMT.blurGraph(a, b, width, height, transformPre(sp)); } } : transformFit(sp);
  }
  function freezeFilterArgs(sp) {
    var g = pictureFit(sp);
    return typeof g === 'object' ? ['-filter_complex', g.graph('[0:v]', '[o]') + ';[o]setsar=1[o2]', '-map', '[o2]'] : ['-vf', g + ',setsar=1'];
  }

  // ---- transitions: where two touching pictures meet, each gives up half of the transition and a short piece made from both goes between ----
  var XFADE = (_FX && _FX.trans) ? _FX.trans.XFADE : { fade: 'fade', fadeblack: 'fadeblack', wipeleft: 'wipeleft', slideleft: 'slideleft', zoomin: 'zoomin', circleopen: 'circleopen' };
  function transOk(a, b) {
    return !!(a && b && b.transitionIn && XFADE[b.transitionIn.type] && a.sessionEnd === b.sessionStart && a.type !== 'black' && b.type !== 'black' && !a.reverse && !b.reverse && b.transitionIn.durMs >= 100);
  }
  var transIn = {};   // span number -> true when a transition piece goes in front of that span
  var vspans = plan.video.map(function (sp, i) {
    var c = JSON.parse(JSON.stringify(sp)), prev = plan.video[i - 1], next = plan.video[i + 1];
    var hIn = transOk(prev, sp) ? Math.ceil(sp.transitionIn.durMs / 2) : 0, hOut = transOk(sp, next) ? Math.floor(next.transitionIn.durMs / 2) : 0;
    if (hIn) transIn[i] = true;
    if (hIn || hOut) {
      c.sessionStart += hIn; c.sessionEnd -= hOut;
      if (c.kf && hIn && _NA) c.kf = _NA.shiftKf(c.kf, hIn);
      if (c.type === 'play') c.movieStart += Math.round(hIn * (c.speed && c.speed !== 1 ? c.speed : 1));
    }
    return c;
  });
  function makeTransition(i) {
    var A = plan.video[i - 1], B = plan.video[i], d = B.transitionIn.durMs, ws = B.sessionStart - Math.floor(d / 2), we = ws + d;
    var nT = R(we) - R(ws), dSec = nT / FPS, id = String(i).padStart(4, '0');
    function side(sp, idx) {   // the picture of span sp as it looks from timeline time ws for the length of the transition
      var piece = Object.assign({}, sp, { sessionStart: ws, sessionEnd: we }); delete piece.vFadeIn; delete piece.vFadeOut; delete piece.transitionIn;
      if (piece.kf && _NA) piece.kf = _NA.shiftKf(piece.kf, ws - sp.sessionStart);
      if (sp.type === 'freeze') return { piece: piece, src: ['-loop', '1', '-framerate', String(FPS), '-i', 'f' + String(idx).padStart(4, '0') + '.png'], fit: 'null', speed: 1, tpad: 0, pad: 0 };
      var speed = sp.speed && sp.speed !== 1 ? sp.speed : 1, ms = sp.movieStart + (ws - sp.sessionStart) * speed;
      return { piece: piece, src: ['-ss', clampFor(sp, Math.max(0, ms)).toFixed(3), '-i', fileOf(sp)], fit: pictureFit(piece), speed: speed, tpad: Math.ceil(dSec + 1), pad: ms < 0 ? -ms / speed / 1000 : 0 };
    }
    var a = side(A, i - 1), b = side(B, i);
    [['transition A ', 'ta', a], ['transition B ', 'tb', b]].forEach(function (x) {
      jobs.push({ label: x[0] + i, produces: x[1] + id + '.ts', args: pictureArgs(x[2].src, x[2].fit, nT, x[1] + id + '.ts', x[2].piece, dSec, x[2].speed, x[2].tpad, x[2].pad) });
    });
    jobs.push({ label: 'transition ' + i, produces: 't' + id + '.ts', args: ['-i', 'ta' + id + '.ts', '-i', 'tb' + id + '.ts', '-an',
      '-filter_complex', '[0:v][1:v]xfade=transition=' + XFADE[B.transitionIn.type] + ':duration=' + dSec.toFixed(3) + ':offset=0[x]', '-map', '[x]', '-frames:v', String(nT)].concat(enc, ts, ['t' + id + '.ts']) });
    return 't' + id + '.ts';
  }

  
// ---- animation: overlays laid over the picture, and a picture whose zoom / pan has keyframes ----
  var overlayList = (plan.overlays || []).map(function (o) { return o.gen && o.gen.full ? Object.assign({}, o, { w: width, h: height }) : o; });   // frames and spotlights cover the whole picture
  // Zoom / pan keyframes on the picture: flip and turn first, then zoompan works out the zoom and the pan for every frame from the keyframes.
  function animPre(sp) {
    var t = sp.transform || {}, rot = t.rot || 0, parts = [], kf = sp.kf || {}, spd = sp.speed && sp.speed !== 1 ? sp.speed : 1;
    if (t.flipH) parts.push('hflip');
    if (rot === 90) parts.push('transpose=1'); else if (rot === 180) parts.push('hflip,vflip'); else if (rot === 270) parts.push('transpose=2');
    var side = rot === 90 || rot === 270, mi = assetOf(sp) || movieInfo, sw = Math.max(2, Math.floor((side ? mi.height : mi.width) / 2) * 2), sh = Math.max(2, Math.floor((side ? mi.width : mi.height) / 2) * 2);
    var tv = '(on/' + FPS + ')', ex = function (k, dflt) { return kf[k] && kf[k].length ? _NA.kfExpr(kf[k], 0, spd, tv) : String(dflt); };
    parts.push('fps=' + FPS, "zoompan=z='" + ex('zoom', t.zoom || 1) + "':x='(iw-iw/zoom)/2*(1+(" + ex('x', t.x || 0) + "))':y='(ih-ih/zoom)/2*(1+(" + ex('y', t.y || 0) + "))':d=1:s=" + sw + 'x' + sh + ':fps=' + FPS);
    return parts.join(',');
  }
  // One overlay laid over a picture part: cut to the part, sized, turned and faded (changing over time when it has keyframes) and placed.
  function overlayParts(o, sp) {
    var a = Math.max(0, (o.startMs - sp.sessionStart) / 1000), b = (Math.min(sp.sessionEnd, o.startMs + o.durMs) - sp.sessionStart) / 1000, len = (b - a).toFixed(3);
    var src = o.kind === 'image' ? ['-loop', '1', '-framerate', String(FPS), '-t', len, '-i', o.gen ? o.asset + '.png' : o.asset + '.in']
      : ['-ss', ((o.inMs + Math.max(0, sp.sessionStart - o.startMs)) / 1000).toFixed(3), '-t', len, '-i', o.asset + '.in'];
    var shift = o.startMs - sp.sessionStart, kf = o.kf || {}, asp = o.w > 0 && o.h > 0 ? o.h / o.w : 9 / 16;
    var anim = function (k, tv) { return kf[k] && kf[k].length ? _NA.kfExpr(kf[k], shift, 1, tv || 't') : null; };
    var size = anim('size'), rot = anim('rot'), op = anim('opacity', 'T'), x = anim('x'), y = anim('y'), f = [];
    f.push('setpts=PTS-STARTPTS+' + a.toFixed(3) + '/TB');
    if (o.chroma && _FX) f.push(_FX.chromaFilter(o.chroma));
    if (size) f.push("scale=w='trunc(" + width + '*(' + size + ")/2)*2':h='trunc(" + width + '*(' + size + ')*' + asp.toFixed(5) + "/2)*2':eval=frame");
    else f.push('scale=' + Math.max(2, Math.round(width * o.size / 2) * 2) + ':' + Math.max(2, Math.round(width * o.size * asp / 2) * 2));
    f.push('format=rgba');
    var maskX = o.mask && _FX ? _FX.maskAlphaExpr(o.mask) : null;
    if (maskX) f.push("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(" + maskX + ")'");
    if (rot) f.push("rotate=a='(" + rot + ")*PI/180':c=none:ow='hypot(iw,ih)':oh=ow");
    else if (o.rot) { var rad = (o.rot * Math.PI / 180).toFixed(5); f.push('rotate=a=' + rad + ":c=none:ow='rotw(" + rad + ")':oh='roth(" + rad + ")'"); }
    if (op) f.push("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(" + op + ")'");
    else if (o.opacity != null && o.opacity < 1) f.push('colorchannelmixer=aa=' + o.opacity.toFixed(3));
    return { blend: o.blend, inputs: src, chain: f.join(','), x: 'main_w*(' + (x || o.x) + ')-overlay_w/2', y: 'main_h*(' + (y || o.y) + ')-overlay_h/2', a: a, b: b };
  }

  
// ---- video effects ----
  var fxList = plan.fx || [];
  
/* --- picture --- */
  vspans.forEach(function (sp, i) {
    var id = String(i).padStart(4, '0');
    var nFrames = R(sp.sessionEnd) - R(sp.sessionStart);
    if (nFrames <= 0) return;
    var vfile = 'v' + id + '.ts';
    var spanSec = (sp.sessionEnd - sp.sessionStart) / 1000;
    if (sp.type === 'play') {
      var speed = sp.speed && sp.speed !== 1 ? sp.speed : 1;
      if (sp.reverse) {
        var rv = _RV.reversePicture(sp, { id: id, nFrames: nFrames, width: width, height: height, speed: speed, fitChain: transformFit(sp), enc: enc, ts: ts, clampSec: clampSec, chunkFrames: opts.reverseChunkFrames });
        rv.jobs.forEach(function (j) { jobs.push(j); });
        jobs.push({ label: 'picture ' + (i + 1), produces: vfile, files: rv.files,
          args: pictureArgs(rv.sourceArgs, 'null', nFrames, vfile, sp, spanSec, 1, 1) });
      } else jobs.push({ label: 'picture ' + (i + 1), produces: vfile,
        args: pictureArgs(['-ss', clampFor(sp, sp.movieStart).toFixed(3), '-i', fileOf(sp)], pictureFit(sp), nFrames, vfile, sp, spanSec, speed, Math.ceil(spanSec + 1)) });
    } else if (sp.type === 'freeze') {
      var png = 'f' + id + '.png';
      jobs.push({ label: 'frozen frame ' + (i + 1), produces: png, args: ['-ss', clampFor(sp, sp.movieAt).toFixed(3), '-i', fileOf(sp), '-an', '-frames:v', '1',
        ].concat(freezeFilterArgs(sp), [png]) });
      jobs.push({ label: 'frozen picture ' + (i + 1), produces: vfile,
        args: pictureArgs(['-loop', '1', '-framerate', String(FPS), '-i', png], 'null', nFrames, vfile, sp, spanSec, 1, 0) });
    } else {
      jobs.push({ label: 'blank picture ' + (i + 1), produces: vfile,
        args: pictureArgs(['-f', 'lavfi', '-i', 'color=c=' + padHex + ':s=' + width + 'x' + height + ':r=' + FPS], 'null', nFrames, vfile, sp, spanSec, 1, 0) });
    }
    if (transIn[i]) videoList.push(makeTransition(i));
    videoList.push(vfile);
  });

  /* --- sound: one lane per source, made of clip files and silent gaps --- */
  var lanes = { movie: [], voice: [], music: [] }, cursor = { movie: 0, voice: 0, music: 0 };
  (plan.audio || []).forEach(function (c) { if (c.file && /^sfx/.test(c.src) && !lanes[c.src]) { lanes[c.src] = []; cursor[c.src] = 0; } });   // one lane for each effects row
  var totalSamples = Sm(plan.durationMs);
  function silence(name, samples) {
    return { label: 'silence', produces: name, args: ['-f', 'lavfi', '-i', 'anullsrc=r=' + SR + ':cl=stereo',
      '-af', 'aformat=sample_fmts=s16:channel_layouts=stereo,atrim=end_sample=' + samples,
      '-t', (samples / SR + 0.05).toFixed(3), '-c:a', 'pcm_s16le', '-f', 'wav', name] };
  }
  // Voice enhance (gate, tone, compressor), after the usual voice clean-up. Nothing for other sounds or when it is off.
  function enhanceChain(src, c) { return (src === 'voice' && c.enhance && _FX && _FX.voice) ? _FX.voice.ffmpegChain(c.enhance, c.enhance.floorDb).map(function (s) { return ',' + s; }).join('') : ''; }
  // ffmpeg's atempo only accepts 0.5 to 2 per step, so 0.25x and 4x take two steps.
  function tempoChain(speed) {
    if (!speed || speed === 1) return '';
    var parts = [], s = speed;
    while (s > 2) { parts.push('atempo=2'); s /= 2; }
    while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; }
    parts.push('atempo=' + s.toFixed(4));
    return ',' + parts.join(',');
  }
  (plan.audio || []).forEach(function (c, i) {
    var src = c.src;
    var ai = (c.asset && assets[c.asset]) || movieInfo, inName = c.file || (c.asset ? c.asset + '.in' : SRC_FILE[src]);
    var clampC = function (ms) { var a = c.asset && assets[c.asset]; if (!a) return clampSec(ms); var d = Math.max(0, (a.durationSec || 0) - 0.1); return Math.max(0, Math.min(ms / 1000, d || ms / 1000)); };
    if (!lanes[src] || (src === 'movie' && !ai.hasAudio)) return;
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
    var spd = c.speed && c.speed !== 1 ? c.speed : 1;
    var rev = !!c.reverse && src === 'movie';
    var fc = '[0:a]' + sourceChain(src, ai) + enhanceChain(src, c) + (rev ? ',areverse' : '') + tempoChain(spd) + ',aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=end_sample=' + n + '[a];' +
      '[1:a]aresample=' + SR + ',aformat=sample_fmts=fltp:channel_layouts=stereo[g];' +
      '[a][g]amultiply,aformat=sample_fmts=s16:channel_layouts=stereo[o]';
    var files = {}; files[gfile] = buildGainRaw(c.points, c.durMs + lostMs);
    jobs.push({ label: 'sound ' + src + ' ' + (i + 1), produces: afile, files: files,
      args: (rev ? ['-ss', clampC(c.inMs).toFixed(3), '-t', (c.durMs * spd / 1000).toFixed(3), '-i', inName]
        : ['-ss', clampC(c.inMs + lostMs * spd).toFixed(3), '-i', inName]).concat([
        '-f', 'f32le', '-ar', String(GAIN_HZ), '-ac', '2', '-i', gfile,
        '-filter_complex', fc, '-map', '[o]', '-t', (n / SR + 0.05).toFixed(3), '-c:a', 'pcm_s16le', '-f', 'wav', afile]) });
    lanes[src].push(afile);
    cursor[src] = startS + n;
  });
  var laneLists = {};
  Object.keys(lanes).forEach(function (src) {
    if (!lanes[src].length) return;
    if (totalSamples > cursor[src]) {
      var tail = 't' + (/^sfx/.test(src) ? '_' + src : src[0]) + '.wav';
      jobs.push(silence(tail, totalSamples - cursor[src]));
      lanes[src].push(tail);
    }
    laneLists[src] = lanes[src];
  });
  return { jobs: jobs, videoList: videoList, lanes: laneLists, width: width, height: height, textFiles: textFiles };
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

/* ---------- titles: drawn by the page onto a transparent picture of the output size ---------- */
var TITLE_POS = { top: 0.07, center: 0.40, bottom: 0.76 };   // same numbers as plan.js / the editor preview
function drawTitle(g, t, W, H) {
  if (typeof _LK !== 'undefined' && _LK && _LK.drawTitle) return _LK.drawTitle(g, t, W, H);   // fonts, outline, shadow: one drawing for everything
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
async function renderTitlePng(tf) {
  var W = tf.width, H = tf.height, cv;
  if (typeof OffscreenCanvas !== 'undefined') cv = new OffscreenCanvas(W, H);
  else { cv = document.createElement('canvas'); cv.width = W; cv.height = H; }
  if (tf.state && typeof NakiMotion !== 'undefined') NakiMotion.drawTitleState(cv.getContext('2d'), tf.clip, tf.state, W, H, { drawFn: drawTitle, cache: {}, makeCanvas: function (w, h) { var c2; if (typeof OffscreenCanvas !== 'undefined') c2 = new OffscreenCanvas(w, h); else { c2 = document.createElement('canvas'); c2.width = w; c2.height = h; } return c2; } });
  else (tf.sticker && typeof NakiStickers !== 'undefined' ? NakiStickers.drawSticker : drawTitle)(cv.getContext('2d'), tf.clip, W, H);
  var blob = cv.convertToBlob ? await cv.convertToBlob({ type: 'image/png' }) : await new Promise(function (r) { cv.toBlob(r, 'image/png'); });
  return new Uint8Array(await blob.arrayBuffer());
}

/* ---------- shapes, arrows, spotlights and frames: drawn by the page onto a transparent picture ---------- */
async function renderGenPng(gen, fw, fh) {
  var nat = _FX.gen.natural(gen, fw, fh), cv;
  if (typeof OffscreenCanvas !== 'undefined') cv = new OffscreenCanvas(nat.w, nat.h);
  else { cv = document.createElement('canvas'); cv.width = nat.w; cv.height = nat.h; }
  _FX.gen.draw(cv.getContext('2d'), gen, nat.w, nat.h);
  var blob = cv.convertToBlob ? await cv.convertToBlob({ type: 'image/png' }) : await new Promise(function (r) { cv.toBlob(r, 'image/png'); });
  return new Uint8Array(await blob.arrayBuffer());
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
    var ovIds = Object.keys(opts.overlayFiles || {});
    for (var oi = 0; oi < ovIds.length; oi++) { say('Loading your overlay...'); ffmpeg.writeFile(ovIds[oi] + '.in', await fetchFile(opts.overlayFiles[ovIds[oi]])); extra.push(ovIds[oi] + '.in'); }
    var sfxNames = Object.keys(opts.sfxFiles || {});
    for (var si = 0; si < sfxNames.length; si++) { say('Loading your sound effects...'); ffmpeg.writeFile(sfxNames[si], await fetchFile(opts.sfxFiles[sfxNames[si]])); extra.push(sfxNames[si]); }

    say('Reading the movie...');
    var info = await probe(ffmpeg, 'movie.in');
    if (!info.width) throw new Error('Naki could not read this movie file.');

    if (opts.logoFile) {
      say('Loading your logo...');
      ffmpeg.writeFile('logo.png', await fetchFile(opts.logoFile));
      opts = Object.assign({}, opts, { hasLogo: true });
      extra.push('logo.png');
    }

    var vIds = Object.keys(opts.videoFiles || {}), vInfos = {};
    for (var vi = 0; vi < vIds.length; vi++) {
      say('Loading a video you added...');
      ffmpeg.writeFile(vIds[vi] + '.in', await fetchFile(opts.videoFiles[vIds[vi]])); extra.push(vIds[vi] + '.in');
      vInfos[vIds[vi]] = await probe(ffmpeg, vIds[vi] + '.in');
    }
    opts = Object.assign({}, opts, { assets: vInfos });
    var built = planToJobs(plan, info, opts);
    var genOv = (plan.overlays || []).filter(function (o) { return o.gen; });
    for (var gi = 0; gi < genOv.length; gi++) {
      say('Preparing your shapes...');
      ffmpeg.writeFile(genOv[gi].asset + '.png', await renderGenPng(genOv[gi].gen, built.width, built.height)); extra.push(genOv[gi].asset + '.png');
    }
    if (built.textFiles.length) {
      say('Preparing your titles...');
      for (var tfi = 0; tfi < built.textFiles.length; tfi++) {
        ffmpeg.writeFile(built.textFiles[tfi].name, await renderTitlePng(built.textFiles[tfi]));
        extra.push(built.textFiles[tfi].name);
      }
    }
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
  module.exports = { parseProbeInfo: parseProbeInfo, buildGainRaw: buildGainRaw, planToJobs: planToJobs, finalMixArgs: finalMixArgs, drawTitle: drawTitle, FPS: FPS, SR: SR };
}