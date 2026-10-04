'use strict';
/* Naki look: the "More adjust" looks (warmth, sharpen, vignette, faded), shared by the editor preview, the fast
   export engine and the ffmpeg export engine so all three draw them the same way. Pure logic, no page code.

   A picture clip's `filter` already holds brightness / contrast / saturate. More adjust adds four optional keys,
   stored only when they are not zero:   warmth -1..1 (cool..warm)   sharpen 0..1   vignette 0..1   matte 0..1
   Warmth and the faded look are plain colour layers laid over the picture, the vignette is a dark ring that grows
   toward the corners, sharpen is an unsharp mask (the fast engine cannot draw it, see webcodecs-export.js). */
var NakiLook = (function () {
  var MATTE_GRAY = 140, MATTE_MAX = 0.35, VIG_ANGLE = 0.9, SHARP_MAX = 1.5;
  var KEYS = ['warmth', 'sharpen', 'vignette', 'matte'];
  function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
  function r4(x){ return Math.round(x * 10000) / 10000; }
  function num(v){ v = +v; return isNaN(v) ? 0 : v; }

  function extras(f){
    f = f || {};
    return { warmth: clamp(num(f.warmth), -1, 1), sharpen: clamp(num(f.sharpen), 0, 1), vignette: clamp(num(f.vignette), 0, 1), matte: clamp(num(f.matte), 0, 1) };
  }
  function hasExtras(f){ var x = extras(f); return !!(x.warmth || x.sharpen || x.vignette || x.matte); }

  // Warmth multiplies the colour channels: warm keeps red and lowers blue (a little green), cool does the opposite.
  function tint(w){
    if (!w) return null;
    return w > 0 ? { r: 1, g: 1 - 0.06 * w, b: 1 - 0.15 * w } : { r: 1 - 0.15 * -w, g: 1 - 0.04 * -w, b: 1 };
  }
  function tintCss(w){
    var t = tint(w); if (!t) return null;
    return 'rgb(' + Math.round(t.r * 255) + ',' + Math.round(t.g * 255) + ',' + Math.round(t.b * 255) + ')';
  }
  // Faded look: blends the picture toward a light grey, which lifts the blacks and softens the contrast.
  function matteAlpha(m){ return r4(m * MATTE_MAX); }
  function matteCss(m){ return m ? 'rgba(' + MATTE_GRAY + ',' + MATTE_GRAY + ',' + MATTE_GRAY + ',' + matteAlpha(m) + ')' : null; }
  // Vignette: the picture keeps cos(angle * t)^4 of its brightness at fraction t of the way from the centre (0)
  // to the corner (1). That is the curve of ffmpeg's own vignette filter, so the three renderers agree.
  function vignetteAngle(v){ return r4(v * VIG_ANGLE); }
  function vignetteLevel(v, t){ return Math.pow(Math.cos(vignetteAngle(v) * t), 4); }
  function vignetteStops(v){
    var out = []; for (var i = 0; i <= 12; i++){ var t = i / 12; out.push([t, r4(1 - vignetteLevel(v, t))]); } return out;
  }
  function vignetteCss(v){
    if (!v) return null;
    return 'radial-gradient(circle farthest-corner at 50% 50%, ' +
      vignetteStops(v).map(function (s){ return 'rgba(0,0,0,' + s[1] + ') ' + Math.round(s[0] * 100) + '%'; }).join(', ') + ')';
  }
  // The preview's sharpen: a 3x3 kernel for an SVG feConvolveMatrix.
  function sharpenKernel(s){ var a = 0.5 * s; return [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0].map(r4).join(' '); }

  // ffmpeg filters for the four looks, in the order they are laid on: warmth, sharpen, faded, vignette.
  function ffmpegExtras(f){
    var x = extras(f), out = [], t = tint(x.warmth);
    if (t) out.push('colorchannelmixer=rr=' + t.r.toFixed(4) + ':gg=' + t.g.toFixed(4) + ':bb=' + t.b.toFixed(4) + ',format=yuv420p');
    if (x.sharpen) out.push('unsharp=5:5:' + (x.sharpen * SHARP_MAX).toFixed(3) + ':5:5:0');
    if (x.matte){
      var a = matteAlpha(x.matte), k = (1 - a).toFixed(4), Y = 16 + 219 * MATTE_GRAY / 255;   // grey in video (limited) range
      out.push("lutyuv=y='val*" + k + '+' + (Y * a).toFixed(3) + "':u='val*" + k + '+' + (128 * a).toFixed(3) + "':v='val*" + k + '+' + (128 * a).toFixed(3) + "'");
    }
    if (x.vignette) out.push('vignette=angle=' + vignetteAngle(x.vignette).toFixed(4) + ':eval=init');
    return out;
  }

  var api = { KEYS: KEYS, extras: extras, hasExtras: hasExtras, tint: tint, tintCss: tintCss, matteAlpha: matteAlpha, matteCss: matteCss,
    vignetteAngle: vignetteAngle, vignetteLevel: vignetteLevel, vignetteStops: vignetteStops, vignetteCss: vignetteCss,
    sharpenKernel: sharpenKernel, ffmpegExtras: ffmpegExtras, MATTE_GRAY: MATTE_GRAY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiLook = api;
  return api;
})();