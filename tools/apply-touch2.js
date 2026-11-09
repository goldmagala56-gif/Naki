'use strict';
// One-time patch (after apply-touch.js): staged long-press on touch, grid lines + time readout while dragging, grid snap, nudge buttons,
// icon-only row labels, calmer clips.
//   long press on a clip:  1st tick = shorten / lengthen (the edge nearest your finger), keep holding for the 2nd (double) tick = move the clip
// Run from the project folder:   node tools/apply-touch2.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

const FUNCS = `// ----- staged long press (touch): 1st tick = trim the nearest edge, 2nd (double) tick = move -----
  function tickSound(f, ms){
    try {
      var h = E.hooks, ctx = h.getCtx && h.getCtx();
      if (!ctx && h.ensureAudio){ h.ensureAudio(); ctx = h.getCtx && h.getCtx(); }
      if (!ctx) return;
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      var o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
    } catch (e) {}
  }
  function armTrim(d){
    if (!d || d.mode !== 'pending') return;
    var r = d.el.getBoundingClientRect();
    d.mode = d.x0 < r.left + r.width / 2 ? 'trimL' : 'trimR';
    d.el.classList.add('arm-trim'); tickSound(1000, 40);
    try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
    d.press = setTimeout(function (){
      if (E.drag !== d || d.moved) return;
      d.mode = 'move'; d.el.classList.remove('arm-trim'); d.el.classList.add('arm-move');
      tickSound(700, 40); setTimeout(function (){ tickSound(1000, 40); }, 80);
      try { if (navigator.vibrate) navigator.vibrate([14, 50, 14]); } catch (e) {}
    }, 350);
  }
  // ----- measuring lines while dragging -----
  function meterUnitMs(){ var k = E.mu == null ? 'frame' : E.mu; return k === 'frame' ? 1000 / ((E.proj && E.proj.fps) || 30) : k; }
  function gridUnit(){
    if (E.meter){   // the meter's own unit, or a multiple of it when the lines would be too close together to see
      var m = meterUnitMs(), mult = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
      for (var j = 0; j < mult.length; j++) if (m * mult[j] * E.ppm >= 6) return m * mult[j];
      return m * 5000;
    }
    var us = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    for (var i = 0; i < us.length; i++) if (us[i] * E.ppm >= 7) return us[i];
    return 10000;
  }
  function gridLabel(){ var u = gridUnit(); return u >= 1000 ? (Math.round(u) / 1000) + ' s' : (Math.round(u * 10) / 10) + ' ms'; }
  function gridSnap(t){ if (!E.grid && !E.meter) return t; var u = gridUnit(); return Math.round(Math.round(t / u) * u); }
  function toggleGrid(){
    E.grid = !E.grid;
    toast(E.grid ? 'Grid snap on: clips land on the grid lines (now ' + gridLabel() + '; zoom in for finer).' : 'Grid snap off.');
    renderDock();
  }
  function precTime(ms){
    ms = Math.max(0, Math.round(ms)); var s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    return m + ':' + ('0' + (s % 60)).slice(-2) + '.' + ('00' + (ms % 1000)).slice(-3);
  }
  function drawGrid(){
    var u = E.ui, sc = u.scroll, cv = u.gridcv;
    if (!cv || !cv.parentNode){ cv = u.gridcv = mk('canvas', 'ed-gridcv'); u.inner.appendChild(cv); }
    var W = sc.clientWidth, H = Math.max(u.inner.clientHeight, 60);
    cv.width = W; cv.height = H; cv.style.left = sc.scrollLeft + 'px'; cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.style.display = 'block';
    if (E.meter && u.meterHint) u.meterHint.textContent = 'Lines every ' + gridLabel() + '. Zoom in for finer lines.';
    var g = cv.getContext('2d'), un = gridUnit(), t0 = Math.max(0, Math.floor((sc.scrollLeft - PAD) / E.ppm / un) * un), t1 = (sc.scrollLeft + W - PAD) / E.ppm;
    for (var t = t0; t <= t1; t += un){
      var x = Math.round(tx(t) - sc.scrollLeft) + 0.5, n = Math.round(t / un), major = n % 10 === 0, mid = n % 5 === 0;
      g.strokeStyle = major ? 'rgba(255,255,255,.45)' : mid ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.14)';
      g.beginPath(); g.moveTo(x, major ? 0 : 26); g.lineTo(x, H); g.stroke();
    }
  }
  function showTip(t, len){
    var u = E.ui, el = u.dragtip;
    if (!el || !el.parentNode){ el = u.dragtip = mk('div', 'ed-dragtip'); u.inner.appendChild(el); }
    el.textContent = precTime(t) + (len ? ' \\u00b7 ' + precTime(len) + ' long' : '') + ' \\u00b7 grid ' + gridLabel();
    el.style.display = 'block'; el.style.left = Math.max(u.scroll.scrollLeft + 4, tx(t) - 20) + 'px';
  }
  function hideGrid(){
    var u = E.ui; if (u.dragtip) u.dragtip.style.display = 'none';
    if (E.meter){ drawGrid(); return; }   // the meter keeps its lines on screen
    if (u.gridcv) u.gridcv.style.display = 'none';
  }
  // ----- the precision meter: a fine ruler down the timeline to set the playhead exactly, like the fine-aim dial in billiards -----
  var MUNITS = [{ key: 'frame', label: '1 frame' }, { key: 10, label: '10 ms' }, { key: 50, label: '50 ms' }, { key: 100, label: '0.1 s' }, { key: 500, label: '0.5 s' }, { key: 1000, label: '1 s' }];
  var ZI = svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8 11h6M11 8v6"/>'), ZO = svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8 11h6"/>');
  var G_METER = svg('<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>');
  function keepHeadInView(){
    var sc = E.ui.scroll, x = tx(E.t), w = sc.clientWidth;
    if (x < sc.scrollLeft + 30 || x > sc.scrollLeft + w - 30) sc.scrollLeft = Math.max(0, x - w / 2);
  }
  function meterStep(n){
    var u = meterUnitMs(), i = Math.round(E.t / u) + n;
    seek(clamp(Math.round(i * u), 0, E.proj.durationMs)); keepHeadInView();
  }
  function openMeter(){
    if (E.playing) pause();
    E.meter = true; if (E.root) E.root.classList.add('meter-on');
    renderDock(); drawGrid(); keepHeadInView();
  }
  function closeMeter(){
    E.meter = false; if (E.root) E.root.classList.remove('meter-on');
    hideGrid(); renderDock();
  }
  function meterPanel(){
    var p = mk('div', 'ed-panel ed-meter'), h = mk('div', 'ed-phead'), done = iconBtn('edMeterDone', G.check, 'Done', 'ed-ibtn ed-pdone'), body = mk('div', 'ed-pbody');
    done.onclick = closeMeter;
    var rd = mk('span', 'ed-ptitle ed-meterread num', precTime(E.t)); E.ui.meterRead = rd;
    add(h, rd, done);
    var hint = mk('div', 'ed-hint'); E.ui.meterHint = hint; hint.textContent = 'Lines every ' + gridLabel() + '. Zoom in for finer lines.';
    var pad = mk('div', 'ed-meterpad'); pad.appendChild(mk('span', null, '\u25c0  slide here to fine-tune  \u25b6'));
    var pd = null;
    pad.addEventListener('pointerdown', function (ev){ ev.preventDefault(); try { pad.setPointerCapture(ev.pointerId); } catch (e) {} pd = { x: ev.clientX, i: Math.round(E.t / meterUnitMs()) }; });
    pad.addEventListener('pointermove', function (ev){
      if (!pd) return;
      var n = Math.round((ev.clientX - pd.x) / 7), u = meterUnitMs();
      seek(clamp(Math.round((pd.i + n) * u), 0, E.proj.durationMs)); keepHeadInView();
      pad.style.backgroundPositionX = (ev.clientX - pd.x) + 'px';
    });
    var end = function (){ pd = null; }; pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    body.appendChild(chips(MUNITS, E.mu == null ? 'frame' : E.mu, function (k){ E.mu = k; renderDock(); drawGrid(); }));
    body.appendChild(pad);
    body.appendChild(actions([
      { id: 'edMt10', label: '\u221210', run: function (){ meterStep(-10); } }, { id: 'edMt1', label: '\u22121', run: function (){ meterStep(-1); } },
      { id: 'edMp1', label: '+1', run: function (){ meterStep(1); } }, { id: 'edMp10', label: '+10', run: function (){ meterStep(10); } }]));
    body.appendChild(actions([
      { id: 'edMsplit', label: 'Split here', run: split },
      { id: 'edMzo', label: 'Zoom out', run: function (){ setZoom(E.ppm / 1.6); drawGrid(); } },
      { id: 'edMzi', label: 'Zoom in', run: function (){ setZoom(E.ppm * 1.6); drawGrid(); } },
      { id: 'edMfit', label: 'Fit', run: function (){ fit(); drawGrid(); } }]));
    body.appendChild(hint);
    add(p, h, body); return p;
  }
  // ----- one small icon for each row, instead of its name -----
  var ROLE_SVG = {
    movie: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/>',
    movieSound: '<path d="M5 9v6h3l5 4V5L8 9z"/><path d="M16.5 9a4 4 0 010 6"/>',
    voice: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v4"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    text: '<path d="M5 6.5V5h14v1.5M12 5v14M9.5 19h5"/>',
    captions: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 11h4M13 11h4M7 15h2.5M12 15h5"/>',
    stickers: '<path d="M20 12a8 8 0 11-8-8h5a3 3 0 013 3z"/><path d="M9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 007 0"/>',
    overlay: '<rect x="3" y="5" width="14" height="11" rx="1.5"/><rect x="9" y="9" width="12" height="10" rx="1.5"/>',
    sfx: '<path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4"/>',
    fx: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
    layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18"/>'
  };
  function roleIcon(role){ return svg(ROLE_SVG[role] || ROLE_SVG.overlay); }
  `;

