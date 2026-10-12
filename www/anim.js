'use strict';
/* Naki animation: keyframes and overlay geometry. Pure helpers shared by the project model, the editor preview and both export engines,
   so all of them agree on where an overlay is, and how big, at every moment.
   A keyframe list is [[ms since the clip started, value], ...] in time order. Between two keyframes the value changes in a straight line;
   before the first and after the last it stays put. */
var NakiAnim = (function () {
  var OVERLAY = { x: 0.75, y: 0.25, size: 0.35, rot: 0, opacity: 1 };   // centre (fraction of the frame), width (fraction of the frame width), degrees, 0 to 1
  var PICTURE = { zoom: 1, x: 0, y: 0 };
  var RANGE = { overlay: { x: [0, 1], y: [0, 1], size: [0.05, 1.5], rot: [-180, 180], opacity: [0, 1] }, picture: { zoom: [1, 4], x: [-1, 1], y: [-1, 1] } };

  function kfValue(points, rel) {
    if (!points || !points.length) return null;
    if (rel <= points[0][0]) return points[0][1];
    for (var i = 1; i < points.length; i++) {
      if (rel <= points[i][0]) {
        var a = points[i - 1], b = points[i];
        return b[0] === a[0] ? b[1] : a[1] + (b[1] - a[1]) * (rel - a[0]) / (b[0] - a[0]);
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
    var out = {}; Object.keys(kf).forEach(function (k) { out[k] = kf[k].map(function (p) { return [p[0] - deltaMs, p[1]]; }); });
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
    spanAt: spanAt, overlayRect: overlayRect, shiftKf: shiftKf, kfExpr: kfExpr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiAnim = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['anim.js'] = 'overlay-kf'; }
  return api;
})();
