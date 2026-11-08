'use strict';
// node tools/apply-motion-tracking.js   (from the project folder)
// Motion tracking: put an overlay (a shape, a blur box, an arrow, a picture) on something that moves in the movie, tap Track motion, and the overlay
// follows it. The result is ordinary x / y keyframes, so you can still change them, and both exports already know how to play them.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function load(rel) { const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o) { fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const problems = [];
function rep(o, find, replace, label) {
  const n = o.text.split(find).length - 1;
  if (n !== 1) { problems.push(label + ': found ' + n + ' times (need exactly 1) in ' + o.rel); return; }
  o.text = o.text.replace(find, () => replace);
}
const an = load('www/anim.js'), pj = load('www/project.js'), ed = load('www/editor.js');
if (an.text.includes('function makeTracker')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- anim.js: the maths (grey pictures in, positions out) ----------
const MATHS = `// ---------- motion tracking: follow a patch of the picture from one frame to the next (pure maths) ----------
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
var api = { OVERLAY: OVERLAY,`;
rep(an, 'var api = { OVERLAY: OVERLAY,', MATHS, 'anim: tracking maths');
rep(an, 'insertKf: insertKf, bakeKf: bakeKf', 'insertKf: insertKf, bakeKf: bakeKf, makeTracker: makeTracker, findBlock: findBlock, smoothSeries: smoothSeries, simplifyKf: simplifyKf, LOST_ERR: LOST_ERR', 'anim: exports');

// ---------- project.js: write a whole list of keyframes at once ----------
rep(pj, '// ---------- reverse ----------',
`// ---------- keyframes written in one go (motion tracking) ----------
// series = { x: [[ms since the clip started, value], ...], y: [...] } for an overlay clip. Each list replaces that property's keyframes; an empty list takes them away.
function setKeyframeSeries(p, id, series){
  var f = findClip(p, id); if (!f || kfKind(f.track) !== 'overlay' || f.track.locked || !_AN) return p;
  var q = cloneProject(p), c = findClip(q, id).clip, R = _AN.RANGE.overlay; c.kf = c.kf || {};
  Object.keys(series || {}).forEach(function (k){
    var r = R[k]; if (!r) return;
    var pts = (series[k] || []).map(function (x){ return [Math.max(0, Math.min(Math.round(c.dur), Math.round(x[0]))), r3(Math.max(r[0], Math.min(r[1], +x[1])))]; })
      .filter(function (x){ return !isNaN(x[1]); }).sort(function (a, b){ return a[0] - b[0]; });
    var out = []; pts.forEach(function (x){ if (out.length && out[out.length - 1][0] === x[0]) out[out.length - 1] = x; else out.push(x); });
    if (out.length) c.kf[k] = out; else delete c.kf[k];
  });
  if (!Object.keys(c.kf).length) delete c.kf;
  return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) ? p : finish(q);
}

// ---------- reverse ----------`, 'project: setKeyframeSeries');
rep(pj, 'setReverse: setReverse, linkedClips: linkedClips,', 'setReverse: setReverse, linkedClips: linkedClips, setKeyframeSeries: setKeyframeSeries,', 'project: exports');

// ---------- editor.js ----------
rep(ed, '  function addOverlayFromFile(){',
`  // ---------- motion tracking: an overlay follows something that moves in the picture ----------
  var TRACK_AREAS = [{ key: 'small', label: 'Small', f: 0.06 }, { key: 'medium', label: 'Medium', f: 0.1 }, { key: 'large', label: 'Large', f: 0.16 }];
  function trackWait(v, ev, ms){
    return new Promise(function (res){
      var done = false, t = null;
      function fin(ok){ if (done) return; done = true; clearTimeout(t); v.removeEventListener(ev, h); v.removeEventListener('error', er); res(ok); }
      function h(){ fin(true); } function er(){ fin(false); }
      v.addEventListener(ev, h); v.addEventListener('error', er); t = setTimeout(function (){ fin(false); }, ms);
    });
  }
  function trackOverlay(c, areaKey){
    if (E.tk && E.tk.running) return;
    if (!NANIM || !NANIM.makeTracker || !NF || !NF.containLayout){ toast('Tracking is not available here.'); return; }
    pause();
    var Ts = Math.round(Math.max(c.start, Math.min(c.start + c.dur - 200, E.t)));
    var vt = E.proj.tracks.filter(function (t){ return t.role === 'movie'; })[0], vc = vt && vt.clips.filter(function (k){ return k.start <= Ts && Ts < k.start + k.dur; })[0];
    if (!vc || vc.type !== 'video'){ toast('There is no moving picture under the overlay at the playhead.', 6000); return; }
    var tf = vc.transform || {};
    if (vc.reverse || vc.curve || vc.crop || (tf.zoom && tf.zoom !== 1) || tf.x || tf.y || tf.rot || tf.flipH || (vc.kf && (vc.kf.zoom || vc.kf.x || vc.kf.y))){
      toast('Tracking needs the picture clip with no zoom, turn, flip, crop, reverse or speed curve. Reset those first.', 9000); return;
    }
    var url = clipUrl(vt, vc); if (!url){ toast('The movie is not loaded.'); return; }
    var area = TRACK_AREAS.filter(function (a){ return a.key === areaKey; })[0] || TRACK_AREAS[1];
    var Te = Math.min(c.start + c.dur, vc.start + vc.dur), tk = E.tk = { running: true, cancel: false, pct: 0, shown: 0 }, v = document.createElement('video');
    var clamp01 = function (x){ return Math.max(0, Math.min(1, x)); };
    (async function (){
      try {
        v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url; v.load();
        if (!(await trackWait(v, 'loadedmetadata', 15000)) || !v.videoWidth) throw new Error('The movie could not be read for tracking.');
        var W = E.ui.picframe.clientWidth || 1000, H = E.ui.picframe.clientHeight || (1000 / (frameAspect() || (v.videoWidth / v.videoHeight)));
        var b = NF.containLayout(null, W, H, v.videoWidth, v.videoHeight).box;
        var x0 = NANIM.valueOf(c, 'overlay', 'x', Ts - c.start), y0 = NANIM.valueOf(c, 'overlay', 'y', Ts - c.start);
        var u0 = (x0 * W - b.x) / b.w, w0 = (y0 * H - b.y) / b.h;
        if (u0 < 0.02 || u0 > 0.98 || w0 < 0.02 || w0 > 0.98) throw new Error('Put the middle of the overlay on the thing that moves first, then track.');
        var gw = 192, gh = Math.max(8, Math.round(gw * v.videoHeight / v.videoWidth)), cv = document.createElement('canvas'); cv.width = gw; cv.height = gh;
        var g = cv.getContext('2d', { willReadFrequently: true });
        var grab = async function (T){
          var mt = Math.max(0, Math.min((v.duration || 1e9) - 0.01, (vc.in + (T - vc.start) * (vc.speed || 1)) / 1000));
          if (!(Math.abs(v.currentTime - mt) < 0.001 && v.readyState >= 2)){ var w = trackWait(v, 'seeked', 5000); v.currentTime = mt; await w; }
          g.drawImage(v, 0, 0, gw, gh);
          var d = g.getImageData(0, 0, gw, gh).data, gray = new Uint8Array(gw * gh);
          for (var i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
          return { w: gw, h: gh, d: gray };
        };
        var tw = Math.max(8, Math.round(gw * area.f)), tr = NANIM.makeTracker(await grab(Ts), u0 * gw, w0 * gh, tw, tw, Math.max(8, Math.round(gw * 0.12)));
        var s0 = tr.start, fx0 = (b.x + (s0.x / gw) * b.w) / W, fy0 = (b.y + (s0.y / gh) * b.h) / H;
        var step = Math.max(80, Math.ceil((Te - Ts) / 400)), xs = [[Ts - c.start, x0]], ys = [[Ts - c.start, y0]], lostAt = null, T;
        for (T = Ts + step; T <= Te && !tk.cancel; T += step){
          var r = tr.step(await grab(T));
          if (r.lost){ lostAt = T; break; }
          xs.push([T - c.start, clamp01(x0 + (b.x + (r.x / gw) * b.w) / W - fx0)]); ys.push([T - c.start, clamp01(y0 + (b.y + (r.y / gh) * b.h) / H - fy0)]);
          tk.pct = Math.round((T - Ts) / Math.max(1, Te - Ts) * 100);
          if (tk.pct - tk.shown >= 5){ tk.shown = tk.pct; if (E.isOpen && E.panel === 'overlayedit') renderDock(); }
        }
        if (xs.length < 3) throw new Error(lostAt !== null ? 'Naki lost sight of it straight away. Put the overlay on a clear, detailed spot, or try a bigger area.' : 'Nothing to follow: the clip is too short from the playhead.');
        if (Ts > c.start){ xs.unshift([0, x0]); ys.unshift([0, y0]); }
        var smooth = function (a){ var s = NANIM.smoothSeries(a.map(function (p){ return p[1]; }), 3); return a.map(function (p, i){ return [p[0], s[i]]; }); };
        var q = P.setKeyframeSeries(E.hist.cur, c.id, { x: NANIM.simplifyKf(smooth(xs), 0.004), y: NANIM.simplifyKf(smooth(ys), 0.004) });
        if (q === E.hist.cur) toast('It did not move, so nothing was changed.', 6000);
        else {
          commit(q);
          toast(tk.cancel ? 'Stopped. The overlay follows it up to where you stopped.' : lostAt !== null ? 'Naki lost sight of it at ' + (Math.round(lostAt / 100) / 10) + ' s. The overlay follows it up to there; you can track again from the playhead.' : 'Done. The overlay now follows it. The movement is in the x and y keyframes, so you can still change it.', 8000);
        }
      } catch (err){ toast(String(err && err.message ? err.message : err), 8000); }
      finally {
        tk.running = false; try { v.removeAttribute('src'); v.load(); } catch (e){}
        if (E.isOpen && E.panel === 'overlayedit') renderDock();
      }
    })();
  }
  function addOverlayFromFile(){`, 'editor: tracking code');
rep(ed, "body.appendChild(mk('div', 'ed-hint', 'Drag the overlay on the picture to move it. For movement, put a keyframe here, move the playhead, change the value, and it glides between them. An overlay has no sound.'));",
`var tkOn = !!(E.tk && E.tk.running), tareas = TRACK_AREAS.map(function (a){ return { key: a.key, label: a.label }; }), tcur = chipKey('trackarea', tareas, 'medium');
      body.appendChild(chips(tareas, tcur, pickChip('trackarea')));
      body.appendChild(actions([{ id: 'edTrack', label: tkOn ? 'Stop tracking (' + E.tk.pct + '%)' : 'Track motion', run: function (){ if (tkOn) E.tk.cancel = true; else trackOverlay(c, tcur); } }]));
      body.appendChild(mk('div', 'ed-hint', 'Track motion: put the middle of the overlay on the thing that moves, at the playhead, then tap Track motion. The overlay follows it to the end of the clip, or until Naki loses sight of it. Small suits a small object, Large a big one. Drag the overlay on the picture to move it. For movement by hand, put a keyframe here, move the playhead, change the value, and it glides between them. An overlay has no sound.'));`, 'editor: Track motion button');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(an); save(pj); save(ed);
console.log('Done.\nNow run:  node tests/motion-tracking.test.js   and then   npm test');