const CSS = `
/* staged long press, measuring lines, icon-only labels, calmer clips */
.ed-clip.arm-trim{box-shadow:inset 0 0 0 2px #ffd400}
.ed-clip.arm-move{box-shadow:0 0 0 2px var(--mango),0 6px 16px rgba(0,0,0,.5);z-index:4}
.ed-gridcv{position:absolute;top:0;pointer-events:none;z-index:4;display:none}
.ed-dragtip{position:absolute;top:2px;z-index:8;background:#fff;color:#111b24;font:700 11px system-ui,sans-serif;padding:2px 7px;border-radius:6px;pointer-events:none;white-space:nowrap;display:none}
.ed-labels{flex:0 0 84px;width:84px}
.ed-lbicon{display:flex;align-items:center;justify-content:center;width:22px;height:22px;color:var(--dim);flex:0 0 auto}
.ed-lbicon svg{width:18px;height:18px}
.ed-label{justify-content:space-between}
@media (pointer:coarse){
  .ed-labels{flex:0 0 94px;width:94px}
  .ed-label .ed-lb{width:26px;min-width:26px;height:26px}
}
.ed-clip{border-color:rgba(255,255,255,.12);border-radius:6px}
.ed-row{background:rgba(255,255,255,.02)}
.ed-meterpad{height:46px;border-radius:10px;border:1px solid var(--line);background-color:#0f1820;touch-action:none;cursor:ew-resize;display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:12px;user-select:none;-webkit-user-select:none;
  background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.35) 0 1px,transparent 1px 7px);background-size:auto 40%;background-repeat:repeat-x;background-position:0 100%}
.ed-meterread{font-variant-numeric:tabular-nums}
.ed.meter-on .ed-head{width:3px;margin-left:-1.5px;background:#00e5ff;box-shadow:0 0 6px #00e5ff}
.ed.meter-on .ed-head::before{border-top-color:#00e5ff}
.ed-selbar{overflow-x:auto;scrollbar-width:none}
.ed-selbar::-webkit-scrollbar{display:none}
.ed-selbar .ed-ibtn{flex:0 0 auto;width:36px;height:36px}
.ed-seln{flex:1 0 56px}
.ed-clip .ed-kf{display:none}
.ed-clip.sel .ed-kf{display:block}
`;

