'use strict';
/* Naki animation: keyframes and overlay geometry. Pure helpers shared by the project model, the editor preview and both export engines,
   so all of them agree on where an overlay is, and how big, at every moment.
   A keyframe list is [[ms since the clip started, value], ...] in time order. Between two keyframes the value changes in a straight line;
   before the first and after the last it stays put. */
var NakiAnim = (function () {
  var OVERLAY = { x: 0.75, y: 0.25, size: 0.35, rot: 0, opacity: 1 };   // centre (fraction of the frame), width (fraction of the frame width), degrees, 0 to 1
  var PICTURE = { zoom: 1, x: 0, y: 0 };
  var RANGE = { overlay: { x: [0, 1], y: [0, 1], size: [0.05, 1.5], rot: [-180, 180], opacity: [0, 1] }, picture: { zoom: [1, 4], x: [-1, 1], y: [-1, 1] }, audio: { volume: [0, 2] }, sticker: { x: [0, 1], y: [0, 1] }, text: { x: [-1, 1], y: [-1, 1] } };

  // ---------- easing: how a value travels from one keyframe to the next ----------
  // A keyframe can carry a third item that says how the value moves from IT to the NEXT keyframe: nothing = in a straight line; 'hold' = it stays
  // until the next keyframe and then jumps; or four numbers [x1, y1, x2, y2], the two handles of a bezier curve, like CSS cubic-bezier(): x is time and y
  // is how far along the move it is (both from 0 to 1, so a value never overshoots).
  var EASES = [];
  function addE(group, key, label, v, fn) { EASES.push({ key: key, label: label, v: v, group: group, fn: !!fn }); }
  addE('Basic', 'linear', 'Linear', null); addE('Basic', 'in', 'Ease in', [0.42, 0, 1, 1]); addE('Basic', 'out', 'Ease out', [0, 0, 0.58, 1]);
  addE('Basic', 'inout', 'Ease in-out', [0.42, 0, 0.58, 1]); addE('Basic', 'hold', 'Hold', 'hold');
  [['sine', 'Sine', [0.12, 0, 0.39, 0], [0.61, 1, 0.88, 1], [0.37, 0, 0.63, 1]], ['quad', 'Quad', [0.11, 0, 0.5, 0], [0.5, 1, 0.89, 1], [0.45, 0, 0.55, 1]],
    ['cubic', 'Cubic', [0.32, 0, 0.67, 0], [0.33, 1, 0.68, 1], [0.65, 0, 0.35, 1]], ['quart', 'Quart', [0.5, 0, 0.75, 0], [0.25, 1, 0.5, 1], [0.76, 0, 0.24, 1]],
    ['expo', 'Expo', [0.7, 0, 0.84, 0], [0.16, 1, 0.3, 1], [0.87, 0, 0.13, 1]], ['circ', 'Circ', [0.55, 0, 1, 0.45], [0, 0.55, 0.45, 1], [0.85, 0, 0.15, 1]],
    ['back', 'Back', [0.36, 0, 0.66, -0.56], [0.34, 1.56, 0.64, 1], [0.68, -0.6, 0.32, 1.6]]].forEach(function (r) {
    addE(r[1], r[0] + 'In', 'In', r[2]); addE(r[1], r[0] + 'Out', 'Out', r[3]); addE(r[1], r[0] + 'InOut', 'In-out', r[4]);
  });
  ['bounce', 'elastic'].forEach(function (k) { var g = k === 'bounce' ? 'Bounce' : 'Elastic'; addE(g, k + 'In', 'In', null, true); addE(g, k + 'Out', 'Out', null, true); addE(g, k + 'InOut', 'In-out', null, true); });
  var EASE_GROUPS = ['Basic', 'Sine', 'Quad', 'Cubic', 'Quart', 'Expo', 'Circ', 'Back', 'Bounce', 'Elastic'];
  var YMIN = -0.6, YMAX = 1.6;   // a handle may go past the 0..1 square up or down, which is what makes a move overshoot
  // Bounce and elastic are not one bezier, so they are stored by name and worked out by these formulas (the preview and the export use the same ones).
  var FN = {
    bounceOut: function (x) { var n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) { x -= 1.5 / d; return n * x * x + 0.75; } if (x < 2.5 / d) { x -= 2.25 / d; return n * x * x + 0.9375; } x -= 2.625 / d; return n * x * x + 0.984375; },
    bounceIn: function (x) { return 1 - FN.bounceOut(1 - x); },
    bounceInOut: function (x) { return x < 0.5 ? (1 - FN.bounceOut(1 - 2 * x)) / 2 : (1 + FN.bounceOut(2 * x - 1)) / 2; },
    elasticOut: function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1; },
    elasticIn: function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * (2 * Math.PI / 3)); },
    elasticInOut: function (x) { var c = 2 * Math.PI / 4.5; return x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * c)) / 2 : Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * c) / 2 + 1; }
  };
  function c01(x) { x = +x; return isNaN(x) ? 0 : Math.max(0, Math.min(1, x)); }
  function cy(x) { x = +x; return isNaN(x) ? 0 : Math.max(YMIN, Math.min(YMAX, x)); }
  function q3(x) { return Math.round(x * 1000) / 1000; }
  // A value that overshoots is kept inside what the property can hold (opacity 0..1, size, zoom, turn, volume). Positions may overshoot, which is the pop.
  function fitVal(kind, prop, v) {
    if ((prop === 'x' || prop === 'y') && kind !== 'picture') return v;
    var r = kind && RANGE[kind] && RANGE[kind][prop];
    return r ? Math.max(r[0], Math.min(r[1], v)) : v;
  }
  // Whatever was given (a name, four numbers, nothing) as what is stored: null (a straight line), 'hold', a name (bounce / elastic), or four numbers.
  function cleanEase(e) {
    if (e == null || e === 'linear') return null;
    if (e === 'hold') return 'hold';
    if (typeof e === 'string') {
      if (FN[e]) return e;
      var pr = EASES.filter(function (k) { return k.key === e; })[0];
      return pr && pr.v ? (pr.v === 'hold' ? 'hold' : pr.v.slice()) : null;
    }
    if (e.length === 4) {
      var a = [q3(c01(e[0])), q3(cy(e[1])), q3(c01(e[2])), q3(cy(e[3]))];
      return a[0] === a[1] && a[2] === a[3] ? null : a;   // handles on the diagonal are a straight line
    }
    return null;
  }
  function bezierOf(e) { var c = cleanEase(e); return c && typeof c !== 'string' ? c : [0.333, 0.333, 0.667, 0.667]; }
  function easeName(e) {
    var c = cleanEase(e);
    if (c === null) return 'linear'; if (c === 'hold') return 'hold'; if (typeof c === 'string') return c;
    for (var i = 0; i < EASES.length; i++) if (EASES[i].v && EASES[i].v !== 'hold' && EASES[i].v.join() === c.join()) return EASES[i].key;
    return 'custom';
  }
  function bezPt(e, t) {
    var u = 1 - t, a = 3 * u * u * t, b = 3 * u * t * t, c = t * t * t;
    return [a * e[0] + b * e[2] + c, a * e[1] + b * e[3] + c];
  }
  // How far along the move it is when f (0 to 1) of the time has passed. Mostly 0 to 1, but a Back / bounce / elastic curve goes past it.
  function easeProgress(e, f) {
    f = Math.max(0, Math.min(1, f));
    if (typeof e === 'string' && e !== 'hold') { if (FN[e]) return FN[e](f); e = cleanEase(e); if (typeof e === 'string' && e !== 'hold') return FN[e](f); }
    if (e == null) return f;
    if (e === 'hold') return f >= 1 ? 1 : 0;
    var lo = 0, hi = 1, t = f;
    for (var i = 0; i < 26; i++) { t = (lo + hi) / 2; if (bezPt(e, t)[0] < f) lo = t; else hi = t; }
    return bezPt(e, t)[1];
  }
  // The ease for the part of a move from f0 to f1 (fractions of the whole time), so a move cut in pieces still looks the same.
  function subEase(e, f0, f1) {
    var c = cleanEase(e); if (c === null || c === 'hold') return c;
    if (typeof c === 'string') return (f0 < 1e-6 && f1 > 1 - 1e-6) ? c : 'out';   // a bounce cannot be cut into a smaller bezier: a piece falls back to Ease out
    function split(b, f) {   // one bezier cut at time f: [first part, second part], each stretched to fill the 0..1 square again
      var lo = 0, hi = 1, t = f, i;
      for (i = 0; i < 26; i++) { t = (lo + hi) / 2; if (bezPt(b, t)[0] < f) lo = t; else hi = t; }
      var P1 = [b[0], b[1]], P2 = [b[2], b[3]], P0 = [0, 0], P3 = [1, 1], L = function (p, q) { return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
      var Q0 = L(P0, P1), Q1 = L(P1, P2), Q2 = L(P2, P3), R0 = L(Q0, Q1), R1 = L(Q1, Q2), S = L(R0, R1), fy = S[1];
      var left = (f > 1e-6 && fy > 1e-6) ? [Q0[0] / f, Q0[1] / fy, R0[0] / f, R0[1] / fy] : null;
      var right = (1 - f > 1e-6 && 1 - fy > 1e-6) ? [(R1[0] - f) / (1 - f), (R1[1] - fy) / (1 - fy), (Q2[0] - f) / (1 - f), (Q2[1] - fy) / (1 - fy)] : null;
      return [left, right];
    }
    var cur = c;
    if (f0 > 1e-6) { var r = split(cur, f0)[1]; if (!r) return null; cur = cleanEase(r) || [0.333, 0.333, 0.667, 0.667]; }
    var span = (f1 - f0) / (1 - f0);
    if (span < 1 - 1e-6) { var l = split(cur, span)[0]; if (!l) return null; cur = l; }
    return cleanEase(cur);
  }
  function segmentOf(pts, t) { for (var i = 0; i + 1 < pts.length; i++) if (pts[i][0] <= t && t < pts[i + 1][0]) return i; return -1; }
  // The keyframes of a piece cut out of a clip: [from, to) in the clip's own time, moved so the piece starts at 0 and moves exactly as before.
  function sliceKf(pts, from, to) {
    var times = [from], out = [];
    pts.forEach(function (p) { if (p[0] > from && p[0] < to) times.push(p[0]); });
    times.push(to);
    for (var j = 0; j < times.length; j++) {
      var t = times[j], pt = [t - from, Math.round(kfValue(pts, t) * 1000) / 1000];
      if (j < times.length - 1) {
        var s = segmentOf(pts, t);
        if (s >= 0 && pts[s][2] != null) { var a = pts[s], w = pts[s + 1][0] - a[0], e = subEase(a[2], (t - a[0]) / w, (times[j + 1] - a[0]) / w); if (e) pt.push(e); }
      }
      out.push(pt);
    }
    return out;
  }
  // Adds a keyframe at t inside the list (in place). If it lands in the middle of an eased move, the move is cut in two so it still looks the same.
  function insertKf(pts, t, v) {
    var s = segmentOf(pts, t), np = [t, v];
    if (s >= 0 && pts[s][2] != null && t > pts[s][0]) {
      var a = pts[s], f = (t - a[0]) / (pts[s + 1][0] - a[0]), l = subEase(a[2], 0, f), r = subEase(a[2], f, 1);
      if (l) a[2] = l; else a.length = 2;
      if (r) np.push(r);
    }
    pts.push(np); pts.sort(function (x, y) { return x[0] - y[0]; });
    return pts;
  }
  // The keyframes the way the export reads them: every eased move becomes a few straight pieces (the engines only draw straight lines between
  // keyframes), a hold becomes a jump. Plain keyframes come back as they are, without the third item.
  function bakeKf(kf, kind) {
    if (!kf) return kf;
    var out = {};
    Object.keys(kf).forEach(function (k) {
      var pts = kf[k], arr = [];
      pts.forEach(function (p, i) {
        arr.push([p[0], p[1]]);
        var nx = pts[i + 1]; if (!nx || p[2] == null) return;
        var w = nx[0] - p[0];
        if (p[2] === 'hold') { if (w > 2) arr.push([nx[0] - 1, p[1]]); return; }
        var NS = (typeof p[2] === 'string') ? Math.min(32, Math.max(2, Math.floor(w / 16))) : 12; for (var j = 1; j < NS; j++) { var f = j / NS; arr.push([Math.round(p[0] + w * f), Math.round(fitVal(kind, k, p[1] + (nx[1] - p[1]) * easeProgress(p[2], f)) * 1000) / 1000]); }
      });
      out[k] = arr;
    });
    return out;
  }

  function kfValue(points, rel) {
    if (!points || !points.length) return null;
    if (rel <= points[0][0]) return points[0][1];
    for (var i = 1; i < points.length; i++) {
      if (rel <= points[i][0]) {
        var a = points[i - 1], b = points[i];
        return b[0] === a[0] ? b[1] : a[1] + (b[1] - a[1]) * easeProgress(a[2], (rel - a[0]) / (b[0] - a[0]));
      }
    }
    return points[points.length - 1][1];
  }
  // The value of one property of an overlay clip ('overlay') or a picture clip's zoom / pan ('picture') at relMs since the clip started.
  function valueOf(c, kind, prop, relMs) {
    var pts = c.kf && c.kf[prop];
    if (pts && pts.length) return fitVal(kind, prop, kfValue(pts, relMs));
    if (kind === 'audio') return c.volume != null ? c.volume : 1;
    if (kind === 'overlay') return c[prop] != null ? c[prop] : OVERLAY[prop];
    if (kind === 'sticker') return c[prop] != null ? c[prop] : 0.5;
    if (kind === 'text') return c[prop === 'x' ? 'dx' : 'dy'] || 0;   // a text moves by an offset from its usual place
    return c.transform && c.transform[prop] != null ? c.transform[prop] : PICTURE[prop];
  }
  function overlayState(o, relMs) {
    var s = {};
    ['x', 'y', 'size', 'rot', 'opacity'].forEach(function (k) { s[k] = valueOf(o, 'overlay', k, relMs); });
    return s;
  }
  // The picture clip's transform { zoom, x, y, rot, flipH } at relMs, with its zoom / pan keyframes applied.
  function pictureTransform(t, kf, relMs) {
    var o = Object.assign({ zoom: 1, x: 0, y: 0, rot: 0, flipH: false }, t || {});
    ['zoom', 'x', 'y'].forEach(function (k) { if (kf && kf[k] && kf[k].length) o[k] = fitVal('picture', k, kfValue(kf[k], relMs)); });
    return o;
  }
  // The span of an export plan with its keyframes worked out for one moment (relMs since the span started).
  function spanAt(sp, relMs) { return sp.kf ? Object.assign({}, sp, { transform: pictureTransform(sp.transform, sp.kf, relMs) }) : sp; }
  // Where an overlay is in a W x H frame: centre and size in pixels, turn in degrees, opacity. aspect = picture height / width.
  function overlayRect(o, s, W, H) {
    var aspect = o.w > 0 && o.h > 0 ? o.h / o.w : 9 / 16, w = Math.max(2, s.size * W);
    return { cx: s.x * W, cy: s.y * H, w: w, h: w * aspect, rot: s.rot, opacity: s.opacity };
  }
  // All keyframe times move earlier by deltaMs (negative: later).
  function shiftKf(kf, deltaMs) {
    if (!kf) return kf;
    var out = {}; Object.keys(kf).forEach(function (k) { out[k] = kf[k].map(function (p) { return p.length > 2 ? [p[0] - deltaMs, p[1], p[2]] : [p[0] - deltaMs, p[1]]; }); });
    return out;
  }
  // An ffmpeg expression for a keyframe list. tv is the name of the time variable in seconds ('t', or 'T' inside geq). shiftMs is added to every
  // keyframe time; mul converts the keyframe clock to the clock the filter sees (the speed of the picture).
  function kfExpr(points, shiftMs, mul, tv) {
  tv = tv || 't'; mul = mul || 1;
  var P = points.map(function (p) { return [(p[0] + (shiftMs || 0)) * mul / 1000, p[1]]; });
  function f(n) { return String(Math.round(n * 10000) / 10000); }
  function seg(a, b) { return b[0] === a[0] ? f(b[1]) : f(a[1]) + '+(' + f(b[1] - a[1]) + ')*(' + tv + '-(' + f(a[0]) + '))/' + f(b[0] - a[0]); }
  if (P.length > 8) {   // many keyframes (tracking): a balanced tree, so the nesting is log2(n) deep instead of n
    var build = function (lo, hi) {
      if (lo === hi) return seg(P[lo - 1], P[lo]);
      var mid = (lo + hi) >> 1;
      return 'if(lt(' + tv + ',' + f(P[mid][0]) + '),' + build(lo, mid) + ',' + build(mid + 1, hi) + ')';
    };
    var last = P.length - 1;
    return 'if(lt(' + tv + ',' + f(P[0][0]) + '),' + f(P[0][1]) + ',if(gte(' + tv + ',' + f(P[last][0]) + '),' + f(P[last][1]) + ',' + build(1, last) + '))';
  }
  var e = f(P[P.length - 1][1]);
  for (var i = P.length - 1; i > 0; i--) e = 'if(lt(' + tv + ',' + f(P[i][0]) + '),' + seg(P[i - 1], P[i]) + ',' + e + ')';
  return 'if(lt(' + tv + ',' + f(P[0][0]) + '),' + f(P[0][1]) + ',' + e + ')';
}
  // How far a title is moved from its usual place (fractions of the frame) relMs after it appeared: its x / y keyframes, else its fixed dx / dy.
  function shiftOf(o, relMs) {
    var kf = (o && o.kf) || {};
    return { x: kf.x && kf.x.length ? kfValue(kf.x, relMs) : ((o && o.dx) || 0), y: kf.y && kf.y.length ? kfValue(kf.y, relMs) : ((o && o.dy) || 0) };
  }
  // ---------- motion tracking: follow a patch of the picture from one frame to the next (pure maths) ----------
// A grey picture is { w, h, d } with d holding one number (0 to 255) per pixel. makeTracker(first, cx, cy, tw, th, radius) remembers the tw x th patch around
// (cx, cy). .step(next) finds where that patch went in the next picture, looking within radius pixels of where it was: it tries every place and takes the one
// that differs least (block matching), then refines it to a fraction of a pixel. The remembered patch is refreshed a little each step so it can follow an
// object that slowly changes. lost = the best place was too different to trust, and the tracker then stays where it was.
var LOST_ERR = 40;   // average difference per pixel (out of 255) above which the object is considered lost
function sadAt(tpl, tw, th, img, x0, y0, limit) {
  var W = img.w, d = img.d, s = 0;
  for (var j = 0; j < th; j++) {
    var row = (y0 + j) * W + x0, tr = j * tw;
    for (var i = 0; i < tw; i++) { var v = d[row + i] - tpl[tr + i]; s += v < 0 ? -v : v; }
    if (s >= limit) return s;
  }
  return s;
}
function findBlock(tpl, tw, th, img, cx, cy, radius) {
  var W = img.w, H = img.h; if (tw > W || th > H) return null;
  var r = Math.max(1, Math.round(radius)), cxi = Math.round(cx - tw / 2), cyi = Math.round(cy - th / 2);
  var xa = Math.max(0, cxi - r), xb = Math.min(W - tw, cxi + r), ya = Math.max(0, cyi - r), yb = Math.min(H - th, cyi + r);
  if (xa > xb || ya > yb) return null;
  var best = Infinity, bx = xa, by = ya;
  for (var y = ya; y <= yb; y++) for (var x = xa; x <= xb; x++) { var s = sadAt(tpl, tw, th, img, x, y, best); if (s < best) { best = s; bx = x; by = y; } }
  function part(l, m, rr) { var den = l - 2 * m + rr; return den > 1e-6 ? Math.max(-0.5, Math.min(0.5, (l - rr) / (2 * den))) : 0; }
  var dx = 0, dy = 0;
  if (bx > 0 && bx < W - tw) dx = part(sadAt(tpl, tw, th, img, bx - 1, by, Infinity), best, sadAt(tpl, tw, th, img, bx + 1, by, Infinity));
  if (by > 0 && by < H - th) dy = part(sadAt(tpl, tw, th, img, bx, by - 1, Infinity), best, sadAt(tpl, tw, th, img, bx, by + 1, Infinity));
  return { x: bx + dx + tw / 2, y: by + dy + th / 2, bx: bx, by: by, err: best / (tw * th) };
}
function makeTracker(img, cx, cy, tw, th, radius) {
  var x0 = Math.max(0, Math.min(img.w - tw, Math.round(cx - tw / 2))), y0 = Math.max(0, Math.min(img.h - th, Math.round(cy - th / 2)));
  var tpl = new Float32Array(tw * th), i, j;
  for (j = 0; j < th; j++) for (i = 0; i < tw; i++) tpl[j * tw + i] = img.d[(y0 + j) * img.w + x0 + i];
  var st = { x: x0 + tw / 2, y: y0 + th / 2, lost: false, err: 0 }, start = { x: st.x, y: st.y };
  return {
    start: start,
    step: function (next) {
      if (st.lost) return { x: st.x, y: st.y, err: st.err, lost: true };
      var f = findBlock(tpl, tw, th, next, st.x, st.y, radius);
      if (!f || f.err > LOST_ERR) { st.lost = true; return { x: st.x, y: st.y, err: f ? f.err : 255, lost: true }; }
      st.x = f.x; st.y = f.y; st.err = f.err;
      for (j = 0; j < th; j++) for (i = 0; i < tw; i++) tpl[j * tw + i] += (next.d[(f.by + j) * next.w + f.bx + i] - tpl[j * tw + i]) * 0.1;
      return { x: st.x, y: st.y, err: f.err, lost: false };
    }
  };
}
// A moving average (win values wide); the first and the last value stay as they are.
function smoothSeries(v, win) {
  var h = Math.max(0, Math.floor((win || 3) / 2)), out = [];
  for (var i = 0; i < v.length; i++) {
    if (i === 0 || i === v.length - 1) { out.push(v[i]); continue; }
    var s = 0, n = 0; for (var k = Math.max(0, i - h); k <= Math.min(v.length - 1, i + h); k++) { s += v[k]; n++; }
    out.push(s / n);
  }
  return out;
}
// Fewer keyframes: keeps only the points a straight line between its neighbours would miss by more than tol. pts = [[ms, value], ...].
function simplifyKf(pts, tol) {
  if (pts.length < 3) return pts.slice();
  var keep = [], stack = [[0, pts.length - 1]]; keep[0] = keep[pts.length - 1] = true;
  while (stack.length) {
    var s = stack.pop(), a = pts[s[0]], b = pts[s[1]], worst = -1, wi = -1;
    for (var i = s[0] + 1; i < s[1]; i++) {
      var p = pts[i], f = (p[0] - a[0]) / ((b[0] - a[0]) || 1), e = Math.abs(p[1] - (a[1] + (b[1] - a[1]) * f));
      if (e > worst) { worst = e; wi = i; }
    }
    if (worst > tol && wi > 0) { keep[wi] = true; stack.push([s[0], wi], [wi, s[1]]); }
  }
  return pts.filter(function (_, i) { return keep[i]; });
}
// ---------- gestures: the maths behind dragging, resizing and turning things on the picture ----------
  // Angles are degrees, screen style (y points down, a positive turn goes clockwise, like CSS rotate()).
  function wrapDeg(a) { a = ((+a || 0) % 360 + 360) % 360; return a > 180 ? a - 360 : a; }   // into (-180, 180]
  // The nearest of some target numbers within tol, else the number itself: { v, hit }.
  function snapTo(v, targets, tol) {
    var best = null;
    for (var i = 0; i < targets.length; i++) { var d = Math.abs(v - targets[i]); if (d <= tol && (best === null || d < best.d)) best = { t: targets[i], d: d }; }
    return best ? { v: best.t, hit: true } : { v: v, hit: false };
  }
  var ROT_SNAPS = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
  // A turn that is within tol degrees of a straight or a diagonal position clicks onto it.
  function snapRot(rot, tol) { var s = snapTo(wrapDeg(rot), ROT_SNAPS, tol == null ? 4 : tol); return { rot: wrapDeg(s.v), hit: s.hit }; }
  // Is the point (x, y) inside a box { cx, cy, w, h, rot } (centre, size, turn), with pad extra pixels around it?
  function pointInBox(x, y, b, pad) {
    var a = -(b.rot || 0) * Math.PI / 180, dx = x - b.cx, dy = y - b.cy, c = Math.cos(a), s = Math.sin(a), lx = dx * c - dy * s, ly = dx * s + dy * c;
    pad = pad || 0;
    return Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad;
  }
  // Where the bottom-right corner of a turned box is.
  function handlePos(b) {
    var a = (b.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return { x: b.cx + (b.w / 2) * c - (b.h / 2) * s, y: b.cy + (b.w / 2) * s + (b.h / 2) * c };
  }
  // Dragging a corner handle from p0 to p1 around the box centre: how much bigger (scale) and how far turned (dRot) the thing gets.
  function scaleRotate(center, p0, p1) {
    var ax = p0.x - center.x, ay = p0.y - center.y, bx = p1.x - center.x, by = p1.y - center.y, r0 = Math.sqrt(ax * ax + ay * ay), r1 = Math.sqrt(bx * bx + by * by);
    if (r0 < 4) return { scale: 1, dRot: 0 };
    return { scale: r1 / r0, dRot: wrapDeg((Math.atan2(by, bx) - Math.atan2(ay, ax)) * 180 / Math.PI) };
  }
  // Two fingers that were at a0, b0 and are now at a1, b1: the pinch (scale), the twist (dRot) and how far the middle between them moved (dx, dy).
  function pinch(a0, b0, a1, b1) {
    var d0 = Math.sqrt(Math.pow(b0.x - a0.x, 2) + Math.pow(b0.y - a0.y, 2)), d1 = Math.sqrt(Math.pow(b1.x - a1.x, 2) + Math.pow(b1.y - a1.y, 2));
    var g0 = Math.atan2(b0.y - a0.y, b0.x - a0.x), g1 = Math.atan2(b1.y - a1.y, b1.x - a1.x);
    return { scale: d0 > 4 ? d1 / d0 : 1, dRot: d0 > 4 && d1 > 4 ? wrapDeg((g1 - g0) * 180 / Math.PI) : 0,
      dx: (a1.x + b1.x) / 2 - (a0.x + b0.x) / 2, dy: (a1.y + b1.y) / 2 - (a0.y + b0.y) / 2 };
  }
  // The pan (x, y, each -1 to 1) of a picture clip when its picture is moved dxPx / dyPx pixels from where t0 { zoom, x, y } had it, now at zoom z1,
  // in a W x H frame. Same maths as the preview's CSS (the picture moves by -x * (zoom - 1) / 2 of the frame). At zoom 1 there is nothing to move.
  function panFor(t0, z1, dxPx, dyPx, W, H) {
    if (!(z1 > 1)) return { x: 0, y: 0 };
    var z0 = t0.zoom || 1, sx = -(t0.x || 0) * (z0 - 1) * 0.5 * W + dxPx, sy = -(t0.y || 0) * (z0 - 1) * 0.5 * H + dyPx, k = (z1 - 1) * 0.5;
    function lim(v) { return Math.max(-1, Math.min(1, v)); }
    return { x: lim(-sx / (k * W)), y: lim(-sy / (k * H)) };
  }
  var api = { OVERLAY: OVERLAY, PICTURE: PICTURE, RANGE: RANGE, kfValue: kfValue, valueOf: valueOf, overlayState: overlayState, pictureTransform: pictureTransform,
    spanAt: spanAt, overlayRect: overlayRect, shiftKf: shiftKf, kfExpr: kfExpr,
    EASES: EASES, EASE_GROUPS: EASE_GROUPS, YMIN: YMIN, YMAX: YMAX, cleanEase: cleanEase, bezierOf: bezierOf, easeName: easeName, easeProgress: easeProgress, subEase: subEase, sliceKf: sliceKf, insertKf: insertKf, bakeKf: bakeKf, makeTracker: makeTracker, findBlock: findBlock, smoothSeries: smoothSeries, simplifyKf: simplifyKf, LOST_ERR: LOST_ERR, shiftOf: shiftOf,
    wrapDeg: wrapDeg, snapTo: snapTo, snapRot: snapRot, pointInBox: pointInBox, handlePos: handlePos, scaleRotate: scaleRotate, pinch: pinch, panFor: panFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiAnim = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['anim.js'] = 'gesture'; }
  return api;
})();
