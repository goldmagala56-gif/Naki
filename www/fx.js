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

    // ---------- generated overlays: shapes, arrows, spotlights and frames ----------
  // They have no picture file. An overlay clip carries clip.gen = { kind: 'shape' | 'arrow' | 'spotlight' | 'frame', ... } and everything that shows overlays
  // (the preview, the fast engine, the ffmpeg engine) draws it with GEN.draw(), so all three look the same. Shapes and arrows are boxes you move, size and turn
  // like any overlay. Spotlights and frames cover the whole picture (gen.full) and are drawn at the size of the video.
  var GEN = (function () {
    var SHAPES = [{ key: 'rect', label: 'Rectangle' }, { key: 'rounded', label: 'Rounded' }, { key: 'circle', label: 'Circle' }, { key: 'triangle', label: 'Triangle' },
      { key: 'diamond', label: 'Diamond' }, { key: 'hexagon', label: 'Hexagon' }, { key: 'star', label: 'Star' }, { key: 'heart', label: 'Heart' }, { key: 'line', label: 'Line' }];
    var AR = { rect: 0.6, rounded: 0.6, circle: 1, triangle: 0.9, diamond: 1, hexagon: 0.9, star: 1, heart: 0.95, line: 0.08 };   // height / width of the box
    var ARROWS = [{ key: 'classic', label: 'Classic' }, { key: 'open', label: 'Open' }, { key: 'double', label: 'Double' }];
    var SPOTS = [{ key: 'circle', label: 'Circle' }, { key: 'rect', label: 'Rectangle' }, { key: 'heart', label: 'Heart' }, { key: 'star', label: 'Star' }, { key: 'diamond', label: 'Diamond' }];
    var FRAMES = [{ key: 'border', label: 'Border' }, { key: 'polaroid', label: 'Polaroid' }, { key: 'film', label: 'Film strip' }, { key: 'camcorder', label: 'Camcorder' },
      { key: 'rounded', label: 'Rounded screen' }, { key: 'mat', label: 'Gallery mat' }, { key: 'scallop', label: 'Old print' }, { key: 'corners', label: 'Photo corners' }];
    var FRAME_DEF = { border: { color: '#ffffff', width: 0.05 }, polaroid: { color: '#f7f3ea', width: 0.06 }, film: { color: '#111111', width: 0.13 },
      camcorder: { color: '#ffffff', width: 0.06 }, rounded: { color: '#000000', width: 0.06 }, mat: { color: '#f4efe6', width: 0.09 },
      scallop: { color: '#f8f5ee', width: 0.07 }, corners: { color: '#2b2b2b', width: 0.09 } };

    function hex(c, d) { var m = /^#?([0-9a-f]{6})$/i.exec(String(c == null ? '' : c).trim()); return m ? '#' + m[1].toLowerCase() : d; }
    function has(list, key) { for (var i = 0; i < list.length; i++) if (list[i].key === key) return true; return false; }
    function nameOf(list, key) { for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].label; return key; }
    function frameDefaults(k) { var d = FRAME_DEF[k] || FRAME_DEF.border; return { color: d.color, width: d.width }; }

    // Tidies a gen object (limits, defaults). Returns null when it is not a known kind.
    function clean(g) {
      if (!g || typeof g !== 'object') return null;
      if (g.kind === 'shape') {
        var shape = has(SHAPES, g.shape) ? g.shape : 'rect', line = shape === 'line';
        var fill = g.fill === undefined ? '#ffffff' : (!g.fill ? null : hex(g.fill, '#ffffff')), stroke = g.stroke ? hex(g.stroke, '#000000') : null;
        if (!fill && !stroke) fill = '#ffffff';
        return { kind: 'shape', shape: shape, fill: fill, stroke: stroke, strokeW: r3(clamp(num(g.strokeW, 0.04), 0, 0.2)),
          ar: r3(clamp(num(g.ar, AR[shape]), line ? 0.02 : 0.1, line ? 0.5 : 3)), corner: shape === 'rounded' ? r3(clamp(num(g.corner, 0.25), 0, 0.5)) : 0 };
      }
      if (g.kind === 'arrow') {
        return { kind: 'arrow', style: has(ARROWS, g.style) ? g.style : 'classic', color: hex(g.color, '#ff3b30'), thick: r3(clamp(num(g.thick, 0.2), 0.05, 0.5)),
          ar: r3(clamp(num(g.ar, 0.4), 0.15, 1.5)), curve: r3(clamp(num(g.curve, 0), -1, 1)) };
      }
      if (g.kind === 'spotlight') {
        return { kind: 'spotlight', full: true, shape: has(SPOTS, g.shape) ? g.shape : 'circle', cx: r3(clamp(num(g.cx, 0.5), 0, 1)), cy: r3(clamp(num(g.cy, 0.5), 0, 1)),
          size: r3(clamp(num(g.size, 0.5), 0.1, 1.5)), stretch: r3(clamp(num(g.stretch, 1), 0.3, 3)), dim: r3(clamp(num(g.dim, 0.7), 0, 1)),
          feather: r3(clamp(num(g.feather, 0.2), 0, 1)), rot: r3((((num(g.rot, 0) + 180) % 360) + 360) % 360 - 180) };
      }
      if (g.kind === 'frame') {
        var fk = has(FRAMES, g.frame) ? g.frame : 'border', fd = FRAME_DEF[fk];
        return { kind: 'frame', full: true, frame: fk, color: hex(g.color, fd.color), width: r3(clamp(num(g.width, fd.width), 0.02, 0.3)) };
      }
      return null;
    }
    function label(g) {
      if (!g) return 'Overlay';
      if (g.kind === 'shape') return 'Shape \u00b7 ' + nameOf(SHAPES, g.shape);
      if (g.kind === 'arrow') return 'Arrow \u00b7 ' + nameOf(ARROWS, g.style);
      if (g.kind === 'spotlight') return 'Spotlight';
      if (g.kind === 'frame') return 'Frame \u00b7 ' + nameOf(FRAMES, g.frame);
      return 'Overlay';
    }
    // The size of the picture this is drawn at: the whole video frame for spotlights and frames, otherwise a box of 1024 wide with the shape's own height.
    function natural(g, fw, fh) { return g.full ? { w: Math.max(2, fw), h: Math.max(2, fh) } : { w: 1024, h: Math.max(2, Math.round(1024 * (g.ar || 1))) }; }

    // ----- paths -----
    function rr(g, x, y, w, h, r) {   // a rounded rectangle added to the current path
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    function pathShape(g, shape, x, y, w, h, corner) {
      var cx = x + w / 2, cy = y + h / 2, i, a, r;
      g.beginPath();
      if (shape === 'rect') g.rect(x, y, w, h);
      else if (shape === 'rounded') rr(g, x, y, w, h, Math.min(w, h) * corner);
      else if (shape === 'circle') { g.save(); g.translate(cx, cy); g.scale(Math.max(0.01, w / 2), Math.max(0.01, h / 2)); g.arc(0, 0, 1, 0, Math.PI * 2); g.restore(); }
      else if (shape === 'triangle') { g.moveTo(cx, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); }
      else if (shape === 'diamond') { g.moveTo(cx, y); g.lineTo(x + w, cy); g.lineTo(cx, y + h); g.lineTo(x, cy); g.closePath(); }
      else if (shape === 'hexagon') { g.moveTo(x + w * 0.25, y); g.lineTo(x + w * 0.75, y); g.lineTo(x + w, cy); g.lineTo(x + w * 0.75, y + h); g.lineTo(x + w * 0.25, y + h); g.lineTo(x, cy); g.closePath(); }
      else if (shape === 'star') {
        for (i = 0; i < 10; i++) {
          a = -Math.PI / 2 + i * Math.PI / 5; r = i % 2 ? 0.42 : 1;
          var px = cx + Math.cos(a) * r * (w / 2) / 0.951, py = y + (Math.sin(a) * r + 1) / 1.809 * h;
          if (i) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.closePath();
      } else if (shape === 'heart') {
        g.moveTo(cx, y + h * 0.3);
        g.bezierCurveTo(cx, y, x, y, x, y + h * 0.32);
        g.bezierCurveTo(x, y + h * 0.62, cx - w * 0.05, y + h * 0.8, cx, y + h);
        g.bezierCurveTo(cx + w * 0.05, y + h * 0.8, x + w, y + h * 0.62, x + w, y + h * 0.32);
        g.bezierCurveTo(x + w, y, cx, y, cx, y + h * 0.3);
        g.closePath();
      }
    }
    function drawShape(g, s, w, h) {
      if (s.shape === 'line') {   // a line: its height is how thick it is
        g.strokeStyle = s.fill || s.stroke; g.lineWidth = h * 0.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(h * 0.5, h / 2); g.lineTo(w - h * 0.5, h / 2); g.stroke();
        return;
      }
      var sw = s.stroke ? Math.max(1, s.strokeW * Math.min(w, h)) : 0, pad = sw / 2;
      pathShape(g, s.shape, pad, pad, w - 2 * pad, h - 2 * pad, s.corner);
      if (s.fill) { g.fillStyle = s.fill; g.fill(); }
      if (sw) { g.strokeStyle = s.stroke; g.lineWidth = sw; g.lineJoin = 'round'; g.stroke(); }
    }
    function drawArrow(g, a, w, h) {
      var lw = Math.max(2, a.thick * h), padx = lw * 2.2, pady = lw * 1.8, p0 = { x: padx, y: h / 2 }, p1 = { x: w - padx, y: h / 2 };
      var bend = a.curve * Math.max(0, h / 2 - pady), cp = { x: w / 2, y: h / 2 + 2 * bend };
      var ae = Math.atan2(p1.y - cp.y, p1.x - cp.x), as = Math.atan2(p0.y - cp.y, p0.x - cp.x), de = { x: Math.cos(ae), y: Math.sin(ae) }, ds = { x: Math.cos(as), y: Math.sin(as) };
      var hl = lw * 3.4, hw = lw * 1.9, solid = a.style !== 'open', start = p0, end = p1;
      g.strokeStyle = a.color; g.fillStyle = a.color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
      if (solid) { end = { x: p1.x - de.x * hl * 0.8, y: p1.y - de.y * hl * 0.8 }; if (a.style === 'double') start = { x: p0.x - ds.x * hl * 0.8, y: p0.y - ds.y * hl * 0.8 }; }
      g.beginPath(); g.moveTo(start.x, start.y); g.quadraticCurveTo(cp.x, cp.y, end.x, end.y); g.stroke();
      function head(tip, d) {
        var bx = tip.x - d.x * hl, by = tip.y - d.y * hl, nx = -d.y, ny = d.x;
        g.beginPath(); g.moveTo(tip.x, tip.y); g.lineTo(bx + nx * hw, by + ny * hw); g.lineTo(bx - nx * hw, by - ny * hw); g.closePath(); g.fill();
      }
      if (solid) { head(p1, de); if (a.style === 'double') head(p0, ds); }
      else {   // an open head: two strokes back from the tip
        var L = hl * 1.1, c = Math.cos(0.58), sn = Math.sin(0.58);
        var w1 = { x: -(de.x * c - de.y * sn), y: -(de.x * sn + de.y * c) }, w2 = { x: -(de.x * c + de.y * sn), y: -(-de.x * sn + de.y * c) };
        g.beginPath(); g.moveTo(p1.x + w1.x * L, p1.y + w1.y * L); g.lineTo(p1.x, p1.y); g.lineTo(p1.x + w2.x * L, p1.y + w2.y * L); g.stroke();
      }
    }
    // The spotlight is a dark layer with a see-through hole: the hole is the same shape (and soft edge) maths as an overlay mask.
    function drawSpot(g, s, w, h) {
      var hh = s.size * Math.min(w, h), hw = hh * s.stretch;
      var m = cleanMask({ shape: s.shape, x: s.cx, y: s.cy, w: hw / w, h: hh / h, rot: s.rot, feather: s.feather, corner: s.shape === 'rect' ? 0.2 : 0 });
      if (!m) return;
      var im = g.createImageData(w, h), d = im.data, A = Math.round(s.dim * 255), x, y, o = 0;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++, o += 4) d[o + 3] = Math.round((1 - maskAlpha(m, x, y, w, h)) * A);
      g.putImageData(im, 0, 0);
    }

    // ----- frames: m is the thickness in pixels; the middle stays see-through -----
    function ring(g, w, h, x, y, iw, ih, col, r) {
      g.fillStyle = col; g.beginPath(); g.rect(0, 0, w, h);
      if (r) rr(g, x, y, iw, ih, r); else g.rect(x, y, iw, ih);
      g.fill('evenodd');
    }
    function edge(g, x, y, iw, ih, col, wd) { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.rect(x, y, iw, ih); g.stroke(); }
    var FR = {
      border: function (g, w, h, m, col) { ring(g, w, h, m, m, w - 2 * m, h - 2 * m, col, 0); },
      polaroid: function (g, w, h, m, col) {
        var k = Math.min(m, Math.min(w, h) * 0.1), bot = k * 3.3, ih = Math.max(2, h - k - bot);
        ring(g, w, h, k, k, w - 2 * k, ih, col, 0); edge(g, k, k, w - 2 * k, ih, 'rgba(0,0,0,0.3)', Math.max(1, k * 0.05));
      },
      film: function (g, w, h, m, col) {
        var b = Math.min(m, Math.min(w, h) * 0.2), horiz = w >= h, span = horiz ? w : h, pitch = b * 0.95, n = Math.max(1, Math.floor(span / pitch)), off = (span - n * pitch) / 2 + pitch / 2, hw = b * 0.5, hh = b * 0.42, i, c;
        g.fillStyle = col;
        if (horiz) { g.fillRect(0, 0, w, b); g.fillRect(0, h - b, w, b); } else { g.fillRect(0, 0, b, h); g.fillRect(w - b, 0, b, h); }
        g.fillStyle = '#e8e8e8';
        for (i = 0; i < n; i++) {
          c = off + i * pitch; g.beginPath();
          if (horiz) { rr(g, c - hw / 2, (b - hh) / 2, hw, hh, hh * 0.25); rr(g, c - hw / 2, h - b + (b - hh) / 2, hw, hh, hh * 0.25); }
          else { rr(g, (b - hh) / 2, c - hw / 2, hh, hw, hh * 0.25); rr(g, w - b + (b - hh) / 2, c - hw / 2, hh, hw, hh * 0.25); }
          g.fill();
        }
        g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = Math.max(1, b * 0.03); g.beginPath();
        if (horiz) { g.moveTo(0, b); g.lineTo(w, b); g.moveTo(0, h - b); g.lineTo(w, h - b); } else { g.moveTo(b, 0); g.lineTo(b, h); g.moveTo(w - b, 0); g.lineTo(w - b, h); }
        g.stroke();
      },
      camcorder: function (g, w, h, m, col) {   // a viewfinder: corner brackets, a REC light, a battery, a centre cross
        var mg = m, len = m * 1.6, t = Math.max(2, m * 0.1), fs = Math.max(8, Math.round(m * 0.75)), cx = w / 2, cy = h / 2, arm = m * 0.6, i;
        g.strokeStyle = col; g.fillStyle = col; g.lineWidth = t; g.lineCap = 'square'; g.lineJoin = 'miter';
        [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (q) {
          var x = q[0] ? w - mg : mg, y = q[1] ? h - mg : mg, dx = q[0] ? -1 : 1, dy = q[1] ? -1 : 1;
          g.beginPath(); g.moveTo(x + dx * len, y); g.lineTo(x, y); g.lineTo(x, y + dy * len); g.stroke();
        });
        g.beginPath(); g.moveTo(cx - arm, cy); g.lineTo(cx + arm, cy); g.moveTo(cx, cy - arm); g.lineTo(cx, cy + arm); g.stroke();
        g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = 'bold ' + fs + 'px monospace';
        var y0 = mg + len * 0.55 + fs * 0.5, y1 = h - mg - len * 0.55 - fs * 0.5;
        g.fillStyle = '#ff2d2d'; g.beginPath(); g.arc(mg + fs * 0.5, y0, fs * 0.32, 0, Math.PI * 2); g.fill();
        g.fillStyle = col; g.fillText('REC', mg + fs * 1.1, y0);
        var bw = fs * 1.8, bh = fs * 0.8, bx = w - mg - bw - fs * 0.2, by = y0 - bh / 2;
        g.lineWidth = Math.max(1, t * 0.6); g.strokeRect(bx, by, bw, bh); g.fillRect(bx + bw, by + bh * 0.3, bh * 0.15, bh * 0.4);
        for (i = 0; i < 3; i++) g.fillRect(bx + bw * 0.08 + i * bw * 0.3, by + bh * 0.18, bw * 0.24, bh * 0.64);
        g.beginPath(); g.moveTo(mg, y1 - fs * 0.35); g.lineTo(mg + fs * 0.6, y1); g.lineTo(mg, y1 + fs * 0.35); g.closePath(); g.fill();
        g.fillText('PLAY', mg + fs * 0.9, y1);
      },
      rounded: function (g, w, h, m, col) { var ins = m * 0.25; ring(g, w, h, ins, ins, w - 2 * ins, h - 2 * ins, col, m * 2.4); },
      mat: function (g, w, h, m, col) {
        ring(g, w, h, m, m, w - 2 * m, h - 2 * m, col, 0);
        edge(g, m * 0.72, m * 0.72, w - m * 1.44, h - m * 1.44, 'rgba(120,105,80,0.55)', Math.max(1, m * 0.035));
        edge(g, m, m, w - 2 * m, h - 2 * m, 'rgba(0,0,0,0.35)', Math.max(1, m * 0.04));
      },
      scallop: function (g, w, h, m, col) {   // an old print: a white border with a scalloped edge
        ring(g, w, h, m, m, w - 2 * m, h - 2 * m, col, 0);
        var rad = m * 0.4, pitch = rad * 2.7, nx = Math.max(1, Math.floor(w / pitch)), ny = Math.max(1, Math.floor(h / pitch)), ox = (w - nx * pitch) / 2 + pitch / 2, oy = (h - ny * pitch) / 2 + pitch / 2, i;
        function cut(x, y) { g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); }
        g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
        for (i = 0; i < nx; i++) { cut(ox + i * pitch, 0); cut(ox + i * pitch, h); }
        for (i = 0; i < ny; i++) { cut(0, oy + i * pitch); cut(w, oy + i * pitch); }
        g.restore();
        edge(g, m, m, w - 2 * m, h - 2 * m, 'rgba(0,0,0,0.25)', Math.max(1, m * 0.04));
      },
      corners: function (g, w, h, m, col) {   // the little triangles old albums used to hold a photo
        var c = m * 2.4;
        g.fillStyle = col; g.lineWidth = Math.max(1, m * 0.03); g.strokeStyle = 'rgba(255,255,255,0.3)';
        [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]].forEach(function (q) {
          g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + q[2] * c, q[1]); g.lineTo(q[0], q[1] + q[3] * c); g.closePath(); g.fill(); g.stroke();
        });
      }
    };

    // ---------- more frames: the creative set ----------
    // Each one is drawn by code onto a see-through picture the size of the video, so it looks the same in the preview and in both exports. The middle stays
    // clear. m is the thickness in pixels, col the colour the person picked (a few use more colours made from it).
    (function () {
      var PI = Math.PI;
      function rgb(h) { var n = parseInt(String(h).replace('#', ''), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
      function toHex(a) { return '#' + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
      function mix(a, b, t) { var x = rgb(a), y = rgb(b); return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); }
      function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
      function ink(h) { var c = rgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 150 ? '#111111' : '#ffffff'; }   // black or white, whichever shows on h
      function hueShift(h, deg) {
        var c = rgb(h), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = 0, hh = 0, d = mx - mn;
        if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6; }
        if (!s) return toHex([l * 255, l * 255, l * 255]);
        hh = (hh + deg / 360) % 1; if (hh < 0) hh += 1;
        function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        return toHex([f(p, q, hh + 1 / 3) * 255, f(p, q, hh) * 255, f(p, q, hh - 1 / 3) * 255]);
      }
      function rnd(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }   // 0 to 1, always the same
      function rrect(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
      function band(g, w, h, m, col, r) { g.fillStyle = col; g.beginPath(); g.rect(0, 0, w, h); if (r) rrect(g, m, m, w - 2 * m, h - 2 * m, r); else g.rect(m, m, w - 2 * m, h - 2 * m); g.fill('evenodd'); }
      function clipBand(g, w, h, m) { g.beginPath(); g.rect(0, 0, w, h); g.rect(m, m, w - 2 * m, h - 2 * m); g.clip('evenodd'); }
      function put(g, x, y, a, fn) { g.save(); g.translate(x, y); g.rotate(a); fn(); g.restore(); }
      // Items along the four sides, `off` pixels in from the edge, about `pitch` apart. fn(x, y, angle, i) is called for each; draw it with put() so that +y points into the picture.
      function along(w, h, off, pitch, fn) {
        var iw = w - 2 * off, ih = h - 2 * off, nx = Math.max(1, Math.round(iw / pitch)), ny = Math.max(1, Math.round(ih / pitch)), k, i = 0;
        for (k = 0; k < nx; k++) fn(off + (k + 0.5) * iw / nx, off, 0, i++);
        for (k = 0; k < ny; k++) fn(w - off, off + (k + 0.5) * ih / ny, PI / 2, i++);
        for (k = 0; k < nx; k++) fn(w - off - (k + 0.5) * iw / nx, h - off, PI, i++);
        for (k = 0; k < ny; k++) fn(off, h - off - (k + 0.5) * ih / ny, -PI / 2, i++);
      }
      function corners(g, w, h, fn) { [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]].forEach(function (q) { g.save(); g.translate(q[0], q[1]); g.scale(q[2], q[3]); fn(); g.restore(); }); }
      function lw(g, v, col) { g.lineWidth = Math.max(1, v); g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; }
      function poly(g, pts) { g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); }
      function heartPath(g, s) { g.beginPath(); g.moveTo(0, s * 0.35); g.bezierCurveTo(0, -s * 0.1, -s, -s * 0.1, -s, s * 0.35); g.bezierCurveTo(-s, s * 0.8, -s * 0.15, s * 1.0, 0, s * 1.25); g.bezierCurveTo(s * 0.15, s * 1.0, s, s * 0.8, s, s * 0.35); g.bezierCurveTo(s, -s * 0.1, 0, -s * 0.1, 0, s * 0.35); g.closePath(); }
      function starPath(g, r, pts, inner) { g.beginPath(); for (var i = 0; i < pts * 2; i++) { var a = -PI / 2 + i * PI / pts, rr = i % 2 ? r * inner : r; if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); }
      function glowOn(g, col, blur) { g.shadowColor = col; g.shadowBlur = blur; }
      function glowOff(g) { g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)'; }
      function neon(g, col, m, draw) {   // a glowing tube: a wide faint glow, the coloured tube, and a pale hot core
        var t = Math.max(2, m * 0.22);
        lw(g, t * 1.7, col); glowOn(g, col, m * 1.6); g.beginPath(); draw(); g.stroke();
        lw(g, t, col); glowOn(g, col, m * 0.6); g.beginPath(); draw(); g.stroke();
        glowOff(g); lw(g, t * 0.42, mix(col, '#ffffff', 0.82)); g.beginPath(); draw(); g.stroke();
      }
      function jag(g, x0, y0, x1, y1, amp, r, step) {   // a jagged line from one point to another
        var len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / step)), nx = -(y1 - y0) / len, ny = (x1 - x0) / len, i, o;
        g.moveTo(x0, y0);
        for (i = 1; i < n; i++) { o = (r() - 0.5) * 2 * amp; g.lineTo(x0 + (x1 - x0) * i / n + nx * o, y0 + (y1 - y0) * i / n + ny * o); }
        g.lineTo(x1, y1);
      }
      function stripes(g, w, h, m, a, b, sw) {   // diagonal stripes in two colours over the border band
        g.save(); clipBand(g, w, h, m);
        g.fillStyle = b; g.fillRect(0, 0, w, h);
        g.fillStyle = a;
        for (var x = -h; x < w + h; x += sw * 2) { poly(g, [[x, h], [x + sw, h], [x + sw + h, 0], [x + h, 0]]); g.fill(); }
        g.restore();
      }
      function add(key, label, cat, color, width, fn) { FRAMES.push({ key: key, label: label, cat: cat }); FRAME_DEF[key] = { color: color, width: width }; FR[key] = fn; }
      FRAMES.forEach(function (f) { if (!f.cat) f.cat = 'Classic'; });

      // ----- Lines -----
      add('thin', 'Thin line', 'Lines', '#ffffff', 0.04, function (g, w, h, m, col) {
        lw(g, m * 0.07, 'rgba(0,0,0,0.35)'); g.beginPath(); g.rect(m * 0.38, m * 0.38, w - m * 0.76, h - m * 0.76); g.stroke();   // a faint dark edge, so the line shows on light pictures too
        lw(g, m * 0.12, col); g.beginPath(); g.rect(m * 0.5, m * 0.5, w - m, h - m); g.stroke();
      });
      add('double', 'Double line', 'Lines', '#ffffff', 0.05, function (g, w, h, m, col) {
        lw(g, m * 0.1, col); g.beginPath(); g.rect(m * 0.2, m * 0.2, w - m * 0.4, h - m * 0.4); g.stroke(); g.beginPath(); g.rect(m * 0.6, m * 0.6, w - m * 1.2, h - m * 1.2); g.stroke();
      });
      add('dashed', 'Dashed', 'Lines', '#ffffff', 0.05, function (g, w, h, m, col) { lw(g, m * 0.22, col); g.lineCap = 'butt'; g.setLineDash([m * 0.9, m * 0.5]); g.beginPath(); g.rect(m * 0.5, m * 0.5, w - m, h - m); g.stroke(); g.setLineDash([]); });
      add('dotted', 'Dotted', 'Lines', '#ffffff', 0.05, function (g, w, h, m, col) { lw(g, m * 0.34, col); g.setLineDash([0.01, m * 0.7]); g.beginPath(); g.rect(m * 0.5, m * 0.5, w - m, h - m); g.stroke(); g.setLineDash([]); });
      add('bevel', 'Bevel', 'Lines', '#b08850', 0.06, function (g, w, h, m, col) {
        var sides = [[[0, 0], [w, 0], [w - m, m], [m, m]], [[w, 0], [w, h], [w - m, h - m], [w - m, m]], [[w, h], [0, h], [m, h - m], [w - m, h - m]], [[0, h], [0, 0], [m, m], [m, h - m]]], tone = [0.55, 0.15, -0.35, 0.3];
        sides.forEach(function (s, i) { g.fillStyle = tone[i] > 0 ? mix(col, '#ffffff', tone[i]) : mix(col, '#000000', -tone[i]); poly(g, s); g.fill(); });
        lw(g, Math.max(1, m * 0.04), 'rgba(0,0,0,0.35)'); g.beginPath(); g.rect(m, m, w - 2 * m, h - 2 * m); g.stroke();
      });
      add('shadowbox', 'Shadow box', 'Lines', '#f4f1ea', 0.06, function (g, w, h, m, col) {
        band(g, w, h, m, col, 0); g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(m, m, w - 2 * m, m * 0.4); g.fillRect(m, m, m * 0.4, h - 2 * m);
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(m, m + m * 0.4, w - 2 * m, m * 0.25); g.fillRect(m + m * 0.4, m, m * 0.25, h - 2 * m);
      });
      add('roundline', 'Rounded outline', 'Lines', '#ffffff', 0.05, function (g, w, h, m, col) { lw(g, m * 0.24, col); g.beginPath(); rrect(g, m * 0.6, m * 0.6, w - m * 1.2, h - m * 1.2, m * 2.2); g.stroke(); });
      add('chamfer', 'Cut corners', 'Lines', '#ffffff', 0.05, function (g, w, h, m, col) {
        var c = m * 2.4; g.fillStyle = col; g.beginPath(); g.rect(0, 0, w, h);
        g.moveTo(m + c, m); g.lineTo(m, m + c); g.lineTo(m, h - m - c); g.lineTo(m + c, h - m); g.lineTo(w - m - c, h - m); g.lineTo(w - m, h - m - c); g.lineTo(w - m, m + c); g.lineTo(w - m - c, m); g.closePath(); g.fill('evenodd');
      });

      // ----- Cinema and screens -----
      add('letterbox', 'Letterbox', 'Cinema', '#000000', 0.07, function (g, w, h, m, col) {
        g.fillStyle = col; g.fillRect(0, 0, w, m * 2.2); g.fillRect(0, h - m * 2.2, w, m * 2.2);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, m * 2.2, w, m * 0.25); g.fillRect(0, h - m * 2.45, w, m * 0.25);   // a soft edge where the bars meet the picture
      });
      add('cinescope', 'Widescreen', 'Cinema', '#000000', 0.07, function (g, w, h, m, col) {
        g.fillStyle = col; g.fillRect(0, 0, w, m * 2.6); g.fillRect(0, h - m * 2.6, w, m * 2.6);
        lw(g, Math.max(1, m * 0.05), 'rgba(255,255,255,0.45)'); g.beginPath(); g.moveTo(0, m * 2.6); g.lineTo(w, m * 2.6); g.moveTo(0, h - m * 2.6); g.lineTo(w, h - m * 2.6); g.stroke();
      });
      add('slate', 'Clapperboard', 'Cinema', '#111111', 0.06, function (g, w, h, m, col) {
        var bh = m * 1.7; g.save(); g.beginPath(); g.rect(0, 0, w, bh); g.clip(); g.fillStyle = col; g.fillRect(0, 0, w, bh); g.fillStyle = ink(col);
        for (var x = -bh; x < w + bh; x += bh * 1.6) { poly(g, [[x, bh], [x + bh * 0.8, bh], [x + bh * 1.8, 0], [x + bh, 0]]); g.fill(); }
        g.restore(); g.fillStyle = col; g.fillRect(0, bh, w, m * 0.25); g.fillRect(0, h - m * 0.7, w, m * 0.7);
      });
      add('vhs', 'VHS tape', 'Cinema', '#ffffff', 0.06, function (g, w, h, m, col) {
        var fs = Math.max(8, Math.round(m * 0.95)), r = rnd(5), i; g.font = 'bold ' + fs + 'px monospace'; g.textBaseline = 'top'; g.textAlign = 'left';
        g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = fs * 0.3; g.fillStyle = col;
        poly(g, [[m, m * 0.7], [m, m * 0.7 + fs * 0.8], [m + fs * 0.7, m * 0.7 + fs * 0.4]]); g.fill(); g.fillText('PLAY', m + fs * 1.0, m * 0.7);
        g.textAlign = 'right'; g.fillText('SP', w - m, m * 0.7); g.textBaseline = 'bottom'; g.fillText('0:00:00', w - m, h - m * 0.7); g.textAlign = 'left'; g.fillText('AUG. 12 1999', m, h - m * 0.7); g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)';
        for (i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.08 + r() * 0.12) + ')'; g.fillRect(r() * w * 0.5, h * 0.86 + i * m * 0.12, w * (0.2 + r() * 0.5), Math.max(1, m * 0.07)); }
        g.fillStyle = 'rgba(0,0,0,0.07)'; for (i = 0; i < h; i += Math.max(3, m * 0.35)) g.fillRect(0, i, w, Math.max(1, m * 0.08));   // faint scan lines over the whole picture
      });
      add('crt', 'Old TV', 'Cinema', '#1b1b1b', 0.07, function (g, w, h, m, col) {
        band(g, w, h, m, col, m * 3.4); lw(g, Math.max(1, m * 0.1), 'rgba(255,255,255,0.18)'); g.beginPath(); rrect(g, m * 1.05, m * 1.05, w - m * 2.1, h - m * 2.1, m * 3.0); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); g.arc(m * 3.4, m * 3.0, m * 0.7, 0, PI * 2); g.fill();
      });
      add('live', 'Live badge', 'Cinema', '#e11d2e', 0.05, function (g, w, h, m, col) {
        var bw = m * 3.2, bh = m * 1.25, x = m * 0.9, y = m * 0.9, fs = Math.max(8, Math.round(bh * 0.62));
        lw(g, m * 0.14, rgba(col, 0.9)); g.beginPath(); g.rect(m * 0.3, m * 0.3, w - m * 0.6, h - m * 0.6); g.stroke();
        g.fillStyle = col; g.beginPath(); rrect(g, x, y, bw, bh, bh * 0.25); g.fill();
        g.fillStyle = ink(col); g.beginPath(); g.arc(x + bh * 0.5, y + bh / 2, bh * 0.16, 0, PI * 2); g.fill();
        g.font = 'bold ' + fs + 'px sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('LIVE', x + bh * 0.85, y + bh / 2 + fs * 0.04);
      });
      add('cctv', 'Security cam', 'Cinema', '#ffffff', 0.05, function (g, w, h, m, col) {
        var fs = Math.max(8, Math.round(m * 0.9)), len = m * 2.6; g.font = 'bold ' + fs + 'px monospace'; g.fillStyle = col; g.textBaseline = 'top'; g.textAlign = 'left'; g.fillText('CAM 01', m, m * 0.8);
        g.fillStyle = '#ff2d2d'; g.beginPath(); g.arc(w - m * 3.6, m * 0.8 + fs * 0.5, fs * 0.28, 0, PI * 2); g.fill(); g.fillStyle = col; g.textAlign = 'right'; g.fillText('REC', w - m, m * 0.8);
        lw(g, Math.max(1, m * 0.12), col); g.lineCap = 'butt';
        corners(g, w, h, function () { g.beginPath(); g.moveTo(m * 0.45 + len, m * 0.45); g.lineTo(m * 0.45, m * 0.45); g.lineTo(m * 0.45, m * 0.45 + len); g.stroke(); });
      });
      add('hud', 'Tech HUD', 'Cinema', '#35e0ff', 0.05, function (g, w, h, m, col) {
        var len = m * 3.2, i, n = Math.floor(w / (m * 0.7)); lw(g, Math.max(1, m * 0.16), col); g.lineCap = 'butt';
        corners(g, w, h, function () { g.beginPath(); g.moveTo(m * 0.4 + len, m * 0.4); g.lineTo(m * 0.4, m * 0.4); g.lineTo(m * 0.4, m * 0.4 + len); g.stroke(); g.beginPath(); g.moveTo(m * 0.9 + len * 0.5, m * 0.9); g.lineTo(m * 0.9, m * 0.9); g.lineTo(m * 0.9, m * 0.9 + len * 0.5); g.stroke(); });
        lw(g, Math.max(1, m * 0.06), rgba(col, 0.8)); g.lineCap = 'butt'; g.beginPath();
        for (i = 0; i <= n; i++) { var x = w * i / n, tl = i % 5 ? m * 0.22 : m * 0.45; g.moveTo(x, m * 0.4); g.lineTo(x, m * 0.4 + tl); g.moveTo(x, h - m * 0.4); g.lineTo(x, h - m * 0.4 - tl); }
        g.stroke(); lw(g, Math.max(1, m * 0.1), col); g.beginPath(); g.moveTo(w / 2 - m * 0.7, h / 2); g.lineTo(w / 2 + m * 0.7, h / 2); g.moveTo(w / 2, h / 2 - m * 0.7); g.lineTo(w / 2, h / 2 + m * 0.7); g.stroke();
      });

      // ----- Corners -----
      add('brackets', 'Corner brackets', 'Corners', '#ffffff', 0.05, function (g, w, h, m, col) {
        lw(g, m * 0.3, col); g.lineCap = 'square'; corners(g, w, h, function () { g.beginPath(); g.moveTo(m * 0.7 + m * 3.6, m * 0.7); g.lineTo(m * 0.7, m * 0.7); g.lineTo(m * 0.7, m * 0.7 + m * 3.6); g.stroke(); });
      });
      add('cornerarcs', 'Corner arcs', 'Corners', '#ffffff', 0.05, function (g, w, h, m, col) {
        lw(g, m * 0.22, col); corners(g, w, h, function () { g.beginPath(); g.arc(0, 0, m * 3.4, 0, PI / 2); g.stroke(); g.beginPath(); g.arc(0, 0, m * 2.3, 0, PI / 2); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(m * 0.9, m * 0.9, m * 0.28, 0, PI * 2); g.fill(); });
      });
      add('ornate', 'Ornate corners', 'Corners', '#d9b24c', 0.05, function (g, w, h, m, col) {
        corners(g, w, h, function () {
          lw(g, m * 0.2, col); g.beginPath(); g.arc(m * 0.9, m * 0.9, m * 3, PI, PI * 1.5); g.stroke(); g.beginPath(); g.moveTo(m * 0.9, m * 3.9); g.lineTo(m * 0.9, m * 7); g.moveTo(m * 3.9, m * 0.9); g.lineTo(m * 7, m * 0.9); g.stroke();
          g.beginPath(); g.arc(m * 2.2, m * 2.2, m * 1.1, PI * 1.05, PI * 1.45); g.stroke();
          g.fillStyle = col; g.beginPath(); g.arc(m * 3.9, m * 0.9, m * 0.32, 0, PI * 2); g.arc(m * 0.9, m * 3.9, m * 0.32, 0, PI * 2); g.arc(m * 2.2, m * 2.2, m * 0.38, 0, PI * 2); g.fill();
        });
      });
      add('diamondcorners', 'Diamond corners', 'Corners', '#ffffff', 0.05, function (g, w, h, m, col) {
        corners(g, w, h, function () { g.fillStyle = col; poly(g, [[m * 1.2, m * 0.5], [m * 1.9, m * 1.2], [m * 1.2, m * 1.9], [m * 0.5, m * 1.2]]); g.fill(); lw(g, m * 0.12, col); g.lineCap = 'butt'; g.beginPath(); g.moveTo(m * 2.5, m * 1.2); g.lineTo(m * 8, m * 1.2); g.moveTo(m * 1.2, m * 2.5); g.lineTo(m * 1.2, m * 8); g.stroke(); });
      });
      add('crops', 'Crop marks', 'Corners', '#ffffff', 0.05, function (g, w, h, m, col) {
        lw(g, Math.max(1, m * 0.1), col); g.lineCap = 'butt'; corners(g, w, h, function () {
          g.beginPath(); g.arc(m * 1.6, m * 1.6, m * 0.7, 0, PI * 2); g.moveTo(m * 0.4, m * 1.6); g.lineTo(m * 2.8, m * 1.6); g.moveTo(m * 1.6, m * 0.4); g.lineTo(m * 1.6, m * 2.8); g.stroke();
          g.beginPath(); g.moveTo(m * 3.4, m * 1.6); g.lineTo(m * 5.4, m * 1.6); g.moveTo(m * 1.6, m * 3.4); g.lineTo(m * 1.6, m * 5.4); g.stroke();
        });
      });
      add('tape', 'Washi tape', 'Corners', '#f4a6c0', 0.05, function (g, w, h, m, col) {
        var tl = m * 6, tw = m * 1.5; corners(g, w, h, function () {
          g.save(); g.translate(m * 0.4, m * 0.4); g.rotate(-PI / 4); g.fillStyle = rgba(col, 0.82); g.fillRect(-tl / 2, -tw / 2, tl, tw);
          g.fillStyle = 'rgba(255,255,255,0.35)'; for (var i = -tl / 2 + m * 0.4; i < tl / 2; i += m * 0.9) g.fillRect(i, -tw / 2, m * 0.3, tw);
          g.restore();
        });
      });

      // ----- Patterns -----
      add('checker', 'Checker', 'Pattern', '#111111', 0.05, function (g, w, h, m, col) {
        var s = m / 2, a = col, b = ink(col) === '#ffffff' ? '#ffffff' : '#ffffff', x, y, i, j; b = ink(col);
        for (j = 0; j * s < h; j++) for (i = 0; i * s < w; i++) { x = i * s; y = j * s; if (x < m || y < m || x + s > w - m || y + s > h - m) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(x, y, s + 0.5, s + 0.5); } }
      });
      add('candy', 'Candy stripes', 'Pattern', '#e8334a', 0.05, function (g, w, h, m, col) { stripes(g, w, h, m, col, '#ffffff', m * 0.8); });
      add('caution', 'Caution tape', 'Pattern', '#ffd400', 0.05, function (g, w, h, m, col) { stripes(g, w, h, m, col, '#141414', m * 0.8); });
      add('airmail', 'Airmail', 'Pattern', '#e11d2e', 0.05, function (g, w, h, m, col) { stripes(g, w, h, m, col, '#1f4fd8', m * 0.7); });
      add('zigzag', 'Zigzag', 'Pattern', '#ffffff', 0.05, function (g, w, h, m, col) {
        band(g, w, h, m * 0.5, col, 0); g.fillStyle = col; along(w, h, m * 0.5, m * 0.9, function (x, y, a) { put(g, x, y, a, function () { poly(g, [[-m * 0.45, 0], [m * 0.45, 0], [0, m * 0.95]]); g.fill(); }); });
      });
      add('waves', 'Waves', 'Pattern', '#ffffff', 0.05, function (g, w, h, m, col) {
        var i, n = 90; lw(g, m * 0.3, col); g.beginPath();
        for (i = 0; i <= n; i++) { var x = w * i / n, y = m * 0.6 + Math.sin(i / n * w / (m * 1.7) * PI) * m * 0.3; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); g.beginPath();
        for (i = 0; i <= n; i++) { var x2 = w * i / n, y2 = h - m * 0.6 + Math.sin(i / n * w / (m * 1.7) * PI) * m * 0.3; if (i) g.lineTo(x2, y2); else g.moveTo(x2, y2); } g.stroke(); g.beginPath();
        for (i = 0; i <= n; i++) { var y3 = h * i / n, x3 = m * 0.6 + Math.sin(i / n * h / (m * 1.7) * PI) * m * 0.3; if (i) g.lineTo(x3, y3); else g.moveTo(x3, y3); } g.stroke(); g.beginPath();
        for (i = 0; i <= n; i++) { var y4 = h * i / n, x4 = w - m * 0.6 + Math.sin(i / n * h / (m * 1.7) * PI) * m * 0.3; if (i) g.lineTo(x4, y4); else g.moveTo(x4, y4); } g.stroke();
      });
      add('polka', 'Polka dots', 'Pattern', '#ff7aa8', 0.06, function (g, w, h, m, col) {
        g.fillStyle = col; [m * 0.3, m * 0.75].forEach(function (o, k) { along(w, h, o, m * 0.78, function (x, y, a, i) { if ((i + k) % 2 === 0) { g.beginPath(); g.arc(x, y, m * 0.2, 0, PI * 2); g.fill(); } }); });
        g.fillStyle = mix(col, '#ffffff', 0.55); along(w, h, m * 0.52, m * 0.78, function (x, y) { g.beginPath(); g.arc(x, y, m * 0.14, 0, PI * 2); g.fill(); });
      });
      add('greek', 'Greek key', 'Pattern', '#d9b24c', 0.05, function (g, w, h, m, col) {
        var u = m * 0.85; lw(g, Math.max(1, m * 0.14), col); g.lineJoin = 'miter'; g.lineCap = 'butt';
        along(w, h, m * 0.55, u * 1.3, function (x, y, a) { put(g, x, y, a, function () { g.beginPath(); g.moveTo(-u / 2, u / 2); g.lineTo(-u / 2, -u / 2); g.lineTo(u / 2, -u / 2); g.lineTo(u / 2, u * 0.2); g.lineTo(-u * 0.12, u * 0.2); g.lineTo(-u * 0.12, -u * 0.12); g.lineTo(u * 0.12, -u * 0.12); g.stroke(); }); });
        lw(g, Math.max(1, m * 0.08), col); g.beginPath(); g.rect(m * 0.12, m * 0.12, w - m * 0.24, h - m * 0.24); g.stroke(); g.beginPath(); g.rect(m * 0.98, m * 0.98, w - m * 1.96, h - m * 1.96); g.stroke();
      });
      add('stitch', 'Stitched', 'Pattern', '#c9783b', 0.06, function (g, w, h, m, col) {
        band(g, w, h, m, col, m * 0.5); lw(g, m * 0.1, mix(col, '#000000', 0.4)); g.beginPath(); rrect(g, m, m, w - 2 * m, h - 2 * m, m * 0.5); g.stroke();
        lw(g, m * 0.13, '#f6efe0'); g.lineCap = 'butt'; g.setLineDash([m * 0.42, m * 0.3]); g.beginPath(); rrect(g, m * 0.55, m * 0.55, w - m * 1.1, h - m * 1.1, m * 0.25); g.stroke(); g.setLineDash([]);
      });
      add('rope', 'Rope', 'Pattern', '#c8a465', 0.05, function (g, w, h, m, col) {
        var dark = mix(col, '#000000', 0.4); along(w, h, m * 0.5, m * 0.5, function (x, y, a) { put(g, x, y, a, function () { g.rotate(0.65); g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, m * 0.5, m * 0.24, 0, 0, PI * 2); g.fill(); lw(g, m * 0.06, dark); g.stroke(); }); });
      });

      // ----- Fun -----
      add('hearts', 'Hearts', 'Fun', '#ff4d79', 0.06, function (g, w, h, m, col) {
        along(w, h, m * 0.5, m * 1.5, function (x, y, a, i) { put(g, x, y, a, function () { g.fillStyle = i % 2 ? mix(col, '#ffffff', 0.5) : col; heartPath(g, m * (i % 2 ? 0.34 : 0.5)); g.translate(0, -m * 0.2); g.fill(); }); });
      });
      add('starchain', 'Star chain', 'Fun', '#ffd60a', 0.06, function (g, w, h, m, col) {
        along(w, h, m * 0.55, m * 1.4, function (x, y, a, i) { put(g, x, y, a, function () { g.fillStyle = i % 2 ? mix(col, '#ffffff', 0.55) : col; starPath(g, m * (i % 2 ? 0.34 : 0.55), 5, 0.45); g.fill(); }); });
      });
      add('confetti', 'Confetti', 'Fun', '#ff4d6d', 0.07, function (g, w, h, m, col) {
        var r = rnd(21), n = Math.round(2 * (w + h) / (m * 0.8)), i, side, t, x, y, k;
        for (i = 0; i < n; i++) {
          side = Math.floor(r() * 4); t = r(); k = r() * m * 1.5;
          x = side === 0 ? t * w : side === 2 ? t * w : side === 1 ? w - k : k; y = side === 1 || side === 3 ? t * h : side === 0 ? k : h - k;
          g.save(); g.translate(x, y); g.rotate(r() * PI); g.fillStyle = hueShift(col, Math.floor(r() * 5) * 72);
          if (r() < 0.4) { g.beginPath(); g.arc(0, 0, m * (0.1 + r() * 0.12), 0, PI * 2); g.fill(); } else g.fillRect(-m * 0.16, -m * 0.07, m * (0.22 + r() * 0.22), m * 0.14);
          g.restore();
        }
      });
      add('bubbles', 'Bubbles', 'Fun', '#7fd8ff', 0.07, function (g, w, h, m, col) {
        var r = rnd(8), n = Math.round(2 * (w + h) / (m * 1.2)), i, side, t, k, x, y, rad;
        for (i = 0; i < n; i++) {
          side = Math.floor(r() * 4); t = r(); k = r() * m * 1.4; rad = m * (0.18 + r() * 0.42);
          x = side < 2 ? (side === 0 ? t * w : w - k) : (side === 2 ? t * w : k); y = side === 1 || side === 3 ? t * h : side === 0 ? k : h - k;
          g.fillStyle = rgba(col, 0.22); g.beginPath(); g.arc(x, y, rad, 0, PI * 2); g.fill(); lw(g, Math.max(1, rad * 0.14), rgba('#ffffff', 0.75)); g.beginPath(); g.arc(x, y, rad, 0, PI * 2); g.stroke();
          lw(g, Math.max(1, rad * 0.16), rgba('#ffffff', 0.9)); g.beginPath(); g.arc(x, y, rad * 0.68, PI * 1.1, PI * 1.45); g.stroke();
        }
      });
      add('sparkles', 'Sparkles', 'Fun', '#fff3a0', 0.07, function (g, w, h, m, col) {
        var r = rnd(33), n = Math.round(2 * (w + h) / (m * 1.7)), i, side, t, k, x, y, s;
        for (i = 0; i < n; i++) {
          side = Math.floor(r() * 4); t = r(); k = r() * m * 1.6; s = m * (0.2 + r() * 0.55);
          x = side < 2 ? (side === 0 ? t * w : w - k) : (side === 2 ? t * w : k); y = side === 1 || side === 3 ? t * h : side === 0 ? k : h - k;
          g.save(); g.translate(x, y); g.fillStyle = i % 3 ? col : '#ffffff'; starPath(g, s, 4, 0.22); g.fill(); g.restore();
        }
      });
      add('clouds', 'Clouds', 'Fun', '#ffffff', 0.06, function (g, w, h, m, col) {
        band(g, w, h, m * 0.5, col, 0); g.fillStyle = col; along(w, h, m * 0.55, m * 0.95, function (x, y, a, i) { g.beginPath(); g.arc(x, y, m * (0.62 + 0.18 * ((i * 7) % 3) / 2), 0, PI * 2); g.fill(); });
        g.fillStyle = 'rgba(120,160,210,0.18)'; along(w, h, m * 1.0, m * 0.95, function (x, y) { g.beginPath(); g.arc(x, y, m * 0.2, 0, PI * 2); g.fill(); });
      });
      add('flowers', 'Flower chain', 'Fun', '#ff8fb8', 0.06, function (g, w, h, m, col) {
        lw(g, m * 0.1, '#3f9b4a'); g.beginPath(); g.rect(m * 0.55, m * 0.55, w - m * 1.1, h - m * 1.1); g.stroke();
        along(w, h, m * 0.55, m * 1.5, function (x, y, a, i) { put(g, x, y, a, function () { var c = i % 2 ? col : hueShift(col, 40), k; g.fillStyle = c; for (k = 0; k < 5; k++) { g.beginPath(); g.arc(Math.cos(k * PI * 0.4) * m * 0.3, Math.sin(k * PI * 0.4) * m * 0.3, m * 0.24, 0, PI * 2); g.fill(); } g.fillStyle = '#ffd84d'; g.beginPath(); g.arc(0, 0, m * 0.18, 0, PI * 2); g.fill(); }); });
      });
      add('leaves', 'Leafy vine', 'Fun', '#3f9b4a', 0.06, function (g, w, h, m, col) {
        lw(g, m * 0.1, mix(col, '#000000', 0.35)); g.beginPath(); g.rect(m * 0.55, m * 0.55, w - m * 1.1, h - m * 1.1); g.stroke();
        along(w, h, m * 0.55, m * 0.9, function (x, y, a, i) { put(g, x, y, a, function () { var s = i % 2 ? 1 : -1; g.translate(s * m * 0.28, 0); g.rotate(s * 0.9); g.fillStyle = i % 3 ? col : mix(col, '#c8f060', 0.4); g.beginPath(); g.ellipse(0, 0, m * 0.5, m * 0.2, 0, 0, PI * 2); g.fill(); }); });
      });
      function flame(g, bw, ht, lean, col) { g.beginPath(); g.moveTo(-bw / 2, 0); g.bezierCurveTo(-bw / 2, ht * 0.35, lean - bw * 0.12, ht * 0.62, lean, ht); g.bezierCurveTo(lean + bw * 0.12, ht * 0.62, bw / 2, ht * 0.35, bw / 2, 0); g.closePath(); g.fillStyle = col; g.fill(); }
      add('fire', 'Fire', 'Fun', '#ff5a00', 0.07, function (g, w, h, m, col) {
        var r = rnd(11), core = mix(col, '#fff3a0', 0.85), mid = mix(col, '#ffcf1a', 0.65);
        g.fillStyle = col; g.fillRect(0, h - m * 0.4, w, m * 0.4);
        along(w, h, 0, m * 0.8, function (x, y, a) {
          if (a === 0) return; if (a !== PI && y < h * 0.45) return;
          var ht = m * (1.7 + r() * 2.6) * (a === PI ? 1 : 0.55), lean = (r() - 0.5) * m * 0.9;
          put(g, x, y, a, function () { flame(g, m * 1.05, ht, lean, col); flame(g, m * 0.72, ht * 0.7, lean * 0.8, mid); flame(g, m * 0.4, ht * 0.4, lean * 0.6, core); });
        });
      });
      add('icicles', 'Icicles', 'Fun', '#bfe9ff', 0.06, function (g, w, h, m, col) {
        var r = rnd(4); g.fillStyle = col; g.fillRect(0, 0, w, m * 0.55); g.fillRect(0, 0, m * 0.4, h * 0.3); g.fillRect(w - m * 0.4, 0, m * 0.4, h * 0.3);
        along(w, h, 0, m * 0.62, function (x, y, a) { if (a !== 0) return; var ht = m * (0.9 + r() * 2.8); put(g, x, y + m * 0.4, a, function () { poly(g, [[-m * 0.26, 0], [m * 0.26, 0], [0, ht]]); g.fillStyle = col; g.fill(); poly(g, [[-m * 0.1, 0], [m * 0.02, 0], [-m * 0.03, ht * 0.7]]); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill(); }); });
      });
      add('electric', 'Electric', 'Fun', '#38bdf8', 0.06, function (g, w, h, m, col) {
        var r = rnd(17), o = m * 0.6, sides = [[o, o, w - o, o], [w - o, o, w - o, h - o], [w - o, h - o, o, h - o], [o, h - o, o, o]], k;
        [[1.8, 0], [0.8, 1]].forEach(function (p) {
          r = rnd(17); for (k = 0; k < 4; k++) { g.beginPath(); jag(g, sides[k][0], sides[k][1], sides[k][2], sides[k][3], m * 0.38, r, m * 0.5); lw(g, m * (p[1] ? 0.07 : 0.2), p[1] ? '#ffffff' : col); glowOn(g, col, p[1] ? 0 : m * 1.2); g.stroke(); }
        }); glowOff(g);
      });
      add('bunting', 'Party bunting', 'Fun', '#ff4d6d', 0.07, function (g, w, h, m, col) {
        var n = Math.max(4, Math.round(w / (m * 1.7))), sag = m * 1.5, y0 = m * 0.5, i, t, x, y, bw = w / n * 0.78;
        function py(tt) { return y0 + 4 * sag * tt * (1 - tt); }
        lw(g, Math.max(1, m * 0.08), '#5a4632'); g.beginPath(); for (i = 0; i <= 40; i++) { t = i / 40; if (i) g.lineTo(w * t, py(t)); else g.moveTo(0, py(0)); } g.stroke();
        for (i = 0; i < n; i++) { t = (i + 0.5) / n; x = w * t; y = py(t); g.fillStyle = hueShift(col, i * 47); poly(g, [[x - bw / 2, y - m * 0.02], [x + bw / 2, y - m * 0.02], [x, y + m * 1.5]]); g.fill(); }
      });

      // ----- Neon -----
      add('neon', 'Neon sign', 'Neon', '#ff2fa8', 0.05, function (g, w, h, m, col) { neon(g, col, m, function () { rrect(g, m * 1.3, m * 1.3, w - m * 2.6, h - m * 2.6, m * 1.6); }); });
      add('neondouble', 'Double neon', 'Neon', '#18e6ff', 0.05, function (g, w, h, m, col) {
        neon(g, col, m, function () { rrect(g, m * 0.9, m * 0.9, w - m * 1.8, h - m * 1.8, m * 1.2); }); neon(g, hueShift(col, 150), m * 0.7, function () { rrect(g, m * 2.2, m * 2.2, w - m * 4.4, h - m * 4.4, m * 0.8); });
      });
      add('neoncorners', 'Neon corners', 'Neon', '#7cff4d', 0.05, function (g, w, h, m, col) {
        var len = m * 4.5; neon(g, col, m, function () { g.moveTo(m * 1.2 + len, m * 1.2); g.lineTo(m * 1.2, m * 1.2); g.lineTo(m * 1.2, m * 1.2 + len); g.moveTo(w - m * 1.2 - len, m * 1.2); g.lineTo(w - m * 1.2, m * 1.2); g.lineTo(w - m * 1.2, m * 1.2 + len); g.moveTo(m * 1.2 + len, h - m * 1.2); g.lineTo(m * 1.2, h - m * 1.2); g.lineTo(m * 1.2, h - m * 1.2 - len); g.moveTo(w - m * 1.2 - len, h - m * 1.2); g.lineTo(w - m * 1.2, h - m * 1.2); g.lineTo(w - m * 1.2, h - m * 1.2 - len); });
      });
      add('cyber', 'Cyber', 'Neon', '#b26bff', 0.05, function (g, w, h, m, col) {
        var i = m * 1.2, c = m * 2.6; neon(g, col, m, function () { g.moveTo(i + c, i); g.lineTo(w - i - c, i); g.lineTo(w - i, i + c); g.lineTo(w - i, h - i - c); g.lineTo(w - i - c, h - i); g.lineTo(i + c, h - i); g.lineTo(i, h - i - c); g.lineTo(i, i + c); g.closePath(); });
        g.fillStyle = col; g.fillRect(w / 2 - m * 2.4, i - m * 0.2, m * 4.8, m * 0.4); g.fillRect(w / 2 - m * 2.4, h - i - m * 0.2, m * 4.8, m * 0.4);
      });

      // ----- Paper -----
      add('torn', 'Torn paper', 'Paper', '#f6f1e6', 0.07, function (g, w, h, m, col) {
        var r = rnd(9), pts = [], step = m * 0.4, x, y, j = function () { return (r() - 0.5) * m * 0.9; };
        for (x = m; x < w - m; x += step) pts.push([x, m + j()]); for (y = m; y < h - m; y += step) pts.push([w - m + j(), y]);
        for (x = w - m; x > m; x -= step) pts.push([x, h - m + j()]); for (y = h - m; y > m; y -= step) pts.push([m + j(), y]);
        g.fillStyle = col; g.beginPath(); g.rect(0, 0, w, h); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); g.fill('evenodd');
        lw(g, Math.max(1, m * 0.05), 'rgba(0,0,0,0.18)'); g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); g.stroke();
      });
      add('ticket', 'Ticket', 'Paper', '#f2d27a', 0.07, function (g, w, h, m, col) {
        band(g, w, h, m, col, 0); g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; [[0, h / 2], [w, h / 2], [w / 2, 0], [w / 2, h]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], m * 0.95, 0, PI * 2); g.fill(); }); g.restore();
        lw(g, m * 0.08, mix(col, '#000000', 0.45)); g.lineCap = 'butt'; g.setLineDash([m * 0.3, m * 0.25]); g.beginPath(); g.rect(m * 0.5, m * 0.5, w - m, h - m); g.stroke(); g.setLineDash([]);
      });
      add('sketch', 'Hand drawn', 'Paper', '#ffffff', 0.05, function (g, w, h, m, col) {
        var r = rnd(2), k, i, n; for (k = 0; k < 3; k++) {
          lw(g, m * (0.1 + k * 0.03), rgba(col, 0.92 - k * 0.2)); g.beginPath(); var pts = [], o = m * (0.5 + k * 0.12);
          for (i = 0; i <= 24; i++) pts.push([o + (w - 2 * o) * i / 24, o + (r() - 0.5) * m * 0.22]); for (i = 1; i <= 14; i++) pts.push([w - o + (r() - 0.5) * m * 0.22, o + (h - 2 * o) * i / 14]);
          for (i = 1; i <= 24; i++) pts.push([w - o - (w - 2 * o) * i / 24, h - o + (r() - 0.5) * m * 0.22]); for (i = 1; i <= 14; i++) pts.push([o + (r() - 0.5) * m * 0.22, h - o - (h - 2 * o) * i / 14]);
          for (n = 0; n < pts.length; n++) if (n) g.lineTo(pts[n][0], pts[n][1]); else g.moveTo(pts[n][0], pts[n][1]); g.stroke();
        }
      });
      add('notebook', 'Notebook', 'Paper', '#f7f4ea', 0.06, function (g, w, h, m, col) {
        var bw = m * 1.6, y; g.fillStyle = col; g.fillRect(0, 0, bw, h); g.fillRect(0, 0, w, m * 0.35); g.fillRect(w - m * 0.35, 0, m * 0.35, h); g.fillRect(0, h - m * 0.35, w, m * 0.35);
        g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; for (y = m * 1.1; y < h - m * 0.6; y += m * 1.25) { g.beginPath(); g.arc(bw * 0.55, y, m * 0.26, 0, PI * 2); g.fill(); } g.restore();
        lw(g, m * 0.14, '#5b5f66'); for (y = m * 1.1; y < h - m * 0.6; y += m * 1.25) { g.beginPath(); g.moveTo(bw * 0.18, y + m * 0.1); g.lineTo(bw * 0.95, y - m * 0.1); g.stroke(); }
        lw(g, Math.max(1, m * 0.05), 'rgba(220,80,80,0.55)'); g.beginPath(); g.moveTo(bw + m * 0.2, 0); g.lineTo(bw + m * 0.2, h); g.stroke();
      });

      // ----- Social -----
      add('storybar', 'Story bar', 'Social', '#ffffff', 0.05, function (g, w, h, m, col) {
        var n = 4, gap = m * 0.3, sw = (w - 2 * m * 0.8 - gap * (n - 1)) / n, x, i, hh = Math.max(2, m * 0.3);
        for (i = 0; i < n; i++) { x = m * 0.8 + i * (sw + gap); g.fillStyle = rgba(col, 0.35); g.beginPath(); rrect(g, x, m * 0.8, sw, hh, hh / 2); g.fill(); g.fillStyle = col; g.beginPath(); rrect(g, x, m * 0.8, i < 2 ? sw : i === 2 ? sw * 0.5 : 0.01, hh, hh / 2); g.fill(); }
      });
      add('progress', 'Video progress', 'Social', '#ff2e3d', 0.05, function (g, w, h, m, col) {
        var bh = Math.max(3, m * 0.34), y = h - bh - m * 0.3, p = 0.42; g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(0, y, w, bh); g.fillStyle = col; g.fillRect(0, y, w * p, bh);
        g.beginPath(); g.arc(w * p, y + bh / 2, bh * 1.2, 0, PI * 2); g.fill();
      });
      add('phone', 'Phone screen', 'Social', '#0e0e10', 0.06, function (g, w, h, m, col) {
        band(g, w, h, m * 0.9, col, m * 3.2); var nw = Math.min(w * 0.3, m * 8); g.fillStyle = col; g.beginPath(); rrect(g, w / 2 - nw / 2, -m * 1.2, nw, m * 2.9, m * 0.9); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); rrect(g, w / 2 - w * 0.14, h - m * 0.62, w * 0.28, Math.max(2, m * 0.2), m * 0.1); g.fill();
      });
    })();


    // Draws gen onto g (a 2D context of size w x h) on a see-through background.
    function draw(g, gen, w, h) {
      var c = clean(gen); if (!c) return;
      g.save(); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, w, h);
      if (c.kind === 'shape') drawShape(g, c, w, h);
      else if (c.kind === 'arrow') drawArrow(g, c, w, h);
      else if (c.kind === 'spotlight') drawSpot(g, c, w, h);
      else FR[c.frame](g, w, h, c.width * Math.min(w, h), c.color);
      g.restore();
    }
    return { SHAPES: SHAPES, AR: AR, ARROWS: ARROWS, SPOTS: SPOTS, FRAMES: FRAMES, frameDefaults: frameDefaults, clean: clean, label: label, natural: natural, draw: draw };
  })();

    // ---------- voice enhance ----------
  // A preset and a strength stored on the voice row (track.enhance = { preset, amount }). Three parts, in this order: a gate that turns down the hiss between
  // words (how quiet "quiet" is comes from your own recording), tone shaping (EQ), and a compressor that evens out loud and soft. The preview, the fast export
  // (Web Audio) and the ffmpeg export all use the same numbers from params(), so they sound close. The preview has no gate.
  var VOICE = (function () {
    var PRESETS = [{ key: 'clean', label: 'Clean' }, { key: 'podcast', label: 'Podcast' }, { key: 'warm', label: 'Warm' }, { key: 'bright', label: 'Bright' }];
    // eq: [type, Hz, dB at full strength, Q]; gate: dB of reduction at full strength; comp: threshold dB, ratio, attack ms, release ms, makeup dB (all at full strength)
    var DEF = {
      clean: { eq: [['peaking', 3000, 2, 1], ['peaking', 250, -1.5, 1]], gate: 18, comp: { thr: -22, ratio: 2, atk: 10, rel: 150, make: 2 } },
      podcast: { eq: [['lowshelf', 120, 2.5, 0.7], ['peaking', 250, -2, 1], ['peaking', 3500, 3, 1]], gate: 12, comp: { thr: -24, ratio: 3.5, atk: 8, rel: 120, make: 4 } },
      warm: { eq: [['lowshelf', 160, 4, 0.7], ['peaking', 3000, 1, 1], ['highshelf', 8000, -3, 0.7]], gate: 10, comp: { thr: -20, ratio: 2.5, atk: 10, rel: 150, make: 2 } },
      bright: { eq: [['peaking', 250, -2, 1], ['peaking', 4500, 4, 1], ['highshelf', 9000, 3, 0.7]], gate: 10, comp: { thr: -22, ratio: 3, atk: 8, rel: 140, make: 3 } }
    };
    function lin(db) { return Math.pow(10, db / 20); }
    function clean(e) {
      if (!e || !DEF[e.preset]) return null;
      var a = r3(clamp(num(e.amount, 0.6), 0, 1)); if (a < 0.01) return null;
      return { preset: e.preset, amount: a };
    }
    // The numbers for one setting. floorDb = how loud the background hiss in your recording is.
    function params(e, floorDb) {
      var c = clean(e); if (!c) return null;
      var d = DEF[c.preset], a = c.amount, fl = clamp(num(floorDb, -50), -60, -35);
      return { bands: d.eq.map(function (b) { return { type: b[0], f: b[1], g: r3(b[2] * a), q: b[3] }; }),
        gate: { thrDb: r3(fl + 9), depthDb: r3(d.gate * a) },
        comp: { thr: d.comp.thr, ratio: r3(1 + (d.comp.ratio - 1) * a), atk: d.comp.atk, rel: d.comp.rel, make: r3(d.comp.make * a) } };
    }
    // The ffmpeg filters, in order (gate, EQ, compressor).
    function ffmpegChain(e, floorDb) {
      var p = params(e, floorDb); if (!p) return [];
      var out = ['agate=threshold=' + clamp(lin(p.gate.thrDb), 0.001, 1).toFixed(5) + ':range=' + clamp(lin(-p.gate.depthDb), 0.001, 1).toFixed(5) + ':ratio=20:attack=5:release=150:detection=peak'];
      p.bands.forEach(function (b) {
        if (Math.abs(b.g) < 0.05) return;
        out.push(b.type === 'peaking' ? 'equalizer=f=' + b.f + ':t=q:w=' + b.q + ':g=' + b.g : b.type + '=f=' + b.f + ':g=' + b.g);
      });
      out.push('acompressor=threshold=' + clamp(lin(p.comp.thr), 0.001, 1).toFixed(5) + ':ratio=' + p.comp.ratio + ':attack=' + p.comp.atk + ':release=' + p.comp.rel + ':makeup=' + clamp(lin(p.comp.make), 1, 64).toFixed(3));
      return out;
    }
    // Web Audio nodes (for the preview and the fast export): three tone filters, a compressor and a makeup gain. setNodes puts the numbers in; e = null is "off".
    function makeNodes(ctx) {
      var bands = [0, 1, 2].map(function () { var f = ctx.createBiquadFilter(); f.type = 'peaking'; f.frequency.value = 1000; f.gain.value = 0; f.Q.value = 1; return f; });
      var comp = ctx.createDynamicsCompressor(), make = ctx.createGain();
      bands[0].connect(bands[1]); bands[1].connect(bands[2]); bands[2].connect(comp); comp.connect(make);
      return { input: bands[0], output: make, bands: bands, comp: comp, make: make };
    }
    function setNodes(fx, e, floorDb) {
      var p = params(e, floorDb);
      fx.bands.forEach(function (f, i) { var b = p && p.bands[i]; f.type = b ? b.type : 'peaking'; f.frequency.value = b ? b.f : 1000; f.gain.value = b ? b.g : 0; f.Q.value = b ? b.q : 1; });
      var c = p ? p.comp : { thr: 0, ratio: 1, atk: 10, rel: 150, make: 0 };
      fx.comp.threshold.value = c.thr; fx.comp.knee.value = 12; fx.comp.ratio.value = c.ratio; fx.comp.attack.value = c.atk / 1000; fx.comp.release.value = c.rel / 1000;
      fx.make.gain.value = lin(c.make);
    }
    // The gate for a decoded recording: below the threshold the sound is turned down by depthDb (quickly up when you start talking, slowly down after).
    // mk(channels, length, sampleRate) makes an empty buffer to write into.
    function gateBuffer(buf, mk, e, floorDb) {
      var p = params(e, floorDb); if (!p || p.gate.depthDb < 0.5) return buf;
      var sr = buf.sampleRate, n = buf.length, nc = buf.numberOfChannels, out = mk(nc, n, sr), thr = lin(p.gate.thrDb), low = lin(-p.gate.depthDb);
      var dec = Math.exp(-1 / (sr * 0.03)), up = 1 - Math.exp(-1 / (sr * 0.005)), down = 1 - Math.exp(-1 / (sr * 0.15)), env = 0, g = 1, i, c, m, tgt, src = [], dst = [];
      for (c = 0; c < nc; c++) { src.push(buf.getChannelData(c)); dst.push(out.getChannelData(c)); }
      for (i = 0; i < n; i++) {
        m = 0; for (c = 0; c < nc; c++) { var v = src[c][i]; if (v < 0) v = -v; if (v > m) m = v; }
        env = m > env * dec ? m : env * dec;
        tgt = env < thr ? low : 1; g += (tgt - g) * (tgt > g ? up : down);
        for (c = 0; c < nc; c++) dst[c][i] = src[c][i] * g;
      }
      return out;
    }
    return { PRESETS: PRESETS, clean: clean, params: params, ffmpegChain: ffmpegChain, makeNodes: makeNodes, setNodes: setNodes, gateBuffer: gateBuffer };
  })();

    // ---------- video effects: 65 effects over a stretch of time ----------
  // An effect is a clip on a "video effects" row: { fx: key, strength: 0 to 1 }. Each effect here has its ffmpeg filters (used by the export; graph()) and a quick
  // look for the editor preview (preview()). The ffmpeg part is laid over the picture only between the effect's start and end, so any filter can be used.
  // The preview is CSS, so it is close for most effects and only a note ("shows in the export") for the ones CSS cannot do (mirrors, pixelate, lens).
  var VFX = (function () {
    var CATS = [{ key: 'move', label: 'Shake & move' }, { key: 'glitch', label: 'Glitch' }, { key: 'blur', label: 'Blur & glow' }, { key: 'light', label: 'Flash & light' },
      { key: 'colour', label: 'Colour' }, { key: 'retro', label: 'Retro & film' }, { key: 'mirror', label: 'Mirror & lens' }];
    var LIST = [], BY = {};
    function n(x) { return String(Math.round(x * 10000) / 10000); }
    function ev(x) { return Math.max(2, Math.round(x / 2) * 2); }
    function c01(x) { return clamp(x, 0, 1); }
    function rnd(k) { var v = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); }
    function def(key, cat, label, o) { var e = { key: key, cat: cat, label: label, dur: o.dur || 2000, fixed: !!o.fixed, ff: o.ff, pv: o.pv || null }; LIST.push(e); BY[key] = e; }
    // crop a little in, move the crop window around, and scale back: the picture shakes
    function shakeChain(T, mx, my, xe, ye) {
      return "crop=w='trunc((iw-" + 2 * mx + ")/2)*2':h='trunc((ih-" + 2 * my + ")/2)*2':x='" + xe + "':y='" + ye + "',scale=" + ev(T.w) + ':' + ev(T.h);
    }
    function zoomPan(T, z, x, y) { return "zoompan=z='" + z + "':x='" + x + "':y='" + y + "':d=1:s=" + ev(T.w) + 'x' + ev(T.h) + ':fps=30'; }
    var CENTER_X = 'iw/2-(iw/zoom/2)', CENTER_Y = 'ih/2-(ih/zoom/2)';
    function turnChain(T, ang) { return 'scale=' + ev(T.w * 1.3) + ':' + ev(T.h * 1.3) + ",rotate=a='" + ang + "':c=black:ow=iw:oh=ih,crop=" + ev(T.w) + ':' + ev(T.h); }
    function glowGraph(sig, op, extra) {
      return '$Isplit[$Pa][$Pb];[$Pb]gblur=sigma=' + n(sig) + '[$Pc];[$Pa][$Pc]blend=all_mode=screen:all_opacity=' + n(op) + (extra ? '[$Pd];[$Pd]' + extra : '') + '$O';
    }
    function wash(color, a) { return 'drawbox=x=0:y=0:w=iw:h=ih:color=' + color + '@' + n(a) + ':t=fill'; }
    var SEPIA = 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131';
    var SCAN = 'repeating-linear-gradient(0deg,rgba(0,0,0,.38) 0,rgba(0,0,0,.38) 1px,transparent 1px,transparent 3px)';
    var VIGN = function (a) { return 'radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(0,0,0,' + n(a) + ') 100%)'; };
    function tint(bg, mode) { return { bg: bg, mode: mode || 'normal' }; }
    function haze(key, label, color, rgb) {
      def(key, 'colour', label, { dur: 3000, ff: function (s) { return wash(color, 0.12 + 0.35 * s); }, pv: function (s) { return { tint: tint('rgba(' + rgb + ',' + n(0.12 + 0.35 * s) + ')') }; } });
    }

    // ----- shake & move -----
    def('shake', 'move', 'Shake', { ff: function (s, T) { var m = Math.round(T.w * (0.008 + 0.03 * s)); return shakeChain(T, m, m, m + '+' + m + '*sin(t*47)', m + '+' + m + '*cos(t*53)'); },
      pv: function (s, u) { var m = 0.4 + 1.6 * s; return { tr: 'translate(' + n(m * Math.sin(u * 47)) + '%,' + n(m * Math.cos(u * 53)) + '%) scale(' + n(1.04 + 0.05 * s) + ')' }; } });
    def('quake', 'move', 'Earthquake', { ff: function (s, T) { var my = Math.round(T.h * (0.02 + 0.06 * s)), mx = Math.round(T.w * 0.01); return shakeChain(T, mx, my, mx + '+' + mx + '*sin(t*23)', my + '+' + my + '*sin(t*38)'); },
      pv: function (s, u) { return { tr: 'translate(' + n(Math.sin(u * 23)) + '%,' + n((1 + 4 * s) * Math.sin(u * 38)) + '%) scale(1.1)' }; } });
    def('jitter', 'move', 'Jitter', { ff: function (s, T) { var m = Math.round(T.w * (0.004 + 0.02 * s)); return shakeChain(T, m, m, '2*' + m + '*random(1)', '2*' + m + '*random(2)'); },
      pv: function (s, u) { var f = Math.floor(u * 30), m = 0.3 + 1.5 * s; return { tr: 'translate(' + n((rnd(f) - 0.5) * 2 * m) + '%,' + n((rnd(f + 99) - 0.5) * 2 * m) + '%) scale(1.04)' }; } });
    def('wobble', 'move', 'Wobble', { ff: function (s, T) { return turnChain(T, n(0.03 + 0.1 * s) + '*sin(t*9)'); },
      pv: function (s, u) { return { tr: 'rotate(' + n((0.03 + 0.1 * s) * Math.sin(u * 9) * 57.3) + 'deg) scale(1.2)' }; } });
    def('swing', 'move', 'Swing', { ff: function (s, T) { return turnChain(T, n(0.04 + 0.12 * s) + '*sin(t*3)'); },
      pv: function (s, u) { return { tr: 'rotate(' + n((0.04 + 0.12 * s) * Math.sin(u * 3) * 57.3) + 'deg) scale(1.2)' }; } });
    def('pulse', 'move', 'Zoom pulse', { ff: function (s, T) { return zoomPan(T, '1+' + n(0.04 + 0.14 * s) + '*abs(sin((on/30-' + n(T.a) + ')*7))', CENTER_X, CENTER_Y); },
      pv: function (s, u) { return { tr: 'scale(' + n(1 + (0.04 + 0.14 * s) * Math.abs(Math.sin(u * 7))) + ')' }; } });
    def('punch', 'move', 'Punch in', { dur: 800, ff: function (s, T) { return zoomPan(T, 'if(gte(on/30,' + n(T.a) + '),1+' + n(0.15 + 0.4 * s) + '*exp(-(on/30-' + n(T.a) + ')*6),1)', CENTER_X, CENTER_Y); },
      pv: function (s, u) { return { tr: 'scale(' + n(1 + (0.15 + 0.4 * s) * Math.exp(-u * 6)) + ')' }; } });
    def('push', 'move', 'Slow push in', { dur: 3000, ff: function (s, T) { return zoomPan(T, '1+' + n(0.15 + 0.5 * s) + '*clip((on/30-' + n(T.a) + ')/' + n(Math.max(0.1, T.b - T.a)) + ',0,1)', CENTER_X, CENTER_Y); },
      pv: function (s, u, d) { return { tr: 'scale(' + n(1 + (0.15 + 0.5 * s) * c01(u / Math.max(0.1, d))) + ')' }; } });
    def('spin', 'move', 'Spin', { dur: 1500, ff: function (s, T) { return "rotate=a='2*PI*" + Math.max(1, Math.round(1 + 2 * s)) + '*clip((t-' + n(T.a) + ')/' + n(Math.max(0.1, T.b - T.a)) + ",0,1)':c=black:ow=iw:oh=ih"; },
      pv: function (s, u, d) { return { tr: 'rotate(' + n(360 * Math.max(1, Math.round(1 + 2 * s)) * c01(u / Math.max(0.1, d))) + 'deg)' }; } });
    def('drift', 'move', 'Drift', { dur: 3000, ff: function (s, T) { var k = 0.5 + s; return zoomPan(T, '1.15', CENTER_X + '+iw*0.04*sin(on/30*1.4)*' + n(k), CENTER_Y + '+ih*0.03*cos(on/30*1.1)*' + n(k)); },
      pv: function (s, u) { var k = 0.5 + s; return { tr: 'scale(1.15) translate(' + n(3.5 * Math.sin(u * 1.4) * k) + '%,' + n(2.6 * Math.cos(u * 1.1) * k) + '%)' }; } });

    // ----- glitch -----
    def('glitch', 'glitch', 'Glitch', { ff: function (s, T) { var r = Math.round(T.w * (0.006 + 0.02 * s)); return 'rgbashift=rh=-' + r + ':rv=' + Math.round(r / 3) + ':bh=' + r + ':bv=-' + Math.round(r / 3) + ',noise=alls=' + Math.round(10 + 30 * s) + ':allf=t,eq=contrast=1.15'; },
      pv: function (s, u) { var f = Math.floor(u * 12); return { tr: 'translate(' + n((rnd(f) - 0.5) * 3 * s) + '%,0)', fl: 'contrast(1.2) saturate(1.4)', grain: 0.25 + 0.3 * s, badge: true }; } });
    def('rgbsplit', 'glitch', 'RGB split', { ff: function (s, T) { var r = Math.max(1, Math.round(T.w * (0.003 + 0.02 * s))); return 'rgbashift=rh=-' + r + ':bh=' + r; },
      pv: function () { return { fl: 'saturate(1.4) contrast(1.1)', badge: true }; } });
    def('rgbshake', 'glitch', 'RGB shake', { ff: function (s, T) { var r = Math.max(1, Math.round(T.w * (0.003 + 0.015 * s))), m = Math.round(T.w * (0.006 + 0.02 * s)); return 'rgbashift=rh=-' + r + ':bh=' + r + ',' + shakeChain(T, m, m, m + '+' + m + '*sin(t*47)', m + '+' + m + '*cos(t*53)'); },
      pv: function (s, u) { var m = 0.4 + 1.4 * s; return { tr: 'translate(' + n(m * Math.sin(u * 47)) + '%,' + n(m * Math.cos(u * 53)) + '%) scale(1.04)', fl: 'saturate(1.4)', badge: true }; } });
    def('chroma', 'glitch', 'Colour bleed', { ff: function (s) { var c = Math.round(2 + 14 * s); return 'chromashift=cbh=' + c + ':crh=-' + c; }, pv: function () { return { fl: 'saturate(1.3)', badge: true }; } });
    def('vhs', 'glitch', 'VHS', { ff: function (s) { var c = Math.round(2 + 6 * s); return 'noise=alls=' + Math.round(8 + 20 * s) + ':allf=t,chromashift=cbh=' + c + ':crh=-' + c + ',eq=saturation=1.25:contrast=1.05,gblur=sigma=0.7'; },
      pv: function (s) { return { fl: 'saturate(1.25) blur(0.5px)', grain: 0.2 + 0.3 * s, tint: tint(SCAN) }; } });
    def('scan', 'glitch', 'Scan lines', { ff: function (s) { return "geq=lum='lum(X,Y)*if(lt(mod(Y,3),1)," + n(1 - 0.35 - 0.4 * s) + ",1)'"; }, pv: function () { return { tint: tint(SCAN) }; } });
    def('pixel', 'glitch', 'Pixelate', { ff: function (s, T) { var p = Math.round(6 + 40 * s); return 'scale=' + ev(T.w / p) + ':' + ev(T.h / p) + ':flags=neighbor,scale=' + ev(T.w) + ':' + ev(T.h) + ':flags=neighbor'; }, pv: function () { return { fl: 'blur(1.5px)', badge: true }; } });
    def('poster', 'glitch', 'Posterize', { ff: function (s) { var l = Math.round(24 + 60 * s); return "lutyuv=y='floor(val/" + l + ")*" + l + "',eq=saturation=1.3"; }, pv: function () { return { fl: 'contrast(1.5) saturate(1.4)', badge: true }; } });
    def('static', 'glitch', 'Static noise', { ff: function (s) { return 'noise=alls=' + Math.round(15 + 70 * s) + ':allf=t+u'; }, pv: function (s) { return { grain: c01(0.3 + 0.7 * s) }; } });
    def('neon', 'glitch', 'Neon edges', { ff: function () { return 'edgedetect=low=0.08:high=0.2:mode=colormix,eq=saturation=2:brightness=0.05'; }, pv: function () { return { fl: 'contrast(1.8) saturate(2.2) brightness(0.9)', badge: true }; } });

    // ----- blur & glow -----
    def('blur', 'blur', 'Blur', { ff: function (s) { return 'gblur=sigma=' + n(2 + 22 * s); }, pv: function (s) { return { fl: 'blur(' + n((2 + 22 * s) * 0.45) + 'px)' }; } });
    def('motion', 'blur', 'Motion blur', { ff: function (s) { return 'tmix=frames=' + Math.round(2 + 6 * s); }, pv: function (s) { return { fl: 'blur(' + n(0.5 + 2 * s) + 'px)', badge: true }; } });
    def('glow', 'blur', 'Glow', { ff: function (s) { return glowGraph(6 + 20 * s, 0.4 + 0.5 * s); }, pv: function (s) { return { fl: 'brightness(' + n(1.04 + 0.1 * s) + ') saturate(1.1)', tint: tint('rgba(255,255,255,' + n(0.06 + 0.12 * s) + ')', 'screen') }; } });
    def('soft', 'blur', 'Soft focus', { ff: function (s) { return 'gblur=sigma=' + n(1 + 4 * s) + ',eq=contrast=0.92:brightness=0.02'; }, pv: function (s) { return { fl: 'blur(' + n(0.5 + 1.5 * s) + 'px) contrast(0.92) brightness(1.03)' }; } });
    def('dream', 'blur', 'Dreamy', { ff: function (s) { return glowGraph(8 + 16 * s, 0.45 + 0.4 * s, 'eq=saturation=1.2:brightness=0.04'); },
      pv: function (s) { return { fl: 'saturate(1.2) brightness(1.06)', tint: tint('rgba(255,200,230,' + n(0.1 + 0.15 * s) + ')', 'screen') }; } });

    // ----- flash & light -----
    def('flash', 'light', 'Flash', { dur: 500, ff: function (s, T) { return "eq=brightness='" + n(0.5 + 0.5 * s) + '*max(0,1-(t-' + n(T.a) + ')/' + n(Math.max(0.05, T.b - T.a)) + ")':eval=frame"; },
      pv: function (s, u, d) { return { flash: c01((0.5 + 0.5 * s) * Math.max(0, 1 - u / Math.max(0.05, d))) }; } });
    def('flashred', 'light', 'Red alert', { dur: 1500, ff: function (s) { return wash('red', 0.15 + 0.3 * s) + ",eq=brightness='0.15*pow(sin(t*14),2)':eval=frame"; },
      pv: function (s, u) { return { tint: tint('rgba(255,0,0,' + n(0.15 + 0.3 * s) + ')'), fl: 'brightness(' + n(1 + 0.15 * Math.pow(Math.sin(u * 14), 2)) + ')' }; } });
    def('strobe', 'light', 'Strobe', { ff: function (s) { return "eq=brightness='" + n(0.35 + 0.4 * s) + '*gt(sin(t*' + Math.round(18 + 24 * s) + "),0)':eval=frame"; },
      pv: function (s, u) { return { flash: Math.sin(u * (18 + 24 * s)) > 0 ? c01(0.35 + 0.4 * s) : 0 }; } });
    def('blink', 'light', 'Blink', { ff: function (s) { return "eq=brightness='-1*gt(sin(t*" + Math.round(6 + 10 * s) + "),0.55)':eval=frame"; },
      pv: function (s, u) { return Math.sin(u * (6 + 10 * s)) > 0.55 ? { fl: 'brightness(0)' } : {}; } });
    def('lightning', 'light', 'Lightning', { dur: 1500, ff: function (s) { return "eq=brightness='0.6*gt(random(1)," + n(1 - (0.04 + 0.18 * s)) + ")':eval=frame"; },
      pv: function (s, u) { return { flash: rnd(Math.floor(u * 30) + 7) > 1 - (0.04 + 0.18 * s) ? 0.6 : 0 }; } });
    def('heartbeat', 'light', 'Heartbeat', { ff: function (s) { return "eq=brightness='" + n(0.1 + 0.25 * s) + "*pow(max(0,sin(t*6.5)),6)':eval=frame"; },
      pv: function (s, u) { return { fl: 'brightness(' + n(1 + (0.1 + 0.25 * s) * Math.pow(Math.max(0, Math.sin(u * 6.5)), 6)) + ')' }; } });
    def('flicker', 'light', 'Flicker', { ff: function (s) { return "eq=brightness='(random(1)-0.5)*" + n(0.1 + 0.4 * s) + "':eval=frame"; },
      pv: function (s, u) { return { fl: 'brightness(' + n(1 + (rnd(Math.floor(u * 30)) - 0.5) * (0.1 + 0.4 * s)) + ')' }; } });
    def('disco', 'light', 'Disco', { ff: function (s) { return "hue=h='t*" + Math.round(120 + 250 * s) + "':s=1.5"; }, pv: function (s, u) { return { fl: 'hue-rotate(' + n(u * (120 + 250 * s)) + 'deg) saturate(1.5)' }; } });
    def('cycle', 'light', 'Colour cycle', { ff: function (s) { return "hue=h='t*" + Math.round(40 + 120 * s) + "'"; }, pv: function (s, u) { return { fl: 'hue-rotate(' + n(u * (40 + 120 * s)) + 'deg)' }; } });
    def('dim', 'light', 'Dim down', { ff: function (s, T) { return "eq=brightness='-" + n(0.3 + 0.7 * s) + '*clip((t-' + n(T.a) + ')/' + n(Math.max(0.1, T.b - T.a)) + ",0,1)':eval=frame"; },
      pv: function (s, u, d) { return { fl: 'brightness(' + n(1 - (0.3 + 0.7 * s) * c01(u / Math.max(0.1, d))) + ')' }; } });
    def('over', 'light', 'Overexposed', { dur: 3000, ff: function (s) { return 'eq=gamma=' + n(1.2 + 0.8 * s) + ':brightness=' + n(0.05 + 0.1 * s); }, pv: function (s) { return { fl: 'brightness(' + n(1.15 + 0.4 * s) + ') contrast(0.9)' }; } });
    def('under', 'light', 'Underexposed', { dur: 3000, ff: function (s) { return 'eq=gamma=' + n(0.8 - 0.35 * s) + ':brightness=-' + n(0.03 + 0.08 * s); }, pv: function (s) { return { fl: 'brightness(' + n(0.85 - 0.4 * s) + ') contrast(1.1)' }; } });

    // ----- colour -----
    def('invert', 'colour', 'Invert', { dur: 1500, fixed: true, ff: function () { return 'negate'; }, pv: function () { return { fl: 'invert(1)' }; } });
    def('bw', 'colour', 'Black & white', { dur: 3000, fixed: true, ff: function () { return 'hue=s=0'; }, pv: function () { return { fl: 'grayscale(1)' }; } });
    def('sepia', 'colour', 'Sepia', { dur: 3000, fixed: true, ff: function () { return SEPIA; }, pv: function () { return { fl: 'sepia(1)' }; } });
    def('night', 'colour', 'Night vision', { dur: 3000, fixed: true, ff: function () { return 'colorchannelmixer=rr=0:rg=0:rb=0:gr=0.3:gg=0.6:gb=0.1:br=0:bg=0:bb=0,eq=brightness=0.08:contrast=1.2,noise=alls=12:allf=t'; },
      pv: function () { return { fl: 'grayscale(1) sepia(1) hue-rotate(70deg) saturate(3) brightness(1.1)', grain: 0.2, badge: true }; } });
    def('thermal', 'colour', 'Thermal', { dur: 3000, fixed: true, ff: function () { return "hue=s=0,curves=r='0/0 0.5/0.9 1/1':g='0/0 0.5/0.3 0.8/0.9 1/1':b='0/0.3 0.4/0 1/0'"; },
      pv: function () { return { fl: 'grayscale(1) sepia(1) hue-rotate(-30deg) saturate(5) contrast(1.3)', badge: true }; } });
    def('cyano', 'colour', 'Cyanotype', { dur: 3000, fixed: true, ff: function () { return "hue=s=0,curves=r='0/0 1/0.35':g='0/0.05 1/0.8':b='0/0.1 1/1'"; },
      pv: function () { return { fl: 'grayscale(1) sepia(1) hue-rotate(160deg) saturate(2)' }; } });
    def('duo', 'colour', 'Duotone', { dur: 3000, fixed: true, ff: function () { return "hue=s=0,curves=r='0/0.2 1/1':g='0/0 1/0.6':b='0/0.4 1/0.5'"; },
      pv: function () { return { fl: 'grayscale(1) sepia(1) hue-rotate(250deg) saturate(2.5)' }; } });
    haze('warm', 'Warm haze', 'orange', '255,150,40'); haze('pink', 'Pink haze', 'hotpink', '255,105,180'); haze('blue', 'Blue haze', 'dodgerblue', '30,144,255');
    haze('green', 'Green haze', 'limegreen', '50,205,50'); haze('purple', 'Purple haze', 'mediumpurple', '147,112,219');

    // ----- retro & film -----
    def('oldfilm', 'retro', 'Old film', { dur: 3000, ff: function (s) { return SEPIA + ',noise=alls=' + Math.round(10 + 20 * s) + ":allf=t,vignette=angle=PI/4,eq=brightness='(random(1)-0.5)*0.1':eval=frame"; },
      pv: function (s, u) { return { fl: 'sepia(0.9) contrast(1.1) brightness(' + n(1 + (rnd(Math.floor(u * 24)) - 0.5) * 0.1) + ')', grain: 0.2 + 0.2 * s, tint: tint(VIGN(0.55)) }; } });
    def('grain', 'retro', 'Film grain', { dur: 2000, ff: function (s) { return 'noise=alls=' + Math.round(8 + 40 * s) + ':allf=t'; }, pv: function (s) { return { grain: c01(0.15 + 0.5 * s) }; } });
    def('vignette', 'retro', 'Vignette', { dur: 3000, ff: function (s) { return 'vignette=angle=' + n(Math.PI / 2 - s * Math.PI * 0.35); }, pv: function (s) { return { tint: tint(VIGN(0.35 + 0.5 * s)) }; } });
    def('super8', 'retro', 'Super 8', { dur: 3000, ff: function () { return 'colorchannelmixer=rr=1.05:bb=0.9,noise=alls=14:allf=t,vignette=angle=PI/4,eq=saturation=1.2:contrast=1.08'; },
      pv: function (s) { return { fl: 'sepia(0.35) saturate(1.2) contrast(1.08)', grain: 0.3, tint: tint(VIGN(0.5)) }; } });
    def('letterbox', 'retro', 'Cinema bars', { dur: 3000, ff: function (s) { var f = n(0.07 + 0.12 * s); return "drawbox=x=0:y=0:w=iw:h='ih*" + f + "':color=black:t=fill,drawbox=x=0:y='ih*" + n(1 - (0.07 + 0.12 * s)) + "':w=iw:h='ih*" + f + "':color=black:t=fill"; },
      pv: function (s) { return { bars: 0.07 + 0.12 * s }; } });
    def('vintage', 'retro', 'Vintage', { dur: 3000, fixed: true, ff: function () { return 'curves=preset=vintage'; }, pv: function () { return { fl: 'sepia(0.35) contrast(1.1) saturate(1.2)' }; } });
    def('cross', 'retro', 'Cross process', { dur: 3000, fixed: true, ff: function () { return 'curves=preset=cross_process'; }, pv: function () { return { fl: 'contrast(1.2) saturate(1.4) hue-rotate(-10deg)' }; } });
    def('matte', 'retro', 'Matte fade', { dur: 3000, ff: function (s) { return "curves=all='0/" + n(0.06 + 0.12 * s) + ' 1/' + n(0.96 - 0.1 * s) + "',eq=saturation=" + n(0.9 - 0.2 * s); }, pv: function (s) { return { fl: 'contrast(' + n(0.9 - 0.15 * s) + ') brightness(1.08) saturate(' + n(0.9 - 0.2 * s) + ')' }; } });

    // ----- mirror & lens -----
    var HALF_LR = '$Isplit[$Pa][$Pb];[$Pa]crop=trunc(iw/4)*2:ih:0:0[$Pl];[$Pb]crop=trunc(iw/4)*2:ih:0:0,hflip[$Pr];[$Pl][$Pr]hstack';
    def('mirrorlr', 'mirror', 'Mirror left-right', { dur: 3000, fixed: true, ff: function () { return HALF_LR + '$O'; }, pv: function () { return { badge: true }; } });
    def('mirrortb', 'mirror', 'Mirror top-bottom', { dur: 3000, fixed: true, ff: function () { return '$Isplit[$Pa][$Pb];[$Pa]crop=iw:trunc(ih/4)*2:0:0[$Pl];[$Pb]crop=iw:trunc(ih/4)*2:0:0,vflip[$Pr];[$Pl][$Pr]vstack$O'; }, pv: function () { return { badge: true }; } });
    def('kaleido', 'mirror', 'Kaleidoscope', { dur: 3000, fixed: true, ff: function () { return HALF_LR + '[$Pm];[$Pm]split[$Pc][$Pd];[$Pc]crop=iw:trunc(ih/4)*2:0:0[$Pt];[$Pd]crop=iw:trunc(ih/4)*2:0:0,vflip[$Pu];[$Pt][$Pu]vstack$O'; }, pv: function () { return { badge: true }; } });
    def('fliph', 'mirror', 'Flip horizontal', { dur: 3000, fixed: true, ff: function () { return 'hflip'; }, pv: function () { return { tr: 'scaleX(-1)' }; } });
    def('flipv', 'mirror', 'Flip vertical', { dur: 3000, fixed: true, ff: function () { return 'vflip'; }, pv: function () { return { tr: 'scaleY(-1)' }; } });
    def('fisheye', 'mirror', 'Fisheye', { dur: 3000, ff: function (s) { var k = n(-(0.2 + 0.6 * s)); return 'lenscorrection=k1=' + k + ':k2=' + k; }, pv: function () { return { tr: 'scale(1.05)', badge: true }; } });
    def('pinch', 'mirror', 'Pinch', { dur: 3000, ff: function (s) { var k = n(0.2 + 0.6 * s); return 'lenscorrection=k1=' + k + ':k2=' + k; }, pv: function () { return { badge: true }; } });
    def('stretch', 'mirror', 'Stretch wide', { dur: 3000, ff: function (s, T) { return 'scale=' + ev(T.w * (1.15 + 0.5 * s)) + ':' + ev(T.h) + ',crop=' + ev(T.w) + ':' + ev(T.h); }, pv: function (s) { return { tr: 'scaleX(' + n(1.15 + 0.5 * s) + ')' }; } });

    var KEYS = LIST.map(function (e) { return e.key; });
    function has(key) { return !!BY[key]; }
    function label(key) { return BY[key] ? BY[key].label : String(key); }
    function defDur(key) { return BY[key] ? BY[key].dur : 2000; }
    function isFixed(key) { return !!(BY[key] && BY[key].fixed); }
    function inCat(cat) { return LIST.filter(function (e) { return e.cat === cat; }).map(function (e) { return { key: e.key, label: e.label }; }); }
    // One effect as a piece of ffmpeg filter graph: [cur] in, [out] out. x = { fx, strength }; a0, b0 = when it starts and ends (seconds, from the start of this part of the picture).
    function graph(x, a0, b0, cur, out, w, h) {
      var e = BY[x.fx]; if (!e) return null;
      var s = c01(num(x.strength, 0.5)), p = 'x' + out + '_', t = e.ff(s, { a: Math.max(0, a0), b: b0, w: w, h: h });
      if (t.indexOf('$I') < 0) t = '$I' + t + '$O';
      var body = t.replace(/\$I/g, function () { return '[' + p + 'i]'; }).replace(/\$O/g, function () { return '[' + p + 'o]'; }).replace(/\$P/g, function () { return p; });
      return '[' + cur + ']split[' + p + 'k][' + p + 'i];' + body + ';[' + p + 'k][' + p + "o]overlay=enable='between(t," + a0.toFixed(3) + ',' + b0.toFixed(3) + ")':eof_action=pass[" + out + ']';
    }
    // The preview look of the effects that are on at tMs. list = [{ fx, strength, start, dur }].
    function preview(list, tMs) {
      var out = { transform: '', filter: '', flash: 0, grain: 0, tints: [], bars: 0, badge: [] };
      (list || []).forEach(function (x) {
        var e = BY[x.fx]; if (!e) return;
        var r = e.pv ? e.pv(c01(num(x.strength, 0.5)), (tMs - x.start) / 1000, x.dur / 1000) : null;
        if (!r) { out.badge.push(e.label); return; }
        if (r.tr) out.transform += ' ' + r.tr;
        if (r.fl) out.filter += ' ' + r.fl;
        if (r.flash) out.flash = Math.max(out.flash, r.flash);
        if (r.grain) out.grain = Math.max(out.grain, r.grain);
        if (r.tint) out.tints.push(r.tint);
        if (r.bars) out.bars = Math.max(out.bars, r.bars);
        if (r.badge) out.badge.push(e.label);
      });
      out.transform = out.transform.trim(); out.filter = out.filter.trim();
      return out;
    }
    return { legacy: function (k) { return ['shake', 'glitch', 'blur', 'flash', 'rgbsplit', 'grain'].indexOf(k) >= 0; }, CATS: CATS, LIST: LIST, KEYS: KEYS, has: has, label: label, defDur: defDur, isFixed: isFixed, inCat: inCat, graph: graph, preview: preview };
  })();

    // ---------- transitions: 58 of them ----------
  // The names are ffmpeg's own xfade transitions, so the export engine uses a key as it is. The editor preview shows a fade (or a dip through black); the export has
  // the real wipe, slide, shape or slice.
  var TRANS = (function () {
    var GROUPS = [{ key: 'fades', label: 'Fades' }, { key: 'wipes', label: 'Wipes' }, { key: 'slides', label: 'Slides' }, { key: 'shapes', label: 'Shapes' },
      { key: 'cover', label: 'Cover & reveal' }, { key: 'slices', label: 'Slices & wind' }, { key: 'special', label: 'Special' }];
    var LIST = [];
    function add(group, pairs) { pairs.forEach(function (p) { LIST.push({ key: p[0], label: p[1], group: group }); }); }
    add('fades', [['fade', 'Fade'], ['fadeblack', 'Dip to black'], ['fadewhite', 'Dip to white'], ['fadegrays', 'Dip to grey'], ['fadefast', 'Quick fade'], ['fadeslow', 'Slow fade'], ['dissolve', 'Dissolve']]);
    add('wipes', [['wipeleft', 'Wipe left'], ['wiperight', 'Wipe right'], ['wipeup', 'Wipe up'], ['wipedown', 'Wipe down'], ['wipetl', 'Wipe top-left'], ['wipetr', 'Wipe top-right'],
      ['wipebl', 'Wipe bottom-left'], ['wipebr', 'Wipe bottom-right'], ['diagtl', 'Diagonal top-left'], ['diagtr', 'Diagonal top-right'], ['diagbl', 'Diagonal bottom-left'], ['diagbr', 'Diagonal bottom-right']]);
    add('slides', [['slideleft', 'Slide left'], ['slideright', 'Slide right'], ['slideup', 'Slide up'], ['slidedown', 'Slide down'],
      ['smoothleft', 'Smooth left'], ['smoothright', 'Smooth right'], ['smoothup', 'Smooth up'], ['smoothdown', 'Smooth down']]);
    add('shapes', [['circleopen', 'Circle open'], ['circleclose', 'Circle close'], ['circlecrop', 'Circle crop'], ['rectcrop', 'Rectangle crop'], ['radial', 'Radial'],
      ['vertopen', 'Doors open'], ['vertclose', 'Doors close'], ['horzopen', 'Blinds open'], ['horzclose', 'Blinds close'], ['distance', 'Distance']]);
    add('cover', [['coverleft', 'Cover left'], ['coverright', 'Cover right'], ['coverup', 'Cover up'], ['coverdown', 'Cover down'],
      ['revealleft', 'Reveal left'], ['revealright', 'Reveal right'], ['revealup', 'Reveal up'], ['revealdown', 'Reveal down']]);
    add('slices', [['hlslice', 'Slices left'], ['hrslice', 'Slices right'], ['vuslice', 'Slices up'], ['vdslice', 'Slices down'],
      ['hlwind', 'Wind left'], ['hrwind', 'Wind right'], ['vuwind', 'Wind up'], ['vdwind', 'Wind down']]);
    add('special', [['pixelize', 'Pixelize'], ['hblur', 'Blur'], ['squeezeh', 'Squeeze sideways'], ['squeezev', 'Squeeze down'], ['zoomin', 'Zoom in']]);
    var KEYS = LIST.map(function (t) { return t.key; }), XFADE = {};
    KEYS.forEach(function (k) { XFADE[k] = k; });
    function inGroup(g) { return LIST.filter(function (t) { return t.group === g; }).map(function (t) { return { key: t.key, label: t.label }; }); }
    function label(k) { for (var i = 0; i < LIST.length; i++) if (LIST[i].key === k) return LIST[i].label; return String(k); }
    return { GROUPS: GROUPS, LIST: LIST, KEYS: KEYS, XFADE: XFADE, inGroup: inGroup, label: label };
  })();

  var api = { trans: TRANS, vfx: VFX, voice: VOICE, gen: GEN, BLEND: BLEND, MASKS: MASKS, CHROMA: CHROMA, blendOf: blendOf, cssBlend: cssBlend, ffBlend: ffBlend, ffBlendFormat: ffBlendFormat,
    cleanBlend: cleanBlend, cleanMask: cleanMask, cleanChroma: cleanChroma, hexRgb: hexRgb, keyOf: keyOf, chromaAlpha: chromaAlpha, chromaFilter: chromaFilter,
    maskSd: maskSd, maskAlpha: maskAlpha, maskAlphaExpr: maskAlphaExpr, maskCanvas: maskCanvas, fxInto: fxInto, chromaInto: chromaInto, chromaCanvas: chromaCanvas, drawFx: drawFx };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiFx = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['fx.js'] = 'masks-fx2+shapes'; }
  return api;
})();
