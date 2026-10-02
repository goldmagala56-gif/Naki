'use strict';
/* Naki editor: the timeline screen (phone and computer). Sits on top of project.js.
   The host page (index.html) calls NakiEditor.init({...}) once, then NakiEditor.open(session).
   Layout, CapCut style: slim icon toolbar at the bottom; each tool opens a sheet with its controls. */
var NakiEditor = (function () {
  var P = (typeof module !== 'undefined' && module.exports) ? require('./project.js') : window.NakiProject;
  var NP = (typeof module !== 'undefined' && module.exports) ? require('./plan.js') : window.NakiPlan;
  var PAD = 16, MIN_PPM = 0.004, MAX_PPM = 0.6, FRAME_MS = 33;
  var ROLE_NAME = { movie: 'Picture', movieSound: 'Movie sound', voice: 'Your voice', music: 'Music', text: 'Text' };
  var E = { hooks: null, root: null, ui: {}, hist: null, proj: null, sess: null, sel: null, t: 0, playing: false, ppm: 0.06,
    cache: {}, drag: null, raf: 0, wall: 0, wallT: 0, isOpen: false, home: null, pointers: {}, pinch: null,
    voiceGain: null, musicGain: null, quiet: null, quietDb: -42, tool: null, textEls: {}, freezeMs: 2000, saveT: 0, voiceDurMs: null, lastFilter: '', lastOpacity: '', lastRate: 1 };

  function mk(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function add(parent){ for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }
  function btn(id, text, cls, label){ var b = mk('button', cls || 'ed-btn', text); b.type = 'button'; if (id) b.id = id; if (label) b.setAttribute('aria-label', label); return b; }
  function iconBtn(id, svg, label, cls){ var b = btn(id, null, cls || 'ed-ibtn', label); b.innerHTML = svg; return b; }
  function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
  function fmtP(ms){ ms = Math.max(0, ms); var s = ms / 1000, m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }
  function tx(t){ return PAD + t * E.ppm; }
  function toast(m){ if (E.hooks && E.hooks.toast) E.hooks.toast(m); }
  function clipCount(p){ var n = 0; p.tracks.forEach(function (t){ n += t.clips.length; }); return n; }
  function rowH(tr){ return tr.kind === 'video' ? 56 : tr.kind === 'text' ? 30 : 44; }
  function svg(path, fill){ return '<svg viewBox="0 0 24 24" ' + (fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"') + '>' + path + '</svg>'; }
  var ICON = {
    play: svg('<path d="M8 5.5v13l11-6.5z"/>', true), pause: svg('<path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/>', true),
    undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>'), redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>')
  };

  /* ---------- tools (the toolbar along the bottom) ---------- */
  var TOOL_LIST = [
    { name: 'edit', label: 'Edit', icon: svg('<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.2 7.6L20 19M8.2 16.4L20 5"/>') },
    { name: 'audio', label: 'Audio', icon: svg('<path d="M9 18.5a2.8 2.8 0 11-2.8-2.8c.5 0 1 .1 1.4.4V5l11-2.5v13.6a2.8 2.8 0 11-2.8-2.8c.5 0 1 .1 1.4.4V6.1L9 8.3z"/>', true) },
    { name: 'text', label: 'Text', icon: svg('<path d="M5 6.5V5h14v1.5M12 5v14M9.5 19h5"/>') },
    { name: 'speed', label: 'Speed', icon: svg('<path d="M4 15a8 8 0 1116 0"/><path d="M12 15l4-5"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/>') },
    { name: 'fade', label: 'Fade', icon: svg('<path d="M4 5h7v14H4z" opacity=".45"/><path d="M13 5h7v14h-7z"/>', true) },
    { name: 'filter', label: 'Filter', icon: svg('<path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h12M20 17h0"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="17" r="2"/>') }
  ];

  // ---------- building the screen ----------
  function build(){
    var u = E.ui, root = mk('div', 'ed');
    root.id = 'editor'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Video editor');

    // top: back, title, saved label, zoom
    var top = mk('div', 'ed-top');
    u.close = btn('edClose', '‹ Back', 'ed-btn', 'Close editor');
    u.saved = mk('div', 'ed-saved'); u.saved.setAttribute('aria-live', 'polite');
    u.zout = btn('edZoomOut', '−', 'ed-btn ed-sq', 'Zoom out'); u.zin = btn('edZoomIn', '+', 'ed-btn ed-sq', 'Zoom in'); u.fit = btn('edFit', 'Fit', 'ed-btn ed-small', 'Fit the whole video');
    u.exportBtn = btn('edExport', 'Export', 'ed-btn primary ed-small', 'Export the finished video');
    add(top, u.close, mk('div', 'ed-title', 'Edit video'), u.saved, u.zout, u.zin, u.fit, u.exportBtn);

    // preview: the movie goes in here when the editor opens; titles are drawn over it
    u.stage = mk('div', 'ed-stage'); u.stageMsg = mk('div', 'ed-stage-msg'); u.stage.appendChild(u.stageMsg);
    u.picframe = mk('div', 'ed-picframe'); u.stage.appendChild(u.picframe);
    u.textlayer = mk('div', 'ed-textlayer'); u.stage.appendChild(u.textlayer);

    // desktop side panel: sound levels and the selected clip
    u.insp = mk('aside', 'ed-insp'); u.mix = mk('div', 'ed-mix'); u.selinfo = mk('div', 'ed-selinfo');
    add(u.insp, mk('h3', null, 'Sound'), u.mix, mk('h3', null, 'Selected clip'), u.selinfo);

    // play row: play, time, scrub, undo, redo
    var bar = mk('div', 'ed-bar');
    u.play = iconBtn('edPlay', ICON.play, 'Play or pause', 'ed-ibtn ed-play');
    u.time = mk('div', 'ed-time num');
    u.scrub = mk('input', 'ed-scrub'); u.scrub.type = 'range'; u.scrub.min = 0; u.scrub.max = 1000; u.scrub.value = 0; u.scrub.setAttribute('aria-label', 'Position');
    u.undo = iconBtn('edUndo', ICON.undo, 'Undo'); u.redo = iconBtn('edRedo', ICON.redo, 'Redo');
    add(bar, u.play, u.time, u.scrub, u.undo, u.redo);

    u.note = mk('div', 'ed-note');
    var tl = mk('div', 'ed-tl'); u.labels = mk('div', 'ed-labels'); u.scroll = mk('div', 'ed-scroll'); u.inner = mk('div', 'ed-inner');
    add(u.scroll, u.inner); add(tl, u.labels, u.scroll);

    // toolbar along the bottom, and the sheet that slides up above it
    var tb = mk('div', 'ed-toolbar'); u.tools = {};
    TOOL_LIST.forEach(function (t){
      var b = btn('edTool_' + t.name, null, 'ed-tool', t.label);
      b.innerHTML = t.icon + '<span>' + t.label + '</span>'; b.dataset.tool = t.name;
      b.onclick = function (){ openTool(E.tool === t.name ? null : t.name); };
      tb.appendChild(b); u.tools[t.name] = b;
    });
    u.sheet = mk('div', 'ed-sheet'); u.sheet.hidden = true;
    var sbar = mk('div', 'ed-sheetbar'); u.stitle = mk('span', 'ed-stitle'); u.sdone = btn('edSheetDone', 'Done', 'ed-btn ed-small', 'Close this panel');
    add(sbar, u.stitle, u.sdone); u.sbody = mk('div', 'ed-sheetbody'); add(u.sheet, sbar, u.sbody);
    u.sdone.onclick = closeSheet;

    add(root, top, u.stage, u.insp, bar, u.note, tl, u.sheet, tb);
    document.body.appendChild(root); E.root = root;

    u.close.onclick = close; u.undo.onclick = undo; u.redo.onclick = redo; u.play.onclick = togglePlay;
    u.fit.onclick = fit;
    u.exportBtn.onclick = function (){ if (!E.hooks.onExport){ toast('Export is not available here.'); return; } close(); E.hooks.onExport(); };
    u.zin.onclick = function (){ setZoom(E.ppm * 1.4); }; u.zout.onclick = function (){ setZoom(E.ppm / 1.4); };
    u.scrub.addEventListener('input', function (){ seek(+u.scrub.value / 1000 * E.proj.durationMs); });
    u.scroll.addEventListener('pointerdown', onDown);
    u.scroll.addEventListener('wheel', function (ev){
      if (ev.ctrlKey || ev.metaKey){ ev.preventDefault(); setZoom(E.ppm * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), ev.clientX); }
      else if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)){ u.scroll.scrollLeft += ev.deltaY; ev.preventDefault(); }
    }, { passive: false });
    u.scroll.addEventListener('touchmove', function (ev){ if (E.drag && E.drag.mode === 'move') ev.preventDefault(); }, { passive: false });
    if (typeof window !== 'undefined') window.addEventListener('resize', function (){ if (E.isOpen){ layoutTextLayer(); renderTexts(P.textsAt(E.proj, E.t)); } });
  }

  // ---------- drawing the timeline ----------
  function renderAll(){ renderTimeline(); readout(); }
  function renderTimeline(){
    var p = E.proj, u = E.ui;
    u.inner.textContent = '';
    u.inner.style.width = (PAD + p.durationMs * E.ppm + 240) + 'px';
    var ruler = mk('div', 'ed-ruler'); u.ruler = ruler;
    var steps = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000], step = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) if (steps[i] * E.ppm >= 80){ step = steps[i]; break; }
    for (var t = 0; t <= p.durationMs + step; t += step){
      var k = mk('div', 'ed-tick', fmtP(t).replace(/\.0$/, '')); k.style.left = tx(t) + 'px'; ruler.appendChild(k);
    }
    u.inner.appendChild(ruler);
    p.tracks.forEach(function (tr){
      var row = mk('div', 'ed-row k-' + tr.role); row.style.height = rowH(tr) + 'px'; row.dataset.track = tr.id;
      tr.clips.forEach(function (c){ row.appendChild(clipEl(tr, c)); });
      u.inner.appendChild(row);
    });
    u.head = mk('div', 'ed-head'); u.inner.appendChild(u.head);
    placeHead(); renderLabels(); renderMix(); renderSelected(); updateButtons();
  }
  function clipKind(tr, c){ return tr.kind === 'text' ? 'k-text' : tr.kind === 'video' ? (c.type === 'freeze' ? 'k-freeze' : 'k-video') : 'k-' + tr.role; }
  function clipEl(tr, c){
    var e = mk('div', 'ed-clip ' + clipKind(tr, c) + (c.id === E.sel ? ' sel' : ''));
    e.dataset.id = c.id; e.style.left = tx(c.start) + 'px'; e.style.width = Math.max(3, c.dur * E.ppm) + 'px';
    if (c.dur * E.ppm > 46) e.appendChild(mk('span', 'ed-cl', clipTitle(tr, c)));
    if (tr.role === 'voice'){ var cv = mk('canvas'); e.appendChild(cv); drawWave(cv, c); }
    add(e, mk('i', 'ed-h ed-hl'), mk('i', 'ed-h ed-hr'));
    return e;
  }
  function clipTitle(tr, c){
    if (tr.kind === 'text') return c.text || 'Text';
    if (tr.kind === 'video'){
      var extra = (c.speed && c.speed !== 1 ? ' ' + c.speed + '×' : '') + (c.filter ? ' · filter' : '') + (c.vFadeIn || c.vFadeOut ? ' · fade' : '') + (c.opacity != null ? ' · ' + Math.round(c.opacity * 100) + '%' : '') + (c.transform ? ' · ' + (c.transform.zoom > 1 ? 'zoom ' : '') + (c.transform.rot ? c.transform.rot + '° ' : '') + (c.transform.flipH ? 'flip' : '') : '');
      return (c.type === 'freeze' ? 'Paused picture' : 'Movie playing') + extra;
    }
    return ROLE_NAME[tr.role] || 'Audio';
  }
  function drawWave(cv, c){
    var g = cv.getContext && cv.getContext('2d'); if (!g) return;
    var lv = E.proj.levels || [], w = cv.width = Math.max(1, Math.min(4000, Math.round(c.dur * E.ppm))), hh = cv.height = 34;
    g.fillStyle = 'rgba(255,255,255,.6)';
    for (var x = 0; x < w; x += 2){
      var i0 = Math.floor((c.start + x / w * c.dur) / 50), i1 = Math.max(i0, Math.floor((c.start + (x + 2) / w * c.dur) / 50)), b = 0;
      for (var i = i0; i <= i1 && i < lv.length; i++) b = Math.max(b, lv[i] || 0);
      var a = Math.max(1, Math.pow(b / 255, 2.2) * hh); g.fillRect(x, (hh - a) / 2, 1.5, a);
    }
  }
  function renderLabels(){
    var u = E.ui; u.labels.textContent = ''; u.labels.appendChild(mk('div', 'ed-spacer'));
    E.proj.tracks.forEach(function (tr){
      var l = mk('div', 'ed-label' + (tr.muted ? ' muted' : '')); l.style.height = rowH(tr) + 'px';
      l.appendChild(mk('span', null, ROLE_NAME[tr.role] || tr.role));
      if (tr.kind === 'audio'){
        var m = btn(null, tr.muted ? 'Off' : 'On', null, (tr.muted ? 'Unmute ' : 'Mute ') + (ROLE_NAME[tr.role] || tr.role));
        m.onclick = function (){ commit(P.setTrackProps(E.hist.cur, tr.id, { muted: !tr.muted })); };
        l.appendChild(m);
      }
      u.labels.appendChild(l);
    });
  }
  function placeHead(){ if (E.ui.head) E.ui.head.style.left = tx(E.t) + 'px'; }
  function readout(){
    E.ui.time.textContent = fmtP(E.t) + ' / ' + fmtP(E.proj.durationMs);
    if (E.proj.durationMs) E.ui.scrub.value = String(Math.round(E.t / E.proj.durationMs * 1000));
  }
  function hasCrossing(t){
    return E.proj.tracks.some(function (tr){ return tr.clips.some(function (c){ return c.start < t && t < c.start + c.dur; }); });
  }
  function updateButtons(){
    var u = E.ui;
    u.undo.disabled = !E.hist.past.length; u.redo.disabled = !E.hist.future.length;
    u.play.innerHTML = E.playing ? ICON.pause : ICON.play;
    if (u.bSplit) u.bSplit.disabled = !hasCrossing(Math.round(E.t));
    if (u.bCut) u.bCut.disabled = !E.sel; if (u.bDel) u.bDel.disabled = !E.sel;
    if (!E.quiet && !E.hist.past.length && !E.ui.note.firstChild)
      u.note.textContent = 'Move the playhead, open Edit, tap Split, tap the part you do not want, then Cut out.';
  }

  // ---------- sound panel and selected clip ----------
  function slider(min, max, step, val, label){
    var r = mk('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val; r.setAttribute('aria-label', label); return r;
  }
  function renderMix(){ renderMixInto(E.ui.mix); }
  function renderMixInto(container){
    container.textContent = '';
    E.proj.tracks.forEach(function (tr){
      if (tr.kind !== 'audio') return;
      var name = ROLE_NAME[tr.role] || tr.role, row = mk('div', 'ed-mixrow');
      var rng = slider(0, 200, 5, Math.round((tr.volume != null ? tr.volume : 1) * 100), name + ' volume'), out = mk('span', 'ed-mixval num', rng.value + '%');
      var mute = btn(null, tr.muted ? 'Muted' : 'Mute', 'ed-btn ed-small' + (tr.muted ? ' on' : ''), 'Mute ' + name);
      mute.setAttribute('aria-pressed', String(!!tr.muted));
      rng.oninput = function (){ out.textContent = rng.value + '%'; live(P.setTrackProps(E.hist.cur, tr.id, { volume: +rng.value / 100 })); };
      rng.onchange = function (){ commit(P.setTrackProps(E.hist.cur, tr.id, { volume: +rng.value / 100 })); };
      mute.onclick = function (){ commit(P.setTrackProps(E.hist.cur, tr.id, { muted: !tr.muted })); };
      add(row, mk('span', 'ed-mixname', name), rng, out, mute); container.appendChild(row);
    });
  }
  function renderSelected(){ selectedPanel(E.ui.selinfo); }
  function selectedPanel(container){
    var f = E.sel && P.findClip(E.proj, E.sel); container.textContent = '';
    if (!f){ container.textContent = 'Tap a clip on the timeline to change it.'; return; }
    var c = f.clip, tr = f.track;
    var info = mk('div'); info.innerHTML = '<strong></strong><br>';
    info.firstChild.textContent = clipTitle(tr, c);
    info.appendChild(document.createTextNode('Starts ' + fmtP(c.start) + ' · Length ' + fmtP(c.dur)));
    if (tr.kind === 'video') info.appendChild(document.createTextNode(' · Movie at ' + fmtP(c.in)));
    container.appendChild(info);
    if (tr.kind !== 'audio') return;
    function row(label, min, max, step, val, fmtv, key, scale){
      var r = mk('div', 'ed-mixrow wide'), rng = slider(min, max, step, val, label), out = mk('span', 'ed-mixval num', fmtv(val));
      function patch(){ var o = {}; o[key] = +rng.value / scale; if (key === 'fadeIn') o.fadeInOff = 0; if (key === 'fadeOut') o.fadeOutOff = 0; return P.setClipProps(E.hist.cur, c.id, o); }
      rng.oninput = function (){ out.textContent = fmtv(+rng.value); live(patch()); };
      rng.onchange = function (){ commit(patch()); };
      add(r, mk('span', 'ed-mixname', label), rng, out); container.appendChild(r);
    }
    var halfMs = Math.min(5000, Math.floor(c.dur / 2));
    row('Clip volume', 0, 200, 5, Math.round((c.volume != null ? c.volume : 1) * 100), function (v){ return v + '%'; }, 'volume', 100);
    row('Fade in', 0, halfMs, 100, Math.min(halfMs, c.fadeIn || 0), function (v){ return (v / 1000).toFixed(1) + 's'; }, 'fadeIn', 1);
    row('Fade out', 0, halfMs, 100, Math.min(halfMs, c.fadeOut || 0), function (v){ return (v / 1000).toFixed(1) + 's'; }, 'fadeOut', 1);
  }

  // ---------- editing actions ----------
  function live(p){ E.proj = p; syncMedia(); }                       // temporary change while a slider moves
  function commit(p){                                                 // keeps the change and makes it undoable
    if (p === E.hist.cur) return;
    E.hist.commit(p); E.proj = p; E.quiet = null; E.ui.note.textContent = ''; afterEdit();
  }
  function afterEdit(){
    E.t = clamp(E.t, 0, E.proj.durationMs);
    if (E.sel && !P.findClip(E.proj, E.sel)) E.sel = null;
    renderAll(); syncMedia(); refreshSheet(); queueSave();
  }
  function undo(){ E.hist.undo(); E.proj = E.hist.cur; E.quiet = null; E.ui.note.textContent = ''; afterEdit(); }
  function redo(){ E.hist.redo(); E.proj = E.hist.cur; E.quiet = null; E.ui.note.textContent = ''; afterEdit(); }
  function select(id){ E.sel = id || null; renderTimeline(); refreshSheet(); }
  function split(){
    var q = P.splitAt(E.hist.cur, Math.round(E.t));
    if (clipCount(q) === clipCount(E.hist.cur)){ toast('Move the playhead onto a clip first.'); return; }
    commit(q);
  }
  function cutOut(){
    var f = E.sel && P.findClip(E.proj, E.sel);
    if (!f){ toast('Tap the part you want to remove first.'); return; }
    var a = f.clip.start, b = a + f.clip.dur, len = b - a;
    if (len > E.proj.durationMs * 0.9){ toast('That would remove almost the whole video. Split it first.'); return; }
    var q = P.rippleDelete(E.hist.cur, a, b); if (q === E.hist.cur) return;
    if (E.t > a) E.t = E.t >= b ? E.t - len : a;
    E.sel = null; commit(q);
  }
  function deleteSel(){
    if (!E.sel){ toast('Tap a clip first.'); return; }
    var id = E.sel; E.sel = null; commit(P.deleteClip(E.hist.cur, id));
  }
  function freezeHere(ms){
    var q = P.insertFreeze(E.hist.cur, Math.round(E.t), ms || E.freezeMs);
    if (q === E.hist.cur){ toast('Move the playhead onto the picture first.'); return; }
    commit(q); toast('Picture held for ' + ((ms || E.freezeMs) / 1000) + ' s. Everything after it moved later.');
  }
  function setSub(name){ E.editSub = E.editSub === name ? null : name; refreshSheet(); }
  function duplicateSel(){
    var id = E.sel || (targetVideo() && targetVideo().id);
    if (!id){ toast('Tap a clip first, or move the playhead onto the picture.'); return; }
    var out = {}, q = P.duplicateClip(E.hist.cur, id, out);
    if (q === E.hist.cur){ toast('There is no room to copy that clip.'); return; }
    var nf = out.id && P.findClip(q, out.id); if (nf) E.t = nf.clip.start;   // show the copy, so the tools that follow work on what you see
    E.sel = out.id || E.sel; commit(q); toast('Copied. The copy is right after it.');
  }
  function rotateSel(){
    var c = targetVideo(); if (!c){ toast('Move the playhead onto the picture, or tap a picture clip first.'); return; }
    commit(P.setTransform(E.hist.cur, c.id, { rot: ((c.transform && c.transform.rot) || 0) + 90 }));
  }
  function flipSel(){
    var c = targetVideo(); if (!c){ toast('Move the playhead onto the picture, or tap a picture clip first.'); return; }
    commit(P.setTransform(E.hist.cur, c.id, { flipH: !(c.transform && c.transform.flipH) }));
  }
  function scanQuiet(){
    var sil = P.findSilentRanges(E.proj.levels || [], { thresholdDb: E.quietDb, minMs: 700, padMs: 150 });
    var dead = P.intersectRanges(sil, P.freezeRanges(E.proj));
    if (!dead.length){ E.quiet = null; E.ui.note.textContent = 'No quiet pauses found while the picture is paused.'; return; }
    var total = 0; dead.forEach(function (r){ total += r.end - r.start; }); E.quiet = dead;
    var n = E.ui.note; n.textContent = 'Found ' + dead.length + ' quiet pause' + (dead.length > 1 ? 's' : '') + ' (' + (total / 1000).toFixed(1) + ' s) where nothing is said.';
    var yes = btn('edQuietYes', 'Remove them', 'ed-btn primary ed-small'), no = btn('edQuietNo', 'Keep', 'ed-btn ed-small');
    yes.onclick = function (){ var r = E.quiet; E.quiet = null; n.textContent = ''; commit(P.rippleDeleteRanges(E.hist.cur, r)); };
    no.onclick = function (){ E.quiet = null; n.textContent = ''; };
    add(n, yes, no);
  }
  // The picture clip a tool should work on: the selected one, or else the one under the playhead.
  function targetVideo(){
    var f = E.sel && P.findClip(E.proj, E.sel);
    if (f && f.track.kind === 'video') return f.clip;
    var s = P.sourceAt(E.proj, E.t);
    return s.video ? s.video.clip : null;
  }

  // ---------- saving your edits ----------
  // Every change (cut, trim, split, undo...) is saved on this device a moment later, so closing Naki or reloading
  // the page never loses work. Only the current result is saved, not the undo history.
  function saveSig(sess){ return [sess.durationMs, (sess.events || []).length, sess.voiceOffsetMs || 0].join('|'); }
  function showSaved(msg){ if (E.ui.saved) E.ui.saved.textContent = msg; }
  function queueSave(){
    if (!E.hooks || !E.hooks.saveProject || !E.sess) return;
    showSaved('Saving...'); clearTimeout(E.saveT); E.saveT = setTimeout(flushSave, 500);
  }
  function flushSave(){
    clearTimeout(E.saveT); E.saveT = 0;
    if (!E.hooks || !E.hooks.saveProject || !E.sess || !E.hist) return Promise.resolve();
    var rec = { sig: saveSig(E.sess), savedAt: Date.now(), project: E.hist.cur };
    return Promise.resolve(E.hooks.saveProject(E.sess.id, rec)).then(function (){ showSaved('Saved'); },
      function (){ showSaved('Not saved'); toast('Your edits could not be saved on this device.'); });
  }
  function startOver(){
    if (!E.sess || !confirm('Throw away all your edits and go back to the original recording?')) return;
    var proj = P.compileFromSession(Object.assign({}, E.sess, { voiceDurMs: E.voiceDurMs || null }));
    E.hist.reset(proj); E.proj = proj; E.sel = null; E.quiet = null; E.t = 0; E.ui.note.textContent = '';
    if (E.hooks.setMusicFile) E.hooks.setMusicFile(null);
    afterEdit(); toast('Back to the original recording.');
  }

  /* ---------- tool sheets ---------- */
  function openTool(name){
    E.tool = name;
    Object.keys(E.ui.tools).forEach(function (k){ E.ui.tools[k].classList.toggle('on', k === name); });
    E.ui.bSplit = E.ui.bCut = E.ui.bDel = null;
    if (!name){ E.ui.sheet.hidden = true; E.root.classList.remove('sheet-open'); return; }
    var def = TOOLS[name];
    E.ui.sheet.hidden = false; E.root.classList.add('sheet-open'); E.ui.stitle.textContent = def.title;
    E.ui.sbody.textContent = ''; def.build(E.ui.sbody); updateButtons();
  }
  function closeSheet(){ openTool(null); }
  function refreshSheet(){ if (E.tool && E.ui.sheet && !E.ui.sheet.hidden) openTool(E.tool); }
  function seg(options, current, onPick){
    var w = mk('div', 'ed-seg');
    options.forEach(function (o){
      var b = btn(null, o.label, 'ed-btn ed-segbtn' + (Math.abs(o.value - current) < 0.001 ? ' on' : ''));
      b.onclick = function (){ onPick(o.value); }; w.appendChild(b);
    });
    return w;
  }
  function sliderRow(label, min, max, step, val, fmtv, onInput, onChange){
    var r = mk('div', 'ed-mixrow wide'), rng = slider(min, max, step, val, label), out = mk('span', 'ed-mixval num', fmtv(val));
    rng.oninput = function (){ out.textContent = fmtv(+rng.value); if (onInput) onInput(+rng.value); };
    rng.onchange = function (){ if (onChange) onChange(+rng.value); };
    add(r, mk('span', 'ed-mixname', label), rng, out);
    return r;
  }
  var secs = function (v){ return (v / 1000).toFixed(1) + 's'; }, pct = function (v){ return Math.round(v * 100) + '%'; };
  function needPicture(body){
    var c = targetVideo();
    if (!c){ body.appendChild(mk('div', 'ed-hint', 'Move the playhead onto the picture, or tap a picture clip on the timeline.')); return null; }
    body.appendChild(mk('div', 'ed-hint', 'Working on: ' + clipTitle({ kind: 'video' }, c) + ' at ' + fmtP(c.start)));
    return c;
  }
  var TOOLS = {
    edit: { title: 'Edit', build: function (body){
      var u = E.ui, tiles = mk('div', 'ed-tiles');
      function tile(id, label, icon, run, on){
        var b = btn(id, null, 'ed-tile' + (on ? ' on' : ''), label); b.innerHTML = svg(icon) + '<span>' + label + '</span>'; b.onclick = run; tiles.appendChild(b); return b;
      }
      u.bSplit = tile('edSplit', 'Split', '<path d="M12 3v18M7 7l-3 3 3 3M17 7l3 3-3 3"/>', split);
      u.bCut = tile('edCut', 'Cut out', '<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.2 7.6L20 19M8.2 16.4L20 5"/>', cutOut);
      u.bDel = tile('edDelete', 'Delete', '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', deleteSel);
      tile('edDuplicate', 'Duplicate', '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>', duplicateSel);
      tile('edZoom', 'Zoom', '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M11 8.5v5M8.5 11h5"/>', function (){ setSub('zoom'); }, E.editSub === 'zoom');
      tile('edRotate', 'Rotate', '<path d="M20 12a8 8 0 11-2.6-5.9"/><path d="M20 4v5h-5"/>', rotateSel);
      tile('edFlip', 'Flip', '<path d="M12 3v18"/><path d="M8 7L3 12l5 5zM16 7l5 5-5 5z"/>', flipSel);
      tile('edOpacity', 'Opacity', '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>', function (){ setSub('opacity'); }, E.editSub === 'opacity');
      tile('edQuiet', 'Quiet', '<path d="M5 9v6h3l5 4V5L8 9zM17 9.5a4 4 0 010 5"/>', scanQuiet);
      body.appendChild(tiles);
      var c = targetVideo();
      if (E.editSub === 'zoom' || E.editSub === 'opacity'){
        if (!c) body.appendChild(mk('div', 'ed-hint', 'Move the playhead onto the picture, or tap a picture clip first.'));
        else if (E.editSub === 'opacity'){
          body.appendChild(sliderRow('Opacity', 0, 100, 5, Math.round((c.opacity != null ? c.opacity : 1) * 100), function (v){ return v + '%'; },
            function (v){ live(P.setOpacity(E.hist.cur, c.id, v / 100)); }, function (v){ commit(P.setOpacity(E.hist.cur, c.id, v / 100)); }));
        } else {
          var t = Object.assign({ zoom: 1, x: 0, y: 0 }, c.transform || {});
          function tz(o){ return P.setTransform(E.hist.cur, c.id, o); }
          body.appendChild(sliderRow('Zoom', 1, 4, 0.05, t.zoom, function (v){ return v.toFixed(2) + '×'; }, function (v){ live(tz({ zoom: v })); }, function (v){ commit(tz({ zoom: v })); }));
          if (t.zoom > 1){
            body.appendChild(sliderRow('Left / right', -1, 1, 0.05, t.x, function (v){ return Math.round(v * 100); }, function (v){ live(tz({ x: v })); }, function (v){ commit(tz({ x: v })); }));
            body.appendChild(sliderRow('Up / down', -1, 1, 0.05, t.y, function (v){ return Math.round(v * 100); }, function (v){ live(tz({ y: v })); }, function (v){ commit(tz({ y: v })); }));
          }
          var rz = btn('edZoomReset', 'Reset zoom, turn and flip', 'ed-btn ed-wide', 'Back to the original framing'); rz.onclick = function (){ commit(P.setTransform(E.hist.cur, c.id, { zoom: 1, x: 0, y: 0, rot: 0, flipH: false })); };
          body.appendChild(rz);
        }
      }
      body.appendChild(mk('div', 'ed-hint', 'Hold the picture still at the playhead:'));
      body.appendChild(seg([{ label: '1 s', value: 1000 }, { label: '2 s', value: 2000 }, { label: '3 s', value: 3000 }, { label: '5 s', value: 5000 }], E.freezeMs,
        function (v){ E.freezeMs = v; refreshSheet(); }));
      var bf = btn('edFreeze', 'Freeze frame', 'ed-btn ed-wide', 'Hold the picture still here'); bf.onclick = function (){ freezeHere(); };
      body.appendChild(bf);
      var info = mk('div', 'ed-selinfo'); selectedPanel(info); body.appendChild(info);
      var bs = btn('edReset', 'Start over', 'ed-btn ed-wide ed-danger', 'Throw away edits'); bs.onclick = startOver; body.appendChild(bs);
    } },
    audio: { title: 'Audio', build: function (body){
      var mt = E.proj.tracks.filter(function (t){ return t.role === 'music'; })[0], mc = mt && mt.clips[0];
      if (E.hooks.pickMusic){
        var bm = btn('edAddMusic', mt ? 'Change music' : '＋ Add music', 'ed-btn ed-wide', 'Choose a music file');
        bm.onclick = function (){
          Promise.resolve(E.hooks.pickMusic()).then(function (m){
            if (!m || !m.file) return;
            if (E.hooks.setMusicFile) E.hooks.setMusicFile(m.file);
            commit(P.ensureMusic(E.hist.cur, { name: m.name || m.file.name, durMs: m.durMs || null }));
            toast('Music added. Set its level below.');
          });
        };
        body.appendChild(bm);
      }
      renderMixInto(body.appendChild(mk('div', 'ed-mix')));
      if (mc){
        function pm(o){ return P.setClipProps(E.hist.cur, mc.id, o); }
        body.appendChild(mk('div', 'ed-hint', 'Music'));
        body.appendChild(sliderRow('Volume', 0, 100, 5, Math.round(Math.min(1, mc.volume != null ? mc.volume : 1) * 100), function (v){ return v + '%'; },
          function (v){ live(pm({ volume: v / 100 })); }, function (v){ commit(pm({ volume: v / 100 })); }));
        var half = Math.min(5000, Math.floor(mc.dur / 2));
        body.appendChild(sliderRow('Fade in', 0, half, 100, Math.min(half, mc.fadeIn || 0), secs,
          function (v){ live(pm({ fadeIn: v, fadeInOff: 0 })); }, function (v){ commit(pm({ fadeIn: v, fadeInOff: 0 })); }));
        body.appendChild(sliderRow('Fade out', 0, half, 100, Math.min(half, mc.fadeOut || 0), secs,
          function (v){ live(pm({ fadeOut: v, fadeOutOff: 0 })); }, function (v){ commit(pm({ fadeOut: v, fadeOutOff: 0 })); }));
        var br = btn('edRemoveMusic', 'Remove music', 'ed-btn ed-wide', 'Remove the music');
        br.onclick = function (){ if (E.hooks.setMusicFile) E.hooks.setMusicFile(null); commit(P.removeMusic(E.hist.cur)); };
        body.appendChild(br);
      } else if (!E.hooks.pickMusic) body.appendChild(mk('div', 'ed-hint', 'Music is not available here.'));
    } },
    text: { title: 'Text', build: function (body){
      var ba = btn('edAddText', '＋ Add text here', 'ed-btn ed-wide', 'Add a title at the playhead');
      ba.onclick = function (){
        var out = {}, q = P.addTextClip(E.hist.cur, Math.round(E.t), 3000, out);
        if (q === E.hist.cur){ toast('There is no room for text at the playhead. Move it or shorten the other text.'); return; }
        E.sel = out.id; commit(q);
      };
      body.appendChild(ba);
      var f = E.sel && P.findClip(E.proj, E.sel);
      if (f && f.track.kind === 'text'){
        var c = f.clip;
        function pt(o){ return P.setTextProps(E.hist.cur, c.id, o); }
        var ti = mk('input', 'ed-textin'); ti.type = 'text'; ti.value = c.text || ''; ti.setAttribute('aria-label', 'Text');
        ti.oninput = function (){ live(pt({ text: ti.value })); }; ti.onchange = function (){ commit(pt({ text: ti.value })); };
        body.appendChild(ti);
        body.appendChild(sliderRow('Size', 3, 16, 1, c.size || 7, function (v){ return v + '%'; }, function (v){ live(pt({ size: v })); }, function (v){ commit(pt({ size: v })); }));
        var posRow = mk('div', 'ed-seg');
        [['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']].forEach(function (o){
          var b = btn(null, o[1], 'ed-btn ed-segbtn' + (c.pos === o[0] ? ' on' : '')); b.onclick = function (){ commit(pt({ pos: o[0] })); }; posRow.appendChild(b);
        });
        body.appendChild(posRow);
        var colRow = mk('div', 'ed-mixrow wide'), ci = mk('input'); ci.type = 'color'; ci.value = c.color || '#ffffff'; ci.setAttribute('aria-label', 'Text colour');
        ci.oninput = function (){ live(pt({ color: ci.value })); }; ci.onchange = function (){ commit(pt({ color: ci.value })); };
        var bb = btn(null, c.bg ? 'Dark box: on' : 'Dark box: off', 'ed-btn ed-small' + (c.bg ? ' on' : '')); bb.onclick = function (){ commit(pt({ bg: !c.bg })); };
        add(colRow, mk('span', 'ed-mixname', 'Colour'), ci, bb); body.appendChild(colRow);
        var bd = btn('edDeleteText', 'Delete text', 'ed-btn ed-wide', 'Delete this text'); bd.onclick = function (){ var id = c.id; E.sel = null; commit(P.deleteClip(E.hist.cur, id)); };
        body.appendChild(bd);
        body.appendChild(mk('div', 'ed-hint', 'Drag the text on the timeline to move it, or its ends to change how long it shows.'));
      } else {
        var tr = E.proj.tracks.filter(function (t){ return t.kind === 'text'; })[0];
        if (tr && tr.clips.length){
          body.appendChild(mk('div', 'ed-hint', 'Your texts. Tap one to change it:'));
          tr.clips.forEach(function (c){ var b = btn(null, (c.text || 'Text') + ' · ' + fmtP(c.start), 'ed-btn ed-wide'); b.onclick = function (){ E.sel = c.id; seek(c.start); select(c.id); }; body.appendChild(b); });
        } else body.appendChild(mk('div', 'ed-hint', 'Titles you add show on the video from the playhead for 3 seconds.'));
      }
    } },
    speed: { title: 'Speed', build: function (body){
      var c = needPicture(body); if (!c) return;
      if (c.type !== 'video'){ body.appendChild(mk('div', 'ed-hint', 'A paused picture has no speed. Pick a clip where the movie plays.')); return; }
      var cur = c.speed || 1;
      body.appendChild(seg([{ label: '0.5×', value: 0.5 }, { label: '0.75×', value: 0.75 }, { label: '1×', value: 1 }, { label: '1.5×', value: 1.5 }, { label: '2×', value: 2 }, { label: '3×', value: 3 }], cur,
        function (v){ commit(P.setClipSpeed(E.hist.cur, c.id, v)); }));
      body.appendChild(sliderRow('Speed', 0.25, 4, 0.05, cur, function (v){ return v.toFixed(2) + '×'; }, null, function (v){ commit(P.setClipSpeed(E.hist.cur, c.id, v)); }));
      body.appendChild(mk('div', 'ed-hint', 'The picture and its sound change together. The movie clips after it move up or back. Your voice stays where it is.'));
    } },
    fade: { title: 'Fade', build: function (body){
      var c = needPicture(body); if (!c) return;
      function pf(o){ return P.setVFade(E.hist.cur, c.id, o); }
      var half = Math.min(1500, Math.floor(c.dur / 2));
      body.appendChild(sliderRow('Fade in', 0, half, 100, Math.min(half, c.vFadeIn || 0), secs, null, function (v){ commit(pf({ vFadeIn: v })); }));
      body.appendChild(sliderRow('Fade out', 0, half, 100, Math.min(half, c.vFadeOut || 0), secs, null, function (v){ commit(pf({ vFadeOut: v })); }));
      body.appendChild(mk('div', 'ed-hint', 'The picture fades from or to black. Sound is not changed.'));
    } },
    filter: { title: 'Filter', build: function (body){
      var c = needPicture(body); if (!c) return;
      var fl = Object.assign({ brightness: 1, contrast: 1, saturate: 1 }, c.filter || {});
      [['Brightness', 'brightness', 0.4, 1.6], ['Contrast', 'contrast', 0.4, 1.6], ['Colour', 'saturate', 0, 2]].forEach(function (o){
        function one(v){ var p = {}; p[o[1]] = v; return p; }
        body.appendChild(sliderRow(o[0], o[2], o[3], 0.05, fl[o[1]], pct, function (v){ live(P.setFilter(E.hist.cur, c.id, one(v))); }, function (v){ commit(P.setFilter(E.hist.cur, c.id, one(v))); }));
      });
      var row = mk('div', 'ed-actions');
      var ba = btn('edFilterAll', 'Use on all clips', 'ed-btn', 'Copy this look to every picture clip'); ba.onclick = function (){ commit(P.setFilter(E.hist.cur, null, fl)); toast('This look is on every clip now.'); };
      var br = btn('edFilterReset', 'Reset', 'ed-btn', 'Back to the original look'); br.onclick = function (){ commit(P.setFilter(E.hist.cur, c.id, { brightness: 1, contrast: 1, saturate: 1 })); };
      add(row, ba, br); body.appendChild(row);
    } }
  };

  /* ---------- titles drawn over the preview ---------- */
  function layoutTextLayer(){
    var m = E.hooks && E.hooks.movie, st = E.ui.stage, boxes = [E.ui.textlayer, E.ui.picframe]; if (!boxes[0]) return;
    var sw = st.clientWidth, sh = st.clientHeight, vw = m && m.videoWidth, vh = m && m.videoHeight;
    boxes.forEach(function (l){
      if (sw && sh && vw && vh){
        var sc = Math.min(sw / vw, sh / vh), w = vw * sc, h = vh * sc;
        l.style.left = ((sw - w) / 2) + 'px'; l.style.top = ((sh - h) / 2) + 'px'; l.style.width = w + 'px'; l.style.height = h + 'px';
      } else { l.style.left = l.style.top = '0'; l.style.width = l.style.height = '100%'; }
    });
  }
  // CSS for a clip's zoom / turn / flip. Same order as the export: flip, turn, zoom into what you see.
  function transformCss(t, aspect){
    if (!t) return '';
    var z = t.zoom || 1, rot = t.rot || 0, fit = (rot === 90 || rot === 270) ? Math.min(aspect, 1 / aspect) : 1;
    return 'translate(' + (-(t.x || 0) * (z - 1) * 50) + '%,' + (-(t.y || 0) * (z - 1) * 50) + '%) scale(' + (z * fit) + ') rotate(' + rot + 'deg)' + (t.flipH ? ' scaleX(-1)' : '');
  }
  function renderTexts(list){
    var layer = E.ui.textlayer; if (!layer) return;
    var want = {};
    list.forEach(function (c){
      want[c.id] = true;
      var d = E.textEls[c.id];
      if (!d){ d = E.textEls[c.id] = mk('div', 'ed-textov'); layer.appendChild(d); layoutTextLayer(); }
      if (d._txt !== c.text){ d.textContent = c.text || ''; d._txt = c.text; }
      d.style.fontSize = Math.round((c.size || 7) / 100 * (layer.clientHeight || 240)) + 'px';
      d.style.color = c.color || '#fff'; d.style.fontWeight = c.weight || 700;
      d.style.top = ((NP.TEXT_POS[c.pos] != null ? NP.TEXT_POS[c.pos] : NP.TEXT_POS.bottom) * 100) + '%';
      d.style.background = c.bg ? 'rgba(0,0,0,.55)' : 'transparent';
    });
    Object.keys(E.textEls).forEach(function (id){ if (!want[id]){ E.textEls[id].remove(); delete E.textEls[id]; } });
  }

  // ---------- zoom and position ----------
  function fit(){
    var w = E.ui.scroll.clientWidth || 600;
    E.ppm = clamp((w - PAD * 2) / Math.max(E.proj.durationMs, 1000), MIN_PPM, 0.2);
    renderTimeline(); E.ui.scroll.scrollLeft = 0;
  }
  function setZoom(ppm, anchorX){
    var sc = E.ui.scroll, ax = anchorX != null ? anchorX - sc.getBoundingClientRect().left : sc.clientWidth / 2;
    var tA = (sc.scrollLeft + ax - PAD) / E.ppm;
    E.ppm = clamp(ppm, MIN_PPM, MAX_PPM); renderTimeline(); sc.scrollLeft = PAD + tA * E.ppm - ax;
  }
  function seek(ms){
    E.t = clamp(Math.round(ms), 0, E.proj.durationMs);
    if (E.playing){ E.wall = performance.now(); E.wallT = E.t; }
    placeHead(); readout(); updateButtons(); syncMedia();
  }
  function xToT(clientX){ return (clientX - E.ui.inner.getBoundingClientRect().left - PAD) / E.ppm; }

  // ---------- playback ----------
  function movieReady(){ return !!(E.hooks.movieReady && E.hooks.movieReady()); }
  function gainSetup(key, el){
    var h = E.hooks; if (h.simple || E[key] || !el) return;
    var ctx = h.getCtx && h.getCtx(); if (!ctx) return;
    try { var src = ctx.createMediaElementSource(el), g = ctx.createGain(); src.connect(g); g.connect(ctx.destination); E[key] = g; } catch (e) {}
  }
  function setGain(key, el, v){
    var h = E.hooks;
    if (E[key]){ var ctx = h.getCtx(); E[key].gain.setTargetAtTime(v, ctx.currentTime, 0.02); el.volume = 1; }
    else el.volume = clamp(v, 0, 1);
  }
  // picture fade through black: 0..1 opacity at timeline time t
  function fadeOpacity(c, t){
    var rel = t - c.start, o = 1;
    if (c.vFadeIn && rel < c.vFadeIn) o = Math.min(o, rel / c.vFadeIn);
    if (c.vFadeOut && c.dur - rel < c.vFadeOut) o = Math.min(o, Math.max(0, (c.dur - rel) / c.vFadeOut));
    return clamp(o, 0, 1);
  }
  function syncMedia(){
    var h = E.hooks, m = h.movie, v = h.voice, s = P.sourceAt(E.proj, E.t);
    var look = s.video && s.video.clip.filter, css = look ? 'brightness(' + look.brightness + ') contrast(' + look.contrast + ') saturate(' + look.saturate + ')' : '';
    var vc = s.video && s.video.clip, op = vc ? String(fadeOpacity(vc, E.t) * (vc.opacity != null ? vc.opacity : 1)) : '0';
    var tcss = vc ? transformCss(vc.transform, (m.videoWidth && m.videoHeight) ? m.videoWidth / m.videoHeight : 16 / 9) : '';
    if (tcss !== E.lastTransform){ m.style.transform = tcss; E.lastTransform = tcss; }
    if (css !== E.lastFilter){ m.style.filter = css; E.lastFilter = css; }
    if (op !== E.lastOpacity){ m.style.opacity = op; E.lastOpacity = op; }
    if (movieReady()){
      if (s.video){
        var target = s.video.movieMs / 1000, rate = s.video.clip.speed || 1;
        if (E.playing && s.video.type === 'video'){
          if (rate !== E.lastRate){ try { m.playbackRate = rate; } catch (e) {} E.lastRate = rate; }
          if (m.paused){ var pr = m.play(); if (pr && pr.catch) pr.catch(function (){}); }
          if (Math.abs(m.currentTime - target) > 0.3) m.currentTime = target;
        } else {
          if (E.lastRate !== 1){ try { m.playbackRate = 1; } catch (e) {} E.lastRate = 1; }
          if (!m.paused) m.pause();
          if (Math.abs(m.currentTime - target) > 0.06) m.currentTime = target;
        }
      } else if (!m.paused) m.pause();
    }
    renderTexts(P.textsAt(E.proj, E.t));
    var ms = null, vo = null, mu = null;
    s.audio.forEach(function (a){ if (a.role === 'movieSound') ms = a; else if (a.role === 'voice') vo = a; else if (a.role === 'music') mu = a; });
    h.setMovieGain(ms ? ms.gain : 0);
    if (E.playing && vo){
      if (v.paused){ v.currentTime = vo.sourceMs / 1000; var pv = v.play(); if (pv && pv.catch) pv.catch(function (){}); }
      else if (Math.abs(v.currentTime * 1000 - vo.sourceMs) > 250) v.currentTime = vo.sourceMs / 1000;
      setGain('voiceGain', v, vo.gain);
    } else if (!v.paused) v.pause();
    var mo = h.music;
    if (mo){
      if (E.playing && mu && mo.src){
        var mt = mu.sourceMs / 1000;
        if (mo.paused){ mo.currentTime = mt; var pm = mo.play(); if (pm && pm.catch) pm.catch(function (){}); }
        else if (Math.abs(mo.currentTime - mt) > 0.3) mo.currentTime = mt;
        setGain('musicGain', mo, mu.gain);
      } else if (!mo.paused) mo.pause();
    }
  }
  function togglePlay(){ if (E.playing) pause(); else play(); }
  function play(){
    if (E.playing) return;
    if (!movieReady()){ toast('Choose the movie for this session first.'); return; }
    E.hooks.ensureAudio(); gainSetup('voiceGain', E.hooks.voice); gainSetup('musicGain', E.hooks.music);
    var ctx = E.hooks.getCtx && E.hooks.getCtx(); if (ctx && ctx.resume) ctx.resume();
    if (E.t >= E.proj.durationMs - 50) E.t = 0;
    E.playing = true; E.wall = performance.now(); E.wallT = E.t; updateButtons(); loop();
  }
  function pause(){
    E.playing = false; if (E.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(E.raf); E.raf = 0;
    try { E.hooks.movie.pause(); E.hooks.voice.pause(); if (E.hooks.music) E.hooks.music.pause(); } catch (e) {}
    updateButtons();
  }
  function loop(){
    if (!E.playing) return;
    E.t = E.wallT + (performance.now() - E.wall);
    if (E.t >= E.proj.durationMs){ E.t = E.proj.durationMs; pause(); placeHead(); readout(); return; }
    syncMedia(); placeHead(); readout();
    var sc = E.ui.scroll, x = tx(E.t);
    if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 40);
    E.raf = requestAnimationFrame(loop);
  }

  // ---------- touch, mouse and pen on the timeline ----------
  function onDown(ev){
    var tg = ev.target, clipE = tg.closest && tg.closest('.ed-clip'), handle = tg.closest && tg.closest('.ed-h');
    if (ev.pointerType === 'touch'){
      E.pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      if (Object.keys(E.pointers).length === 2){ endDrag(true); startPinch(); return; }
    }
    if (E.pinch) return;
    if (clipE){
      var id = clipE.dataset.id, f = P.findClip(E.proj, id); if (!f) return;
      E.sel = id; var tr = f.track, c = f.clip;
      E.drag = { mode: handle ? (handle.classList.contains('ed-hl') ? 'trimL' : 'trimR') : 'pending', id: id, x0: ev.clientX, el: clipE, tr: tr,
        s0: c.start, e0: c.start + c.dur, touch: ev.pointerType === 'touch', moved: false, press: 0 };
      if (E.drag.mode === 'pending' && E.drag.touch) E.drag.press = setTimeout(function (){
        if (E.drag && E.drag.mode === 'pending'){ E.drag.mode = 'move'; try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} }
      }, 380);
      if (E.drag.mode === 'pending' && (tr.role === 'movie' || tr.role === 'movieSound')) E.drag.noMove = true;
      renderSelectionOnly();
    } else {
      E.drag = { mode: 'scrub' }; seek(xToT(ev.clientX));
    }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onCancel);
  }
  function renderSelectionOnly(){
    var els = E.ui.inner.querySelectorAll('.ed-clip');
    for (var i = 0; i < els.length; i++) els[i].classList.toggle('sel', els[i].dataset.id === E.sel);
    renderSelected(); updateButtons(); refreshSheet();
  }
  function snapped(t){ return P.snapTime(E.proj, t, 8 / E.ppm, [E.t]); }
  function onMove(ev){
    if (ev.pointerType === 'touch' && E.pointers[ev.pointerId]) E.pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    if (E.pinch){ movePinch(); return; }
    var d = E.drag; if (!d) return;
    var dx = ev.clientX - d.x0;
    if (d.mode === 'scrub'){ seek(xToT(ev.clientX)); return; }
    if (d.mode === 'pending'){
      if (d.touch){ if (Math.abs(dx) > 10){ clearTimeout(d.press); E.drag = null; } return; }
      if (Math.abs(dx) > 4 && !d.noMove) d.mode = 'move'; else return;
    }
    d.moved = true; var dt = dx / E.ppm;
    if (d.mode === 'trimL'){ d.newStart = clamp(snapped(d.s0 + dt), 0, d.e0 - 100); d.el.style.left = tx(d.newStart) + 'px'; d.el.style.width = Math.max(3, (d.e0 - d.newStart) * E.ppm) + 'px'; }
    else if (d.mode === 'trimR'){ d.newEnd = Math.max(d.s0 + 100, snapped(d.e0 + dt)); d.el.style.width = Math.max(3, (d.newEnd - d.s0) * E.ppm) + 'px'; }
    else if (d.mode === 'move'){ d.newStart = Math.max(0, snapped(d.s0 + dt)); d.el.style.left = tx(d.newStart) + 'px'; }
  }
  function onUp(){ endDrag(false); }
  function onCancel(){ endDrag(true); }
  function endDrag(cancel){
    var d = E.drag; E.drag = null;
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel);
    E.pointers = {}; E.pinch = null;
    if (!d) return; clearTimeout(d.press);
    if (cancel){ renderTimeline(); return; }
    if (d.mode === 'trimL' || d.mode === 'trimR') finishTrim(d);
    else if (d.mode === 'move' && d.moved){
      var q = P.moveClip(E.hist.cur, d.id, d.newStart);
      if (q === E.hist.cur){ toast('There is no room for it there.'); renderTimeline(); } else commit(q);
    }
  }
  function finishTrim(d){
    var cur = E.hist.cur, q = cur, ripple = d.tr.role === 'movie' || d.tr.role === 'movieSound';
    if (d.mode === 'trimR' && d.newEnd != null){
      if (ripple){ if (d.newEnd < d.e0) q = P.rippleDelete(cur, Math.round(d.newEnd), d.e0); } else q = P.trimClipEnd(cur, d.id, d.newEnd);
    } else if (d.mode === 'trimL' && d.newStart != null){
      if (ripple){ if (d.newStart > d.s0) q = P.rippleDelete(cur, d.s0, Math.round(d.newStart)); } else q = P.trimClipStart(cur, d.id, d.newStart);
    }
    if (q === cur){ renderTimeline(); return; }
    if (ripple){ var a = d.mode === 'trimR' ? d.newEnd : d.s0, b = d.mode === 'trimR' ? d.e0 : d.newStart; if (E.t > a) E.t = E.t >= b ? E.t - (b - a) : a; }
    commit(q);
  }
  function pinchDist(){ var k = Object.keys(E.pointers); if (k.length < 2) return 0; var a = E.pointers[k[0]], b = E.pointers[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y); }
  function startPinch(){ E.pinch = { d0: pinchDist() || 1, ppm0: E.ppm }; }
  function movePinch(){
    var k = Object.keys(E.pointers); if (k.length < 2) return;
    var a = E.pointers[k[0]], b = E.pointers[k[1]];
    setZoom(E.pinch.ppm0 * pinchDist() / E.pinch.d0, (a.x + b.x) / 2);
  }

  // ---------- keyboard (computer) ----------
  function onKey(ev){
    if (!E.isOpen) return;
    var tg = ev.target, tag = tg && tg.tagName, k = ev.key, mod = ev.ctrlKey || ev.metaKey, ok = true;
    if (tag === 'TEXTAREA' || (tag === 'INPUT' && tg.type !== 'range' && tg.type !== 'checkbox')) return;
    if (mod){
      if (k === 'z' || k === 'Z'){ if (ev.shiftKey) redo(); else undo(); }
      else if (k === 'y' || k === 'Y') redo(); else ok = false;
    }
    else if (k === ' ' || k === 'Enter'){ if (tag === 'BUTTON') ok = false; else togglePlay(); }
    else if (k === 's' || k === 'S') split();
    else if (k === 'Delete' || k === 'Backspace'){ if (ev.shiftKey) deleteSel(); else cutOut(); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight'){
      if (tag === 'INPUT') ok = false; else seek(E.t + (k === 'ArrowLeft' ? -1 : 1) * (ev.shiftKey ? 1000 : FRAME_MS));
    }
    else if (k === 'Home') seek(0); else if (k === 'End') seek(E.proj.durationMs);
    else if (k === '+' || k === '=') setZoom(E.ppm * 1.4); else if (k === '-') setZoom(E.ppm / 1.4);
    else if (k === 'Escape'){ if (E.tool) closeSheet(); else select(null); }
    else ok = false;
    if (ok) ev.preventDefault();
  }

  // ---------- opening and closing ----------
  function init(hooks){ E.hooks = hooks; }
  // The project for a session. Your saved edits are used when this device has them for this same recording.
  function cacheFor(sess, opts){
    var key = sess.id || 'session', sig = [sess.durationMs, (sess.events || []).length, sess.voiceNudgeMs || 0, sess.voiceOffsetMs || 0].join('|'), c = E.cache[key];
    if (!c || c.sig !== sig){
      var saved = !c && opts && opts.saved, proj;
      if (saved && saved.project && saved.sig === saveSig(sess) && P.validate(saved.project).length === 0) proj = saved.project;
      else proj = P.compileFromSession(Object.assign({}, sess, { voiceDurMs: (opts && opts.voiceDurMs) || null }));
      var hist = new P.EditHistory(); hist.reset(proj); c = E.cache[key] = { sig: sig, hist: hist, restored: !!(saved && saved.project && proj === saved.project) };
    }
    return c;
  }
  // The edited timeline as an export plan. If the editor was never opened, your saved edits (or the untouched recording) are used.
  function planFor(sess, opts){ return NP.projectToPlan(cacheFor(sess, opts).hist.cur); }
  function open(sess, opts){
    if (!E.hooks) throw new Error('NakiEditor.init() must be called first');
    if (!E.root) build();
    opts = opts || {};
    var c = cacheFor(sess, opts);
    E.hist = c.hist; E.proj = c.hist.cur; E.sess = sess; E.sel = null; E.t = 0; E.playing = false; E.quiet = null; E.voiceDurMs = opts.voiceDurMs || null;
    E.quietDb = -42; (sess.events || []).forEach(function (e){ if (e.type === 'duck' && typeof e.thresholdDb === 'number') E.quietDb = e.thresholdDb; });
    var m = E.hooks.movie; E.home = m.parentNode ? { parent: m.parentNode, next: m.nextSibling } : null;
    E.ui.picframe.insertBefore(m, E.ui.picframe.firstChild);
    E.ui.stageMsg.textContent = movieReady() ? '' : 'Choose the movie for this session in Preview first, then come back to edit.';
    E.ui.note.textContent = c.restored ? 'Your earlier edits were restored.' : '';
    showSaved(c.restored || c.hist.past.length ? 'Saved' : '');
    E.lastFilter = ''; E.lastOpacity = ''; E.lastRate = 1; E.lastTransform = ''; E.editSub = null;
    E.root.classList.remove('sheet-open'); E.tool = null; E.ui.sheet.hidden = true; openTool(null);
    E.root.hidden = false; E.isOpen = true;
    document.addEventListener('keydown', onKey);
    layoutTextLayer(); fit(); readout(); syncMedia();
  }
  function close(){
    if (!E.isOpen) return;
    pause(); endDrag(true);
    if (E.saveT) flushSave();
    document.removeEventListener('keydown', onKey);
    var h = E.hooks; try { h.voice.volume = 1; if (E.voiceGain) E.voiceGain.gain.value = 1; if (E.musicGain) E.musicGain.gain.value = 1; h.setMovieGain(1); } catch (e) {}
    try { h.movie.style.filter = ''; h.movie.style.opacity = ''; h.movie.style.transform = ''; h.movie.playbackRate = 1; } catch (e) {}
    renderTexts([]);
    if (E.home && E.home.parent) E.home.parent.insertBefore(h.movie, E.home.next);
    E.root.hidden = true; E.isOpen = false;
    if (h.onClose) h.onClose();
  }

  return { init: init, open: open, close: close, isOpen: function (){ return E.isOpen; },
    project: function (){ return E.proj; }, split: split, cutOut: cutOut, deleteSel: deleteSel, undo: undo, redo: redo, select: select,
    seek: seek, planFor: planFor, scanQuiet: scanQuiet, play: play, pause: pause, setZoom: setZoom, fit: fit,
    openTool: openTool, freezeHere: freezeHere, flushSave: flushSave, duplicateSel: duplicateSel, rotateSel: rotateSel, flipSel: flipSel };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NakiEditor;
