'use strict';
/* Naki editor: the timeline screen (phone and computer). Sits on top of project.js.
   The host page (index.html) calls NakiEditor.init({...}) once, then NakiEditor.open(session). */
var NakiEditor = (function () {
  var P = (typeof module !== 'undefined' && module.exports) ? require('./project.js') : window.NakiProject;
  var PAD = 16, MIN_PPM = 0.004, MAX_PPM = 0.6, FRAME_MS = 33;
  var ROLE_NAME = { movie: 'Picture', movieSound: 'Movie sound', voice: 'Your voice', music: 'Music' };
  var E = { hooks: null, root: null, ui: {}, hist: null, proj: null, sess: null, sel: null, t: 0, playing: false, ppm: 0.06,
    cache: {}, drag: null, raf: 0, wall: 0, wallT: 0, isOpen: false, home: null, pointers: {}, pinch: null,
    voiceGain: null, quiet: null, quietDb: -42 };

  function mk(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function add(parent){ for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }
  function btn(id, text, cls, label){ var b = mk('button', cls || 'ed-btn', text); b.type = 'button'; if (id) b.id = id; if (label) b.setAttribute('aria-label', label); return b; }
  function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
  function fmtP(ms){ ms = Math.max(0, ms); var s = ms / 1000, m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }
  function tx(t){ return PAD + t * E.ppm; }
  function toast(m){ if (E.hooks && E.hooks.toast) E.hooks.toast(m); }
  function clipCount(p){ var n = 0; p.tracks.forEach(function (t){ n += t.clips.length; }); return n; }
  function trackOf(id){ var f = P.findClip(E.proj, id); return f ? f.track : null; }

  // ---------- building the screen ----------
  function build(){
    var u = E.ui, root = mk('div', 'ed');
    root.id = 'editor'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Video editor');
    var top = mk('div', 'ed-top');
    u.close = btn('edClose', '‹ Back', 'ed-btn', 'Close editor');
    u.undo = btn('edUndo', 'Undo', 'ed-btn', 'Undo'); u.redo = btn('edRedo', 'Redo', 'ed-btn', 'Redo');
    u.time = mk('div', 'ed-time num');
    add(top, u.close, mk('div', 'ed-title', 'Edit video'), u.undo, u.redo, u.time);

    u.stage = mk('div', 'ed-stage'); u.stageMsg = mk('div', 'ed-stage-msg'); u.stage.appendChild(u.stageMsg);
    u.insp = mk('aside', 'ed-insp'); u.mix = mk('div', 'ed-mix'); u.selinfo = mk('div', 'ed-selinfo');
    add(u.insp, mk('h3', null, 'Sound'), u.mix, mk('h3', null, 'Selected clip'), u.selinfo);

    var tools = mk('div', 'ed-tools');
    u.play = btn('edPlay', '▶ Play', 'ed-btn primary', 'Play or pause');
    u.split = btn('edSplit', 'Split', 'ed-btn', 'Split at the playhead');
    u.cut = btn('edCut', 'Cut out', 'ed-btn', 'Cut out the selected clip and close the gap');
    u.del = btn('edDelete', 'Delete', 'ed-btn', 'Delete the selected clip and leave a gap');
    u.quiet = btn('edQuiet', 'Quiet pauses', 'ed-btn', 'Find quiet pauses');
    u.mixBtn = btn('edMixBtn', 'Sound', 'ed-btn ed-only-small', 'Sound levels');
    u.zout = btn('edZoomOut', '−', 'ed-btn ed-sq', 'Zoom out'); u.zin = btn('edZoomIn', '+', 'ed-btn ed-sq', 'Zoom in');
    u.fit = btn('edFit', 'Fit', 'ed-btn', 'Fit the whole video');
    var sp = mk('span', 'ed-spacer');
    add(tools, u.play, u.split, u.cut, u.del, u.quiet, u.mixBtn, sp, u.zout, u.zin, u.fit);

    u.note = mk('div', 'ed-note');
    var tl = mk('div', 'ed-tl'); u.labels = mk('div', 'ed-labels'); u.scroll = mk('div', 'ed-scroll'); u.inner = mk('div', 'ed-inner');
    add(u.scroll, u.inner); add(tl, u.labels, u.scroll);
    add(root, top, u.stage, u.insp, tools, u.note, tl);
    document.body.appendChild(root); E.root = root;

    u.close.onclick = close; u.undo.onclick = undo; u.redo.onclick = redo;
    u.play.onclick = togglePlay; u.split.onclick = split; u.cut.onclick = cutOut; u.del.onclick = deleteSel;
    u.quiet.onclick = scanQuiet; u.fit.onclick = fit;
    u.zin.onclick = function (){ setZoom(E.ppm * 1.4); }; u.zout.onclick = function (){ setZoom(E.ppm / 1.4); };
    u.mixBtn.onclick = function (){ root.classList.toggle('mix-open'); };
    u.scroll.addEventListener('pointerdown', onDown);
    u.scroll.addEventListener('wheel', function (ev){
      if (ev.ctrlKey || ev.metaKey){ ev.preventDefault(); setZoom(E.ppm * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), ev.clientX); }
      else if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)){ u.scroll.scrollLeft += ev.deltaY; ev.preventDefault(); }
    }, { passive: false });
    u.scroll.addEventListener('touchmove', function (ev){ if (E.drag && E.drag.mode === 'move') ev.preventDefault(); }, { passive: false });
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
      var row = mk('div', 'ed-row k-' + tr.role); row.style.height = (tr.kind === 'video' ? 56 : 44) + 'px'; row.dataset.track = tr.id;
      tr.clips.forEach(function (c){ row.appendChild(clipEl(tr, c)); });
      u.inner.appendChild(row);
    });
    u.head = mk('div', 'ed-head'); u.inner.appendChild(u.head);
    placeHead(); renderLabels(); renderMix(); renderSelected(); updateButtons();
  }
  function clipEl(tr, c){
    var e = mk('div', 'ed-clip ' + (tr.kind === 'video' ? (c.type === 'freeze' ? 'k-freeze' : 'k-video') : 'k-' + tr.role) + (c.id === E.sel ? ' sel' : ''));
    e.dataset.id = c.id; e.style.left = tx(c.start) + 'px'; e.style.width = Math.max(3, c.dur * E.ppm) + 'px';
    if (c.dur * E.ppm > 46) e.appendChild(mk('span', 'ed-cl', clipTitle(tr, c)));
    if (tr.role === 'voice'){ var cv = mk('canvas'); e.appendChild(cv); drawWave(cv, c); }
    add(e, mk('i', 'ed-h ed-hl'), mk('i', 'ed-h ed-hr'));
    return e;
  }
  function clipTitle(tr, c){ return tr.kind === 'video' ? (c.type === 'freeze' ? 'Paused picture' : 'Movie playing') : (ROLE_NAME[tr.role] || 'Audio'); }
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
      var l = mk('div', 'ed-label' + (tr.muted ? ' muted' : '')); l.style.height = (tr.kind === 'video' ? 56 : 44) + 'px';
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
  function readout(){ E.ui.time.textContent = fmtP(E.t) + ' / ' + fmtP(E.proj.durationMs); }
  function hasCrossing(t){
    return E.proj.tracks.some(function (tr){ return tr.clips.some(function (c){ return c.start < t && t < c.start + c.dur; }); });
  }
  function updateButtons(){
    var u = E.ui;
    u.undo.disabled = !E.hist.past.length; u.redo.disabled = !E.hist.future.length;
    u.split.disabled = !hasCrossing(Math.round(E.t)); u.cut.disabled = !E.sel; u.del.disabled = !E.sel;
    u.play.textContent = E.playing ? '❚❚ Pause' : '▶ Play';
    if (!E.quiet && !E.hist.past.length && !E.ui.note.firstChild)
      u.note.textContent = 'Move the playhead, tap Split, tap the part you do not want, then Cut out.';
  }

  // ---------- sound panel and selected clip ----------
  function slider(min, max, step, val, label){
    var r = mk('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val; r.setAttribute('aria-label', label); return r;
  }
  function renderMix(){
    var u = E.ui; u.mix.textContent = '';
    E.proj.tracks.forEach(function (tr){
      if (tr.kind !== 'audio') return;
      var name = ROLE_NAME[tr.role] || tr.role, row = mk('div', 'ed-mixrow');
      var rng = slider(0, 200, 5, Math.round((tr.volume != null ? tr.volume : 1) * 100), name + ' volume'), out = mk('span', 'ed-mixval num', rng.value + '%');
      var mute = btn(null, tr.muted ? 'Muted' : 'Mute', 'ed-btn ed-small' + (tr.muted ? ' on' : ''), 'Mute ' + name);
      mute.setAttribute('aria-pressed', String(!!tr.muted));
      rng.oninput = function (){ out.textContent = rng.value + '%'; live(P.setTrackProps(E.hist.cur, tr.id, { volume: +rng.value / 100 })); };
      rng.onchange = function (){ commit(P.setTrackProps(E.hist.cur, tr.id, { volume: +rng.value / 100 })); };
      mute.onclick = function (){ commit(P.setTrackProps(E.hist.cur, tr.id, { muted: !tr.muted })); };
      add(row, mk('span', 'ed-mixname', name), rng, out, mute); u.mix.appendChild(row);
    });
  }
  function renderSelected(){
    var u = E.ui, f = E.sel && P.findClip(E.proj, E.sel); u.selinfo.textContent = '';
    if (!f){ u.selinfo.textContent = 'Tap a clip on the timeline to change it.'; return; }
    var c = f.clip, tr = f.track;
    var info = mk('div'); info.innerHTML = '<strong></strong><br>';
    info.firstChild.textContent = clipTitle(tr, c);
    info.appendChild(document.createTextNode('Starts ' + fmtP(c.start) + ' · Length ' + fmtP(c.dur)));
    if (tr.kind === 'video') info.appendChild(document.createTextNode(' · Movie at ' + fmtP(c.in)));
    u.selinfo.appendChild(info);
    if (tr.kind !== 'audio') return;
    function row(label, min, max, step, val, fmtv, key, scale){
      var r = mk('div', 'ed-mixrow wide'), rng = slider(min, max, step, val, label), out = mk('span', 'ed-mixval num', fmtv(val));
      function patch(){ var o = {}; o[key] = +rng.value / scale; if (key === 'fadeIn') o.fadeInOff = 0; if (key === 'fadeOut') o.fadeOutOff = 0; return P.setClipProps(E.hist.cur, c.id, o); }
      rng.oninput = function (){ out.textContent = fmtv(+rng.value); live(patch()); };
      rng.onchange = function (){ commit(patch()); };
      add(r, mk('span', 'ed-mixname', label), rng, out); u.selinfo.appendChild(r);
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
    renderAll(); syncMedia();
  }
  function undo(){ E.hist.undo(); E.proj = E.hist.cur; E.quiet = null; E.ui.note.textContent = ''; afterEdit(); }
  function redo(){ E.hist.redo(); E.proj = E.hist.cur; E.quiet = null; E.ui.note.textContent = ''; afterEdit(); }
  function select(id){ E.sel = id || null; renderTimeline(); }
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
  function scanQuiet(){
    var sil = P.findSilentRanges(E.proj.levels || [], { thresholdDb: E.quietDb, minMs: 700, padMs: 150 });
    var dead = P.intersectRanges(sil, P.freezeRanges(E.proj));
    if (!dead.length){ E.quiet = null; E.ui.note.textContent = 'No quiet pauses found while the picture is paused.'; return; }
    var total = 0; dead.forEach(function (r){ total += r.end - r.start; }); E.quiet = dead;
    var n = E.ui.note; n.textContent = 'Found ' + dead.length + ' quiet pause' + (dead.length > 1 ? 's' : '') + ' (' + (total / 1000).toFixed(1) + ' s) where nothing is said.';
    var yes = btn('edQuietYes', 'Remove them', 'ed-btn primary'), no = btn('edQuietNo', 'Keep', 'ed-btn');
    yes.onclick = function (){ var r = E.quiet; E.quiet = null; n.textContent = ''; commit(P.rippleDeleteRanges(E.hist.cur, r)); };
    no.onclick = function (){ E.quiet = null; n.textContent = ''; };
    add(n, yes, no);
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
  function voiceGainSetup(){
    var h = E.hooks; if (h.simple || E.voiceGain) return;
    var ctx = h.getCtx && h.getCtx(); if (!ctx) return;
    try { var src = ctx.createMediaElementSource(h.voice), g = ctx.createGain(); src.connect(g); g.connect(ctx.destination); E.voiceGain = g; } catch (e) {}
  }
  function setVoiceGain(v){
    var h = E.hooks;
    if (E.voiceGain){ var ctx = h.getCtx(); E.voiceGain.gain.setTargetAtTime(v, ctx.currentTime, 0.02); h.voice.volume = 1; }
    else h.voice.volume = clamp(v, 0, 1);
  }
  function syncMedia(){
    var h = E.hooks, m = h.movie, v = h.voice, s = P.sourceAt(E.proj, E.t);
    if (movieReady()){
      if (s.video){
        var target = s.video.movieMs / 1000;
        if (E.playing && s.video.type === 'video'){
          if (m.paused){ var pr = m.play(); if (pr && pr.catch) pr.catch(function (){}); }
          if (Math.abs(m.currentTime - target) > 0.3) m.currentTime = target;
        } else {
          if (!m.paused) m.pause();
          if (Math.abs(m.currentTime - target) > 0.06) m.currentTime = target;
        }
      } else if (!m.paused) m.pause();
    }
    var ms = null, vo = null;
    s.audio.forEach(function (a){ if (a.role === 'movieSound') ms = a; else if (a.role === 'voice') vo = a; });
    h.setMovieGain(ms ? ms.gain : 0);
    if (E.playing && vo){
      if (v.paused){ v.currentTime = vo.sourceMs / 1000; var pv = v.play(); if (pv && pv.catch) pv.catch(function (){}); }
      else if (Math.abs(v.currentTime * 1000 - vo.sourceMs) > 250) v.currentTime = vo.sourceMs / 1000;
      setVoiceGain(vo.gain);
    } else if (!v.paused) v.pause();
  }
  function togglePlay(){ if (E.playing) pause(); else play(); }
  function play(){
    if (E.playing) return;
    if (!movieReady()){ toast('Choose the movie for this session first.'); return; }
    E.hooks.ensureAudio(); voiceGainSetup();
    var ctx = E.hooks.getCtx && E.hooks.getCtx(); if (ctx && ctx.resume) ctx.resume();
    if (E.t >= E.proj.durationMs - 50) E.t = 0;
    E.playing = true; E.wall = performance.now(); E.wallT = E.t; updateButtons(); loop();
  }
  function pause(){
    E.playing = false; if (E.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(E.raf); E.raf = 0;
    try { E.hooks.movie.pause(); E.hooks.voice.pause(); } catch (e) {}
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
    renderSelected(); updateButtons();
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
    else if (k === 'Escape'){ if (E.root.classList.contains('mix-open')) E.root.classList.remove('mix-open'); else select(null); }
    else ok = false;
    if (ok) ev.preventDefault();
  }

  // ---------- opening and closing ----------
  function init(hooks){ E.hooks = hooks; }
  function open(sess, opts){
    if (!E.hooks) throw new Error('NakiEditor.init() must be called first');
    if (!E.root) build();
    opts = opts || {};
    var key = sess.id || 'session', sig = [sess.durationMs, (sess.events || []).length, sess.voiceNudgeMs || 0, sess.voiceOffsetMs || 0].join('|'), c = E.cache[key];
    if (!c || c.sig !== sig){
      var proj = P.compileFromSession(Object.assign({}, sess, { voiceDurMs: opts.voiceDurMs || null }));
      var hist = new P.EditHistory(); hist.reset(proj); c = E.cache[key] = { sig: sig, hist: hist };
    }
    E.hist = c.hist; E.proj = c.hist.cur; E.sess = sess; E.sel = null; E.t = 0; E.playing = false; E.quiet = null;
    E.quietDb = -42; (sess.events || []).forEach(function (e){ if (e.type === 'duck' && typeof e.thresholdDb === 'number') E.quietDb = e.thresholdDb; });
    var m = E.hooks.movie; E.home = m.parentNode ? { parent: m.parentNode, next: m.nextSibling } : null;
    E.ui.stage.insertBefore(m, E.ui.stage.firstChild);
    E.ui.stageMsg.textContent = movieReady() ? '' : 'Choose the movie for this session in Preview first, then come back to edit.';
    E.ui.note.textContent = '';
    E.root.classList.remove('mix-open'); E.root.hidden = false; E.isOpen = true;
    document.addEventListener('keydown', onKey);
    fit(); readout(); syncMedia();
  }
  function close(){
    if (!E.isOpen) return;
    pause(); endDrag(true);
    document.removeEventListener('keydown', onKey);
    var h = E.hooks; try { h.voice.volume = 1; if (E.voiceGain) E.voiceGain.gain.value = 1; h.setMovieGain(1); } catch (e) {}
    if (E.home && E.home.parent) E.home.parent.insertBefore(h.movie, E.home.next);
    E.root.hidden = true; E.isOpen = false;
    if (h.onClose) h.onClose();
  }

  return { init: init, open: open, close: close, isOpen: function (){ return E.isOpen; },
    project: function (){ return E.proj; }, split: split, cutOut: cutOut, deleteSel: deleteSel, undo: undo, redo: redo, select: select,
    seek: seek, scanQuiet: scanQuiet, play: play, pause: pause, setZoom: setZoom, fit: fit };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NakiEditor;
