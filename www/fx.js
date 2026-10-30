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

  var api = { voice: VOICE, gen: GEN, BLEND: BLEND, MASKS: MASKS, CHROMA: CHROMA, blendOf: blendOf, cssBlend: cssBlend, ffBlend: ffBlend, ffBlendFormat: ffBlendFormat,
    cleanBlend: cleanBlend, cleanMask: cleanMask, cleanChroma: cleanChroma, hexRgb: hexRgb, keyOf: keyOf, chromaAlpha: chromaAlpha, chromaFilter: chromaFilter,
    maskSd: maskSd, maskAlpha: maskAlpha, maskAlphaExpr: maskAlphaExpr, maskCanvas: maskCanvas, fxInto: fxInto, chromaInto: chromaInto, chromaCanvas: chromaCanvas, drawFx: drawFx };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiFx = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['fx.js'] = 'masks-fx2+shapes'; }
  return api;
})();
