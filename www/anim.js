'use strict';
/* Naki animation: keyframes and overlay geometry. Pure helpers shared by the project model, the editor preview and both export engines,
   so all of them agree on where an overlay is, and how big, at every moment.
   A keyframe list is [[ms since the clip started, value], ...] in time order. Between two keyframes the value changes in a straight line;
   before the first and after the last it stays put. */
var NakiAnim = (function () {
  var OVERLAY = { x: 0.75, y: 0.25, size: 0.35, rot: 0, opacity: 1 };   // centre (fraction of the frame), width (fraction of the frame width), degrees, 0 to 1
  var PICTURE = { zoom: 1, x: 0, y: 0 };
  var RANGE = { overlay: { x: [0, 1], y: [0, 1], size: [0.05, 1.5], rot: [-180, 180], opacity: [0, 1] }, picture: { zoom: [1, 4], x: [-1, 1], y: [-1, 1] } };

  // ---------- easing: how a value travels from one keyframe to the next ----------
  // A keyframe can carry a third item that says how the value moves from IT to the NEXT keyframe: nothing = in a straight line; 'hold' = it stays
  // until the next keyframe and then jumps; or four numbers [x1, y1, x2, y2], the two handles of a bezier curve, like CSS cubic-bezier(): x is time and y
  // is how far along the move it is (both from 0 to 1, so a value never overshoots).
  var EASES = [{ key: 'linear', label: 'Linear', v: null }, { key: 'in', label: 'Ease in', v: [0.42, 0, 1, 1] }, { key: 'out', label: 'Ease out', v: [0, 0, 0.58, 1] },
    { key: 'inout', label: 'Ease in-out', v: [0.42, 0, 0.58, 1] }, { key: 'hold', label: 'Hold', v: 'hold' }];
  function c01(x) { x = +x; return isNaN(x) ? 0 : Math.max(0, Math.min(1, x)); }
  function q3(x) { return Math.round(x * 1000) / 1000; }
  // Whatever was given (a name, four numbers, nothing) as what is stored: null (a straight line), 'hold', or four numbers.
  function cleanEase(e) {
    if (e == null || e === 'linear') return null;
    if (e === 'hold') return 'hold';
    if (typeof e === 'string') { var pr = EASES.filter(function (k) { return k.key === e; })[0]; return pr && pr.v ? (pr.v === 'hold' ? 'hold' : pr.v.slice()) : null; }
    if (e.length === 4) {
      var a = [q3(c01(e[0])), q3(c01(e[1])), q3(c01(e[2])), q3(c01(e[3]))];
      return a[0] === a[1] && a[2] === a[3] ? null : a;   // handles on the diagonal are a straight line
    }
    return null;
  }
  // The four handle numbers of any ease (a straight line gets handles a third of the way along, so there is something to hold and drag).
  function bezierOf(e) { var c = cleanEase(e); return c && c !== 'hold' ? c : [0.333, 0.333, 0.667, 0.667]; }
  function easeName(e) {
    var c = cleanEase(e);
    if (c === null) return 'linear'; if (c === 'hold') return 'hold';
    for (var i = 0; i < EASES.length; i++) if (EASES[i].v && EASES[i].v !== 'hold' && EASES[i].v.join() === c.join()) return EASES[i].key;
    return 'custom';
  }
  function bezPt(e, t) {
    var u = 1 - t, a = 3 * u * u * t, b = 3 * u * t * t, c = t * t * t;
    return [a * e[0] + b * e[2] + c, a * e[1] + b * e[3] + c];
  }
  // How far along the move it is (0 to 1) when f (0 to 1) of the time has passed.
  function easeProgress(e, f) {
    f = Math.max(0, Math.min(1, f));
    if (typeof e === 'string' && e !== 'hold') e = cleanEase(e);   // a name (such as 'in') works too
    if (e == null) return f;
    if (e === 'hold') return f >= 1 ? 1 : 0;
    var lo = 0, hi = 1, t = f;
    for (var i = 0; i < 26; i++) { t = (lo + hi) / 2; if (bezPt(e, t)[0] < f) lo = t; else hi = t; }
    return bezPt(e, t)[1];
  }
  // The ease for the part of a move from f0 to f1 (fractions of the whole time), so a move cut in pieces still looks the same.
  function subEase(e, f0, f1) {
    var c = cleanEase(e); if (c === null || c === 'hold') return c;
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
  function bakeKf(kf) {
    if (!kf) return kf;
    var out = {};
    Object.keys(kf).forEach(function (k) {
      var pts = kf[k], arr = [];
      pts.forEach(function (p, i) {
        arr.push([p[0], p[1]]);
        var nx = pts[i + 1]; if (!nx || p[2] == null) return;
        var w = nx[0] - p[0];
        if (p[2] === 'hold') { if (w > 2) arr.push([nx[0] - 1, p[1]]); return; }
        for (var j = 1; j < 12; j++) { var f = j / 12; arr.push([Math.round(p[0] + w * f), Math.round((p[1] + (nx[1] - p[1]) * easeProgress(p[2], f)) * 1000) / 1000]); }
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
    if (pts && pts.length) return kfValue(pts, relMs);
    if (kind === 'overlay') return c[prop] != null ? c[prop] : OVERLAY[prop];
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
    ['zoom', 'x', 'y'].forEach(function (k) { if (kf && kf[k] && kf[k].length) o[k] = kfValue(kf[k], relMs); });
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
    var e = f(P[P.length - 1][1]);
    for (var i = P.length - 1; i > 0; i--) {
      var a = P[i - 1], b = P[i];
      var seg = b[0] === a[0] ? f(b[1]) : f(a[1]) + '+(' + f(b[1] - a[1]) + ')*(' + tv + '-(' + f(a[0]) + '))/' + f(b[0] - a[0]);
      e = 'if(lt(' + tv + ',' + f(b[0]) + '),' + seg + ',' + e + ')';
    }
    return 'if(lt(' + tv + ',' + f(P[0][0]) + '),' + f(P[0][1]) + ',' + e + ')';
  }
  var api = { OVERLAY: OVERLAY, PICTURE: PICTURE, RANGE: RANGE, kfValue: kfValue, valueOf: valueOf, overlayState: overlayState, pictureTransform: pictureTransform,
    spanAt: spanAt, overlayRect: overlayRect, shiftKf: shiftKf, kfExpr: kfExpr,
    EASES: EASES, cleanEase: cleanEase, bezierOf: bezierOf, easeName: easeName, easeProgress: easeProgress, subEase: subEase, sliceKf: sliceKf, insertKf: insertKf, bakeKf: bakeKf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiAnim = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['anim.js'] = 'ease'; }
  return api;
})();
