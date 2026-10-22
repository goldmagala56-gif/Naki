'use strict';
/* Naki look, part two: the extra Adjust sliders (highlights, shadows, tint, hue, grain) and the video effects (shake, glitch, blur, flash, RGB split,
   film grain). Pure helpers shared by the editor preview and the ffmpeg export engine. The fast export engine does not draw any of these: a project
   that uses one is handed to the ffmpeg engine, the same as speed changes. Each slider value is stored from -1 to 1 (grain 0 to 1). */
var NakiLook2 = (function () {
  var EXTRA = { highlights: [-1, 1], shadows: [-1, 1], tint: [-1, 1], hue: [-1, 1], grain: [0, 1] };
  var FX = [
    { key: 'shake', label: 'Shake' }, { key: 'glitch', label: 'Glitch' }, { key: 'blur', label: 'Blur' },
    { key: 'flash', label: 'Flash' }, { key: 'rgbsplit', label: 'RGB split' }, { key: 'grain', label: 'Film grain' }
  ];
  function fxLabel(key) { for (var i = 0; i < FX.length; i++) if (FX[i].key === key) return FX[i].label; return key; }
  function hasExtras(f) { return !!f && Object.keys(EXTRA).some(function (k) { return +f[k] > 0.0005 || +f[k] < -0.0005; }); }
  function f2(n) { return String(Math.round(n * 1000) / 1000); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  // The two points of the tone curve that shadows and highlights move (at a quarter and three quarters of the way up).
  function curvePoints(f) { return [clamp(0.25 + 0.18 * (+f.shadows || 0), 0.02, 0.48), clamp(0.75 + 0.18 * (+f.highlights || 0), 0.52, 0.98)]; }

  // ffmpeg: the filters for the extra sliders, in order.
  function ffmpegAdjust(f) {
    var out = [];
    if (!f) return out;
    if (+f.hue) out.push('hue=h=' + f2(f.hue * 180));
    if (+f.tint) out.push('colorbalance=gm=' + f2(-0.3 * f.tint) + ':gh=' + f2(-0.15 * f.tint));
    if (+f.shadows || +f.highlights) { var c = curvePoints(f); out.push("curves=all='0/0 0.25/" + f2(c[0]) + ' 0.75/' + f2(c[1]) + " 1/1'"); }
    if (+f.grain) out.push('noise=alls=' + Math.round(f.grain * 35) + ':allf=t');
    return out;
  }
  // The editor preview: a table for the SVG tone curve, a CSS hue turn, the colour of the tint layer, and the strength of the grain layer.
  function previewTone(f) { var c = f && (+f.shadows || +f.highlights) ? curvePoints(f) : [0.25, 0.75]; return [0, c[0], 0.5, c[1], 1]; }
  function previewHue(f) { return f && +f.hue ? 'hue-rotate(' + f2(f.hue * 180) + 'deg)' : ''; }
  function previewTint(f) {
    var t = f ? +f.tint || 0 : 0; if (!t) return '';
    return t > 0 ? 'rgb(255,' + Math.round(255 - 70 * t) + ',255)' : 'rgb(' + Math.round(255 + 50 * t) + ',255,' + Math.round(255 + 50 * t) + ')';
  }
  function previewGrain(f) { return f && +f.grain ? 0.4 * f.grain : 0; }

  // ffmpeg: one video effect over a stretch of the part, from a to b seconds after the part starts. Reads cur, writes out. W, H = picture size.
  function ffmpegFx(x, a, b, cur, out, W, H) {
    var s = x.strength == null ? 0.5 : x.strength, en = "enable='between(t," + a.toFixed(3) + ',' + b.toFixed(3) + ")'", I = '[' + cur + ']', O = '[' + out + ']';
    switch (x.fx) {
      case 'blur': return I + 'gblur=sigma=' + f2(2 + 18 * s) + ':' + en + O;
      case 'flash': return I + "eq=brightness='" + f2(0.1 + 0.9 * s) + '*max(0,1-(t-' + a.toFixed(3) + ')/' + Math.max(0.05, Math.min(b - a, 0.35)).toFixed(3) + ")':eval=frame:" + en + O;
      case 'rgbsplit': { var d = Math.round(3 + 10 * s); return I + 'rgbashift=rh=' + (-d) + ':bh=' + d + ':' + en + O; }
      case 'glitch': { var g = Math.round(8 + 18 * s); return I + 'rgbashift=rh=' + (-g) + ':bh=' + g + ':gv=' + Math.round(4 + 8 * s) + ":enable='between(t," + a.toFixed(3) + ',' + b.toFixed(3) + ")*lt(mod(n,8),3)'" + O; }
      case 'grain': return I + 'noise=alls=' + Math.round(10 + 40 * s) + ':allf=t:' + en + O;
      case 'shake': {
        var sw = Math.round(W * 1.08 / 2) * 2, sh = Math.round(H * 1.08 / 2) * 2, A = Math.max(1, Math.round(W * 0.03 * s * 2)), id = out;
        return I + 'split[' + id + 'a][' + id + 'b];[' + id + 'b]scale=' + sw + ':' + sh + ',crop=' + W + ':' + H + ":x='(in_w-" + W + ")/2+" + A + "*sin(47*t)':y='(in_h-" + H + ")/2+" + A + "*cos(53*t)'[" + id + 's];[' + id + 'a][' + id + 's]overlay=' + en + O;
      }
    }
    return I + 'null' + O;
  }
  // The editor preview of the effects active at tMs: { transform, filter, flash (0-1), grain (0-1) } for the picture. x = [{ fx, strength, start, dur }].
  function previewFx(list, tMs) {
    var r = { transform: '', filter: '', flash: 0, grain: 0 }, t = tMs / 1000;
    (list || []).forEach(function (x) {
      var s = x.strength == null ? 0.5 : x.strength, rel = tMs - x.start;
      if (x.fx === 'shake') r.transform = 'translate(' + f2(3 * s * Math.sin(47 * t)) + '%,' + f2(3 * s * Math.cos(53 * t)) + '%) scale(1.06)';
      else if (x.fx === 'blur') r.filter += ' blur(' + f2(2 + 12 * s) + 'px)';
      else if (x.fx === 'flash') r.flash = Math.max(r.flash, (0.1 + 0.9 * s) * Math.max(0, 1 - rel / 1000 / Math.max(0.05, Math.min(x.dur / 1000, 0.35))));
      else if (x.fx === 'rgbsplit') { var d = f2(1 + 4 * s); r.filter += ' drop-shadow(-' + d + 'px 0 0 rgba(255,0,0,.6)) drop-shadow(' + d + 'px 0 0 rgba(0,200,255,.6))'; }
      else if (x.fx === 'glitch') { if (Math.floor(t * 30) % 8 < 3) { var g = f2(3 + 7 * s); r.filter += ' drop-shadow(-' + g + 'px 0 0 rgba(255,0,0,.7)) drop-shadow(' + g + 'px 0 0 rgba(0,200,255,.7))'; r.transform = 'translateX(' + f2(1.5 * s * (Math.floor(t * 30) % 2 ? 1 : -1)) + '%)'; } }
      else if (x.fx === 'grain') r.grain = Math.max(r.grain, 0.1 + 0.5 * s);
    });
    return r;
  }
  var api = { EXTRA: EXTRA, FX: FX, fxLabel: fxLabel, hasExtras: hasExtras, curvePoints: curvePoints, ffmpegAdjust: ffmpegAdjust, previewTone: previewTone, previewHue: previewHue,
    previewTint: previewTint, previewGrain: previewGrain, ffmpegFx: ffmpegFx, previewFx: previewFx };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiLook2 = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['look2.js'] = 'look2'; }
  return api;
})();
