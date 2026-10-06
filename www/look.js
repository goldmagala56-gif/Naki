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

  /* ---------- titles and captions: one drawing shared by the editor preview, the fast engine and the ffmpeg engine ---------- */
  var TITLE_POS = { top: 0.07, center: 0.40, bottom: 0.76 };   // as a fraction of the picture height (same numbers as plan.js)
  var FONTS = {
    sans: { label: 'Sans', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    serif: { label: 'Serif', css: 'Georgia, "Times New Roman", "Noto Serif", serif' },
    mono: { label: 'Mono', css: 'ui-monospace, Menlo, Consolas, "Courier New", monospace' },
    bold: { label: 'Bold', css: 'Impact, "Arial Black", "Roboto Condensed", system-ui, sans-serif' },
    script: { label: 'Script', css: '"Segoe Script", "Brush Script MT", "Comic Sans MS", cursive' }
  };
  function fontCss(k){ return (FONTS[k] || FONTS.sans).css; }
  function fontList(){ return Object.keys(FONTS).map(function (k){ return { key: k, label: FONTS[k].label }; }); }
  // Size in pixels, the visible width of the outline (up to 6% of the letter size), and the strength of the shadow (1 = the look titles always had).
  function titleLook(t, H){
    var px = Math.max(10, Math.round((t.size || 7) / 100 * H)), o = clamp(num(t.outline), 0, 1), sh = t.shadow == null ? 1 : clamp(num(t.shadow), 0, 1);
    return { px: px, outlinePx: o > 0 ? r4(px * 0.06 * o) : 0, shadow: sh, blur: Math.max(2, px * 0.08) * sh, offY: Math.max(1, px * 0.04) * sh };
  }
  // The same look as CSS, for the preview.
  function titleStyle(t, H){
    var L = titleLook(t, H);
    return { px: L.px, fontFamily: fontCss(t.font), stroke: L.outlinePx ? (L.outlinePx * 2) + 'px #000' : '',
      shadow: L.shadow > 0 ? '0 ' + r4(L.offY) + 'px ' + r4(L.blur) + 'px rgba(0,0,0,0.7)' : 'none' };
  }
  // Draws a title onto a canvas context of W x H pixels: wrapped to 88% of the width, at the same heights as the preview.
  function drawTitle(g, t, W, H){
    var L = titleLook(t, H), px = L.px;
    g.font = (t.weight || 700) + ' ' + px + 'px ' + fontCss(t.font);
    g.textAlign = 'center'; g.textBaseline = 'top';
    var maxW = W * 0.88, lines = [];
    String(t.text || '').split('\n').forEach(function (par){
      var line = '';
      par.split(' ').forEach(function (w){
        var test = line ? line + ' ' + w : w;
        if (line && g.measureText(test).width > maxW){ lines.push(line); line = w; } else line = test;
      });
      lines.push(line);
    });
    var lh = Math.round(px * 1.2), y0 = Math.round((TITLE_POS[t.pos] != null ? TITLE_POS[t.pos] : TITLE_POS.bottom) * H);
    if (t.bg){
      var widest = 0; lines.forEach(function (l){ widest = Math.max(widest, g.measureText(l).width); });
      var bw = Math.min(W, widest + px * 0.8);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(Math.round(W / 2 - bw / 2), Math.round(y0 - px * 0.2), Math.round(bw), Math.round(lines.length * lh + px * 0.4));
    }
    function shadow(){
      if (L.shadow > 0){ g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = L.blur; g.shadowOffsetY = L.offY; }
      else { g.shadowColor = 'rgba(0,0,0,0)'; g.shadowBlur = 0; g.shadowOffsetY = 0; }
    }
    if (L.outlinePx > 0 && g.strokeText){
      // outline first (the shadow follows the outline), then the letters on top of it
      shadow(); g.lineJoin = 'round'; g.lineWidth = L.outlinePx * 2; g.strokeStyle = '#000';
      lines.forEach(function (l, i){ g.strokeText(l, W / 2, y0 + i * lh); });
      g.fillStyle = t.color || '#ffffff'; g.shadowColor = 'rgba(0,0,0,0)'; g.shadowBlur = 0; g.shadowOffsetY = 0;
    } else { g.fillStyle = t.color || '#ffffff'; shadow(); }
    lines.forEach(function (l, i){ g.fillText(l, W / 2, y0 + i * lh); });
    return lines;
  }

  var api = { KEYS: KEYS, extras: extras, hasExtras: hasExtras, tint: tint, tintCss: tintCss, matteAlpha: matteAlpha, matteCss: matteCss,
    vignetteAngle: vignetteAngle, vignetteLevel: vignetteLevel, vignetteStops: vignetteStops, vignetteCss: vignetteCss,
    sharpenKernel: sharpenKernel, ffmpegExtras: ffmpegExtras, MATTE_GRAY: MATTE_GRAY,
    fontCss: fontCss, fontList: fontList, titleLook: titleLook, titleStyle: titleStyle, drawTitle: drawTitle, TITLE_POS: TITLE_POS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiLook = api;
  return api;
})();

// Which version of this file is running (the Home screen lists these, so a stale copy is easy to spot).
if (typeof window !== 'undefined'){ window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['look.js'] = 'titles-more-adjust'; }