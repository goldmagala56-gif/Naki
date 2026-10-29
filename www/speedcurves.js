'use strict';
/* Naki speed curves: speed ramps like "hero time" (normal, slow in the middle, normal) or "jump" (normal, fast, normal).
   The editor changes speed one clip at a time, so a curve is turned into a few pieces that each have ONE speed: the clip is cut into equal
   slices of the movie, and each slice gets the curve's speed at its middle. Pure maths, no browser needed, so it is tested.
   A curve is a list of [u, speed] points, u = 0 at the start of the clip and 1 at the end, speed = 1 is normal. The speed glides smoothly between points.
   plan(curve, srcMs, o) -> { pieces: [{ fromMs, toMs, speed, outMs }], outMs, cuts }
     srcMs = how long the clip is at normal speed; fromMs / toMs = the piece's place inside the clip at normal speed (also where to cut it);
     outMs = how long the piece lasts after its speed is applied; cuts = the places to cut the clip (every piece edge except the ends).
   o (optional): slices (how many pieces at most, default 8), minPieceMs (shortest piece before speed, default 300). */
var NakiSpeedCurves = (function () {
  var MIN = 0.25, MAX = 4;
  var LIST = [
    { key: 'hero', label: 'Hero time', pts: [[0, 1], [0.3, 0.3], [0.7, 0.3], [1, 1]] },
    { key: 'bullet', label: 'Bullet time', pts: [[0, 1], [0.4, 0.25], [0.6, 0.25], [1, 1]] },
    { key: 'montage', label: 'Montage', pts: [[0, 2], [0.35, 0.5], [0.65, 0.5], [1, 2]] },
    { key: 'jump', label: 'Jump', pts: [[0, 1], [0.35, 3], [0.65, 3], [1, 1]] },
    { key: 'flashin', label: 'Flash in', pts: [[0, 0.3], [0.5, 3], [1, 1]] },
    { key: 'flashout', label: 'Flash out', pts: [[0, 1], [0.5, 3], [1, 0.3]] }
  ];
  function find(key) { for (var i = 0; i < LIST.length; i++) if (LIST[i].key === key) return LIST[i]; return null; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function snap(v) { return clamp(Math.round(v * 20) / 20, MIN, MAX); }   // steps of 0.05, within what the editor allows

  // the curve's speed at u (0 to 1), gliding smoothly between its points
  function speedAt(pts, u) {
    u = clamp(u, 0, 1);
    if (!pts || !pts.length) return 1;
    if (u <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) if (u <= pts[i][0]) {
      var a = pts[i - 1], b = pts[i], t = b[0] === a[0] ? 1 : (u - a[0]) / (b[0] - a[0]), s = t * t * (3 - 2 * t);
      return a[1] + (b[1] - a[1]) * s;
    }
    return pts[pts.length - 1][1];
  }

  function plan(curve, srcMs, o) {
    o = o || {};
    var pts = typeof curve === 'string' ? (find(curve) || {}).pts : curve;
    if (!pts || !pts.length || !(srcMs > 0)) return null;
    var minPiece = o.minPieceMs == null ? 300 : o.minPieceMs, maxSlices = o.slices == null ? 8 : o.slices;
    var n = clamp(Math.floor(srcMs / minPiece), 1, Math.max(1, maxSlices)), pieces = [], i;
    for (i = 0; i < n; i++) {
      var from = Math.round(srcMs * i / n), to = Math.round(srcMs * (i + 1) / n), sp = snap(speedAt(pts, (i + 0.5) / n));
      if (pieces.length && pieces[pieces.length - 1].speed === sp) pieces[pieces.length - 1].toMs = to;   // neighbours with the same speed are one piece
      else pieces.push({ fromMs: from, toMs: to, speed: sp });
    }
    var out = 0;
    pieces.forEach(function (p) { p.outMs = Math.round((p.toMs - p.fromMs) / p.speed); out += p.outMs; });
    return { pieces: pieces, outMs: out, cuts: pieces.slice(0, -1).map(function (p) { return p.toMs; }) };
  }

  // Applies a curve to one picture clip of a project. P is the project module (project.js), so this stays testable.
  // The clip is first brought to normal speed, then cut into the pieces of plan() (only the picture and the sound linked to it are cut, never your voice,
  // music or titles), and each piece gets its speed. Returns { project, parts, srcMs, outMs }, or null when the clip is not a playing picture clip.
  function applyToProject(P, p, id, curve, o) {
    var f = P.findClip(p, id);
    if (!f || f.track.kind !== 'video' || f.clip.type !== 'video') return null;
    var q = p;
    if ((f.clip.speed || 1) !== 1) { q = P.setClipSpeed(q, id, 1); f = P.findClip(q, id); if (!f) return null; }
    var start = f.clip.start, dur = f.clip.dur, pl = plan(curve, dur, o);
    if (!pl) return null;
    var keep = {}, was = {}, r = JSON.parse(JSON.stringify(q));
    keep[P.findClip(r, id).track.id] = 1;
    P.linkedClips(r, id).forEach(function (x) { var g = P.findClip(r, x.clip.id); if (g) keep[g.track.id] = 1; });
    r.tracks.forEach(function (tr) { was[tr.id] = !!tr.locked; if (!keep[tr.id]) tr.locked = true; });   // a locked row is left alone by a cut
    pl.cuts.forEach(function (off) { r = P.splitAt(r, start + off); });
    r.tracks.forEach(function (tr) { tr.locked = was[tr.id]; });
    var row = P.findClip(r, id).track.clips.filter(function (c) { return c.start >= start - 1 && c.start + c.dur <= start + dur + 1; })
      .sort(function (a, b) { return a.start - b.start; });
    if (row.length !== pl.pieces.length) return null;
    row.forEach(function (c, i) { r = P.setClipSpeed(r, c.id, pl.pieces[i].speed); });
    return { project: r, parts: pl.pieces.length, srcMs: dur, outMs: pl.outMs };
  }

  var api = { LIST: LIST, MIN: MIN, MAX: MAX, find: find, speedAt: speedAt, plan: plan, applyToProject: applyToProject };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiSpeedCurves = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['speedcurves.js'] = 'tools'; }
  return api;
})();