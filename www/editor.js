'use strict';
/* Naki editor: the timeline screen (phone and computer). Sits on top of project.js.
   The host page (index.html) calls NakiEditor.init({...}) once, then NakiEditor.open(session).
   Layout, CapCut style: a dock along the bottom. Main toolbar -> tap Edit / Audio / Text or a clip -> a row of tools with a back arrow
   -> a tool with settings -> a small panel with a tick. Nothing slides up over the picture or the timeline. */
var NakiEditor = (function () {
  var P = (typeof module !== 'undefined' && module.exports) ? require('./project.js') : window.NakiProject;
  var NP = (typeof module !== 'undefined' && module.exports) ? require('./plan.js') : window.NakiPlan;
  var NF = (typeof module !== 'undefined' && module.exports) ? require('./format.js') : (typeof window !== 'undefined' ? window.NakiFormat : null);
  var PAD = 16, MIN_PPM = 0.004, MAX_PPM = 0.6, FRAME_MS = 33;
  var ROLE_NAME = { movie: 'Picture', movieSound: 'Movie sound', voice: 'Your voice', music: 'Music', text: 'Text', captions: 'Captions' };
  var E = { hooks: null, root: null, ui: {}, hist: null, proj: null, sess: null, sel: null, t: 0, playing: false, ppm: 0.06,
    cache: {}, magnet: false, drag: null, raf: 0, wall: 0, wallT: 0, isOpen: false, home: null, pointers: {}, pinch: null,
    voiceGain: null, musicGain: null, quiet: null, quietDb: -42, tool: null, textEls: {}, freezeMs: 2000, saveT: 0, voiceDurMs: null, lastFilter: '', lastOpacity: '', lastRate: 1,
    panel: null, chip: {}, autoDock: false, rowScroll: null, revTold: false, lastTint: '', lastVeil: '', lastSharp: -1 };

  function mk(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function add(parent){ for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }
  function btn(id, text, cls, label){ var b = mk('button', cls || 'ed-btn', text); b.type = 'button'; if (id) b.id = id; if (label) b.setAttribute('aria-label', label); return b; }
  function iconBtn(id, svg, label, cls){ var b = btn(id, null, cls || 'ed-ibtn', label); b.innerHTML = svg; return b; }
  function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
  function fmtP(ms){ ms = Math.max(0, ms); var s = ms / 1000, m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }
  function tx(t){ return PAD + t * E.ppm; }
  function toast(m){ if (E.hooks && E.hooks.toast) E.hooks.toast(m); }
  // look.js (the "More adjust" looks) is looked up when it is needed, not when this file loads, so the order of the <script> tags
  // does not matter. If it is not there at all the editor still opens, without those looks, and says so once.
  var NO_LOOK = { extras: function (){ return { warmth: 0, sharpen: 0, vignette: 0, matte: 0 }; }, tintCss: function (){ return null; }, matteCss: function (){ return null; },
    vignetteCss: function (){ return null; }, sharpenKernel: function (){ return '0 0 0 0 1 0 0 0 0'; },
    fontList: function (){ return []; }, titleStyle: function (t, H){ return { px: Math.round((t.size || 7) / 100 * H), fontFamily: '', stroke: '', shadow: '0 1px 3px rgba(0,0,0,.7)' }; } };
  var lookWarned = false;
  function lookLib(){
    var L = (typeof module !== 'undefined' && module.exports) ? require('./look.js') : (typeof window !== 'undefined' ? window.NakiLook : null);
    if (L) return L;
    if (!lookWarned){ lookWarned = true; toast('look.js is not loaded, so the More adjust looks are off. Add <script src="look.js"></script> to index.html.'); }
    return NO_LOOK;
  }
  function clipCount(p){ var n = 0; p.tracks.forEach(function (t){ n += t.clips.length; }); return n; }
  function rowH(tr){ return tr.kind === 'video' ? 56 : tr.kind === 'text' ? 30 : 44; }
  function svg(path, fill){ return '<svg viewBox="0 0 24 24" ' + (fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"') + '>' + path + '</svg>'; }
  var ICON = {
    play: svg('<path d="M8 5.5v13l11-6.5z"/>', true), pause: svg('<path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/>', true),
    undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>'), redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>')
  };

  /* ---------- tools (the toolbar along the bottom) ---------- */
  var TOOL_LIST = [
    { name: 'edit', label: 'Edit', icon: svg('<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.2 7.6L20 19M8.2 16.4L20 5"/>'), go: function (){ openTool('edit'); } },
    { name: 'audio', label: 'Audio', icon: svg('<path d="M9 18.5a2.8 2.8 0 11-2.8-2.8c.5 0 1 .1 1.4.4V5l11-2.5v13.6a2.8 2.8 0 11-2.8-2.8c.5 0 1 .1 1.4.4V6.1L9 8.3z"/>', true), go: function (){ openTool('audio'); } },
    { name: 'text', label: 'Text', icon: svg('<path d="M5 6.5V5h14v1.5M12 5v14M9.5 19h5"/>'), go: function (){ openTool('text'); } },
    { name: 'speed', label: 'Speed', icon: svg('<path d="M4 15a8 8 0 1116 0"/><path d="M12 15l4-5"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/>'), go: function (){ openPanel('speed', 'edit'); } },
    { name: 'filter', label: 'Adjust', icon: svg('<path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h12M20 17h0"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="17" r="2"/>'), go: function (){ openPanel('adjust', 'edit'); } },
    { name: 'format', label: 'Format', icon: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10v4M17 10v4"/>'), go: function (){ openPanel('format'); } }
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
    u.bgvid = mk('video', 'ed-bgvid'); u.bgvid.muted = true; u.bgvid.setAttribute('playsinline', ''); u.bgvid.setAttribute('aria-hidden', 'true'); u.bgvid.preload = 'auto';
    u.picbox = mk('div', 'ed-picbox'); u.picframe.appendChild(u.bgvid); u.picframe.appendChild(u.picbox);
    // "More adjust" looks are laid over the picture here: a colour layer that multiplies (warmth), and a veil (faded look + vignette)
    u.picframe.style.isolation = 'isolate';
    u.tint = mk('div'); u.tint.style.cssText = 'position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;display:none';
    u.veil = mk('div'); u.veil.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none';
    u.picframe.appendChild(u.tint); u.picframe.appendChild(u.veil);
    var NS = 'http://www.w3.org/2000/svg', sv = document.createElementNS(NS, 'svg'), fl = document.createElementNS(NS, 'filter'); u.sharpK = document.createElementNS(NS, 'feConvolveMatrix');
    sv.setAttribute('width', '0'); sv.setAttribute('height', '0'); sv.style.position = 'absolute'; fl.setAttribute('id', 'nakiSharp');
    u.sharpK.setAttribute('order', '3'); u.sharpK.setAttribute('preserveAlpha', 'true'); u.sharpK.setAttribute('kernelMatrix', '0 0 0 0 1 0 0 0 0');
    fl.appendChild(u.sharpK); sv.appendChild(fl); u.stage.appendChild(sv);
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

    // the dock along the bottom, the way CapCut does it: the main toolbar; tap Edit / Audio / Text or a clip and it turns into
    // a row of tools with a back arrow; a tool with settings turns that row into a small panel with a tick
    var tb = mk('div', 'ed-toolbar'); u.tools = {};
    TOOL_LIST.forEach(function (t){
      var b = btn('edTool_' + t.name, null, 'ed-tool', t.label);
      b.innerHTML = t.icon + '<span>' + t.label + '</span>'; b.dataset.tool = t.name;
      b.onclick = t.go; tb.appendChild(b); u.tools[t.name] = b;
    });
    u.toolbar = tb; u.dock = mk('div', 'ed-dock'); u.dock.appendChild(tb);

    add(root, top, u.stage, u.insp, bar, u.note, tl, u.dock);
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
    // The preview area changes height whenever the dock turns from toolbar to tool row to panel, so the picture is re-fitted each time
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function (){ if (E.isOpen){ layoutTextLayer(); renderTexts(P.textsAt(E.proj, E.t)); } }).observe(u.stage);
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
      var extra = (c.speed && c.speed !== 1 ? ' ' + c.speed + '×' : '') + (c.filter ? ' · filter' : '') + (c.vFadeIn || c.vFadeOut ? ' · fade' : '') + (c.opacity != null ? ' · ' + Math.round(c.opacity * 100) + '%' : '') + (c.reverse ? ' · reversed' : '') + (c.transform ? ' · ' + (c.transform.zoom > 1 ? 'zoom ' : '') + (c.transform.rot ? c.transform.rot + '° ' : '') + (c.transform.flipH ? 'flip' : '') : '');
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
    renderAll(); syncMedia(); syncDock(); queueSave();
  }
  function undo(){ E.hist.undo(); E.proj = E.hist.cur; E.quiet = null; E.ui.note.textContent = ''; afterEdit(); }
  function redo(){ E.hist.redo(); E.proj = E.hist.cur; E.quiet = null; E.ui.note.textContent = ''; afterEdit(); }
  function select(id){ E.sel = id || null; renderTimeline(); syncDock(); }
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
    var id = E.sel, f0 = P.findClip(E.proj, id), pic = !!(f0 && (f0.track.role === 'movie' || f0.track.role === 'movieSound')); E.sel = null;
    var q0 = P.deleteClip(E.hist.cur, id); commit(pic ? tidy(q0) : q0);
  }
  function freezeHere(ms){
    var q = P.insertFreeze(E.hist.cur, Math.round(E.t), ms || E.freezeMs);
    if (q === E.hist.cur){ toast('Move the playhead onto the picture first.'); return; }
    commit(q); toast('Picture held for ' + ((ms || E.freezeMs) / 1000) + ' s. Everything after it moved later.');
  }
  function duplicateSel(){
    var id = E.sel || (targetVideo() && targetVideo().id);
    if (!id){ toast('Tap a clip first, or move the playhead onto the picture.'); return; }
    var out = {}, q = P.duplicateClip(E.hist.cur, id, out);
    if (q === E.hist.cur){ toast('There is no room to copy that clip.'); return; }
    var nf = out.id && P.findClip(q, out.id); if (nf) E.t = nf.clip.start;   // show the copy, so the tools that follow work on what you see
    E.sel = out.id || E.sel; commit(q); toast('Copied. The copy is right after it.');
  }
  // ----- joining, closing gaps, magnet, and dragging clips -----
  // With Magnet on, gaps in the picture close by themselves after a delete, trim or move. Voice, music and text stay where they are.
  function tidy(q){ return E.magnet ? P.closeGaps(q) : q; }
  function joinSel(){
    var id = E.sel, f = id && P.findClip(E.proj, id);
    if (!f){ var t = targetVideo(); id = t && t.id; }
    if (!id){ toast('Tap a clip first, or move the playhead onto the picture.'); return; }
    var out = {}, q = P.joinWithNext(E.hist.cur, id, out);
    if (out.msg) toast(out.msg);
    if (q !== E.hist.cur) commit(q);
  }
  // Closes the gap under the playhead; if the playhead is not in a gap, closes every gap in the picture.
  function closeGapHere(){
    var q = P.closeGaps(E.hist.cur, Math.round(E.t));
    if (q === E.hist.cur) q = P.closeGaps(E.hist.cur);
    if (q === E.hist.cur){ toast('There are no gaps in the picture.'); return; }
    commit(q);
  }
  function toggleMagnet(){
    E.magnet = !E.magnet;
    toast(E.magnet ? 'Magnet on: gaps in the picture close by themselves.' : 'Magnet off: gaps stay until you fill or close them.');
    renderDock();
  }
  // Snaps a dragged clip by its start OR its end to other clips' edges and the playhead (never to its own edges or its sound's).
  function snapMove(start, dur, id){
    var skip = P.linkedClips(E.hist.cur, id).map(function (x){ return x.clip.id; }), th = 8 / E.ppm;
    var a = P.snapTime(E.proj, start, th, [E.t], skip), b = P.snapTime(E.proj, start + dur, th, [E.t], skip) - dur, best = start;
    if (a !== start && b !== start) best = Math.abs(a - start) <= Math.abs(b - start) ? a : b;
    else if (a !== start) best = a; else if (b !== start) best = b;
    return Math.max(0, Math.round(best));
  }
  function moveTo(d){
    var dt = ((d.lastX - d.x0) + (E.ui.scroll.scrollLeft - d.sl0)) / E.ppm;
    d.newStart = snapMove(Math.max(0, d.s0 + dt), d.e0 - d.s0, d.id);
    d.el.classList.add('dragging'); d.el.style.left = tx(d.newStart) + 'px'; showDrop(d);
  }
  // A dashed outline shows where the clip will really land when you let go (solid when it pushes other clips later).
  function showDrop(d){
    var pl = P.planPlace(E.hist.cur, d.id, d.newStart), row = d.el.parentNode;
    if (!d.drop){ d.drop = mk('div', 'ed-drop'); row.appendChild(d.drop); }
    if (!pl){ d.drop.style.display = 'none'; return; }
    d.drop.style.display = 'block'; d.drop.style.left = tx(pl.start) + 'px'; d.drop.style.width = Math.max(3, (d.e0 - d.s0) * E.ppm) + 'px';
    d.drop.classList.toggle('push', pl.pushed);
  }
  // The timeline scrolls by itself while you hold a clip near its left or right edge.
  function autoScrollTick(){
    var d = E.drag; if (!d || d.mode !== 'move') return;
    var sc = E.ui.scroll, r = sc.getBoundingClientRect(), x = d.lastX, edge = 48, v = 0;
    if (x > r.right - edge) v = Math.min(24, (x - (r.right - edge)) / 3);
    else if (x < r.left + edge) v = -Math.min(24, ((r.left + edge) - x) / 3);
    if (!v) return;
    var before = sc.scrollLeft; sc.scrollLeft = Math.max(0, before + v);
    if (sc.scrollLeft !== before) moveTo(d);
  }
  function finishTrim(d){
    // Trimming a picture clip now only trims it (a gap is left, or closed when Magnet is on). Use Cut out to remove time from everything.
    var cur = E.hist.cur, q = cur;
    if (d.mode === 'trimR' && d.newEnd != null) q = P.trimClipEnd(cur, d.id, Math.round(d.newEnd));
    else if (d.mode === 'trimL' && d.newStart != null) q = P.trimClipStart(cur, d.id, Math.round(d.newStart));
    if (q === cur){ renderTimeline(); return; }
    commit((d.tr.role === 'movie' || d.tr.role === 'movieSound') ? tidy(q) : q);
  }
  // Turn and flip work on the clip you are on (the Zoom panel has "Apply to all").
  function rotateSel(){
    var c = targetVideo(); if (!c){ toast('Move the playhead onto the picture, or tap a picture clip first.'); return; }
    commit(P.setTransform(E.hist.cur, c.id, { rot: ((c.transform && c.transform.rot) || 0) + 90 }));
  }
  function flipSel(){
    var c = targetVideo(); if (!c){ toast('Move the playhead onto the picture, or tap a picture clip first.'); return; }
    commit(P.setTransform(E.hist.cur, c.id, { flipH: !(c.transform && c.transform.flipH) }));
  }
  // Plays the clip backwards (sound too). The preview cannot play backwards smoothly, the exported video can.
  function reverseSel(){
    var c = targetVideo(); if (!c){ toast('Move the playhead onto the picture, or tap a picture clip first.'); return; }
    if (c.type !== 'video'){ toast('A paused picture has nothing to play backwards. Pick a part where the movie plays.'); return; }
    var q = P.setReverse(E.hist.cur, c.id); if (q === E.hist.cur) return;
    if (!c.reverse && !E.revTold){ E.revTold = true; toast('Reversed. The preview is choppy and silent; the exported video is smooth, with the sound reversed too.'); }
    commit(q);
  }
  // Swaps the movie file for another copy of the same movie (a better quality one, say) and keeps every edit.
  // The page picks and loads the file; here we check it still fits what the edits use, then tell the project.
  function replaceMovie(){
    if (!E.hooks.replaceMovie){ toast('Replacing the movie is not available here.'); return; }
    pause();
    Promise.resolve(E.hooks.replaceMovie()).then(function (r){
      if (!r) return;
      var need = P.movieNeeded(E.hist.cur), warn = [];
      if (r.durMs && r.oldDurMs && Math.abs(r.durMs - r.oldDurMs) > 1500)
        warn.push('This movie is ' + fmtP(r.durMs) + ' long, but the one you edited is ' + fmtP(r.oldDurMs) + '. If it is not the same movie, the picture will not match your voice.');
      if (r.durMs && need > r.durMs + 500)
        warn.push('Your edits use the movie up to ' + fmtP(need) + ', but this file ends at ' + fmtP(r.durMs) + '. The parts after the end will show the last picture.');
      if (warn.length && !confirm(warn.join('\n\n') + '\n\nUse this movie anyway?')){
        Promise.resolve(r.revert && r.revert()).then(function (){ layoutTextLayer(); syncMedia(); });
        return;
      }
      if (r.keep) r.keep();
      E.hist.mapAll(function (p){ return P.setMovieAsset(p, { name: r.name, durMs: r.durMs }); });   // not an edit: the file itself changed
      E.proj = E.hist.cur; layoutTextLayer(); afterEdit(); toast('Movie replaced. All your edits are kept.');
    });
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
  // The voice timing is kept out of the signature on purpose: it is not an edit, it just moves the voice. The saved
  // record says which timing it was made with, so a later change of the timing moves the voice instead of
  // throwing the edits away.
  function saveSig(sess){ return [sess.durationMs, (sess.events || []).length, sess.voiceOffsetMs || 0].join('|'); }
  function showSaved(msg){ if (E.ui.saved) E.ui.saved.textContent = msg; }
  function queueSave(){
    if (!E.hooks || !E.hooks.saveProject || !E.sess) return;
    showSaved('Saving...'); clearTimeout(E.saveT); E.saveT = setTimeout(flushSave, 500);
  }
  function flushSave(){
    clearTimeout(E.saveT); E.saveT = 0;
    if (!E.hooks || !E.hooks.saveProject || !E.sess || !E.hist) return Promise.resolve();
    var rec = { sig: saveSig(E.sess), savedAt: Date.now(), nudge: E.sess.voiceNudgeMs || 0, project: E.hist.cur };
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

  /* ---------- the dock along the bottom (the way CapCut does it) ----------
     Nothing tapped: the main toolbar. Tap Edit, Audio or Text, or tap a clip on the timeline: it turns into a row of tools for
     that clip, with a back arrow. A tool that has settings turns the row into a small panel with a tick to close it. */
  var G = {
    back: svg('<path d="M15 5l-7 7 7 7"/>'), check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    split: svg('<path d="M12 3v18M7 7l-3 3 3 3M17 7l3 3-3 3"/>'),
    cut: svg('<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.2 7.6L20 19M8.2 16.4L20 5"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    dup: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>'),
    speed: svg('<path d="M4 15a8 8 0 1116 0"/><path d="M12 15l4-5"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/>'),
    volume: svg('<path d="M5 9v6h3l5 4V5L8 9z"/><path d="M16.5 9a4 4 0 010 6M19 6.5a8 8 0 010 11"/>'),
    zoom: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M11 8.5v5M8.5 11h5"/>'),
    rotate: svg('<path d="M20 12a8 8 0 11-2.6-5.9"/><path d="M20 4v5h-5"/>'),
    flip: svg('<path d="M12 3v18"/><path d="M8 7L3 12l5 5zM16 7l5 5-5 5z"/>'),
    opacity: svg('<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>'),
    reverse: svg('<path d="M16 5.5v13L5 12z"/>', true),
    freeze: svg('<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/>'),
    adjust: svg('<path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h12M20 17h0"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="17" r="2"/>'),
    fade: svg('<path d="M4 5h7v14H4z" opacity=".45"/><path d="M13 5h7v14h-7z"/>', true),
    replace: svg('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><path d="M14 7h5v5M10 17H5v-5"/>'),
    quiet: svg('<path d="M5 9v6h3l5 4V5L8 9z"/><path d="M17 9.5l4 5M21 9.5l-4 5"/>'),
    reset: svg('<path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8"/><path d="M3 3v5h5"/>'),
    music: svg('<path d="M9 18.5a2.8 2.8 0 11-2.8-2.8c.5 0 1 .1 1.4.4V5l11-2.5v13.6a2.8 2.8 0 11-2.8-2.8c.5 0 1 .1 1.4.4V6.1L9 8.3z"/>', true),
    mix: svg('<path d="M6 4v16M12 4v16M18 4v16"/><circle cx="6" cy="9" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="18" cy="8" r="2"/>'),
    clip: svg('<path d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2"/>'),
    addText: svg('<path d="M4 6V4h12v2M10 4v12M7 16h6M18 14v6M15 17h6"/>'),
    pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/>'),
    style: svg('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16" cy="10" r="1.2"/>'),
    list: svg('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
    detach: svg('<path d="M9 18.5a2.8 2.8 0 11-2.8-2.8c.5 0 1 .1 1.4.4V5l11-2.5v8"/><path d="M15 17l6 4M21 17l-6 4"/>'),
    captions: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 11h4M13 11h4M7 15h2.5M12 15h5"/>'),
    download: svg('<path d="M12 3v11.5m0 0l-4-4m4 4l4-4"/><path d="M5 16.5V19a2 2 0 002 2h10a2 2 0 002-2v-2.5"/>'),
    join: svg('<path d="M4 7v10M20 7v10M4 12h5M20 12h-5M7 9l2.5 3L7 15M17 9l-2.5 3 2.5 3"/>'),
    gap: svg('<path d="M3 6v12M21 6v12M8 12h8M11 9l-3 3 3 3M13 9l3 3-3 3"/>'),
    magnet: svg('<path d="M6 3v9a6 6 0 0012 0V3h-4v9a2 2 0 01-4 0V3zM6 7h4M14 7h4"/>')
  };

  function openTool(name){ E.tool = name || null; E.panel = null; E.autoDock = false; renderDock(); }
  function closeTool(){ E.tool = null; E.panel = null; E.autoDock = false; E.sel = null; renderTimeline(); renderDock(); }   // the back arrow, like CapCut, lets go of the clip too
  function openPanel(name, tool){ if (tool) E.tool = tool; E.panel = name; renderDock(); }
  function closePanel(){ E.panel = null; renderDock(); }
  // Tapping a clip brings up the tools for that kind of clip; letting go of it (when the tools came up by themselves) takes them away again.
  function syncDock(){
    var f = E.sel && P.findClip(E.proj, E.sel);
    if (f){
      var want = f.track.kind === 'video' ? 'edit' : f.track.kind === 'text' ? 'text' : 'audio';
      if (!E.tool){ E.autoDock = true; E.tool = want; }
      else if (!E.panel && E.tool !== want) E.tool = want;
    } else if (E.autoDock && !E.panel){ E.tool = null; E.autoDock = false; }
    renderDock();
  }
  function renderDock(){
    var u = E.ui, d = u.dock; if (!d) return;
    var old = d.querySelector('.ed-tscroll'); if (old) E.rowScroll = { tool: E.rowTool, left: old.scrollLeft };
    u.bSplit = u.bCut = u.bDel = null;
    d.textContent = '';
    if (E.panel && PANELS[E.panel]) d.appendChild(panelShell(PANELS[E.panel]));
    else if (E.tool && ROWS[E.tool]){
      d.appendChild(toolRow(ROWS[E.tool]())); E.rowTool = E.tool;
      var sc = d.querySelector('.ed-tscroll'); if (sc && E.rowScroll && E.rowScroll.tool === E.tool) sc.scrollLeft = E.rowScroll.left;   // the row stays where you scrolled it
    } else d.appendChild(u.toolbar);
    updateButtons();
    if (E.isOpen) layoutTextLayer();
  }
  function toolRow(items){
    var row = mk('div', 'ed-trow'), back = iconBtn('edBack', G.back, 'Back', 'ed-ibtn ed-back'), sc = mk('div', 'ed-tscroll');
    back.onclick = closeTool;
    items.forEach(function (it){
      var b = btn(it.id || null, null, 'ed-tbtn' + (it.on ? ' on' : ''), it.label); b.innerHTML = it.icon + '<span>' + it.label + '</span>';
      b.disabled = !!it.disabled; b.onclick = it.run; if (it.ref) E.ui[it.ref] = b; sc.appendChild(b);
    });
    return add(row, back, sc);
  }
  function panelShell(def){
    var p = mk('div', 'ed-panel'), h = mk('div', 'ed-phead'), done = iconBtn('edPanelDone', G.check, 'Done', 'ed-ibtn ed-pdone'), body = mk('div', 'ed-pbody');
    done.onclick = closePanel; add(h, mk('span', 'ed-ptitle', def.title), done); add(p, h, body); def.build(body);
    return p;
  }
  function chips(list, cur, pick){
    var w = mk('div', 'ed-chips');
    list.forEach(function (o){ var b = btn(null, o.label, 'ed-chip' + (o.key === cur ? ' on' : '')); b.onclick = function (){ pick(o.key); }; w.appendChild(b); });
    return w;
  }
  function sliderRow(label, min, max, step, val, fmtv, onInput, onChange){
    var r = mk('div', 'ed-mixrow wide'), rng = slider(min, max, step, val, label), out = mk('span', 'ed-mixval num', fmtv(val));
    rng.oninput = function (){ out.textContent = fmtv(+rng.value); if (onInput) onInput(+rng.value); };
    rng.onchange = function (){ if (onChange) onChange(+rng.value); };
    add(r, mk('span', 'ed-mixname', label), rng, out);
    return r;
  }
  function actions(list){
    var r = mk('div', 'ed-actions');
    list.forEach(function (a){ var b = btn(a.id || null, a.label, 'ed-btn ed-small' + (a.on ? ' on' : '')); b.onclick = a.run; r.appendChild(b); });
    return r;
  }
  var secs = function (v){ return (v / 1000).toFixed(1) + 's'; }, pct = function (v){ return Math.round(v) + '%'; };
  // The picture clip a panel works on (selected, or under the playhead). Says so when there is none.
  function needPicture(body){
    var c = targetVideo();
    if (!c) body.appendChild(mk('div', 'ed-hint', 'Move the playhead onto the picture, or tap a picture clip on the timeline.'));
    return c;
  }
  function chipKey(panel, keys, dflt){ var k = E.chip[panel]; return keys.some(function (o){ return o.key === k; }) ? k : dflt; }
  function pickChip(panel){ return function (k){ E.chip[panel] = k; renderDock(); }; }

  /* ---------- the rows of tools ---------- */
  var ROWS = {
    edit: function (){
      var c = targetVideo(), P2 = function (name){ return function (){ openPanel(name); }; };
      return [
        { id: 'edSplit', ref: 'bSplit', label: 'Split', icon: G.split, run: split, disabled: !hasCrossing(Math.round(E.t)) },
        { id: 'edCut', ref: 'bCut', label: 'Cut out', icon: G.cut, run: cutOut, disabled: !E.sel },
        { id: 'edDelete', ref: 'bDel', label: 'Delete', icon: G.trash, run: deleteSel, disabled: !E.sel },
        { id: 'edDuplicate', label: 'Duplicate', icon: G.dup, run: duplicateSel },
        { id: 'edJoin', label: 'Join', icon: G.join, run: joinSel },
        { id: 'edCloseGap', label: 'Close gap', icon: G.gap, run: closeGapHere },
        { id: 'edMagnet', label: 'Magnet', icon: G.magnet, run: toggleMagnet, on: E.magnet },
        { id: 'edDetach', label: 'Detach', icon: G.detach, run: detachSel },
        { id: 'edSpeed', label: 'Speed', icon: G.speed, run: P2('speed') },
        { id: 'edVolume', label: 'Volume', icon: G.volume, run: P2('volume') },
        { id: 'edZoom', label: 'Zoom', icon: G.zoom, run: P2('frame') },
        { id: 'edRotate', label: 'Rotate', icon: G.rotate, run: rotateSel },
        { id: 'edFlip', label: 'Flip', icon: G.flip, run: flipSel },
        { id: 'edOpacity', label: 'Opacity', icon: G.opacity, run: P2('opacity') },
        { id: 'edReverse', label: 'Reverse', icon: G.reverse, run: reverseSel, on: !!(c && c.reverse) },
        { id: 'edFreeze', label: 'Freeze', icon: G.freeze, run: P2('freeze') },
        { id: 'edAdjust', label: 'Adjust', icon: G.adjust, run: P2('adjust') },
        { id: 'edFade', label: 'Fade', icon: G.fade, run: P2('fade') },
        { id: 'edReplace', label: 'Replace', icon: G.replace, run: replaceMovie },
        { id: 'edQuiet', label: 'Quiet', icon: G.quiet, run: scanQuiet },
        { id: 'edReset', label: 'Start over', icon: G.reset, run: startOver }
      ];
    },
    audio: function (){
      var mt = E.proj.tracks.filter(function (t){ return t.role === 'music'; })[0], has = !!(mt && mt.clips[0]), items = [];
      if (E.hooks.pickMusic) items.push({ id: 'edAddMusic', label: has ? 'Change music' : 'Add music', icon: G.music, run: addMusic });
      items.push({ id: 'edMix', label: 'Volume', icon: G.mix, run: function (){ openPanel('mix'); } });
      items.push({ id: 'edClipAudio', label: 'Clip', icon: G.clip, run: function (){ openPanel('clipaudio'); } });
      if (has) items.push({ id: 'edRemoveMusic', label: 'Remove music', icon: G.trash, run: function (){ if (E.hooks.setMusicFile) E.hooks.setMusicFile(null); commit(P.removeMusic(E.hist.cur)); } });
      return items;
    },
    text: function (){
      var f = E.sel && P.findClip(E.proj, E.sel), isText = !!(f && f.track.kind === 'text'), any = allTexts().length > 0;
      return [
        { id: 'edAddText', label: 'Add text', icon: G.addText, run: addText },
        { id: 'edCaptions', label: 'Captions', icon: G.captions, run: function (){ openPanel('captions'); } },
        { id: 'edTextEdit', label: 'Edit', icon: G.pencil, run: function (){ openPanel('textedit'); }, disabled: !isText },
        { id: 'edTextStyle', label: 'Style', icon: G.style, run: function (){ openPanel('textstyle'); }, disabled: !isText },
        { id: 'edTextList', label: 'Texts', icon: G.list, run: function (){ openPanel('texts'); }, disabled: !any },
        { id: 'edTextDup', label: 'Duplicate', icon: G.dup, run: duplicateSel, disabled: !isText },
        { id: 'edTextDel', label: 'Delete', icon: G.trash, run: deleteSel, disabled: !isText }
      ];
    }
  };
  // every text on the timeline (titles and captions), in time order
  function allTexts(){
    var out = []; E.proj.tracks.forEach(function (t){ if (t.kind === 'text') t.clips.forEach(function (c){ out.push(c); }); });
    return out.sort(function (a, b){ return a.start - b.start; });
  }
  // Lets the sound of a movie clip go its own way (move it, trim it or delete it without the picture).
  function detachSel(){
    var c = targetVideo(); if (!c){ toast('Move the playhead onto the picture, or tap a picture clip first.'); return; }
    var q = P.detachAudio(E.hist.cur, c.id);
    if (q === E.hist.cur){ toast('Nothing to detach: this part has no sound, or it is already detached.'); return; }
    commit(q); toast('Sound detached. It now moves and deletes on its own. A speed change will no longer reach it.');
  }
  // ----- captions -----
  function addCaptionHere(){
    var out = {}, q = P.addCaptionLine(E.hist.cur, Math.round(E.t), 2500, out);
    if (q === E.hist.cur){ toast('There is no room for a caption here. Move the playhead or shorten the next one.'); return; }
    E.sel = out.id; commit(q); openPanel('textedit', 'text');
  }
  // text = the contents of an .srt file. Replaces the captions you have (after asking, when there are some).
  function importCaptions(text){
    var items = P.parseSrt(text);
    if (!items.length){ toast('No subtitle lines were found in that file. It should be an .srt file.'); return 0; }
    var had = P.captionList(E.hist.cur).length;
    if (had && !confirm('Replace your ' + had + ' caption lines with the ' + items.length + ' lines in this file?')) return 0;
    var out = {}, q = P.addCaptions(E.hist.cur, items, { replace: true }, out);
    if (q === E.hist.cur && !out.added){ toast('None of the lines fit the video.'); return 0; }
    commit(q);
    toast(out.added + ' caption line' + (out.added === 1 ? '' : 's') + ' added' + (out.skipped ? ' (' + out.skipped + ' did not fit the video)' : '') + '. Times follow your edited video.');
    return out.added;
  }
  function importSrtFile(){
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.srt,text/plain,application/x-subrip';
    inp.onchange = function (){
      var f = inp.files && inp.files[0]; if (!f) return;
      (f.text ? f.text() : new Promise(function (res){ var r = new FileReader(); r.onload = function (){ res(r.result); }; r.readAsText(f); })).then(importCaptions);
    };
    inp.click();
  }
  function exportSrt(){ return P.toSrt(E.hist.cur); }
  function exportSrtFile(){
    var txt = exportSrt();
    if (!txt){ toast('There are no captions or titles to save yet.'); return; }
    var a = document.createElement('a'), name = String((E.sess && E.sess.name) || 'naki').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'naki';
    a.href = URL.createObjectURL(new Blob([txt], { type: 'application/x-subrip' })); a.download = name + '.srt';
    document.body.appendChild(a); a.click(); setTimeout(function (){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('Saved ' + name + '.srt');
  }
  function addMusic(){
    Promise.resolve(E.hooks.pickMusic()).then(function (m){
      if (!m || !m.file) return;
      if (E.hooks.setMusicFile) E.hooks.setMusicFile(m.file);
      commit(P.ensureMusic(E.hist.cur, { name: m.name || m.file.name, durMs: m.durMs || null }));
      toast('Music added. Set its level under Volume.');
    });
  }
  function addText(){
    var out = {}, q = P.addTextClip(E.hist.cur, Math.round(E.t), 3000, out);
    if (q === E.hist.cur){ toast('There is no room for text at the playhead. Move it or shorten the other text.'); return; }
    E.sel = out.id; commit(q); openPanel('textedit', 'text');
  }
  function commit0(){ renderTimeline(); }
  function selText(){ var f = E.sel && P.findClip(E.proj, E.sel); return f && f.track.kind === 'text' ? f.clip : null; }

  /* ---------- the panels (a tool's settings) ---------- */
  var PANELS = {
    speed: { title: 'Speed', build: function (body){
      var c = needPicture(body); if (!c) return;
      if (c.type !== 'video'){ body.appendChild(mk('div', 'ed-hint', 'A paused picture has no speed. Pick a part where the movie plays.')); return; }
      var cur = c.speed || 1, set = function (v){ commit(P.setClipSpeed(E.hist.cur, c.id, v)); };
      body.appendChild(chips([0.5, 0.75, 1, 1.5, 2, 3].map(function (v){ return { key: v, label: v + '×' }; }), cur, set));
      body.appendChild(sliderRow('Speed', 0.25, 4, 0.05, cur, function (v){ return v.toFixed(2) + '×'; }, null, set));
      body.appendChild(mk('div', 'ed-hint', 'The picture and its sound change together. The movie clips after it move up or back. Your voice stays where it is.'));
    } },
    volume: { title: 'Volume', build: function (body){
      var c = needPicture(body); if (!c) return;
      var snd = P.linkedClips(E.hist.cur, c.id).filter(function (f){ return f.track.kind === 'audio'; }).map(function (f){ return f.clip.id; });
      if (!snd.length){ body.appendChild(mk('div', 'ed-hint', 'A paused picture has no movie sound.')); return; }
      var first = P.findClip(E.hist.cur, snd[0]).clip, setVol = function (x){ var q = E.hist.cur; snd.forEach(function (id){ q = P.setClipProps(q, id, { volume: x / 100 }); }); return q; };
      body.appendChild(sliderRow('Movie sound', 0, 200, 5, Math.round((first.volume != null ? first.volume : 1) * 100), pct, function (x){ live(setVol(x)); }, function (x){ commit(setVol(x)); }));
    } },
    frame: { title: 'Zoom', build: function (body){
      var c = needPicture(body); if (!c) return;
      var t = Object.assign({ zoom: 1, x: 0, y: 0, rot: 0, flipH: false }, c.transform || {}), keys = [{ key: 'zoom', label: 'Zoom' }];
      if (t.zoom > 1) keys.push({ key: 'x', label: 'Left / right' }, { key: 'y', label: 'Up / down' });
      var cur = chipKey('frame', keys, 'zoom'), tz = function (o){ return P.setTransform(E.hist.cur, c.id, o); }, one = function (v){ var o = {}; o[cur] = v; return o; };
      body.appendChild(chips(keys, cur, pickChip('frame')));
      body.appendChild(cur === 'zoom'
        ? sliderRow('Zoom', 1, 4, 0.05, t.zoom, function (v){ return v.toFixed(2) + '×'; }, function (v){ live(tz(one(v))); }, function (v){ commit(tz(one(v))); })
        : sliderRow(cur === 'x' ? 'Left / right' : 'Up / down', -1, 1, 0.05, t[cur], function (v){ return Math.round(v * 100); }, function (v){ live(tz(one(v))); }, function (v){ commit(tz(one(v))); }));
      body.appendChild(actions([
        { id: 'edZoomReset', label: 'Reset', run: function (){ commit(tz({ zoom: 1, x: 0, y: 0, rot: 0, flipH: false })); } },
        { id: 'edZoomAll', label: 'Apply to all', run: function (){ commit(P.setTransform(E.hist.cur, null, { zoom: t.zoom, x: t.x, y: t.y, rot: t.rot, flipH: t.flipH })); toast('This framing is on every clip now.'); } }]));
    } },
    opacity: { title: 'Opacity', build: function (body){
      var c = needPicture(body); if (!c) return;
      var v0 = Math.round((c.opacity != null ? c.opacity : 1) * 100);
      body.appendChild(sliderRow('Opacity', 0, 100, 5, v0, pct, function (v){ live(P.setOpacity(E.hist.cur, c.id, v / 100)); }, function (v){ commit(P.setOpacity(E.hist.cur, c.id, v / 100)); }));
      body.appendChild(actions([{ id: 'edOpacityAll', label: 'Apply to all', run: function (){ commit(P.setOpacity(E.hist.cur, null, v0 / 100)); toast('This opacity is on every clip now.'); } }]));
    } },
    adjust: { title: 'Adjust', build: function (body){
      var c = needPicture(body); if (!c) return;
      var fl = Object.assign({ brightness: 1, contrast: 1, saturate: 1 }, c.filter || {});
      var DEF = [
        { key: 'brightness', label: 'Brightness', min: 40, max: 160, neutral: 100 }, { key: 'contrast', label: 'Contrast', min: 40, max: 160, neutral: 100 },
        { key: 'saturate', label: 'Colour', min: 0, max: 200, neutral: 100 }, { key: 'warmth', label: 'Warmth', min: -100, max: 100, neutral: 0 },
        { key: 'sharpen', label: 'Sharpen', min: 0, max: 100, neutral: 0 }, { key: 'vignette', label: 'Vignette', min: 0, max: 100, neutral: 0 },
        { key: 'matte', label: 'Faded', min: 0, max: 100, neutral: 0 }];
      var cur = chipKey('adjust', DEF, 'brightness'), d = DEF.filter(function (o){ return o.key === cur; })[0];
      var one = function (v){ var o = {}; o[cur] = v / 100; return P.setFilter(E.hist.cur, c.id, o); };
      body.appendChild(chips(DEF, cur, pickChip('adjust')));
      body.appendChild(sliderRow(d.label, d.min, d.max, 5, Math.round((fl[cur] != null ? fl[cur] : d.neutral / 100) * 100), function (v){ return v; }, function (v){ live(one(v)); }, function (v){ commit(one(v)); }));
      body.appendChild(actions([
        { id: 'edFilterReset', label: 'Reset', run: function (){ commit(P.setFilter(E.hist.cur, c.id, { brightness: 1, contrast: 1, saturate: 1, warmth: 0, sharpen: 0, vignette: 0, matte: 0 })); } },
        { id: 'edFilterAll', label: 'Apply to all', run: function (){ commit(P.setFilter(E.hist.cur, null, fl)); toast('This look is on every clip now.'); } }]));
    } },
    fade: { title: 'Fade', build: function (body){
      var c = needPicture(body); if (!c) return;
      var keys = [{ key: 'vFadeIn', label: 'Fade in' }, { key: 'vFadeOut', label: 'Fade out' }], cur = chipKey('fade', keys, 'vFadeIn'), half = Math.min(1500, Math.floor(c.dur / 2));
      body.appendChild(chips(keys, cur, pickChip('fade')));
      body.appendChild(sliderRow(cur === 'vFadeIn' ? 'Fade in' : 'Fade out', 0, half, 100, Math.min(half, c[cur] || 0), secs, null, function (v){ var o = {}; o[cur] = v; commit(P.setVFade(E.hist.cur, c.id, o)); }));
      body.appendChild(mk('div', 'ed-hint', 'The picture fades from or to black. Sound is not changed.'));
    } },
    freeze: { title: 'Freeze frame', build: function (body){
      body.appendChild(chips([1000, 2000, 3000, 5000].map(function (v){ return { key: v, label: (v / 1000) + ' s' }; }), E.freezeMs, function (v){ E.freezeMs = v; renderDock(); }));
      body.appendChild(actions([{ id: 'edFreeze', label: 'Freeze here', run: function (){ freezeHere(); } }]));
      body.appendChild(mk('div', 'ed-hint', 'Holds the picture still at the playhead. Everything after it moves later.'));
    } },
    mix: { title: 'Volume', build: function (body){
      var tracks = E.proj.tracks.filter(function (t){ return t.kind === 'audio'; }); if (!tracks.length) return;
      var keys = tracks.map(function (t){ return { key: t.id, label: ROLE_NAME[t.role] || t.role }; }), cur = chipKey('mix', keys, keys[0].key), tr = tracks.filter(function (t){ return t.id === cur; })[0];
      body.appendChild(chips(keys, cur, pickChip('mix')));
      body.appendChild(sliderRow('Volume', 0, 200, 5, Math.round((tr.volume != null ? tr.volume : 1) * 100), pct,
        function (v){ live(P.setTrackProps(E.hist.cur, tr.id, { volume: v / 100 })); }, function (v){ commit(P.setTrackProps(E.hist.cur, tr.id, { volume: v / 100 })); }));
      body.appendChild(actions([{ id: 'edMute', label: tr.muted ? 'Muted: tap to turn on' : 'Mute', on: !!tr.muted, run: function (){ commit(P.setTrackProps(E.hist.cur, tr.id, { muted: !tr.muted })); } }]));
    } },
    clipaudio: { title: 'Clip sound', build: function (body){
      var f = E.sel && P.findClip(E.proj, E.sel), mt = E.proj.tracks.filter(function (t){ return t.role === 'music'; })[0];
      var c = f && f.track.kind === 'audio' ? f.clip : (mt && mt.clips[0]);
      if (!c){ body.appendChild(mk('div', 'ed-hint', 'Tap a sound clip on the timeline first.')); return; }
      var half = Math.min(5000, Math.floor(c.dur / 2)), keys = [{ key: 'volume', label: 'Volume' }, { key: 'fadeIn', label: 'Fade in' }, { key: 'fadeOut', label: 'Fade out' }], cur = chipKey('clipaudio', keys, 'volume');
      var set = function (v){ var o = {}; if (cur === 'volume') o.volume = v / 100; else { o[cur] = v; o[cur + 'Off'] = 0; } return P.setClipProps(E.hist.cur, c.id, o); };
      body.appendChild(chips(keys, cur, pickChip('clipaudio')));
      body.appendChild(cur === 'volume'
        ? sliderRow('Volume', 0, 200, 5, Math.round((c.volume != null ? c.volume : 1) * 100), pct, function (v){ live(set(v)); }, function (v){ commit(set(v)); })
        : sliderRow(cur === 'fadeIn' ? 'Fade in' : 'Fade out', 0, half, 100, Math.min(half, c[cur] || 0), secs, function (v){ live(set(v)); }, function (v){ commit(set(v)); }));
    } },
    textedit: { title: 'Text', build: function (body){
      var c = selText(); if (!c){ body.appendChild(mk('div', 'ed-hint', 'Tap a text on the timeline first.')); return; }
      var ti = mk('input', 'ed-textin'); ti.type = 'text'; ti.value = c.text || ''; ti.setAttribute('aria-label', 'Text');
      ti.oninput = function (){ live(P.setTextProps(E.hist.cur, c.id, { text: ti.value })); }; ti.onchange = function (){ commit(P.setTextProps(E.hist.cur, c.id, { text: ti.value })); };
      body.appendChild(ti); body.appendChild(mk('div', 'ed-hint', 'Drag the text on the timeline to move it, or its ends to change how long it shows.'));
    } },
    textstyle: { title: 'Text style', build: function (body){
      var c = selText(); if (!c){ body.appendChild(mk('div', 'ed-hint', 'Tap a text on the timeline first.')); return; }
      var keys = [{ key: 'size', label: 'Size' }, { key: 'pos', label: 'Position' }, { key: 'color', label: 'Colour' }, { key: 'bg', label: 'Dark box' },
        { key: 'font', label: 'Font' }, { key: 'outline', label: 'Outline' }, { key: 'shadow', label: 'Shadow' }], cur = chipKey('textstyle', keys, 'size');
      var pt = function (o){ return P.setTextProps(E.hist.cur, c.id, o); }, one = function (v){ var o = {}; o[cur] = v; return o; };
      body.appendChild(chips(keys, cur, pickChip('textstyle')));
      if (cur === 'size') body.appendChild(sliderRow('Size', 3, 16, 1, c.size || 7, function (v){ return v + '%'; }, function (v){ live(pt({ size: v })); }, function (v){ commit(pt({ size: v })); }));
      else if (cur === 'pos') body.appendChild(chips([{ key: 'top', label: 'Top' }, { key: 'center', label: 'Middle' }, { key: 'bottom', label: 'Bottom' }], c.pos, function (k){ commit(pt({ pos: k })); }));
      else if (cur === 'font') body.appendChild(chips(lookLib().fontList(), c.font || 'sans', function (k){ commit(pt({ font: k })); }));
      else if (cur === 'outline') body.appendChild(sliderRow('Outline', 0, 100, 5, Math.round((c.outline || 0) * 100), pct, function (v){ live(pt({ outline: v / 100 })); }, function (v){ commit(pt({ outline: v / 100 })); }));
      else if (cur === 'shadow') body.appendChild(sliderRow('Shadow', 0, 100, 5, Math.round((c.shadow == null ? 1 : c.shadow) * 100), pct, function (v){ live(pt({ shadow: v / 100 })); }, function (v){ commit(pt({ shadow: v / 100 })); }));
      else if (cur === 'color'){
        var ci = mk('input'); ci.type = 'color'; ci.value = c.color || '#ffffff'; ci.setAttribute('aria-label', 'Text colour');
        ci.oninput = function (){ live(pt({ color: ci.value })); }; ci.onchange = function (){ commit(pt({ color: ci.value })); };
        var r = mk('div', 'ed-mixrow wide'); add(r, mk('span', 'ed-mixname', 'Colour'), ci); body.appendChild(r);
      } else body.appendChild(actions([{ id: 'edTextBox', label: c.bg ? 'Dark box: on' : 'Dark box: off', on: !!c.bg, run: function (){ commit(pt({ bg: !c.bg })); } }]));
      if (c.caption) body.appendChild(actions([{ id: 'edCapStyleAll', label: 'Apply this look to all captions', run: function (){
        commit(P.setCaptionStyle(E.hist.cur, { size: c.size, color: c.color, pos: c.pos, weight: c.weight, bg: c.bg, font: c.font || 'sans', outline: c.outline || 0, shadow: c.shadow == null ? 1 : c.shadow })); toast('Every caption has this look now.'); } }]));
    } },
    format: { title: 'Format', build: function (body){
      var cur = E.proj.format || {}, ratio = cur.ratio || 'original', bg = NF.normalizeBg(cur.bg);
      var set = function (patch){ commit(P.setFormat(E.hist.cur, patch)); };
      body.appendChild(chips(NF.RATIOS, ratio, function (k){ set({ ratio: k }); }));
      if (ratio === 'original'){ body.appendChild(mk('div', 'ed-hint', 'Original keeps the shape of your movie. Pick a shape for TikTok, Instagram or YouTube, then choose what fills the space around the picture.')); return; }
      body.appendChild(chips([{ key: 'navy', label: 'Dark' }, { key: 'color', label: 'Colour' }, { key: 'blur', label: 'Blur' }], bg.type, function (k){ set({ bg: { type: k } }); }));
      if (bg.type === 'color'){
        body.appendChild(chips(NF.SWATCHES, bg.color, function (k){ set({ bg: { type: 'color', color: k } }); }));
        var ci = mk('input'); ci.type = 'color'; ci.value = bg.color; ci.setAttribute('aria-label', 'Background colour');
        ci.oninput = function (){ live(P.setFormat(E.hist.cur, { bg: { type: 'color', color: ci.value } })); layoutPicture(); };
        ci.onchange = function (){ set({ bg: { type: 'color', color: ci.value } }); };
        var cr = mk('div', 'ed-mixrow wide'); add(cr, mk('span', 'ed-mixname', 'Pick colour'), ci); body.appendChild(cr);
      }
      body.appendChild(mk('div', 'ed-hint', bg.type === 'blur'
        ? 'A soft, blurred copy of the picture fills the space around it. The preview plays the movie twice, so it can be slower on a small phone. The export is not affected.'
        : 'The whole picture stays visible, with this filling the space around it. Zoom still works inside the picture.'));
    } },
    texts: { title: 'Your texts', build: function (body){
      var list = allTexts();
      if (!list.length){ body.appendChild(mk('div', 'ed-hint', 'No text yet. Tap Add text.')); return; }
      body.appendChild(chips(list.map(function (c){ return { key: c.id, label: (c.text || 'Text') + ' · ' + fmtP(c.start) }; }), E.sel, function (id){
        var c = P.findClip(E.proj, id).clip; E.panel = null; seek(c.start); select(id);
      }));
    } },
    captions: { title: 'Captions', build: function (body){
      var list = P.captionList(E.hist.cur);
      body.appendChild(actions([{ id: 'edCapAdd', label: 'Add line here', run: addCaptionHere }, { id: 'edCapImport', label: 'Import .srt', run: importSrtFile }, { id: 'edCapExport', label: 'Save .srt', run: exportSrtFile }]));
      if (!list.length){ body.appendChild(mk('div', 'ed-hint', 'Type subtitle lines at the playhead, or import an .srt file. Times follow your edited video, so cuts move the captions with it.')); return; }
      body.appendChild(chips(list.map(function (c){ return { key: c.id, label: fmtP(c.start) + '  ' + (c.text.length > 22 ? c.text.slice(0, 21) + '…' : c.text) }; }), E.sel, function (id){
        var c = P.findClip(E.proj, id).clip; seek(c.start); E.sel = id; commit0(); openPanel('textedit', 'text');
      }));
      body.appendChild(actions([{ id: 'edCapClear', label: 'Remove all captions', run: function (){ if (confirm('Remove all ' + list.length + ' caption lines?')) commit(P.removeCaptions(E.hist.cur)); } }]));
    } }
  };

  /* ---------- titles drawn over the preview ---------- */
  // ----- format and background (the shape of the video, and what fills the space around the picture) -----
  function frameAspect(){
    var f = E.proj && E.proj.format;
    return (NF && f) ? (NF.ratioValue(f.ratio) || 0) : 0;
  }
  function resetBox(m){
    var u = E.ui;
    u.picbox.style.left = u.picbox.style.top = '0'; u.picbox.style.width = u.picbox.style.height = '100%';
    m.style.position = ''; m.style.left = m.style.top = ''; m.style.width = m.style.height = '';
  }
  // The picture's CSS transform. With the original shape it is exactly what it was. With any other shape the picture is fitted inside the
  // frame (space around it) and zoom / turn / flip happen inside that picture, the way the export does it.
  function framePicture(t, m){
    var u = E.ui, fr = frameAspect(), W = u.picframe.clientWidth, H = u.picframe.clientHeight;
    if (!fr || !W || !H || !m.videoWidth || !NF){
      if (E.boxMode !== 'plain'){ resetBox(m); E.boxMode = 'plain'; E.boxKey = null; }
      return transformCss(t, (m.videoWidth && m.videoHeight) ? m.videoWidth / m.videoHeight : 16 / 9);
    }
    var L = NF.containLayout(t, W, H, m.videoWidth, m.videoHeight), key = [W, H, m.videoWidth, m.videoHeight, L.rot].join('|');
    if (E.boxKey !== key){
      var b = L.box;
      u.picbox.style.left = b.x + 'px'; u.picbox.style.top = b.y + 'px'; u.picbox.style.width = b.w + 'px'; u.picbox.style.height = b.h + 'px';
      m.style.position = 'absolute'; m.style.left = ((b.w - L.dw) / 2) + 'px'; m.style.top = ((b.h - L.dh) / 2) + 'px'; m.style.width = L.dw + 'px'; m.style.height = L.dh + 'px';
      E.boxKey = key; E.boxMode = 'contain';
    }
    return 'translate(' + L.panX + 'px,' + L.panY + 'px) scale(' + L.zoom + ') rotate(' + L.rot + 'deg)' + (L.flip ? ' scaleX(-1)' : '');
  }
  // Frame colour, the blurred copy behind the picture, and the picture's place: after the shape or the window size changed.
  function layoutPicture(){
    var u = E.ui, m = E.hooks && E.hooks.movie, f = E.proj && E.proj.format; if (!u.picbox || !m) return;
    var bg = (frameAspect() && NF) ? NF.normalizeBg(f.bg) : null;
    u.picframe.style.background = bg ? NF.fillColor(bg) : '#111b24';
    E.bgOn = !!(bg && bg.type === 'blur');
    u.bgvid.style.display = E.bgOn ? 'block' : 'none';
    if (!E.bgOn){ try { u.bgvid.pause(); } catch (e) {} }
    E.boxKey = null;
    var s = P.sourceAt(E.proj, E.t), vc = s.video && s.video.clip, css = framePicture(vc ? vc.transform : null, m);
    E.lastTransform = vc ? css : ''; m.style.transform = vc ? css : '';
    syncBackdrop(m);
  }
  // The blurred background is a second, muted copy of the movie kept in step with the first.
  function syncBackdrop(m){
    var b = E.ui.bgvid; if (!b || !E.bgOn) return;
    var src = m.currentSrc || m.src;
    if (src && b.getAttribute('data-src') !== src){ b.setAttribute('data-src', src); b.src = src; b.muted = true; }
    if (Math.abs(b.currentTime - m.currentTime) > 0.25){ try { b.currentTime = m.currentTime; } catch (e) {} }
    if (!m.paused && b.paused){ var pr = b.play(); if (pr && pr.catch) pr.catch(function (){}); }
    else if (m.paused && !b.paused) b.pause();
  }
  function layoutTextLayer(){ layoutTextLayerBase(); layoutPicture(); }
  function layoutTextLayerBase(){
    var m = E.hooks && E.hooks.movie, st = E.ui.stage, boxes = [E.ui.textlayer, E.ui.picframe]; if (!boxes[0]) return;
    var sw = st.clientWidth, sh = st.clientHeight, vw = m && m.videoWidth, vh = m && m.videoHeight;
    var fr0 = frameAspect(); if (fr0){ vw = Math.round(fr0 * 1000); vh = 1000; }   // the frame has the chosen shape, not the movie's
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
      if (!d){
        // the dark box is a box around the words only (like the export draws it): an inline box with the same padding the export uses (0.4 letters each side, 0.2 above and below)
        d = E.textEls[c.id] = mk('div', 'ed-textov'); d._sp = mk('span'); d._sp.style.cssText = 'display:inline-block;padding:0.2em 0.4em;white-space:pre-wrap;word-break:break-word';
        d.style.left = d.style.right = 'calc(6% - 0.4em)'; d.appendChild(d._sp); layer.appendChild(d); layoutTextLayer();
      }
      if (d._txt !== c.text){ d._sp.textContent = c.text || ''; d._txt = c.text; }
      var st = lookLib().titleStyle(c, layer.clientHeight || 240);
      d.style.fontSize = st.px + 'px'; d.style.fontFamily = st.fontFamily; d.style.textShadow = st.shadow;
      d.style.webkitTextStroke = st.stroke; d.style.paintOrder = 'stroke fill';
      d.style.color = c.color || '#fff'; d.style.fontWeight = c.weight || 700;
      d.style.top = ((NP.TEXT_POS[c.pos] != null ? NP.TEXT_POS[c.pos] : NP.TEXT_POS.bottom) * 100) + '%';
      d._sp.style.background = c.bg ? 'rgba(0,0,0,.55)' : 'transparent';
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
  // picture fade through black: 0..1 visibility at timeline time t
  function fadeOpacity(c, t){
    var rel = t - c.start, o = 1;
    if (c.vFadeIn && rel < c.vFadeIn) o = Math.min(o, rel / c.vFadeIn);
    if (c.vFadeOut && c.dur - rel < c.vFadeOut) o = Math.min(o, Math.max(0, (c.dur - rel) / c.vFadeOut));
    return clamp(o, 0, 1);
  }
  function syncMedia(){
    var h = E.hooks, m = h.movie, v = h.voice, s = P.sourceAt(E.proj, E.t);
    var LK = lookLib();
    var vc = s.video && s.video.clip, look = vc && vc.filter, fo = vc ? fadeOpacity(vc, E.t) : 1, ex = LK.extras(look);
    // the fade goes through BLACK (like the export), so it darkens the picture; opacity is only the clip's own setting
    var css = (ex.sharpen ? 'url(#nakiSharp) ' : '') + (look ? 'brightness(' + look.brightness + ') contrast(' + look.contrast + ') saturate(' + look.saturate + ')' : '') + (fo < 1 ? ' brightness(' + fo.toFixed(3) + ')' : '');
    var tintBg = LK.tintCss(ex.warmth) || '', veilBg = [LK.vignetteCss(ex.vignette), LK.matteCss(ex.matte)].filter(Boolean).join(', ');
    if (tintBg !== E.lastTint){ E.ui.tint.style.background = tintBg; E.ui.tint.style.display = tintBg ? 'block' : 'none'; E.lastTint = tintBg; }
    if (veilBg !== E.lastVeil){ E.ui.veil.style.background = veilBg; E.ui.veil.style.display = veilBg ? 'block' : 'none'; E.lastVeil = veilBg; }
    if (ex.sharpen !== E.lastSharp){ if (ex.sharpen) E.ui.sharpK.setAttribute('kernelMatrix', LK.sharpenKernel(ex.sharpen)); E.lastSharp = ex.sharpen; }
    var op = vc ? String(vc.opacity != null ? vc.opacity : 1) : '0';
    var tcss = vc ? framePicture(vc.transform, m) : '';
    if (tcss !== E.lastTransform){ m.style.transform = tcss; E.lastTransform = tcss; }
    if (css !== E.lastFilter){ m.style.filter = css; E.lastFilter = css; }
    if (op !== E.lastOpacity){ m.style.opacity = op; E.lastOpacity = op; }
    if (movieReady()){
      if (s.video){
        var target = s.video.movieMs / 1000, rate = s.video.clip.speed || 1;
        var rev = !!s.video.clip.reverse;   // a video element cannot play backwards: for a reversed clip it is stepped from picture to picture
        if (E.playing && s.video.type === 'video' && !rev){
          if (rate !== E.lastRate){ try { m.playbackRate = rate; } catch (e) {} E.lastRate = rate; }
          if (m.paused){ var pr = m.play(); if (pr && pr.catch) pr.catch(function (){}); }
          if (Math.abs(m.currentTime - target) > 0.3) m.currentTime = target;
        } else {
          if (E.lastRate !== 1){ try { m.playbackRate = 1; } catch (e) {} E.lastRate = 1; }
          if (!m.paused) m.pause();
          if (Math.abs(m.currentTime - target) > (E.playing && rev ? 0.1 : 0.06) && !(E.playing && rev && m.seeking)) m.currentTime = target;
        }
      } else if (!m.paused) m.pause();
    }
    renderTexts(P.textsAt(E.proj, E.t));
    syncBackdrop(m);
    var ms = null, vo = null, mu = null;
    s.audio.forEach(function (a){ if (a.role === 'movieSound') ms = a; else if (a.role === 'voice') vo = a; else if (a.role === 'music') mu = a; });
    h.setMovieGain(ms && !ms.clip.reverse ? ms.gain : 0);
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
    try { E.hooks.movie.pause(); E.hooks.voice.pause(); if (E.hooks.music) E.hooks.music.pause(); E.ui.bgvid.pause(); } catch (e) {}
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
      var wasSel = E.sel === id; E.sel = id; var tr = f.track, c = f.clip;
      E.drag = { mode: handle ? (handle.classList.contains('ed-hl') ? 'trimL' : 'trimR') : 'pending', id: id, x0: ev.clientX, el: clipE, tr: tr,
        s0: c.start, e0: c.start + c.dur, touch: ev.pointerType === 'touch', moved: false, press: 0, timer: 0, wasSel: wasSel, sl0: E.ui.scroll.scrollLeft, lastX: ev.clientX };
      if (E.drag.mode === 'pending' && E.drag.touch) E.drag.press = setTimeout(function (){
        if (E.drag && E.drag.mode === 'pending'){ E.drag.mode = 'move'; try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} }
      }, 380);
      
      renderSelectionOnly();
    } else {
      E.drag = { mode: 'scrub' }; seek(xToT(ev.clientX));
    }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onCancel);
  }
  function renderSelectionOnly(){
    var els = E.ui.inner.querySelectorAll('.ed-clip');
    for (var i = 0; i < els.length; i++) els[i].classList.toggle('sel', els[i].dataset.id === E.sel);
    renderSelected(); updateButtons(); syncDock();
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
    else if (d.mode === 'move'){ d.lastX = ev.clientX; if (!d.timer) d.timer = setInterval(autoScrollTick, 30); moveTo(d); }
  }
  function onUp(){ endDrag(false); }
  function onCancel(){ endDrag(true); }
  function endDrag(cancel){
    var d = E.drag; E.drag = null;
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel);
    E.pointers = {}; E.pinch = null;
    if (!d) return; clearTimeout(d.press); clearInterval(d.timer);
    if (cancel){ renderTimeline(); return; }
    if (d.mode === 'trimL' || d.mode === 'trimR') finishTrim(d);
    else if (d.mode === 'move' && d.moved){
      var cur0 = E.hist.cur, q = P.placeClip(cur0, d.id, d.newStart), pic0 = d.tr.role === 'movie' || d.tr.role === 'movieSound';
      if (q === cur0){ renderTimeline(); var pl0 = P.planPlace(cur0, d.id, d.newStart); if (pl0 && (pl0.start !== d.s0 || pl0.pushed)) toast('There is no room for it there.'); } else commit(pic0 ? tidy(q) : q);
    }
    else if (!d.moved && d.wasSel && (d.mode === 'pending' || d.mode === 'move')){ E.sel = null; renderSelectionOnly(); }   // a tap on the clip that is already selected lets go of it
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
      else if (k === 'y' || k === 'Y') redo();
      else if (k === 'd' || k === 'D') duplicateSel();
      else ok = false;
    }
    else if (k === ' ' || k === 'Enter'){ if (tag === 'BUTTON') ok = false; else togglePlay(); }
    else if (k === 's' || k === 'S') split();
    else if (k === 'Delete' || k === 'Backspace'){ if (ev.shiftKey) deleteSel(); else cutOut(); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight'){
      if (tag === 'INPUT') ok = false; else seek(E.t + (k === 'ArrowLeft' ? -1 : 1) * (ev.shiftKey ? 1000 : FRAME_MS));
    }
    else if (k === 'Home') seek(0); else if (k === 'End') seek(E.proj.durationMs);
    else if (k === '+' || k === '=') setZoom(E.ppm * 1.4); else if (k === '-') setZoom(E.ppm / 1.4);
    else if (k === 'Escape'){ if (E.panel) closePanel(); else if (E.tool) closeTool(); else select(null); }
    else ok = false;
    if (ok) ev.preventDefault();
  }

  // ---------- opening and closing ----------
  function init(hooks){ E.hooks = hooks; }
  // The project for a session. Your saved edits are used when this device has them for this same recording.
  // The voice timing is not part of the signature: when it has changed since the project was made (or saved),
  // the voice is moved by the difference, in the project and in every undo step, and all other edits stay.
  function cacheFor(sess, opts){
    var key = sess.id || 'session', nudge = sess.voiceNudgeMs || 0, c = E.cache[key];
    var sig = [sess.durationMs, (sess.events || []).length, sess.voiceOffsetMs || 0].join('|');
    if (!c || c.sig !== sig){
      var saved = !c && opts && opts.saved, proj, madeWith = nudge;
      if (saved && saved.project && saved.sig === saveSig(sess) && P.validate(saved.project).length === 0){
        proj = saved.project; if (saved.nudge != null) madeWith = saved.nudge;
      } else proj = P.compileFromSession(Object.assign({}, sess, { voiceDurMs: (opts && opts.voiceDurMs) || null }));
      var hist = new P.EditHistory(); hist.reset(proj);
      c = E.cache[key] = { sig: sig, hist: hist, restored: !!(saved && saved.project && proj === saved.project), nudge: madeWith };
    }
    if (c.nudge !== nudge){
      var from = c.nudge;
      c.hist.mapAll(function (p){ return P.shiftVoice(p, nudge - from); });
      c.nudge = nudge;
    }
    return c;
  }
  // Does this session have edits that would be lost if the recording changes (Take back)?
  function hasEdits(sess, opts){
    var c = E.cache[sess.id || 'session'];
    if (c) return c.hist.past.length > 0 || c.restored;
    var sv = opts && opts.saved;
    return !!(sv && sv.project && sv.sig === saveSig(sess));
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
    E.ui.picbox.appendChild(m);
    E.ui.stageMsg.textContent = movieReady() ? '' : 'Choose the movie for this session in Preview first, then come back to edit.';
    E.ui.note.textContent = c.restored ? 'Your earlier edits were restored.' : '';
    showSaved(c.restored || c.hist.past.length ? 'Saved' : '');
    E.lastFilter = ''; E.lastOpacity = ''; E.lastRate = 1; E.lastTransform = ''; E.lastTint = E.lastVeil = ''; E.lastSharp = -1; E.boxKey = null; E.boxMode = '';
    E.tool = null; E.panel = null; E.autoDock = false; E.rowScroll = null; E.chip = {}; renderDock();
    E.root.hidden = false; E.isOpen = true;
    document.addEventListener('keydown', onKey);
    layoutTextLayer(); fit(); readout(); syncMedia();
  }
  function close(){
    if (!E.isOpen) return;
    pause(); endDrag(true); try { E.ui.bgvid.pause(); } catch (e) {}
    if (E.saveT) flushSave();
    document.removeEventListener('keydown', onKey);
    var h = E.hooks; try { h.voice.volume = 1; if (E.voiceGain) E.voiceGain.gain.value = 1; if (E.musicGain) E.musicGain.gain.value = 1; h.setMovieGain(1); } catch (e) {}
    try { h.movie.style.filter = ''; h.movie.style.opacity = ''; h.movie.style.transform = ''; h.movie.playbackRate = 1; E.ui.tint.style.display = E.ui.veil.style.display = 'none'; E.lastTint = E.lastVeil = ''; E.lastSharp = -1; } catch (e) {}
    renderTexts([]);
    if (E.home && E.home.parent) E.home.parent.insertBefore(h.movie, E.home.next);
    E.root.hidden = true; E.isOpen = false;
    if (h.onClose) h.onClose();
  }

  return { init: init, open: open, close: close, isOpen: function (){ return E.isOpen; },
    project: function (){ return E.proj; }, split: split, cutOut: cutOut, deleteSel: deleteSel, undo: undo, redo: redo, select: select,
    seek: seek, planFor: planFor, scanQuiet: scanQuiet, play: play, pause: pause, setZoom: setZoom, fit: fit,
    openTool: openTool, openPanel: openPanel, closeTool: closeTool, freezeHere: freezeHere, reverseSel: reverseSel, flushSave: flushSave, duplicateSel: duplicateSel, rotateSel: rotateSel, flipSel: flipSel,
    hasEdits: hasEdits, replaceMovie: replaceMovie, importCaptions: importCaptions, exportSrt: exportSrt, detachSel: detachSel };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NakiEditor;

// Which version of this file is running (the Home screen lists these, so a stale copy is easy to spot).
if (typeof window !== 'undefined'){ window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['editor.js'] = 'format-bg'; }
