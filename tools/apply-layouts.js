'use strict';
// node tools/apply-layouts.js   (from the project folder)
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
if (!fs.existsSync(path.join(root, 'www', 'layout.js'))) { console.log('NOTHING WAS CHANGED. Put layout.js in the www folder first.'); process.exit(1); }
const ed = load('www/editor.js'), css = load('www/editor.css'), html = load('www/index.html'), pr = load('www/project.js'),
  pl = load('www/plan.js'), ex = load('www/export-engine.js'), wc = load('www/webcodecs-export.js');
if (ed.text.includes('function addLayoutHere')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

/* ---------- project.js: the layout row ---------- */
rep(pr, `var _idn = 0;`, `var _LY = (typeof module !== 'undefined' && module.exports) ? require('./layout.js') : (typeof window !== 'undefined' ? window.NakiLayout : null);\nvar _idn = 0;`, 'project: load layout.js');
rep(pr, `t.role !== 'sfx' && t.kind !== 'fx')`, `t.role !== 'sfx' && t.kind !== 'fx' && t.kind !== 'layout')`, 'project: an empty layout row goes away');
rep(pr, `tr.kind === 'sticker' || tr.kind === 'fx'){`, `tr.kind === 'sticker' || tr.kind === 'fx' || tr.kind === 'layout'){`, 'project: holding a picture moves layouts');
rep(pr, `tr.kind === 'overlay' || tr.kind === 'fx') return tr.kind;`, `tr.kind === 'overlay' || tr.kind === 'fx' || tr.kind === 'layout') return tr.kind;`, 'project: layouts can change rows');
rep(pr, `fx: 't-vfx', sfx: 't-fx', text: 't-text' }[fam]`, `fx: 't-vfx', layout: 't-lay', sfx: 't-fx', text: 't-text' }[fam]`, 'project: new layout row id');
rep(pr, `// ---------- rows (layers): moving a clip to another row, or onto a row of its own ----------`,
`// ---------- layouts: mirror and split screen over a stretch of time ----------
// A layout is a clip on a "layout" row: clip.layout = { preset, gap, color, zoom } (see layout.js). It re-draws the picture as mirrored halves or as a grid of
// copies for as long as it lasts. Layouts that overlap in time go on separate rows (the top one is used).
function addLayout(p, t, key, out){
  var total = p.durationMs; if (!_LY || !(total > 0)) return p;
  var L = _LY.clean({ preset: key }); if (!L) return p;
  var start = Math.max(0, Math.min(Math.round(t), total - 300)), d = Math.min(4000, total - start); if (d < 300) return p;
  var q = cloneProject(p), rows = q.tracks.filter(function (x){ return x.kind === 'layout'; }), tr = null;
  for (var i = 0; i < rows.length && !tr; i++) if (!rows[i].clips.some(function (c){ return start < clipEnd(c) && start + d > c.start; })) tr = rows[i];
  if (!tr){
    var k = 1; while (q.tracks.some(function (x){ return x.id === 't-lay' + k; })) k++;
    tr = { id: 't-lay' + k, kind: 'layout', role: 'layout', muted: false, hidden: false, volume: 1, locked: false, clips: [] }; q.tracks.push(tr);
  }
  var clip = { id: newId('c'), type: 'text', asset: null, start: start, dur: d, in: 0, speed: 1, layout: L };
  tr.clips.push(clip); if (out) out.id = clip.id;
  return finish(q);
}
// patch = { preset, gap, color, zoom }; only what is mentioned changes.
function setLayoutProps(p, id, patch){
  var q = cloneProject(p), f = findClip(q, id); if (!f || !f.clip.layout || !_LY) return p;
  var L = _LY.clean(Object.assign({}, f.clip.layout, patch || {})); if (!L) return p;
  f.clip.layout = L;
  return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) ? p : finish(q);
}
function layoutsAt(p, t){
  var out = [];
  p.tracks.forEach(function (tr){ if (tr.kind !== 'layout' || tr.hidden) return; tr.clips.forEach(function (c){ if (c.layout && c.start <= t && t < clipEnd(c)) out.push({ layout: c.layout, start: c.start, dur: c.dur }); }); });
  return out;
}

// ---------- rows (layers): moving a clip to another row, or onto a row of its own ----------`, 'project: layout functions');
rep(pr, `removeSilences: removeSilences };`, `removeSilences: removeSilences, addLayout: addLayout, setLayoutProps: setLayoutProps, layoutsAt: layoutsAt };`, 'project: exports');

/* ---------- plan.js ---------- */
rep(pl, `if (fx.length) plan.fx = fx;`,
`var layouts = [];
    p.tracks.forEach(function (tr) {
      if (tr.kind !== 'layout' || tr.hidden) return;
      tr.clips.forEach(function (c) {
        var s = Math.max(0, Math.round(c.start)), e = Math.min(total, Math.round(c.start + c.dur));
        if (c.layout && e > s) layouts.push({ startMs: s, durMs: e - s, layout: JSON.parse(JSON.stringify(c.layout)) });
      });
    });
    layouts.sort(function (a, b) { return a.startMs - b.startMs; });
    if (fx.length) plan.fx = fx;
    if (layouts.length) plan.layouts = layouts;`, 'plan: layouts');

/* ---------- export-engine.js (compatible engine) ---------- */
rep(ex, `var GAIN_HZ = 1000;`, `var GAIN_HZ = 1000;\nvar _LY = (typeof module !== 'undefined' && module.exports) ? require('./layout.js') : (typeof window !== 'undefined' ? window.NakiLayout : null);`, 'export-engine: load layout.js');
rep(ex, `var fxList = plan.fx || [];`, `var fxList = plan.fx || [], layoutList = plan.layouts || [];`, 'export-engine: layout list');
rep(ex, `if (!isGraph && !ovs.length && !fxs.length && !wm`,
  `var lys = _LY ? layoutList.filter(function (x) { return x.startMs < sp.sessionEnd && x.startMs + x.durMs > sp.sessionStart; }) : [];
    if (!isGraph && !ovs.length && !fxs.length && !lys.length && !wm`, 'export-engine: layouts need the long chain');
rep(ex, `ovs.forEach(function (o) {`,
  `lys.forEach(function (ly) {   // a layout: the picture drawn as mirrored halves or a grid of copies
      var a0 = Math.max(0, (ly.startMs - sp.sessionStart) / 1000), b0 = (Math.min(sp.sessionEnd, ly.startMs + ly.durMs) - sp.sessionStart) / 1000, out = 'v' + (++n);
      fc.push(_LY.graph(ly.layout, a0, b0, cur, out, width, height)); cur = out;
    });
    ovs.forEach(function (o) {`, 'export-engine: apply layouts');

/* ---------- webcodecs-export.js (fast engine) ---------- */
rep(wc, `var NAVY = '#111b24';`, `var NLY = (typeof module !== 'undefined' && module.exports) ? require('./layout.js') : (typeof window !== 'undefined' ? window.NakiLayout : null);\n  var NAVY = '#111b24';`, 'webcodecs: load layout.js');
rep(wc, `function compose(sp, tMs) {`,
  `var fcv = null;
    // a layout: what is on the canvas so far (picture and fade) is copied, then drawn again as mirrored halves or a grid
    function drawLayout(tMs) {
      var list = plan.layouts; if (!list || !list.length || !NLY) return;
      var ly = null; for (var q = 0; q < list.length; q++) if (tMs >= list[q].startMs && tMs < list[q].startMs + list[q].durMs) ly = list[q];
      if (!ly) return;
      if (!fcv) fcv = makeCanvas(W, H);
      var fg = fcv.getContext('2d'); fg.globalCompositeOperation = 'source-over'; fg.globalAlpha = 1; fg.drawImage(canvas, 0, 0);
      NLY.draw(ctx, ly.layout, W, H, fcv);
    }
    function compose(sp, tMs) {`, 'webcodecs: layout helper');
rep(wc, `drawOverlays(tMs);`, `drawLayout(tMs);\n      drawOverlays(tMs);`, 'webcodecs: apply layouts before overlays');

/* ---------- editor.js ---------- */
rep(ed, `fx: 'Video effects' };`, `fx: 'Video effects', layout: 'Layout' };`, 'editor: row name');
rep(ed, `tr.kind === 'sticker' || tr.kind === 'fx') ? 30 : 44`, `tr.kind === 'sticker' || tr.kind === 'fx' || tr.kind === 'layout') ? 30 : 44`, 'editor: row height');
rep(ed, `if (c.gen && NFX && NFX.gen) return NFX.gen.label(c.gen);`, `if (c.gen && NFX && NFX.gen) return NFX.gen.label(c.gen);\n    if (c.layout && NLY) return 'Layout \\u00b7 ' + NLY.label(c.layout.preset);`, 'editor: clip title');
rep(ed, `go: function (){ openTool('fx'); } }`, `go: function (){ openTool('fx'); } },\n    { name: 'layout', label: 'Layout', icon: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18"/>'), go: function (){ openTool('layout'); } }`, 'editor: Layout button in the toolbar');
rep(ed, `u.picframe.appendChild(u.tint2);`, `u.layoutcv = mk('canvas', 'ed-layoutcv'); u.picframe.appendChild(u.layoutcv); u.picframe.appendChild(u.tint2);`, 'editor: layout canvas over the picture');
rep(ed, `f.track.kind === 'fx' ? 'fx' : 'audio'`, `f.track.kind === 'fx' ? 'fx' : f.track.kind === 'layout' ? 'layout' : 'audio'`, 'editor: tapping a layout clip opens its tools');
rep(ed, `syncStickers(); syncOverlays(); syncSfx(s); syncFx(); syncTransition(m, s, vc);`, `syncStickers(); syncOverlays(); syncSfx(s); syncFx(); syncTransition(m, s, vc); syncLayout(m, vc, css);`, 'editor: draw layouts in the preview');
rep(ed, `E.xOn = false; try { E.ui.xvid.pause();`, `E.layoutOn = false; try { E.ui.layoutcv.style.display = 'none'; } catch (e) {}\n    E.xOn = false; try { E.ui.xvid.pause();`, 'editor: hide the layout when closing');
rep(ed, `E.curAsset = 'movie'; E.swapping = false; E.skipMsg = false;`, `E.curAsset = 'movie'; E.swapping = false; E.skipMsg = false; E.layoutOn = false;`, 'editor: reset on open', true);

const BLOCK = `/* ---------- layouts: mirror and split screen ---------- */
  var NLY = (typeof module !== 'undefined' && module.exports) ? require('./layout.js') : (typeof window !== 'undefined' ? window.NakiLayout : null);
  G.layout = svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18"/>');
  function layoutNeed(){ if (NLY) return true; toast('Layouts are not loaded. Add <script src="layout.js"></script> to index.html, before project.js.'); return false; }
  function selLayout(){ var f = E.sel && P.findClip(E.proj, E.sel); return f && f.track.kind === 'layout' ? f.clip : null; }
  function addLayoutHere(key){
    if (!layoutNeed()) return;
    var out = {}, q = P.addLayout(E.hist.cur, Math.round(E.t), key, out);
    if (q === E.hist.cur){ toast('There is no room for a layout at the playhead.'); return; }
    E.sel = out.id; commit(q); openPanel('layoutedit', 'layout');
  }
  // What the picture looks like in the frame right now (its zoom / turn / flip, on the frame's background), drawn on a canvas the size of the frame.
  function previewFrame(g, m, vc, W, H){
    var f = E.proj.format, bgc = '#111b24';
    try { if (frameAspect() && NF && f) bgc = NF.fillColor(NF.normalizeBg(f.bg)); } catch (e) {}
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = bgc; g.fillRect(0, 0, W, H);
    var vw = m.videoWidth, vh = m.videoHeight; if (!vw || !vh || m.readyState < 2) return;
    var t = vc.transform; if (vc.kf && NANIM) t = NANIM.pictureTransform(vc.transform, vc.kf, E.t - vc.start);
    g.save();
    if (frameAspect() && NF && NF.containLayout){
      var L = NF.containLayout(t, W, H, vw, vh), b = L.box;
      g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip();
      g.translate(b.x + b.w / 2 + L.panX, b.y + b.h / 2 + L.panY); g.scale(L.zoom, L.zoom); g.rotate(L.rot * Math.PI / 180); if (L.flip) g.scale(-1, 1);
      g.drawImage(m, -L.dw / 2, -L.dh / 2, L.dw, L.dh);
    } else {
      var z = (t && t.zoom) || 1, rot = (t && t.rot) || 0, fitK = (rot === 90 || rot === 270) ? Math.min(vw / vh, vh / vw) : 1;
      g.translate(W / 2 - ((t && t.x) || 0) * (z - 1) * W / 2, H / 2 - ((t && t.y) || 0) * (z - 1) * H / 2);
      g.scale(z * fitK, z * fitK); g.rotate(rot * Math.PI / 180); if (t && t.flipH) g.scale(-1, 1);
      g.drawImage(m, -W / 2, -H / 2, W, H);
    }
    g.restore();
  }
  // While a layout clip is under the playhead, a canvas over the picture draws the mirrored halves or the grid, from the frame the movie shows now.
  function syncLayout(m, vc, css){
    var u = E.ui, cv = u.layoutcv; if (!cv || !NLY || !E.proj || !E.proj.tracks) return;
    var list = P.layoutsAt(E.proj, E.t), L = list.length ? list[list.length - 1] : null, pf = u.picframe, W = pf.clientWidth, H = pf.clientHeight;
    if (!L || !vc || !movieReady() || E.swapping || !W || !H || !m.videoWidth){ if (E.layoutOn){ cv.style.display = 'none'; E.layoutOn = false; } return; }
    if (cv.width !== W || cv.height !== H){ cv.width = W; cv.height = H; }
    var fr = E.layoutFrame || (E.layoutFrame = document.createElement('canvas'));
    if (fr.width !== W || fr.height !== H){ fr.width = W; fr.height = H; }
    previewFrame(fr.getContext('2d'), m, vc, W, H);
    NLY.draw(cv.getContext('2d'), L.layout, W, H, fr);
    cv.style.filter = css || ''; cv.style.opacity = String(vc.opacity != null ? vc.opacity : 1); cv.style.display = 'block'; E.layoutOn = true;
  }
  ROWS.layout = function (){
    var isL = !!selLayout();
    return [
      { id: 'edAddLayout', label: 'Add', icon: G.layout, run: function (){ openPanel('layoutpick'); } },
      { id: 'edLayoutEdit', label: 'Edit', icon: G.pencil, run: function (){ openPanel('layoutedit'); }, disabled: !isL },
      { id: 'edLayoutDup', label: 'Duplicate', icon: G.dup, run: duplicateSel, disabled: !isL },
      { id: 'edLayoutDel', label: 'Delete', icon: G.trash, run: deleteSel, disabled: !isL }
    ];
  };
  PANELS.layoutpick = { title: 'Layouts', build: function (body){
    if (!layoutNeed()) return;
    var cur = chipKey('laygroup', NLY.GROUPS, NLY.GROUPS[0].key);
    body.appendChild(chips(NLY.GROUPS, cur, pickChip('laygroup')));
    body.appendChild(chips(NLY.inGroup(cur), null, function (k){ addLayoutHere(k); }));
    body.appendChild(mk('div', 'ed-hint', 'Tap one to use it from the playhead. Mirror copies one half of the picture onto the other. Split screen shows the whole picture in every box. Drag the ends of the clip on the timeline to change how long it lasts.'));
  } };
  PANELS.layoutedit = { title: 'Layout', build: function (body){
    var c = selLayout(); if (!c || !layoutNeed()){ body.appendChild(mk('div', 'ed-hint', 'Tap a layout on the timeline first.')); return; }
    var L = c.layout, set = function (o){ return P.setLayoutProps(E.hist.cur, c.id, o); };
    var g = (E.chip.layedit && E.chip.layeditId === c.id) ? E.chip.layedit : NLY.groupOf(L.preset);
    body.appendChild(chips(NLY.GROUPS, g, function (k){ E.chip.layedit = k; E.chip.layeditId = c.id; renderDock(); }));
    body.appendChild(chips(NLY.inGroup(g), L.preset, function (k){ commit(set({ preset: k })); }));
    body.appendChild(sliderRow('Divider', 0, 10, 1, Math.round(L.gap * 100), function (v){ return v + '%'; }, function (v){ live(set({ gap: v / 100 })); }, function (v){ commit(set({ gap: v / 100 })); }));
    body.appendChild(sliderRow('Zoom', 100, 300, 5, Math.round(L.zoom * 100), pct, function (v){ live(set({ zoom: v / 100 })); }, function (v){ commit(set({ zoom: v / 100 })); }));
    var ci = mk('input'); ci.type = 'color'; ci.value = L.color; ci.setAttribute('aria-label', 'Divider colour');
    ci.oninput = function (){ live(set({ color: ci.value })); }; ci.onchange = function (){ commit(set({ color: ci.value })); };
    var cr = mk('div', 'ed-mixrow wide'); add(cr, mk('span', 'ed-mixname', 'Divider colour'), ci); body.appendChild(cr);
    body.appendChild(mk('div', 'ed-hint', 'Zoom moves each box in on the middle of its part of the picture. The layout works on the whole frame, after the clip\\'s own zoom, filters and fade; titles, stickers and overlays stay on top. The preview ignores Crop; the exported video does not.'));
  } };

  /* ---------- titles drawn over the preview ---------- */`;
rep(ed, `/* ---------- titles drawn over the preview ---------- */`, BLOCK, 'editor: layout tool and panels');

/* ---------- css and index.html ---------- */
if (!css.text.includes('.ed-layoutcv')) {
  css.text = css.text.replace(/\s*$/, '\n') + `
/* layouts: mirror and split screen */
.ed-picframe canvas.ed-layoutcv{position:absolute;inset:0;width:100%;height:100%;display:none;pointer-events:none}
.ed-clip.k-layout{background:#2b7a78;border-color:#5fd0cb}
`;
}
rep(html, `<script src="project.js"></script>`, `<script src="layout.js"></script>\n<script src="project.js"></script>`, 'index.html: load layout.js');
rep(html, `'look.js': 'fonts', `, `'look.js': 'fonts', 'layout.js': 'layout', `, 'index.html: version check', true);

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[ed, css, html, pr, pl, ex, wc].forEach(save);
console.log('Done.' + (notes.length ? '\n  ' + notes.join('\n  ') : '') + '\nAlso add layout.js to the file list in sw.js so it works offline.\nIn tests/editor-dock.test.js change the toolbar button count from 12 to 13.\nNow run:  npm test');