'use strict';
// node tools/apply-tracker.js   (from the project folder)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function load(rel) { const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o) { fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const problems = [], notes = [];
function rep(o, find, replace, label, optional) {
  const n = o.text.split(find).length - 1;
  if (n !== 1) { if (optional) { notes.push(label + ': skipped (found ' + n + ' times)'); return; } problems.push(label + ': found ' + n + ' times (need exactly 1) in ' + o.rel); return; }
  o.text = o.text.replace(find, () => replace);
}
if (!fs.existsSync(path.join(root, 'www', 'tracker.js'))) { console.log('NOTHING WAS CHANGED. Put tracker.js in the www folder first.'); process.exit(1); }
const ed = load('www/editor.js'), pj = load('www/project.js'), html = load('www/index.html');
let sw = null; try { sw = load('www/sw.js'); } catch (e) { notes.push('sw.js: not found'); }
if (ed.text.includes('function runTrack')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

const PROJECT_FN = `// ---------- motion tracking ----------
// Gives an overlay x / y keyframes that follow something in the picture (see tracker.js). path = { x: [[msSinceClipStart, value]...], y: [...] }.
// Replaces the x and y keyframes the overlay had; its other keyframes stay. Not for frames and spotlights (they cover the picture).
function setTrackedPath(p, id, path){
  var f = findClip(p, id), kind = f && kfKind(f.track);
  if (kind !== 'overlay' || !path || !_AN || (f.clip.gen && f.clip.gen.full)) return p;
  var q = cloneProject(p), c = findClip(q, id).clip, any = false;
  ['x', 'y'].forEach(function (k){
    var pts = path[k]; if (!pts || !pts.length) return;
    var r = _AN.RANGE.overlay[k], arr = [];
    pts.slice().sort(function (a, b){ return a[0] - b[0]; }).forEach(function (pt){
      var t = Math.max(0, Math.min(Math.round(c.dur), Math.round(pt[0]))), v = r3(Math.max(r[0], Math.min(r[1], +pt[1])));
      if (isNaN(v)) return;
      if (arr.length && arr[arr.length - 1][0] === t) arr[arr.length - 1] = [t, v]; else arr.push([t, v]);
    });
    if (!arr.length) return;
    c.kf = c.kf || {}; c.kf[k] = arr; any = true;
  });
  if (!any) return p;
  return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) ? p : finish(q);
}

// ---------- undo / redo ----------`;

const BLOCK = `/* ---------- motion tracker: an overlay follows something in the picture ---------- */
  var NTK = (typeof module !== 'undefined' && module.exports) ? require('./tracker.js') : (typeof window !== 'undefined' ? window.NakiTracker : null);
  G.track = svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>');
  function trackNeed(){ if (NTK) return true; toast('The tracker is not loaded. Add <script src="tracker.js"></script> to index.html, before editor.js.'); return false; }
  // the tracking settings for the selected overlay (a new square starts where the overlay is)
  function trackBegin(){
    var c = selOverlay(); if (!c || (c.gen && c.gen.full)) return null;
    if (!E.trk || E.trk.id !== c.id){
      var s = NANIM.overlayState(c, relNow(c));
      E.trk = { id: c.id, cx: clamp(s.x, 0.05, 0.95), cy: clamp(s.y, 0.05, 0.95), size: 0.12, mode: 'keep', running: false, cancelled: false, msg: '' };
    }
    return E.trk;
  }
  // the square you drag onto what should be followed (only while the Track panel is open)
  function syncTrackBox(){
    var lay = E.ui.overlaylayer; if (!lay) return;
    var T = E.trk, c = (E.panel === 'track' && E.isOpen) ? selOverlay() : null, bx = E.ui.trkbox;
    if (!c || !T || T.id !== c.id){ if (bx) bx.style.display = 'none'; return; }
    if (!bx){
      bx = E.ui.trkbox = mk('div');
      bx.style.cssText = 'position:absolute;box-sizing:border-box;border:2px solid #ff9f1c;border-radius:4px;box-shadow:0 0 0 1px rgba(0,0,0,.6);cursor:move;touch-action:none;pointer-events:auto;z-index:7;transform:translate(-50%,-50%)';
      var dot = mk('i'); dot.style.cssText = 'position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#ff9f1c;pointer-events:none';
      bx.appendChild(dot); bx.addEventListener('pointerdown', trkBoxDown);
    }
    if (bx.parentNode !== lay) lay.appendChild(bx);
    var px = Math.max(14, Math.round(T.size * (lay.clientHeight || 240)));
    bx.style.display = 'block'; bx.style.left = (T.cx * 100) + '%'; bx.style.top = (T.cy * 100) + '%'; bx.style.width = px + 'px'; bx.style.height = px + 'px';
  }
  function trkBoxDown(ev){
    var T = E.trk; if (!T) return;
    ev.preventDefault(); ev.stopPropagation();
    var r = E.ui.overlaylayer.getBoundingClientRect(), s = { x0: ev.clientX, y0: ev.clientY, cx: T.cx, cy: T.cy, w: r.width || 1, h: r.height || 1 };
    function mv(e){ T.cx = clamp(s.cx + (e.clientX - s.x0) / s.w, 0.02, 0.98); T.cy = clamp(s.cy + (e.clientY - s.y0) / s.h, 0.02, 0.98); syncTrackBox(); }
    function up(){ window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  function runTrack(){
    var T = E.trk, c = selOverlay(), h = E.hooks;
    if (!trackNeed() || !T || !c || T.running) return;
    if (!movieReady()){ toast('Choose the movie for this session first.'); return; }
    var url = h.movieUrl && h.movieUrl(), fd = E.frameDims;
    if (!url || !fd || !fd.w || !fd.h){ toast('The movie is not ready yet. Try again in a moment.'); return; }
    if (E.t < c.start || E.t >= c.start + c.dur){ toast('Move the playhead onto the overlay, at a moment where you can see what to follow.', 6000); return; }
    // the movie time shown at timeline time t, or null when it is not the plain original movie (no zoom, crop, turn or flip)
    function movieAtT(t){
      var s = P.sourceAt(E.proj, t), v = s.video, k = v && v.clip;
      if (!k || (k.asset && k.asset !== 'movie') || k.crop || k.transform || k.kf) return null;
      return Math.round(v.movieMs);
    }
    var refMs = movieAtT(E.t);
    if (refMs == null){ toast('Tracking needs the original movie, with no zoom, crop, turn or flip, at the playhead. Use Reset in Zoom or Crop first.', 8000); return; }
    var rels = NTK.sampleTimes(c.dur), ms = rels.map(function (r){ return movieAtT(c.start + Math.min(r, c.dur - 1)); }), lo = refMs, hi = refMs;
    ms.forEach(function (m){ if (m != null){ lo = Math.min(lo, m); hi = Math.max(hi, m); } });
    if (hi - lo < 200){ toast('There is not enough moving picture under this overlay to follow anything.', 6000); return; }
    var fa = frameAspect() || fd.w / fd.h, ma = fd.w / fd.h, p0 = NTK.frameToMovie(T.cx, T.cy, fa, ma);
    var box = { cx: clamp(p0.u, 0.02, 0.98), cy: clamp(p0.v, 0.02, 0.98), size: clamp(NTK.sizeToMovie(T.size, fa, ma), 0.04, 0.5) };
    var key = c.start + '|' + c.dur, id = c.id, keep = T.mode === 'keep', ov0 = NANIM.overlayState(c, relNow(c)), cx0 = T.cx, cy0 = T.cy;
    pause(); T.running = true; T.cancelled = false; T.msg = 'Starting...'; renderDock();
    function say(m){ T.msg = m; if (E.trkStatus) E.trkStatus.textContent = m; }
    NTK.analyze(url, { refMs: refMs, fromMs: lo, toMs: hi, box: box, onProgress: function (f){ say('Following... ' + Math.round(f * 100) + '%'); }, isCancelled: function (){ return T.cancelled; } }).then(function (res){
      T.running = false;
      var f = P.findClip(E.hist.cur, id);
      if (!f || (f.clip.start + '|' + f.clip.dur) !== key){ renderDock(); toast('The overlay changed while tracking. Tap Start tracking again.', 7000); return; }
      var kf = NTK.toKeyframes(res.track, rels, ms, { fa: fa, ma: ma, offX: keep ? ov0.x - cx0 : 0, offY: keep ? ov0.y - cy0 : 0, keepMs: refMs });
      var q = P.setTrackedPath(E.hist.cur, id, kf);
      if (q === E.hist.cur){ renderDock(); toast('Nothing was changed.'); return; }
      commit(q);
      var warn = NTK.isPlain(res.texture) ? ' That spot is quite plain, so it may have drifted: try a part with an edge or a pattern.' : (res.lostFrac > 0.3 ? ' It lost the spot for part of the time: try a clearer spot, or a bigger square.' : '');
      toast('Tracking done. Press play to check it.' + warn, warn ? 9000 : 5000);
    }).catch(function (err){
      T.running = false; renderDock();
      if (T.cancelled || (err && err.cancelled)) toast('Tracking stopped.');
      else { console.error('tracking failed', err); toast('Tracking did not work' + (err && err.message ? ': ' + err.message : '') + '.', 9000); }
    });
  }
  PANELS.track = { title: 'Track motion', build: function (body){
    if (!NTK){ body.appendChild(mk('div', 'ed-hint', 'tracker.js is not loaded. Add <script src="tracker.js"></script> to index.html, before editor.js.')); return; }
    var c = selOverlay(), T = trackBegin();
    if (!c || !T){ body.appendChild(mk('div', 'ed-hint', 'Tap a photo, video, shape or arrow overlay on the timeline first.')); return; }
    var run = !!T.running;
    body.appendChild(chips([{ key: 'keep', label: 'Keep my offset' }, { key: 'center', label: 'Centre on it' }], T.mode, function (k){ T.mode = k; renderDock(); }));
    body.appendChild(sliderRow('Square size', 5, 30, 1, Math.round(T.size * 100), pct, function (v){ T.size = v / 100; syncTrackBox(); }, function (v){ T.size = v / 100; syncTrackBox(); }));
    var st = mk('div', 'ed-hint', run ? T.msg : 'Move the playhead to a moment where you can see what to follow. Drag the orange square onto it, then tap Start tracking.');
    E.trkStatus = st; body.appendChild(st);
    body.appendChild(actions(run
      ? [{ id: 'edTrackStop', label: 'Stop', run: function (){ T.cancelled = true; } }]
      : [{ id: 'edTrackGo', label: 'Start tracking', run: runTrack },
         { id: 'edTrackClear', label: 'Remove tracking', run: function (){
           var rl = relNow(c), q = P.clearKeyframes(P.clearKeyframes(E.hist.cur, c.id, 'x', rl), c.id, 'y', rl);
           if (q === E.hist.cur) toast('There is no tracking on this overlay.'); else commit(q); } }]));
    body.appendChild(mk('div', 'ed-hint', 'The overlay follows the part of the picture inside the square, from the start of the overlay to its end (backwards and forwards from the playhead). Pick a part with an edge or a pattern, not a plain wall. Keep my offset keeps the overlay where it is now, next to the thing; Centre on it puts the overlay right on the thing. It uses the original movie only, with no zoom, crop, turn or flip. The result is ordinary Left / right and Up / down keyframes, so you can fine-tune or ease them, and Undo takes it back.'));
  } };

  /* ---------- titles drawn over the preview ---------- */`;

rep(ed, `{ id: 'edOverlayMotion', label: 'Motion', icon: G.motion, run: function (){ openPanel('motion'); }, disabled: !isO },`,
  `{ id: 'edOverlayMotion', label: 'Motion', icon: G.motion, run: function (){ openPanel('motion'); }, disabled: !isO },\n        { id: 'edOverlayTrack', label: 'Track', icon: G.track, run: function (){ openPanel('track'); }, disabled: !isO || !!(selGen() && selGen().gen.full) },`, 'editor: Track button');
rep(ed, `syncPicker(); syncCrop(); addEyedroppers();`, `syncPicker(); syncCrop(); syncTrackBox(); addEyedroppers();`, 'editor: square follows the dock');
rep(ed, `function layoutTextLayer(){ layoutTextLayerBase(); layoutPicture(); syncStickers(); syncOverlays(); drawCrop(); }`,
  `function layoutTextLayer(){ layoutTextLayerBase(); layoutPicture(); syncStickers(); syncOverlays(); drawCrop(); syncTrackBox(); }`, 'editor: square follows the window size');
rep(ed, `/* ---------- titles drawn over the preview ---------- */`, BLOCK, 'editor: tracker functions and panel');
rep(pj, `// ---------- undo / redo ----------`, PROJECT_FN, 'project: setTrackedPath');
rep(pj, `selectRight: selectRight, deleteClips: deleteClips };`, `selectRight: selectRight, deleteClips: deleteClips, setTrackedPath: setTrackedPath };`, 'project: export');
rep(html, `<script src="markers.js"></script>`, `<script src="markers.js"></script>\n<script src="tracker.js"></script>`, 'index.html: load tracker.js');
rep(html, `'markers.js': 'markers' };`, `'markers.js': 'markers', 'tracker.js': 'track' };`, 'index.html: version check', true);
if (sw) rep(sw, `'./reframe.js'`, `'./reframe.js', './tracker.js'`, 'sw.js: offline file list', true);

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(ed); save(pj); save(html); if (sw) save(sw);
console.log('Done.' + (notes.length ? '\n  ' + notes.join('\n  ') : '') + '\nIf sw.js was skipped, add \'./tracker.js\' to its file list by hand.\nNow run:  node tests/tracker.test.js   and   npm test');
