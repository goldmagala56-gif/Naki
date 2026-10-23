'use strict';
/* Naki fx: blend modes, shape masks and chroma key for overlays. Pure helpers shared by the project model, the editor preview and both export
   engines, so the preview, the fast engine and the ffmpeg engine all agree.
   - blend:  how the overlay mixes with the picture under it. Every mode has its own formula (the W3C ones that browsers use), written once for the
             canvas and once as an ffmpeg expression, so the exported video matches the preview. 'normal' is not stored.
   - mask:   { shape, x, y, w, h, rot, feather, invert, corner } cuts the overlay to a shape, like CapCut's masks: line, mirror, circle, rectangle
             (with round corners), heart, star, and diamond. x, y = where the shape sits on the overlay (0 to 1), w, h = how big (fraction of the
             overlay), rot = turn in degrees, feather = soft edge (0 to 1), invert = show the outside instead, corner = round corners of a rectangle.
   - chroma: { color, similarity, blend } makes one colour (a green screen, say) see-through. Stored only when switched on. */
var NakiFx = (function () {
  // A = what is underneath (0 to 255), B = the overlay. js: the same formula for tests and for anything without a native mode.
  var BLEND = [
    { key: 'normal', label: 'Normal', css: 'normal', canvas: 'source-over', ff: null },
    { key: 'multiply', label: 'Multiply', css: 'multiply', canvas: 'multiply', expr: 'A*B/255' },
    { key: 'screen', label: 'Screen', css: 'screen', canvas: 'screen', expr: 'A+B-A*B/255' },
    { key: 'overlay', label: 'Overlay', css: 'overlay', canvas: 'overlay', expr: 'if(lte(A,127.5),2*A*B/255,255-2*(255-A)*(255-B)/255)' },
    { key: 'darken', label: 'Darken', css: 'darken', canvas: 'darken', expr: 'min(A,B)' },
    { key: 'lighten', label: 'Lighten', css: 'lighten', canvas: 'lighten', expr: 'max(A,B)' },
    { key: 'add', label: 'Add', css: 'plus-lighter', canvas: 'lighter', expr: 'min(255,A+B)' },
    { key: 'difference', label: 'Difference', css: 'difference', canvas: 'difference', expr: 'abs(A-B)' },
    { key: 'exclusion', label: 'Exclusion', css: 'exclusion', canvas: 'exclusion', expr: 'A+B-2*A*B/255' },
    { key: 'softlight', label: 'Soft light', css: 'soft-light', canvas: 'soft-light',
      expr: 'st(0,A/255);st(1,B/255);255*if(lte(ld(1),0.5),ld(0)-(1-2*ld(1))*ld(0)*(1-ld(0)),ld(0)+(2*ld(1)-1)*(if(lte(ld(0),0.25),((16*ld(0)-12)*ld(0)+4)*ld(0),sqrt(ld(0)))-ld(0)))' },
    { key: 'hardlight', label: 'Hard light', css: 'hard-light', canvas: 'hard-light', expr: 'if(lte(B,127.5),2*A*B/255,255-2*(255-A)*(255-B)/255)' },
    { key: 'dodge', label: 'Dodge', css: 'color-dodge', canvas: 'color-dodge', expr: 'if(eq(A,0),0,if(gte(B,255),255,min(255,A*255/(255-B))))' },
    { key: 'burn', label: 'Burn', css: 'color-burn', canvas: 'color-burn', expr: 'if(gte(A,255),255,if(eq(B,0),0,255-min(255,(255-A)*255/B)))' },
    // these two take the brightness from one picture and the colours from the other: done on brightness and colour planes (close to the browser's own)
    { key: 'color', label: 'Colour', css: 'color', canvas: 'color', yuv: 'c0_expr=A:c1_expr=B:c2_expr=B' },
    { key: 'luminosity', label: 'Brightness', css: 'luminosity', canvas: 'luminosity', yuv: 'c0_expr=B:c1_expr=A:c2_expr=A' }
  ];
  BLEND.forEach(function (b) {
    if (b.expr) { b.ff = "all_expr='" + b.expr + "'"; b.fmt = 'gbrp'; }
    else if (b.yuv) { b.ff = b.yuv; b.fmt = 'yuv444p'; }
    else b.fmt = null;
  });
  var MASKS = [{ key: 'none', label: 'None' }, { key: 'line', label: 'Line' }, { key: 'mirror', label: 'Mirror' }, { key: 'circle', label: 'Circle' },
    { key: 'rect', label: 'Rectangle' }, { key: 'heart', label: 'Heart' }, { key: 'star', label: 'Star' }, { key: 'diamond', label: 'Diamond' }];
  var CHROMA = { color: '#00ff00', similarity: 0.3, blend: 0.1 };

  function r3(x) { return Math.round(x * 1000) / 1000; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function num(v, dflt) { v = +v; return isNaN(v) ? dflt : v; }
  function blendOf(key) { for (var i = 0; i < BLEND.length; i++) if (BLEND[i].key === key) return BLEND[i]; return BLEND[0]; }
  function cssBlend(key) { return blendOf(key).css; }
  function ffBlend(key) { return blendOf(key).ff; }          // the options for ffmpeg's blend filter (null for normal)
  function ffBlendFormat(key) { return blendOf(key).fmt; }   // the pixel format both pictures are converted to for it

  // ---------- tidying what is stored ----------
  function cleanBlend(key) { return key && key !== 'normal' && blendOf(key).key === key ? key : null; }
  var SHAPES = { line: 1, mirror: 1, circle: 1, rect: 1, heart: 1, star: 1, diamond: 1 };
  var SHAPE_DEFAULT = { line: { w: 0.6, h: 0.6 }, mirror: { w: 0.6, h: 0.4 }, circle: { w: 0.6, h: 0.6 }, rect: { w: 0.6, h: 0.6 }, heart: { w: 0.6, h: 0.6 }, star: { w: 0.6, h: 0.6 }, diamond: { w: 0.6, h: 0.6 } };
  // Older projects stored { shape: 'rounded' | 'ellipse', amount }: they become a rectangle with round corners and a circle.
  function cleanMask(m) {
    if (!m || !m.shape || m.shape === 'none') return null;
    var shape = m.shape, corner = m.corner;
    if (shape === 'rounded') { shape = 'rect'; if (corner == null) corner = m.amount; }
    else if (shape === 'ellipse') shape = 'circle';
    if (!SHAPES[shape]) return null;
    var d = SHAPE_DEFAULT[shape];
    var out = { shape: shape, x: r3(clamp(num(m.x, 0.5), 0, 1)), y: r3(clamp(num(m.y, 0.5), 0, 1)), w: r3(clamp(num(m.w, d.w), 0.05, 2)), h: r3(clamp(num(m.h, d.h), 0.05, 2)),
      rot: r3((((num(m.rot, 0) + 180) % 360) + 360) % 360 - 180), feather: r3(clamp(num(m.feather, 0), 0, 1)), corner: shape === 'rect' ? r3(clamp(num(corner, 0), 0, 1)) : 0 };
    if (m.invert) out.invert = true;
    return out;
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

  // ---------- masks: one signed-distance formula per shape, used by the canvas and (as an expression) by ffmpeg ----------
  // iq's heart and star outlines, scaled into the box -1..1: [half width, half height, middle height] of each outline as it is drawn
  var HEART = { hx: 0.602, hy: 0.55, cy: 0.552 }, STAR_RF = 0.45, STAR = { hx: 0.951, hy: 0.902, cy: 0.096 };
  var K1X = 0.809016994375, K1Y = -0.587785252292;
  function sdHeart(x, y) {
    x = Math.abs(x);
    if (y + x > 1) return Math.hypot(x - 0.25, y - 0.75) - Math.SQRT2 / 4;
    var t = 0.5 * Math.max(x + y, 0);
    return Math.sqrt(Math.min(x * x + (y - 1) * (y - 1), (x - t) * (x - t) + (y - t) * (y - t))) * (x > y ? 1 : -1);
  }
  var BAX = -K1Y * STAR_RF, BAY = K1X * STAR_RF - 1;
  function sdStar(px, py) {
    var x = Math.abs(px), y = py, t = 2 * Math.max(K1X * x + K1Y * y, 0);
    x -= t * K1X; y -= t * K1Y;
    t = 2 * Math.max(-K1X * x + K1Y * y, 0);
    x += t * K1X; y -= t * K1Y;   // the second fold uses k2 = (-K1X, K1Y)
    x = Math.abs(x); y -= 1;
    var h = clamp((x * BAX + y * BAY) / (BAX * BAX + BAY * BAY), 0, 1);
    return Math.hypot(x - BAX * h, y - BAY * h) * (y * BAX - x * BAY > 0 ? 1 : -1);
  }
  // Signed distance (pixels, negative inside the shape) of the pixel centre (x, y) in an overlay W x H.
  function maskSd(m, x, y, W, H) {
    var a = m.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), dx = x - m.x * W, dy = y - m.y * H;
    var px = dx * ca + dy * sa, py = -dx * sa + dy * ca, ax = Math.max(1, m.w * W / 2), ay = Math.max(1, m.h * H / 2), u = px / ax, v = py / ay, k = Math.min(ax, ay);
    switch (m.shape) {
      case 'circle': return (Math.hypot(u, v) - 1) * k;
      case 'rect': { var q1 = Math.abs(u) - (1 - m.corner), q2 = Math.abs(v) - (1 - m.corner); return (Math.hypot(Math.max(q1, 0), Math.max(q2, 0)) + Math.min(Math.max(q1, q2), 0) - m.corner) * k; }
      case 'diamond': return (Math.abs(u) + Math.abs(v) - 1) * 0.70710678 * k;
      case 'line': return py;
      case 'mirror': return Math.abs(py) - ay;
      case 'heart': return sdHeart(Math.abs(u) * HEART.hx, HEART.cy - v * HEART.hy) / ((HEART.hx + HEART.hy) / 2) * k;
      case 'star': return sdStar(Math.abs(u) * STAR.hx, STAR.cy - v * STAR.hy) / ((STAR.hx + STAR.hy) / 2) * k;
    }
    return 0;
  }
  function featherPx(m, W, H) { return Math.max(0.6, m.feather * 0.25 * Math.min(W, H)); }
  // How much of the overlay shows at pixel (X, Y) (counted from 0), 0 to 1.
  function maskAlpha(m, X, Y, W, H) {
    var al = clamp(0.5 - maskSd(m, X + 0.5, Y + 0.5, W, H) / (2 * featherPx(m, W, H)), 0, 1);
    return m.invert ? 1 - al : al;
  }
  // The same thing as an ffmpeg expression for geq, giving 0 to 1 (use it as alpha(X,Y)*( ... )): W and H are the overlay's size.
  function nn(v) { v = r3(v); return v < 0 ? '(' + v + ')' : String(v); }
  function nf(v) { v = Math.round(v * 1e9) / 1e9; return v < 0 ? '(' + v + ')' : String(v); }
  function maskAlphaExpr(m) {
    m = cleanMask(m); if (!m) return null;
    var a = m.rot * Math.PI / 180, ca = nf(Math.cos(a)), sa = nf(Math.sin(a)), s = [], sd;
    s.push('st(0,X+0.5-' + nn(m.x) + '*W)', 'st(1,Y+0.5-' + nn(m.y) + '*H)');
    s.push('st(2,ld(0)*' + ca + '+ld(1)*' + sa + ')', 'st(3,-ld(0)*' + sa + '+ld(1)*' + ca + ')');                   // px, py: turned, centred
    s.push('st(4,max(1,' + nn(m.w) + '*W/2))', 'st(5,max(1,' + nn(m.h) + '*H/2))', 'st(6,ld(2)/ld(4))', 'st(7,ld(3)/ld(5))');   // half size, then u, v
    var kk = 'min(ld(4),ld(5))';
    if (m.shape === 'circle') sd = '(hypot(ld(6),ld(7))-1)*' + kk;
    else if (m.shape === 'diamond') sd = '(abs(ld(6))+abs(ld(7))-1)*0.70710678*' + kk;
    else if (m.shape === 'line') sd = 'ld(3)';
    else if (m.shape === 'mirror') sd = 'abs(ld(3))-ld(5)';
    else if (m.shape === 'rect') {
      s.push('st(0,abs(ld(6))-' + nn(1 - m.corner) + ')', 'st(1,abs(ld(7))-' + nn(1 - m.corner) + ')');
      sd = '(hypot(max(ld(0),0),max(ld(1),0))+min(max(ld(0),ld(1)),0)-' + nn(m.corner) + ')*' + kk;
    } else if (m.shape === 'heart') {
      s.push('st(0,abs(ld(6))*' + HEART.hx + ')', 'st(1,' + HEART.cy + '-ld(7)*' + HEART.hy + ')', 'st(2,0.5*max(ld(0)+ld(1),0))');
      sd = 'if(gt(ld(0)+ld(1),1),hypot(ld(0)-0.25,ld(1)-0.75)-0.35355339,sqrt(min(pow(ld(0),2)+pow(ld(1)-1,2),pow(ld(0)-ld(2),2)+pow(ld(1)-ld(2),2)))*if(gt(ld(0),ld(1)),1,-1))/' + ((HEART.hx + HEART.hy) / 2) + '*' + kk;
    } else if (m.shape === 'star') {
      s.push('st(0,abs(ld(6))*' + STAR.hx + ')', 'st(1,' + STAR.cy + '-ld(7)*' + STAR.hy + ')');
      s.push('st(2,2*max(' + K1X + '*ld(0)+' + nf(K1Y) + '*ld(1),0))', 'st(0,ld(0)-ld(2)*' + K1X + ')', 'st(1,ld(1)-ld(2)*' + nf(K1Y) + ')');
      s.push('st(2,2*max(-' + K1X + '*ld(0)+' + nf(K1Y) + '*ld(1),0))', 'st(0,ld(0)+ld(2)*' + K1X + ')', 'st(1,ld(1)-ld(2)*' + nf(K1Y) + ')');
      s.push('st(0,abs(ld(0)))', 'st(1,ld(1)-1)', 'st(2,clip((ld(0)*' + nf(BAX) + '+ld(1)*' + nf(BAY) + ')/' + nf(BAX * BAX + BAY * BAY) + ',0,1))');
      sd = 'hypot(ld(0)-' + nf(BAX) + '*ld(2),ld(1)-(' + nf(BAY) + ')*ld(2))*if(gt(ld(1)*' + nf(BAX) + '-ld(0)*(' + nf(BAY) + '),0),1,-1)/' + ((STAR.hx + STAR.hy) / 2) + '*' + kk;
    }
    s.push('st(8,' + sd + ')', 'st(9,max(0.6,' + nn(m.feather) + '*0.25*min(W,H)))');
    var al = 'clip(0.5-ld(8)/(2*ld(9)),0,1)'; if (m.invert) al = '(1-' + al + ')';
    s.push(al);
    return s.join(';');
  }

  // ---------- drawing on a canvas (the fast export engine and the preview) ----------
  var scratch = null, maskCache = [];
  function makeCanvas(w, h) { return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : (function () { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; })(); }
  // The mask as a picture (white with the shape's alpha), made once per shape and size.
  function maskCanvas(m, w, h) {
    m = cleanMask(m); w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    var key = JSON.stringify(m) + '|' + w + 'x' + h;
    for (var i = 0; i < maskCache.length; i++) if (maskCache[i].key === key) return maskCache[i].cv;
    var cv = makeCanvas(w, h), g = cv.getContext('2d'), im = g.createImageData(w, h), d = im.data;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var o = (y * w + x) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(maskAlpha(m, x, y, w, h) * 255); }
    g.putImageData(im, 0, 0);
    maskCache.push({ key: key, cv: cv }); if (maskCache.length > 8) maskCache.shift();
    return cv;
  }
  // Draws src into the canvas cv (already the size you want), makes the key colour see-through, then cuts it to the mask shape.
  function fxInto(cv, src, fx) {
    var w = cv.width, h = cv.height, g = cv.getContext('2d', { willReadFrequently: true });
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h); g.drawImage(src, 0, 0, w, h);
    if (fx.chroma) {
      var im = g.getImageData(0, 0, w, h), d = im.data, key = keyOf(fx.chroma.color), sim = fx.chroma.similarity, bl = fx.chroma.blend;
      for (var i = 0; i < d.length; i += 4) { var a = chromaAlpha(d[i], d[i + 1], d[i + 2], key, sim, bl); if (a < d[i + 3]) d[i + 3] = a; }
      g.putImageData(im, 0, 0);
    }
    if (fx.mask) { g.globalCompositeOperation = 'destination-in'; g.drawImage(maskCanvas(fx.mask, w, h), 0, 0); g.globalCompositeOperation = 'source-over'; }
    return cv;
  }
  function chromaInto(cv, src, ch) { return fxInto(cv, src, { chroma: ch }); }
  function chromaCanvas(src, w, h, ch) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (!scratch) scratch = makeCanvas(w, h);
    if (scratch.width !== w) scratch.width = w;
    if (scratch.height !== h) scratch.height = h;
    return fxInto(scratch, src, { chroma: ch });
  }
  // R is the overlay's place from NakiAnim.overlayRect (centre, size, turn, opacity); o is the overlay from the plan.
  function drawFx(ctx, src, R, o) {
    var img = src, ch = cleanChroma(o.chroma), mk = cleanMask(o.mask);
    if (ch || mk) {
      var w = Math.max(1, Math.min(1920, Math.round(R.w))), h = Math.max(1, Math.min(1920, Math.round(R.h)));
      if (!scratch) scratch = makeCanvas(w, h);
      if (scratch.width !== w) scratch.width = w;
      if (scratch.height !== h) scratch.height = h;
      img = fxInto(scratch, src, { chroma: ch, mask: mk });
    }
    ctx.save();
    ctx.globalAlpha = clamp(R.opacity, 0, 1);
    ctx.globalCompositeOperation = blendOf(o.blend).canvas;
    ctx.translate(R.cx, R.cy); ctx.rotate(R.rot * Math.PI / 180);
    ctx.drawImage(img, -R.w / 2, -R.h / 2, R.w, R.h);
    ctx.restore();
  }

  var api = { BLEND: BLEND, MASKS: MASKS, CHROMA: CHROMA, blendOf: blendOf, cssBlend: cssBlend, ffBlend: ffBlend, ffBlendFormat: ffBlendFormat,
    cleanBlend: cleanBlend, cleanMask: cleanMask, cleanChroma: cleanChroma, hexRgb: hexRgb, keyOf: keyOf, chromaAlpha: chromaAlpha, chromaFilter: chromaFilter,
    maskSd: maskSd, maskAlpha: maskAlpha, maskAlphaExpr: maskAlphaExpr, maskCanvas: maskCanvas, fxInto: fxInto, chromaInto: chromaInto, chromaCanvas: chromaCanvas, drawFx: drawFx };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiFx = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['fx.js'] = 'masks-fx2'; }
  return api;
})();
