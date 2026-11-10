'use strict';
// node tools/apply-gestures.js   (from the project folder)
// Batch 2: moving things directly on the picture.
//   text      drag anywhere, round handle to resize + turn, pinch to resize + turn      (new: clip.rot, size up to 30)
//   stickers  round handle to resize + turn, pinch, snap-to-centre guides while dragging
//   overlays  same as stickers
//   picture   pinch to zoom, two fingers to move, one finger to move once zoomed in, tap the bare picture to choose it
// Touches: anim.js (the maths), look.js (a turned title + where a title is), plan.js (rot in the plan), project.js (text rot / dx / dy / size),
// editor.js (the gesture layer and the Text panel). The export engines need NO change: a title is drawn by look.js in all of them.
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
const an = load('www/anim.js'), lk = load('www/look.js'), pl = load('www/plan.js'), pj = load('www/project.js'), ed = load('www/editor.js');
const fsx = require('fs'), pt = fsx.existsSync(path.join(root, 'tests/project.test.js')) ? load('tests/project.test.js') : null;
if (ed.text.includes('function stageDown(')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// =====================================================================================================================
// anim.js: the maths (pure, so the tests can run it without a screen)
// =====================================================================================================================
const ANIM_GESTURE = String.raw`// ---------- gestures: the maths behind dragging, resizing and turning things on the picture ----------
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
  var api = { OVERLAY: OVERLAY,`;
rep(an, 'var api = { OVERLAY: OVERLAY,', ANIM_GESTURE, 'anim: gesture maths');   // matches with or without indentation
rep(an, 'shiftOf: shiftOf };',
  'shiftOf: shiftOf,\n    wrapDeg: wrapDeg, snapTo: snapTo, snapRot: snapRot, pointInBox: pointInBox, handlePos: handlePos, scaleRotate: scaleRotate, pinch: pinch, panFor: panFor };', 'anim: exports');

// =====================================================================================================================
// look.js: a title can be turned (t.rot), and titleBox says where a title is
// =====================================================================================================================
const LOOK_TURN = String.raw`// ---------- a turned title, and where a title is ----------
  // A title can be turned: t.rot, degrees, -180 to 180, around the middle of its lines. That is the very point motion.js turns an animated title
  // around, so a turned title with an animation still looks right. Drawn here, so the preview and both export engines agree.
  function wrapDeg(a){ a = ((num(a)) % 360 + 360) % 360; return a > 180 ? a - 360 : a; }
  // Lays the text out the way both drawings do (wrapped to 88% of the width). Sets the font on g, so g.measureText works.
  function wrapTitle(g, t, W, H){
    var px = titleLook(t, H).px;
    g.font = (t.weight || 700) + ' ' + px + 'px ' + fontCss(t.font);
    var maxW = W * 0.88, lines = [], widest = 0;
    String(t.text || '').split('\n').forEach(function (par){
      var line = '';
      par.split(' ').forEach(function (w){
        var test = line ? line + ' ' + w : w;
        if (line && g.measureText(test).width > maxW){ lines.push(line); line = w; } else line = test;
      });
      lines.push(line);
    });
    lines.forEach(function (l){ widest = Math.max(widest, g.measureText(l).width); });
    return { px: px, lines: lines, lh: Math.round(px * 1.2), y0: Math.round((TITLE_POS[t.pos] != null ? TITLE_POS[t.pos] : TITLE_POS.bottom) * H), widest: widest };
  }
  var _measure = null;
  function measureCtx(px){
    if (_measure === null){ var cv = mkLayer(2, 2); _measure = (cv && cv.getContext) ? cv.getContext('2d') : false; }
    return _measure || { font: '', measureText: function (s){ return { width: String(s).length * px * 0.55 }; } };   // no canvas here: a fair guess
  }
  // The box a title fills before it is turned or moved: its centre, size and number of lines, in a W x H frame (pixels). g is optional.
  function titleBox(t, W, H, g){
    var px = titleLook(t, H).px, m = wrapTitle(g || measureCtx(px), t, W, H), n = Math.max(1, m.lines.length);
    return { cx: W / 2, cy: m.y0 + n * m.lh / 2, w: Math.min(W, m.widest + m.px * 0.8), h: n * m.lh + m.px * 0.4, px: m.px, lines: n };
  }
  // Draws a title onto a canvas context of W x H pixels: wrapped to 88% of the width, at the same heights as the preview. A turned title (t.rot)
  // is turned around the middle of its lines.
  function drawTitle(g, t, W, H){
    var rot = t && t.rot ? wrapDeg(t.rot) : 0;
    if (!rot) return drawTitlePlain(g, t, W, H);
    var m = wrapTitle(g, t, W, H), py = m.y0 + Math.max(1, m.lines.length) * m.lh / 2, lines;
    g.save(); g.translate(W / 2, py); g.rotate(rot * Math.PI / 180); g.translate(-W / 2, -py);
    lines = drawTitlePlain(g, t, W, H);
    g.restore();
    return lines;
  }
  // The drawing itself, not turned.
  function drawTitlePlain(g, t, W, H){
    if (hasTitleFx(t)) return drawStyledTitle(g, t, W, H);`;
rep(lk, "  // Draws a title onto a canvas context of W x H pixels: wrapped to 88% of the width, at the same heights as the preview.\n  function drawTitle(g, t, W, H){\n    if (hasTitleFx(t)) return drawStyledTitle(g, t, W, H);", '  ' + LOOK_TURN, 'look: turned title');
rep(lk, 'hasTitleFx: hasTitleFx, cleanStyle: cleanStyle, ART: ART, art: art, FX_KEYS: FX_KEYS };', 'hasTitleFx: hasTitleFx, cleanStyle: cleanStyle, ART: ART, art: art, FX_KEYS: FX_KEYS, titleBox: titleBox };', 'look: exports');

// =====================================================================================================================
// plan.js: the turn goes into the export plan (the offset dx / dy and the baked keyframes were already there)
// =====================================================================================================================
rep(pl, 'if (c.dx) tx.dx = c.dx; if (c.dy) tx.dy = c.dy;', 'if (c.rot) tx.rot = c.rot;\n          if (c.dx) tx.dx = c.dx; if (c.dy) tx.dy = c.dy;', 'plan: text turn');

// =====================================================================================================================
// project.js: a text clip can be turned, moved by hand (dx / dy), and made bigger than the slider used to allow
// =====================================================================================================================
rep(pj, 'clip.size = Math.max(3, Math.min(16, +clip.size || 7));',
  `clip.size = r3(Math.max(3, Math.min(30, +clip.size || 7)));   // 3 to 30 (% of the picture height): the slider stays at 16, a pinch can go further
  if (patch.rot !== undefined){ var rt = Math.round((+patch.rot || 0) * 10) / 10; rt = Math.round((((rt % 360) + 540) % 360 - 180) * 10) / 10; if (Math.abs(rt) >= 0.05) clip.rot = rt; else delete clip.rot; }   // turn, -180 to 180, not stored when 0
  ['dx', 'dy'].forEach(function (k){ if (patch[k] === undefined) return; var v = r3(Math.max(-1, Math.min(1, +patch[k] || 0))); if (v) clip[k] = v; else delete clip[k]; });   // moved by hand`, 'project: text turn / offset / size');
rep(pj, "if (kind === 'text'){ c[prop === 'x' ? 'dx' : 'dy'] = v; return; }", "if (kind === 'text'){ var tk = prop === 'x' ? 'dx' : 'dy'; if (v) c[tk] = v; else delete c[tk]; return; }   // a text put back on its usual line stores nothing", 'project: zero offset is not stored');

// =====================================================================================================================
// editor.js
// =====================================================================================================================
// ---- the layer and the listeners, built with the stage ----
rep(ed, 'u.stage.appendChild(u.croplayer);',
  `u.stage.appendChild(u.croplayer);
    // the gesture layer: the box and round handle of the chosen text / sticker / overlay, and the centre guides (see "moving things directly on the picture")
    u.handles = mk('div'); u.handles.style.cssText = 'position:absolute;pointer-events:none;z-index:9;overflow:visible'; u.stage.appendChild(u.handles);
    u.stage.style.touchAction = 'none';   // two fingers on the preview pinch and turn, they do not scroll or zoom the page
    u.stage.addEventListener('pointerdown', stageDown, true); u.stage.addEventListener('pointerdown', stageBare);`, 'editor: gesture layer');
rep(ed, 'E.ui.overlaylayer, E.ui.croplayer]; if (!boxes[0]) return;', 'E.ui.overlaylayer, E.ui.croplayer, E.ui.handles].filter(Boolean); if (!boxes[0]) return;', 'editor: layer is laid over the picture');
rep(ed, 'function layoutTextLayer(){ layoutTextLayerBase(); layoutPicture(); syncStickers(); syncOverlays(); drawCrop(); syncTrackBox(); }',
  'function layoutTextLayer(){ layoutTextLayerBase(); layoutPicture(); syncStickers(); syncOverlays(); drawCrop(); syncTrackBox(); syncHandles(); }', 'editor: layout');
rep(ed, 'syncStickers(); syncOverlays(); syncSfx(s);', 'syncStickers(); syncOverlays(); syncHandles(); syncSfx(s);', 'editor: sync every frame');

// ---- the gesture layer itself ----
const GESTURES = String.raw`// ---------- moving things directly on the picture ----------
  // One gesture layer over the preview, like CapCut:
  //   text       drag it anywhere (stored as an offset dx / dy from Top / Middle / Bottom, which every renderer already understands)
  //   text, stickers, overlays   the round handle on the box corner makes it bigger and turns it at once; two fingers pinch and twist the chosen one
  //   the picture   two fingers pinch to zoom (and move); one finger moves it once it is zoomed in; a tap on the bare picture chooses it
  // Each gesture shows its result live and leaves ONE undo step when the fingers lift. The maths is in anim.js (NakiAnim), which has tests.
  var GP = { pts: {}, n: 0, seq: 0, drag: null, pinch: null, lock: false };   // fingers on the preview, the one-finger action, the two-finger action
  var SIZE_RANGE = { text: [3, 30], sticker: [0.04, 0.9], overlay: [0.05, 1.5] };
  function gpOn(){ return !!(E.isOpen && !E.cropOn && !E.eye && E.panel !== 'track'); }
  function frameSize(){ var l = E.ui.handles; return { W: (l && l.clientWidth) || 320, H: (l && l.clientHeight) || 240 }; }
  // What a gesture works on: the chosen text, sticker or overlay (if it shows right now), or the chosen picture clip.
  function gestureTarget(){
    var f = (E.sel && E.proj && E.proj.tracks) ? P.findClip(E.proj, E.sel) : null; if (!f || f.track.hidden) return null;
    var c = f.clip, k = f.track.kind;
    if (E.t < c.start || E.t >= c.start + c.dur) return null;
    if (k === 'text' || k === 'sticker') return { kind: k, clip: c };
    if (k === 'overlay') return (c.gen && c.gen.full) ? null : { kind: 'overlay', clip: c };
    if (k === 'video' && f.track.role === 'movie' && (c.type === 'video' || c.type === 'freeze')) return { kind: 'picture', clip: c };
    return null;
  }
  function pictureTarget(){
    var s = (E.proj && E.proj.tracks) ? P.sourceAt(E.proj, E.t) : null, vc = s && s.video && s.video.clip;
    return (vc && (vc.type === 'video' || vc.type === 'freeze')) ? { kind: 'picture', clip: vc } : null;
  }
  function shapeOf(tg){   // how big and how turned it is now
    var c = tg.clip;
    if (tg.kind === 'overlay'){ var s = NANIM.overlayState(c, relNow(c)); return { size: s.size, rot: s.rot }; }
    return { size: c.size || (tg.kind === 'text' ? 7 : 0.2), rot: c.rot || 0 };
  }
  // The box a thing fills on the preview, before the pixel size of the frame is taken into account: { cx, cy, w, h, rot } in pixels of the gesture layer.
  function boxOf(tg, W, H){
    var c = tg.clip, rel = E.t - c.start, el, s;
    if (tg.kind === 'text'){
      var b = lookLib().titleBox(c, W, H), sh = NANIM.shiftOf(c, rel);
      return { cx: b.cx + sh.x * W, cy: b.cy + sh.y * H, w: b.w, h: b.h, rot: c.rot || 0 };
    }
    if (tg.kind === 'sticker'){
      el = E.stickerEls && E.stickerEls[c.id]; if (!el) return null;
      return { cx: NANIM.valueOf(c, 'sticker', 'x', rel) * W, cy: NANIM.valueOf(c, 'sticker', 'y', rel) * H, w: el.offsetWidth, h: el.offsetHeight, rot: c.rot || 0 };
    }
    el = E.overlayEls && E.overlayEls[c.id]; if (!el) return null; el = el._cv || el; s = NANIM.overlayState(c, rel);
    return { cx: s.x * W, cy: s.y * H, w: el.offsetWidth, h: el.offsetHeight, rot: s.rot };
  }
  // The new size and turn of a text / sticker / overlay, as a changed project. Text and sticker turns are fixed values; an overlay's size and turn can have keyframes.
  function setShape(tg, size, rot, base){
    var c = tg.clip, rg = SIZE_RANGE[tg.kind], z = Math.max(rg[0], Math.min(rg[1], size)), r = NANIM.wrapDeg(rot), rel = relNow(c), q;
    if (tg.kind === 'text') return P.setTextProps(base, c.id, { size: Math.round(z * 10) / 10, rot: r });
    if (tg.kind === 'sticker') return P.setStickerProps(base, c.id, { size: z, rot: r });
    q = P.setAnimated(base, c.id, 'size', z, rel); return P.setAnimated(q, c.id, 'rot', r, rel);
  }
  // The centre guides: a thin line shows while something sits exactly in the middle of the frame.
  function guide(axis, on){
    var lay = E.ui.handles; if (!lay) return;
    var key = axis === 'x' ? 'gv' : 'gh', el = E.ui[key];
    if (!el){
      el = E.ui[key] = mk('i');
      el.style.cssText = 'position:absolute;background:#ff9f1c;pointer-events:none;display:none;' + (axis === 'x' ? 'left:50%;top:0;bottom:0;width:1px' : 'top:50%;left:0;right:0;height:1px');
      lay.appendChild(el);
    }
    el.style.display = on ? 'block' : 'none';
  }
  function gSnap(v, axis){ var s = NANIM.snapTo(v, [0.5], 0.012); guide(axis, s.hit); return s.v; }
  // The box and the round handle around the chosen text / sticker / overlay (not while playing, not in crop or tracking).
  function syncHandles(){
    var lay = E.ui && E.ui.handles; if (!lay || !E.proj || !E.proj.tracks) return;
    var tg = (gpOn() && !E.playing) ? gestureTarget() : null, fs = frameSize(), bx = (tg && tg.kind !== 'picture') ? boxOf(tg, fs.W, fs.H) : null, el = E.ui.hbox;
    if (!bx || !(bx.w > 0) || !(bx.h > 0)){ if (el) el.style.display = 'none'; return; }
    if (!el){
      el = E.ui.hbox = mk('div');
      el.style.cssText = 'position:absolute;box-sizing:border-box;border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.55);pointer-events:none';
      var hd = E.ui.hhandle = mk('i');
      hd.style.cssText = 'position:absolute;right:-16px;bottom:-16px;width:32px;height:32px;box-sizing:border-box;border-radius:50%;background:#ff9f1c;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);pointer-events:auto;touch-action:none;cursor:nwse-resize';
      hd.setAttribute('aria-label', 'Drag to resize and turn'); hd.addEventListener('pointerdown', handleDown);
      el.appendChild(hd); lay.appendChild(el);
    }
    el.style.display = 'block'; el.style.left = (bx.cx - bx.w / 2 - 4) + 'px'; el.style.top = (bx.cy - bx.h / 2 - 4) + 'px';
    el.style.width = (bx.w + 8) + 'px'; el.style.height = (bx.h + 8) + 'px'; el.style.transform = 'rotate(' + bx.rot + 'deg)';
  }
  // The round handle: drag it away from the middle to make the thing bigger, around the middle to turn it.
  function handleDown(ev){
    var tg = gestureTarget(), lay = E.ui.handles; if (!tg || tg.kind === 'picture' || !lay) return;
    ev.preventDefault(); ev.stopPropagation();
    var fs = frameSize(), bx = boxOf(tg, fs.W, fs.H); if (!bx) return;
    var r = lay.getBoundingClientRect(), cen = { x: r.left + bx.cx, y: r.top + bx.cy }, p0 = { x: ev.clientX, y: ev.clientY }, sh0 = shapeOf(tg), st = { moved: false };
    function at(e){ var k = NANIM.scaleRotate(cen, p0, { x: e.clientX, y: e.clientY }); return setShape(tg, sh0.size * k.scale, NANIM.snapRot(sh0.rot + k.dRot).rot, E.hist.cur); }
    GP.drag = { id: ev.pointerId,
      move: function (e){ st.moved = true; live(at(e)); },
      up: function (e, cancelled){ if (!st.moved) return; if (cancelled) live(E.hist.cur); else commit(at(e)); } };
  }
  // The text (if any) under a point of the screen, the one on top first.
  function textHit(x, y){
    var lay = E.ui.handles; if (!lay || !E.proj || !E.proj.tracks) return null;
    var fs = frameSize(), r = lay.getBoundingClientRect(), list = P.textsAt(E.proj, E.t);
    for (var i = list.length - 1; i >= 0; i--){
      var c = list[i]; if (!String(c.text || '').trim()) continue;
      var bx = boxOf({ kind: 'text', clip: c }, fs.W, fs.H);
      if (bx && NANIM.pointInBox(x - r.left, y - r.top, bx, 8)) return c;
    }
    return null;
  }
  // Drag a text anywhere. It snaps to the middle of the frame, and keeps a keyframe when the text already moves over time.
  function beginTextDrag(c, ev){
    var id = c.id, fs = frameSize(), rel = relNow(c), sh0 = NANIM.shiftOf(c, rel), bb = lookLib().titleBox(c, fs.W, fs.H), x0 = ev.clientX, y0 = ev.clientY, st = { moved: false };
    var tx = (fs.W / 2 - bb.cx) / fs.W, ty = (fs.H / 2 - bb.cy) / fs.H;
    if (E.sel !== id){ E.sel = id; renderTimeline(); syncDock(); }
    function at(e){
      var sx = NANIM.snapTo(sh0.x + (e.clientX - x0) / fs.W, [tx], 6 / fs.W), sy = NANIM.snapTo(sh0.y + (e.clientY - y0) / fs.H, [ty], 6 / fs.H);
      guide('x', sx.hit); guide('y', sy.hit);
      return P.setAnimated(P.setAnimated(E.hist.cur, id, 'x', sx.v, rel), id, 'y', sy.v, rel);
    }
    GP.drag = { id: ev.pointerId,
      move: function (e){ if (!st.moved && Math.sqrt(Math.pow(e.clientX - x0, 2) + Math.pow(e.clientY - y0, 2)) < 3) return; st.moved = true; live(at(e)); },
      up: function (e, cancelled){ if (!st.moved) return; if (cancelled) live(E.hist.cur); else commit(at(e)); } };
  }
  // A finger lands on the picture area. This runs first (capture), before the sticker, overlay or handle that was touched gets it.
  function stageDown(ev){
    if (!gpOn() || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    if (!GP.n){
      GP.drag = null; GP.pinch = null; GP.lock = false;
      window.addEventListener('pointermove', gpMove); window.addEventListener('pointerup', gpUp); window.addEventListener('pointercancel', gpUp);
    }
    GP.pts[ev.pointerId] = { x: ev.clientX, y: ev.clientY }; GP.n = Object.keys(GP.pts).length;
    if (GP.n >= 2){   // a second finger: pinch and turn the chosen thing, if there is one
      if (!GP.pinch && !GP.lock) beginPinch();
      if (GP.pinch){ ev.preventDefault(); ev.stopPropagation(); } else GP.lock = true;
      return;
    }
    if (ev.target === E.ui.hhandle) return;   // the round handle has its own listener
    var hit = textHit(ev.clientX, ev.clientY);
    if (hit){ ev.preventDefault(); ev.stopPropagation(); beginTextDrag(hit, ev); }
  }
  // A finger on the bare picture (nothing else took it): move the picture if it is chosen, choose it if it is not.
  function stageBare(ev){
    if (!gpOn() || GP.n !== 1 || GP.lock || GP.drag) return;
    var pt = pictureTarget(); if (!pt) return;
    ev.preventDefault();
    var fs = frameSize(), c = pt.clip, wasSel = E.sel === c.id, rel = relNow(c), x0 = ev.clientX, y0 = ev.clientY, st = { moved: false }, t0 = NANIM.pictureTransform(c.transform, c.kf, rel);
    function at(e){
      var pan = NANIM.panFor(t0, t0.zoom, e.clientX - x0, e.clientY - y0, fs.W, fs.H);
      return P.setAnimated(P.setAnimated(E.hist.cur, c.id, 'x', pan.x, rel), c.id, 'y', pan.y, rel);
    }
    GP.drag = { id: ev.pointerId,
      move: function (e){
        if (!wasSel || !(t0.zoom > 1)) return;
        if (!st.moved && Math.sqrt(Math.pow(e.clientX - x0, 2) + Math.pow(e.clientY - y0, 2)) < 4) return;
        st.moved = true; live(at(e));
      },
      up: function (e, cancelled){ if (st.moved){ if (cancelled) live(E.hist.cur); else commit(at(e)); } else if (!cancelled && !wasSel) select(c.id); } };
  }
  function beginPinch(){
    var ids = Object.keys(GP.pts); if (ids.length < 2) return false;
    var tg = gestureTarget() || (!E.sel ? pictureTarget() : null); if (!tg) return false;
    GP.seq++; GP.drag = null; if (E.proj !== E.hist.cur) live(E.hist.cur);   // whatever the first finger was doing is dropped
    var c = tg.clip, rel = relNow(c), pn = { tg: tg, ids: [ids[0], ids[1]], a0: { x: GP.pts[ids[0]].x, y: GP.pts[ids[0]].y }, b0: { x: GP.pts[ids[1]].x, y: GP.pts[ids[1]].y }, rel: rel, fs: frameSize(), moved: false };
    if (tg.kind === 'picture') pn.t0 = NANIM.pictureTransform(c.transform, c.kf, rel); else pn.sh0 = shapeOf(tg);
    GP.pinch = pn; return true;
  }
  // The project with the pinch applied to what it was when the second finger landed.
  function pinchAt(){
    var pn = GP.pinch, a1 = GP.pts[pn.ids[0]], b1 = GP.pts[pn.ids[1]]; if (!a1 || !b1) return E.hist.cur;
    var k = NANIM.pinch(pn.a0, pn.b0, a1, b1), c = pn.tg.clip, q;
    if (pn.tg.kind === 'picture'){   // zoom (the picture only turns in quarter turns, so the twist is not used) and move
      var z = Math.max(1, Math.min(4, pn.t0.zoom * k.scale));
      q = P.setAnimated(E.hist.cur, c.id, 'zoom', z, pn.rel);
      if (z > 1){ var pan = NANIM.panFor(pn.t0, z, k.dx, k.dy, pn.fs.W, pn.fs.H); q = P.setAnimated(P.setAnimated(q, c.id, 'x', pan.x, pn.rel), c.id, 'y', pan.y, pn.rel); }
      return q;
    }
    return setShape(pn.tg, pn.sh0.size * k.scale, NANIM.snapRot(pn.sh0.rot + k.dRot).rot, E.hist.cur);
  }
  function gpMove(e){
    var pt = GP.pts[e.pointerId]; if (!pt) return;
    pt.x = e.clientX; pt.y = e.clientY;
    if (GP.pinch){ GP.pinch.moved = true; live(pinchAt()); return; }
    if (GP.drag && GP.drag.id === e.pointerId && !GP.lock) GP.drag.move(e);
  }
  function gpUp(e){
    var pt = GP.pts[e.pointerId]; if (!pt) return;
    var cancelled = e.type === 'pointercancel'; pt.x = e.clientX; pt.y = e.clientY;
    if (GP.pinch && GP.pinch.ids.indexOf(String(e.pointerId)) >= 0){
      var q = (GP.pinch.moved && !cancelled) ? pinchAt() : null; GP.pinch = null; GP.lock = true;
      if (q) commit(q); else if (E.proj !== E.hist.cur) live(E.hist.cur);
    } else if (GP.drag && GP.drag.id === e.pointerId){ var d = GP.drag; GP.drag = null; d.up(e, cancelled); }
    delete GP.pts[e.pointerId]; GP.n = Object.keys(GP.pts).length;
    if (!GP.n){
      window.removeEventListener('pointermove', gpMove); window.removeEventListener('pointerup', gpUp); window.removeEventListener('pointercancel', gpUp);
      GP.drag = null; GP.pinch = null; GP.lock = false; guide('x', false); guide('y', false);
    }
  }

  // ---------- zoom and position ----------`;
rep(ed, '// ---------- zoom and position ----------', GESTURES, 'editor: gesture layer code');

// ---- the old one-finger drags of stickers and overlays: snap to the middle, and step aside when two fingers start a pinch ----
rep(ed,
  `    function at(e){ var q = P.setAnimated(E.hist.cur, id, 'x', st.cx + (e.clientX - st.x0) / st.w, relNow(c)); return P.setAnimated(q, id, 'y', st.cy + (e.clientY - st.y0) / st.h, relNow(c)); }
    function mv(e){ st.moved = true; live(at(e)); }
    function up(e){
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (st.moved) commit(at(e));
    }`,
  `    var seq0 = GP.seq;   // a pinch starting meanwhile takes over, this drag then does nothing more
    function at(e){ var q = P.setAnimated(E.hist.cur, id, 'x', gSnap(st.cx + (e.clientX - st.x0) / st.w, 'x'), relNow(c)); return P.setAnimated(q, id, 'y', gSnap(st.cy + (e.clientY - st.y0) / st.h, 'y'), relNow(c)); }
    function mv(e){ if (GP.seq !== seq0) return; st.moved = true; live(at(e)); }
    function up(e){
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (st.moved && GP.seq === seq0) commit(at(e));
    }`, 'editor: sticker drag');
rep(ed,
  `    function at(e){
      var q = P.setAnimated(E.hist.cur, id, 'x', s0.x + (e.clientX - st.x0) / st.w, relNow(c));
      return P.setAnimated(q, id, 'y', s0.y + (e.clientY - st.y0) / st.h, relNow(c));
    }
    function mv(e){ st.moved = true; live(at(e)); }
    function up(e){
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (st.moved) commit(at(e));
    }`,
  `    var seq0 = GP.seq;   // a pinch starting meanwhile takes over, this drag then does nothing more
    function at(e){
      var q = P.setAnimated(E.hist.cur, id, 'x', gSnap(s0.x + (e.clientX - st.x0) / st.w, 'x'), relNow(c));
      return P.setAnimated(q, id, 'y', gSnap(s0.y + (e.clientY - st.y0) / st.h, 'y'), relNow(c));
    }
    function mv(e){ if (GP.seq !== seq0) return; st.moved = true; live(at(e)); }
    function up(e){
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (st.moved && GP.seq === seq0) commit(at(e));
    }`, 'editor: overlay drag');

// ---- the title in the preview: turn, and the canvas redraw when it changes ----
rep(ed,
  `        d.style.transform = 'translate(' + (an.dx * LW) + 'px,' + (an.dy * LH) + 'px) rotate(' + an.rot + 'deg) scale(' + an.scale + ')';
      } else { if (d.style.transform) d.style.transform = ''; if (d.style.opacity) d.style.opacity = ''; }`,
  `        d.style.transform = 'translate(' + (an.dx * LW) + 'px,' + (an.dy * LH) + 'px) rotate(' + an.rot + 'deg) scale(' + an.scale + ')' + (c.rot ? ' rotate(' + c.rot + 'deg)' : '');
      } else { var trn = c.rot ? 'rotate(' + c.rot + 'deg)' : ''; if (d.style.transform !== trn) d.style.transform = trn; if (d.style.opacity) d.style.opacity = ''; }`, 'editor: turned title in the preview');
rep(ed, 'c.glow, c.bubble, c.extrude, cw, ch]);', 'c.glow, c.bubble, c.extrude, c.rot, cw, ch]);', 'editor: styled title redraws when turned');

// ---- the Text panel: Turn, a bigger Size range, and Position puts the title back where it belongs ----
rep(ed, "{ key: 'size', label: 'Size' }, { key: 'pos', label: 'Position' }, { key: 'color', label: 'Colour' }, { key: 'bg', label: 'Dark box' },",
  "{ key: 'size', label: 'Size' }, { key: 'pos', label: 'Position' }, { key: 'rot', label: 'Turn' }, { key: 'color', label: 'Colour' }, { key: 'bg', label: 'Dark box' },", 'editor: Turn chip');
rep(ed, "sliderRow('Size', 3, 16, 1, c.size || 7,", "sliderRow('Size', 3, 30, 1, Math.round(c.size || 7),", 'editor: bigger size range');
rep(ed, "else if (cur === 'pos') body.appendChild(chips([{ key: 'top', label: 'Top' }, { key: 'center', label: 'Middle' }, { key: 'bottom', label: 'Bottom' }], c.pos, function (k){ commit(pt({ pos: k })); }));",
  `else if (cur === 'rot') body.appendChild(sliderRow('Turn', -180, 180, 5, Math.round(c.rot || 0), function (v){ return v + '\\u00b0'; }, function (v){ live(pt({ rot: v })); }, function (v){ commit(pt({ rot: v })); }));
      else if (cur === 'pos'){
        body.appendChild(chips([{ key: 'top', label: 'Top' }, { key: 'center', label: 'Middle' }, { key: 'bottom', label: 'Bottom' }], (c.dx || c.dy) ? '' : c.pos, function (k){ commit(pt({ pos: k, dx: 0, dy: 0 })); }));
        body.appendChild(mk('div', 'ed-hint', 'Or drag the text anywhere on the picture. Tap Top, Middle or Bottom to put it back.'));
      }`, 'editor: Position and Turn panels');


// ---- tests/project.test.js: a text can now be up to 30 in size, so the old "kept within range" check (size 40 -> 16) becomes 40 -> 30 ----
if (pt) rep(pt, "assert.strictEqual(c.size, 16, 'size is kept within range');", "assert.strictEqual(c.size, 30, 'size is kept within range');", 'project test: text size limit');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[an, lk, pl, pj, ed].concat(pt ? [pt] : []).forEach(save);
console.log('Done.\nNow run:  node tests/gestures.test.js   and then   npm test');
console.log('A text can now be up to 30 in size (it was 16); the check for that in tests/project.test.js was updated.');
console.log('Version tags were left alone (index.html checks them). Bump the service worker cache name the way you usually do, so phones pick up the new editor.js.');