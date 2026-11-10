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
      // ----- Windows: the picture shows through a shape (batch 1) -----
      (function () {
        var PI2 = Math.PI * 2;
        function fitBox(x, y, w, h, ar) { var w2 = Math.min(w, h * ar), h2 = w2 / ar; return { x: x + (w - w2) / 2, y: y + (h - h2) / 2, w: w2, h: h2 }; }
        function ptsP(g, p) { g.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); }
        function circ(g, x, y, r) { g.moveTo(x + r, y); g.arc(x, y, r, 0, PI2); g.closePath(); }
        function starP(g, cx, cy, Ro, Ri, n) { var i, a, r; for (i = 0; i < n * 2; i++) { a = -Math.PI / 2 + i * Math.PI / n; r = i % 2 ? Ri : Ro; if (i) g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); }
        var S = {
          circle: function (g, x, y, w, h) { circ(g, x + w / 2, y + h / 2, Math.min(w, h) / 2); },
          oval: function (g, x, y, w, h) { g.moveTo(x + w, y + h / 2); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, PI2); g.closePath(); },
          arch: function (g, x, y, w, h) { var r = Math.min(w / 2, h * 0.9); g.moveTo(x, y + h); g.lineTo(x, y + r); g.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, Math.PI * 1.5, PI2); g.lineTo(x + w, y + h); g.closePath(); },
          heart: function (g, x, y, w, h) { var cx = x + w / 2; g.moveTo(cx, y + h * 0.3); g.bezierCurveTo(cx, y, x, y, x, y + h * 0.32); g.bezierCurveTo(x, y + h * 0.62, cx - w * 0.05, y + h * 0.8, cx, y + h); g.bezierCurveTo(cx + w * 0.05, y + h * 0.8, x + w, y + h * 0.62, x + w, y + h * 0.32); g.bezierCurveTo(x + w, y, cx, y, cx, y + h * 0.3); g.closePath(); },
          star: function (g, x, y, w, h) { var R = Math.min(w / 1.902, h / 1.809); starP(g, x + w / 2, y + (h - 1.809 * R) / 2 + R, R, R * 0.42, 5); },
          hexagon: function (g, x, y, w, h) { ptsP(g, [[x + w * 0.25, y], [x + w * 0.75, y], [x + w, y + h / 2], [x + w * 0.75, y + h], [x + w * 0.25, y + h], [x, y + h / 2]]); },
          diamond: function (g, x, y, w, h) { ptsP(g, [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]]); },
          octagon: function (g, x, y, w, h) { var c = Math.min(w, h) * 0.29; ptsP(g, [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]]); },
          squircle: function (g, x, y, w, h) { rrect(g, x, y, w, h, Math.min(w, h) * 0.3); },
          cloud: function (g, x, y, w, h) { circ(g, x + w * 0.27, y + h * 0.62, h * 0.22); circ(g, x + w * 0.5, y + h * 0.45, h * 0.3); circ(g, x + w * 0.76, y + h * 0.6, h * 0.24); rrect(g, x + w * 0.12, y + h * 0.58, w * 0.76, h * 0.34, h * 0.17); },
          drop: function (g, x, y, w, h) { var cx = x + w / 2; g.moveTo(cx, y); g.bezierCurveTo(cx + w * 0.15, y + h * 0.25, x + w, y + h * 0.4, x + w, y + h * 0.68); g.bezierCurveTo(x + w, y + h * 0.87, cx + w * 0.27, y + h, cx, y + h); g.bezierCurveTo(cx - w * 0.27, y + h, x, y + h * 0.87, x, y + h * 0.68); g.bezierCurveTo(x, y + h * 0.4, cx - w * 0.15, y + h * 0.25, cx, y); g.closePath(); },
          keyhole: function (g, x, y, w, h) { var cx = x + w / 2, r = w * 0.5, cy = y + r; circ(g, cx, cy, r); ptsP(g, [[cx - w * 0.17, cy + r * 0.6], [cx + w * 0.17, cy + r * 0.6], [cx + w * 0.3, y + h], [cx - w * 0.3, y + h]]); },
          shield: function (g, x, y, w, h) { var cx = x + w / 2; g.moveTo(cx, y); g.lineTo(x + w, y + h * 0.12); g.lineTo(x + w, y + h * 0.5); g.bezierCurveTo(x + w, y + h * 0.8, cx + w * 0.2, y + h * 0.95, cx, y + h); g.bezierCurveTo(cx - w * 0.2, y + h * 0.95, x, y + h * 0.8, x, y + h * 0.5); g.lineTo(x, y + h * 0.12); g.closePath(); },
          bubble: function (g, x, y, w, h) { rrect(g, x, y, w, h * 0.82, Math.min(w, h) * 0.18); ptsP(g, [[x + w * 0.2, y + h * 0.78], [x + w * 0.38, y + h * 0.78], [x + w * 0.2, y + h]]); },
          label: function (g, x, y, w, h) { ptsP(g, [[x, y], [x + w * 0.82, y], [x + w, y + h / 2], [x + w * 0.82, y + h], [x, y + h]]); },
          moon: function (g, x, y, w, h) { circ(g, x + w / 2, y + h / 2, Math.min(w, h) / 2); },
          leaf: function (g, x, y, w, h) { g.moveTo(x, y + h); g.bezierCurveTo(x + w * 0.05, y + h * 0.3, x + w * 0.5, y, x + w, y); g.bezierCurveTo(x + w * 0.95, y + h * 0.7, x + w * 0.5, y + h, x, y + h); g.closePath(); },
          flower: function (g, x, y, w, h) { var cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2, k; for (k = 0; k < 6; k++) circ(g, cx + Math.cos(k * Math.PI / 3 - Math.PI / 2) * R * 0.62, cy + Math.sin(k * Math.PI / 3 - Math.PI / 2) * R * 0.62, R * 0.36); circ(g, cx, cy, R * 0.3); },
          sun: function (g, x, y, w, h) { var R = Math.min(w, h) / 2; starP(g, x + w / 2, y + h / 2, R, R * 0.72, 12); },
          ticket: function (g, x, y, w, h) { rrect(g, x, y, w, h, Math.min(w, h) * 0.08); }
        };
        // some shapes put a little colour back on top (the bite of a crescent, the notches of a ticket)
        var BACK = {
          moon: function (g, x, y, w, h) { var R = Math.min(w, h) / 2; circ(g, x + w / 2 + R * 0.45, y + h / 2 - R * 0.08, R * 0.82); },
          ticket: function (g, x, y, w, h) { var r = Math.min(w, h) * 0.11; circ(g, x, y + h / 2, r); circ(g, x + w, y + h / 2, r); }
        };
        function win(key, label, col, wd, ar, shape, trim) {
          add('w_' + key, label, 'Windows', col, wd, function (g, w, h, m, c) {
            var bw = Math.max(4, w - 2 * m), bh = Math.max(4, h - 2 * m), b = ar ? fitBox(m, m, bw, bh, ar) : { x: m, y: m, w: bw, h: bh };
            g.fillStyle = c; g.fillRect(0, 0, w, h);
            g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath(); S[shape](g, b.x, b.y, b.w, b.h); g.fill(); g.restore();
            if (BACK[shape]) { g.fillStyle = c; g.beginPath(); BACK[shape](g, b.x, b.y, b.w, b.h); g.fill(); }
            if (trim) { lw(g, Math.max(1, m * 0.07), mix(c, ink(c) === '#ffffff' ? '#ffffff' : '#000000', 0.5)); g.beginPath(); S[shape](g, b.x, b.y, b.w, b.h); g.stroke(); }
          });
        }
        win('circle', 'Porthole', '#1c1c1e', 0.11, 1, 'circle', true);
        win('oval', 'Cameo', '#2b1d16', 0.1, 0.8, 'oval', true);
        win('arch', 'Arch window', '#f3ece0', 0.09, 0.8, 'arch', true);
        win('heart', 'Heart', '#ff4d79', 0.1, 1.1, 'heart', true);
        win('star', 'Star', '#ffd60a', 0.1, 1.05, 'star', true);
        win('hex', 'Hexagon', '#14532d', 0.1, 1.15, 'hexagon', true);
        win('diamond', 'Diamond', '#111111', 0.1, 0.9, 'diamond', true);
        win('octagon', 'Octagon', '#7f1d1d', 0.1, 1, 'octagon', true);
        win('squircle', 'Squircle', '#0f172a', 0.1, 0, 'squircle', true);
        win('cloud', 'Cloud', '#7fd8ff', 0.08, 1.5, 'cloud', false);
        win('drop', 'Teardrop', '#0ea5e9', 0.1, 0.8, 'drop', true);
        win('keyhole', 'Keyhole', '#111111', 0.09, 0.62, 'keyhole', false);
        win('shield', 'Shield', '#1e3a8a', 0.1, 0.85, 'shield', true);
        win('bubble', 'Speech bubble', '#ffffff', 0.09, 0, 'bubble', false);
        win('label', 'Label', '#f59e0b', 0.1, 0, 'label', true);
        win('moon', 'Crescent moon', '#1e1b4b', 0.1, 1, 'moon', false);
        win('leaf', 'Leaf', '#166534', 0.1, 1, 'leaf', true);
        win('flower', 'Flower', '#ff8fb8', 0.1, 1, 'flower', false);
        win('sun', 'Sunburst', '#ff9f1c', 0.1, 1, 'sun', true);
        win('ticket', 'Ticket stub', '#f2d27a', 0.08, 0, 'ticket', false);
      })();

      add('phone', 'Phone screen', 'Social', '#0e0e10', 0.06, function (g, w, h, m, col) {
        band(g, w, h, m * 0.9, col, m * 3.2); var nw = Math.min(w * 0.3, m * 8); g.fillStyle = col; g.beginPath(); rrect(g, w / 2 - nw / 2, -m * 1.2, nw, m * 2.9, m * 0.9); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); rrect(g, w / 2 - w * 0.14, h - m * 0.62, w * 0.28, Math.max(2, m * 0.2), m * 0.1); g.fill();
      });
    })();


      // ---------- professional set: news, print, screens, social, neon ----------
      // Drawn with plain colours and shapes only (no gradients), at the same size as the video, so the preview and both exports agree.
      // k is the unit: the chosen thickness, but never more than 14% of the short side, so a very thick setting does not make a giant screen.
      (function () {
        var PI = Math.PI;
        function K(w, h, m) { return Math.max(1.5, Math.min(m, Math.min(w, h) * 0.14)); }
        function rgb(hx) { var n = parseInt(String(hx).replace('#', ''), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
        function toHex(a) { return '#' + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
        function mix(a, b, t) { var x = rgb(a), y = rgb(b); return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); }
        function rgba(hx, a) { var c = rgb(hx); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
        function ink(hx) { var c = rgb(hx); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 150 ? '#111111' : '#ffffff'; }
        function rrect(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
        function lw(g, v, col) { g.lineWidth = Math.max(1, v); g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; }
        function txt(g, s, x, y, px, col, align, weight, family) {
          g.font = (weight || '700') + ' ' + Math.max(7, Math.round(px)) + 'px ' + (family || 'system-ui, Arial, sans-serif'); g.fillStyle = col; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(s, x, y);
        }
        function cut(g, w, h, fn, col) { g.fillStyle = col; g.beginPath(); g.rect(0, 0, w, h); fn(); g.fill('evenodd'); }   // a coloured sheet with a see-through hole
        function dot(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, PI * 2); g.fill(); }
        function heart(g, x, y, s) { g.beginPath(); g.moveTo(x, y + s * 0.9); g.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.6, y - s * 0.9, x, y - s * 0.25); g.bezierCurveTo(x + s * 0.6, y - s * 0.9, x + s * 1.5, y - s * 0.1, x, y + s * 0.9); g.closePath(); }
        function neon(g, col, k, draw) {
          var t = Math.max(2, k * 0.22);
          lw(g, t * 1.7, col); g.shadowColor = col; g.shadowBlur = k * 1.6; g.beginPath(); draw(); g.stroke();
          lw(g, t, col); g.shadowBlur = k * 0.6; g.beginPath(); draw(); g.stroke();
          g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)'; lw(g, t * 0.42, mix(col, '#ffffff', 0.82)); g.beginPath(); draw(); g.stroke();
        }
        function add(key, label, cat, color, width, fn) { FRAMES.push({ key: key, label: label, cat: cat }); FRAME_DEF[key] = { color: color, width: width }; FR[key] = fn; }

        // ----- News -----
        add('n_tvnews', 'TV news bar', 'News', '#d7141a', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), bh = k * 2.5, y = h - bh - k * 0.7, x0 = k * 0.7, bw = w - k * 1.4, tw = k * 4.2;
          g.fillStyle = 'rgba(8,20,48,0.94)'; g.fillRect(x0, y, bw, bh); g.fillStyle = col; g.fillRect(x0, y, bw, k * 0.22); g.fillRect(x0, y, tw, bh);
          txt(g, 'NEWS', x0 + tw / 2, y + bh * 0.58, k * 0.95, ink(col), 'center', '800');
          dot(g, x0 + bw - k * 2.6, y + bh * 0.58, k * 0.2, '#ff3b3b'); txt(g, 'LIVE', x0 + bw - k * 0.6, y + bh * 0.58, k * 0.7, '#ffffff', 'right', '700');
        });
        add('n_breaking', 'Breaking banner', 'News', '#d7141a', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), tb = k * 1.15, rb = k * 2.2, y = h - tb - rb - k * 0.5, tw = k * 8.6;
          g.fillStyle = col; g.fillRect(0, y, w, rb); g.fillStyle = '#ffffff'; g.fillRect(k * 0.8, y - k * 0.45, tw, rb + k * 0.45);
          txt(g, 'BREAKING NEWS', k * 0.8 + tw / 2, y + rb * 0.5, k * 0.95, col, 'center', '800');
          g.fillStyle = 'rgba(8,20,48,0.95)'; g.fillRect(0, y + rb, w, tb);
          for (var x = k * 0.8 + tw + k * 1.2; x < w - k; x += k * 2.2) dot(g, x, y + rb + tb / 2, k * 0.16, 'rgba(255,255,255,0.8)');
        });
        add('n_ticker', 'News ticker', 'News', '#ffcc00', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), bh = k * 1.6, y = h - bh, tw = k * 3.6;
          g.fillStyle = 'rgba(10,10,12,0.92)'; g.fillRect(0, y, w, bh); g.fillStyle = col; g.fillRect(0, y, tw, bh);
          txt(g, 'LIVE', tw / 2, y + bh / 2, k * 0.8, ink(col), 'center', '800'); txt(g, '12:00', w - k * 0.6, y + bh / 2, k * 0.7, 'rgba(255,255,255,0.8)', 'right', '700');
          g.fillStyle = col; g.fillRect(0, y - k * 0.1, w, k * 0.1);
        });
        add('n_score', 'Scoreboard', 'News', '#1e6bff', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), x = k * 0.9, y = k * 0.9, bw = k * 11, bh = k * 2.1;
          g.fillStyle = 'rgba(8,12,24,0.92)'; g.beginPath(); rrect(g, x, y, bw, bh, k * 0.3); g.fill();
          g.fillStyle = col; g.fillRect(x, y, k * 3.4, bh); g.fillStyle = '#ff3b3b'; g.fillRect(x + bw - k * 3.4, y, k * 3.4, bh);
          txt(g, 'HOME', x + k * 1.7, y + bh / 2, k * 0.8, '#ffffff', 'center', '800'); txt(g, 'AWAY', x + bw - k * 1.7, y + bh / 2, k * 0.8, '#ffffff', 'center', '800');
          txt(g, '0 - 0', x + bw / 2, y + bh / 2, k * 1.2, '#ffffff', 'center', '800');
        });

        // ----- Print -----
        add('p_news', 'Newspaper', 'Print', '#f1e9d6', 0.07, function (g, w, h, m, col) {
          var k = K(w, h, m), side = k * 0.9, top = k * 3.4, bot = k * 1.5, d = ink(col) === '#ffffff' ? '#f4f4f4' : '#1a1a1a';
          cut(g, w, h, function () { g.rect(side, top, w - 2 * side, h - top - bot); }, col);
          txt(g, 'VOL. 1  •  NO. 1  •  FREE', w / 2, k * 0.72, k * 0.5, rgba(d, 0.7), 'center', '700', 'Georgia, serif');
          txt(g, 'THE DAILY NEWS', w / 2, k * 1.95, k * 1.5, d, 'center', '800', 'Georgia, "Times New Roman", serif');
          g.fillStyle = d; g.fillRect(side, k * 2.8, w - 2 * side, k * 0.08); g.fillRect(side, k * 3.0, w - 2 * side, k * 0.03);
          g.fillStyle = rgba(d, 0.55); g.fillRect(side, h - bot * 0.65, (w - 2 * side) * 0.3, k * 0.15); g.fillRect(side, h - bot * 0.35, (w - 2 * side) * 0.18, k * 0.12);
        });
        add('p_mag', 'Magazine cover', 'Print', '#ffffff', 0.06, function (g, w, h, m, col) {
          var k = K(w, h, m), bx = w - k * 4.4, by = h - k * 3.3;
          g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = k * 0.5;
          txt(g, 'MAGAZINE', w / 2, k * 2.3, k * 3.1, col, 'center', '800', 'Georgia, "Times New Roman", serif'); g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)';
          txt(g, 'ISSUE 01  •  SPECIAL EDITION', w / 2, k * 4.3, k * 0.62, col, 'center', '700');
          g.fillStyle = '#ffffff'; g.fillRect(bx, by, k * 3.6, k * 2.4); g.fillStyle = '#111111';
          for (var i = 0; i < 16; i++) g.fillRect(bx + k * 0.25 + i * k * 0.2, by + k * 0.25, k * (i % 3 ? 0.08 : 0.13), k * 1.9);
          dot(g, k * 2.6, h - k * 2.6, k * 1.4, '#ffd400'); txt(g, 'NEW', k * 2.6, h - k * 2.6, k * 0.85, '#111111', 'center', '800');
        });
        add('p_postcard', 'Postcard', 'Print', '#f6efe2', 0.07, function (g, w, h, m, col) {
          var k = K(w, h, m), e = k * 1.1, sx = w - e - k * 4.6, sy = e + k * 0.5, sw = k * 3.6, sh = k * 4.2, d = ink(col) === '#ffffff' ? '#eeeeee' : '#8a7a62';
          cut(g, w, h, function () { g.rect(e, e, w - 2 * e, h - 2 * e); }, col);
          g.fillStyle = '#fbfaf5'; g.fillRect(sx, sy, sw, sh); lw(g, Math.max(1, k * 0.1), d); g.setLineDash([k * 0.22, k * 0.18]); g.beginPath(); g.rect(sx, sy, sw, sh); g.stroke(); g.setLineDash([]);
          g.fillStyle = '#c85a3c'; g.fillRect(sx + k * 0.45, sy + k * 0.45, sw - k * 0.9, sh - k * 0.9); dot(g, sx + sw / 2, sy + sh * 0.4, k * 0.8, '#f6d27a');
          lw(g, Math.max(1, k * 0.09), d); g.beginPath(); g.arc(sx - k * 1.4, sy + sh * 0.5, k * 1.1, 0, PI * 2); g.stroke();
          g.beginPath(); for (var i = 0; i < 4; i++) { g.moveTo(sx - k * 3.2, sy + sh * 0.3 + i * k * 0.5); g.lineTo(sx - k * 0.1, sy + sh * 0.3 + i * k * 0.5); } g.stroke();
        });
        add('p_comic', 'Comic panel', 'Print', '#111111', 0.04, function (g, w, h, m, col) {
          var k = K(w, h, m), e = k * 1.1, bw = k * 9.6, bh = k * 1.9, fs = k * 0.8;
          cut(g, w, h, function () { rrect(g, e, e, w - 2 * e, h - 2 * e, k * 0.9); }, col);
          g.fillStyle = '#ffe14d'; g.fillRect(e, e, bw, bh); lw(g, Math.max(1, k * 0.18), col); g.beginPath(); g.rect(e, e, bw, bh); g.stroke();
          txt(g, 'MEANWHILE...', e + bw / 2, e + bh / 2, fs, '#111111', 'center', '800', '"Comic Sans MS", "Bangers", cursive, sans-serif');
        });

        // ----- Screens -----
        add('s_tv', 'Retro TV set', 'Screens', '#5a3d2b', 0.07, function (g, w, h, m, col) {
          var k = K(w, h, m), rp = k * 3.8, light = mix(col, '#ffffff', 0.35), dark = mix(col, '#000000', 0.45), i;
          cut(g, w, h, function () { rrect(g, k, k, w - k - rp, h - 2 * k, k * 2.2); }, col);
          g.fillStyle = dark; g.fillRect(w - rp + k * 0.2, k * 1.2, rp - k * 1.4, h - k * 2.4);
          dot(g, w - rp / 2 - k * 0.05, h * 0.3, k * 0.95, light); dot(g, w - rp / 2 - k * 0.05, h * 0.3 + k * 2.7, k * 0.95, light);
          lw(g, Math.max(1, k * 0.1), dark); g.beginPath(); g.moveTo(w - rp / 2 - k * 0.05, h * 0.3 - k * 0.7); g.lineTo(w - rp / 2 - k * 0.05, h * 0.3); g.moveTo(w - rp / 2 - k * 0.05, h * 0.3 + k * 2); g.lineTo(w - rp / 2 - k * 0.05, h * 0.3 + k * 2.7); g.stroke();
          lw(g, Math.max(1, k * 0.14), light); g.beginPath(); for (i = 0; i < 6; i++) { g.moveTo(w - rp + k * 0.9, h * 0.68 + i * k * 0.5); g.lineTo(w - k * 1.3, h * 0.68 + i * k * 0.5); } g.stroke();
        });
        add('s_monitor', 'Monitor', 'Screens', '#15171b', 0.06, function (g, w, h, m, col) {
          var k = K(w, h, m), chin = k * 2.3;
          cut(g, w, h, function () { rrect(g, k, k, w - 2 * k, h - k - chin, k * 0.5); }, col);
          dot(g, w / 2, h - chin / 2, k * 0.2, '#3aff7a'); g.fillStyle = mix(col, '#ffffff', 0.25); g.fillRect(w / 2 - k * 1.6, h - chin / 2 - k * 0.06, k * 1.2, k * 0.12);
          lw(g, Math.max(1, k * 0.06), 'rgba(255,255,255,0.18)'); g.beginPath(); rrect(g, k * 0.5, k * 0.5, w - k, h - k * 0.9, k * 0.9); g.stroke();
        });
        add('s_browser', 'Browser window', 'Screens', '#e9ecf1', 0.06, function (g, w, h, m, col) {
          var k = K(w, h, m), th = k * 2.7, e = k * 0.5, d = ink(col) === '#ffffff' ? '#ffffff' : '#c9ced6', cy = th / 2;
          cut(g, w, h, function () { g.rect(e, th, w - 2 * e, h - th - e); }, col);
          dot(g, k * 1.2, cy, k * 0.34, '#ff5f57'); dot(g, k * 2.1, cy, k * 0.34, '#febc2e'); dot(g, k * 3.0, cy, k * 0.34, '#28c840');
          g.fillStyle = d; g.beginPath(); rrect(g, k * 4.2, cy - k * 0.6, Math.max(k * 3, w - k * 8), k * 1.2, k * 0.6); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(k * 5, cy - k * 0.08, Math.min(k * 5, w * 0.25), k * 0.16);
        });

        // ----- Social -----
        add('x_insta', 'Photo post', 'Social', '#ffffff', 0.06, function (g, w, h, m, col) {
          var k = K(w, h, m), th = k * 2.5, bh = k * 3.3, d = ink(col) === '#ffffff' ? '#f2f2f2' : '#262626', gry = ink(col) === '#ffffff' ? '#cfcfcf' : '#c8c8c8';
          cut(g, w, h, function () { g.rect(0, th, w, h - th - bh); }, col);
          dot(g, k * 1.4, th / 2, k * 0.78, '#e1306c'); dot(g, k * 1.4, th / 2, k * 0.6, col); dot(g, k * 1.4, th / 2, k * 0.5, gry);
          g.fillStyle = d; g.fillRect(k * 2.6, th / 2 - k * 0.3, k * 3.4, k * 0.34); g.fillStyle = gry; g.fillRect(k * 2.6, th / 2 + k * 0.2, k * 2.2, k * 0.26);
          dot(g, w - k * 1.2, th / 2, k * 0.12, d); dot(g, w - k * 1.6, th / 2, k * 0.12, d); dot(g, w - k * 2.0, th / 2, k * 0.12, d);
          var y = h - bh + k * 0.95; lw(g, Math.max(1, k * 0.14), d);
          heart(g, k * 1.3, y, k * 0.42); g.stroke(); g.beginPath(); g.arc(k * 2.9, y, k * 0.5, 0, PI * 2); g.stroke();
          g.beginPath(); g.moveTo(k * 4.2, y + k * 0.45); g.lineTo(k * 5.1, y); g.lineTo(k * 4.2, y - k * 0.45); g.lineTo(k * 4.4, y); g.closePath(); g.stroke();
          g.fillStyle = d; g.fillRect(k * 0.9, h - bh + k * 1.9, w * 0.28, k * 0.3); g.fillStyle = gry; g.fillRect(k * 0.9, h - bh + k * 2.5, w * 0.5, k * 0.24);
        });
        add('x_reel', 'Reel buttons', 'Social', '#ffffff', 0.06, function (g, w, h, m, col) {
          var k = K(w, h, m), x = w - k * 1.7, y0 = h * 0.5;
          g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = k * 0.4; lw(g, Math.max(1.5, k * 0.2), col); g.fillStyle = col;
          heart(g, x, y0, k * 0.8); g.stroke(); g.beginPath(); g.arc(x, y0 + k * 3.2, k * 0.8, 0, PI * 2); g.stroke();
          g.beginPath(); g.moveTo(x - k * 0.8, y0 + k * 6.6); g.lineTo(x + k * 0.8, y0 + k * 5.8); g.lineTo(x + k * 0.1, y0 + k * 7.5); g.lineTo(x - k * 0.1, y0 + k * 6.7); g.closePath(); g.stroke();
          g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)';
          var ax = k * 1.8, ay = h - k * 3.1; dot(g, ax, ay, k * 0.95, col); dot(g, ax, ay, k * 0.75, '#9a9a9a');
          g.fillStyle = col; g.fillRect(ax + k * 1.5, ay - k * 0.5, k * 4.2, k * 0.4); g.fillStyle = rgba(col, 0.75); g.fillRect(ax - k * 0.9, ay + k * 1.4, k * 7, k * 0.3); g.fillRect(ax - k * 0.9, ay + k * 2.0, k * 4.6, k * 0.3);
        });
        add('x_player', 'Video player', 'Social', '#ff0000', 0.06, function (g, w, h, m, col) {
          var k = K(w, h, m), bh = k * 2.3, y = h - bh, px = k * 0.9, tw = w - 2 * px, cy = y + bh * 0.62;
          g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, y, w, bh);
          g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(px, y + k * 0.35, tw, k * 0.18); g.fillStyle = col; g.fillRect(px, y + k * 0.35, tw * 0.4, k * 0.18); dot(g, px + tw * 0.4, y + k * 0.44, k * 0.3, col);
          g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(px, cy - k * 0.5); g.lineTo(px + k * 0.9, cy); g.lineTo(px, cy + k * 0.5); g.closePath(); g.fill();
          txt(g, '0:42 / 3:10', px + k * 1.7, cy, k * 0.75, '#ffffff', 'left', '600');
          lw(g, Math.max(1, k * 0.1), '#ffffff'); g.beginPath(); g.moveTo(w - px - k * 0.9, cy - k * 0.2); g.lineTo(w - px - k * 0.9, cy - k * 0.55); g.lineTo(w - px - k * 0.4, cy - k * 0.55); g.moveTo(w - px - k * 0.4, cy + k * 0.55); g.lineTo(w - px - k * 0.9, cy + k * 0.55); g.lineTo(w - px - k * 0.9, cy + k * 0.2); g.stroke();
        });

        // ----- Neon -----
        add('neon_bars', 'Neon bars', 'Neon', '#ff2fa8', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), y = k * 1.5, x0 = k * 1.5, x1 = w - k * 1.5;
          neon(g, col, k, function () { g.moveTo(x0, y); g.lineTo(x1, y); g.moveTo(x0, h - y); g.lineTo(x1, h - y); });
          neon(g, mix(col, '#18e6ff', 0.9), k * 0.6, function () { g.moveTo(x0 + k * 2, y + k * 1.1); g.lineTo(x1 - k * 2, y + k * 1.1); g.moveTo(x0 + k * 2, h - y - k * 1.1); g.lineTo(x1 - k * 2, h - y - k * 1.1); });
        });
        add('neon_pill', 'Neon pill', 'Neon', '#ffe14d', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), i = k * 1.4;
          neon(g, col, k, function () { rrect(g, i, i, w - 2 * i, h - 2 * i, Math.min(w, h) / 2 - i); });
        });
      })();

      // ---------- world set: Islamic, science, futuristic, vintage, ornate ----------
      // Original designs drawn from public traditions (geometric tilings, arches, blueprints, HUDs, engraved borders). Plain colours and shapes only.
      (function () {
        var PI = Math.PI, TAU = PI * 2;
        function K(w, h, m) { return Math.max(1.5, Math.min(m, Math.min(w, h) * 0.14)); }
        function rgb(hx) { var n = parseInt(String(hx).replace('#', ''), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
        function toHex(a) { return '#' + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
        function mix(a, b, t) { var x = rgb(a), y = rgb(b); return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); }
        function lw(g, v, col) { g.lineWidth = Math.max(1, v); g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; }
        function add(key, label, cat, color, width, fn) { FRAMES.push({ key: key, label: label, cat: cat }); FRAME_DEF[key] = { color: color, width: width }; FR[key] = fn; }
        function rule(g, x, y, w, h) { g.beginPath(); g.rect(x, y, w, h); g.stroke(); }
        function star(g, cx, cy, R, r, n, rot) { g.beginPath(); for (var i = 0; i < n * 2; i++) { var a = rot + i * PI / n, d = i % 2 ? r : R; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * d, cy + Math.sin(a) * d); } g.closePath(); }
        function poly(g, cx, cy, R, n, rot) { g.beginPath(); for (var i = 0; i < n; i++) { var a = rot + i * TAU / n; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * R, cy + Math.sin(a) * R); } g.closePath(); }
        function circ(g, x, y, r, fill) { g.beginPath(); g.arc(x, y, Math.max(0.4, r), 0, TAU); fill ? g.fill() : g.stroke(); }
        // Puts a tile along all four edges, centre line `ins` from the edge. fn(x, y, along, i): drawn with the origin at the tile centre, "up" pointing at the picture's centre.
        function edges(g, w, h, ins, step, fn) {
          var sides = [[0, w, 0, 1, 0], [1, h, w, 0, 1], [2, w, h, -1, 0], [3, h, 0, 0, -1]];
          sides.forEach(function (s) {
            var len = s[1], n = Math.max(1, Math.round((len - ins * 2) / step)), st = (len - ins * 2) / n;
            for (var i = 0; i < n; i++) {
              var t = ins + st * (i + 0.5), x, y, a;
              if (s[0] === 0) { x = t; y = ins; a = 0; } else if (s[0] === 1) { x = w - ins; y = t; a = PI / 2; } else if (s[0] === 2) { x = w - t; y = h - ins; a = PI; } else { x = ins; y = h - t; a = -PI / 2; }
              g.save(); g.translate(x, y); g.rotate(a); fn(st, i); g.restore();
            }
          });
        }
        function corners(g, w, h, ins, fn) { [[ins, ins, 0], [w - ins, ins, PI / 2], [w - ins, h - ins, PI], [ins, h - ins, -PI / 2]].forEach(function (c, i) { g.save(); g.translate(c[0], c[1]); g.rotate(c[2]); fn(i); g.restore(); }); }
        function base(g, w, h, k, col, thin) { lw(g, Math.max(1, k * (thin || 0.12)), col); rule(g, k * 0.35, k * 0.35, w - k * 0.7, h - k * 0.7); }

        // ================= ISLAMIC =================
        [[6, 'Six-point star'], [8, 'Eight-point star'], [10, 'Ten-point star'], [12, 'Twelve-point star']].forEach(function (d) {
          [false, true].forEach(function (solid) {
            add('x_istar' + d[0] + (solid ? 's' : 'o'), d[1] + (solid ? ' (solid)' : ' (line)'), 'Islamic', '#d4af37', 0.045, function (g, w, h, m, col) {
              var k = K(w, h, m), ins = k * 1.1; base(g, w, h, k, col); lw(g, k * 0.1, col);
              edges(g, w, h, ins, k * 2.2, function () { star(g, 0, 0, k * 0.95, k * 0.5, d[0], -PI / 2); solid ? g.fill() : g.stroke(); });
              corners(g, w, h, ins, function () { star(g, 0, 0, k * 1.15, k * 0.62, d[0], -PI / 2); g.fill(); lw(g, k * 0.1, col); star(g, 0, 0, k * 0.62, k * 0.3, d[0], -PI / 2); g.stroke(); });
            });
          });
        });
        add('x_iarch', 'Pointed arches', 'Islamic', '#0f9d8a', 0.06, function (g, w, h, m, col) {
          var k = K(w, h, m), aw = k * 3, n = Math.max(2, Math.round(w / aw)), s = w / n; lw(g, k * 0.12, col);
          for (var i = 0; i < n; i++) { var x = i * s, y = k * 2.2; g.beginPath(); g.moveTo(x + s * 0.06, 0); g.lineTo(x + s * 0.06, y * 0.55); g.quadraticCurveTo(x + s * 0.06, y * 0.9, x + s / 2, y); g.quadraticCurveTo(x + s * 0.94, y * 0.9, x + s * 0.94, y * 0.55); g.lineTo(x + s * 0.94, 0); g.stroke(); }
          g.beginPath(); g.moveTo(0, k * 2.5); g.lineTo(w, k * 2.5); g.stroke(); base(g, w, h, k, col, 0.08);
        });
        add('x_iarch2', 'Scalloped arches', 'Islamic', '#c9a24a', 0.06, function (g, w, h, m, col) {
          var k = K(w, h, m), n = Math.max(3, Math.round(w / (k * 2.4))), s = w / n; g.fillStyle = col;
          g.beginPath(); g.moveTo(0, 0); for (var i = 0; i < n; i++) g.arc(i * s + s / 2, 0, s / 2 * 0.98, PI, 0, true); g.lineTo(w, 0); g.closePath();
          g.beginPath(); for (i = 0; i < n; i++) { g.moveTo(i * s, 0); g.arc(i * s + s / 2, 0, s / 2, PI, 0, true); } g.fill();
          g.beginPath(); for (i = 0; i < n; i++) { g.moveTo(i * s, h); g.arc(i * s + s / 2, h, s / 2, 0, PI, true); } g.fill();
          lw(g, k * 0.1, col); g.beginPath(); g.moveTo(0, k * 0.2); g.lineTo(0, h - k * 0.2); g.moveTo(w, k * 0.2); g.lineTo(w, h - k * 0.2); g.stroke();
        });
        add('x_imihrab', 'Mihrab window', 'Islamic', '#d4af37', 0.07, function (g, w, h, m, col) {
          var k = K(w, h, m), x0 = k * 1.2, x1 = w - k * 1.2, top = k * 1.2, sh = h * 0.28; g.fillStyle = col; g.beginPath(); g.rect(0, 0, w, h);
          g.moveTo(x0, h - k * 1.2); g.lineTo(x0, top + sh); g.bezierCurveTo(x0, top + sh * 0.35, w / 2 - k, top + sh * 0.2, w / 2, top); g.bezierCurveTo(w / 2 + k, top + sh * 0.2, x1, top + sh * 0.35, x1, top + sh); g.lineTo(x1, h - k * 1.2); g.closePath(); g.fill('evenodd');
          lw(g, k * 0.12, mix(col, '#ffffff', 0.5)); g.beginPath(); g.moveTo(x0 + k * 0.4, h - k * 1.6); g.lineTo(x0 + k * 0.4, top + sh + k * 0.2); g.bezierCurveTo(x0 + k * 0.4, top + sh * 0.5, w / 2 - k, top + sh * 0.4, w / 2, top + k * 0.6); g.stroke();
        });
        [[4, 'Diamond lattice'], [3, 'Wide lattice'], [6, 'Fine lattice']].forEach(function (d) {
          add('x_ilat' + d[0], d[1] + ' (mashrabiya)', 'Islamic', '#b8860b', 0.05, function (g, w, h, m, col) {
            var k = K(w, h, m), band = k * 1.8, c = k * 2.2 / (d[0] / 4); lw(g, Math.max(1, k * 0.09), col);
            g.save(); g.beginPath(); g.rect(0, 0, w, band); g.rect(0, h - band, w, band); g.rect(0, band, band, h - band * 2); g.rect(w - band, band, band, h - band * 2); g.clip();
            g.beginPath(); for (var x = -h; x < w + h; x += c) { g.moveTo(x, 0); g.lineTo(x + h, h); g.moveTo(x, h); g.lineTo(x + h, 0); } g.stroke(); g.restore();
            lw(g, k * 0.14, col); rule(g, band, band, w - band * 2, h - band * 2); rule(g, k * 0.2, k * 0.2, w - k * 0.4, h - k * 0.4);
          });
        });
        add('x_icres', 'Crescent and stars', 'Islamic', '#e8c35a', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), cx = w / 2, R = k * 1.5; base(g, w, h, k, col, 0.1); g.fillStyle = col;
          g.beginPath(); g.arc(cx, k * 1.6, R, 0, TAU); g.arc(cx + R * 0.4, k * 1.6 - R * 0.1, R * 0.82, 0, TAU, true); g.fill('evenodd');
          star(g, cx + R * 1.5, k * 1.6, k * 0.55, k * 0.22, 5, -PI / 2); g.fill(); star(g, cx - R * 3.5, k * 1.9, k * 0.3, k * 0.12, 5, -PI / 2); g.fill(); star(g, cx + R * 3.5, k * 1.9, k * 0.3, k * 0.12, 5, -PI / 2); g.fill();
          corners(g, w, h, k * 1.0, function () { star(g, 0, 0, k * 0.8, k * 0.42, 8, -PI / 2); g.fill(); });
        });
        add('x_irosette', 'Girih corners', 'Islamic', '#1e88a8', 0.06, function (g, w, h, m, col) {
          var k = K(w, h, m); base(g, w, h, k, col, 0.1);
          corners(g, w, h, k * 0.35, function () { lw(g, k * 0.1, col); for (var r = 1; r <= 3; r++) { star(g, k * 0.2, k * 0.2, k * 0.9 * r, k * 0.55 * r, 8, 0); g.stroke(); } circ(g, k * 0.2, k * 0.2, k * 0.25, true); });
        });
        add('x_ikufic', 'Calligraphy band', 'Islamic', '#d4af37', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), ins = k * 1.0; lw(g, k * 0.2, col); base(g, w, h, k, col, 0.1);
          edges(g, w, h, ins, k * 1.4, function (st, i) { g.beginPath(); var u = k * 0.5; if (i % 2) { g.moveTo(-u, u * 0.6); g.lineTo(-u, -u * 0.6); g.lineTo(0, -u * 0.6); g.lineTo(0, u * 0.6); g.lineTo(u, u * 0.6); g.lineTo(u, -u * 0.6); } else { g.moveTo(-u, -u * 0.6); g.lineTo(-u, u * 0.6); g.lineTo(0, u * 0.6); g.lineTo(0, -u * 0.6); g.lineTo(u, -u * 0.6); g.lineTo(u, u * 0.6); } g.stroke(); });
        });
        add('x_itile', 'Zellige tiles', 'Islamic', '#1f6f9c', 0.06, function (g, w, h, m, col) {
          var k = K(w, h, m), ins = k * 0.95, alt = mix(col, '#ffffff', 0.55);
          edges(g, w, h, ins, k * 1.5, function (st, i) { g.fillStyle = i % 2 ? col : alt; g.fillRect(-k * 0.7, -k * 0.7, k * 1.4, k * 1.4); g.fillStyle = i % 2 ? alt : col; star(g, 0, 0, k * 0.55, k * 0.25, 8, PI / 8); g.fill(); });
        });
        add('x_ilantern', 'Lantern string', 'Islamic', '#f2b134', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), n = Math.max(3, Math.round(w / (k * 3.2))), s = w / n; lw(g, k * 0.07, col);
          g.beginPath(); g.moveTo(0, k * 0.4); g.quadraticCurveTo(w / 2, k * 1.1, w, k * 0.4); g.stroke();
          for (var i = 0; i < n; i++) { var x = s * (i + 0.5), t = (i + 0.5) / n, y = k * 0.4 + (1 - Math.pow(2 * t - 1, 2)) * k * 0.35; lw(g, k * 0.06, col); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + k * 0.7); g.stroke();
            g.fillStyle = col; g.beginPath(); g.moveTo(x - k * 0.18, y + k * 0.7); g.lineTo(x + k * 0.18, y + k * 0.7); g.lineTo(x + k * 0.42, y + k * 1.5); g.quadraticCurveTo(x, y + k * 2.0, x - k * 0.42, y + k * 1.5); g.closePath(); g.fill(); g.fillStyle = mix(col, '#ffffff', 0.7); circ(g, x, y + k * 1.45, k * 0.14, true); }
        });

        // ================= SCIENCE =================
        add('x_sgraph', 'Graph paper', 'Science', '#3aa0ff', 0.04, function (g, w, h, m, col) {
          var k = K(w, h, m), c = Math.max(6, Math.min(w, h) / 24), band = k * 1.6;
          g.save(); g.beginPath(); g.rect(0, 0, w, band); g.rect(0, h - band, w, band); g.rect(0, band, band, h - band * 2); g.rect(w - band, band, band, h - band * 2); g.clip();
          g.fillStyle = 'rgba(255,255,255,0.78)'; g.fillRect(0, 0, w, h);
          for (var pass = 0; pass < 2; pass++) { lw(g, pass ? 1.4 : 0.7, pass ? col : mix(col, '#ffffff', 0.4)); g.beginPath(); var st = pass ? c * 5 : c; for (var x = 0; x <= w; x += st) { g.moveTo(x, 0); g.lineTo(x, h); } for (var y = 0; y <= h; y += st) { g.moveTo(0, y); g.lineTo(w, y); } g.stroke(); }
          g.restore();
        });
        add('x_sblue', 'Blueprint', 'Science', '#e8f1ff', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), c = k * 1.4, band = k * 1.7; g.save(); g.beginPath(); g.rect(0, 0, w, band); g.rect(0, h - band, w, band); g.rect(0, band, band, h - band * 2); g.rect(w - band, band, band, h - band * 2); g.clip();
          g.fillStyle = 'rgba(16,52,120,0.88)'; g.fillRect(0, 0, w, h); lw(g, 0.8, 'rgba(232,241,255,0.35)'); g.beginPath(); for (var x = 0; x < w; x += c) { g.moveTo(x, 0); g.lineTo(x, h); } for (var y = 0; y < h; y += c) { g.moveTo(0, y); g.lineTo(w, y); } g.stroke(); g.restore();
          lw(g, k * 0.1, col); rule(g, band, band, w - band * 2, h - band * 2); corners(g, w, h, k * 0.5, function () { g.beginPath(); g.moveTo(0, k * 0.6); g.lineTo(0, 0); g.lineTo(k * 0.6, 0); g.stroke(); });
        });
        add('x_sruler', 'Ruler edges', 'Science', '#f2c744', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), u = Math.max(4, Math.min(w, h) / 40); g.fillStyle = col; g.fillRect(0, 0, w, k); g.fillRect(0, h - k, w, k); g.fillRect(0, k, k, h - k * 2); g.fillRect(w - k, k, k, h - k * 2); lw(g, 1, '#222');
          g.beginPath(); for (var i = 0; i * u < w; i++) { var L = i % 10 === 0 ? k * 0.7 : i % 5 === 0 ? k * 0.5 : k * 0.3; g.moveTo(i * u, 0); g.lineTo(i * u, L); g.moveTo(i * u, h); g.lineTo(i * u, h - L); }
          for (i = 0; i * u < h; i++) { L = i % 10 === 0 ? k * 0.7 : i % 5 === 0 ? k * 0.5 : k * 0.3; g.moveTo(0, i * u); g.lineTo(L, i * u); g.moveTo(w, i * u); g.lineTo(w - L, i * u); } g.stroke();
        });
        add('x_scircuit', 'Circuit board', 'Science', '#2ee6a6', 0.045, function (g, w, h, m, col) {
          var k = K(w, h, m), s = k * 1.2, r = 77; function rnd() { r = (r * 16807) % 2147483647; return r / 2147483647; }
          lw(g, Math.max(1, k * 0.09), col); g.beginPath();
          for (var side = 0; side < 4; side++) { var len = side % 2 ? h : w, n = Math.floor(len / s); for (var i = 1; i < n; i++) { if (rnd() < 0.55) continue; var t = i * s, d = (0.4 + rnd() * 1.4) * k, e = rnd() < 0.5 ? 1 : -1, x, y, dx, dy;
            if (side === 0) { x = t; y = 0; dx = 0; dy = 1; } else if (side === 1) { x = w; y = t; dx = -1; dy = 0; } else if (side === 2) { x = t; y = h; dx = 0; dy = -1; } else { x = 0; y = t; dx = 1; dy = 0; }
            var x1 = x + dx * d, y1 = y + dy * d; g.moveTo(x, y); g.lineTo(x1, y1); if (rnd() < 0.6) { g.lineTo(x1 + (dy ? e * s * 0.5 : 0), y1 + (dx ? e * s * 0.5 : 0)); } } }
          g.stroke(); r = 5; for (var q = 0; q < 40; q++) { var px = rnd() * w, py = rnd() * h; var edge = Math.min(px, w - px, py, h - py); if (edge < k * 2.2) circ(g, px, py, k * 0.13, rnd() < 0.5); }
          base(g, w, h, k, col, 0.1);
        });
        add('x_sdna', 'DNA helix sides', 'Science', '#ff5fa2', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), alt = mix(col, '#3ad0ff', 0.7);
          [k * 1.4, w - k * 1.4].forEach(function (cx) { var A = k * 0.9; lw(g, k * 0.12, col); g.beginPath(); for (var y = 0; y <= h; y += 3) g[y ? 'lineTo' : 'moveTo'](cx + Math.sin(y / (k * 1.4)) * A, y); g.stroke();
            lw(g, k * 0.12, alt); g.beginPath(); for (y = 0; y <= h; y += 3) g[y ? 'lineTo' : 'moveTo'](cx - Math.sin(y / (k * 1.4)) * A, y); g.stroke();
            lw(g, k * 0.05, mix(col, '#ffffff', 0.5)); g.beginPath(); for (y = k * 0.7; y < h; y += k * 0.7) { var o = Math.sin(y / (k * 1.4)) * A; g.moveTo(cx + o, y); g.lineTo(cx - o, y); } g.stroke(); });
        });
        add('x_satom', 'Atom corners', 'Science', '#4da3ff', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m); base(g, w, h, k, col, 0.08);
          corners(g, w, h, k * 1.4, function () { lw(g, k * 0.09, col); for (var i = 0; i < 3; i++) { g.save(); g.rotate(i * PI / 3 + 0.3); g.beginPath(); g.ellipse(0, 0, k * 1.5, k * 0.55, 0, 0, TAU); g.stroke(); g.restore(); } circ(g, 0, 0, k * 0.28, true); circ(g, k * 1.35, k * 0.35, k * 0.14, true); });
        });
        add('x_smol', 'Molecule chain', 'Science', '#6ee07a', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), ins = k * 1.0; lw(g, k * 0.1, col);
          edges(g, w, h, ins, k * 2, function (st, i) { poly(g, 0, 0, k * 0.55, 6, PI / 6); g.stroke(); if (i % 2) circ(g, 0, 0, k * 0.2, true); g.beginPath(); g.moveTo(k * 0.5, 0); g.lineTo(k * 1.0, 0); g.stroke(); });
        });
        add('x_sscope', 'Oscilloscope', 'Science', '#37ff7a', 0.045, function (g, w, h, m, col) {
          var k = K(w, h, m), band = k * 1.5; g.save(); g.beginPath(); g.rect(0, 0, w, band); g.rect(0, h - band, w, band); g.rect(0, band, band, h - band * 2); g.rect(w - band, band, band, h - band * 2); g.clip(); g.fillStyle = 'rgba(2,20,10,0.9)'; g.fillRect(0, 0, w, h);
          lw(g, 0.7, 'rgba(55,255,122,0.35)'); g.beginPath(); for (var i = 1; i < 10; i++) { g.moveTo(w * i / 10, 0); g.lineTo(w * i / 10, h); } for (i = 1; i < 8; i++) { g.moveTo(0, h * i / 8); g.lineTo(w, h * i / 8); } g.stroke();
          lw(g, k * 0.09, col); g.beginPath(); for (var x = 0; x <= w; x += 3) g[x ? 'lineTo' : 'moveTo'](x, band * 0.5 + Math.sin(x / (k * 1.2)) * band * 0.3); g.stroke(); g.restore();
        });
        add('x_ssymbols', 'Periodic tiles', 'Science', '#e34a6f', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), sy = ['H', 'He', 'Li', 'C', 'N', 'O', 'Na', 'Fe', 'Cu', 'Au', 'Ag', 'U', 'Si', 'Ca', 'Ne', 'Zn'];
          edges(g, w, h, k * 1.0, k * 1.6, function (st, i) { g.fillStyle = i % 3 ? col : mix(col, '#2255cc', 0.6); g.fillRect(-k * 0.7, -k * 0.7, k * 1.4, k * 1.4); g.fillStyle = '#fff'; g.font = '700 ' + Math.round(k * 0.7) + 'px system-ui,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sy[i % sy.length], 0, k * 0.05); });
        });
        add('x_sorbit', 'Orbit rings', 'Science', '#9a7bff', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2; lw(g, k * 0.06, col);
          for (var i = 1; i <= 4; i++) { var r = R * (0.62 + i * 0.1); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); var a = i * 1.7 + 0.6; circ(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, k * 0.3, true); }
          base(g, w, h, k, col, 0.06);
        });
        add('x_sperf', 'Lab notebook', 'Science', '#c8d0dc', 0.06, function (g, w, h, m, col) {
          var k = K(w, h, m); g.fillStyle = 'rgba(250,250,245,0.92)'; g.fillRect(0, 0, k * 2.6, h); for (var y = k * 1.2; y < h - k; y += k * 2.2) { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(k * 0.6, y - k * 0.3, k * 0.6, k * 0.6); circ(g, k * 0.9, y, k * 0.3, false); }
          lw(g, 1.5, '#d6403f'); g.beginPath(); g.moveTo(k * 2.6, 0); g.lineTo(k * 2.6, h); g.stroke();
        });

        // ================= FUTURISTIC =================
        [[0, 'Corner brackets'], [1, 'Double brackets'], [2, 'Notched brackets'], [3, 'Ticked brackets']].forEach(function (d) {
          add('x_hud' + d[0], 'HUD ' + d[1].toLowerCase(), 'Futuristic', '#26e0ff', 0.04, function (g, w, h, m, col) {
            var k = K(w, h, m), L = Math.min(w, h) * 0.12 + k;
            corners(g, w, h, k * 0.6, function () { lw(g, k * 0.16, col); g.beginPath(); g.moveTo(0, L); g.lineTo(0, 0); g.lineTo(L, 0); g.stroke();
              if (d[0] === 1) { lw(g, k * 0.08, col); g.beginPath(); g.moveTo(k * 0.45, L * 0.7); g.lineTo(k * 0.45, k * 0.45); g.lineTo(L * 0.7, k * 0.45); g.stroke(); }
              if (d[0] === 2) { g.beginPath(); g.moveTo(L, k * 0.35); g.lineTo(L + k * 0.5, k * 0.35); g.moveTo(k * 0.35, L); g.lineTo(k * 0.35, L + k * 0.5); g.stroke(); circ(g, k * 0.45, k * 0.45, k * 0.12, true); }
              if (d[0] === 3) { lw(g, k * 0.06, col); g.beginPath(); for (var i = 1; i < 6; i++) { g.moveTo(i * L / 6, k * 0.3); g.lineTo(i * L / 6, k * 0.3 + (i % 2 ? k * 0.25 : k * 0.4)); g.moveTo(k * 0.3, i * L / 6); g.lineTo(k * 0.3 + (i % 2 ? k * 0.25 : k * 0.4), i * L / 6); } g.stroke(); } });
          });
        });
        add('x_fhex', 'Hex grid border', 'Futuristic', '#6a5cff', 0.045, function (g, w, h, m, col) {
          var k = K(w, h, m), ins = k * 0.9; lw(g, k * 0.08, col);
          edges(g, w, h, ins, k * 1.5, function (st, i) { poly(g, 0, 0, k * 0.8, 6, 0); if (i % 3 === 0) g.fill(); else g.stroke(); });
        });
        add('x_fcut', 'Sci-fi cut corners', 'Futuristic', '#14e0b8', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), c = k * 2.2, i0 = k * 0.5; lw(g, k * 0.14, col); g.beginPath(); g.moveTo(i0 + c, i0); g.lineTo(w - i0 - c, i0); g.lineTo(w - i0, i0 + c); g.lineTo(w - i0, h - i0 - c); g.lineTo(w - i0 - c, h - i0); g.lineTo(i0 + c, h - i0); g.lineTo(i0, h - i0 - c); g.lineTo(i0, i0 + c); g.closePath(); g.stroke();
          lw(g, k * 0.06, col); g.beginPath(); g.moveTo(i0 + c + k * 0.4, i0 + k * 0.5); g.lineTo(w - i0 - c - k * 0.4, i0 + k * 0.5); g.moveTo(i0 + c + k * 0.4, h - i0 - k * 0.5); g.lineTo(w - i0 - c - k * 0.4, h - i0 - k * 0.5); g.stroke();
        });
        add('x_freticle', 'Target reticle', 'Futuristic', '#ff3d5a', 0.04, function (g, w, h, m, col) {
          var k = K(w, h, m), cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.12; lw(g, k * 0.1, col); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.moveTo(cx - r * 1.6, cy); g.lineTo(cx - r * 0.5, cy); g.moveTo(cx + r * 0.5, cy); g.lineTo(cx + r * 1.6, cy); g.moveTo(cx, cy - r * 1.6); g.lineTo(cx, cy - r * 0.5); g.moveTo(cx, cy + r * 0.5); g.lineTo(cx, cy + r * 1.6); g.stroke();
          circ(g, cx, cy, k * 0.12, true); var L = Math.min(w, h) * 0.1 + k; corners(g, w, h, k * 0.7, function () { g.beginPath(); g.moveTo(0, L); g.lineTo(0, 0); g.lineTo(L, 0); g.stroke(); });
        });
        add('x_fscan', 'Scan lines', 'Futuristic', '#7df9ff', 0.04, function (g, w, h, m, col) {
          var k = K(w, h, m), band = k * 1.6; lw(g, Math.max(1, k * 0.05), col); g.save(); g.globalAlpha = 0.5; g.beginPath(); for (var y = 0; y < h; y += Math.max(3, k * 0.35)) { if (y < band || y > h - band) { g.moveTo(0, y); g.lineTo(w, y); } else { g.moveTo(0, y); g.lineTo(band, y); g.moveTo(w - band, y); g.lineTo(w, y); } } g.stroke(); g.restore(); base(g, w, h, k, col, 0.1);
        });
        add('x_fchev', 'Chevron rails', 'Futuristic', '#ff9d00', 0.045, function (g, w, h, m, col) {
          var k = K(w, h, m); lw(g, k * 0.14, col);
          edges(g, w, h, k * 0.9, k * 0.9, function (st, i) { g.beginPath(); g.moveTo(-k * 0.3, -k * 0.25); g.lineTo(0, k * 0.25); g.lineTo(k * 0.3, -k * 0.25); g.stroke(); });
        });
        add('x_fdata', 'Data ticks', 'Futuristic', '#22d3ee', 0.04, function (g, w, h, m, col) {
          var k = K(w, h, m), r = 9; function rnd() { r = (r * 16807) % 2147483647; return r / 2147483647; } lw(g, k * 0.1, col);
          edges(g, w, h, k * 0.8, k * 0.55, function () { g.beginPath(); g.moveTo(0, 0); g.lineTo(0, k * (0.2 + rnd() * 1.1)); g.stroke(); }); base(g, w, h, k, col, 0.05);
        });
        add('x_fholo', 'Holo panel', 'Futuristic', '#59f0ff', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), c = k * 1.4; lw(g, k * 0.1, col); g.beginPath(); g.moveTo(k * 0.5 + c, k * 0.5); g.lineTo(w - k * 0.5, k * 0.5); g.lineTo(w - k * 0.5, h - k * 0.5 - c); g.moveTo(w - k * 0.5 - c, h - k * 0.5); g.lineTo(k * 0.5, h - k * 0.5); g.lineTo(k * 0.5, k * 0.5 + c); g.stroke();
          g.fillStyle = col; g.fillRect(k * 0.5, k * 0.5, c * 0.9, k * 0.18); g.fillRect(w - k * 0.5 - c * 0.9, h - k * 0.68, c * 0.9, k * 0.18); for (var i = 0; i < 3; i++) circ(g, w - k * 1.2 - i * k * 0.5, k * 1.1, k * 0.14, true);
        });
        add('x_fgrid', 'Neon grid floor', 'Futuristic', '#ff2bd6', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), hz = h - k * 3.2; lw(g, k * 0.07, col); g.beginPath(); g.moveTo(0, hz); g.lineTo(w, hz); for (var i = -8; i <= 8; i++) { g.moveTo(w / 2 + i * w * 0.03, hz); g.lineTo(w / 2 + i * w * 0.2, h); } for (i = 1; i < 5; i++) { var y = hz + (h - hz) * Math.pow(i / 5, 1.8); g.moveTo(0, y); g.lineTo(w, y); } g.stroke();
        });

        // ================= VINTAGE / OLD EDGE =================
        add('x_vdeckle', 'Deckled paper', 'Vintage', '#efe6d0', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), r = 31; function rnd() { r = (r * 16807) % 2147483647; return r / 2147483647; } g.fillStyle = col; g.beginPath(); g.rect(0, 0, w, h);
          var s = Math.max(3, k * 0.35), x, y, J = k * 0.9; g.moveTo(0, 0); for (x = 0; x <= w; x += s) g.lineTo(x, k * 0.6 + rnd() * J); for (y = 0; y <= h; y += s) g.lineTo(w - k * 0.6 - rnd() * J, y); for (x = w; x >= 0; x -= s) g.lineTo(x, h - k * 0.6 - rnd() * J); for (y = h; y >= 0; y -= s) g.lineTo(k * 0.6 + rnd() * J, y); g.closePath(); g.fill('evenodd');
        });
        add('x_vtorn', 'Torn edge', 'Vintage', '#f5f0e6', 0.06, function (g, w, h, m, col) {
          var k = K(w, h, m), r = 3; function rnd() { r = (r * 16807) % 2147483647; return r / 2147483647; } g.fillStyle = col; g.beginPath(); g.rect(0, 0, w, h);
          var s = Math.max(4, k * 0.5), x, y; g.moveTo(0, 0); for (x = 0; x <= w; x += s) g.lineTo(x, k * 0.4 + rnd() * k * 1.6); for (y = 0; y <= h; y += s) g.lineTo(w - k * 0.4 - rnd() * k * 1.6, y); for (x = w; x >= 0; x -= s) g.lineTo(x, h - k * 0.4 - rnd() * k * 1.6); for (y = h; y >= 0; y -= s) g.lineTo(k * 0.4 + rnd() * k * 1.6, y); g.closePath(); g.fill('evenodd');
        });
        add('x_vstamp', 'Postage stamp', 'Vintage', '#fdfaf0', 0.07, function (g, w, h, m, col) {
          var k = K(w, h, m), r = k * 0.32, s = r * 2.6; g.fillStyle = col; g.beginPath(); g.rect(0, 0, w, h); g.rect(k * 1.1, k * 1.1, w - k * 2.2, h - k * 2.2);
          for (var x = s / 2; x < w; x += s) { g.moveTo(x + r, 0); g.arc(x, 0, r, 0, TAU); g.moveTo(x + r, h); g.arc(x, h, r, 0, TAU); } for (var y = s / 2; y < h; y += s) { g.moveTo(r, y); g.arc(0, y, r, 0, TAU); g.moveTo(w + r, y); g.arc(w, y, r, 0, TAU); } g.fill('evenodd');
        });
        add('x_vfilm', 'Old film strip', 'Vintage', '#141414', 0.06, function (g, w, h, m, col) {
          var k = K(w, h, m), band = k * 1.7, s = band * 1.1; g.fillStyle = col; g.fillRect(0, 0, w, band); g.fillRect(0, h - band, w, band); g.clearRect(0, 0, 0, 0);
          g.globalCompositeOperation = 'destination-out'; for (var x = s * 0.4; x < w; x += s) { rr(g, x, band * 0.28, band * 0.44, band * 0.44); rr(g, x, h - band * 0.72, band * 0.44, band * 0.44); } g.globalCompositeOperation = 'source-over';
          function rr(g, x, y, a, b) { g.beginPath(); g.rect(x, y, a, b); g.fill(); }
        });
        add('x_vvict', 'Victorian rule', 'Vintage', '#6b3f1d', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m); lw(g, k * 0.16, col); rule(g, k * 0.4, k * 0.4, w - k * 0.8, h - k * 0.8); lw(g, k * 0.05, col); rule(g, k * 0.9, k * 0.9, w - k * 1.8, h - k * 1.8);
          corners(g, w, h, k * 0.9, function () { g.beginPath(); g.arc(0, 0, k * 0.7, 0, PI / 2); g.stroke(); circ(g, k * 0.1, k * 0.1, k * 0.14, true); });
        });
        add('x_vflour', 'Flourish corners', 'Vintage', '#7a4b1e', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m); base(g, w, h, k, col, 0.07);
          corners(g, w, h, k * 0.35, function () { lw(g, k * 0.11, col); g.beginPath(); g.moveTo(0, k * 3); g.bezierCurveTo(0, k * 1.3, k * 0.4, k * 0.4, k * 3, 0); g.stroke(); g.beginPath(); g.moveTo(k * 0.5, k * 2); g.bezierCurveTo(k * 0.4, k * 1, k * 1, k * 0.5, k * 2, k * 0.5); g.stroke(); g.beginPath(); g.arc(k * 1.0, k * 1.0, k * 0.5, PI, PI * 1.5); g.stroke(); circ(g, k * 0.3, k * 0.3, k * 0.18, true); circ(g, k * 3.1, 0, k * 0.1, true); circ(g, 0, k * 3.1, k * 0.1, true); });
        });
        add('x_vbrass', 'Brass studs', 'Vintage', '#c89b3c', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m); g.fillStyle = mix(col, '#3a2a10', 0.55); g.fillRect(0, 0, w, k * 1.1); g.fillRect(0, h - k * 1.1, w, k * 1.1); g.fillRect(0, 0, k * 1.1, h); g.fillRect(w - k * 1.1, 0, k * 1.1, h);
          edges(g, w, h, k * 0.55, k * 1.5, function () { g.fillStyle = col; circ(g, 0, 0, k * 0.3, true); g.fillStyle = mix(col, '#ffffff', 0.7); circ(g, -k * 0.08, -k * 0.08, k * 0.1, true); });
        });
        add('x_vrope', 'Twisted rope', 'Vintage', '#b88a4a', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), alt = mix(col, '#3a2410', 0.55); edges(g, w, h, k * 0.7, k * 0.55, function () { g.fillStyle = col; g.save(); g.rotate(0.6); g.fillRect(-k * 0.5, -k * 0.2, k * 1.0, k * 0.4); g.restore(); g.fillStyle = alt; g.save(); g.rotate(0.6); g.fillRect(-k * 0.5, k * 0.12, k * 1.0, k * 0.1); g.restore(); });
        });
        add('x_vsepia', 'Aged edges', 'Vintage', '#5a3a1a', 0.07, function (g, w, h, m, col) {
          var k = K(w, h, m); for (var i = 7; i >= 0; i--) { g.save(); g.globalAlpha = 0.12; lw(g, k * (0.3 + i * 0.55), col); rule(g, 0, 0, w, h); g.restore(); }
        });

        // ================= ORNATE / ARTISTIC =================
        add('x_odeco', 'Art Deco fan', 'Ornate', '#d4af37', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m); base(g, w, h, k, col, 0.08);
          corners(g, w, h, k * 0.35, function () { lw(g, k * 0.07, col); for (var i = 1; i <= 6; i++) { g.beginPath(); g.arc(0, 0, k * 0.5 * i, 0, PI / 2); g.stroke(); } g.beginPath(); for (i = 0; i <= 6; i++) { var a = i * PI / 12; g.moveTo(0, 0); g.lineTo(Math.cos(a) * k * 3, Math.sin(a) * k * 3); } g.stroke(); });
        });
        add('x_ogreek', 'Greek meander', 'Ornate', '#2c5fa8', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m); lw(g, k * 0.13, col); edges(g, w, h, k * 0.8, k * 1.3, function () { var u = k * 0.5; g.beginPath(); g.moveTo(-u * 1.3, u); g.lineTo(-u * 1.3, -u); g.lineTo(u * 1.3, -u); g.lineTo(u * 1.3, u * 0.2); g.lineTo(-u * 0.3, u * 0.2); g.lineTo(-u * 0.3, -u * 0.4); g.lineTo(u * 0.5, -u * 0.4); g.stroke(); });
        });
        add('x_oscroll', 'Wave scroll', 'Ornate', '#8a5cf0', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m); lw(g, k * 0.12, col); edges(g, w, h, k * 0.8, k * 1.2, function () { g.beginPath(); g.arc(0, 0, k * 0.45, PI, PI * 2.75); g.stroke(); circ(g, k * 0.05, k * 0.05, k * 0.08, true); });
        });
        add('x_ofloral', 'Floral vine', 'Ornate', '#e0577f', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), leaf = mix(col, '#2e9d4f', 0.9); edges(g, w, h, k * 0.9, k * 1.8, function (st, i) { g.fillStyle = leaf; g.beginPath(); g.ellipse(-k * 0.7, k * 0.12, k * 0.45, k * 0.16, -0.3, 0, TAU); g.fill(); g.beginPath(); g.ellipse(k * 0.7, k * 0.12, k * 0.45, k * 0.16, 0.3, 0, TAU); g.fill();
            g.fillStyle = col; for (var p = 0; p < 5; p++) { circ(g, Math.cos(p * TAU / 5) * k * 0.3, Math.sin(p * TAU / 5) * k * 0.3, k * 0.22, true); } g.fillStyle = '#ffd34d'; circ(g, 0, 0, k * 0.16, true); });
        });
        add('x_ocelt', 'Celtic knot', 'Ornate', '#2f9d6a', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m); base(g, w, h, k, col, 0.05); lw(g, k * 0.16, col); edges(g, w, h, k * 0.9, k * 1.6, function (st, i) { g.beginPath(); g.moveTo(-k * 0.8, k * 0.3); g.bezierCurveTo(-k * 0.3, -k * 0.5, k * 0.3, k * 0.5, k * 0.8, -k * 0.3); g.stroke(); g.beginPath(); g.moveTo(-k * 0.8, -k * 0.3); g.bezierCurveTo(-k * 0.3, k * 0.5, k * 0.3, -k * 0.5, k * 0.8, k * 0.3); g.stroke(); });
        });
        add('x_oasian', 'Asian lattice', 'Ornate', '#c0392b', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m); lw(g, k * 0.12, col); rule(g, k * 0.4, k * 0.4, w - k * 0.8, h - k * 0.8); edges(g, w, h, k * 1.0, k * 1.6, function () { g.beginPath(); g.rect(-k * 0.5, -k * 0.5, k, k); g.moveTo(-k * 0.5, 0); g.lineTo(k * 0.5, 0); g.moveTo(0, -k * 0.5); g.lineTo(0, k * 0.5); g.stroke(); });
        });
        add('x_oafrica', 'Kente stripes', 'Ornate', '#e8b100', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), cols = [col, '#d62828', '#1b5e20', '#111111'], b = k / 4;
          for (var i = 0; i < 8; i++) { g.fillStyle = cols[i % 4]; g.fillRect(i * b * 0 + 0, i * b, w, b); g.fillRect(0, h - (i + 1) * b, w, b); g.fillRect(i * b, i * b, b, h - i * b * 2); g.fillRect(w - (i + 1) * b, i * b, b, h - i * b * 2); }
        });
        add('x_ogeo', 'Memphis shapes', 'Ornate', '#ff5a8a', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), c = [col, '#ffd23f', '#3bceac', '#0ead69', '#540d6e']; edges(g, w, h, k * 0.9, k * 1.5, function (st, i) { g.fillStyle = c[i % 5]; g.strokeStyle = c[i % 5]; g.lineWidth = k * 0.14; var t = i % 4; if (t === 0) circ(g, 0, 0, k * 0.4, true); else if (t === 1) { g.beginPath(); g.moveTo(-k * 0.4, k * 0.35); g.lineTo(0, -k * 0.4); g.lineTo(k * 0.4, k * 0.35); g.closePath(); g.fill(); } else if (t === 2) { g.fillRect(-k * 0.35, -k * 0.35, k * 0.7, k * 0.7); } else { g.beginPath(); g.moveTo(-k * 0.45, 0); g.quadraticCurveTo(-k * 0.2, -k * 0.5, 0, 0); g.quadraticCurveTo(k * 0.2, k * 0.5, k * 0.45, 0); g.stroke(); } });
        });
        add('x_ostars', 'Star sprinkle', 'Ornate', '#ffd84d', 0.05, function (g, w, h, m, col) {
          var k = K(w, h, m), r = 21; function rnd() { r = (r * 16807) % 2147483647; return r / 2147483647; } g.fillStyle = col; for (var i = 0; i < 70; i++) { var x = rnd() * w, y = rnd() * h, e = Math.min(x, w - x, y, h - y); if (e > k * 2.6) continue; star(g, x, y, k * (0.15 + rnd() * 0.4), k * 0.08, 4, 0); g.fill(); }
        });
        add('x_obaroque', 'Baroque gold', 'Ornate', '#c9a227', 0.07, function (g, w, h, m, col) {
          var k = K(w, h, m), dk = mix(col, '#3b2a00', 0.5); g.fillStyle = col; g.beginPath(); g.rect(0, 0, w, h); g.rect(k * 1.5, k * 1.5, w - k * 3, h - k * 3); g.fill('evenodd'); lw(g, k * 0.08, dk); rule(g, k * 0.25, k * 0.25, w - k * 0.5, h - k * 0.5); rule(g, k * 1.2, k * 1.2, w - k * 2.4, h - k * 2.4);
          edges(g, w, h, k * 0.75, k * 1.3, function () { g.fillStyle = dk; g.beginPath(); g.ellipse(0, 0, k * 0.35, k * 0.18, 0, 0, TAU); g.fill(); });
          corners(g, w, h, k * 0.75, function () { g.fillStyle = dk; star(g, 0, 0, k * 0.65, k * 0.28, 8, 0); g.fill(); });
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

    // ----- lens flare & light (apply-small-additions.js) -----
    // A soft glow added to the picture at a position that moves with time. Coordinates are fractions of the frame, so the same text works for the
    // brightness plane and the (smaller) colour planes of geq.
    function glow(cx, cy, r, k, asp) {
      var dx = '((X/W-(' + cx + '))*' + n(asp) + ')', dy = '(Y/H-(' + cy + '))';
      return n(k) + '*exp(-(' + dx + '*' + dx + '+' + dy + '*' + dy + ')/' + n(r * r) + ')';
    }
    function sweep(T, from, to) { return n(from) + '+(' + n(to - from) + ')*clip((T-' + n(T.a) + ')/' + n(Math.max(0.1, T.b - T.a)) + ',0,1)'; }
    function lightGeq(l, cbv, crv) { return "geq=lum='lum(X,Y)+" + l + "':cb='cb(X,Y)-" + cbv + "':cr='cr(X,Y)+" + crv + "'"; }
    def('flare', 'light', 'Lens flare', { dur: 2500, ff: function (s, T) {
      var asp = T.w / T.h, k = 0.4 + 0.6 * s, cx = sweep(T, 0.15, 0.85), cx2 = '1-(' + cx + ')', r = 0.16 + 0.2 * s;
      return lightGeq(glow(cx, '0.3', r, 150 * k, asp) + '+' + glow(cx2, '0.7', r * 0.5, 60 * k, asp), glow(cx, '0.3', r, 18 * k, asp), glow(cx, '0.3', r, 14 * k, asp));
    }, pv: function (s, u, d) {
      var a = n(0.45 + 0.5 * s), x = Math.round(15 + 70 * c01(u / Math.max(0.1, d)));
      return { tint: tint('radial-gradient(circle at ' + x + '% 30%, rgba(255,246,215,' + a + ') 0%, rgba(255,190,90,' + n(a * 0.45) + ') 16%, rgba(255,150,60,0) 42%), radial-gradient(circle at ' + (100 - x) + '% 70%, rgba(255,210,150,' + n(a * 0.4) + ') 0%, rgba(255,210,150,0) 14%)', 'screen') };
    } });
    def('leak', 'light', 'Light leak', { dur: 2500, ff: function (s, T) {
      var asp = T.w / T.h, k = 0.4 + 0.6 * s, cx = sweep(T, -0.1, 0.45), r = 0.3 + 0.2 * s;
      return lightGeq(glow(cx, '0.5', r, 110 * k, asp), glow(cx, '0.5', r, 30 * k, asp), glow(cx, '0.5', r, 40 * k, asp));
    }, pv: function (s, u, d) {
      var a = n(0.35 + 0.5 * s), p = Math.round(20 + 40 * c01(u / Math.max(0.1, d)));
      return { tint: tint('linear-gradient(100deg, rgba(255,110,60,' + a + ') 0%, rgba(255,190,80,' + n(a * 0.5) + ') ' + p + '%, rgba(255,90,140,0) ' + (p + 35) + '%)', 'screen') };
    } });
    def('burn', 'light', 'Film burn', { dur: 1500, ff: function (s) {
      return wash('orange', 0.08 + 0.25 * s) + ",eq=brightness='" + n(0.1 + 0.3 * s) + "*pow(max(0,sin(t*3.2)),4)':eval=frame";
    }, pv: function (s, u) {
      return { tint: tint('rgba(255,140,40,' + n(0.08 + 0.25 * s) + ')', 'screen'), fl: 'brightness(' + n(1 + (0.1 + 0.3 * s) * Math.pow(Math.max(0, Math.sin(u * 3.2)), 4)) + ')' };
    } });
    def('streak', 'light', 'Light streak', { dur: 2500, ff: function (s) {
      var k = 0.4 + 0.6 * s, cy = '0.5+0.08*sin(T*1.5)', band = 'exp(-((Y/H-(' + cy + '))*(Y/H-(' + cy + ')))/' + n(0.0004) + ')';
      return "geq=lum='lum(X,Y)+" + n(60 * k) + '*' + band + "':cb='cb(X,Y)-" + n(20 * k) + '*' + band + "':cr='cr(X,Y)'";
    }, pv: function (s) {
      return { tint: tint('linear-gradient(0deg, rgba(120,170,255,0) 42%, rgba(150,190,255,' + n(0.35 + 0.45 * s) + ') 50%, rgba(120,170,255,0) 58%)', 'screen') };
    } });

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
