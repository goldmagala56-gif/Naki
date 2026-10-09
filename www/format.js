'use strict';
/* Naki format: the shape of the finished video (aspect ratio) and what fills the bars around the picture.
   Pure helpers shared by the editor preview, the fast export engine (webcodecs-export.js) and the ffmpeg engine (export-engine.js),
   so all three agree. "original" keeps the movie's own shape and fills the frame, exactly as before. Any other ratio fits the whole
   picture inside the frame and fills the rest with the background: dark (navy, the old look), one colour, or a blurred copy of the picture. */
var NakiFormat = (function () {
  var NAVY = '#111b24';
  var RATIOS = [
    { key: 'original', label: 'Original' }, { key: '9:16', label: '9:16' }, { key: '16:9', label: '16:9' },
    { key: '1:1', label: '1:1' }, { key: '4:5', label: '4:5' }, { key: '4:3', label: '4:3' }, { key: '3:4', label: '3:4' }
  ];
  var SWATCHES = [
    { key: '#000000', label: 'Black' }, { key: '#ffffff', label: 'White' }, { key: '#111b24', label: 'Navy' },
    { key: '#e8355f', label: 'Red' }, { key: '#ff9f1c', label: 'Mango' }, { key: '#41d99b', label: 'Green' }, { key: '#2d6fb3', label: 'Blue' }
  ];

  function ratioValue(key) { var m = /^(\d+):(\d+)$/.exec(String(key || '')); return m && +m[2] > 0 && +m[1] > 0 ? +m[1] / +m[2] : null; }
  function isRatio(key) { return RATIOS.some(function (r) { return r.key === key; }); }
  function hex(c) { var m = /^#?([0-9a-f]{6})$/i.exec(String(c || '')); return m ? '#' + m[1].toLowerCase() : null; }
  // { type: 'navy' | 'color' | 'blur', color: '#rrggbb' }  (anything else becomes the dark navy)
  function normalizeBg(bg) {
    bg = bg || {};
    return { type: bg.type === 'color' || bg.type === 'blur' ? bg.type : 'navy', color: hex(bg.color) || '#000000' };
  }
  // The flat colour behind the picture (or in gaps): the chosen colour, otherwise the dark navy.
  function fillColor(bg) { bg = normalizeBg(bg); return bg.type === 'color' ? bg.color : NAVY; }
  function ffmpegHex(c) { return '0x' + (hex(c) || '#000000').slice(1); }

  // Size of the finished video. Tall shapes use `tier` as the WIDTH (9:16 at 720 is 720x1280), wide and square shapes use it as the
  // HEIGHT. "original" is the movie's own shape (pixel shape taken into account), filling the frame.
  function frameSize(tier, ratio, movieW, movieH, sar) {
    var a = ratioValue(ratio), w, h;
    if (!a) { h = tier; w = Math.max(2, Math.round((tier * ((movieW || 16) * (sar || 1) / (movieH || 9))) / 2) * 2); return { width: w, height: h, contain: false }; }
    if (a < 1) { w = tier; h = Math.max(2, Math.round(tier / a / 2) * 2); }
    else { h = tier; w = Math.max(2, Math.round(tier * a / 2) * 2); }
    return { width: w, height: h, contain: true };
  }

  // ffmpeg: Y U V of a colour (BT.601, limited range) for the "mix with the background" opacity filter. The navy keeps its old constants.
  function yuv(color) {
    var c = hex(color); if (!c || c === NAVY) return [37, 133, 123];
    var r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    var y = 0.299 * r + 0.587 * g + 0.114 * b, k = 224 / 255;
    return [Math.round(16 + 219 * y / 255), Math.round(128 + k * (-0.168736 * r - 0.331264 * g + 0.5 * b)), Math.round(128 + k * (0.5 * r - 0.418688 * g - 0.081312 * b))];
  }

  // ffmpeg filter graph: the picture fitted inside W x H over a blurred, enlarged copy of itself. `pre` is any flip / turn / zoom chain that
  // comes before fitting. The blur is made small and scaled up (cheap, and soft enough that nobody can tell).
  function blurGraph(inLabel, outLabel, W, H, pre) {
    var tw = Math.max(2, Math.round(W / 48) * 2), th = Math.max(2, Math.round(H / 48) * 2);
    return inLabel + (pre ? pre + ',' : '') + 'split[bgi][fgi];' +
      '[bgi]scale=' + W + ':' + H + ':force_original_aspect_ratio=increase:flags=fast_bilinear,crop=' + W + ':' + H +
      ',scale=' + tw + ':' + th + ':flags=bilinear,boxblur=2:1,scale=' + W + ':' + H + ':flags=bicubic[bgb];' +
      '[fgi]scale=' + W + ':' + H + ':force_original_aspect_ratio=decrease:flags=bicubic[fgb];' +
      '[bgb][fgb]overlay=(W-w)/2:(H-h)/2' + outLabel;
  }

  // Canvas (fast engine). Returns a function (g, img, iw, ih) that paints the background of one frame onto g: the flat colour, or for
  // "blur" a blurred copy of the picture (drawn tiny, then stretched with smoothing). `bg` null means the plain navy of the original shape.
  function makeBackgroundPainter(makeCanvas, W, H, bg) {
    var spec = bg ? normalizeBg(bg) : null, flat = spec ? fillColor(spec) : NAVY, tiny = null, tg = null;
    var sw = Math.max(8, Math.round(W / 24)), sh = Math.max(8, Math.round(H / 24));
    return function (g, img, iw, ih) {
      if (spec && spec.type === 'blur' && img && iw > 0 && ih > 0) {
        if (!tiny) { tiny = makeCanvas(sw, sh); tg = tiny.getContext('2d'); }
        var s = Math.max(sw / iw, sh / ih), dw = iw * s, dh = ih * s;
        tg.drawImage(img, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
        g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(tiny, 0, 0, W, H); g.restore();
        return;
      }
      g.fillStyle = flat; g.fillRect(0, 0, W, H);
    };
  }

  // Where a picture sits inside a W x H frame when it is fitted inside it (every shape except "original"), given the clip's
  // transform { zoom, x, y, rot, flipH }. Same numbers as webcodecs-export.js uses, so the editor preview matches the export.
  function containLayout(t, W, H, iw, ih) {
    t = t || {};
    var z = t.zoom || 1, rot = t.rot || 0, sideways = rot === 90 || rot === 270;
    var rw = sideways ? ih : iw, rh = sideways ? iw : ih, s = Math.min(W / rw, H / rh), bw = rw * s, bh = rh * s;
    var box = { x: (W - bw) / 2, y: (H - bh) / 2, w: bw, h: bh };
    return { box: box, zoom: z, rot: rot, flip: !!t.flipH,
      panX: 0 - (t.x || 0) * (z - 1) * 0.5 * bw, panY: 0 - (t.y || 0) * (z - 1) * 0.5 * bh,
      dw: sideways ? bh : bw, dh: sideways ? bw : bh };
  }

  var api = { NAVY: NAVY, RATIOS: RATIOS, SWATCHES: SWATCHES, ratioValue: ratioValue, isRatio: isRatio, normalizeBg: normalizeBg, fillColor: fillColor,
    ffmpegHex: ffmpegHex, frameSize: frameSize, yuv: yuv, blurGraph: blurGraph, makeBackgroundPainter: makeBackgroundPainter, containLayout: containLayout };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiFormat = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['format.js'] = 'format-bg'; }
  return api;
})();