const EDITS = {
  'www/editor.js': [
    { label: 'long press, step 1: trim edge (replaces move-at-300ms)',
      find: `if (E.drag && E.drag.mode === 'pending'){ E.drag.mode = 'move'; try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} }`,
      replace: `armTrim(E.drag);` },
    { label: 'a selected clip no longer drags at once on touch',
      find: `if (E.drag.mode === 'pending' && E.drag.touch && wasSel && tr.kind !== 'video') E.drag.mode = 'move';`,
      replace: `` },
    { label: 'trim edges can also take over the touch (no scrolling)',
      find: `u.scroll.addEventListener('touchmove', function (ev){ if (E.drag && E.drag.mode === 'move') ev.preventDefault(); }, { passive: false });`,
      replace: `u.scroll.addEventListener('touchmove', function (ev){ if (E.drag && (E.drag.mode === 'move' || E.drag.mode === 'trimL' || E.drag.mode === 'trimR')) ev.preventDefault(); }, { passive: false });` },
    { label: 'new functions',
      find: `function renderSelectionOnly(){`,
      replace: FUNCS + `function renderSelectionOnly(){` },
    { label: 'grid snap for moving',
      find: `return Math.max(0, Math.round(best));`,
      replace: `if (best === start) best = gridSnap(start);\n    return Math.max(0, Math.round(best));` },
    { label: 'grid snap for trimming',
      find: `function snapped(t){ return P.snapTime(E.proj, t, snapTh(), snapPts()); }`,
      replace: `function snapped(t){ var s = P.snapTime(E.proj, t, snapTh(), snapPts()); return s === t ? gridSnap(t) : s; }` },
    { label: 'lines and readout while moving',
      find: `d.el.classList.add('dragging'); d.el.style.left = tx(d.newStart) + 'px'; pickRow(d); showDrop(d);`,
      replace: `d.el.classList.add('dragging'); d.el.style.left = tx(d.newStart) + 'px'; pickRow(d); showDrop(d); drawGrid(); showTip(d.newStart, d.e0 - d.s0);` },
    { label: 'lines and readout while trimming',
      find: `d.moved = true; var dt = dx / E.ppm;`,
      replace: `d.moved = true; var dt = dx / E.ppm;\n    if (d.mode === 'trimL' || d.mode === 'trimR') setTimeout(function (){ if (E.drag === d){ drawGrid(); showTip(d.mode === 'trimL' ? d.newStart : d.newEnd, 0); } }, 0);` },
    { label: 'clean up when the drag ends',
      find: `if (E.ui.snapline) E.ui.snapline.style.display = 'none';`,
      replace: `if (E.ui.snapline) E.ui.snapline.style.display = 'none';\n    hideGrid();` },
    { label: 'clean up the arming colour',
      find: `if (!d) return; clearTimeout(d.press); clearInterval(d.timer);`,
      replace: `if (!d) return; clearTimeout(d.press); clearInterval(d.timer);\n    if (d.el && d.el.classList) d.el.classList.remove('arm-trim', 'arm-move');` },
    { label: 'Grid snap button in Select',
      find: `{ id: 'edSnap', label: 'Snapping', icon: G.magnet, run: toggleSnap, on: E.snap !== false }`,
      replace: `{ id: 'edSnap', label: 'Snapping', icon: G.magnet, run: toggleSnap, on: E.snap !== false },\n      { id: 'edGrid', label: 'Grid snap', icon: G.gap, run: toggleGrid, on: !!E.grid }` },
    { label: 'meter: lines redraw when the playhead moves',
      find: `function placeHead(){ if (E.ui.head) E.ui.head.style.left = tx(E.t) + 'px'; }`,
      replace: `function placeHead(){ if (E.ui.head) E.ui.head.style.left = tx(E.t) + 'px'; if (E.meter) drawGrid(); }` },
    { label: 'meter: lines redraw when the timeline scrolls',
      find: `u.scroll.addEventListener('scroll', scheduleRepaint);`,
      replace: `u.scroll.addEventListener('scroll', function (){ scheduleRepaint(); if (E.meter) drawGrid(); });` },
    { label: 'meter: time readout in the panel',
      find: `E.ui.time.textContent = fmtP(E.t) + ' / ' + fmtP(E.proj.durationMs); updateKfBar();`,
      replace: `E.ui.time.textContent = fmtP(E.t) + ' / ' + fmtP(E.proj.durationMs); updateKfBar();\n    if (E.meter && E.ui.meterRead) E.ui.meterRead.textContent = precTime(E.t);` },
    { label: 'meter: the dock shows the meter panel',
      find: `var kb = kfBar(); if (kb) d.appendChild(kb);`,
      replace: `if (E.meter){ d.appendChild(meterPanel()); if (E.isOpen) layoutTextLayer(); return; }\n    var kb = kfBar(); if (kb) d.appendChild(kb);` },
    { label: 'meter: button in the play row',
      find: `add(bar, u.play, u.time, u.scrub, u.kfBtn, u.undo, u.redo);`,
      replace: `u.meterBtn = iconBtn('edBarMeter', G_METER, 'Precision meter'); u.meterBtn.onclick = function (){ if (E.meter) closeMeter(); else openMeter(); };\n    add(bar, u.play, u.meterBtn, u.time, u.scrub, u.kfBtn, u.undo, u.redo);` },
    { label: 'meter: closes with the editor',
      find: `E.multi = {}; E.tool = null; E.panel = null; E.autoDock = false; E.rowScroll = null;`,
      replace: `E.meter = false; if (E.root) E.root.classList.remove('meter-on');\n    E.multi = {}; E.tool = null; E.panel = null; E.autoDock = false; E.rowScroll = null;` },
    { label: 'nudge buttons in the selected-clip bar',
      find: `return add(bar, nm, b('Zoom to this clip', G.zoom, zoomToSel),`,
      replace: `return add(bar, nm, b('Nudge earlier', G.back, function (){ moveSel(-gridUnit()); }), b('Nudge later', G.fwd, function (){ moveSel(gridUnit()); }), b('Zoom out', ZO, function (){ setZoom(E.ppm / 1.6); }), b('Zoom to this clip', G.zoom, zoomToSel),` },
    { label: 'icon instead of the row name',
      find: `l.style.height = rowH(tr) + 'px'; l.appendChild(mk('span', null, nm));`,
      replace: `l.style.height = rowH(tr) + 'px'; var ic = mk('span', 'ed-lbicon'); ic.innerHTML = roleIcon(tr.role); ic.title = nm; ic.setAttribute('role', 'img'); ic.setAttribute('aria-label', nm); l.appendChild(ic);` },
    { label: 'calmer clip text: names only on wide clips (or the selected one)',
      find: `if (wpx > 70) e.appendChild(mk('span', 'ed-cl', code + ' · ' + clipTitle(tr, c)));`,
      replace: `if (wpx > 150 || (wpx > 70 && c.id === E.sel)) e.appendChild(mk('span', 'ed-cl', clipTitle(tr, c)));` }
  ]
};

function load(rel){ const f = path.join(root, rel); const raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o){ fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const files = {}, problems = [];
files['www/editor.js'] = load('www/editor.js');
if (files['www/editor.js'].text.indexOf('function armTrim(') >= 0){ console.log('Already applied. Nothing to do.'); process.exit(0); }
EDITS['www/editor.js'].forEach(e => {
  const o = files['www/editor.js'], n = o.text.split(e.find).length - 1;
  if (n !== 1){ problems.push(e.label + ': found ' + n + ' times (need exactly 1)'); return; }
  o.text = o.text.replace(e.find, () => e.replace);
});
const css = load('www/editor.css'); css.text = css.text.replace(/\s*$/, '\n') + CSS; files['www/editor.css'] = css;
if (problems.length){
  console.log('NOTHING WAS CHANGED. These spots did not match your files:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
Object.keys(files).forEach(rel => save(files[rel]));
console.log('Done. Changed www/editor.js and www/editor.css. Now run:  npm test');