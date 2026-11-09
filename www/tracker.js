'use strict';
/* Naki tracker: follows a small square of the picture through the movie, so an overlay, sticker or text can stick to it.
   Pure parts (createTracker, makeGeo, the maths) have no page code and are tested in tests/tracker.test.js.
   analyze() is the only part that needs a browser: it reads the movie frame by frame on a small hidden canvas.

   How it follows: the first frame gives a small grey template. In every later frame the template is searched for near where it
   was last seen (coarse search every 2nd pixel, then an exact search around the best spot). If the best match is too different the
   spot counts as lost: the position is held, the template is kept, and the search area grows until the spot is found again.

   Coordinates: "movie" fractions (0..1 of the whole movie picture) are what is tracked. "frame" fractions (0..1 of the video frame the
   viewer sees) are what overlays use. makeGeo() converts between them for one picture clip: crop, flip, turn, zoom, pan, the bars around
   the picture, and the shape of the video frame, with the same numbers the preview and both exports use. */
var NakiTracker = (function () {
  var STEP_MS = 33, FRAME_W = 320, MAX_FRAMES = 900;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function r4(x) { return Math.round(x * 10000) / 10000; }
  var PRESET_LIST = [{ key: 'slow', label: 'Slow (people, objects)' }, { key: 'normal', label: 'Normal' }, { key: 'fast', label: 'Fast (cars, sprints)' }];
  var PRESET = { slow: { radius: 0.05, lostAt: 38, adapt: 0.08, passes: 12 }, normal: { radius: 0.09, lostAt: 42, adapt: 0.1, passes: 8 }, fast: { radius: 0.2, lostAt: 52, adapt: 0.15, passes: 4 } };
  function preset(k) { return PRESET[k] || PRESET.normal; }
  function fw(vw, vh) { return Math.max(16, Math.min(vw, FRAME_W, Math.floor(Math.sqrt(70000 * vw / vh)))); }

  function toGray(rgba, n) {
    var g = new Uint8Array(n), i, j = 0;
    for (i = 0; i < n; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    return g;
  }

  // box = { cx, cy, size }: centre as fractions of the picture, size = side as a fraction of the picture height.
function createTracker(g0, W, H, box, opts) {
  opts = opts || {};
  var th = clamp(Math.round(box.size * H), 8, Math.max(8, Math.floor(Math.min(W, H) / 2))), tw = th;
  var x0 = clamp(Math.round(box.cx * W - tw / 2), 0, W - tw), y0 = clamp(Math.round(box.cy * H - th / 2), 0, H - th);
  var tpl = new Float32Array(tw * th), i, j, k, n = tw * th, sum = 0;
  for (j = 0; j < th; j++) for (i = 0; i < tw; i++) tpl[j * tw + i] = g0[(y0 + j) * W + x0 + i];
  for (k = 0; k < n; k++) sum += tpl[k];
  var mean = sum / n, vr = 0;
  for (k = 0; k < n; k++) vr += (tpl[k] - mean) * (tpl[k] - mean);
  var texture = Math.sqrt(vr / n);
  var baseR = opts.radius || Math.max(8, Math.round((opts.radiusFrac || 0.06) * W)), lostAt = opts.lostAt || 38, adapt = opts.adapt || 0.08;
  var miss = 0, lx = x0, ly = y0, vx = 0, vy = 0;

  function sad(g, px, py, stride, cap) {
    var s = 0, a, b;
    for (a = 0; a < th; a += stride) {
      var row = (py + a) * W + px, trow = a * tw;
      for (b = 0; b < tw; b += stride) { var d = g[row + b] - tpl[trow + b]; s += d < 0 ? -d : d; }
      if (s >= cap) return s;
    }
    return s;
  }
  function part(a, b, c) { var d = a - 2 * b + c; return d > 1e-6 ? clamp((a - c) / (2 * d), -0.5, 0.5) : 0; }
  function search(g, r, cx, cy) {
    cx = clamp(cx, 0, W - tw); cy = clamp(cy, 0, H - th);
    var cs = r > 28 ? 4 : 2, best = Infinity, bx = cx, by = cy, x, y, s;
    var xa = Math.max(0, cx - r), xb = Math.min(W - tw, cx + r), ya = Math.max(0, cy - r), yb = Math.min(H - th, cy + r);
    for (y = ya; y <= yb; y += cs) for (x = xa; x <= xb; x += cs) { s = sad(g, x, y, 2, best); if (s < best) { best = s; bx = x; by = y; } }
    best = Infinity;
    for (y = Math.max(0, by - cs); y <= Math.min(H - th, by + cs); y++) for (x = Math.max(0, bx - cs); x <= Math.min(W - tw, bx + cs); x++) {
      s = sad(g, x, y, 1, best); if (s < best) { best = s; bx = x; by = y; }
    }
    var fx = 0, fy = 0;
    if (bx > 0 && bx < W - tw) fx = part(sad(g, bx - 1, by, 1, Infinity), best, sad(g, bx + 1, by, 1, Infinity));
    if (by > 0 && by < H - th) fy = part(sad(g, bx, by - 1, 1, Infinity), best, sad(g, bx, by + 1, 1, Infinity));
    return { x: bx + fx, y: by + fy, bx: bx, by: by, mean: best / n };
  }
  function step(g) {
    var kk = miss + 1, r = Math.min(baseR * 3, Math.round(baseR * (1 + 0.5 * miss)));
    var res = search(g, r, Math.round(lx + vx * kk), Math.round(ly + vy * kk)), lost = res.mean > lostAt;
    if (lost) miss++;
    else {
      vx = 0.5 * vx + 0.5 * (res.x - lx) / kk; vy = 0.5 * vy + 0.5 * (res.y - ly) / kk;
      miss = 0; lx = res.x; ly = res.y;
      if (res.mean < lostAt * 0.5) for (var b = 0; b < th; b++) for (var a = 0; a < tw; a++) { var q = b * tw + a; tpl[q] += (g[(res.by + b) * W + res.bx + a] - tpl[q]) * adapt; }
    }
    return { cx: (lx + tw / 2) / W, cy: (ly + th / 2) / H, score: res.mean, lost: lost };
  }
  return { step: step, texture: texture, tw: tw, th: th };
}
  function isPlain(texture) { return texture < 5; }   // a flat colour has nothing to hold on to

  /* ---------- movie <-> frame coordinates ---------- */
  // One picture clip as the viewer sees it. o = { vw, vh (the video file's size in pixels), fa (frame width / height), crop: { x, y, w, h } | null,
  // t: { zoom, x, y, rot, flipH } (the clip's transform at that moment), boxPan (true when the zoom pan is measured on the fitted picture, not the frame:
  // the frame has another shape than the movie, or the clip is cropped) }.
  // The picture is cropped, flipped, turned, fitted inside the frame, then zoomed about the middle and panned: the same order as the preview and the exports.
  // toFrame(u, v): movie fractions -> frame fractions. toMovie(fx, fy): the other way. k = frame heights per movie pixel, vh = movie height in pixels.
  function makeGeo(o) {
    var t = Object.assign({ zoom: 1, x: 0, y: 0, rot: 0, flipH: false }, o.t || {}), cr = o.crop || { x: 0, y: 0, w: 1, h: 1 };
    var rw0 = o.vw * cr.w, rh0 = o.vh * cr.h, rot = (((Math.round((+t.rot || 0) / 90) * 90) % 360) + 360) % 360, side = rot === 90 || rot === 270;
    var rw = side ? rh0 : rw0, rh = side ? rw0 : rh0, W = o.fa > 0 ? o.fa : o.vw / o.vh, H = 1, s = Math.min(W / rw, H / rh), bw = rw * s, bh = rh * s;
    var z = t.zoom || 1, pw = o.boxPan ? bw : W, ph = o.boxPan ? bh : H, panX = -(t.x || 0) * (z - 1) * 0.5 * pw, panY = -(t.y || 0) * (z - 1) * 0.5 * ph;
    var a = rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), k = s * z, flip = !!t.flipH;
    function toFrame(u, v) {
      var X = ((u - cr.x) / cr.w - 0.5) * rw0, Y = ((v - cr.y) / cr.h - 0.5) * rh0;
      if (flip) X = -X;
      var xr = X * c - Y * sn, yr = X * sn + Y * c;
      return { x: 0.5 + (xr * k + panX) / W, y: 0.5 + (yr * k + panY) / H };
    }
    function toMovie(fx, fy) {
      var xr = ((fx - 0.5) * W - panX) / k, yr = ((fy - 0.5) * H - panY) / k, X = xr * c + yr * sn, Y = -xr * sn + yr * c;
      if (flip) X = -X;
      return { u: cr.x + (X / rw0 + 0.5) * cr.w, v: cr.y + (Y / rh0 + 0.5) * cr.h };
    }
    return { toFrame: toFrame, toMovie: toMovie, k: k, vh: o.vh };
  }
  // The same without crop, turn or zoom: just the bars around a movie fitted inside a frame. fa = frame width / height, ma = movie width / height.
  function same(fa, ma) { return !(fa > 0) || !(ma > 0) || Math.abs(fa / ma - 1) < 0.001; }
  function frameToMovie(fx, fy, fa, ma) {
    if (same(fa, ma)) return { u: fx, v: fy };
    if (ma > fa) return { u: fx, v: 0.5 + (fy - 0.5) / (fa / ma) };
    return { u: 0.5 + (fx - 0.5) / (ma / fa), v: fy };
  }
  function movieToFrame(u, v, fa, ma) {
    if (same(fa, ma)) return { x: u, y: v };
    if (ma > fa) return { x: u, y: 0.5 + (v - 0.5) * (fa / ma) };
    return { x: 0.5 + (u - 0.5) * (ma / fa), y: v };
  }
  function sizeToMovie(size, fa, ma) { return (!same(fa, ma) && ma > fa) ? size / (fa / ma) : size; }

  /* ---------- from a track to keyframes ---------- */
  // track = [{ ms, x, y, lost }] in movie time, sorted. Light smoothing of the points in between (the ends and keepMs stay exactly where they are).
  function smooth(track, keepMs, passes) {
  var n = track.length; if (n < 3) return track;
  passes = passes == null ? 8 : passes;
  function fill(key) {
    var a = track.map(function (p) { return p[key]; }), i = 0;
    while (i < n) {
      if (!track[i].lost) { i++; continue; }
      var j = i; while (j < n && track[j].lost) j++;
      var L = i > 0 ? a[i - 1] : null, R = j < n ? a[j] : null;
      for (var k = i; k < j; k++) a[k] = (L == null) ? R : (R == null) ? L : L + (R - L) * (k - i + 1) / (j - i + 1);
      i = j;
    }
    return a;
  }
  function med(a, b, c) { return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c)); }
  function despike(a) { return a.map(function (v, i) { return (i === 0 || i === n - 1) ? v : med(a[i - 1], v, a[i + 1]); }); }
  function blur(a) { return a.map(function (v, i) { return (a[i > 0 ? i - 1 : 1] + 2 * v + a[i < n - 1 ? i + 1 : n - 2]) / 4; }); }
  var xs = despike(fill('x')), ys = despike(fill('y')), k, pi = -1;
  for (k = 0; k < passes; k++) { xs = blur(xs); ys = blur(ys); }
  track.forEach(function (p, i) { if (p.ms === keepMs) pi = i; });
  var dx = pi >= 0 ? track[pi].x - xs[pi] : 0, dy = pi >= 0 ? track[pi].y - ys[pi] : 0;
  return track.map(function (p, i) { return { ms: p.ms, x: xs[i] + dx, y: ys[i] + dy, lost: p.lost }; });
}
  function at(track, ms) {
    var n = track.length; if (!n) return { x: 0.5, y: 0.5 };
    if (ms <= track[0].ms) return track[0];
    if (ms >= track[n - 1].ms) return track[n - 1];
    for (var i = 1; i < n; i++) if (ms <= track[i].ms) {
      var a = track[i - 1], b = track[i], f = b.ms === a.ms ? 0 : (ms - a.ms) / (b.ms - a.ms);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    return track[n - 1];
  }
  // times (ms since the clip started) to put a position on: every step ms, and the end
  function sampleTimes(dur, step) {
    step = step || STEP_MS; var out = [], t;
    for (t = 0; t < dur; t += step) out.push(t);
    out.push(Math.round(dur));
    return out;
  }
  // drops the points that a straight line between their neighbours would reproduce (within eps)
  function simplify(pts, eps) {
    if (pts.length < 3) return pts.map(function (p) { return [p[0], r4(p[1])]; });
    var keep = {}; keep[0] = 1; keep[pts.length - 1] = 1;
    (function rec(a, b) {
      var worst = -1, wi = -1, i;
      for (i = a + 1; i < b; i++) {
        var f = pts[b][0] === pts[a][0] ? 0 : (pts[i][0] - pts[a][0]) / (pts[b][0] - pts[a][0]), e = Math.abs(pts[i][1] - (pts[a][1] + (pts[b][1] - pts[a][1]) * f));
        if (e > worst) { worst = e; wi = i; }
      }
      if (worst > eps) { keep[wi] = 1; rec(a, wi); rec(wi, b); }
    })(0, pts.length - 1);
    return pts.filter(function (p, i) { return keep[i]; }).map(function (p) { return [p[0], r4(p[1])]; });
  }
  // rels[i] = a time on the clip (ms since it started); infos[i] = what the picture is at that moment: { ms (movie time), toFrame(u, v) -> { x, y } }, or null when the
  // video being tracked is not on screen then (the clip keeps its last place). (A plain number is a movie time, converted with o.fa / o.ma.)
  // o = { offX, offY (added to the followed position), keepMs, lo, hi (limits of the result, 0 and 1 unless given) }.
  // Returns { x: [[rel, v]...], y: [...] } for P.setTrackedPath.
  function toKeyframes(track, rels, infos, o) {
    o = o || {};
    var lo = o.lo != null ? o.lo : 0, hi = o.hi != null ? o.hi : 1, sm = smooth(track, o.keepMs, o.passes), pos = [], last = null, i, k = 0;
    for (i = 0; i < rels.length; i++) {
      var m = infos[i];
      if (m != null) {
        var obj = typeof m === 'object', p = at(sm, obj ? m.ms : m), f = (obj && m.toFrame) ? m.toFrame(p.x, p.y) : movieToFrame(p.x, p.y, o.fa, o.ma);
        last = { x: f.x, y: f.y };
      }
      pos.push(last);
    }
    while (k < pos.length && !pos[k]) k++;
    if (k >= pos.length) return { x: [], y: [] };
    for (i = 0; i < k; i++) pos[i] = pos[k];
    var ox = o.offX || 0, oy = o.offY || 0;
    return {
      x: simplify(rels.map(function (r, j) { return [r, clamp(pos[j].x + ox, lo, hi)]; }), 0.0004),
      y: simplify(rels.map(function (r, j) { return [r, clamp(pos[j].y + oy, lo, hi)]; }), 0.0004)
    };
  }

  /* ---------- reading the movie (browser only) ---------- */
  function openVideo(url) {
    return new Promise(function (res, rej) {
      var v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.setAttribute('playsinline', '');
      v.onloadeddata = function () { res(v); }; v.onerror = function () { rej(new Error('the video could not be read')); };
      v.src = url;
    });
  }
  function seekTo(v, ms) {
    return new Promise(function (res) {
      var done = false, tm = 0;
      function fin() { if (done) return; done = true; v.removeEventListener('seeked', fin); clearTimeout(tm); res(); }
      var t = Math.max(0, Math.min(ms / 1000, (v.duration || 1e9) - 0.05));
      if (Math.abs(v.currentTime - t) < 0.001) { res(); return; }
      tm = setTimeout(fin, 4000); v.addEventListener('seeked', fin); v.currentTime = t;
    });
  }
  // o = { refMs, fromMs, toMs (video file time), box: { cx, cy, size } in movie fractions, onProgress(0..1), isCancelled() }.
  // Follows forwards from refMs to toMs and backwards to fromMs. Resolves { track, texture, lostFrac }.
  var MBP = null;
function loadMB() { if (!MBP) MBP = import(new URL('vendor/mediabunny/mediabunny.min.mjs', location.href).href); return MBP; }
async function framesFromFile(file, times, check, prog) {
  var M = await loadMB(), input = new M.Input({ source: new M.BlobSource(file), formats: M.ALL_FORMATS });
  try {
    var vt = await input.getPrimaryVideoTrack(); if (!vt) throw new Error('the video has no picture');
    var vw = vt.displayWidth, vh = vt.displayHeight, W = fw(vw, vh), H = Math.max(2, Math.round(W * vh / vw));
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d', { willReadFrequently: true }), frames = [], last = null;
    for await (var s of new M.VideoSampleSink(vt).samplesAtTimestamps(times.map(function (ms) { return ms / 1000; }))) {
      check();
      if (s) { g.drawImage(s.toCanvasImageSource(), 0, 0, W, H); s.close(); last = toGray(g.getImageData(0, 0, W, H).data, W * H); }
      frames.push(last || new Uint8Array(W * H)); prog(frames.length / times.length);
    }
    return { frames: frames, W: W, H: H };
  } finally { try { if (input.dispose) input.dispose(); } catch (e) {} }
}
async function framesFromUrl(url, times, check, prog) {   // old way: seek a hidden video (slow, not frame-exact)
  var v = await openVideo(url), vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) throw new Error('the video has no picture');
  var W = fw(vw, vh), H = Math.max(2, Math.round(W * vh / vw)), cv = document.createElement('canvas'), frames = [];
  cv.width = W; cv.height = H; var g = cv.getContext('2d', { willReadFrequently: true });
  try {
    for (var i = 0; i < times.length; i++) { check(); await seekTo(v, times[i]); g.drawImage(v, 0, 0, W, H); frames.push(toGray(g.getImageData(0, 0, W, H).data, W * H)); prog((i + 1) / times.length); }
  } finally { try { v.removeAttribute('src'); v.load(); } catch (e) {} }
  return { frames: frames, W: W, H: H };
}
// src = a File/Blob (frame-exact, preferred) or a URL. o as before.
async function analyze(src, o) {
  if (typeof document === 'undefined') throw new Error('Tracking only works in the browser.');
  var ref = Math.round(o.refMs), lo = Math.min(o.fromMs, ref), hi = Math.max(o.toMs, ref), step = Math.max(STEP_MS, Math.ceil((hi - lo) / MAX_FRAMES)), t;
  var before = []; for (t = ref - step; t >= lo; t -= step) before.push(t); before.reverse();
  var times = before.concat([ref]), ri = before.length; for (t = ref + step; t <= hi; t += step) times.push(t);
  function check() { if (o.isCancelled && o.isCancelled()) { var e = new Error('Tracking stopped'); e.cancelled = true; throw e; } }
  var prog = function (f) { if (o.onProgress) o.onProgress(f * 0.8); };
  var fr = (typeof Blob !== 'undefined' && src instanceof Blob) ? await framesFromFile(src, times, check, prog) : await framesFromUrl(src, times, check, prog);
  var boxes = o.boxes || [o.box], p = preset(o.preset), results = [], b, dir, i;
  for (b = 0; b < boxes.length; b++) {
    var out = new Array(times.length), tex = 0, lostN = 0;
    out[ri] = { ms: ref, x: boxes[b].cx, y: boxes[b].cy, lost: false };
    for (dir = 1; dir >= -1; dir -= 2) {
      var tr = createTracker(fr.frames[ri], fr.W, fr.H, boxes[b], { radiusFrac: p.radius, lostAt: p.lostAt, adapt: p.adapt }); tex = tr.texture;
      for (i = ri + dir; i >= 0 && i < times.length; i += dir) {
        check(); var r = tr.step(fr.frames[i]); if (r.lost) lostN++;
        out[i] = { ms: times[i], x: r.cx, y: r.cy, lost: r.lost };
      }
    }
    results.push({ track: out, texture: tex, lostFrac: lostN / Math.max(1, out.length - 1) });
    if (o.onProgress) o.onProgress(0.8 + 0.2 * (b + 1) / boxes.length);
  }
  return { results: results, track: results[0].track, texture: results[0].texture, lostFrac: results[0].lostFrac };
}

  var api = { STEP_MS: STEP_MS, toGray: toGray, createTracker: createTracker, isPlain: isPlain, makeGeo: makeGeo, frameToMovie: frameToMovie, movieToFrame: movieToFrame, PRESETS: PRESET_LIST, preset: preset,
    sizeToMovie: sizeToMovie, smooth: smooth, at: at, sampleTimes: sampleTimes, simplify: simplify, toKeyframes: toKeyframes, analyze: analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiTracker = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['tracker.js'] = 'track'; }
  return api;
})();