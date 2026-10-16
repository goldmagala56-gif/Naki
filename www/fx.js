'use strict';
/* Naki fx: blend modes, shape masks and chroma key for overlays. Pure helpers shared by the project model, the editor preview and both export
   engines, so the preview, the fast engine and the ffmpeg engine all agree.
   - blend: how the overlay mixes with the picture under it (multiply, screen, ...). 'normal' is not stored.
   - mask:  { shape: 'rounded' | 'ellipse' | 'diamond', amount } cuts the overlay to a shape (amount, 0 to 1, is how round the corners of 'rounded' are).
   - chroma: { color, similarity, blend } makes one colour (a green screen, say) see-through. Stored only when switched on. */
var NakiFx = (function () {
  var BLEND = [
    { key: 'normal', label: 'Normal', css: 'normal', canvas: 'source-over', ff: null },
    { key: 'multiply', label: 'Multiply', css: 'multiply', canvas: 'multiply', ff: 'multiply' },
    { key: 'screen', label: 'Screen', css: 'screen', canvas: 'screen', ff: 'screen' },
    { key: 'overlay', label: 'Overlay', css: 'overlay', canvas: 'overlay', ff: 'overlay' },
    { key: 'darken', label: 'Darken', css: 'darken', canvas: 'darken', ff: 'darken' },
    { key: 'lighten', label: 'Lighten', css: 'lighten', canvas: 'lighten', ff: 'lighten' },
    { key: 'add', label: 'Add', css: 'plus-lighter', canvas: 'lighter', ff: 'addition' },
    { key: 'difference', label: 'Difference', css: 'difference', canvas: 'difference', ff: 'difference' },
    { key: 'exclusion', label: 'Exclusion', css: 'exclusion', canvas: 'exclusion', ff: 'exclusion' },
    { key: 'softlight', label: 'Soft light', css: 'soft-light', canvas: 'soft-light', ff: 'softlight' },
    { key: 'hardlight', label: 'Hard light', css: 'hard-light', canvas: 'hard-light', ff: 'hardlight' },
    { key: 'dodge', label: 'Dodge', css: 'color-dodge', canvas: 'color-dodge', ff: 'dodge' },
    { key: 'burn', label: 'Burn', css: 'color-burn', canvas: 'color-burn', ff: 'burn' }
  ];
  var MASKS = [{ key: 'none', label: 'None' }, { key: 'rounded', label: 'Rounded' }, { key: 'ellipse', label: 'Oval' }, { key: 'diamond', label: 'Diamond' }];
  var MASK_ROUND = 0.25;
  var CHROMA = { color: '#00ff00', similarity: 0.3, blend: 0.1 };

  function r3(x) { return Math.round(x * 1000) / 1000; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function num(v, dflt) { v = +v; return isNaN(v) ? dflt : v; }
  function blendOf(key) { for (var i = 0; i < BLEND.length; i++) if (BLEND[i].key === key) return BLEND[i]; return BLEND[0]; }
  function cssBlend(key) { return blendOf(key).css; }
  function ffBlend(key) { return blendOf(key).ff; }

  // ---------- tidying what is stored ----------
  function cleanBlend(key) { return key && key !== 'normal' && blendOf(key).key === key ? key : null; }
  function cleanMask(m) {
    if (!m || !m.shape || m.shape === 'none') return null;
    if (m.shape === 'rounded') return { shape: 'rounded', amount: r3(clamp(num(m.amount, MASK_ROUND), 0, 1)) };
    return m.shape === 'ellipse' || m.shape === 'diamond' ? { shape: m.shape, amount: 0 } : null;
  }
  function cleanColor(c) { var m = /^#?([0-9a-f]{6})$/i.exec(String(c == null ? '' : c).trim()); return m ? '#' + m[1].toLowerCase() : CHROMA.color; }
  function cleanChroma(c) {
    if (!c) return null;
    return { color: cleanColor(c.color), similarity: r3(clamp(num(c.similarity, CHROMA.similarity), 0.01, 0.9)), blend: r3(clamp(num(c.blend, CHROMA.blend), 0, 0.5)) };
  }

  // ---------- chroma key ----------
  function hexRgb(h) { var m = /^#?([0-9a-f]{6})$/i.exec(h || ''); var n = m ? parseInt(m[1], 16) : 0x00ff00; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toUV(r, g, b) { return { u: -0.169 * r - 0.331 * g + 0.5 * b + 128, v: 0.5 * r - 0.419 * g - 0.081 * b + 128 }; }
  function keyOf(hex) { var c = hexRgb(hex); return toUV(c[0], c[1], c[2]); }
  // How much of a pixel to keep (0 = see-through, 255 = solid). It goes by how far the pixel's colour (not its brightness) is from the key colour,
  // fitted to ffmpeg's chromakey filter so the preview and the fast engine take out about what the ffmpeg engine does. Closer than
  // "similarity" is removed; "blend" softens the edge.
  function chromaAlpha(r, g, b, key, sim, blend) {
    var du = (-0.169 * r - 0.331 * g + 0.5 * b + 128) - key.u, dv = (0.5 * r - 0.419 * g - 0.081 * b + 128) - key.v;
    var diff = Math.sqrt(du * du + dv * dv) / 392 + 0.017;   // fitted to what ffmpeg's chromakey removes (measured with real clips)
    if (blend > 0.0001) return Math.round(clamp((diff - sim) / blend, 0, 1) * 255);
    return diff > sim ? 255 : 0;
  }
  function chromaFilter(ch) {
    var c = cleanChroma(ch);
    return 'chromakey=color=0x' + c.color.slice(1) + ':similarity=' + c.similarity.toFixed(3) + ':blend=' + c.blend.toFixed(3);
  }
  // Draws src into the canvas cv (already the size you want) and makes the key colour see-through.
  function chromaInto(cv, src, ch) {
    var w = cv.width, h = cv.height, g = cv.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, w, h); g.drawImage(src, 0, 0, w, h);
    var im = g.getImageData(0, 0, w, h), d = im.data, key = keyOf(ch.color), sim = ch.similarity, bl = ch.blend;
    for (var i = 0; i < d.length; i += 4) { var a = chromaAlpha(d[i], d[i + 1], d[i + 2], key, sim, bl); if (a < d[i + 3]) d[i + 3] = a; }
    g.putImageData(im, 0, 0);
    return cv;
  }
  var scratch = null;
  function makeCanvas(w, h) { return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : (function () { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; })(); }
  function chromaCanvas(src, w, h, ch) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (!scratch) scratch = makeCanvas(w, h);
    if (scratch.width !== w) scratch.width = w;
    if (scratch.height !== h) scratch.height = h;
    return chromaInto(scratch, src, ch);
  }

  // ---------- masks ----------
  // CSS clip-path for the preview. w and h (pixels) are optional; with them the corners are round, not oval.
  function maskCss(m, w, h) {
    m = cleanMask(m); if (!m) return '';
    if (m.shape === 'ellipse') return 'ellipse(50% 50% at 50% 50%)';
    if (m.shape === 'diamond') return 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
    if (w > 0 && h > 0) return 'inset(0px round ' + (Math.min(m.amount * Math.min(w, h) / 2, w / 2, h / 2)).toFixed(1) + 'px)';
    return 'inset(0 round ' + (m.amount * 50) + '%)';
  }
  // The shape as a canvas path, centred on 0,0, w x h.
  function maskPath(ctx, m, w, h) {
    var hw = w / 2, hh = h / 2;
    if (m.shape === 'ellipse') { ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2); return; }
    if (m.shape === 'diamond') { ctx.moveTo(0, -hh); ctx.lineTo(hw, 0); ctx.lineTo(0, hh); ctx.lineTo(-hw, 0); ctx.closePath(); return; }
    var r = Math.max(0, Math.min(m.amount * Math.min(w, h) / 2, hw, hh));
    ctx.moveTo(-hw + r, -hh); ctx.lineTo(hw - r, -hh); ctx.arcTo(hw, -hh, hw, -hh + r, r); ctx.lineTo(hw, hh - r); ctx.arcTo(hw, hh, hw - r, hh, r);
    ctx.lineTo(-hw + r, hh); ctx.arcTo(-hw, hh, -hw, hh - r, r); ctx.lineTo(-hw, -hh + r); ctx.arcTo(-hw, -hh, -hw + r, -hh, r); ctx.closePath();
  }
  // How much of each pixel the shape keeps (0 to 1), as an ffmpeg expression for geq. W and H are the size of the overlay picture.
  // The edge is one pixel soft so it does not look jagged.
  function maskAlphaExpr(m) {
    m = cleanMask(m); if (!m) return null;
    var dx = '(X+0.5-W/2)', dy = '(Y+0.5-H/2)';
    if (m.shape === 'ellipse') return 'clip((1-hypot(' + dx + '/(W/2),' + dy + '/(H/2)))*min(W,H)/2,0,1)';
    if (m.shape === 'diamond') return 'clip((1-(abs' + dx + '/(W/2)+abs' + dy + '/(H/2)))*min(W,H)*0.35,0,1)';
    var R = 'max(' + m.amount.toFixed(3) + '*min(W,H)/2,0.5)';
    return 'clip(' + R + '+0.5-hypot(max(abs' + dx + '-(W/2-' + R + '),0),max(abs' + dy + '-(H/2-' + R + '),0)),0,1)';
  }

  // ---------- drawing one overlay on a canvas (the fast export engine) ----------
  // R is the overlay's place from NakiAnim.overlayRect (centre, size, turn, opacity); o is the overlay from the plan.
  function drawFx(ctx, src, R, o) {
    var img = src;
    if (o.chroma) img = chromaCanvas(src, Math.min(R.w, 1920), Math.min(R.h, 1920), cleanChroma(o.chroma));
    ctx.save();
    ctx.globalAlpha = clamp(R.opacity, 0, 1);
    ctx.globalCompositeOperation = blendOf(o.blend).canvas;
    ctx.translate(R.cx, R.cy); ctx.rotate(R.rot * Math.PI / 180);
    var m = cleanMask(o.mask);
    if (m) { ctx.beginPath(); maskPath(ctx, m, R.w, R.h); ctx.clip(); }
    ctx.drawImage(img, -R.w / 2, -R.h / 2, R.w, R.h);
    ctx.restore();
  }

  var api = { BLEND: BLEND, MASKS: MASKS, MASK_ROUND: MASK_ROUND, CHROMA: CHROMA, blendOf: blendOf, cssBlend: cssBlend, ffBlend: ffBlend,
    cleanBlend: cleanBlend, cleanMask: cleanMask, cleanChroma: cleanChroma, hexRgb: hexRgb, keyOf: keyOf, chromaAlpha: chromaAlpha, chromaFilter: chromaFilter,
    chromaInto: chromaInto, chromaCanvas: chromaCanvas, maskCss: maskCss, maskPath: maskPath, maskAlphaExpr: maskAlphaExpr, drawFx: drawFx };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiFx = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['fx.js'] = 'masks-fx'; }
  return api;
})();
