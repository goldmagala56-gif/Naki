'use strict';
// node tools/apply-tracker-plus.js   (from the project folder; run apply-tracker.js first)
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
const trk = fs.existsSync(path.join(root, 'www', 'tracker.js')) && fs.readFileSync(path.join(root, 'www', 'tracker.js'), 'utf8');
if (!trk || !trk.includes('function makeGeo')) { console.log('NOTHING WAS CHANGED. Copy the new tracker.js into the www folder first.'); process.exit(1); }
const ed = load('www/editor.js'), pj = load('www/project.js'), an = load('www/anim.js'), pl = load('www/plan.js'), ee = load('www/export-engine.js'), wc = load('www/webcodecs-export.js');
if (!ed.text.includes('function runTrack')) { console.log('NOTHING WAS CHANGED. Run tools/apply-tracker.js first.'); process.exit(1); }
if (ed.text.includes('function trackTarget')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

/* ---------------- anim.js ---------------- */
rep(an, `audio: { volume: [0, 2] } };`, `audio: { volume: [0, 2] }, sticker: { x: [0, 1], y: [0, 1] }, text: { x: [-1, 1], y: [-1, 1] } };`, 'anim: ranges for stickers and text');
rep(an, `if (kind === 'overlay') return c[prop] != null ? c[prop] : OVERLAY[prop];`,
  `if (kind === 'overlay') return c[prop] != null ? c[prop] : OVERLAY[prop];
    if (kind === 'sticker') return c[prop] != null ? c[prop] : 0.5;
    if (kind === 'text') return c[prop === 'x' ? 'dx' : 'dy'] || 0;   // a text moves by an offset from its usual place`, 'anim: value of a sticker / text');
rep(an, `  var api = { OVERLAY: OVERLAY,`, `  // How far a title is moved from its usual place (fractions of the frame) relMs after it appeared: its x / y keyframes, else its fixed dx / dy.
  function shiftOf(o, relMs) {
    var kf = (o && o.kf) || {};
    return { x: kf.x && kf.x.length ? kfValue(kf.x, relMs) : ((o && o.dx) || 0), y: kf.y && kf.y.length ? kfValue(kf.y, relMs) : ((o && o.dy) || 0) };
  }
  var api = { OVERLAY: OVERLAY,`, 'anim: shiftOf');
rep(an, `insertKf: insertKf, bakeKf: bakeKf };`, `insertKf: insertKf, bakeKf: bakeKf, shiftOf: shiftOf };`, 'anim: export');

/* ---------------- project.js ---------------- */
rep(pj, `function kfKind(tr){ return tr.kind === 'overlay' ? 'overlay' : (tr.role === 'movie' ? 'picture' : (tr.kind === 'audio' ? 'audio' : null)); }`,
  `function kfKind(tr){ return tr.kind === 'overlay' ? 'overlay' : tr.kind === 'sticker' ? 'sticker' : tr.kind === 'text' ? 'text' : (tr.role === 'movie' ? 'picture' : (tr.kind === 'audio' ? 'audio' : null)); }`, 'project: kfKind');
rep(pj, `if (kind === 'overlay'){ c[prop] = v; return; }`, `if (kind === 'overlay' || kind === 'sticker'){ c[prop] = v; return; }
  if (kind === 'text'){ c[prop === 'x' ? 'dx' : 'dy'] = v; return; }`, 'project: fixed value of a sticker / text');
rep(pj, `if (kind === 'audio') return ['volume'];`, `if (kind === 'audio') return ['volume'];
  if (kind === 'sticker') return ['x', 'y'];   // a sticker can be keyframed in place (size and turn stay fixed)
  if (kind === 'text') return [];             // a text only moves by tracking (no keyframe bar)`, 'project: keyframe properties');
rep(pj, `if (kind !== 'overlay' || !path || !_AN || (f.clip.gen && f.clip.gen.full)) return p;`,
  `if ((kind !== 'overlay' && kind !== 'sticker' && kind !== 'text') || !path || !_AN || (f.clip.gen && f.clip.gen.full)) return p;`, 'project: setTrackedPath kinds');
rep(pj, `var r = _AN.RANGE.overlay[k], arr = [];`, `var r = _AN.RANGE[kind][k], arr = [];`, 'project: setTrackedPath ranges');
rep(pj, `// ---------- undo / redo ----------`, `// Takes the tracking (x / y keyframes) off an overlay, sticker or text. An overlay or sticker keeps the place it has at relMs; a text goes back to its usual place.
function clearTrackedPath(p, id, relMs){
  var f = findClip(p, id), kind = f && kfKind(f.track);
  if (!f || (kind !== 'overlay' && kind !== 'sticker' && kind !== 'text') || !f.clip.kf || !_AN) return p;
  var q = cloneProject(p), c = findClip(q, id).clip, had = false;
  ['x', 'y'].forEach(function (k){
    if (!c.kf[k]) return;
    if (kind !== 'text') setStaticProp(c, kind, k, r3(_AN.valueOf(c, kind, k, relMs || 0)));
    delete c.kf[k]; had = true;
  });
  if (kind === 'text'){ delete c.dx; delete c.dy; }
  if (!Object.keys(c.kf).length) delete c.kf;
  return had ? finish(q) : p;
}

// ---------- undo / redo ----------`, 'project: clearTrackedPath');
rep(pj, `setTrackedPath: setTrackedPath };`, `setTrackedPath: setTrackedPath, clearTrackedPath: clearTrackedPath };`, 'project: export');

/* ---------------- plan.js ---------------- */
rep(pl, `if (c.anim) tx.anim = JSON.parse(JSON.stringify(c.anim));`, `if (c.anim) tx.anim = JSON.parse(JSON.stringify(c.anim));
          if (c.kf && (c.kf.x || c.kf.y) && NAN && NAN.bakeKf){ var tk = {}; ['x', 'y'].forEach(function (k) { if (c.kf[k] && c.kf[k].length) tk[k] = c.kf[k]; }); tx.kf = NAN.bakeKf(tk); tx.kfT0 = s; }   // tracked text: moves by an offset
          if (c.dx) tx.dx = c.dx; if (c.dy) tx.dy = c.dy;`, 'plan: text offsets');
rep(pl, `if (c.glyph && e > s) stickers.push({ startMs: s, durMs: e - s, glyph: c.glyph, color: c.color, x: c.x, y: c.y, size: c.size, rot: c.rot || 0 });`,
  `if (c.glyph && e > s){
          var so = { startMs: s, durMs: e - s, glyph: c.glyph, color: c.color, x: c.x, y: c.y, size: c.size, rot: c.rot || 0 };
          if (c.kf && (c.kf.x || c.kf.y) && NAN && NAN.bakeKf){ var sk = {}; ['x', 'y'].forEach(function (k) { if (c.kf[k] && c.kf[k].length) sk[k] = c.kf[k]; }); so.kf = NAN.bakeKf(sk); }
          stickers.push(so);
        }`, 'plan: sticker keyframes');

/* ---------------- export-engine.js (ffmpeg) ---------------- */
rep(ee, `// Colour grades: each different grade is baked into a .cube file`, `// A title or sticker that moves (tracking): its full-frame picture is shifted with overlay x / y expressions. Returns the x:y part of the overlay filter.
  function tfShift(tf, sp) {
    var c = tf.clip, kf = (_NA && c.kf) || null, shift = (c.kfT0 != null ? c.kfT0 : c.startMs) - sp.sessionStart;
    function axis(k, dim) {
      if (kf && kf[k] && kf[k].length) return dim + '*(' + _NA.kfExpr(kf[k], shift, 1, 't') + (tf.sticker ? '-(' + (k === 'x' ? c.x : c.y) + ')' : '') + ')';
      var d = tf.sticker ? 0 : ((k === 'x' ? c.dx : c.dy) || 0);
      return d ? dim + '*(' + d + ')' : '0';
    }
    var x = axis('x', 'main_w'), y = axis('y', 'main_h');
    return (x === '0' && y === '0') ? '0:0' : "x='" + x + "':y='" + y + "'";
  }
  // Colour grades: each different grade is baked into a .cube file`, 'ffmpeg engine: shift helper');
rep(ee, `':v]overlay=0:0:enable=\\'between(t,'`, `':v]overlay=' + tfShift(t, sp) + ':enable=\\'between(t,'`, 'ffmpeg engine: moving titles and stickers');

/* ---------------- webcodecs-export.js (fast engine) ---------------- */
rep(wc, `  function drawWatermark(ctx, logoImg, canvasW, canvasH, corner) {`, `  // How far a sticker is moved from where its picture was drawn (fractions of the frame), when it is tracked.
  function stickerShift(st, tMs) {
    var s = st.s, kf = s && s.kf; if (!kf || !NA) return { x: 0, y: 0 };
    var rel = tMs - st.a;
    return { x: kf.x && kf.x.length ? NA.kfValue(kf.x, rel) - s.x : 0, y: kf.y && kf.y.length ? NA.kfValue(kf.y, rel) - s.y : 0 };
  }
  function drawWatermark(ctx, logoImg, canvasW, canvasH, corner) {`, 'fast engine: sticker shift');
rep(wc, `return { c: c, a: s.startMs, b: s.startMs + s.durMs }; });`, `return { c: c, a: s.startMs, b: s.startMs + s.durMs, s: s }; });`, 'fast engine: keep the sticker');
rep(wc, `for (var ks = 0; ks < stickers.length; ks++) if (tMs >= stickers[ks].a && tMs < stickers[ks].b) ctx.drawImage(stickers[ks].c, 0, 0);`,
  `for (var ks = 0; ks < stickers.length; ks++) if (tMs >= stickers[ks].a && tMs < stickers[ks].b) { var ssh = stickerShift(stickers[ks], tMs); ctx.drawImage(stickers[ks].c, ssh.x * W, ssh.y * H); }`, 'fast engine: moving stickers');
rep(wc, `for (var k = 0; k < titles.length; k++) if (tMs >= titles[k].a && tMs < titles[k].b) drawTitleAnim(titles[k], tMs);`,
  `for (var k = 0; k < titles.length; k++) if (tMs >= titles[k].a && tMs < titles[k].b) {
        var tsh = NA ? NA.shiftOf(titles[k].t, tMs - titles[k].a) : { x: 0, y: 0 };
        if (tsh.x || tsh.y) { ctx.save(); ctx.translate(tsh.x * W, tsh.y * H); drawTitleAnim(titles[k], tMs); ctx.restore(); } else drawTitleAnim(titles[k], tMs);
      }`, 'fast engine: moving titles');

/* ---------------- editor.js ---------------- */
rep(ed, `{ id: 'edTextFx', label: 'Effects', icon: G.fx, run: function (){ openPanel('textfx'); }, disabled: !isText },`,
  `{ id: 'edTextFx', label: 'Effects', icon: G.fx, run: function (){ openPanel('textfx'); }, disabled: !isText },\n        { id: 'edTextTrack', label: 'Track', icon: G.track, run: function (){ openPanel('track'); }, disabled: !isText },`, 'editor: Track button on texts');
rep(ed, `{ id: 'edStickerEdit', label: 'Edit', icon: G.pencil, run: function (){ openPanel('stickeredit'); }, disabled: !isS },`,
  `{ id: 'edStickerEdit', label: 'Edit', icon: G.pencil, run: function (){ openPanel('stickeredit'); }, disabled: !isS },\n        { id: 'edStickerTrack', label: 'Track', icon: G.track, run: function (){ openPanel('track'); }, disabled: !isS },`, 'editor: Track button on stickers');
// stickers: position follows keyframes (preview, drag, sliders, still)
rep(ed, `var cur = chipKey('stickeredit', keys, 'size'), ps = function (o){ return P.setStickerProps(E.hist.cur, c.id, o); };`,
  `var cur = chipKey('stickeredit', keys, 'size'), skv = function (k){ return (k === 'x' || k === 'y') ? NANIM.valueOf(c, 'sticker', k, relNow(c)) : c[k]; },
        ps = function (o){   // left / right and up / down go through the keyframes; size, turn and colour stay fixed
          var q = E.hist.cur, rest = {}, any = false;
          Object.keys(o).forEach(function (k){ if (k === 'x' || k === 'y') q = P.setAnimated(q, c.id, k, o[k], relNow(c)); else { rest[k] = o[k]; any = true; } });
          return any ? P.setStickerProps(q, c.id, rest) : q;
        };`, 'editor: sticker panel');
rep(ed, `1, Math.round(c[cur] * 100), pct,`, `1, Math.round(skv(cur) * 100), pct,`, 'editor: sticker position sliders');
rep(ed, `cx: c.x, cy: c.y, w: r.width || 1, h: r.height || 1, moved: false };`, `cx: NANIM.valueOf(c, 'sticker', 'x', relNow(c)), cy: NANIM.valueOf(c, 'sticker', 'y', relNow(c)), w: r.width || 1, h: r.height || 1, moved: false };`, 'editor: sticker drag start');
rep(ed, `function at(e){ return P.setStickerProps(E.hist.cur, id, { x: st.cx + (e.clientX - st.x0) / st.w, y: st.cy + (e.clientY - st.y0) / st.h }); }`,
  `function at(e){ var q = P.setAnimated(E.hist.cur, id, 'x', st.cx + (e.clientX - st.x0) / st.w, relNow(c)); return P.setAnimated(q, id, 'y', st.cy + (e.clientY - st.y0) / st.h, relNow(c)); }`, 'editor: sticker drag');
rep(ed, `d.style.left = (c.x * 100) + '%'; d.style.top = (c.y * 100) + '%'; d.style.fontSize = Math.round(c.size * H) + 'px';`,
  `d.style.left = (NANIM.valueOf(c, 'sticker', 'x', E.t - c.start) * 100) + '%'; d.style.top = (NANIM.valueOf(c, 'sticker', 'y', E.t - c.start) * 100) + '%'; d.style.fontSize = Math.round(c.size * H) + 'px';`, 'editor: sticker preview');
rep(ed, `try { NSTK.drawSticker(g, c, W, H); } catch (e) {}`,
  `try { NSTK.drawSticker(g, Object.assign({}, c, { x: NANIM.valueOf(c, 'sticker', 'x', E.t - c.start), y: NANIM.valueOf(c, 'sticker', 'y', E.t - c.start) }), W, H); } catch (e) {}`, 'editor: sticker in a saved still');
// texts: moved by their offset (preview and still)
rep(ed, `    Object.keys(E.textEls).forEach(function (id){ if (!want[id]){ E.textEls[id].remove(); delete E.textEls[id]; } });`,
  `    list.forEach(function (c){   // a tracked text is moved by its offset from the usual place
      var d = E.textEls[c.id], sh = NANIM ? NANIM.shiftOf(c, E.t - c.start) : null; if (!d || !sh || (!sh.x && !sh.y)) return;
      d.style.transform = 'translate(' + (sh.x * (layer.clientWidth || 320)) + 'px,' + (sh.y * (layer.clientHeight || 240)) + 'px) ' + (d.style.transform || '');
    });
    Object.keys(E.textEls).forEach(function (id){ if (!want[id]){ E.textEls[id].remove(); delete E.textEls[id]; } });`, 'editor: tracked text in the preview');
rep(ed, `try { LKs.drawTitle(g, c, W, H); } catch (e) {}`,
  `try { var sh0 = NANIM ? NANIM.shiftOf(c, E.t - c.start) : { x: 0, y: 0 }; g.save(); g.translate(sh0.x * W, sh0.y * H); LKs.drawTitle(g, c, W, H); g.restore(); } catch (e) {}`, 'editor: tracked text in a saved still');

// the Track tool itself: replaces the first version, from its heading to the next section
const START = `/* ---------- motion tracker: an overlay follows something in the picture ---------- */`, END = `/* ---------- titles drawn over the preview ---------- */`;
const i0 = ed.text.indexOf(START), i1 = ed.text.indexOf(END, i0), single = i0 >= 0 && ed.text.indexOf(START, i0 + 1) < 0 && i1 > i0;
if (!single) problems.push('editor: the first version of the Track tool was not found in one piece');
const BLOCK = `/* ---------- motion tracker: an overlay, sticker or text follows something in the picture ---------- */
  var NTK = (typeof module !== 'undefined' && module.exports) ? require('./tracker.js') : (typeof window !== 'undefined' ? window.NakiTracker : null);
  G.track = svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>');
  function trackNeed(){ if (NTK) return true; toast('The tracker is not loaded. Add <script src="tracker.js"></script> to index.html, before editor.js.'); return false; }
  // what the Track tool works on: the selected overlay (not a frame or spotlight), sticker or text
  function trackTarget(){
    var f = E.sel && P.findClip(E.proj, E.sel); if (!f) return null;
    var k = f.track.kind, c = f.clip;
    if (k === 'overlay') return (c.gen && c.gen.full) ? null : { c: c, kind: 'overlay' };
    if (k === 'sticker') return { c: c, kind: 'sticker' };
    if (k === 'text') return { c: c, kind: 'text' };
    return null;
  }
  // where the target sits now, as frame fractions: overlays and stickers by their centre; a text by the middle of its first line
  function trackHere(tg){
    var rel = relNow(tg.c);
    if (tg.kind === 'text'){ var sh = NANIM.shiftOf(tg.c, rel); return { x: 0.5 + sh.x, y: (NP.TEXT_POS[tg.c.pos] != null ? NP.TEXT_POS[tg.c.pos] : 0.76) + 0.06 + sh.y }; }
    return { x: NANIM.valueOf(tg.c, tg.kind, 'x', rel), y: NANIM.valueOf(tg.c, tg.kind, 'y', rel) };
  }
  function trackBegin(){
    var tg = trackTarget(); if (!tg) return null;
    if (!E.trk || E.trk.id !== tg.c.id){
      var s = trackHere(tg);
      E.trk = { id: tg.c.id, cx: clamp(s.x, 0.05, 0.95), cy: clamp(s.y, 0.05, 0.95), size: 0.12, mode: 'keep', running: false, cancelled: false, msg: '' };
    }
    return E.trk;
  }
  // The picture at timeline time t as the viewer sees it: which video file and where in it, and how a point of that video lands in the frame
  // (crop, flip, turn, zoom, pan and the bars around the picture, including a zoom that has keyframes). onlyAsset: null when it is another file.
  function trackInfoAt(t, onlyAsset){
    var s = P.sourceAt(E.proj, t), v = s.video, k = v && v.clip, fd = E.frameDims; if (!k || !fd || !fd.w || !fd.h) return null;
    var asset = k.asset || 'movie'; if (onlyAsset && asset !== onlyAsset) return null;
    var a = asset === 'movie' ? fd : E.proj.assets[asset], vw = a && (a.w || 0), vh = a && (a.h || 0); if (!vw || !vh) return null;
    var tf = NANIM.pictureTransform(k.transform, k.kf, t - k.start), fr = frameAspect(), fa = fr || fd.w / fd.h;
    var geo = NTK.makeGeo({ vw: vw, vh: vh, fa: fa, crop: k.crop || null, t: tf, boxPan: !!(k.crop || fr) });
    return { asset: asset, ms: Math.round(v.movieMs), geo: geo, toFrame: geo.toFrame };
  }
  // the square you drag onto what should be followed (only while the Track panel is open)
  function syncTrackBox(){
    var lay = E.ui.overlaylayer; if (!lay) return;
    var T = E.trk, tg = (E.panel === 'track' && E.isOpen) ? trackTarget() : null, bx = E.ui.trkbox;
    if (!tg || !T || T.id !== tg.c.id){ if (bx) bx.style.display = 'none'; return; }
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
    var T = E.trk, tg = trackTarget(), h = E.hooks;
    if (!trackNeed() || !T || !tg || T.running) return;
    var c = tg.c;
    if (!movieReady()){ toast('Choose the movie for this session first.'); return; }
    if (!E.frameDims || !E.frameDims.w){ toast('The movie is not ready yet. Try again in a moment.'); return; }
    if (E.t < c.start || E.t >= c.start + c.dur){ toast('Move the playhead onto it, at a moment where you can see what to follow.', 6000); return; }
    var ref = trackInfoAt(E.t, null);
    if (!ref){ toast('Move the playhead to a moment where a video shows (not a gap).', 6000); return; }
    var url = ref.asset === 'movie' ? (h.movieUrl && h.movieUrl()) : (h.videoUrl && h.videoUrl(ref.asset));
    if (!url){ toast('The video file for this part is not available here.', 6000); return; }
    // the times on this clip, and where in the same video file each one shows (null where another video, or a gap, is on screen: it keeps its last place)
    var rels = NTK.sampleTimes(c.dur), infos = rels.map(function (r){ return trackInfoAt(c.start + Math.min(r, c.dur - 1), ref.asset); }), lo = ref.ms, hi = ref.ms;
    infos.forEach(function (i){ if (i){ lo = Math.min(lo, i.ms); hi = Math.max(hi, i.ms); } });
    if (hi - lo < 200){ toast('There is not enough moving picture under this to follow anything.', 6000); return; }
    var pm = ref.geo.toMovie(T.cx, T.cy);
    if (pm.u < -0.02 || pm.u > 1.02 || pm.v < -0.02 || pm.v > 1.02){ toast('Drag the square onto the picture itself, not onto the bars or the cropped-away part.', 7000); return; }
    var box = { cx: clamp(pm.u, 0.02, 0.98), cy: clamp(pm.v, 0.02, 0.98), size: clamp(T.size / (ref.geo.k * ref.geo.vh), 0.04, 0.5) };
    var rp = ref.geo.toFrame(box.cx, box.cy), isText = tg.kind === 'text', keep = isText || T.mode === 'keep';
    var base = isText ? NANIM.shiftOf(c, relNow(c)) : trackHere(tg), key = c.start + '|' + c.dur, id = c.id;
    pause(); T.running = true; T.cancelled = false; T.msg = 'Starting...'; renderDock();
    function say(m){ T.msg = m; if (E.trkStatus) E.trkStatus.textContent = m; }
    NTK.analyze(url, { refMs: ref.ms, fromMs: lo, toMs: hi, box: box, onProgress: function (f){ say('Following... ' + Math.round(f * 100) + '%'); }, isCancelled: function (){ return T.cancelled; } }).then(function (res){
      T.running = false;
      var f = P.findClip(E.hist.cur, id);
      if (!f || (f.clip.start + '|' + f.clip.dur) !== key){ renderDock(); toast('It changed while tracking. Tap Start tracking again.', 7000); return; }
      var kf = NTK.toKeyframes(res.track, rels, infos, { keepMs: ref.ms, offX: keep ? base.x - rp.x : 0, offY: keep ? base.y - rp.y : 0, lo: isText ? -1 : 0, hi: 1 });
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
    var tg = trackTarget(), T = trackBegin();
    if (!tg || !T){ body.appendChild(mk('div', 'ed-hint', 'Tap an overlay, sticker or text on the timeline first.')); return; }
    var run = !!T.running, c = tg.c;
    if (tg.kind !== 'text') body.appendChild(chips([{ key: 'keep', label: 'Keep my offset' }, { key: 'center', label: 'Centre on it' }], T.mode, function (k){ T.mode = k; renderDock(); }));
    body.appendChild(sliderRow('Square size', 5, 30, 1, Math.round(T.size * 100), pct, function (v){ T.size = v / 100; syncTrackBox(); }, function (v){ T.size = v / 100; syncTrackBox(); }));
    var st = mk('div', 'ed-hint', run ? T.msg : 'Move the playhead to a moment where you can see what to follow. Drag the orange square onto it, then tap Start tracking.');
    E.trkStatus = st; body.appendChild(st);
    body.appendChild(actions(run
      ? [{ id: 'edTrackStop', label: 'Stop', run: function (){ T.cancelled = true; } }]
      : [{ id: 'edTrackGo', label: 'Start tracking', run: runTrack },
         { id: 'edTrackClear', label: 'Remove tracking', run: function (){
           var q = P.clearTrackedPath(E.hist.cur, c.id, relNow(c));
           if (q === E.hist.cur) toast('There is no tracking on this.'); else commit(q); } }]));
    body.appendChild(mk('div', 'ed-hint', 'It follows the part of the picture inside the square, from the start of this clip to its end (backwards and forwards from the playhead). Pick a part with an edge or a pattern, not a plain wall. Keep my offset keeps it where it is now, next to the thing; Centre on it puts it right on the thing (a text always keeps its place and moves by the same amount). It works through zoom, crop, turn and flip, and on a video you added: it follows the video that is under the playhead and holds still where another video shows. A tracked sticker or text moves only; its size and turn stay as they are. The result is ordinary keyframes, so you can fine-tune it, and Undo takes it back.'));
  } };

  `;
if (single) ed.text = ed.text.slice(0, i0) + BLOCK + ed.text.slice(i1);

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[ed, pj, an, pl, ee, wc].forEach(save);
console.log('Done.' + (notes.length ? '\n  ' + notes.join('\n  ') : '') + '\nNow run:  node tests/tracker.test.js   and   npm test');