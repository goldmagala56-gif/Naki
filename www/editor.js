'use strict';
/* Naki editor: the timeline screen (phone and computer). Sits on top of project.js.
   The host page (index.html) calls NakiEditor.init({...}) once, then NakiEditor.open(session).
   Layout, CapCut style: a dock along the bottom. Main toolbar -> tap Edit / Audio / Text or a clip -> a row of tools with a back arrow
   -> a tool with settings -> a small panel with a tick. Nothing slides up over the picture or the timeline. */
var NakiEditor = (function () {
  var P = (typeof module !== 'undefined' && module.exports) ? require('./project.js') : window.NakiProject;
  P = Object.assign({}, P, { setAnimated: P.setAnimatedAuto || P.setAnimated });   // in the editor, a change at a new moment keyframes every property there (CapCut style)
  var NP = (typeof module !== 'undefined' && module.exports) ? require('./plan.js') : window.NakiPlan;
  var NF = (typeof module !== 'undefined' && module.exports) ? require('./format.js') : (typeof window !== 'undefined' ? window.NakiFormat : null);
  var NSTK = (typeof module !== 'undefined' && module.exports) ? require('./stickers.js') : (typeof window !== 'undefined' ? window.NakiStickers : null);
  var NPR = (typeof module !== 'undefined' && module.exports) ? require('./presets.js') : (typeof window !== 'undefined' ? window.NakiPresets : null);
  var NANIM = (typeof module !== 'undefined' && module.exports) ? require('./anim.js') : (typeof window !== 'undefined' ? window.NakiAnim : null);
  var NFX = (typeof module !== 'undefined' && module.exports) ? require('./fx.js') : (typeof window !== 'undefined' ? window.NakiFx : null);
var NCV = (typeof module !== 'undefined' && module.exports) ? require('./speedcurve.js') : (typeof window !== 'undefined' ? window.NakiCurve : null);
var NTH = (typeof module !== 'undefined' && module.exports) ? require('./thumbs.js') : (typeof window !== 'undefined' ? window.NakiThumbs : null);
var NPK = (typeof module !== 'undefined' && module.exports) ? require('./peaks.js') : (typeof window !== 'undefined' ? window.NakiPeaks : null);
  var NSFX = (typeof module !== 'undefined' && module.exports) ? require('./sfx.js') : (typeof window !== 'undefined' ? window.NakiSfx : null);
  var NCAP = (typeof module !== 'undefined' && module.exports) ? require('./captions.js') : (typeof window !== 'undefined' ? window.NakiCaptions : null);
  var NSUBS = (typeof module !== 'undefined' && module.exports) ? require('./subtitles.js') : (typeof window !== 'undefined' ? window.NakiSubs : null);
  var NL2 = (typeof module !== 'undefined' && module.exports) ? require('./look2.js') : (typeof window !== 'undefined' ? window.NakiLook2 : null);
  var NPT = (typeof module !== 'undefined' && module.exports) ? require('./projtemplate.js') : (typeof window !== 'undefined' ? window.NakiProjTpl : null);
  var NTPL = (typeof module !== 'undefined' && module.exports) ? require('./templates.js') : (typeof window !== 'undefined' ? window.NakiTemplates : null);
  var NRB = (typeof module !== 'undefined' && module.exports) ? require('./removebg.js') : (typeof window !== 'undefined' ? window.NakiRemoveBg : null);
  var NBS = (typeof module !== 'undefined' && module.exports) ? require('./beatsync.js') : (typeof window !== 'undefined' ? window.NakiBeats : null);
  var NMO = (typeof module !== 'undefined' && module.exports) ? require('./motion.js') : (typeof window !== 'undefined' ? window.NakiMotion : null);
  var NMC = (typeof module !== 'undefined' && module.exports) ? require('./multicam.js') : (typeof window !== 'undefined' ? window.NakiMulticam : null);
  var NTTS = (typeof module !== 'undefined' && module.exports) ? require('./tts.js') : (typeof window !== 'undefined' ? window.NakiTTS : null);
  var NRF = (typeof module !== 'undefined' && module.exports) ? require('./reframe.js') : (typeof window !== 'undefined' ? window.NakiReframe : null);
  var NCL = (typeof module !== 'undefined' && module.exports) ? require('./colour.js') : (typeof window !== 'undefined' ? window.NakiColour : null);
  var NAC = (typeof module !== 'undefined' && module.exports) ? require('./autocut.js') : (typeof window !== 'undefined' ? window.NakiAutoCut : null);
  var NRP = (typeof module !== 'undefined' && module.exports) ? require('./speedramp.js') : (typeof window !== 'undefined' ? window.NakiRamp : null);
  var TRANSITIONS = [{ key: 'none', label: 'None' }, { key: 'fade', label: 'Fade' }, { key: 'fadeblack', label: 'Dip to black' }, { key: 'wipeleft', label: 'Wipe' }, { key: 'slideleft', label: 'Slide' }, { key: 'zoomin', label: 'Zoom' }, { key: 'circleopen', label: 'Circle' }];
  var PAD = 16, MIN_PPM = 0.004, MAX_PPM = 0.6, FRAME_MS = 33;
  var ROLE_NAME = { movie: 'Picture', movieSound: 'Movie sound', voice: 'Your voice', music: 'Music', text: 'Text', captions: 'Captions', stickers: 'Stickers', overlay: 'Overlay', sfx: 'Effects', fx: 'Video effects', layout: 'Layout' };
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
  var COARSE = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
function rowH(tr){
  var s = tr.kind === 'video' ? 56 : (tr.kind === 'text' || tr.kind === 'sticker' || tr.kind === 'fx' || tr.kind === 'layout') ? 30 : 44;
  return COARSE ? s + (s < 40 ? 10 : 4) : s;
}
function codePrefix(tr, c){
  if (tr.kind === 'video') return c.type === 'freeze' && isPhotoClip(c) ? 'P' : (c.asset && c.asset !== 'movie') ? 'V' : 'C';
  if (tr.kind === 'audio') return tr.role === 'sfx' ? 'A' : tr.role === 'voice' ? 'VO' : tr.role === 'music' ? 'MU' : 'MS';
  if (tr.kind === 'overlay') return 'O';
  if (tr.kind === 'sticker') return 'ST';
  if (tr.kind === 'text') return tr.role === 'captions' ? 'CP' : 'T';
  if (tr.kind === 'fx') return 'FX';
  return 'LY';
}
function buildCodes(p){
  var g = {}, out = {};
  p.tracks.forEach(function (tr){ tr.clips.forEach(function (c){ var k = codePrefix(tr, c); (g[k] = g[k] || []).push(c); }); });
  Object.keys(g).forEach(function (k){ g[k].sort(function (a, b){ return a.start - b.start; }).forEach(function (c, i){ out[c.id] = k + (i + 1); }); });
  return out;
}
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
    { name: 'format', label: 'Format', icon: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10v4M17 10v4"/>'), go: function (){ openPanel('format'); } },
    { name: 'filters', label: 'Filters', icon: svg('<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>'), go: function (){ openPanel('filters'); } },
    { name: 'sticker', label: 'Stickers', icon: svg('<path d="M20 12a8 8 0 11-8-8h5a3 3 0 013 3z"/><path d="M9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 007 0"/>'), go: function (){ openTool('sticker'); } },
    { name: 'overlay', label: 'Overlay', icon: svg('<rect x="3" y="5" width="14" height="11" rx="1.5"/><rect x="9" y="9" width="12" height="10" rx="1.5"/>'), go: function (){ openTool('overlay'); } },
        { name: 'rembg', label: 'Remove BG', icon: svg('<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0113 0"/><path d="M3 3l2 2M21 3l-2 2M3 21l2-2M21 21l-2-2"/>'), go: function (){ if (!selOverlay()) toast('Tap a photo overlay on the timeline first.'); openPanel('removebg', 'overlay'); } },
    { name: 'fx', label: 'Effects', icon: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>'), go: function (){ openTool('fx'); } },
    { name: 'layout', label: 'Layout', icon: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18"/>'), go: function (){ openTool('layout'); } },
    { name: 'marker', label: 'Marker', icon: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'), go: function (){ openTool('marker'); } },
    { name: 'select', label: 'Select', icon: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2 4-4"/>'), go: function (){ openTool('select'); } }
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
    u.xvid = mk('video', 'ed-xvid'); u.xvid.muted = true; u.xvid.setAttribute('playsinline', ''); u.xvid.setAttribute('aria-hidden', 'true'); u.xvid.preload = 'auto'; u.picbox.appendChild(u.xvid);
    var NSV = 'http://www.w3.org/2000/svg', tsv = document.createElementNS(NSV, 'svg'), tfl = document.createElementNS(NSV, 'filter'), tct = document.createElementNS(NSV, 'feComponentTransfer');
    tsv.setAttribute('width', '0'); tsv.setAttribute('height', '0'); tsv.style.position = 'absolute'; tfl.setAttribute('id', 'nakiTone');
    ['R', 'G', 'B'].forEach(function (ch){ var fn = document.createElementNS(NSV, 'feFunc' + ch); fn.setAttribute('type', 'table'); fn.setAttribute('tableValues', '0 0.25 0.5 0.75 1'); tct.appendChild(fn); u['tone' + ch] = fn; });
    tfl.appendChild(tct); tsv.appendChild(tfl); u.stage.appendChild(tsv);
    u.tint2 = mk('div', 'ed-tint2'); u.grain = mk('div', 'ed-grain'); u.fxflash = mk('div', 'ed-fxflash'); u.layoutcv = mk('canvas', 'ed-layoutcv'); u.picframe.appendChild(u.layoutcv); u.picframe.appendChild(u.tint2); u.picframe.appendChild(u.grain); u.picframe.appendChild(u.fxflash);
    u.overlaylayer = mk('div', 'ed-overlaylayer'); u.stage.appendChild(u.overlaylayer);
    u.stickerlayer = mk('div', 'ed-stickerlayer'); u.stage.appendChild(u.stickerlayer);
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
    u.croplayer = mk('div', 'ed-croplayer'); u.croplayer.style.cssText = 'position:absolute;display:none;overflow:hidden;pointer-events:none;z-index:6'; u.stage.appendChild(u.croplayer);

    // desktop side panel: sound levels and the selected clip
    u.insp = mk('aside', 'ed-insp'); u.mix = mk('div', 'ed-mix'); u.selinfo = mk('div', 'ed-selinfo');
    add(u.insp, mk('h3', null, 'Sound'), u.mix, mk('h3', null, 'Selected clip'), u.selinfo);

    // play row: play, time, scrub, undo, redo
    var bar = mk('div', 'ed-bar');
    u.play = iconBtn('edPlay', ICON.play, 'Play or pause', 'ed-ibtn ed-play');
    u.time = mk('div', 'ed-time num');
    u.scrub = mk('input', 'ed-scrub'); u.scrub.type = 'range'; u.scrub.min = 0; u.scrub.max = 1000; u.scrub.value = 0; u.scrub.setAttribute('aria-label', 'Position');
    u.undo = iconBtn('edUndo', ICON.undo, 'Undo'); u.redo = iconBtn('edRedo', ICON.redo, 'Redo');
        u.kfBtn = iconBtn('edBarKf', svg('<path d="M12 3l8 9-8 9-8-9z"/>'), 'Add keyframe');
    u.kfBtn.onclick = function (){
      var f = E.sel && P.findClip(E.proj, E.sel), c = f && f.clip;
      if (!c || !P.keyframeProps(E.proj, c.id).length){ toast('Tap a picture or overlay clip first.'); return; }
      commit(P.toggleKeyframes(E.hist.cur, c.id, relNow(c)));
    };
    add(bar, u.play, u.time, u.scrub, u.kfBtn, u.undo, u.redo);

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
    u.toolbar = cueScroller(tb, false); u.dock = mk('div', 'ed-dock'); u.dock.appendChild(u.toolbar);   // the toolbar scrolls sideways, with arrows

    add(root, top, u.stage, u.insp, bar, u.note, tl, u.dock);
    document.body.appendChild(root); E.root = root;

    u.close.onclick = close; u.undo.onclick = undo; u.redo.onclick = redo; u.play.onclick = togglePlay;
    u.fit.onclick = fit;
    u.exportBtn.onclick = function (){ if (!E.hooks.onExport){ toast('Export is not available here.'); return; } close(); E.hooks.onExport(); };
    u.zin.onclick = function (){ setZoom(E.ppm * 1.4); }; u.zout.onclick = function (){ setZoom(E.ppm / 1.4); };
    u.scrub.addEventListener('input', function (){ seek(+u.scrub.value / 1000 * E.proj.durationMs); });
    u.scroll.addEventListener('pointerdown', onDown);
    u.scroll.addEventListener('scroll', scheduleRepaint);
    u.scroll.addEventListener('wheel', function (ev){
      if (ev.ctrlKey || ev.metaKey){ ev.preventDefault(); setZoom(E.ppm * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), ev.clientX); }
      else if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)){ u.scroll.scrollLeft += ev.deltaY; ev.preventDefault(); }
    }, { passive: false });
    u.scroll.addEventListener('touchmove', function (ev){ if (E.drag && E.drag.mode === 'move') ev.preventDefault(); }, { passive: false });
    u.scroll.addEventListener('contextmenu', function (ev){ ev.preventDefault(); });
    if (typeof window !== 'undefined') window.addEventListener('resize', function (){ if (E.isOpen){ layoutTextLayer(); renderTexts(P.textsAt(E.proj, E.t)); } });
    // The preview area changes height whenever the dock turns from toolbar to tool row to panel, so the picture is re-fitted each time
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function (){ if (E.isOpen){ layoutTextLayer(); renderTexts(P.textsAt(E.proj, E.t)); } }).observe(u.stage);
  }

  // ---------- drawing the timeline ----------
  function renderAll(){ renderTimeline(); readout(); }
  function renderTimeline(){
    var p = E.proj, u = E.ui;
    E.codes = buildCodes(p);
    u.inner.textContent = '';
    u.inner.style.width = (PAD + p.durationMs * E.ppm + 240) + 'px';
    var ruler = mk('div', 'ed-ruler'); u.ruler = ruler;
    var steps = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000], step = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) if (steps[i] * E.ppm >= 80){ step = steps[i]; break; }
    for (var t = 0; t <= p.durationMs + step; t += step){
      var k = mk('div', 'ed-tick', fmtP(t).replace(/\.0$/, '')); k.style.left = tx(t) + 'px'; ruler.appendChild(k);
    }
    try { drawBeatTicks(ruler); } catch (e) {}
    try { drawMarkerFlags(ruler); } catch (e) {}
    u.inner.appendChild(ruler);
    p.tracks.forEach(function (tr){
      var row = mk('div', 'ed-row k-' + tr.role + (tr.hidden ? ' off' : '') + (tr.locked ? ' locked' : '')); row.style.height = rowH(tr) + 'px'; row.dataset.track = tr.id;
      tr.clips.forEach(function (c){ row.appendChild(clipEl(tr, c)); });
      if (tr.role === 'movie' && E.hooks && E.hooks.pickVideo){   // CapCut style: a + after the last picture clip adds a video there
        var endT = 0; tr.clips.forEach(function (c){ endT = Math.max(endT, c.start + c.dur); });
        var plus = mk('button', 'ed-add', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Add a video after this');
        plus.style.left = (tx(endT) + 10) + 'px'; plus.addEventListener('pointerdown', function (ev){ ev.stopPropagation(); }); plus.onclick = addVideoFromFile; row.appendChild(plus);
      }
      u.inner.appendChild(row);
    });
    u.head = mk('div', 'ed-head'); u.inner.appendChild(u.head);
    placeHead(); renderLabels(); renderMix(); renderSelected(); updateButtons();
  }
  function clipKind(tr, c){ return tr.kind === 'text' ? 'k-text' : tr.kind === 'video' ? (c.type === 'freeze' ? 'k-freeze' : 'k-video') : 'k-' + tr.role; }
    // ----- thumbnails and waveforms on the clips, hide / lock / mute on the rows -----
  var TS = null, PS = null, repaintRaf = 0;
  function tlStores(){
    if (!TS && NTH) TS = new NTH.Store({ onReady: function (){ scheduleRepaint(); } });
    if (!PS && NPK) PS = new NPK.Store({ getFile: function (id){ return E.hooks && E.hooks.getAssetFile ? E.hooks.getAssetFile(id) : null; }, onReady: function (){ scheduleRepaint(); } });
  }
  // Pictures and sound arrive a little at a time. Only the clips that were still missing something are painted again.
  function scheduleRepaint(){
    if (repaintRaf || !E.isOpen || typeof requestAnimationFrame !== 'function') return;
    repaintRaf = requestAnimationFrame(function (){
      repaintRaf = 0; if (!E.ui.inner) return;
      var list = E.ui.inner.querySelectorAll('canvas.ed-thumbcv, canvas.ed-wavecv');
      for (var i = 0; i < list.length; i++){ var cv = list[i]; if (cv._pending){ try { (cv.className.indexOf('thumbcv') >= 0 ? paintClipThumbs : paintClipWave)(cv); } catch (err){ cv._pending = false; } } }
    });
  }
  function clipUrl(tr, c){
    var h = E.hooks || {};
    if (tr.kind === 'overlay') return h.overlayUrl ? h.overlayUrl(c.asset) : '';
    return c.asset && c.asset !== 'movie' ? (h.videoUrl ? h.videoUrl(c.asset) : '') : (h.movieUrl ? h.movieUrl() : '');
  }
  function paintClipThumbs(cv){
    var c = cv._c, tr = cv._tr, css = Math.max(1, c.dur * E.ppm), W = Math.min(8000, Math.round(css)), H = rowH(tr) - 4, k = W / css;
    if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
    var sc = E.ui.scroll, left = tx(c.start), asp = (E.frameDims && E.frameDims.h) ? E.frameDims.w / E.frameDims.h : 16 / 9;
    var miss = NTH.paint(cv.getContext('2d'), W, H, c, E.ppm, { url: clipUrl(tr, c), image: (tr.kind === 'overlay' && c.type === 'freeze') || (tr.kind === 'video' && c.type === 'freeze' && isPhotoClip(c)), store: TS,
      tileW: Math.max(24, Math.round(H * asp)), k: k, visible: [sc.scrollLeft - sc.clientWidth - left, sc.scrollLeft + 2 * sc.clientWidth - left], bg: tr.kind === 'overlay' ? '#0f5c66' : '#1f4e7d' });
    cv._pending = miss > 0;
  }
  function paintClipWave(cv){
    var c = cv._c, css = Math.max(1, c.dur * E.ppm), W = Math.min(4000, Math.max(1, Math.round(css))), H = 34;
    if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
    var g = cv.getContext('2d'), v = PS ? PS.view(c.asset, c.in || 0, c.dur * (c.speed || 1), W, !!c.reverse) : null;
    g.clearRect(0, 0, W, H);
    if (!v){ g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, H / 2 - 1, W, 2); cv._pending = false; return; }   // no file, or it cannot be read: a thin line
    g.fillStyle = 'rgba(255,255,255,.65)'; NPK.drawBars(g, v.vals, W, H, v.norm); cv._pending = !v.done;
  }
  function decorateClip(e, tr, c){
    if (c.dur * E.ppm < 6) return;
    tlStores();
    if ((tr.kind === 'video' || tr.kind === 'overlay') && TS && !c.gen){ var cv = mk('canvas', 'ed-thumbcv'); cv._tr = tr; cv._c = c; e.insertBefore(cv, e.firstChild); paintClipThumbs(cv); }
    else if (tr.kind === 'audio' && PS){ var wv = mk('canvas', 'ed-wavecv'); wv._c = c; e.appendChild(wv); paintClipWave(wv); }
  }
  // While a clip is dragged and one of its edges lands on another clip, the playhead or a beat, a white line shows where, and the phone gives a tiny tap.
    // ----- dragging a clip to another row -----
  function clearTargets(){
    var r = E.ui.inner && E.ui.inner.querySelectorAll('.ed-row.drop-target'); if (r) for (var i = 0; i < r.length; i++) r[i].classList.remove('drop-target');
    if (E.ui.newrow) E.ui.newrow.style.display = 'none';
  }
  // Where the clip would land if it were let go now: on its own row (the usual), on another row of its kind (that row lights up), or on a new row of its own
  // (a line shows where). Only overlays, stickers, titles, effects and sound effects can change rows.
  function pickRow(d){
    clearTargets(); d.target = null;
    var fam = P.rowFamily(d.tr), el = d.el, y = d.lastY, dy = y - d.y0;
    if (!fam || d.tr.locked || y == null || isNaN(dy)){ el.style.transform = ''; return; }
    var src = el.parentNode, sr = src.getBoundingClientRect();
    if (Math.abs(dy) < 8 || (y >= sr.top - 4 && y <= sr.bottom + 4)){ el.style.transform = ''; return; }   // still on its own row
    el.style.transform = 'translateY(' + dy + 'px)';
    var rows = E.ui.inner.querySelectorAll('.ed-row'), famRows = [], hit = null;
    for (var i = 0; i < rows.length; i++){
      var tr = E.proj.tracks[i]; if (!tr) continue;
      var rc = rows[i].getBoundingClientRect();
      if (y >= rc.top - 1 && y <= rc.bottom + 1) hit = { row: rows[i], tr: tr };
      if (P.rowFamily(tr) === fam) famRows.push({ rc: rc });
    }
    if (hit && hit.tr.id !== d.tr.id && P.rowFamily(hit.tr) === fam && !hit.tr.locked){ d.target = { track: hit.tr.id }; hit.row.classList.add('drop-target'); return; }
    if (!famRows.length) return;
    var first = famRows[0].rc, last = famRows[famRows.length - 1].rc, above = y < first.top, ir = E.ui.inner.getBoundingClientRect(), nr = E.ui.newrow;
    d.target = { track: 'new', pos: above ? 'above' : 'below' };
    if (!nr || !nr.parentNode){ nr = E.ui.newrow = mk('div', 'ed-newrow'); E.ui.inner.appendChild(nr); }
    nr.style.display = 'block'; nr.style.top = ((above ? first.top : last.bottom) - ir.top - 1) + 'px';
  }
  function showSnapGuide(d, raw){
    var g = E.ui.snapline, snapped = Math.abs(d.newStart - raw) >= 1;
    if (!snapped){ if (g) g.style.display = 'none'; d.wasSnapped = false; return; }
    var skip = P.linkedClips(E.hist.cur, d.id).map(function (x){ return x.clip.id; }), len = d.e0 - d.s0, th = snapTh();
    var a = P.snapTime(E.proj, raw, th, snapPts(), skip), b = P.snapTime(E.proj, raw + len, th, snapPts(), skip) - len;
    var atStart = a !== raw && (b === raw || Math.abs(a - raw) <= Math.abs(b - raw));
    if (!g || !g.parentNode){ g = E.ui.snapline = mk('div', 'ed-snapline'); E.ui.inner.appendChild(g); }
    g.style.display = 'block'; g.style.left = tx(atStart ? d.newStart : d.newStart + len) + 'px';
    if (!d.wasSnapped){ try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) {} }
    d.wasSnapped = true;
  }
  function clipEl(tr, c){
    var e = mk('div', 'ed-clip ' + clipKind(tr, c) + (c.id === E.sel ? ' sel' : '') + (E.multi && E.multi[c.id] ? ' multi' : '') + (c.group ? ' grp' : ''));
    e.dataset.id = c.id; e.style.left = tx(c.start) + 'px'; e.style.width = Math.max(tr.kind === 'video' ? 3 : 16, c.dur * E.ppm) + 'px';
    var wpx = c.dur * E.ppm, code = (E.codes && E.codes[c.id]) || '';
if (wpx > 70) e.appendChild(mk('span', 'ed-cl', code + ' · ' + clipTitle(tr, c)));
else if (wpx >= 16) e.appendChild(mk('span', 'ed-cl ed-code', code));
if (wpx < 44) e.classList.add('tiny');
    if (tr.role === 'voice'){ var cv = mk('canvas'); e.appendChild(cv); drawWave(cv, c); } else { try { decorateClip(e, tr, c); } catch (err){ console.warn('clip picture/waveform failed', err); } }
    if (c.kf){ var kts = {}; Object.keys(c.kf).forEach(function (k){ c.kf[k].forEach(function (pt){ kts[pt[0]] = 1; }); }); Object.keys(kts).forEach(function (t0){ var kd = mk('i', 'ed-kf'); kd.style.left = (t0 * E.ppm) + 'px'; kd.dataset.t = t0; e.appendChild(kd); }); }
    add(e, mk('i', 'ed-h ed-hl'), mk('i', 'ed-h ed-hr'));
    return e;
  }
  function selBar(){
  var f = E.sel && P.findClip(E.proj, E.sel); if (!f || E.panel) return null;
  var c = f.clip, bar = mk('div', 'ed-selbar'), nm = mk('span', 'ed-seln', ((E.codes && E.codes[c.id]) || '') + ' · ' + clipTitle(f.track, c) + ' · ' + fmtP(c.dur));
  function b(label, icon, fn, cls){ var x = iconBtn(null, icon, label, 'ed-ibtn' + (cls || '')); x.onclick = fn; return x; }
  return add(bar, nm, b('Zoom to this clip', G.zoom, zoomToSel), b('Split', G.split, split), b('Duplicate', G.dup, duplicateSel),
    b('Delete', G.trash, deleteSel, ' ed-selbar-del'), b('Done', G.check, function (){ E.multi = {}; select(null); }));
}
function zoomToSel(){
  var f = E.sel && P.findClip(E.proj, E.sel); if (!f) return;
  var sc = E.ui.scroll, c = f.clip;
  E.ppm = clamp(sc.clientWidth * 0.6 / Math.max(300, c.dur), MIN_PPM, MAX_PPM);
  renderTimeline(); sc.scrollLeft = Math.max(0, tx(c.start + c.dur / 2) - sc.clientWidth / 2);
}
  function clipTitle(tr, c){
    if (c.gen && NFX && NFX.gen) return NFX.gen.label(c.gen);
    if (c.layout && NLY) return 'Layout \u00b7 ' + NLY.label(c.layout.preset);
    if (tr.kind === 'text') return c.text || 'Text';
    if (tr.kind === 'video'){
      var extra = (c.speed && c.speed !== 1 ? ' ' + c.speed + '×' : '') + (c.filter ? ' · filter' : '') + (c.vFadeIn || c.vFadeOut ? ' · fade' : '') + (c.opacity != null ? ' · ' + Math.round(c.opacity * 100) + '%' : '') + (c.reverse ? ' · reversed' : '') + (c.transform ? ' · ' + (c.transform.zoom > 1 ? 'zoom ' : '') + (c.transform.rot ? c.transform.rot + '° ' : '') + (c.transform.flipH ? 'flip' : '') : '');
      return (c.type === 'freeze' ? (isPhotoClip(c) ? 'Photo · ' + ((E.proj.assets[c.asset] && E.proj.assets[c.asset].name) || '') : 'Paused picture') : (c.asset && c.asset !== 'movie' ? ((E.proj.assets[c.asset] && E.proj.assets[c.asset].name) || 'Video') : 'Movie playing')) + extra;
    }
    return tr.kind === 'fx' ? 'FX · ' + (NFX && NFX.vfx && NFX.vfx.has(c.fx) ? NFX.vfx.label(c.fx) : (NL2 ? NL2.fxLabel(c.fx) : c.fx)) : tr.kind === 'sticker' ? (c.glyph || '') + ' Sticker' : tr.kind === 'overlay' ? 'Overlay \u00b7 ' + ((E.proj.assets[c.asset] && E.proj.assets[c.asset].name) || '') : tr.role === 'sfx' ? 'Effect \u00b7 ' + ((E.proj.assets[c.asset] && E.proj.assets[c.asset].name) || '') : (ROLE_NAME[tr.role] || 'Audio');
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
    var LB = {
    lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
    eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeoff: svg('<path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.7M6.5 7.6A17 17 0 002 12s4 7 10 7a9.6 9.6 0 004.2-1"/>'),
    sound: svg('<path d="M5 9v6h3l5 4V5L8 9z"/><path d="M16.5 9a4 4 0 010 6"/>'),
    mute: svg('<path d="M5 9v6h3l5 4V5L8 9z"/><path d="M17 9.5l4 5M21 9.5l-4 5"/>')
  };
  // The name of each row, with its buttons: Hide (picture, titles, stickers, overlays, effects) or Mute (sound), and Lock for every row.
  function renderLabels(){
    var u = E.ui; u.labels.textContent = ''; u.labels.appendChild(mk('div', 'ed-spacer'));
    E.proj.tracks.forEach(function (tr){
      var nm = ROLE_NAME[tr.role] || tr.role, l = mk('div', 'ed-label' + (tr.muted ? ' muted' : '') + (tr.hidden ? ' off' : '') + (tr.locked ? ' locked' : '')), box = mk('div', 'ed-lbtns');
      l.style.height = rowH(tr) + 'px'; l.appendChild(mk('span', null, nm));
      var tog = function (icon, on, label, key){
        var b = iconBtn(null, icon, label, 'ed-lb' + (on ? ' on' : '')); b.setAttribute('aria-pressed', String(!!on));
        b.addEventListener('pointerdown', function (ev){ ev.stopPropagation(); });
        b.onclick = function (ev){ ev.stopPropagation(); var o = {}; o[key] = !tr[key]; commit(P.setTrackProps(E.hist.cur, tr.id, o)); };
        box.appendChild(b);
      };
      if (tr.kind === 'audio') tog(tr.muted ? LB.mute : LB.sound, tr.muted, (tr.muted ? 'Unmute ' : 'Mute ') + nm, 'muted');
      else tog(tr.hidden ? LB.eyeoff : LB.eye, tr.hidden, (tr.hidden ? 'Show ' : 'Hide ') + nm, 'hidden');
      tog(LB.lock, tr.locked, (tr.locked ? 'Unlock ' : 'Lock ') + nm, 'locked');
      l.appendChild(box); u.labels.appendChild(l);
    });
  }
  
  function placeHead(){ if (E.ui.head) E.ui.head.style.left = tx(E.t) + 'px'; }
  function readout(){
    E.ui.time.textContent = fmtP(E.t) + ' / ' + fmtP(E.proj.durationMs); updateKfBar();
    if (E.proj.durationMs) E.ui.scrub.value = String(Math.round(E.t / E.proj.durationMs * 1000));
  }
  function hasCrossing(t){
    return E.proj.tracks.some(function (tr){ return tr.clips.some(function (c){ return c.start < t && t < c.start + c.dur; }); });
  }
  function updateButtons(){
    var u = E.ui;
    u.undo.disabled = !E.hist.past.length; u.redo.disabled = !E.hist.future.length;
        if (u.kfBtn){ var ks = kfState(); u.kfBtn.disabled = !ks || ks.out; u.kfBtn.classList.toggle('on', !!(ks && ks.here)); }
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
    if (E.multi) Object.keys(E.multi).forEach(function (id){ if (!P.findClip(E.proj, id)) delete E.multi[id]; });
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
    var lk = P.findClip(E.proj, E.sel); if (lk && lk.track.locked){ toast('This row is locked. Tap its lock to edit it.'); return; }
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
    var skip = P.linkedClips(E.hist.cur, id).map(function (x){ return x.clip.id; }), th = snapTh();
    var a = P.snapTime(E.proj, start, th, snapPts(), skip), b = P.snapTime(E.proj, start + dur, th, snapPts(), skip) - dur, best = start;
    if (a !== start && b !== start) best = Math.abs(a - start) <= Math.abs(b - start) ? a : b;
    else if (a !== start) best = a; else if (b !== start) best = b;
    return Math.max(0, Math.round(best));
  }
  function moveTo(d){
    var dt = ((d.lastX - d.x0) + (E.ui.scroll.scrollLeft - d.sl0)) / E.ppm;
    var raw = Math.max(0, d.s0 + dt); d.newStart = snapMove(raw, d.e0 - d.s0, d.id); showSnapGuide(d, raw);
    d.el.classList.add('dragging'); d.el.style.left = tx(d.newStart) + 'px'; pickRow(d); showDrop(d);
  }
  // A dashed outline shows where the clip will really land when you let go (solid when it pushes other clips later).
  function showDrop(d){
    if (d.target){ if (d.drop) d.drop.style.display = 'none'; return; }
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
    var q = P.setReverse(E.hist.cur, c.id);
    if (q === E.hist.cur){ if (c.asset && c.asset !== 'movie') toast('Reverse works on the original movie only, not on videos you added.'); return; }
    if (!c.reverse && !E.revTold){ E.revTold = true; toast('Reversed. The preview is choppy and silent; the exported video is smooth, with the sound reversed too.'); }
    commit(q);
  }
  // Swaps the movie file for another copy of the same movie (a better quality one, say) and keeps every edit.
  // The page picks and loads the file; here we check it still fits what the edits use, then tell the project.
  function replaceMovie(){
    if (!E.hooks.replaceMovie){ toast('Replacing the movie is not available here.'); return; }
    pause();
    E.curAsset = 'movie'; Promise.resolve(E.hooks.replaceMovie()).then(function (r){
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
    fx: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>'),
    transition: svg('<rect x="3" y="6" width="8" height="12" rx="1.5"/><rect x="13" y="6" width="8" height="12" rx="1.5"/><path d="M11 12h2"/>'),
    motion: svg('<path d="M3 18c4 0 5-12 9-12s5 12 9 12"/>'),
    anim: svg('<path d="M5 19l5-14 5 14M7.3 14h5.4"/><path d="M19 9v7M16 12l3-3 3 3"/>'),
    filters: svg('<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>'),
    sticker: svg('<path d="M20 12a8 8 0 11-8-8h5a3 3 0 013 3z"/><path d="M9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 007 0"/>'),
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
    magnet: svg('<path d="M6 3v9a6 6 0 0012 0V3h-4v9a2 2 0 01-4 0V3zM6 7h4M14 7h4"/>'),
    curve: svg('<path d="M3 18C8 18 9 6 12 6s4 12 9 12"/>'),
    addVideo: svg('<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M10 9v6M7 12h6M17 10l4-2v8l-4-2"/>')
  };

  function openTool(name){ E.tool = name || null; E.panel = null; E.autoDock = false; renderDock(); }
  function closeTool(){ E.multi = {}; E.pickMulti = false; E.tool = null; E.panel = null; E.autoDock = false; E.sel = null; renderTimeline(); renderDock(); }   // the back arrow, like CapCut, lets go of the clip too
  function openPanel(name, tool){ if (tool) E.tool = tool; E.panel = name; renderDock(); }
  function closePanel(){ E.panel = null; renderDock(); }
  // Tapping a clip brings up the tools for that kind of clip; letting go of it (when the tools came up by themselves) takes them away again.
  function syncDock(){
    var f = E.sel && P.findClip(E.proj, E.sel);
    if (f){
      var want = f.track.kind === 'video' ? 'edit' : f.track.kind === 'text' ? 'text' : f.track.kind === 'sticker' ? 'sticker' : f.track.kind === 'overlay' ? 'overlay' : f.track.kind === 'fx' ? 'fx' : f.track.kind === 'layout' ? 'layout' : 'audio';
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
    var kb = kfBar(); if (kb) d.appendChild(kb);
    var sb = selBar(); if (sb) d.appendChild(sb);
    if (E.panel && PANELS[E.panel]) d.appendChild(panelShell(PANELS[E.panel]));
    else if (E.tool && ROWS[E.tool]){
      d.appendChild(toolRow(ROWS[E.tool]())); E.rowTool = E.tool;
      var sc = d.querySelector('.ed-tscroll'); if (sc && E.rowScroll && E.rowScroll.tool === E.tool) sc.scrollLeft = E.rowScroll.left; peekRow(sc);   // the row stays where you scrolled it
    } else d.appendChild(u.toolbar);
    updateButtons();
    if (E.isOpen) layoutTextLayer();
    syncPicker(); syncCrop(); syncTrackBox(); addEyedroppers();
  }
  function toolRow(items){
    var row = mk('div', 'ed-trow'), back = iconBtn('edBack', G.back, 'Back', 'ed-ibtn ed-back'), sc = mk('div', 'ed-tscroll');
    back.onclick = closeTool;
    items.forEach(function (it){
      var b = btn(it.id || null, null, 'ed-tbtn' + (it.on ? ' on' : ''), it.label); b.innerHTML = it.icon + '<span>' + it.label + '</span>';
      b.disabled = !!it.disabled; b.onclick = it.run; if (it.ref) E.ui[it.ref] = b; sc.appendChild(b);
    });
    return add(row, back, cueScroller(sc, true));
  }
  function panelShell(def){
    var p = mk('div', 'ed-panel'), h = mk('div', 'ed-phead'), done = iconBtn('edPanelDone', G.check, 'Done', 'ed-ibtn ed-pdone'), body = mk('div', 'ed-pbody');
    done.onclick = closePanel; add(h, mk('span', 'ed-ptitle', def.title), done); add(p, h, body); def.build(body);
    return p;
  }
  function chipsRaw(list, cur, pick){
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
        { id: 'edCurve', label: 'Curve', icon: G.curve, run: P2('speedcurve') },
        { id: 'edVolume', label: 'Volume', icon: G.volume, run: P2('volume') },
        { id: 'edZoom', label: 'Zoom', icon: G.zoom, run: P2('frame') },
        { id: 'edCrop', label: 'Crop', icon: G.crop, run: P2('crop') },
        { id: 'edStabilize', label: 'Stabilize', icon: G.stabilize, run: P2('stabilize') },
        { id: 'edReframe', label: 'Auto reframe', icon: G.reframe, run: P2('reframe') },
        { id: 'edAutoCut', label: 'Auto cut', icon: G.cut, run: P2('autocut') },
        { id: 'edSpeedRamp', label: 'Auto ramp', icon: G.curve, run: P2('speedramp') },
        { id: 'edRotate', label: 'Rotate', icon: G.rotate, run: rotateSel },
        { id: 'edFlip', label: 'Flip', icon: G.flip, run: flipSel },
        { id: 'edOpacity', label: 'Opacity', icon: G.opacity, run: P2('opacity') },
        { id: 'edReverse', label: 'Reverse', icon: G.reverse, run: reverseSel, on: !!(c && c.reverse) },
        { id: 'edFreeze', label: 'Freeze', icon: G.freeze, run: P2('freeze') },
        { id: 'edStill', label: 'Save still', icon: G.still, run: exportStill },
        { id: 'edAdjust', label: 'Adjust', icon: G.adjust, run: P2('adjust') },
        { id: 'edScopes', label: 'Scopes', icon: G.scopes, run: P2('scopes') },
        { id: 'edGrade', label: 'Colour', icon: G.grade, run: P2('grade') },
        { id: 'edFilters', label: 'Filters', icon: G.filters, run: P2('filters') },
        { id: 'edTransition', label: 'Transition', icon: G.transition, run: P2('transition') },
        { id: 'edMotion', label: 'Motion', icon: G.motion, run: P2('motion') },
        { id: 'edMotionBlur', label: 'Motion blur', icon: G.mblur, run: P2('motionblur') },
        { id: 'edFade', label: 'Fade', icon: G.fade, run: P2('fade') },
        { id: 'edAddVideo', label: 'Add video', icon: G.addVideo, run: addVideoFromFile },
        { id: 'edAddPhoto', label: 'Add photo', icon: G.photo, run: addPhotoFromFile },
        { id: 'edSlideshow', label: 'Slideshow', icon: G.slides, run: function (){ openPanel('slideshow'); } },
        { id: 'edPhoto', label: 'Photo', icon: G.photo, run: function (){ openPanel('photo'); }, disabled: !(c && c.type === 'freeze' && isPhotoClip(c)) },
        { id: 'edCameras', label: 'Cameras', icon: G.cam, run: P2('cameras') },
        { id: 'edReplace', label: 'Replace', icon: G.replace, run: replaceMovie },
        { id: 'edBeats', label: 'Beat sync', icon: G.music, run: P2('beats') },
        { id: 'edQuiet', label: 'Quiet', icon: G.quiet, run: scanQuiet },
        { id: 'edProjTpl', label: 'Layouts', icon: G.style, run: P2('projtpl') },
        { id: 'edReset', label: 'Start over', icon: G.reset, run: startOver }
      ];
    },
    fx: function (){
      var f = E.sel && P.findClip(E.proj, E.sel), isF = !!(f && f.track.kind === 'fx');
      return [
        { id: 'edAddFx', label: 'Add', icon: G.fx, run: function (){ openPanel('fxpick'); } },
        { id: 'edFxEdit', label: 'Edit', icon: G.pencil, run: function (){ openPanel('fxedit'); }, disabled: !isF },
        { id: 'edFxDup', label: 'Duplicate', icon: G.dup, run: duplicateSel, disabled: !isF },
        { id: 'edFxDel', label: 'Delete', icon: G.trash, run: deleteSel, disabled: !isF }
      ];
    },
    overlay: function (){
      var f = E.sel && P.findClip(E.proj, E.sel), isO = !!(f && f.track.kind === 'overlay');
      return [
        { id: 'edAddOverlay', label: 'Add', icon: G.sticker, run: addOverlayFromFile },
        { id: 'edAddShape', label: 'Shapes', icon: G.shape, run: function (){ openPanel('shapepick'); } },
        { id: 'edAddArrow', label: 'Arrows', icon: G.arrow, run: function (){ openPanel('arrowpick'); } },
        { id: 'edAddSpot', label: 'Spotlight', icon: G.spot, run: function (){ openPanel('spotpick'); } },
        { id: 'edAddFrame', label: 'Frames', icon: G.frame, run: function (){ openPanel('framepick'); } },
        { id: 'edOverlayPip', label: 'PiP', icon: G.pip, run: function (){ openPanel('pip'); }, disabled: !isO || !!selGen() },
        { id: 'edOverlayEdit', label: 'Edit', icon: G.pencil, run: function (){ openPanel(selGen() ? 'genedit' : 'overlayedit'); }, disabled: !isO },
        { id: 'edOverlayMask', label: 'Mask', icon: G.shape, run: function (){ openPanel('maskonly'); }, disabled: !isO },
{ id: 'edOverlayKf', label: 'Keyframe', icon: KFD_OFF, run: function (){ var c = selOverlay(); if (c) commit(P.toggleKeyframes(E.hist.cur, c.id, relNow(c))); }, disabled: !isO || !!selGen() },
{ id: 'edOverlayEase', label: 'Easing', icon: G.curve, run: function (){ openPanel('keyease'); }, disabled: !isO || !!selGen() },
{ id: 'edOverlayFx', label: 'Blend', icon: G.adjust, run: function (){ openPanel('blendonly'); }, disabled: !isO },
        { id: 'edOverlayRemoveBg', label: 'Remove BG', icon: G.rembg, run: function (){ openPanel('removebg'); }, disabled: !isO || !!selGen() },
        { id: 'edOverlayChroma', label: 'Chroma key', icon: G.pick, run: function (){ openPanel('chromakey'); }, disabled: !isO || !!selGen() },
        { id: 'edOverlayMotion', label: 'Motion', icon: G.motion, run: function (){ openPanel('motion'); }, disabled: !isO },
        { id: 'edOverlayTrack', label: 'Track', icon: G.track, run: function (){ openPanel('track'); }, disabled: !isO || !!(selGen() && selGen().gen.full) },
        { id: 'edOverlayMblur', label: 'Motion blur', icon: G.mblur, run: function (){ openPanel('motionblur'); }, disabled: !isO },
        { id: 'edOverlayDup', label: 'Duplicate', icon: G.dup, run: duplicateSel, disabled: !isO },
        { id: 'edOverlayDel', label: 'Delete', icon: G.trash, run: deleteSel, disabled: !isO }
      ];
    },
    sticker: function (){
      var f = E.sel && P.findClip(E.proj, E.sel), isS = !!(f && f.track.kind === 'sticker');
      return [
        { id: 'edAddSticker', label: 'Add', icon: G.sticker, run: function (){ openPanel('stickerpick'); } },
        { id: 'edStickerEdit', label: 'Edit', icon: G.pencil, run: function (){ openPanel('stickeredit'); }, disabled: !isS },
        { id: 'edStickerTrack', label: 'Track', icon: G.track, run: function (){ openPanel('track'); }, disabled: !isS },
        { id: 'edStickerDup', label: 'Duplicate', icon: G.dup, run: duplicateSel, disabled: !isS },
        { id: 'edStickerDel', label: 'Delete', icon: G.trash, run: deleteSel, disabled: !isS }
      ];
    },
    audio: function (){
      var mt = E.proj.tracks.filter(function (t){ return t.role === 'music'; })[0], has = !!(mt && mt.clips[0]), items = [];
      if (E.hooks.pickMusic) items.push({ id: 'edAddMusic', label: has ? 'Change music' : 'Add music', icon: G.music, run: addMusic });
      items.push({ id: 'edVoiceOver', label: (E.vo && E.vo.on) ? 'Stop' : 'Voice-over', icon: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v4"/>'), run: voiceOverToggle, on: !!(E.vo && E.vo.on) });
      items.push({ id: 'edSfx', label: 'Effects', icon: G.music, run: function (){ openPanel('sfxpick'); } });
      items.push({ id: 'edTts', label: 'Text to speech', icon: G.speak, run: openTts });
      items.push({ id: 'edBeatsA', label: 'Beat sync', icon: G.mix, run: function (){ openPanel('beats'); } });
      items.push({ id: 'edDuck', label: 'Duck music', icon: G.mix, run: function (){ openPanel('duck'); }, disabled: !has });
      items.push({ id: 'edSilence', label: 'Remove pauses', icon: G.quiet, run: function (){ openPanel('silences'); } });
      items.push({ id: 'edVoiceFx', label: 'Enhance voice', icon: G.volume, run: function (){ openPanel('voicefx'); } });
      items.push({ id: 'edDenoise', label: 'Noise reduction', icon: G.denoise, run: function (){ openPanel('denoise'); } });
      items.push({ id: 'edMix', label: 'Volume', icon: G.mix, run: function (){ openPanel('mix'); } });
      items.push({ id: 'edClipAudio', label: 'Clip', icon: G.clip, run: function (){ openPanel('clipaudio'); } });
      items.push({ id: 'edAudioFx', label: 'Sound FX', icon: G.mix, run: function (){ openPanel('audiofx'); } });
      if (has) items.push({ id: 'edRemoveMusic', label: 'Remove music', icon: G.trash, run: function (){ if (E.hooks.setMusicFile) E.hooks.setMusicFile(null); commit(P.removeMusic(E.hist.cur)); } });
      return items;
    },
    text: function (){
      var f = E.sel && P.findClip(E.proj, E.sel), isText = !!(f && f.track.kind === 'text'), any = allTexts().length > 0;
      return [
        { id: 'edAddText', label: 'Add text', icon: G.addText, run: addText },
        { id: 'edTextTpl', label: 'Templates', icon: G.style, run: function (){ openPanel('templates'); } },
        { id: 'edCaptions', label: 'Captions', icon: G.captions, run: function (){ openPanel('captions'); } },
        { id: 'edPieces', label: 'Intro / outro', icon: G.piece, run: function (){ openPanel('pieces'); } },
        { id: 'edTextEdit', label: 'Edit', icon: G.pencil, run: function (){ openPanel('textedit'); }, disabled: !isText },
        { id: 'edTextStyle', label: 'Style', icon: G.style, run: function (){ openPanel('textstyle'); }, disabled: !isText },
        { id: 'edTextAnim', label: 'Animate', icon: G.anim, run: function (){ openPanel('textanim'); }, disabled: !isText },
        { id: 'edTextFx', label: 'Effects', icon: G.fx, run: function (){ openPanel('textfx'); }, disabled: !isText },
        { id: 'edTextTrack', label: 'Track', icon: G.track, run: function (){ openPanel('track'); }, disabled: !isText },
        { id: 'edTextList', label: 'Texts', icon: G.list, run: function (){ openPanel('texts'); }, disabled: !any },
        { id: 'edTextSpeak', label: 'Read aloud', icon: G.speak, run: openTts, disabled: !isText },
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
    var items = NSUBS ? NSUBS.parse(text).cues : P.parseSrt(text);   // .srt and .vtt
    if (!items.length){ toast('No subtitle lines were found in that file. It should be an .srt or .vtt file.'); return 0; }
    var had = P.captionList(E.hist.cur).length;
    if (had && !confirm('Replace your ' + had + ' caption lines with the ' + items.length + ' lines in this file?')) return 0;
    var out = {}, q = P.addCaptions(E.hist.cur, items, { replace: true }, out);
    if (q === E.hist.cur && !out.added){ toast('None of the lines fit the video.'); return 0; }
    commit(q);
    toast(out.added + ' caption line' + (out.added === 1 ? '' : 's') + ' added' + (out.skipped ? ' (' + out.skipped + ' did not fit the video)' : '') + '. Times follow your edited video.');
    return out.added;
  }
  function importSrtFile(){
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.srt,.vtt,text/plain,text/vtt,application/x-subrip';
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
  function exportVttFile(){
    var srt = exportSrt(), txt = (srt && NSUBS) ? NSUBS.toVtt(NSUBS.parse(srt).cues) : '';
    if (!txt || txt === 'WEBVTT\n\n'){ toast('There are no captions or titles to save yet.'); return; }
    var a = document.createElement('a'), name = String((E.sess && E.sess.name) || 'naki').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'naki';
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/vtt' })); a.download = name + '.vtt';
    document.body.appendChild(a); a.click(); setTimeout(function (){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('Saved ' + name + '.vtt');
  }
  // ----- project templates: save the look and layout of this edit as a file, and put it on another project -----
  function tplNeed(){ if (NPT) return true; toast('Templates are not loaded. Add <script src="projtemplate.js"></script> to index.html, before editor.js.'); return false; }
  function saveTemplateFile(){
    if (!tplNeed()) return;
    var nm = prompt('Name this template:', String((E.sess && E.sess.name) || 'My template').slice(0, 40));
    if (nm === null) return;
    var tpl = NPT.capture(E.hist.cur, nm);
    if (NPT.isEmpty(tpl)){ toast('There is nothing to save yet. Add titles, stickers, shapes or effects, or set a look, then save.'); return; }
    var a = document.createElement('a'), file = NPT.fileName(tpl);
    a.href = URL.createObjectURL(new Blob([NPT.serialize(tpl)], { type: 'application/json' })); a.download = file;
    document.body.appendChild(a); a.click(); setTimeout(function (){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('Saved ' + file + '. ' + NPT.describeSaved(tpl), 9000);
  }
  function loadTemplateFile(){
    if (!tplNeed()) return;
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function (){
      var f = inp.files && inp.files[0]; if (!f) return;
      (f.text ? f.text() : new Promise(function (res){ var r = new FileReader(); r.onload = function (){ res(r.result); }; r.readAsText(f); })).then(function (text){
        var r = NPT.parse(text); if (r.error){ toast(r.error, 7000); return; }
        var out = {}, q = NPT.apply(E.hist.cur, r.template, { replace: E.chip.tplMode !== 'add' }, out);
        if (out.error){ toast(out.error, 7000); return; }
        if (q === E.hist.cur){ toast('That template did not change anything.'); return; }
        commit(q); toast(NPT.describe(out), 9000);
      });
    };
    inp.click();
  }
  // ----- voice-over: record narration at the playhead onto an effects row -----
  function voiceOverToggle(){ if (E.vo && E.vo.on) voiceOverStop(); else voiceOverStart(); }
  function voiceOverStart(){
    if (!E.hooks.setSfxFile){ toast('Recording is not available here.'); return; }
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ toast('This browser cannot record from the microphone here.', 6000); return; }
    if (!movieReady()){ toast('Choose the movie for this session first.'); return; }
    if (E.t >= E.proj.durationMs - 300){ toast('Move the playhead earlier. There is no video left to record over.'); return; }
    pause();
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }).then(function (stream){
      var mime = '', list = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'], mr, i;
      for (i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])){ mime = list[i]; break; }
      try { mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); } catch (e) { stream.getTracks().forEach(function (t){ t.stop(); }); toast('Could not start recording on this device.'); return; }
      var vo = E.vo = { on: true, t0: Math.round(E.t), started: performance.now(), mr: mr, stream: stream, chunks: [], mime: mr.mimeType || mime || 'audio/webm', timer: 0 };
      mr.ondataavailable = function (ev){ if (ev.data && ev.data.size) vo.chunks.push(ev.data); };
      mr.onstop = function (){ voiceOverFinish(vo); };
      mr.start(1000); play();
      vo.timer = setInterval(function (){ if (!E.playing) voiceOverStop(); }, 150);   // pausing, or the end of the video, ends the take
      renderDock(); toast('Recording. Speak now. Tap Stop or pause to finish.', 3500);
    }, function (err){
      toast(err && err.name === 'NotAllowedError' ? 'The microphone is blocked. Allow it for this page and try again.' : 'Could not open the microphone.', 6000);
    });
  }
  function voiceOverStop(){
    var vo = E.vo; if (!vo || !vo.on) return;
    vo.on = false; clearInterval(vo.timer); vo.ms = Math.round(performance.now() - vo.started);
    pause();
    try { if (vo.mr.state !== 'inactive') vo.mr.stop(); else voiceOverFinish(vo); } catch (e) { voiceOverFinish(vo); }
  }
  function voiceOverFinish(vo){
    if (vo.done) return; vo.done = true;
    try { vo.stream.getTracks().forEach(function (t){ t.stop(); }); } catch (e) {}
    if (E.vo === vo) E.vo = null;
    var blob = new Blob(vo.chunks, { type: vo.mime });
    if (blob.size < 500 || (vo.ms || 0) < 300){ toast('Nothing was recorded.'); renderDock(); return; }
    var ext = /ogg/.test(vo.mime) ? '.ogg' : /mp4/.test(vo.mime) ? '.m4a' : '.webm', file = new File([blob], 'voice-over' + ext, { type: vo.mime });
    var out = {}, q = P.addSfx(E.hist.cur, vo.t0, { file: file, name: 'Voice-over', durMs: vo.ms }, out);
    if (q === E.hist.cur){ toast('There was no room for the recording.'); renderDock(); return; }
    E.hooks.setSfxFile(out.asset, file);
    E.sel = out.id; commit(q); renderDock();
    toast('Voice-over added. Drag it to move it, or open Clip for volume and fades.', 5000);
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
  // ----- beat sync: a beat grid on the music, then cut and fit the picture to it -----
  function bsNeed(){ if (NBS) return true; toast('Beat sync is not loaded. Add <script src="beatsync.js"></script> to index.html, before editor.js.'); return false; }
  function beatMusic(){ var tr = E.proj.tracks.filter(function (t){ return t.role === 'music'; })[0]; return tr && tr.clips[0] ? tr.clips[0] : null; }
  // Lets the browser decode the music file and finds the tempo and where the beats fall (the first 90 s of the part you use).
  function detectBeatsNow(){
    if (!bsNeed() || E.beatBusy) return;
    var mc = beatMusic(); if (!mc){ toast('Add music first (Audio, then Add music).'); return; }
    var got = E.hooks.getAssetFile ? E.hooks.getAssetFile('music') : null;
    if (!got){ toast('The music file is not available here. Tap along, or type the tempo.'); return; }
    E.beatBusy = true; pause(); renderDock();
    Promise.resolve(got).then(function (file){
      if (!file) throw new Error('the music file is not available');
      return NBS.decodeFile(file);
    }).then(function (d){
      return NBS.analyzeBuffer(d.channels, d.sr, { startMs: mc.in, maxMs: Math.min(90000, mc.dur * (mc.speed || 1)) });
    }).then(function (r){
      E.beatBusy = false;
      if (!r){ toast('No steady beat was found in the music. Tap along or type the tempo.', 8000); renderDock(); return; }
      commit(NBS.setGrid(E.hist.cur, r));
      toast('Found ' + r.bpm.toFixed(1) + ' BPM. Check that the marks on the ruler sit on the beats. If there are twice or half as many as you feel, use \u00f7 2 or \u00d7 2.', 9000);
    }).catch(function (err){ E.beatBusy = false; renderDock(); toast('Could not read the music' + (err && err.message ? ': ' + err.message : '') + '. Tap along or type the tempo.', 9000); });
  }
  // Tap along while the music plays: the taps are turned into the music file's own time, so the grid stays right wherever the music sits.
  function tapBeat(){
    if (!bsNeed()) return;
    if (!beatMusic()){ toast('Add music first (Audio, then Add music).'); return; }
    if (!E.playing){ play(); toast('Playing. Tap along with the beat, at least 4 taps.'); return; }
    var now = performance.now(), bt = E.chip.beatTaps || (E.chip.beatTaps = { list: [], last: 0 });
    if (now - bt.last > 2500) bt.list = [];
    bt.last = now; var ft = NBS.fileTimeAt(E.hist.cur, E.t); if (ft != null) bt.list.push(ft);
    bt.res = NBS.tapTempo(bt.list); renderDock();
  }
  // The beats as small marks along the bottom of the time ruler (not when they would be too crowded to see).
  function drawBeatTicks(ruler){
    if (!NBS) return;
    var ts = NBS.beatTimes(E.proj, 1); if (ts.length < 2 || (ts[1] - ts[0]) * E.ppm < 5) return;
    ts.slice(0, 1500).forEach(function (t, i){
      var d = mk('i'); d.style.cssText = 'position:absolute;bottom:0;width:1px;pointer-events:none;background:rgba(255,196,64,.9);height:' + (i % 4 === 0 ? 9 : 5) + 'px;left:' + tx(t) + 'px';
      ruler.appendChild(d);
    });
  }
  function selText(){ var f = E.sel && P.findClip(E.proj, E.sel); return f && f.track.kind === 'text' ? f.clip : null; }

  /* ---------- the panels (a tool's settings) ---------- */
  var PANELS = {
    projtpl: { title: 'Layout template', build: function (body){
      var mode = E.chip.tplMode === 'add' ? 'add' : 'replace';
      body.appendChild(actions([{ id: 'edTplSave', label: 'Save as template', run: saveTemplateFile }, { id: 'edTplApply', label: 'Apply a template file', run: loadTemplateFile }]));
      body.appendChild(chips([{ key: 'replace', label: 'Replace my titles and effects' }, { key: 'add', label: 'Add to what is there' }], mode, function (k){ E.chip.tplMode = k; renderDock(); }));
      body.appendChild(mk('div', 'ed-hint', 'A template keeps the look and layout of this edit (video shape, colour look, titles, stickers, shapes, effects, sound levels) as a small file, without the footage. Apply it to another project and the titles and effects land at the same share of the video. Pictures, videos, sound effects and captions are not stored. Undo brings back what it replaced.'));
    } },
    speed: { title: 'Speed', build: function (body){
      var c = needPicture(body); if (!c) return;
      if (c.type !== 'video'){ body.appendChild(mk('div', 'ed-hint', 'A paused picture has no speed. Pick a part where the movie plays.')); return; }
      var cur = c.speed || 1, set = function (v){ commit(P.setClipSpeed(E.hist.cur, c.id, v)); };
      body.appendChild(chips([0.5, 0.75, 1, 1.5, 2, 3].map(function (v){ return { key: v, label: v + '×' }; }), cur, set));
      body.appendChild(sliderRow('Speed', 0.25, 4, 0.05, cur, function (v){ return v.toFixed(2) + '×'; }, null, set));
      body.appendChild(actions([{ id: 'edSpeedCurve', label: 'Speed curve (graph)', run: function (){ openPanel('speedcurve'); } }, { id: 'edSpeedAuto', label: 'Auto ramp', run: function (){ openPanel('speedramp'); } }]));
      if (cur < 1 && !c.reverse) body.appendChild(actions([{ id: 'edSmooth', label: c.smooth ? 'Smooth slow-mo: on' : 'Smooth slow-mo: off', run: function (){ commit(P.setSmooth(E.hist.cur, c.id)); } }]));
      body.appendChild(mk('div', 'ed-hint', 'The picture and its sound change together. The movie clips after it move up or back. Your voice stays where it is.' + (cur < 1 ? ' Smooth slow-mo blends the frames in between when you export, so slow parts flow instead of stepping. The preview still shows plain frames.' : '')));
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
      var rel = relNow(c), t = NANIM ? NANIM.pictureTransform(c.transform, c.kf, rel) : Object.assign({ zoom: 1, x: 0, y: 0 }, c.transform || {}), keys = [{ key: 'zoom', label: 'Zoom' }];
      if (t.zoom > 1 || (c.kf && c.kf.zoom)) keys.push({ key: 'x', label: 'Left / right' }, { key: 'y', label: 'Up / down' });
      var cur = chipKey('frame', keys, 'zoom'), one = function (v){ return P.setAnimated(E.hist.cur, c.id, cur, v, relNow(c)); };
      body.appendChild(chips(keys, cur, pickChip('frame')));
      body.appendChild(cur === 'zoom'
        ? sliderRow('Zoom', 1, 4, 0.05, t.zoom, function (v){ return v.toFixed(2) + '\u00d7'; }, function (v){ live(one(v)); }, function (v){ commit(one(v)); })
        : sliderRow(cur === 'x' ? 'Left / right' : 'Up / down', -1, 1, 0.05, t[cur], function (v){ return Math.round(v * 100); }, function (v){ live(one(v)); }, function (v){ commit(one(v)); }));
      body.appendChild(keyframeActions(c, cur));
      body.appendChild(actions([
        { id: 'edZoomReset', label: 'Reset', run: function (){ commit(P.setTransform(P.clearKeyframes(E.hist.cur, c.id, null, 0), c.id, { zoom: 1, x: 0, y: 0, rot: 0, flipH: false })); } },
        { id: 'edZoomAll', label: 'Apply to all', run: function (){ commit(P.setTransform(E.hist.cur, null, { zoom: t.zoom, x: t.x, y: t.y, rot: t.rot, flipH: t.flipH })); toast('This framing is on every clip now.'); } }]));
    } },
    
crop: { title: 'Crop', build: function (body){
      var c = needPicture(body); if (!c) return;
      if (c.type !== 'video' && c.type !== 'freeze'){ body.appendChild(mk('div', 'ed-hint', 'Pick a picture clip to crop.')); return; }
      if (isPhotoClip(c)){ body.appendChild(mk('div', 'ed-hint', 'Crop is for video clips for now. For a photo, use Zoom (and Left / right, Up / down) to frame it.')); return; }
      var m = E.hooks.movie, vw = m.videoWidth || 16, vh = m.videoHeight || 9;
      E.cropDraft = c.crop ? { x: c.crop.x, y: c.crop.y, w: c.crop.w, h: c.crop.h } : { x: 0, y: 0, w: 1, h: 1 };
      var RAT = [{ key: 'free', label: 'Free' }, { key: 'orig', label: 'Original' }, { key: '16:9', label: '16:9' }, { key: '9:16', label: '9:16' }, { key: '4:3', label: '4:3' },
        { key: '3:4', label: '3:4' }, { key: '1:1', label: '1:1' }, { key: '3:2', label: '3:2' }, { key: '2:3', label: '2:3' }];
      var cur = chipKey('crop', RAT, 'free');
      body.appendChild(chips(RAT, cur, function (k){
        E.chip.crop = k;
        var a = cropAspectOf(k, vw, vh), q = E.hist.cur, d = E.cropDraft;
        if (a) q = P.setCrop(q, c.id, P.cropRect(a, 1, vw, vh, d.x + d.w / 2, d.y + d.h / 2));
        if (q === E.hist.cur) renderDock(); else commit(q);
      }));
      body.appendChild(actions([
        { id: 'edCropReset', label: 'Reset', run: function (){ E.chip.crop = 'free'; var q = P.setCrop(E.hist.cur, c.id, null); if (q === E.hist.cur) renderDock(); else commit(q); } },
        { id: 'edCropAll', label: 'Apply to all', run: function (){ commit(P.setCrop(E.hist.cur, null, c.crop || null)); toast('This crop is on every clip now.'); } }]));
      body.appendChild(mk('div', 'ed-hint', 'Drag the frame to move it, or drag its corners and edges to resize. Pick a shape to lock the proportions. The cropped part is fitted inside the video, with bars if its shape differs. Close the panel to see the result.'));
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
        { key: 'matte', label: 'Faded', min: 0, max: 100, neutral: 0 },
        { key: 'highlights', label: 'Highlights', min: -100, max: 100, neutral: 0 }, { key: 'shadows', label: 'Shadows', min: -100, max: 100, neutral: 0 },
        { key: 'tint', label: 'Tint', min: -100, max: 100, neutral: 0 }, { key: 'hue', label: 'Hue', min: -100, max: 100, neutral: 0 }, { key: 'grain', label: 'Grain', min: 0, max: 100, neutral: 0 }];
      var cur = chipKey('adjust', DEF, 'brightness'), d = DEF.filter(function (o){ return o.key === cur; })[0];
      var one = function (v){ var o = {}; o[cur] = v / 100; return P.setFilter(E.hist.cur, c.id, o); };
      body.appendChild(chips(DEF, cur, pickChip('adjust')));
      body.appendChild(sliderRow(d.label, d.min, d.max, 5, Math.round((fl[cur] != null ? fl[cur] : d.neutral / 100) * 100), function (v){ return v; }, function (v){ live(one(v)); }, function (v){ commit(one(v)); }));
      body.appendChild(actions([
        { id: 'edFilterReset', label: 'Reset', run: function (){ commit(P.setFilter(E.hist.cur, c.id, { brightness: 1, contrast: 1, saturate: 1, warmth: 0, sharpen: 0, vignette: 0, matte: 0, highlights: 0, shadows: 0, tint: 0, hue: 0, grain: 0 })); } },
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
      body.appendChild(actions([{ id: 'edFreeze', label: 'Freeze here', run: function (){ freezeHere(); } },
        { id: 'edFreezeStill', label: 'Freeze + save still', run: freezeThenStill },
        { id: 'edStillNow', label: 'Save still', run: exportStill }]));
      body.appendChild(mk('div', 'ed-hint', 'Save still writes the picture at the playhead as a PNG: with its crop, zoom, look, fade, stickers and titles, in the shape you chose under Format. Overlays, effects and layouts are not in it.'));
      body.appendChild(mk('div', 'ed-hint', 'Holds the picture still at the playhead. Everything after it moves later.'));
    } },
        beats: { title: 'Beat sync', build: function (body){
      if (!NBS){ body.appendChild(mk('div', 'ed-hint', 'Beat sync is not loaded. Add <script src="beatsync.js"></script> to index.html, before editor.js.')); return; }
      var tabs = [{ key: 'grid', label: '1  Beat grid' }, { key: 'cut', label: '2  Cut on beats' }, { key: 'fit', label: '3  Fit clips' }], tab = chipKey('beats', tabs, 'grid');
      body.appendChild(chips(tabs, tab, pickChip('beats')));
      if (!beatMusic()){ body.appendChild(mk('div', 'ed-hint', 'Add music first (Audio, then Add music). The beat grid belongs to the music.')); return; }
      var g = NBS.gridOf(E.hist.cur), o = E.chip.beatOpt || (E.chip.beatOpt = { every: 4, beats: 0, method: 'trim' });
      if (tab === 'grid'){
        var bt = E.chip.beatTaps, tapRes = bt && bt.res;
        body.appendChild(mk('div', 'ed-hint', g ? 'Beat grid: ' + g.bpm.toFixed(1) + ' BPM, a beat ' + (g.offsetMs / 1000).toFixed(2) + ' s into the music. The marks on the time ruler are the beats.' : 'No beat grid yet. Let Naki listen to the music, tap along while it plays, or type the tempo below.'));
        body.appendChild(actions([{ id: 'edBeatDetect', label: E.beatBusy ? 'Listening...' : 'Detect from music', run: detectBeatsNow },
          { id: 'edBeatTap', label: 'Tap along' + (bt && bt.list.length ? ' (' + bt.list.length + ')' : ''), run: tapBeat }]));
        if (tapRes) body.appendChild(actions([{ id: 'edBeatUseTap', label: 'Use ' + tapRes.bpm.toFixed(1) + ' BPM from the taps', run: function (){ E.chip.beatTaps = null; commit(NBS.setGrid(E.hist.cur, tapRes)); } }]));
        if (g){
          body.appendChild(sliderRow('Tempo', NBS.MIN_BPM, NBS.MAX_BPM, 0.5, g.bpm, function (v){ return v.toFixed(1) + ' BPM'; }, null, function (v){ commit(NBS.setGrid(E.hist.cur, { bpm: v, offsetMs: g.offsetMs })); }));
          body.appendChild(sliderRow('First beat', 0, Math.round(60000 / g.bpm), 5, Math.round(g.offsetMs), function (v){ return v + ' ms'; }, null, function (v){ commit(NBS.setGrid(E.hist.cur, { bpm: g.bpm, offsetMs: v })); }));
          body.appendChild(actions([
            { id: 'edBeatHalf', label: '\u00f7 2', run: function (){ if (g.bpm / 2 < NBS.MIN_BPM){ toast('That is too slow.'); return; } commit(NBS.setGrid(E.hist.cur, { bpm: g.bpm / 2, offsetMs: g.offsetMs })); } },
            { id: 'edBeatDouble', label: '\u00d7 2', run: function (){ if (g.bpm * 2 > NBS.MAX_BPM){ toast('That is too fast.'); return; } commit(NBS.setGrid(E.hist.cur, { bpm: g.bpm * 2, offsetMs: g.offsetMs })); } },
            { id: 'edBeatClear', label: 'Clear grid', run: function (){ commit(NBS.setGrid(E.hist.cur, null)); } }]));
        }
        body.appendChild(mk('div', 'ed-hint', 'Detect works best on music with clear drums. Tempo is sometimes found at twice or half the speed you feel: press \u00f7 2 or \u00d7 2. If the marks are a little early or late, move First beat. The grid stays with the music clip when you move, trim or cut it.'));
      } else if (!g){
        body.appendChild(mk('div', 'ed-hint', 'Set the beat grid first (tab 1).'));
      } else if (tab === 'cut'){
        body.appendChild(chips([{ key: 1, label: 'Every beat' }, { key: 2, label: 'Every 2 beats' }, { key: 4, label: 'Every bar (4)' }, { key: 8, label: 'Every 2 bars' }], o.every, function (k){ o.every = k; renderDock(); }));
        var pts = NBS.cutPoints(E.hist.cur, o.every);
        body.appendChild(mk('div', 'ed-hint', pts.length ? 'This will cut the picture in ' + pts.length + ' place' + (pts.length === 1 ? '' : 's') + '.' : 'There are no new cuts to make at these beats.'));
        body.appendChild(actions([{ id: 'edBeatCut', label: 'Cut on the beat', run: function (){
          var out = {}, q = NBS.cutOnBeats(E.hist.cur, { every: o.every }, out);
          if (q === E.hist.cur){ toast(NBS.describe(out)); return; }
          commit(q); toast(NBS.describe(out), 8000); } }]));
        body.appendChild(mk('div', 'ed-hint', 'Cuts only the picture and its movie sound. Your voice, music and titles are not cut. Afterwards you can delete or move pieces, add transitions, or change speed on them. Undo takes all the cuts back at once.'));
      } else {
        body.appendChild(chips([{ key: 0, label: 'Nearest beat' }, { key: 1, label: '1 beat' }, { key: 2, label: '2 beats' }, { key: 4, label: '4 beats' }, { key: 8, label: '8 beats' }], o.beats, function (k){ o.beats = k; renderDock(); }));
        body.appendChild(chips([{ key: 'trim', label: 'Trim ends' }, { key: 'speed', label: 'Change speed' }], o.method, function (k){ o.method = k; renderDock(); }));
        body.appendChild(actions([{ id: 'edBeatFit', label: 'Fit clips to the beat', run: function (){
          var out = {}, q = NBS.fitToBeats(E.hist.cur, { beats: o.beats, method: o.method }, out);
          if (q === E.hist.cur){ toast(NBS.describe(out)); return; }
          commit(q); toast(NBS.describe(out), 9000); } }]));
        body.appendChild(mk('div', 'ed-hint', o.method === 'trim'
          ? 'Each picture clip is shortened so it ends on a beat (a clip that would have to get longer is left alone). Gaps close. Nothing plays faster or slower.'
          : 'Each picture clip plays a little faster or slower (between half and double speed) so it ends exactly on a beat. The movie sound changes with it; your voice does not.'));
        body.appendChild(mk('div', 'ed-hint', o.beats ? 'Each clip lasts ' + o.beats + ' beat' + (o.beats === 1 ? '' : 's') + ' (the first one also holds the time before the first beat).' : 'Each clip ends on the beat nearest to where it ends now.'));
      }
    } },
    duck: { title: 'Duck music', build: function (body){
      var mt = E.proj.tracks.filter(function (t){ return t.role === 'music'; })[0];
      if (!mt || !mt.clips.length){ body.appendChild(mk('div', 'ed-hint', 'Add music first (Audio, then Add music).')); return; }
      var o = E.chip.duck || (E.chip.duck = { level: 30 });
      var go = function (level){
        var q = P.autoDuckMusic(E.hist.cur, { level: level, thresholdDb: E.quietDb });
        if (q === E.hist.cur){ toast('Nothing to change: no speech was found in your recording, or the music already does this.'); return; }
        commit(q); toast(level >= 1 ? 'Ducking removed.' : 'The music now goes down while you speak.');
      };
      body.appendChild(sliderRow('Music while you speak', 0, 100, 5, o.level, pct, function (v){ o.level = v; }, function (v){ o.level = v; }));
      body.appendChild(actions([{ id: 'edDuckApply', label: 'Apply', run: function (){ go(o.level / 100); } }, { id: 'edDuckClear', label: 'Remove ducking', run: function (){ go(1); } }]));
      body.appendChild(mk('div', 'ed-hint', 'Lowers the music while you talk and brings it back after, using your microphone history, so it follows your cuts. It replaces any volume curve the music had; run it again after big edits.'));
    } },
    silences: { title: 'Remove pauses', build: function (body){
      var o = E.chip.sil || (E.chip.sil = { db: Math.round(E.quietDb || -42), min: 700, pad: 150, paused: true });
      var opts = function (){ return { thresholdDb: o.db, minMs: o.min, padMs: o.pad, onlyPaused: o.paused }; };
      body.appendChild(chips([{ key: 'paused', label: 'While paused' }, { key: 'all', label: 'Everywhere' }], o.paused ? 'paused' : 'all', function (k){ o.paused = k === 'paused'; renderDock(); }));
      body.appendChild(sliderRow('Quiet below', -60, -20, 1, o.db, function (v){ return v + ' dB'; }, function (v){ o.db = v; }, function (v){ o.db = v; renderDock(); }));
      body.appendChild(sliderRow('Pause at least', 300, 3000, 100, o.min, secs, function (v){ o.min = v; }, function (v){ o.min = v; renderDock(); }));
      body.appendChild(sliderRow('Keep around it', 0, 400, 25, o.pad, function (v){ return v + ' ms'; }, function (v){ o.pad = v; }, function (v){ o.pad = v; renderDock(); }));
      var found = P.silenceRanges(E.hist.cur, opts()), total = 0; found.forEach(function (r){ total += r.end - r.start; });
      body.appendChild(mk('div', 'ed-hint', found.length ? 'Found ' + found.length + ' quiet pause' + (found.length > 1 ? 's' : '') + ' (' + (total / 1000).toFixed(1) + ' s) to cut out.' : 'No quiet pauses found with these settings.'));
      body.appendChild(actions([{ id: 'edSilenceApply', label: 'Remove them', run: function (){
        var q = P.removeSilences(E.hist.cur, opts()); if (q === E.hist.cur){ toast('No quiet pauses to remove.'); return; }
        commit(q); toast('Pauses removed. Everything after each one moved up.'); } }]));
      body.appendChild(mk('div', 'ed-hint', o.paused ? 'Only cuts pauses where the picture is held still, so no movie is lost.' : 'Everywhere also cuts stretches where the movie plays but you are quiet, so some of the movie goes too. Undo brings it back.'));
    } },
        voicefx: { title: 'Enhance voice', build: function (body){
      var vt = E.proj.tracks.filter(function (t){ return t.role === 'voice'; })[0];
      if (!vt || !NFX || !NFX.voice){ body.appendChild(mk('div', 'ed-hint', 'There is no voice recording to enhance.')); return; }
      var e = vt.enhance, cur = e ? e.preset : 'none', set = function (o){ return P.setVoiceEnhance(E.hist.cur, o); };
      body.appendChild(chips([{ key: 'none', label: 'Off' }].concat(NFX.voice.PRESETS), cur, function (k){ commit(set({ preset: k })); }));
      if (e) body.appendChild(sliderRow('Strength', 5, 100, 5, Math.round(e.amount * 100), pct, function (v){ live(set({ amount: v / 100 })); }, function (v){ commit(set({ amount: v / 100 })); }));
      body.appendChild(mk('div', 'ed-hint', 'Turns down the hiss between words (measured from your own recording), shapes the tone and evens out loud and soft. Clean is gentle, Podcast is fuller and punchier, Warm is softer, Bright is crisper. The preview plays the tone and loudness; the hiss reduction is only in the exported video.'));
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
      var set = function (v){ if (cur === 'volume' && c.kf && c.kf.volume && c.kf.volume.length) return P.setAnimated(E.hist.cur, c.id, 'volume', v / 100, relNow(c)); var o = {}; if (cur === 'volume') o.volume = v / 100; else { o[cur] = v; o[cur + 'Off'] = 0; } return P.setClipProps(E.hist.cur, c.id, o); };
      body.appendChild(chips(keys, cur, pickChip('clipaudio')));
      body.appendChild(cur === 'volume'
        ? sliderRow('Volume', 0, 200, 5, Math.round((NANIM ? NANIM.valueOf(c, 'audio', 'volume', relNow(c)) : (c.volume != null ? c.volume : 1)) * 100), pct, function (v){ live(set(v)); }, function (v){ commit(set(v)); })
        : sliderRow(cur === 'fadeIn' ? 'Fade in' : 'Fade out', 0, half, 100, Math.min(half, c[cur] || 0), secs, function (v){ live(set(v)); }, function (v){ commit(set(v)); }));
      if (cur === 'volume'){
        body.appendChild(keyframeActions(c, 'volume'));
        body.appendChild(mk('div', 'ed-hint', 'Move the playhead, tap Add keyframe, then change the volume. The sound glides between keyframes, so you can lower it for a line and bring it back.'));
      }
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
      if (E.hooks.proxy) body.appendChild(actions([{ id: 'edProxy', label: 'Smooth editing', run: function (){ openPanel('proxy'); } }]));
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
    proxy: { title: 'Smooth editing', build: function (body){
      var px = E.hooks.proxy; if (!px){ body.appendChild(mk('div', 'ed-hint', 'Not available here.')); return; }
      var s = px.state();
      if (!s.canMake){ body.appendChild(mk('div', 'ed-hint', 'Choose the movie for this session in Preview first.')); return; }
      if (s.busy){
        body.appendChild(mk('div', 'ed-hint', 'Making the light copy... ' + s.pct + '%. You can keep this screen open; it can take a few minutes for a long movie.'));
        body.appendChild(actions([{ id: 'edProxyCancel', label: 'Cancel', run: function (){ px.cancel(); } }]));
        return;
      }
      if (!s.have){
        body.appendChild(actions([{ id: 'edProxyMake', label: 'Make light copy', run: function (){
          var last = -5;
          px.make(function (p){ if (p - last >= 2){ last = p; if (E.isOpen && E.panel === 'proxy') renderDock(); } }).then(function (ok){
            if (ok){ px.set(true); resyncMedia(); toast('Light copy is on. Scrubbing and playing should be smoother. Your export still uses the original movie.', 7000); }
            if (E.isOpen && E.panel === 'proxy') renderDock();
          });
          renderDock();
        } }]));
        body.appendChild(mk('div', 'ed-hint', 'Makes a small copy of the movie just for editing, so heavy movies scrub and play smoothly on this phone. It is made once and kept on the device. When you export, Naki uses the original movie, so the quality does not change. The preview will look softer while it is on.'));
        return;
      }
      body.appendChild(actions([{ id: 'edProxyToggle', label: s.on ? 'Light copy: on' : 'Light copy: off', run: function (){
        pause(); px.set(!s.on); resyncMedia(); toast(s.on ? 'Light copy is off. The preview shows the original movie.' : 'Light copy is on.'); renderDock();
      } }]));
      body.appendChild(mk('div', 'ed-hint', 'The light copy only changes what you see while editing. Turn it off to check the picture quality; the export always uses the original movie.'));
    } },
    transition: { title: 'Transition', build: function (body){
      var c = needPicture(body); if (!c) return;
      var f = P.findClip(E.proj, c.id), touching = false;
      if (f) f.track.clips.forEach(function (a){ if (a.id !== c.id && a.start + a.dur === c.start) touching = true; });
      var cur = c.transition || { type: 'none', durMs: 600 };
      var TG = NFX && NFX.trans;
      if (TG){
        var tgNow = (TG.LIST.filter(function (t){ return t.key === cur.type; })[0] || {}).group || 'fades', tgSel = chipKey('transgroup', TG.GROUPS, tgNow);
        body.appendChild(chips(TG.GROUPS, tgSel, pickChip('transgroup')));
        body.appendChild(chips([{ key: 'none', label: 'None' }].concat(TG.inGroup(tgSel)), cur.type, function (k){ commit(P.setTransition(E.hist.cur, c.id, { type: k })); }));
      } else body.appendChild(chips(TRANSITIONS, cur.type, function (k){ commit(P.setTransition(E.hist.cur, c.id, { type: k })); }));
      if (c.transition) body.appendChild(sliderRow('Length', 200, 2000, 100, c.transition.durMs, secs, null, function (v){ commit(P.setTransition(E.hist.cur, c.id, { durMs: v })); }));
      body.appendChild(mk('div', 'ed-hint', touching
        ? 'The transition happens where this clip starts. The preview shows a fade; the exported video has the real effect. Videos with transitions export with the compatible engine, which takes longer.'
        : 'This needs a clip right before this one with no gap. Use Close gap or Join first.'));
    } },
    filters: { title: 'Filters', build: function (body){
      var c = needPicture(body); if (!c || !NPR) return;
      var key = E.chip.filterKey || 'none', amt = E.chip.filterAmt != null ? E.chip.filterAmt : 100;
      var set = function (k, a){ return P.setFilter(E.hist.cur, c.id, presetPatch(k, a / 100)); };
      body.appendChild(chips(NPR.LIST, key, function (k){ E.chip.filterKey = k; commit(set(k, k === 'none' ? 0 : amt)); }));
      if (key !== 'none') body.appendChild(sliderRow('Intensity', 0, 100, 5, amt, pct, function (v){ live(set(key, v)); }, function (v){ E.chip.filterAmt = v; commit(set(key, v)); }));
      body.appendChild(actions([{ id: 'edFilterPresetAll', label: 'Apply to all', run: function (){ commit(P.setFilter(E.hist.cur, null, presetPatch(key, amt / 100))); toast('This filter is on every clip now.'); } }]));
      body.appendChild(mk('div', 'ed-hint', 'Fine-tune any filter under Adjust.'));
    } },
    stickerpick: { title: 'Stickers', build: function (body){
      var g = mk('div', 'ed-grid');
      (NSTK ? NSTK.EMOJI.concat(NSTK.SYMBOLS) : []).forEach(function (ch){ var b = btn(null, ch, 'ed-gbtn', 'Add sticker ' + ch); b.onclick = function (){ addStickerHere(ch); }; g.appendChild(b); });
      body.appendChild(g);
      body.appendChild(mk('div', 'ed-hint', 'Tap one to put it on the picture at the playhead. Drag it in the preview to move it.'));
    } },
    stickeredit: { title: 'Sticker', build: function (body){
      var c = selSticker(); if (!c){ body.appendChild(mk('div', 'ed-hint', 'Tap a sticker on the timeline or the picture first.')); return; }
      var keys = [{ key: 'size', label: 'Size' }, { key: 'rot', label: 'Turn' }, { key: 'x', label: 'Left / right' }, { key: 'y', label: 'Up / down' }];
      if (NSTK && NSTK.isSymbol(c.glyph)) keys.push({ key: 'color', label: 'Colour' });
      var cur = chipKey('stickeredit', keys, 'size'), skv = function (k){ return (k === 'x' || k === 'y') ? NANIM.valueOf(c, 'sticker', k, relNow(c)) : c[k]; },
        ps = function (o){   // left / right and up / down go through the keyframes; size, turn and colour stay fixed
          var q = E.hist.cur, rest = {}, any = false;
          Object.keys(o).forEach(function (k){ if (k === 'x' || k === 'y') q = P.setAnimated(q, c.id, k, o[k], relNow(c)); else { rest[k] = o[k]; any = true; } });
          return any ? P.setStickerProps(q, c.id, rest) : q;
        };
      body.appendChild(chips(keys, cur, pickChip('stickeredit')));
      if (cur === 'size') body.appendChild(sliderRow('Size', 4, 90, 1, Math.round(c.size * 100), pct, function (v){ live(ps({ size: v / 100 })); }, function (v){ commit(ps({ size: v / 100 })); }));
      else if (cur === 'rot') body.appendChild(sliderRow('Turn', -180, 180, 5, c.rot || 0, function (v){ return v + '\u00b0'; }, function (v){ live(ps({ rot: v })); }, function (v){ commit(ps({ rot: v })); }));
      else if (cur === 'color'){
        var ci = mk('input'); ci.type = 'color'; ci.value = c.color || '#ffffff'; ci.setAttribute('aria-label', 'Sticker colour');
        ci.oninput = function (){ live(ps({ color: ci.value })); }; ci.onchange = function (){ commit(ps({ color: ci.value })); };
        var sr = mk('div', 'ed-mixrow wide'); add(sr, mk('span', 'ed-mixname', 'Colour'), ci); body.appendChild(sr);
      } else body.appendChild(sliderRow(cur === 'x' ? 'Left / right' : 'Up / down', 0, 100, 1, Math.round(skv(cur) * 100), pct,
        function (v){ var o = {}; o[cur] = v / 100; live(ps(o)); }, function (v){ var o = {}; o[cur] = v / 100; commit(ps(o)); }));
      body.appendChild(mk('div', 'ed-hint', 'You can also drag the sticker on the picture, and drag its ends on the timeline to change how long it shows.'));
    } },
    textanim: { title: 'Text animation', build: function (body){
      var c = selText(); if (!c || !NMO){ body.appendChild(mk('div', 'ed-hint', 'Tap a text on the timeline first.')); return; }
      var an = c.anim || {}, keys = [{ key: 'in', label: 'In' }, { key: 'out', label: 'Out' }, { key: 'loop', label: 'Loop' }], cur = chipKey('textanim', keys, 'in');
      var list = cur === 'in' ? NMO.TEXT_IN : cur === 'out' ? NMO.TEXT_OUT : NMO.TEXT_LOOP, set = function (o){ return P.setTextAnim(E.hist.cur, c.id, o); };
      body.appendChild(chips(keys, cur, pickChip('textanim')));
      body.appendChild(chips(list, an[cur] || 'none', function (k){
        var o = {}; o[cur] = k; commit(set(o));
        seek(cur === 'out' ? c.start + c.dur - 250 : c.start);   // so you see the start (or the end) of it right away
      }));
      if (cur !== 'loop' && an[cur]) body.appendChild(sliderRow('Length', 100, Math.max(200, Math.min(2000, Math.floor(c.dur / 2))), 100, an[cur + 'Ms'] || 500, secs, null, function (v){ var o = {}; o[cur + 'Ms'] = v; commit(set(o)); }));
      var acts = [{ id: 'edTextAnimClear', label: 'Clear', run: function (){ commit(set({ in: 'none', out: 'none', loop: 'none' })); } }];
      if (c.caption) acts.push({ id: 'edTextAnimAll', label: 'Apply to all captions', run: function (){ commit(P.setCaptionAnim(E.hist.cur, c.anim || {})); toast('Every caption has this animation now.'); } });
      body.appendChild(actions(acts));
      body.appendChild(mk('div', 'ed-hint', 'Press play to see it. Typewriter types the words one letter at a time. A loop keeps moving while the text shows. The exported video looks the same; very long texts with a loop keep the loop only in the fast export.'));
    } },
    motion: { title: 'Motion', build: function (body){
      var f = E.sel && P.findClip(E.proj, E.sel), isO = !!(f && f.track.kind === 'overlay'), c = isO ? f.clip : needPicture(body);
      if (!c || !NMO) return;
      var cur = (E.chip.motion && E.chip.motion.id === c.id) ? E.chip.motion.key : 'none';
      body.appendChild(chips(isO ? NMO.OVERLAY_PRESETS : NMO.PICTURE_PRESETS, cur, function (k){
        E.chip.motion = { id: c.id, key: k }; commit(P.setMotionPreset(E.hist.cur, c.id, k)); seek(c.start);
      }));
      body.appendChild(mk('div', 'ed-hint', isO
        ? 'A ready-made movement for this overlay. Press play to see it. It replaces the keyframes the overlay had; you can still fine-tune it under Edit.'
        : 'A slow zoom or pan across this clip. Press play to see it. It replaces the zoom keyframes the clip had; fine-tune it under Zoom.'));
    } },
    overlayedit: { title: 'Overlay', build: function (body){

      var c = selOverlay(); if (!c){ body.appendChild(mk('div', 'ed-hint', 'Tap an overlay on the timeline or the picture first.')); return; }
      var keys = ['size', 'rot', 'opacity', 'x', 'y'].map(function (k){ return { key: k, label: KF_LABEL[k] }; }), cur = chipKey('overlayedit', keys, 'size');
      var val = NANIM.valueOf(c, 'overlay', cur, relNow(c)), set = function (v){ return P.setAnimated(E.hist.cur, c.id, cur, v, relNow(c)); };
      body.appendChild(chips(keys, cur, pickChip('overlayedit')));
      if (cur === 'size') body.appendChild(sliderRow('Size', 5, 150, 1, Math.round(val * 100), pct, function (v){ live(set(v / 100)); }, function (v){ commit(set(v / 100)); }));
      else if (cur === 'rot') body.appendChild(sliderRow('Turn', -180, 180, 5, Math.round(val), function (v){ return v + '\u00b0'; }, function (v){ live(set(v)); }, function (v){ commit(set(v)); }));
      else body.appendChild(sliderRow(KF_LABEL[cur], 0, 100, 1, Math.round(val * 100), pct, function (v){ live(set(v / 100)); }, function (v){ commit(set(v / 100)); }));
      body.appendChild(keyframeActions(c, cur));
      body.appendChild(mk('div', 'ed-hint', 'Drag the overlay on the picture to move it. For movement, put a keyframe here, move the playhead, change the value, and it glides between them. An overlay has no sound.'));
    } },
    sfxpick: { title: 'Sound effects', build: function (body){
      var g = mk('div', 'ed-chips wrap');
      var cats = [{ key: 'all', label: 'All' }], seenCat = {};
      (NSFX ? NSFX.LIST : []).forEach(function (x){ var c = x.cat || 'Other'; if (!seenCat[c]){ seenCat[c] = 1; cats.push({ key: c, label: c }); } });
      var catNow = chipKey('sfxpick', cats, 'all');
      body.appendChild(chips(cats, catNow, pickChip('sfxpick')));
      (NSFX ? NSFX.LIST : []).forEach(function (x){ if (catNow !== 'all' && (x.cat || 'Other') !== catNow) return; var b = btn(null, x.label, 'ed-chip'); b.onclick = function (){ addSfxBuiltin(x.key); }; g.appendChild(b); });
      body.appendChild(g);
      body.appendChild(actions([{ id: 'edSfxImport', label: 'Import your own sound', run: addSfxFromFile }]));
      body.appendChild(mk('div', 'ed-hint', 'Tap one to put it at the playhead. Drag it on the timeline to move it; under Clip you can change its volume and fades.'));
    } },
    autocaptions: { title: 'Auto captions', build: function (body){
      var keys = NCAP.LANGS.map(function (l){ return { key: l.key, label: l.label }; }), cur = chipKey('autocaptions', keys, 'english'), run = !!(E.ac && E.ac.running);
      body.appendChild(chips(keys, cur, pickChip('autocaptions')));
      var srcKeys = [{ key: 'voice', label: 'My voice' }, { key: 'movie', label: 'Movie sound' }], src = chipKey('acsource', srcKeys, noNarration() ? 'movie' : 'voice');
      body.appendChild(chips(srcKeys, src, pickChip('acsource')));
      var st = mk('div', 'ed-hint', run ? E.ac.msg : 'Listens to your recording on this device and writes the captions at the right times. English works best. Luganda is not supported, so for Luganda use Mark speech and type the words.');
      E.acStatus = st; body.appendChild(st);
      body.appendChild(actions([{ id: 'edAutoCapStart', label: run ? 'Working...' : 'Start', run: function (){ runAutoCaptions(cur, src); } }]));
    } },
        shapepick: { title: 'Shapes', build: function (body){
      if (!NFX || !NFX.gen){ body.appendChild(mk('div', 'ed-hint', 'Shapes are not available here.')); return; }
      body.appendChild(chips(NFX.gen.SHAPES, null, function (k){ addGenHere({ kind: 'shape', shape: k, ar: NFX.gen.AR[k] }); }));
      body.appendChild(mk('div', 'ed-hint', 'Tap one to put it on the picture at the playhead. Drag it to move it. Under Edit you can change its colour, outline and size, and animate it with keyframes.'));
    } },
    arrowpick: { title: 'Arrows', build: function (body){
      if (!NFX || !NFX.gen){ body.appendChild(mk('div', 'ed-hint', 'Arrows are not available here.')); return; }
      body.appendChild(chips(NFX.gen.ARROWS, null, function (k){ addGenHere({ kind: 'arrow', style: k }); }));
      body.appendChild(mk('div', 'ed-hint', 'Tap one to put it at the playhead. Use Turn under Edit to point it, and Curve to bend it.'));
    } },
    spotpick: { title: 'Spotlight', build: function (body){
      if (!NFX || !NFX.gen){ body.appendChild(mk('div', 'ed-hint', 'Spotlight is not available here.')); return; }
      body.appendChild(chips(NFX.gen.SPOTS, null, function (k){ addGenHere({ kind: 'spotlight', shape: k }); }));
      body.appendChild(mk('div', 'ed-hint', 'Darkens everything except one spot. With the spotlight selected, drag on the picture to move the spot.'));
    } },
    framepick: { title: 'Frames', build: function (body){
      if (!NFX || !NFX.gen){ body.appendChild(mk('div', 'ed-hint', 'Frames are not available here.')); return; }
      var fcats = []; NFX.gen.FRAMES.forEach(function (f){ var c = f.cat || 'Classic'; if (fcats.indexOf(c) < 0) fcats.push(c); });
      var fck = chipKey('framepick', fcats.map(function (c){ return { key: c, label: c }; }), fcats[0]);
      body.appendChild(chips(fcats.map(function (c){ return { key: c, label: c }; }), fck, pickChip('framepick')));
      body.appendChild(chips(NFX.gen.FRAMES.filter(function (f){ return (f.cat || 'Classic') === fck; }), null, function (k){ var d = NFX.gen.frameDefaults(k); addGenHere({ kind: 'frame', frame: k, color: d.color, width: d.width }); }));
      body.appendChild(mk('div', 'ed-hint', 'A frame goes over the whole picture from the playhead to the end. Drag its end on the timeline to make it shorter. To use your own frame, add a PNG with a see-through middle as an overlay and set its size to 100%.'));
    } },
    genedit: { title: 'Edit', build: function (body){
      var c = selGen();
      if (!c || !NFX || !NFX.gen){ body.appendChild(mk('div', 'ed-hint', 'Tap a shape, arrow, spotlight or frame on the timeline first.')); return; }
      var g = c.gen, GN = NFX.gen, keys = [], gp = function (o){ return P.setGenProps(E.hist.cur, c.id, o); }, deg = function (v){ return v + '\u00b0'; };
      if (g.kind === 'shape'){
        keys = [{ key: 'shape', label: 'Shape' }, { key: 'fill', label: 'Fill' }, { key: 'stroke', label: 'Outline' }, { key: 'ar', label: g.shape === 'line' ? 'Thickness' : 'Height' }];
        if (g.shape === 'rounded') keys.push({ key: 'corner', label: 'Corners' });
      } else if (g.kind === 'arrow') keys = [{ key: 'style', label: 'Style' }, { key: 'color', label: 'Colour' }, { key: 'thick', label: 'Thickness' }, { key: 'ar', label: 'Height' }, { key: 'curve', label: 'Curve' }];
      else if (g.kind === 'spotlight') keys = [{ key: 'shape', label: 'Shape' }, { key: 'size', label: 'Size' }, { key: 'stretch', label: 'Wide / tall' }, { key: 'dim', label: 'Darkness' }, { key: 'feather', label: 'Soft edge' },
        { key: 'cx', label: 'Left / right' }, { key: 'cy', label: 'Up / down' }, { key: 'rot', label: 'Turn' }];
      else keys = [{ key: 'frame', label: 'Frame' }, { key: 'color', label: 'Colour' }, { key: 'width', label: 'Width' }, { key: 'opacity', label: 'Opacity' }];
      if (g.kind === 'shape' || g.kind === 'arrow') ['size', 'rot', 'opacity', 'x', 'y'].forEach(function (k){ keys.push({ key: k, label: KF_LABEL[k] }); });
      var cur = chipKey('genedit', keys, keys[0].key);
      body.appendChild(chips(keys, cur, pickChip('genedit')));
      var sg = function (label, key, lo, hi, step, fmt){
        body.appendChild(sliderRow(label, lo, hi, step, Math.round(g[key] * 100), fmt || pct, function (v){ var o = {}; o[key] = v / 100; live(gp(o)); }, function (v){ var o = {}; o[key] = v / 100; commit(gp(o)); }));
      };
      var col = function (label, key, dflt){
        var ci = mk('input'); ci.type = 'color'; ci.value = g[key] || dflt; ci.setAttribute('aria-label', label);
        ci.oninput = function (){ var o = {}; o[key] = ci.value; live(gp(o)); }; ci.onchange = function (){ var o = {}; o[key] = ci.value; commit(gp(o)); };
        var r = mk('div', 'ed-mixrow wide'); add(r, mk('span', 'ed-mixname', label), ci); body.appendChild(r);
      };
      var kc = g.kind + ':' + cur;
      if (kc === 'shape:shape') body.appendChild(chips(GN.SHAPES, g.shape, function (k){ commit(gp({ shape: k, ar: GN.AR[k] })); }));
      else if (kc === 'spotlight:shape') body.appendChild(chips(GN.SPOTS, g.shape, function (k){ commit(gp({ shape: k })); }));
      else if (kc === 'arrow:style') body.appendChild(chips(GN.ARROWS, g.style, function (k){ commit(gp({ style: k })); }));
      else if (kc === 'frame:frame') body.appendChild(chips(GN.FRAMES, g.frame, function (k){ var d = GN.frameDefaults(k); commit(gp({ frame: k, color: d.color, width: d.width })); }));
      else if (kc === 'shape:fill'){
        col('Fill', 'fill', '#ffffff');
        body.appendChild(actions([{ id: 'edGenFill', label: g.fill ? 'Fill: on' : 'Fill: off', on: !!g.fill, run: function (){ commit(gp({ fill: g.fill ? null : '#ffffff' })); } }]));
      } else if (kc === 'shape:stroke'){
        col('Outline', 'stroke', '#000000');
        body.appendChild(actions([{ id: 'edGenStroke', label: g.stroke ? 'Outline: on' : 'Outline: off', on: !!g.stroke, run: function (){ commit(gp({ stroke: g.stroke ? null : '#000000' })); } }]));
        if (g.stroke) sg('Outline width', 'strokeW', 1, 20, 1);
      }
      else if (kc === 'shape:ar') sg(g.shape === 'line' ? 'Thickness' : 'Height', 'ar', g.shape === 'line' ? 2 : 10, g.shape === 'line' ? 50 : 300, g.shape === 'line' ? 1 : 5);
      else if (kc === 'shape:corner') sg('Corners', 'corner', 0, 50, 1);
      else if (kc === 'arrow:color') col('Colour', 'color', '#ff3b30');
      else if (kc === 'arrow:thick') sg('Thickness', 'thick', 5, 50, 1);
      else if (kc === 'arrow:ar') sg('Height', 'ar', 15, 150, 5);
      else if (kc === 'arrow:curve') sg('Curve', 'curve', -100, 100, 5, function (v){ return String(Math.round(v)); });
      else if (kc === 'spotlight:size') sg('Size', 'size', 10, 150, 5);
      else if (kc === 'spotlight:stretch') sg('Wide / tall', 'stretch', 30, 300, 5);
      else if (kc === 'spotlight:dim') sg('Darkness', 'dim', 0, 100, 5);
      else if (kc === 'spotlight:feather') sg('Soft edge', 'feather', 0, 100, 5);
      else if (kc === 'spotlight:cx') sg('Left / right', 'cx', 0, 100, 1);
      else if (kc === 'spotlight:cy') sg('Up / down', 'cy', 0, 100, 1);
      else if (kc === 'spotlight:rot') body.appendChild(sliderRow('Turn', -180, 180, 5, Math.round(g.rot), deg, function (v){ live(gp({ rot: v })); }, function (v){ commit(gp({ rot: v })); }));
      else if (kc === 'frame:color') col('Colour', 'color', '#ffffff');
      else if (kc === 'frame:width') sg('Width', 'width', 2, 30, 1);
      else {   // size, turn, opacity and position of a shape or an arrow, and the opacity of a frame: with keyframes, like any overlay
        var val = NANIM.valueOf(c, 'overlay', cur, relNow(c)), set = function (v){ return P.setAnimated(E.hist.cur, c.id, cur, v, relNow(c)); };
        if (cur === 'size') body.appendChild(sliderRow('Size', 5, 150, 1, Math.round(val * 100), pct, function (v){ live(set(v / 100)); }, function (v){ commit(set(v / 100)); }));
        else if (cur === 'rot') body.appendChild(sliderRow('Turn', -180, 180, 5, Math.round(val), deg, function (v){ live(set(v)); }, function (v){ commit(set(v)); }));
        else body.appendChild(sliderRow(KF_LABEL[cur], 0, 100, 1, Math.round(val * 100), pct, function (v){ live(set(v / 100)); }, function (v){ commit(set(v / 100)); }));
        body.appendChild(keyframeActions(c, cur));
      }
      body.appendChild(mk('div', 'ed-hint', g.kind === 'spotlight' ? 'Drag on the picture to move the spot. Blend and Motion are under the Overlay tools too.'
        : g.kind === 'frame' ? 'A frame covers the whole picture. Drag its ends on the timeline to change how long it shows.'
        : 'Drag it on the picture to move it. For movement, put a keyframe here, move the playhead, change the value, and it glides between them.'));
    } },
        fxpick: { title: 'Video effects', build: function (body){
      var V = NFX && NFX.vfx; if (!V){ body.appendChild(mk('div', 'ed-hint', 'Effects are not available here.')); return; }
      var cur = chipKey('fxcat', V.CATS, V.CATS[0].key);
      body.appendChild(chips(V.CATS, cur, pickChip('fxcat')));
      body.appendChild(chips(V.inCat(cur), null, function (k){ addFxHere(k); }));
      body.appendChild(mk('div', 'ed-hint', 'Tap one to put it on the picture at the playhead, then press play. Drag its ends on the timeline to change how long it lasts. Effects that CSS cannot show in the preview (mirrors, pixelate, lens, edges) show a note there; the exported video has the real effect. Videos with effects export with the compatible engine, which takes longer.'));
    } },
    fxedit: { title: 'Effect', build: function (body){
      var V = NFX && NFX.vfx, c = selFx();
      if (!V || !c){ body.appendChild(mk('div', 'ed-hint', 'Tap an effect on the timeline first.')); return; }
      var me = V.LIST.filter(function (e){ return e.key === c.fx; })[0], cat = me ? me.cat : V.CATS[0].key;
      body.appendChild(chips(V.inCat(cat), c.fx, function (k){ commit(P.setFxProps(E.hist.cur, c.id, { fx: k })); }));
      if (V.isFixed(c.fx)) body.appendChild(mk('div', 'ed-hint', 'This effect has one setting. Drag its ends on the timeline to change how long it lasts.'));
      else {
        body.appendChild(sliderRow('Strength', 0, 100, 5, Math.round((c.strength == null ? 0.5 : c.strength) * 100), pct, function (v){ live(P.setFxProps(E.hist.cur, c.id, { strength: v / 100 })); }, function (v){ commit(P.setFxProps(E.hist.cur, c.id, { strength: v / 100 })); }));
        body.appendChild(mk('div', 'ed-hint', 'Drag the ends of the effect on the timeline to change how long it lasts. Several effects can be on at once (each on its own row).'));
      }
    } },
        removebg: { title: 'Remove background', build: function (body){
      if (!NRB){ body.appendChild(mk('div', 'ed-hint', 'removebg.js is not loaded.')); return; }
      NRB.buildPanel(body, { clip: selOverlay(), hooks: E.hooks, store: E.rbg || (E.rbg = {}), mk: mk, sliderRow: sliderRow, actions: actions, toast: toast, refresh: renderDock, redraw: function (){ renderTimeline(); syncMedia(); } });
    } },
        maskonly: { title: 'Mask', build: function (body){
      E.chip.overlayfx = 'mask'; PANELS.overlayfx.build(body);
      if (body.firstChild && body.firstChild.classList.contains('ed-sw')) body.removeChild(body.firstChild);   // drop the Blend / Mask / Chroma tabs
    } },
    blendonly: { title: 'Blend', build: function (body){
      E.chip.overlayfx = 'blend'; PANELS.overlayfx.build(body);
      if (body.firstChild && body.firstChild.classList.contains('ed-sw')) body.removeChild(body.firstChild);
    } },
    chromakey: { title: 'Chroma key', build: function (body){
      var c = selOverlay();
      if (!c || c.gen || !NFX){ body.appendChild(mk('div', 'ed-hint', 'Tap a picture or a video overlay on the timeline or the picture first.')); return; }
      var ch = c.chroma, fx = function (o){ return P.setOverlayFx(E.hist.cur, c.id, o); };
      body.appendChild(actions([{ id: 'edChromaOn2', label: ch ? 'Chroma key: on' : 'Chroma key: off', on: !!ch, run: function (){ E.pickOn = !ch; commit(fx({ chroma: ch ? null : {} })); } }]));
      if (!ch){ body.appendChild(mk('div', 'ed-hint', 'Switch it on, then drag the circle on the picture over the colour you want to remove (a green screen, say).')); return; }
      var top = mk('div', 'ed-mixrow wide'), sw = mk('span', 'ed-swatch'); sw.style.background = ch.color;
      add(top, mk('span', 'ed-mixname', 'Colour'), sw, mk('span', 'ed-mixval num', ch.color)); body.appendChild(top);
      body.appendChild(actions([{ id: 'edPickColour', label: E.pickOn ? 'Picker: on' : 'Pick colour', on: !!E.pickOn, run: function (){ E.pickOn = !E.pickOn; renderDock(); } },
        { id: 'edKeyGreen2', label: 'Green', run: function (){ commit(fx({ chroma: { color: '#00ff00' } })); } }, { id: 'edKeyBlue2', label: 'Blue', run: function (){ commit(fx({ chroma: { color: '#0000ff' } })); } }]));
      var inten = Math.round(clamp(ch.similarity / 0.9, 0.01, 1) * 100), shad = Math.round(clamp(ch.blend / 0.5, 0, 1) * 100);
      body.appendChild(sliderRow('Intensity', 1, 100, 1, inten, pct, function (v){ live(fx({ chroma: { similarity: Math.max(0.01, v / 100 * 0.9) } })); }, function (v){ commit(fx({ chroma: { similarity: Math.max(0.01, v / 100 * 0.9) } })); }));
      body.appendChild(sliderRow('Shadow', 0, 100, 1, shad, pct, function (v){ live(fx({ chroma: { blend: v / 100 * 0.5 } })); }, function (v){ commit(fx({ chroma: { blend: v / 100 * 0.5 } })); }));
      body.appendChild(mk('div', 'ed-hint', 'Drag the circle over the colour to remove. Intensity: how far from that colour is still removed (raise it until the screen is gone). Shadow: how soft the edge is, so soft shadows and hair stay (lower it for a sharp cut). The exported video can differ slightly from this preview.'));
    } },
    keyease: { title: 'Keyframe easing', build: function (body){
      var f = E.sel && P.findClip(E.proj, E.sel);
      if (!f || !P.keyframesHere){ body.appendChild(mk('div', 'ed-hint', 'Tap a clip with keyframes first.')); return; }
      var c = f.clip, here = P.keyframesHere(E.hist.cur, c.id, relNow(c)), ez = here.length ? easeBlock(c, here[0], true) : null;
      if (!ez){ body.appendChild(mk('div', 'ed-hint', here.length ? 'This is the last keyframe, so there is nothing after it to ease into.' : 'Move the playhead onto a keyframe (a diamond on the clip) first.')); return; }
      body.appendChild(ez);
      body.appendChild(mk('div', 'ed-hint', 'The same easing is used for everything that moves at this keyframe (position, size, turn, opacity).'));
    } },
    overlayfx: { title: 'Blend & mask', build: function (body){
      var c = selOverlay(); if (!c || !NFX){ body.appendChild(mk('div', 'ed-hint', 'Tap an overlay on the timeline or the picture first.')); return; }
      var keys = [{ key: 'blend', label: 'Blend' }, { key: 'mask', label: 'Mask' }, { key: 'chroma', label: 'Chroma key' }], cur = chipKey('overlayfx', keys, 'blend');
      var fx = function (o){ return P.setOverlayFx(E.hist.cur, c.id, o); };
      body.appendChild(chips(keys, cur, pickChip('overlayfx')));
      if (cur === 'blend'){
        body.appendChild(chips(NFX.BLEND, c.blend || 'normal', function (k){ commit(fx({ blend: k })); }));
        body.appendChild(mk('div', 'ed-hint', 'Mixes the overlay with the picture under it. Multiply darkens (shadows, textures); Screen and Add lighten (glows, light leaks); Overlay and Soft light add contrast; Colour and Brightness take only the colours or only the light from the overlay. Use Opacity under Edit to make it weaker.'));
      } else if (cur === 'mask'){
        var m0 = NFX.cleanMask(c.mask), shape = m0 ? m0.shape : 'none';
        body.appendChild(chips(NFX.MASKS, shape, function (k){ commit(fx({ mask: (k === 'rect' && !(m0 && m0.corner)) ? { shape: k, corner: 0.2 } : { shape: k } })); }));
        if (m0){
          var props = [];
          if (m0.shape !== 'line' && m0.shape !== 'mirror') props.push({ key: 'w', label: 'Width' });
          if (m0.shape !== 'line') props.push({ key: 'h', label: m0.shape === 'mirror' ? 'Band' : 'Height' });
          props.push({ key: 'x', label: 'Left / right' }, { key: 'y', label: 'Up / down' }, { key: 'rot', label: 'Turn' }, { key: 'feather', label: 'Feather' });
          if (m0.shape !== 'line' && m0.shape !== 'mirror') props.unshift({ key: 'size', label: 'Size' });
          if (m0.shape === 'rect') props.push({ key: 'corner', label: 'Corners' });
          var pk = chipKey('maskprop', props, props[0].key), big = Math.max(m0.w, m0.h), val = pk === 'size' ? big : m0[pk],
            put = function (v){ var o = {}; if (pk === 'size'){ var k = v / big; o.w = m0.w * k; o.h = m0.h * k; } else o[pk] = v; return fx({ mask: o }); };
          body.appendChild(chips(props, pk, pickChip('maskprop')));
          if (pk === 'rot') body.appendChild(sliderRow('Turn', -180, 180, 5, Math.round(val), function (v){ return v + '\u00b0'; }, function (v){ live(put(v)); }, function (v){ commit(put(v)); }));
          else if (pk === 'w' || pk === 'h' || pk === 'size') body.appendChild(sliderRow('Size', 5, 200, 5, Math.round(val * 100), pct, function (v){ live(put(v / 100)); }, function (v){ commit(put(v / 100)); }));
          else body.appendChild(sliderRow('Amount', 0, 100, 1, Math.round(val * 100), pct, function (v){ live(put(v / 100)); }, function (v){ commit(put(v / 100)); }));
          body.appendChild(actions([{ id: 'edMaskInvert', label: m0.invert ? 'Invert: on' : 'Invert: off', on: !!m0.invert, run: function (){ commit(fx({ mask: { invert: !m0.invert } })); } }]));
        }
        body.appendChild(mk('div', 'ed-hint', 'Cuts the overlay to a shape: Line shows one side of a line, Mirror a band across the middle. Feather softens the edge, Invert shows the outside instead.'));
      } else {
        var ch = c.chroma;
        body.appendChild(actions([{ id: 'edChromaOn', label: ch ? 'Chroma key: on' : 'Chroma key: off', on: !!ch, run: function (){ commit(fx({ chroma: ch ? null : {} })); } }]));
        if (ch){
          var ci = mk('input'); ci.type = 'color'; ci.value = ch.color; ci.setAttribute('aria-label', 'Colour to remove');
          ci.oninput = function (){ live(fx({ chroma: { color: ci.value } })); }; ci.onchange = function (){ commit(fx({ chroma: { color: ci.value } })); };
          var cr = mk('div', 'ed-mixrow wide'); add(cr, mk('span', 'ed-mixname', 'Colour to remove'), ci); body.appendChild(cr);
          body.appendChild(actions([{ id: 'edKeyGreen', label: 'Green screen', run: function (){ commit(fx({ chroma: { color: '#00ff00' } })); } },
            { id: 'edKeyBlue', label: 'Blue screen', run: function (){ commit(fx({ chroma: { color: '#0000ff' } })); } }]));
          body.appendChild(sliderRow('Similarity', 1, 90, 1, Math.round(ch.similarity * 100), pct, function (v){ live(fx({ chroma: { similarity: v / 100 } })); }, function (v){ commit(fx({ chroma: { similarity: v / 100 } })); }));
          body.appendChild(sliderRow('Edge softness', 0, 50, 1, Math.round(ch.blend * 100), pct, function (v){ live(fx({ chroma: { blend: v / 100 } })); }, function (v){ commit(fx({ chroma: { blend: v / 100 } })); }));
        }
        body.appendChild(mk('div', 'ed-hint', 'Makes one colour see-through, such as a green screen. Raise Similarity until the colour is gone, then add a little softness. The exported video can differ slightly from this preview.'));
      }
    } },
        speedcurve: { title: 'Speed curve', build: function (body){
      var c = needPicture(body); if (!c) return;
      if (!NCV || c.type !== 'video' || c.reverse){ body.appendChild(mk('div', 'ed-hint', 'Pick a part where the movie plays forwards. A paused or reversed picture has no speed curve.')); return; }
      var info = P.speedCurveOf(E.hist.cur, c.id), key = info ? info.g : c.id;
      if (!E.cv || E.cv.key !== key) E.cv = { key: key, pts: info ? info.pts.map(function (p){ return p.slice(); }) : [[0, 1], [1, 1]], sel: -1, preset: info ? 'custom' : 'none' };
      var cv = E.cv, apply = function (){ var q = P.setSpeedCurve(E.hist.cur, c.id, cv.pts); if (q === E.hist.cur) renderDock(); else commit(q); };
      var list = [{ key: 'none', label: 'Normal' }].concat(NCV.PRESETS.map(function (p){ return { key: p.key, label: p.label }; }));
      if (info) list.push({ key: 'custom', label: 'Custom' });
      body.appendChild(chips(list, cv.preset, function (k){
        if (k === 'custom') return;
        if (k === 'none'){ E.cv = null; var q0 = P.clearSpeedCurve(E.hist.cur, c.id); if (q0 === E.hist.cur) renderDock(); else commit(q0); return; }
        cv.pts = NCV.PRESETS.filter(function (p){ return p.key === k; })[0].pts.map(function (p){ return p.slice(); }); cv.sel = -1; cv.preset = k; apply();
      }));
      var NS = 'http://www.w3.org/2000/svg', svg0 = document.createElementNS(NS, 'svg'), out = mk('div', 'ed-hint');
      svg0.setAttribute('viewBox', '0 0 ' + CVG.W + ' ' + CVG.H); svg0.setAttribute('class', 'ed-curve'); svg0.setAttribute('role', 'img'); svg0.setAttribute('aria-label', 'Speed curve');
      var node = function (tag, attrs){ var e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k){ e.setAttribute(k, attrs[k]); }); return e; };
      var draw = function (){
        while (svg0.firstChild) svg0.removeChild(svg0.firstChild);
        [0.25, 0.5, 1, 2, 4].forEach(function (v){
          var y = cvY(v); svg0.appendChild(node('line', { x1: CVG.x0, x2: CVG.x1, y1: y, y2: y, 'class': v === 1 ? 'ed-cg one' : 'ed-cg' }));
          var t = node('text', { x: 2, y: y - 2, 'class': 'ed-ct' }); t.textContent = v + '\u00d7'; svg0.appendChild(t);
        });
        var d = ''; for (var i = 0; i <= 60; i++){ var u = i / 60; d += (i ? 'L' : 'M') + cvX(u).toFixed(1) + ' ' + cvY(NCV.valueAt(cv.pts, u)).toFixed(1); }
        svg0.appendChild(node('path', { d: d, 'class': 'ed-cpath' }));
        cv.pts.forEach(function (p, i){ svg0.appendChild(node('circle', { cx: cvX(p[0]), cy: cvY(p[1]), r: i === cv.sel ? 8 : 6, 'class': 'ed-cdot' + (i === cv.sel ? ' sel' : '') })); });
        var sp = curveSpan(c); out.textContent = 'Length: ' + fmtP(sp.now) + ' now, ' + fmtP(sp.span * NCV.outputFactor(cv.pts)) + ' with this curve.';
      };
      var drag = -1, where = function (ev){ var r = svg0.getBoundingClientRect(), s = CVG.W / (r.width || CVG.W); return { x: (ev.clientX - r.left) * s, y: (ev.clientY - r.top) * s }; };
      svg0.addEventListener('pointerdown', function (ev){
        var p = where(ev), best = -1, bd = 22;
        cv.pts.forEach(function (pt, i){ var dd = Math.hypot(cvX(pt[0]) - p.x, cvY(pt[1]) - p.y); if (dd < bd){ bd = dd; best = i; } });
        if (best < 0) return;
        drag = best; cv.sel = best; cv.preset = 'custom'; try { svg0.setPointerCapture(ev.pointerId); } catch (e) {} ev.preventDefault(); draw();
      });
      svg0.addEventListener('pointermove', function (ev){
        if (drag < 0) return;
        var p = where(ev), pts = cv.pts, last = pts.length - 1, u = pts[drag][0];
        if (drag > 0 && drag < last) u = clamp(cvU(p.x), pts[drag - 1][0] + NCV.GAP, pts[drag + 1][0] - NCV.GAP);
        pts[drag] = [u, cvV(p.y)]; draw();
      });
      var letGo = function (){ if (drag < 0) return; drag = -1; apply(); };
      svg0.addEventListener('pointerup', letGo); svg0.addEventListener('pointercancel', letGo);
      body.appendChild(svg0); draw(); body.appendChild(out);
      body.appendChild(actions([
        { id: 'edCurveAdd', label: 'Add point', run: function (){
          var pts = cv.pts, bi = 0, bg = 0; for (var i = 0; i < pts.length - 1; i++){ var g = pts[i + 1][0] - pts[i][0]; if (g > bg){ bg = g; bi = i; } }
          if (bg < NCV.GAP * 2 || pts.length >= NCV.MAXPTS){ toast('There is no room for another point.'); return; }
          var u = (pts[bi][0] + pts[bi + 1][0]) / 2; pts.splice(bi + 1, 0, [u, NCV.valueAt(pts, u)]); cv.sel = bi + 1; cv.preset = 'custom'; draw();
        } },
        { id: 'edCurveDel', label: 'Delete point', run: function (){
          if (cv.sel <= 0 || cv.sel >= cv.pts.length - 1){ toast('Tap a point first (not the first or the last one).'); return; }
          cv.pts.splice(cv.sel, 1); cv.sel = -1; cv.preset = 'custom'; apply();
        } }]));
      body.appendChild(mk('div', 'ed-hint', 'Drag a dot up to play faster there, down to play slower. Tap a dot to pick it, then Delete point. The movie sound follows the speed; your voice does not. Videos with a speed export with the compatible engine, which takes longer.'));
    } },
    texts: { title: 'Your texts', build: function (body){
      var list = allTexts();
      if (!list.length){ body.appendChild(mk('div', 'ed-hint', 'No text yet. Tap Add text.')); return; }
      body.appendChild(chips(list.map(function (c){ return { key: c.id, label: (c.text || 'Text') + ' · ' + fmtP(c.start) }; }), E.sel, function (id){
        var c = P.findClip(E.proj, id).clip; E.panel = null; seek(c.start); select(id);
      }));
    } },
    wordhl: { title: 'Word highlight', build: function (body){
      var trc = P.captionTrackOf(E.hist.cur);
      if (!trc || !trc.clips.length){ body.appendChild(mk('div', 'ed-hint', 'Add captions first (Auto captions, an .srt file or Add line here), then pick a colour for the word being spoken.')); return; }
      var COLS = [{ key: 'off', label: 'Off', v: null }, { key: 'yellow', label: 'Yellow', v: '#ffd400' }, { key: 'green', label: 'Green', v: '#2bd96b' }, { key: 'red', label: 'Red', v: '#ff3b3b' },
        { key: 'cyan', label: 'Cyan', v: '#22d3ee' }, { key: 'orange', label: 'Orange', v: '#ff8a1f' }, { key: 'pink', label: 'Pink', v: '#ff5db1' }], now = trc.clips[0].hl || null, cur = 'off';
      COLS.forEach(function (o){ if (o.v === now) cur = o.key; });
      body.appendChild(chips(COLS.map(function (o){ return { key: o.key, label: o.label }; }), cur, function (k){
        var col = null; COLS.forEach(function (o){ if (o.key === k) col = o.v; });
        var q = P.setCaptionHighlight(E.hist.cur, col); if (q === E.hist.cur) renderDock(); else commit(q);
      }));
      body.appendChild(mk('div', 'ed-hint', 'The word being spoken lights up in this colour, on every caption. Each word gets its share of the line by its length, so check the timing against your voice. Not used on captions that have a text animation.'));
    } },
    captions: { title: 'Captions', build: function (body){
      var list = P.captionList(E.hist.cur);
      body.appendChild(actions([{ id: 'edCapAdd', label: 'Add line here', run: addCaptionHere }, { id: 'edCapImport', label: 'Import .srt / .vtt', run: importSrtFile }, { id: 'edCapExport', label: 'Save .srt', run: exportSrtFile }, { id: 'edCapExportVtt', label: 'Save .vtt', run: exportVttFile }]));
      body.appendChild(actions([{ id: 'edCapAuto', label: 'Auto captions', run: function (){ openPanel('autocaptions'); } }, { id: 'edCapMark', label: 'Mark speech', run: markSpeech }, { id: 'edCapHl', label: 'Word highlight', run: function (){ openPanel('wordhl'); } }]));
      if (!list.length){ body.appendChild(mk('div', 'ed-hint', 'Type subtitle lines at the playhead, or import an .srt file. Times follow your edited video, so cuts move the captions with it.')); return; }
      body.appendChild(chips(list.map(function (c){ return { key: c.id, label: fmtP(c.start) + '  ' + (c.text.length > 22 ? c.text.slice(0, 21) + '…' : c.text) }; }), E.sel, function (id){
        var c = P.findClip(E.proj, id).clip; seek(c.start); E.sel = id; commit0(); openPanel('textedit', 'text');
      }));
      body.appendChild(actions([{ id: 'edCapClear', label: 'Remove all captions', run: function (){ if (confirm('Remove all ' + list.length + ' caption lines?')) commit(P.removeCaptions(E.hist.cur)); } }]));
    } }
  };

  /* ---------- timeline markers (flags on the ruler, CapCut style) ---------- */
  var NMK = (typeof module !== 'undefined' && module.exports) ? require('./markers.js') : (typeof window !== 'undefined' ? window.NakiMarkers : null);
  G.flag = svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>');
  function markerNeed(){ if (NMK) return true; toast('Markers are not loaded. Add <script src="markers.js"></script> to index.html, before editor.js.'); return false; }
  // the times a dragged or trimmed clip snaps to: the playhead and every marker
  function snapPts(){ return [E.t].concat(NMK ? NMK.times(E.proj) : []); }
  // the marker the tools work on: the one you tapped, or else the one at the playhead
  function curMarker(){
    if (!NMK) return null;
    var l = NMK.list(E.hist.cur), i;
    if (E.markSel) for (i = 0; i < l.length; i++) if (l[i].id === E.markSel) return l[i];
    return NMK.at(E.hist.cur, Math.round(E.t));
  }
  function addMarkerHere(){
    if (!markerNeed()) return;
    var out = {}, q = NMK.add(E.hist.cur, Math.round(E.t), null, out);
    if (out.full){ toast('That is the most markers a project can have.'); return; }
    E.markSel = out.id;
    if (q === E.hist.cur){ renderTimeline(); openPanel('markeredit', 'marker'); return; }   // there is already one here: just open it
    commit(q); openPanel('markeredit', 'marker');
  }
  function markerTap(id){
    var m = NMK && NMK.list(E.hist.cur).filter(function (x){ return x.id === id; })[0]; if (!m) return;
    E.markSel = id; seek(m.t); renderTimeline(); openPanel('markeredit', 'marker');
  }
  function jumpMarker(dir){
    if (!markerNeed()) return;
    var m = NMK.neighbour(E.hist.cur, E.t, dir);
    if (!m){ toast(dir > 0 ? 'There is no marker after the playhead.' : 'There is no marker before the playhead.'); return; }
    E.markSel = m.id; seek(m.t);
    var sc = E.ui.scroll, x = tx(m.t);
    if (x < sc.scrollLeft + 20 || x > sc.scrollLeft + sc.clientWidth - 20) sc.scrollLeft = Math.max(0, x - sc.clientWidth / 2);
    renderTimeline(); renderDock();
  }
  function deleteMarker(){
    var m = curMarker(); if (!m){ toast('Tap a flag, or move the playhead onto one, first.'); return; }
    E.markSel = null; commit(NMK.remove(E.hist.cur, m.id));
  }
  function clearMarkers(){
    var n = NMK ? NMK.list(E.hist.cur).length : 0; if (!n) return;
    if (!confirm('Remove all ' + n + ' markers?')) return;
    E.markSel = null; commit(NMK.clear(E.hist.cur));
  }
  // The flags along the ruler. Tapping one is handled in onDown.
  function drawMarkerFlags(ruler){
    if (!NMK) return;
    NMK.list(E.proj).forEach(function (m){
      var f = mk('div', 'ed-mflag' + (m.id === E.markSel ? ' sel' : '')); f.dataset.id = m.id;
      f.style.left = tx(m.t) + 'px'; f.style.setProperty('--mc', NMK.colorCss(m.color)); f.title = (m.name ? m.name + ' \u00b7 ' : '') + fmtP(m.t);
      if (m.name) f.appendChild(mk('span', null, m.name));
      ruler.appendChild(f);
    });
  }
  ROWS.marker = function (){
    var has = !!(NMK && NMK.list(E.hist.cur).length), cm = curMarker();
    return [
      { id: 'edMarkerAdd', label: 'Add marker', icon: G.flag, run: addMarkerHere },
      { id: 'edMarkerEdit', label: 'Edit', icon: G.pencil, run: function (){ openPanel('markeredit'); }, disabled: !has },
      { id: 'edMarkerPrev', label: 'Previous', icon: G.back, run: function (){ jumpMarker(-1); }, disabled: !has },
      { id: 'edMarkerNext', label: 'Next', icon: G.fwd, run: function (){ jumpMarker(1); }, disabled: !has },
      { id: 'edMarkerDel', label: 'Delete', icon: G.trash, run: deleteMarker, disabled: !cm },
      { id: 'edMarkerClear', label: 'Clear all', icon: G.reset, run: clearMarkers, disabled: !has }
    ];
  };
  PANELS.markeredit = { title: 'Markers', build: function (body){
    if (!markerNeed()) return;
    var l = NMK.list(E.hist.cur);
    if (!l.length){
      body.appendChild(mk('div', 'ed-hint', 'No markers yet. Move the playhead to a spot and add one. Markers show as flags on the ruler, and clips snap to them when you drag or trim.'));
      body.appendChild(actions([{ id: 'edMarkerAdd2', label: 'Add marker here', run: addMarkerHere }]));
      return;
    }
    var c = curMarker();
    body.appendChild(chips(l.map(function (m){ return { key: m.id, label: fmtP(m.t) + (m.name ? '  ' + (m.name.length > 16 ? m.name.slice(0, 15) + '\u2026' : m.name) : '') }; }), c ? c.id : null, function (id){ markerTap(id); }));
    if (!c){ body.appendChild(mk('div', 'ed-hint', 'Tap a flag on the ruler, or pick one above, to rename or recolour it.')); return; }
    var ti = mk('input', 'ed-textin'); ti.type = 'text'; ti.maxLength = 40; ti.placeholder = 'Marker name'; ti.value = c.name || ''; ti.setAttribute('aria-label', 'Marker name');
    ti.oninput = function (){ live(NMK.update(E.hist.cur, c.id, { name: ti.value })); };
    ti.onchange = function (){ commit(NMK.update(E.hist.cur, c.id, { name: ti.value })); };
    body.appendChild(ti);
    body.appendChild(chips(NMK.COLORS.map(function (x){ return { key: x.key, label: x.label }; }), c.color, function (k){ commit(NMK.update(E.hist.cur, c.id, { color: k })); }));
    body.appendChild(actions([{ id: 'edMarkerHere', label: 'Move to playhead', run: function (){ commit(NMK.update(E.hist.cur, c.id, { t: Math.round(E.t) })); } }, { id: 'edMarkerDel2', label: 'Delete marker', run: deleteMarker }]));
    body.appendChild(mk('div', 'ed-hint', 'Markers do not change your video. They are for you: to mark a beat, a cut or a note. They move with the video when you cut a part out or hold a picture.'));
  } };

  /* ---------- layouts: mirror and split screen ---------- */
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
    body.appendChild(mk('div', 'ed-hint', 'Zoom moves each box in on the middle of its part of the picture. The layout works on the whole frame, after the clip\'s own zoom, filters and fade; titles, stickers and overlays stay on top. The preview ignores Crop; the exported video does not.'));
  } };

  /* ---------- small tools: noise reduction, motion blur, intro / outro pieces and countdown ---------- */
  G.mblur = svg('<path d="M3 8h8M3 12h12M3 16h8"/><circle cx="17" cy="12" r="4"/>');
  G.denoise = svg('<path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4"/>');
  G.piece = svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10h8M8 14h5"/>');
  function addPieceHere(key, n){
    var out = {}, q = P.addPiece(E.hist.cur, Math.round(E.t), key, n, out);
    if (q === E.hist.cur){ toast('There is no room for a title at the playhead. Move it or shorten the other text.'); return; }
    E.sel = out.id; commit(q); openPanel('textedit', 'text');
  }
  function addCountdownHere(from){
    var out = {}, q = P.addCountdown(E.hist.cur, Math.round(E.t), from, out);
    if (q === E.hist.cur){ toast('There is no room for the countdown. It needs ' + from + ' free seconds of text row from the playhead.', 6000); return; }
    E.sel = out.ids[0]; commit(q); closePanel(); toast('Countdown added: one second for each number.');
  }
  PANELS.denoise = { title: 'Noise reduction', build: function (body){
    var tracks = E.proj.tracks.filter(function (t){ return t.kind === 'audio'; });
    if (!tracks.length){ body.appendChild(mk('div', 'ed-hint', 'There is no sound to clean.')); return; }
    var keys = tracks.map(function (t){ return { key: t.id, label: ROLE_NAME[t.role] || t.role }; }), cur = chipKey('denoise', keys, keys[0].key), tr = tracks.filter(function (t){ return t.id === cur; })[0];
    var set = function (v){ return P.setDenoise(E.hist.cur, tr.id, v / 100); };
    body.appendChild(chips(keys, cur, pickChip('denoise')));
    body.appendChild(sliderRow('Strength', 0, 100, 5, Math.round((tr.denoise || 0) * 100), pct, function (v){ live(set(v)); }, function (v){ commit(set(v)); }));
    body.appendChild(actions([{ id: 'edDenoiseOff', label: tr.denoise ? 'Turn off' : 'Off', on: !tr.denoise, run: function (){ commit(set(0)); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Takes out steady background noise such as hiss, hum and fan noise from the sound you pick. Start low: a high setting can make voices sound thin. The exported video has it, the preview does not. Videos with noise reduction export with the compatible engine, which takes longer.'));
  } };
  PANELS.motionblur = { title: 'Motion blur', build: function (body){
    var f = E.sel && P.findClip(E.proj, E.sel), isO = !!(f && f.track.kind === 'overlay'), c = isO ? f.clip : needPicture(body); if (!c) return;
    var set = function (v){ return P.setMotionBlur(E.hist.cur, c.id, v / 100); }, moves = !!(c.kf && Object.keys(c.kf).length);
    body.appendChild(sliderRow('Motion blur', 0, 100, 5, Math.round((c.mblur || 0) * 100), pct, function (v){ live(set(v)); }, function (v){ commit(set(v)); }));
    body.appendChild(mk('div', 'ed-hint', moves ? 'Blends the frames while this clip moves or zooms, so fast movement looks smooth instead of stepping. The preview does not show it, the exported video does (compatible engine, slower).' : 'This clip does not move yet, so there is nothing to blur. Add keyframes, or pick a Motion preset, then come back.'));
  } };
  PANELS.pieces = { title: 'Intro / outro', build: function (body){
    var tabs = [{ key: 'title', label: 'Titles' }, { key: 'count', label: 'Countdown' }], tab = chipKey('pieces', tabs, 'title'), o = E.chip.pieceOpt || (E.chip.pieceOpt = { n: 1, from: 3 });
    body.appendChild(chips(tabs, tab, pickChip('pieces')));
    if (tab === 'title'){
      body.appendChild(chips(P.PIECES.map(function (d){ return { key: d.key, label: d.label }; }), null, function (k){ addPieceHere(k, o.n); }));
      body.appendChild(chips([1, 2, 3, 4, 5, 6].map(function (n){ return { key: n, label: 'No. ' + n }; }), o.n, function (k){ o.n = k; renderDock(); }));
      body.appendChild(mk('div', 'ed-hint', 'Tap a title to put it at the playhead (the number is for Part and Chapter). It is a normal text clip, so you can change the words, style and animation afterwards.'));
    } else {
      body.appendChild(chips([3, 5, 10].map(function (n){ return { key: n, label: n + ' to 1' }; }), o.from, function (k){ o.from = k; renderDock(); }));
      body.appendChild(actions([{ id: 'edCountdownAdd', label: 'Add countdown here', run: function (){ addCountdownHere(o.from); } }]));
      body.appendChild(mk('div', 'ed-hint', 'Adds one big number for each second, starting at the playhead. Each number is its own text clip, so you can restyle or move them.'));
    }
  } };

  /* ---------- scopes and the eyedropper ---------- */
  var NSC = (typeof module !== 'undefined' && module.exports) ? require('./scopes.js') : (typeof window !== 'undefined' ? window.NakiScopes : null);
  G.scopes = svg('<path d="M3 20h18M5 20V12M9 20V6M13 20V10M17 20V4"/>');
  // The frame at the playhead, with the colour look, as a small picture; the scope is worked out from it.
  function drawScopesNow(){
    var m = E.hooks && E.hooks.movie, cv = E.scopeCv; if (!NSC || !m || !cv || !m.videoWidth || m.readyState < 2) return;
    var sc = E.scopeSrc || (E.scopeSrc = document.createElement('canvas')); sc.width = 160; sc.height = Math.max(2, Math.round(160 * m.videoHeight / m.videoWidth));
    var g = sc.getContext('2d', { willReadFrequently: true });
    try { g.filter = String(E.lastFilter || 'none').replace(/url\([^)]*\)\s*/g, '').trim() || 'none'; } catch (e) {}
    g.drawImage(m, 0, 0, sc.width, sc.height); try { g.filter = 'none'; } catch (e) {}
    var px; try { px = g.getImageData(0, 0, sc.width, sc.height); } catch (e) { return; }
    var a = NSC.analyze(px.data, sc.width, sc.height), type = E.chip.scopes || 'hist', c = cv.getContext('2d');
    if (type === 'hist') NSC.drawHistogram(c, a, cv.width, cv.height); else NSC.drawWaveform(c, a, cv.width, cv.height, type === 'parade' ? 'parade' : 'luma');
  }
  function syncScopes(){
    if (E.panel !== 'scopes' || !E.scopeCv || !E.scopeCv.parentNode) return;
    var now = performance.now(); if (now - (E.scopeAt || 0) < 120) return; E.scopeAt = now;
    drawScopesNow();
  }
  PANELS.scopes = { title: 'Scopes', build: function (body){
    if (!NSC){ body.appendChild(mk('div', 'ed-hint', 'Scopes are not loaded. Add <script src="scopes.js"></script> to index.html, before editor.js.')); return; }
    var types = [{ key: 'hist', label: 'Histogram' }, { key: 'wave', label: 'Waveform' }, { key: 'parade', label: 'RGB parade' }], cur = chipKey('scopes', types, 'hist');
    body.appendChild(chips(types, cur, pickChip('scopes')));
    var cv = mk('canvas', 'ed-scopecv'); cv.width = 320; cv.height = 140; E.scopeCv = cv; E.scopeAt = 0; body.appendChild(cv);
    body.appendChild(mk('div', 'ed-hint', cur === 'hist' ? 'How much of the picture sits at each level, dark on the left, bright on the right. A pile against the left edge means crushed shadows; against the right, blown highlights.'
      : cur === 'wave' ? 'Left to right is the picture left to right; up is brighter. Keep the bright parts under the top and the dark parts above the bottom.' : 'Red, green and blue shown side by side. If one is higher than the others, the picture leans that colour.'));
    drawScopesNow();
  } };
  // ----- eyedropper: a small dropper next to every colour box -----
  function eyeFrame(g, W, H){
    var m = E.hooks.movie, s = P.sourceAt(E.proj, E.t), vc = s.video && s.video.clip;
    if (typeof previewFrame === 'function' && vc){ previewFrame(g, m, vc, W, H); return; }
    g.fillStyle = '#111b24'; g.fillRect(0, 0, W, H); if (m.videoWidth && m.readyState >= 2) g.drawImage(m, 0, 0, W, H);
  }
  function stopEyedrop(){ E.eye = null; if (E.ui.eyelayer) E.ui.eyelayer.style.display = 'none'; if (E.ui.eyering) E.ui.eyering.style.display = 'none'; }
  function startEyedrop(inp){
    if (E.eye){ stopEyedrop(); return; }
    var done = function (hex){ if (!hex) return; inp.value = hex; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); };
    if (typeof window !== 'undefined' && window.EyeDropper){   // desktop Chrome has its own
      try { new window.EyeDropper().open().then(function (r){ done(r.sRGBHex); }, function (){}); return; } catch (e) {}
    }
    var u = E.ui, lay = u.eyelayer;
    if (!lay){
      lay = u.eyelayer = mk('div', 'ed-eyelayer'); u.eyering = mk('div', 'ed-eyering'); lay.appendChild(u.eyering); u.stage.appendChild(lay);
      lay.addEventListener('pointerdown', function (ev){ if (!E.eye) return; ev.preventDefault(); try { lay.setPointerCapture(ev.pointerId); } catch (e) {} E.eye.drag = true; eyeAt(ev); });
      lay.addEventListener('pointermove', function (ev){ if (E.eye && E.eye.drag) eyeAt(ev); });
      lay.addEventListener('pointerup', function (ev){ if (!E.eye) return; var hx = eyeAt(ev), d = E.eye.done; stopEyedrop(); if (hx) d(hx); });
      lay.addEventListener('pointercancel', stopEyedrop);
    }
    E.eye = { done: done, drag: false }; lay.style.display = 'block';
    toast('Drag over the picture and let go to pick a colour. Tap the dropper again to cancel.', 5000);
  }
  // The colour of the picture under the pointer (average of a small square) as #rrggbb; moves the ring and fills it with that colour.
  function eyeAt(ev){
    var u = E.ui, r = u.picframe.getBoundingClientRect(), sr = u.stage.getBoundingClientRect(), W = Math.max(2, Math.round(r.width)), H = Math.max(2, Math.round(r.height));
    var fx = (ev.clientX - r.left) / (r.width || 1), fy = (ev.clientY - r.top) / (r.height || 1);
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1){ u.eyering.style.display = 'none'; return null; }
    var cv = E.eyeCv || (E.eyeCv = document.createElement('canvas')); cv.width = W; cv.height = H;
    var g = cv.getContext('2d', { willReadFrequently: true }); eyeFrame(g, W, H);
    var x = clamp(Math.round(fx * W) - 1, 0, W - 3), y = clamp(Math.round(fy * H) - 1, 0, H - 3), d;
    try { d = g.getImageData(x, y, 3, 3).data; } catch (e) { return null; }
    var rr = 0, gg = 0, bb = 0, k, hx = function (v){ var t = Math.round(v / 9).toString(16); return t.length < 2 ? '0' + t : t; };
    for (k = 0; k < d.length; k += 4){ rr += d[k]; gg += d[k + 1]; bb += d[k + 2]; }
    var col = '#' + hx(rr) + hx(gg) + hx(bb);
    u.eyering.style.display = 'block'; u.eyering.style.left = (ev.clientX - sr.left) + 'px'; u.eyering.style.top = (ev.clientY - sr.top) + 'px'; u.eyering.style.background = col;
    return col;
  }
  function addEyedroppers(){
    if (!E.ui.dock) return;
    var list = E.ui.dock.querySelectorAll('input[type=color]');
    for (var i = 0; i < list.length; i++){
      var inp = list[i]; if (inp._eye) continue; inp._eye = true;
      var b = btn(null, null, 'ed-ibtn ed-eyebtn', 'Pick a colour from the picture'); b.innerHTML = G.pick;
      b.onclick = (function (x){ return function (){ startEyedrop(x); }; })(inp);
      inp.parentNode.insertBefore(b, inp.nextSibling);
    }
  }

  /* ---------- motion tracker: an overlay, sticker or text follows something in the picture ---------- */
  var NTK = (typeof module !== 'undefined' && module.exports) ? require('./tracker.js') : (typeof window !== 'undefined' ? window.NakiTracker : null);
  G.track = svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>');
  function trackNeed(){ if (NTK) return true; toast('The tracker is not loaded. Add <script src="tracker.js"></script> to index.html, before editor.js.'); return false; }
  var TRK_COL = ['#ff9f1c', '#22d3ee', '#2bd96b', '#ff5db1', '#ffd400', '#a78bfa', '#ff3b3b', '#60a5fa'];
  function trackTargetOf(id){
    var f = id && P.findClip(E.proj, id); if (!f) return null;
    var k = f.track.kind, c = f.clip;
    if (k === 'overlay') return (c.gen && c.gen.full) ? null : { c: c, kind: 'overlay' };
    if (k === 'sticker') return { c: c, kind: 'sticker' };
    if (k === 'text') return { c: c, kind: 'text' };
    return null;
  }
  function trackTarget(){ return trackTargetOf(E.sel); }
  // where the target sits now, as frame fractions: overlays and stickers by their centre; a text by the middle of its first line
  function trackHere(tg){
    var rel = relNow(tg.c);
    if (tg.kind === 'text'){ var sh = NANIM.shiftOf(tg.c, rel); return { x: 0.5 + sh.x, y: (NP.TEXT_POS[tg.c.pos] != null ? NP.TEXT_POS[tg.c.pos] : 0.76) + 0.06 + sh.y }; }
    return { x: NANIM.valueOf(tg.c, tg.kind, 'x', rel), y: NANIM.valueOf(tg.c, tg.kind, 'y', rel) };
  }
  // every overlay, sticker or text keeps its own square, so several things can be placed before one tracking run
  function trackBegin(){
    var tg = trackTarget(); if (!tg) return null;
    E.trkSet = E.trkSet || {};
    var T = E.trkSet[tg.c.id];
    if (!T){ var s = trackHere(tg); T = E.trkSet[tg.c.id] = { id: tg.c.id, cx: clamp(s.x, 0.05, 0.95), cy: clamp(s.y, 0.05, 0.95), size: 0.12, mode: 'keep', marked: false }; }
    E.trk = T; return T;
  }
  function markedTracks(){
    return Object.keys(E.trkSet || {}).map(function (id){ return E.trkSet[id]; }).filter(function (T){ return T.marked && trackTargetOf(T.id); });
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
  // the squares: the selected one and every marked one, each in its own colour (only while the Track panel is open)
  function syncTrackBox(){
    var lay = E.ui.overlaylayer; if (!lay) return;
    var boxes = E.ui.trkboxes || (E.ui.trkboxes = {}), want = {};
    if (E.panel === 'track' && E.isOpen && E.trkSet){
      var act = trackTarget();
      Object.keys(E.trkSet).forEach(function (id, i){
        var T = E.trkSet[id], tg = trackTargetOf(id);
        if (!tg || !(T.marked || (act && act.c.id === id))) return;
        want[id] = true;
        var bx = boxes[id], col = TRK_COL[i % TRK_COL.length];
        if (!bx){
          bx = boxes[id] = mk('div');
          bx.style.cssText = 'position:absolute;box-sizing:border-box;border:2px solid #fff;border-radius:4px;box-shadow:0 0 0 1px rgba(0,0,0,.6);cursor:move;touch-action:none;pointer-events:auto;z-index:7;transform:translate(-50%,-50%)';
          var dot = mk('i'); dot.style.cssText = 'position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;pointer-events:none';
          var lab = mk('span'); lab.style.cssText = 'position:absolute;left:0;top:100%;margin-top:2px;font:600 10px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000;white-space:nowrap;pointer-events:none';
          bx.appendChild(dot); bx.appendChild(lab); bx.addEventListener('pointerdown', function (ev){ if (E.trkSet[id]) trkBoxDown(ev, E.trkSet[id]); });
        }
        if (bx.parentNode !== lay) lay.appendChild(bx);
        bx.style.borderColor = col; bx.firstChild.style.background = col; bx.lastChild.textContent = tg.kind === 'text' ? (tg.c.text || 'Text') : (tg.c.glyph || tg.kind);
        var px = Math.max(14, Math.round(T.size * (lay.clientHeight || 240)));
        bx.style.display = 'block'; bx.style.left = (T.cx * 100) + '%'; bx.style.top = (T.cy * 100) + '%'; bx.style.width = px + 'px'; bx.style.height = px + 'px';
      });
    }
    Object.keys(boxes).forEach(function (id){ if (!want[id]) boxes[id].style.display = 'none'; });
  }
  function trkBoxDown(ev, T){
    ev.preventDefault(); ev.stopPropagation();
    var r = E.ui.overlaylayer.getBoundingClientRect(), s = { x0: ev.clientX, y0: ev.clientY, cx: T.cx, cy: T.cy, w: r.width || 1, h: r.height || 1 };
    function mv(e){ T.cx = clamp(s.cx + (e.clientX - s.x0) / s.w, 0.02, 0.98); T.cy = clamp(s.cy + (e.clientY - s.y0) / s.h, 0.02, 0.98); syncTrackBox(); }
    function up(){ window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  // Follows every square in Ts in ONE pass over the video, then writes all the paths as ONE undo step.
  function runTrackBatch(Ts){
    var h = E.hooks;
    if (!trackNeed() || !Ts.length || (E.trkRun && E.trkRun.running)) return;
    if (!movieReady()){ toast('Choose the movie for this session first.'); return; }
    if (!E.frameDims || !E.frameDims.w){ toast('The movie is not ready yet. Try again in a moment.'); return; }
    var ref = trackInfoAt(E.t, null);
    if (!ref){ toast('Move the playhead to a moment where a video shows (not a gap).', 6000); return; }
    var src = (h.getAssetFile && h.getAssetFile(ref.asset)) || (ref.asset === 'movie' ? (h.movieUrl && h.movieUrl()) : (h.videoUrl && h.videoUrl(ref.asset)));
    if (!src){ toast('The video file for this part is not available here.', 6000); return; }
    var jobs = [], skipped = 0, lo = ref.ms, hi = ref.ms;
    Ts.forEach(function (T){
      var tg = trackTargetOf(T.id), c = tg && tg.c;
      if (!c || E.t < c.start || E.t >= c.start + c.dur){ skipped++; return; }
      var pm = ref.geo.toMovie(T.cx, T.cy);
      if (pm.u < -0.02 || pm.u > 1.02 || pm.v < -0.02 || pm.v > 1.02){ skipped++; return; }
      var rels = NTK.sampleTimes(c.dur), infos = rels.map(function (r){ return trackInfoAt(c.start + Math.min(r, c.dur - 1), ref.asset); });
      infos.forEach(function (i){ if (i){ lo = Math.min(lo, i.ms); hi = Math.max(hi, i.ms); } });
      var box = { cx: clamp(pm.u, 0.02, 0.98), cy: clamp(pm.v, 0.02, 0.98), size: clamp(T.size / (ref.geo.k * ref.geo.vh), 0.04, 0.5) }, isText = tg.kind === 'text';
      jobs.push({ id: c.id, key: c.start + '|' + c.dur, rels: rels, infos: infos, box: box, rp: ref.geo.toFrame(box.cx, box.cy), isText: isText, keep: isText || T.mode === 'keep',
        base: isText ? NANIM.shiftOf(c, relNow(c)) : trackHere(tg) });
    });
    if (!jobs.length){ toast('Each square needs its clip under the playhead, and the square on the picture itself (not on the bars).', 8000); return; }
    if (hi - lo < 200){ toast('There is not enough moving picture under these clips to follow anything.', 6000); return; }
    var sp = chipKey('trkSpeed', NTK.PRESETS, 'normal'), R = E.trkRun = { running: true, cancelled: false, msg: 'Starting...' };
    pause(); renderDock();
    function say(m){ R.msg = m; if (E.trkStatus) E.trkStatus.textContent = m; }
    NTK.analyze(src, { refMs: ref.ms, fromMs: lo, toMs: hi, boxes: jobs.map(function (j){ return j.box; }), preset: sp,
      onProgress: function (f){ say('Following ' + jobs.length + ' thing' + (jobs.length === 1 ? '' : 's') + '... ' + Math.round(f * 100) + '%'); }, isCancelled: function (){ return R.cancelled; } }).then(function (res){
      R.running = false;
      var q = E.hist.cur, done = 0, weak = 0;
      jobs.forEach(function (j, i){
        var f = P.findClip(q, j.id); if (!f || (f.clip.start + '|' + f.clip.dur) !== j.key) return;
        var r = res.results[i];
        var kf = NTK.toKeyframes(r.track, j.rels, j.infos, { keepMs: ref.ms, passes: NTK.preset(sp).passes, offX: j.keep ? j.base.x - j.rp.x : 0, offY: j.keep ? j.base.y - j.rp.y : 0, lo: j.isText ? -1 : 0, hi: 1 });
        var q2 = P.setTrackedPath(q, j.id, kf); if (q2 !== q){ q = q2; done++; }
        if (NTK.isPlain(r.texture) || r.lostFrac > 0.3) weak++;
      });
      if (q === E.hist.cur){ renderDock(); toast('Nothing was changed.'); return; }
      commit(q);
      toast('Tracked ' + done + '. Press play to check.' + (skipped ? ' ' + skipped + ' skipped (clip not under the playhead, or square off the picture).' : '') +
        (weak ? ' ' + weak + ' looked weak: use a bigger square on an edge or pattern, or try the Fast preset.' : ''), weak || skipped ? 10000 : 5000);
    }).catch(function (err){
      R.running = false; renderDock();
      if (R.cancelled || (err && err.cancelled)) toast('Tracking stopped.');
      else { console.error('tracking failed', err); toast('Tracking did not work' + (err && err.message ? ': ' + err.message : '') + '.', 9000); }
    });
  }
  PANELS.track = { title: 'Track motion', build: function (body){
    if (!NTK){ body.appendChild(mk('div', 'ed-hint', 'tracker.js is not loaded. Add <script src="tracker.js"></script> to index.html, before editor.js.')); return; }
    var tg = trackTarget(), T = trackBegin();
    if (!tg || !T){ body.appendChild(mk('div', 'ed-hint', 'Tap an overlay, sticker or text on the timeline first.')); return; }
    var R = E.trkRun, run = !!(R && R.running), c = tg.c, marked = markedTracks(), nAll = marked.length + (T.marked ? 0 : 1);
    body.appendChild(chips(NTK.PRESETS, chipKey('trkSpeed', NTK.PRESETS, 'normal'), pickChip('trkSpeed')));
    if (tg.kind !== 'text') body.appendChild(chips([{ key: 'keep', label: 'Keep my offset' }, { key: 'center', label: 'Centre on it' }], T.mode, function (k){ T.mode = k; renderDock(); }));
    body.appendChild(sliderRow('Square size', 5, 30, 1, Math.round(T.size * 100), pct, function (v){ T.size = v / 100; syncTrackBox(); }, function (v){ T.size = v / 100; syncTrackBox(); }));
    var st = mk('div', 'ed-hint', run ? R.msg : 'Put the playhead where every player or object is visible. Drag this square onto one, tap Mark, then pick the next label and do the same. Then Track all squares.');
    E.trkStatus = st; body.appendChild(st);
    body.appendChild(actions(run
      ? [{ id: 'edTrackStop', label: 'Stop', run: function (){ R.cancelled = true; } }]
      : [{ id: 'edTrackMark', label: T.marked ? 'Unmark this square' : 'Mark this square', on: !!T.marked, run: function (){ T.marked = !T.marked; renderDock(); } },
         { id: 'edTrackGo', label: 'Track this one', run: function (){ runTrackBatch([T]); } },
         { id: 'edTrackAll', label: 'Track all squares (' + nAll + ')', run: function (){ runTrackBatch(T.marked ? marked : marked.concat([T])); } },
         { id: 'edTrackClear', label: 'Remove tracking', run: function (){
           var q = P.clearTrackedPath(E.hist.cur, c.id, relNow(c));
           if (q === E.hist.cur) toast('There is no tracking on this.'); else commit(q); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Slow suits people walking and objects; Normal is the all-rounder; Fast suits sprints, cars and bikes (it searches much further and smooths less). Each label starts at the same spot, so drag each square onto its own player. A tracked label keeps its offset from the thing. If a square jumps to another player when they cross, Split the label after the crossing, move its square back and track that part again. Everything is ordinary keyframes, and one Undo takes back the whole batch.'));
  } };
  /* ---------- photos on the picture line: Add photo, Ken Burns, slideshow ---------- */
  G.photo = svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>');
  G.slides = svg('<rect x="3" y="6" width="13" height="11" rx="1.5"/><path d="M19 8v9M22 10v5"/>');
  (function (){
    if (typeof document === 'undefined' || !document.head) return;
    var s = document.createElement('style'); s.textContent = '.ed-photo{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;pointer-events:none}'; document.head.appendChild(s);
  })();
  function isPhotoClip(c){ var a = c && c.asset && E.proj && E.proj.assets[c.asset]; return !!(a && a.type === 'image'); }
  // The picture of a photo clip is an <img> inside the same box as the video. This returns something that looks enough like the video element
  // (videoWidth, videoHeight, style) for the picture layout code to place it.
  function photoEl(){
    var im = E.ui.photo;
    if (!im){
      im = E.ui.photo = mk('img', 'ed-photo'); im.draggable = false; im.alt = ''; im.style.display = 'none';
      im.onload = function (){ E.boxKey = null; E.lastTransform = ''; if (E.isOpen) syncMedia(); };
      E.ui.picbox.appendChild(im);
    }
    return { img: im, videoWidth: im.naturalWidth || 0, videoHeight: im.naturalHeight || 0, style: im.style };
  }
  // Shows the photo (and hides the video) while a photo clip is under the playhead, and puts the video back afterwards.
  function photoSync(photo, vc){
    var m = E.hooks && E.hooks.movie, im = E.ui.photo;
    if (!photo){
      if (E.photoOn){
        E.photoOn = false; if (im) im.style.display = 'none'; if (m) m.style.visibility = '';
        E.lastTransform = E.lastFilter = E.lastOpacity = ''; E.boxKey = null; E.boxMode = '';
      }
      return;
    }
    photoEl(); im = E.ui.photo;
    var url = E.hooks.videoUrl ? E.hooks.videoUrl(vc.asset) : '';
    if (url && im._src !== url){ im._src = url; im.src = url; E.boxKey = null; }
    if (!E.photoOn){
      E.photoOn = true; im.style.display = 'block'; if (m) m.style.visibility = 'hidden';
      E.lastTransform = E.lastFilter = E.lastOpacity = ''; E.boxKey = null; E.boxMode = '';
    }
  }
  function readPhoto(f){
    return new Promise(function (res){
      var u = URL.createObjectURL(f), im = new Image();
      im.onload = function (){ URL.revokeObjectURL(u); res({ file: f, name: f.name, kind: 'image', w: im.naturalWidth, h: im.naturalHeight }); };
      im.onerror = function (){ URL.revokeObjectURL(u); toast('The picture "' + f.name + '" could not be read. Use a JPG, PNG or WebP photo.', 7000); res(null); };
      im.src = u;
    });
  }
  // Opens the file chooser for photos; resolves a list of { file, name, w, h } (empty when nothing was chosen).
  function pickPhotos(multi){
    return new Promise(function (res){
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = !!multi;
      inp.onchange = function (){
        var l = [].slice.call(inp.files || []); if (!l.length) return res([]);
        Promise.all(l.map(readPhoto)).then(function (a){ res(a.filter(Boolean)); });
      };
      inp.addEventListener('cancel', function (){ res([]); });
      inp.click();
    });
  }
  function addPhotoFromFile(){
    if (!E.hooks.setVideoFile){ toast('Adding photos is not available here.'); return; }
    pause();
    pickPhotos(false).then(function (list){
      var info = list[0]; if (!info) return;
      var out = {}, q = P.addPhotoClip(E.hist.cur, info, out);
      if (q === E.hist.cur){ toast('That photo could not be added.'); return; }
      E.hooks.setVideoFile(out.asset, info.file);
      var nf = P.findClip(q, out.id); if (nf) E.t = nf.clip.start;
      E.sel = out.id; commit(q); openPanel('photo', 'edit');
      toast('Photo added at the end of the picture row, 3 seconds long. Set its length and a Ken Burns movement here.', 6000);
    });
  }
  // o = { dur (ms per photo), kb (Ken Burns on), trans (transition key or 'none') }. The photos you choose go after the last picture clip, one after another.
  function buildSlideshow(o){
    if (!E.hooks.setVideoFile){ toast('Adding photos is not available here.'); return; }
    pause();
    pickPhotos(true).then(function (list){
      if (!list.length) return;
      var q = E.hist.cur, KB = ['zoomin', 'panright', 'zoomout', 'panleft'], firstId = null, n = 0;
      list.forEach(function (info){
        var out = {}, q2 = P.addPhotoClip(q, info, out, o.dur);
        if (q2 === q) return;
        E.hooks.setVideoFile(out.asset, info.file); q = q2; n++;
        if (!firstId) firstId = out.id;
        if (o.kb) q = P.setMotionPreset(q, out.id, KB[(n - 1) % KB.length]);
        if (o.trans !== 'none' && n > 1) q = P.setTransition(q, out.id, { type: o.trans, durMs: 600 });
      });
      if (!n){ toast('None of those photos could be added.'); return; }
      var f0 = P.findClip(q, firstId); if (f0) E.t = f0.clip.start;
      E.sel = firstId; commit(q); closePanel();
      toast(n + ' photo' + (n === 1 ? '' : 's') + ' added after the last clip, ' + (o.dur / 1000) + ' s each.' + (n < list.length ? ' ' + (list.length - n) + ' could not be added.' : '') + ' Undo takes them all back.', 8000);
    });
  }
  PANELS.photo = { title: 'Photo', build: function (body){
    var c = targetVideo();
    if (!c || c.type !== 'freeze' || !isPhotoClip(c)){ body.appendChild(mk('div', 'ed-hint', 'Tap a photo on the picture row first (Add photo puts one there).')); return; }
    body.appendChild(chips([2000, 3000, 5000, 8000].map(function (v){ return { key: v, label: secs(v) }; }), c.dur, function (k){ var q = P.setPhotoDuration(E.hist.cur, c.id, k); if (q === E.hist.cur) renderDock(); else commit(q); }));
    body.appendChild(sliderRow('Length', 500, 15000, 100, Math.min(15000, c.dur), secs, null, function (v){ commit(P.setPhotoDuration(E.hist.cur, c.id, v)); }));
    if (NMO){
      var cur = (E.chip.motion && E.chip.motion.id === c.id) ? E.chip.motion.key : 'none';
      body.appendChild(mk('div', 'ed-hint', 'Ken Burns movement:'));
      body.appendChild(chips(NMO.PICTURE_PRESETS, cur, function (k){ E.chip.motion = { id: c.id, key: k }; commit(P.setMotionPreset(E.hist.cur, c.id, k)); seek(c.start); }));
    }
    body.appendChild(actions([{ id: 'edPhotoTrans', label: 'Transition', run: function (){ openPanel('transition'); } }, { id: 'edPhotoZoom', label: 'Zoom / pan', run: function (){ openPanel('frame'); } }]));
    body.appendChild(mk('div', 'ed-hint', 'A photo is an ordinary picture clip with no sound: drag its ends to change how long it shows, Split it, add a Transition from the clip before it, and use Adjust, Filters, Zoom and Fade on it. Ken Burns is a slow zoom or pan made of zoom keyframes; Length stretches it. Press play to see it.'));
  } };
  PANELS.slideshow = { title: 'Slideshow', build: function (body){
    var o = E.chip.show || (E.chip.show = { dur: 3000, kb: true, trans: 'fade' });
    body.appendChild(chips([2000, 3000, 4000, 6000].map(function (v){ return { key: v, label: secs(v) + ' each' }; }), o.dur, function (k){ o.dur = k; renderDock(); }));
    body.appendChild(chips([{ key: 'kb', label: 'Ken Burns zoom' }, { key: 'still', label: 'Still photos' }], o.kb ? 'kb' : 'still', function (k){ o.kb = k === 'kb'; renderDock(); }));
    body.appendChild(chips([{ key: 'none', label: 'No transition' }, { key: 'fade', label: 'Fade' }, { key: 'fadeblack', label: 'Dip to black' }, { key: 'slideleft', label: 'Slide' }, { key: 'zoomin', label: 'Zoom' }], o.trans, function (k){ o.trans = k; renderDock(); }));
    body.appendChild(actions([{ id: 'edShowGo', label: 'Choose photos', run: function (){ buildSlideshow(o); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Choose several photos at once. They are added one after another at the end of the picture row, each with the length, Ken Burns movement and transition you picked here. Afterwards every photo is an ordinary clip you can shorten, move or change. Add music under Audio, and Beat sync can fit the photos to it. Naki starts from a movie, so the photos go after it; delete the movie part first if you want only photos.'));
  } };

  /* ---------- titles drawn over the preview ---------- */
  // ----- format and background (the shape of the video, and what fills the space around the picture) -----
  function frameAspect(){
    var f = E.proj && E.proj.format;
    return (NF && f) ? (NF.ratioValue(f.ratio) || 0) : 0;
  }
  function resetBox(m){
    var u = E.ui;
    u.picbox.style.left = u.picbox.style.top = '0'; u.picbox.style.width = u.picbox.style.height = '100%';
    m.style.position = ''; m.style.left = m.style.top = ''; m.style.width = m.style.height = ''; m.style.transformOrigin = ''; u.picbox.style.overflow = '';
  }
  // The picture's CSS transform. With the original shape it is exactly what it was. With any other shape the picture is fitted inside the
  // frame (space around it) and zoom / turn / flip happen inside that picture, the way the export does it.
  function framePicture(t, m, crop){
    var u = E.ui, fr = frameAspect(), W = u.picframe.clientWidth, H = u.picframe.clientHeight;
    if (crop && W && H && m.videoWidth && NF && NF.containLayout){
      // crop first, then flip / turn / zoom, then the cropped piece is fitted inside the frame (bars when the shape differs), like the export
      var cw = m.videoWidth * crop.w, ch = m.videoHeight * crop.h, CL = NF.containLayout(t, W, H, cw, ch);
      var ckey = ['c', W, H, m.videoWidth, m.videoHeight, CL.rot, crop.x, crop.y, crop.w, crop.h].join('|');
      if (E.boxKey !== ckey){
        var cb = CL.box, fw = CL.dw / crop.w, fh = CL.dh / crop.h, ccx = crop.x + crop.w / 2, ccy = crop.y + crop.h / 2;
        u.picbox.style.left = cb.x + 'px'; u.picbox.style.top = cb.y + 'px'; u.picbox.style.width = cb.w + 'px'; u.picbox.style.height = cb.h + 'px'; u.picbox.style.overflow = 'hidden';
        m.style.position = 'absolute'; m.style.width = fw + 'px'; m.style.height = fh + 'px';
        m.style.left = (cb.w / 2 - ccx * fw) + 'px'; m.style.top = (cb.h / 2 - ccy * fh) + 'px';
        m.style.transformOrigin = (ccx * 100) + '% ' + (ccy * 100) + '%';
        E.boxKey = ckey; E.boxMode = 'contain';
      }
      return 'translate(' + CL.panX + 'px,' + CL.panY + 'px) scale(' + CL.zoom + ') rotate(' + CL.rot + 'deg)' + (CL.flip ? ' scaleX(-1)' : '');
    }
    if (!fr || !W || !H || !m.videoWidth || !NF){
      if (E.boxMode !== 'plain'){ resetBox(m); E.boxMode = 'plain'; E.boxKey = null; }
      return transformCss(t, (m.videoWidth && m.videoHeight) ? m.videoWidth / m.videoHeight : 16 / 9);
    }
    var L = NF.containLayout(t, W, H, m.videoWidth, m.videoHeight), key = [W, H, m.videoWidth, m.videoHeight, L.rot].join('|');
    if (E.boxKey !== key){
      var b = L.box;
      u.picbox.style.left = b.x + 'px'; u.picbox.style.top = b.y + 'px'; u.picbox.style.width = b.w + 'px'; u.picbox.style.height = b.h + 'px';
      m.style.position = 'absolute'; m.style.left = ((b.w - L.dw) / 2) + 'px'; m.style.top = ((b.h - L.dh) / 2) + 'px'; m.style.width = L.dw + 'px'; m.style.height = L.dh + 'px';
      m.style.transformOrigin = ''; u.picbox.style.overflow = ''; E.boxKey = key; E.boxMode = 'contain';
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
    var s = P.sourceAt(E.proj, E.t), vc = s.video && s.video.clip, css = framePicture(vc && !E.cropOn ? vc.transform : null, m, vc && !E.cropOn ? vc.crop : null);
    if (E.photoOn){ E.lastTransform = ''; E.boxKey = null; E.boxMode = ''; } else { E.lastTransform = vc ? css : ''; m.style.transform = vc ? css : ''; }
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
  // ----- stickers on the preview -----
  function selSticker(){ var f = E.sel && P.findClip(E.proj, E.sel); return f && f.clip.sticker ? f.clip : null; }
  function addStickerHere(glyph){
    var out = {}, q = P.addSticker(E.hist.cur, Math.round(E.t), 3000, glyph, out);
    if (q === E.hist.cur){ toast('There is no room for a sticker at the playhead.'); return; }
    E.sel = out.id; commit(q); openPanel('stickeredit', 'sticker');
  }
  // The stickers that show at the playhead are small boxes over the picture. Drag one to move it.
  function syncStickers(){
    var layer = E.ui.stickerlayer; if (!layer || !E.proj || !E.proj.tracks) return;
    if (!E.stickerEls) E.stickerEls = {};
    var list = P.stickersAt(E.proj, E.t), want = {}, H = layer.clientHeight || 240;
    list.forEach(function (c){
      want[c.id] = true;
      var d = E.stickerEls[c.id];
      if (!d){ d = E.stickerEls[c.id] = mk('div', 'ed-stk'); d.dataset.id = c.id; d.addEventListener('pointerdown', stickerDown); layer.appendChild(d); }
      if (d._g !== c.glyph){ d.textContent = c.glyph; d._g = c.glyph; }
      d.style.left = (NANIM.valueOf(c, 'sticker', 'x', E.t - c.start) * 100) + '%'; d.style.top = (NANIM.valueOf(c, 'sticker', 'y', E.t - c.start) * 100) + '%'; d.style.fontSize = Math.round(c.size * H) + 'px';
      d.style.transform = 'translate(-50%,-50%) rotate(' + (c.rot || 0) + 'deg)';
      d.style.color = (NSTK && NSTK.isSymbol(c.glyph)) ? (c.color || '#ffffff') : '#ffffff';
      d.classList.toggle('sel', c.id === E.sel);
    });
    Object.keys(E.stickerEls).forEach(function (id){ if (!want[id]){ E.stickerEls[id].remove(); delete E.stickerEls[id]; } });
  }
  function stickerDown(ev){
    var id = ev.currentTarget.dataset.id, f = P.findClip(E.proj, id); if (!f) return;
    ev.preventDefault(); ev.stopPropagation();
    if (E.sel !== id){ E.sel = id; renderTimeline(); syncDock(); }
    var r = E.ui.stickerlayer.getBoundingClientRect(), c = f.clip, st = { x0: ev.clientX, y0: ev.clientY, cx: NANIM.valueOf(c, 'sticker', 'x', relNow(c)), cy: NANIM.valueOf(c, 'sticker', 'y', relNow(c)), w: r.width || 1, h: r.height || 1, moved: false };
    function at(e){ var q = P.setAnimated(E.hist.cur, id, 'x', st.cx + (e.clientX - st.x0) / st.w, relNow(c)); return P.setAnimated(q, id, 'y', st.cy + (e.clientY - st.y0) / st.h, relNow(c)); }
    function mv(e){ st.moved = true; live(at(e)); }
    function up(e){
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (st.moved) commit(at(e));
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  // ----- transitions in the preview -----
  // Inside a transition the other picture is shown in a second, muted video laid over the first. The preview shows a fade (or a dip through
  // black); the exported video has the real wipe, slide, zoom or circle.
  function syncTransition(m, s, vc){
    var x = E.ui.xvid; if (!x) return;
    var tr = (E.proj && E.proj.tracks && movieReady()) ? P.transitionAt(E.proj, E.t) : null;
    if (!tr){ if (E.xOn){ x.style.display = 'none'; try { x.pause(); } catch (e) {} E.xOn = false; } return; }
    var oth = tr.before ? tr.b : tr.a;
    if (E.photoOn || (oth.asset || 'movie') !== ((vc && vc.asset) || 'movie')){ if (E.xOn){ x.style.display = 'none'; try { x.pause(); } catch (e) {} E.xOn = false; } return; }   // the preview can only blend two pictures from the same file; the export has the real transition
    var other = tr.before ? tr.b : tr.a, want = (tr.before ? tr.bMs : tr.aMs) / 1000, p = tr.p;
    if (!E.xOn){ x.style.display = 'block'; E.xOn = true; }
    var src = m.currentSrc || m.src;
    if (src && x.getAttribute('data-src') !== src){ x.setAttribute('data-src', src); x.src = src; x.muted = true; }
    ['position', 'left', 'top', 'width', 'height'].forEach(function (k){ if (x.style[k] !== m.style[k]) x.style[k] = m.style[k]; });
    try { x.playbackRate = other.speed || 1; } catch (e) {}
    if (E.playing && other.type === 'video'){
      if (x.paused){ x.currentTime = want; var pr = x.play(); if (pr && pr.catch) pr.catch(function (){}); }
      else if (Math.abs(x.currentTime - want) > 0.3) x.currentTime = want;
    } else {
      if (!x.paused) x.pause();
      if (Math.abs(x.currentTime - want) > 0.04) x.currentTime = want;
    }
    var cl = function (v){ return Math.max(0, Math.min(1, v)); }, base = vc && vc.opacity != null ? vc.opacity : 1, mainOp = 1, xOp;
    if (tr.type === 'fadeblack'){ var a = cl(1 - 2 * p), b = cl(2 * p - 1); mainOp = tr.before ? a : b; xOp = tr.before ? b : a; }
    else xOp = tr.before ? p : 1 - p;
    m.style.opacity = String(base * mainOp); E.lastOpacity = '#transition'; x.style.opacity = String(xOp);
  }
  // ----- overlays and keyframes -----
  var KF_LABEL = { x: 'Left / right', y: 'Up / down', size: 'Size', rot: 'Turn', opacity: 'Opacity', zoom: 'Zoom' };
  function selOverlay(){ var f = E.sel && P.findClip(E.proj, E.sel); return f && f.track.kind === 'overlay' ? f.clip : null; }
  function relNow(c){ return Math.max(0, Math.min(Math.round(c.dur), Math.round(E.t - c.start))); }
  // ----- adding another video to the picture line -----
  function addVideoFromFile(){
    if (!E.hooks.pickVideo || !E.hooks.setVideoFile){ toast('Adding videos is not available here.'); return; }
    pause();
    Promise.resolve(E.hooks.pickVideo()).then(function (info){
      if (!info) return;
      var out = {}, q = P.addVideoClip(E.hist.cur, info, out);
      if (q === E.hist.cur){ toast('That video could not be added.'); return; }
      E.hooks.setVideoFile(out.asset, info.file);
      var nf = P.findClip(q, out.id); if (nf) E.t = nf.clip.start;   // show it, so the tools that follow work on what you see
      E.sel = out.id; commit(q); toast('Video added at the end of the picture. Split, trim or change it like any other clip.');
    });
  }
  // The preview has one video element. A clip that comes from another file (one added with Add video) swaps the file it shows.
  // Returns false when the file for that clip is missing.
  function resyncMedia(){ if (!E.isOpen) return; E.curAsset = ''; E.lastTransform = ''; E.boxKey = null; syncMedia(); }
  function swapSource(asset, m){
    var url = asset === 'movie' ? (E.hooks.movieUrl && E.hooks.movieUrl()) : (E.hooks.videoUrl && E.hooks.videoUrl(asset));
    if (!url) return false;
    E.curAsset = asset; E.lastTransform = ''; E.boxKey = null; E.lastFilter = '';
    m.style.objectFit = asset === 'movie' ? '' : 'contain';
    if (m.src === url || m.currentSrc === url) return true;
    E.swapping = true;
    try { m.pause(); } catch (e) {}
    var done = function (){ m.removeEventListener('loadedmetadata', done); m.removeEventListener('error', done); E.swapping = false; layoutTextLayer(); if (E.isOpen) syncMedia(); };
    m.addEventListener('loadedmetadata', done); m.addEventListener('error', done);
    m.src = url; m.load();
    return true;
  }
  function addOverlayFromFile(){
    if (!E.hooks.pickOverlay || !E.hooks.setOverlayFile){ toast('Overlays are not available here.'); return; }
    pause();
    Promise.resolve(E.hooks.pickOverlay()).then(function (info){
      if (!info) return;
      var out = {}, q = P.addOverlay(E.hist.cur, Math.round(E.t), info, out);
      if (q === E.hist.cur){ toast('There is no room for an overlay at the playhead.'); return; }
      E.hooks.setOverlayFile(out.asset, info.file);
      E.sel = out.id; commit(q); openPanel('overlayedit', 'overlay');
    });
  }
  // The overlays that show at the playhead: a picture or a video over the main picture. Drag one to move it.
  function syncOverlays(){
    var layer = E.ui.overlaylayer; if (!layer || !E.proj || !E.proj.tracks || !NANIM) return;
    if (!E.overlayEls) E.overlayEls = {};
    var list = P.overlaysAt(E.proj, E.t), want = {};
    list.forEach(function (c){
      var url = (E.hooks.overlayUrl && !c.gen) ? E.hooks.overlayUrl(c.asset) : '', isImg = c.type === 'freeze';
      want[c.id] = true;
      var d = E.overlayEls[c.id];
      if (!d){
        d = E.overlayEls[c.id] = mk(c.gen ? 'canvas' : (isImg ? 'img' : 'video'), 'ed-ovl'); d.dataset.id = c.id; d.draggable = false;
        if (!isImg){ d.muted = true; d.setAttribute('playsinline', ''); d.preload = 'auto'; }
        d.addEventListener('pointerdown', overlayDown); layer.appendChild(d);
      }
      if (url && d._src !== url){ d._src = url; d.src = url; }
      if (c.gen && NFX && NFX.gen) paintGen(d, c);
      var s = NANIM.overlayState(c, E.t - c.start);
      d.style.left = (s.x * 100) + '%'; d.style.top = (s.y * 100) + '%'; d.style.width = (s.size * 100) + '%';
      d.style.transform = 'translate(-50%,-50%) rotate(' + s.rot + 'deg)'; d.style.opacity = String(s.opacity);
      applyOverlayFx(d, c);
      d.classList.toggle('sel', c.id === E.sel);
      if (!isImg && url){
        var at = ((c.in || 0) + (E.t - c.start) * (c.speed || 1)) / 1000;
        if (E.playing){
          if (d.paused){ d.currentTime = at; var pr = d.play(); if (pr && pr.catch) pr.catch(function (){}); }
          else if (Math.abs(d.currentTime - at) > 0.3) d.currentTime = at;
        } else {
          if (!d.paused) d.pause();
          if (Math.abs(d.currentTime - at) > 0.04) d.currentTime = at;
        }
      }
    });
    Object.keys(E.overlayEls).forEach(function (id){
      if (!want[id]){ var d = E.overlayEls[id]; try { if (d.pause) d.pause(); } catch (e) {} if (d._cv) d._cv.remove(); d.remove(); delete E.overlayEls[id]; }
    });
  }
  // The blend mode, the mask and the chroma key of an overlay, on the preview. With a mask or a key, the picture or video is drawn on a canvas laid exactly
  // where it is (the picture itself is hidden); it is keyed and cut with the same maths as the fast export.
  function keyOverlayFrame(d){
    var cv = d._cv; if (!cv || !NFX || !(d._ch || d._mk)) return;
    var w = d.videoWidth || d.naturalWidth || (d.getContext ? d.width : 0), h = d.videoHeight || d.naturalHeight || (d.getContext ? d.height : 0); if (!w || !h) return;
    var sc = Math.min(1, 480 / w), cw = Math.max(1, Math.round(w * sc)), chh = Math.max(1, Math.round(h * sc));
    if (cv.width !== cw) cv.width = cw;
    if (cv.height !== chh) cv.height = chh;
    var fk = JSON.stringify([d._ch, d._mk]) + '|' + cw + 'x' + chh + '|' + (d.currentSrc || d.src || ''), kind = d.tagName;
    if ((kind === 'IMG' || kind === 'VIDEO') && d._fk === fk && (kind === 'IMG' || d._ft === d.currentTime)) return;
    d._fk = fk; d._ft = d.currentTime;
    try { NFX.fxInto(cv, d, { chroma: d._ch, mask: d._mk, fast: true }); } catch (e) {}
  }
  function applyOverlayFx(d, c){
    var show = d, ch = NFX && c.chroma ? NFX.cleanChroma(c.chroma) : null, mkk = NFX && c.mask ? NFX.cleanMask(c.mask) : null;
    if (ch || mkk){
      var cv = d._cv;
      if (!cv){
        cv = d._cv = mk('canvas', 'ed-ovl'); cv.dataset.id = c.id; cv.addEventListener('pointerdown', overlayDown);
        ['load', 'loadeddata', 'seeked'].forEach(function (ev){ d.addEventListener(ev, function (){ d._fk = null; if (d._cv) keyOverlayFrame(d); }); });
        d.parentNode.appendChild(cv);
      }
      d._ch = ch; d._mk = mkk; keyOverlayFrame(d);
      ['left', 'top', 'width', 'transform', 'opacity'].forEach(function (k){ cv.style[k] = d.style[k]; });
      d.style.visibility = 'hidden'; d.style.pointerEvents = 'none'; show = cv;
    } else if (d._cv){
      d._cv.remove(); d._cv = null; d._ch = null; d._mk = null; d._fk = null; d.style.visibility = ''; d.style.pointerEvents = '';
    }
    if (show !== d) show.classList.toggle('sel', c.id === E.sel);
    var bl = NFX ? NFX.cssBlend(c.blend) : 'normal';
    show.style.mixBlendMode = bl === 'normal' ? '' : bl; show.style.clipPath = '';
  }
  function pauseOverlays(){ Object.keys(E.overlayEls || {}).forEach(function (id){ try { if (E.overlayEls[id].pause) E.overlayEls[id].pause(); } catch (e) {} }); }
  function removeOverlays(){ Object.keys(E.overlayEls || {}).forEach(function (id){ try { if (E.overlayEls[id].pause) E.overlayEls[id].pause(); } catch (e) {} if (E.overlayEls[id]._cv) E.overlayEls[id]._cv.remove(); E.overlayEls[id].remove(); }); E.overlayEls = {}; }
  function overlayDown(ev){
    var id = ev.currentTarget.dataset.id, f = P.findClip(E.proj, id); if (!f) return;
    ev.preventDefault(); ev.stopPropagation();
    if (E.sel !== id){ E.sel = id; renderTimeline(); syncDock(); }
    if (f.clip.gen && f.clip.gen.full) return dragGenCenter(f.clip, ev);
    var r = E.ui.overlaylayer.getBoundingClientRect(), c = f.clip, s0 = NANIM.overlayState(c, E.t - c.start), st = { x0: ev.clientX, y0: ev.clientY, w: r.width || 1, h: r.height || 1, moved: false };
    function at(e){
      var q = P.setAnimated(E.hist.cur, id, 'x', s0.x + (e.clientX - st.x0) / st.w, relNow(c));
      return P.setAnimated(q, id, 'y', s0.y + (e.clientY - st.y0) / st.h, relNow(c));
    }
    function mv(e){ st.moved = true; live(at(e)); }
    function up(e){
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (st.moved) commit(at(e));
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  // The diamond: puts a keyframe on this property at the playhead, or takes the one that is there away. Change the value at another moment and it
  // moves smoothly between the keyframes.
    // ----- the easing graph: how a value moves from the keyframe at the playhead to the next one -----
  function easeBlock(c, prop, all){
    var info = NANIM && P.keyframeEase(E.hist.cur, c.id, prop, relNow(c)); if (!info) return null;
    var box = mk('div', 'ed-easebox');
    if (!info.hasNext){ box.appendChild(mk('div', 'ed-hint', 'This is the last keyframe, so there is nothing after it to ease into.')); return box; }
    var set = function (e){ var q = all ? P.setKeyframeEaseAll(E.hist.cur, c.id, relNow(c), e) : P.setKeyframeEase(E.hist.cur, c.id, prop, relNow(c), e); if (q === E.hist.cur) renderDock(); else commit(q); };
    var bz = NANIM.bezierOf(info.ease), name = NANIM.easeName(info.ease), list = NANIM.EASES.map(function (x){ return { key: x.key, label: x.label }; });
    if (name === 'custom') list.push({ key: 'custom', label: 'Custom' });
    box.appendChild(mk('div', 'ed-hint', 'How it moves from this keyframe to the next:'));
    box.appendChild(chips(list, name, function (k){ if (k !== 'custom') set(k); }));
    if (name === 'hold'){ box.appendChild(mk('div', 'ed-hint', 'Hold keeps the value still until the next keyframe, then jumps to it.')); return box; }
    var NS = 'http://www.w3.org/2000/svg', svg0 = document.createElementNS(NS, 'svg'), X0 = 16, X1 = 124, Y0 = 12, Y1 = 118;
    svg0.setAttribute('viewBox', '0 0 140 130'); svg0.setAttribute('class', 'ed-ease'); svg0.setAttribute('role', 'img'); svg0.setAttribute('aria-label', 'Easing curve');
    var px = function (x){ return X0 + x * (X1 - X0); }, py = function (y){ return Y1 - y * (Y1 - Y0); };
    var node = function (tag, attrs){ var e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k){ e.setAttribute(k, attrs[k]); }); return e; };
    var draw = function (){
      while (svg0.firstChild) svg0.removeChild(svg0.firstChild);
      svg0.appendChild(node('rect', { x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0, 'class': 'ed-ezbox' }));
      svg0.appendChild(node('line', { x1: px(0), y1: py(0), x2: px(1), y2: py(1), 'class': 'ed-ezdiag' }));
      svg0.appendChild(node('line', { x1: px(0), y1: py(0), x2: px(bz[0]), y2: py(bz[1]), 'class': 'ed-ezh' }));
      svg0.appendChild(node('line', { x1: px(1), y1: py(1), x2: px(bz[2]), y2: py(bz[3]), 'class': 'ed-ezh' }));
      var d = ''; for (var i = 0; i <= 40; i++){ var f = i / 40; d += (i ? 'L' : 'M') + px(f).toFixed(1) + ' ' + py(NANIM.easeProgress(bz, f)).toFixed(1); }
      svg0.appendChild(node('path', { d: d, 'class': 'ed-ezpath' }));
      svg0.appendChild(node('circle', { cx: px(bz[0]), cy: py(bz[1]), r: 7, 'class': 'ed-ezdot' })); svg0.appendChild(node('circle', { cx: px(bz[2]), cy: py(bz[3]), r: 7, 'class': 'ed-ezdot' }));
    };
    var drag = -1, where = function (ev){ var r = svg0.getBoundingClientRect(), s = 140 / (r.width || 140); return { x: (ev.clientX - r.left) * s, y: (ev.clientY - r.top) * s }; };
    svg0.addEventListener('pointerdown', function (ev){
      var p = where(ev), d1 = Math.hypot(px(bz[0]) - p.x, py(bz[1]) - p.y), d2 = Math.hypot(px(bz[2]) - p.x, py(bz[3]) - p.y);
      if (Math.min(d1, d2) > 22) return;
      drag = d1 <= d2 ? 0 : 1; try { svg0.setPointerCapture(ev.pointerId); } catch (e) {} ev.preventDefault();
    });
    svg0.addEventListener('pointermove', function (ev){
      if (drag < 0) return; var p = where(ev);
      bz[drag * 2] = clamp((p.x - X0) / (X1 - X0), 0, 1); bz[drag * 2 + 1] = clamp((Y1 - p.y) / (Y1 - Y0), 0, 1); draw();
    });
    var letGo = function (){ if (drag < 0) return; drag = -1; set(bz.slice()); };
    svg0.addEventListener('pointerup', letGo); svg0.addEventListener('pointercancel', letGo);
    draw(); box.appendChild(svg0);
    box.appendChild(mk('div', 'ed-hint', 'Drag the two dots. Up and to the left makes it start fast; down and to the right makes it start slowly. The preview and the export follow the curve.'));
    return box;
  }
  function keyframeActions(c, prop){
    var has = P.hasKeyframe(E.hist.cur, c.id, prop, relNow(c)), any = !!(c.kf && c.kf[prop]);
    var list = [{ id: 'edKeyframe', label: has ? '\u25c6 Remove keyframe' : '\u25c7 Add keyframe', on: has, run: function (){ commit(P.toggleKeyframe(E.hist.cur, c.id, prop, relNow(c))); } }];
    if (any) list.push({ id: 'edKeyframeClear', label: 'Clear keyframes', run: function (){ commit(P.clearKeyframes(E.hist.cur, c.id, prop, relNow(c))); } });
    var acts = actions(list), ez = easeBlock(c, prop);
    if (!ez) return acts;
    var wrap = mk('div'); wrap.appendChild(acts); wrap.appendChild(ez); return wrap;
  }
    // ----- shapes, arrows, spotlights and frames (they live on the overlay rows) -----
  G.crop = svg('<path d="M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14"/>');
  G.stabilize = svg('<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M7 12c1.5-2 3-2 4.5 0s3 2 4.5 0"/>');
  G.still = svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>');
  G.reframe = svg('<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3"/><circle cx="12" cy="12" r="2.6"/>');
  G.shape = svg('<rect x="4" y="4" width="10" height="10" rx="1.5"/><circle cx="15.5" cy="15.5" r="4.5"/>');
  G.arrow = svg('<path d="M4 12h15M13 6l6 6-6 6"/>');
  G.spot = svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>');
  G.frame = svg('<rect x="3" y="4" width="18" height="16" rx="1.5"/><rect x="7" y="8" width="10" height="8" rx="1"/>');
  G.rembg = svg('<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0113 0"/><path d="M3 3l2 2M21 3l-2 2M3 21l2-2M21 21l-2-2"/>');
  function selGen(){ var c = selOverlay(); return c && c.gen ? c : null; }
  function addGenHere(gen){
    var out = {}, q = P.addGen(E.hist.cur, Math.round(E.t), gen, out);
    if (q === E.hist.cur){ toast('There is no room for that at the playhead.'); return; }
    E.sel = out.id; commit(q); openPanel('genedit', 'overlay');
  }
  // Draws a generated overlay onto its canvas in the preview (again only when something about it changed).
  function paintGen(d, c){
    var g = c.gen, lay = E.ui.overlaylayer, w, h;
    if (g.full){ var lw = lay.clientWidth || 480, lh = lay.clientHeight || 270, sc = Math.min(1, (g.kind === 'spotlight' ? 360 : 720) / lw); w = Math.max(2, Math.round(lw * sc)); h = Math.max(2, Math.round(lh * sc)); }
    else { w = 640; h = Math.max(2, Math.round(640 * (g.ar || 1))); }
    var key = JSON.stringify(g) + '|' + w + 'x' + h;
    if (d._gk !== key){ d._gk = key; if (d.width !== w) d.width = w; if (d.height !== h) d.height = h; NFX.gen.draw(d.getContext('2d'), g, w, h); }
    d.style.pointerEvents = (g.full && !(g.kind === 'spotlight' && c.id === E.sel)) ? 'none' : '';   // a frame never blocks taps; a selected spotlight can be dragged
  }
  // Dragging a selected spotlight moves its hole.
  function dragGenCenter(c, ev){
    var g = c.gen; if (g.kind !== 'spotlight') return;
    var r = E.ui.overlaylayer.getBoundingClientRect(), st = { x0: ev.clientX, y0: ev.clientY, cx: g.cx, cy: g.cy, w: r.width || 1, h: r.height || 1, moved: false };
    function at(e){ return P.setGenProps(E.hist.cur, c.id, { cx: st.cx + (e.clientX - st.x0) / st.w, cy: st.cy + (e.clientY - st.y0) / st.h }); }
    function mv(e){ st.moved = true; live(at(e)); }
    function up(e){
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (st.moved) commit(at(e));
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
    // Puts the voice enhance setting (or "off") into the preview's sound chain.
  function applyVoiceFx(){
    var fx = E.voiceFx; if (!fx || !NFX || !NFX.voice || !E.proj) return;
    var vt = E.proj.tracks.filter(function (t){ return t.role === 'voice'; })[0], e = vt && vt.enhance ? vt.enhance : null, key = e ? e.preset + '|' + e.amount : '';
    if (fx._k === key) return; fx._k = key;
    NFX.voice.setNodes(fx, e, P.voiceFloorDb(E.hist.cur));
  }
    // The parts of an effect's preview that are not a filter or a transform on the picture: a colour wash or pattern, cinema bars, and a note for effects the preview cannot show.
  function applyFxExtras(r){
    var u = E.ui, pf = u.picframe; if (!pf || !r) return;
    if (!u.fxtint){
      var base = 'position:absolute;pointer-events:none;display:none;z-index:3;';
      u.fxtint = mk('div'); u.fxtint.style.cssText = base + 'inset:0';
      u.fxbarT = mk('div'); u.fxbarT.style.cssText = base + 'left:0;right:0;top:0;background:#000';
      u.fxbarB = mk('div'); u.fxbarB.style.cssText = base + 'left:0;right:0;bottom:0;background:#000';
      u.fxbadge = mk('div'); u.fxbadge.style.cssText = base + 'left:8px;bottom:8px;padding:3px 8px;border-radius:999px;background:rgba(17,27,36,.85);color:#f3eee3;font:600 11px system-ui,sans-serif;z-index:4';
      pf.appendChild(u.fxtint); pf.appendChild(u.fxbarT); pf.appendChild(u.fxbarB); pf.appendChild(u.fxbadge);
    }
    var t0 = r.tints && r.tints[0], key = (t0 ? t0.bg + '|' + t0.mode : '') + '#' + Math.round((r.bars || 0) * 1000) + '#' + (r.badge || []).join(',');
    if (u.fxtint._k === key) return; u.fxtint._k = key;
    if (t0){ u.fxtint.style.background = t0.bg; u.fxtint.style.mixBlendMode = t0.mode === 'normal' ? '' : t0.mode; u.fxtint.style.display = 'block'; } else u.fxtint.style.display = 'none';
    var bh = r.bars ? (r.bars * 100) + '%' : '0';
    u.fxbarT.style.height = u.fxbarB.style.height = bh; u.fxbarT.style.display = u.fxbarB.style.display = r.bars ? 'block' : 'none';
    var note = (r.badge || []).join(', ');
    u.fxbadge.textContent = note ? note + ': the full effect is in the exported video' : ''; u.fxbadge.style.display = note ? 'block' : 'none';
  }
    // ----- auto reframe -----
  function reframeTargets(all){
    var out = [];
    if (all){ var lane = E.proj.tracks.filter(function (t){ return t.role === 'movie'; })[0]; if (lane) lane.clips.forEach(function (c){ if (c.type === 'video' && !c.reverse) out.push(c); }); }
    else { var c = targetVideo(); if (c && c.type === 'video' && !c.reverse) out.push(c); }
    return out;
  }
  function runReframe(o){
    if (E.rf && E.rf.running) return;
    var rat = NRF && NRF.ratioOf(o.ratio), list = reframeTargets(o.all), h = E.hooks;
    if (!rat){ toast('reframe.js is not loaded. Add <script src="reframe.js"></script> to index.html, before editor.js.'); return; }
    if (!list.length){ toast('Pick a picture clip where the movie plays forwards.'); return; }
    pause();
    var jobs = list.map(function (c){
      var asset = (c.asset && c.asset !== 'movie') ? c.asset : 'movie', a = E.proj.assets[asset] || {}, mine = asset === 'movie';
      return { id: c.id, url: mine ? (h.movieUrl && h.movieUrl()) : (h.videoUrl && h.videoUrl(asset)), from: c.in, to: c.in + c.dur * (c.speed || 1),
        w: mine ? (E.frameDims && E.frameDims.w) : a.w, h: mine ? (E.frameDims && E.frameDims.h) : a.h };
    });
    if (jobs.some(function (j){ return !j.url || !j.w || !j.h; })){ toast('The video file for a clip is not available here.'); return; }
    E.rf = { running: true, msg: 'Starting...' }; renderDock();
    var say = function (m){ if (E.rf) E.rf.msg = m; if (E.rfStatus) E.rfStatus.textContent = m; }, tracks = [];
    jobs.reduce(function (chain, j, i){
      return chain.then(function (){
        return NRF.analyzeVideo(j.url, j.from, j.to, { onProgress: function (f){ say('Watching clip ' + (i + 1) + ' of ' + jobs.length + '... ' + Math.round(f * 100) + '%'); } })
          .then(function (raw){ tracks.push(NRF.smoothTrack(raw)); });
      });
    }, Promise.resolve()).then(function (){
      var q = E.hist.cur, total = 0;
      jobs.forEach(function (j, i){ var r = {}; q = P.reframeClip(q, j.id, rat, tracks[i], { srcW: j.w, srcH: j.h }, r); total += r.pieces || 0; });
      q = P.setFormat(q, { ratio: o.ratio });
      E.rf = null;
      if (q === E.hist.cur){ renderDock(); toast('Nothing needed to change.'); return; }
      commit(q);
      toast('Reframed to ' + o.ratio + ' in ' + total + ' piece' + (total === 1 ? '' : 's') + '. Play it to check; Undo takes it all back, and Crop can fine-tune any piece.', 9000);
    }).catch(function (err){
      E.rf = null; console.error('auto reframe failed', err); renderDock();
      toast('Auto reframe did not work' + (err && err.message ? ': ' + err.message : '') + '.', 9000);
    });
  }
  PANELS.reframe = { title: 'Auto reframe', build: function (body){
    if (!NRF){ body.appendChild(mk('div', 'ed-hint', 'reframe.js is not loaded. Add <script src="reframe.js"></script> to index.html, before editor.js.')); return; }
    var c = needPicture(body); if (!c) return;
    if (c.type !== 'video' || c.reverse){ body.appendChild(mk('div', 'ed-hint', 'Pick a part where the movie plays forwards (not a paused or reversed picture).')); return; }
    var o = E.chip.rf || (E.chip.rf = { ratio: '9:16', all: false }), run = !!(E.rf && E.rf.running);
    body.appendChild(chips([{ key: '9:16', label: '9:16 (TikTok)' }, { key: '4:5', label: '4:5' }, { key: '1:1', label: '1:1' }, { key: '3:4', label: '3:4' }, { key: '16:9', label: '16:9' }], o.ratio, function (k){ o.ratio = k; renderDock(); }));
    body.appendChild(chips([{ key: 'clip', label: 'This clip' }, { key: 'all', label: 'Whole video' }], o.all ? 'all' : 'clip', function (k){ o.all = k === 'all'; renderDock(); }));
    var st = mk('div', 'ed-hint', run ? E.rf.msg : 'Naki watches the picture, finds the part that moves, and crops to the new shape, cutting the clip where the subject moves out of the middle.');
    E.rfStatus = st; body.appendChild(st);
    body.appendChild(actions([
      { id: 'edReframeGo', label: run ? 'Working...' : 'Reframe', run: function (){ runReframe(o); } },
      { id: 'edReframeReset', label: 'Remove crops', run: function (){ var q = P.setCrop(E.hist.cur, o.all ? null : c.id, null); if (q === E.hist.cur) renderDock(); else commit(q); } }]));
    body.appendChild(mk('div', 'ed-hint', 'It follows movement (and detail when nothing moves), not faces, so it suits one person or one moving subject best. It also sets the video shape under Format. Analysis runs on this device and can take a minute on a long clip.'));
  } };
  // ----- picture in picture, auto cut, auto speed ramp -----
  G.pip = svg('<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>');
  PANELS.pip = { title: 'Picture in picture', build: function (body){
    var c = selOverlay();
    if (!c || c.gen){ body.appendChild(mk('div', 'ed-hint', 'Tap a photo or video overlay on the timeline or the picture first.')); return; }
    var o = E.chip.pip || (E.chip.pip = { size: 'm' }), a = E.proj.assets[c.asset] || {}, ovAsp = (a.w > 0 && a.h > 0) ? a.h / a.w : 9 / 16;
    var fa = frameAspect() || ((E.frameDims && E.frameDims.h) ? E.frameDims.w / E.frameDims.h : 16 / 9);
    body.appendChild(chips([{ key: 's', label: 'Small' }, { key: 'm', label: 'Medium' }, { key: 'l', label: 'Large' }], o.size, function (k){ o.size = k; renderDock(); }));
    body.appendChild(chips(P.PIP_PRESETS, null, function (k){
      var pl = P.pipPlacement(k, P.PIP_SIZES[o.size], fa, ovAsp); if (!pl) return;
      var q = P.setOverlayPlace(E.hist.cur, c.id, pl); if (q === E.hist.cur) toast('It is already there.'); else commit(q);
    }));
    var m0 = NFX && c.mask ? NFX.cleanMask(c.mask) : null, round = !!(m0 && m0.shape === 'rect');
    body.appendChild(actions([{ id: 'edPipRound', label: round ? 'Rounded corners: on' : 'Rounded corners: off', on: round,
      run: function (){ commit(P.setOverlayFx(E.hist.cur, c.id, { mask: round ? null : { shape: 'rect', corner: 0.2 } })); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Tap a spot to put the overlay there at the size you chose. It stays an ordinary overlay, so you can still drag it, resize it or animate it under Edit. A preset takes away its position and size keyframes. If the rounded corners crop too much, open Mask and raise Size.'));
  } };

  function cutTargets(all){
    var out = [];
    if (all){ var lane = E.proj.tracks.filter(function (t){ return t.role === 'movie'; })[0]; if (lane) lane.clips.forEach(function (c){ if (c.type === 'video' && !c.reverse && !c.curve) out.push(c); }); }
    else { var c = targetVideo(); if (c && c.type === 'video' && !c.reverse && !c.curve) out.push(c); }
    return out;
  }
  function runAutoCut(o){
    if (E.cutRun) return;
    if (!NAC){ toast('autocut.js is not loaded. Add <script src="autocut.js"></script> to index.html, before editor.js.'); return; }
    var list = cutTargets(o.all), h = E.hooks;
    if (!list.length){ toast('Pick a picture clip where the movie plays forwards and has no speed curve.'); return; }
    pause();
    var jobs = list.map(function (c){
      var asset = (c.asset && c.asset !== 'movie') ? c.asset : 'movie';
      return { id: c.id, url: asset === 'movie' ? (h.movieUrl && h.movieUrl()) : (h.videoUrl && h.videoUrl(asset)), from: c.in, to: c.in + c.dur * (c.speed || 1) };
    });
    if (jobs.some(function (j){ return !j.url; })){ toast('The video file for a clip is not available here.'); return; }
    E.cutRun = { msg: 'Starting...' }; renderDock();
    var say = function (m){ if (E.cutRun) E.cutRun.msg = m; if (E.cutStatus) E.cutStatus.textContent = m; }, found = [];
    jobs.reduce(function (chain, j, i){
      return chain.then(function (){
        return NAC.analyzeVideo(j.url, j.from, j.to, { onProgress: function (f){ say('Watching clip ' + (i + 1) + ' of ' + jobs.length + '... ' + Math.round(f * 100) + '%'); } })
          .then(function (samples){ found.push(NAC.detect(samples, { sensitivity: o.sens, minMs: o.min })); });
      });
    }, Promise.resolve()).then(function (){
      var q = E.hist.cur, total = 0;
      jobs.forEach(function (j, i){ var r = {}; q = P.autoCutClip(q, j.id, found[i], { minMs: o.min }, r); total += r.cuts || 0; });
      E.cutRun = null;
      if (q === E.hist.cur){ renderDock(); toast('No scene changes were found. Try Every change, or a shorter piece.', 7000); return; }
      commit(q); toast('Cut in ' + total + ' place' + (total === 1 ? '' : 's') + '. Delete or move the pieces; Undo takes all the cuts back.', 8000);
    }).catch(function (err){
      E.cutRun = null; console.error('auto cut failed', err); renderDock();
      toast('Auto cut did not work' + (err && err.message ? ': ' + err.message : '') + '.', 9000);
    });
  }
  PANELS.autocut = { title: 'Auto cut', build: function (body){
    if (!NAC){ body.appendChild(mk('div', 'ed-hint', 'autocut.js is not loaded. Add <script src="autocut.js"></script> to index.html, before editor.js.')); return; }
    var c = needPicture(body); if (!c) return;
    if (c.type !== 'video' || c.reverse || c.curve){ body.appendChild(mk('div', 'ed-hint', 'Pick a part where the movie plays forwards. A paused, reversed or speed-curved clip cannot be auto cut.')); return; }
    var o = E.chip.autocut || (E.chip.autocut = { sens: 'medium', min: 1000, all: false }), run = !!E.cutRun;
    body.appendChild(chips(NAC.SENS_LIST, o.sens, function (k){ o.sens = k; renderDock(); }));
    body.appendChild(chips([{ key: 'clip', label: 'This clip' }, { key: 'all', label: 'Whole video' }], o.all ? 'all' : 'clip', function (k){ o.all = k === 'all'; renderDock(); }));
    body.appendChild(sliderRow('Shortest piece', 500, 5000, 100, o.min, secs, null, function (v){ o.min = v; }));
    var st = mk('div', 'ed-hint', run ? E.cutRun.msg : 'Naki watches the picture on this device and cuts the clip wherever the scene changes.');
    E.cutStatus = st; body.appendChild(st);
    body.appendChild(actions([{ id: 'edAutoCutGo', label: run ? 'Working...' : 'Find and cut', run: function (){ runAutoCut(o); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Only the picture and its movie sound are cut; your voice, music and titles stay as they are. A fast-moving shot can look like a cut, so pick Big changes only if you get too many pieces. It can take a minute on a long clip.'));
  } };

  function applyRamp(key, all){
    var q = E.hist.cur, list = [], seen = {};
    if (all){
      var lane = q.tracks.filter(function (t){ return t.role === 'movie'; })[0];
      (lane ? lane.clips.slice().sort(function (a, b){ return a.start - b.start; }) : []).forEach(function (c){
        if (c.type !== 'video' || c.reverse) return;
        var g = c.curve && c.curve.g; if (g){ if (seen[g]) return; seen[g] = 1; }
        list.push(c);
      });
    } else { var t = targetVideo(); if (t && t.type === 'video' && !t.reverse) list.push(t); }
    if (!list.length){ toast('Pick a picture clip where the movie plays forwards.'); return; }
    var done = 0;
    list.forEach(function (c, i){
      var q2;
      if (key === 'none') q2 = P.clearSpeedCurve(q, c.id);
      else { var pts = NRP.points(key === 'auto' ? NRP.auto(i, list.length, c.dur) : key); if (!pts) return; q2 = P.setSpeedCurve(q, c.id, pts); }
      if (q2 !== q){ q = q2; done++; }
    });
    if (q === E.hist.cur){ toast('Nothing changed. A clip needs to be at least half a second long.'); return; }
    E.cv = null; commit(q);
    toast(key === 'none' ? 'Back to normal speed.' : 'Speed ramp on ' + done + ' clip' + (done === 1 ? '' : 's') + '. Press play to see it; fine-tune it under Curve.', 7000);
  }
  PANELS.speedramp = { title: 'Auto speed ramp', build: function (body){
    if (!NRP || !NCV){ body.appendChild(mk('div', 'ed-hint', 'speedramp.js is not loaded. Add <script src="speedramp.js"></script> to index.html, before editor.js.')); return; }
    var c = needPicture(body); if (!c) return;
    if (c.type !== 'video' || c.reverse){ body.appendChild(mk('div', 'ed-hint', 'Pick a part where the movie plays forwards. A paused or reversed picture has no speed ramp.')); return; }
    var o = E.chip.ramp || (E.chip.ramp = { all: false });
    body.appendChild(chips([{ key: 'clip', label: 'This clip' }, { key: 'all', label: 'Whole track' }], o.all ? 'all' : 'clip', function (k){ o.all = k === 'all'; renderDock(); }));
    body.appendChild(chips([{ key: 'auto', label: 'Auto' }].concat(NRP.PRESETS.map(function (p){ return { key: p.key, label: p.label }; }), [{ key: 'none', label: 'Normal' }]), null, function (k){ applyRamp(k, o.all); }));
    body.appendChild(mk('div', 'ed-hint', 'Tap one to apply it. Auto picks a ramp for each clip: the first speeds up, the last slows down, short clips stay gentle. Whole track does every picture clip at once. The movie sound follows the speed; your voice does not. Videos with a speed export with the compatible engine, which takes longer. Undo takes it all back.'));
  } };

  // ----- audio effects: equalizer, pitch, echo, loudness -----
  var AFX_PRESETS = [
    { key: 'none', label: 'Normal', v: { bass: 0, mid: 0, treble: 0, pitch: 0, echo: 0, normalize: false } },
    { key: 'deep', label: 'Deep voice', v: { bass: 4, mid: 0, treble: -2, pitch: -4, echo: 0, normalize: false } },
    { key: 'high', label: 'High voice', v: { bass: -2, mid: 0, treble: 3, pitch: 4, echo: 0, normalize: false } },
    { key: 'chip', label: 'Chipmunk', v: { bass: -4, mid: 0, treble: 4, pitch: 8, echo: 0, normalize: false } },
    { key: 'radio', label: 'Radio', v: { bass: -12, mid: 6, treble: -6, pitch: 0, echo: 0, normalize: false } },
    { key: 'boost', label: 'Bass boost', v: { bass: 9, mid: 0, treble: 0, pitch: 0, echo: 0, normalize: false } },
    { key: 'cave', label: 'Cave', v: { bass: 0, mid: 0, treble: 0, pitch: 0, echo: 0.7, normalize: false } }];
  PANELS.audiofx = { title: 'Audio effects', build: function (body){
    var f = E.sel && P.findClip(E.proj, E.sel), c = f && f.track.kind === 'audio' ? f.clip : null;
    if (!c){ body.appendChild(mk('div', 'ed-hint', 'Tap a sound clip on the timeline first (your voice, music, movie sound or an effect).')); return; }
    var a = Object.assign({ bass: 0, mid: 0, treble: 0, pitch: 0, echo: 0, normalize: false }, c.afx || {}), o = E.chip.afx || (E.chip.afx = { all: false });
    var set = function (patch){ var q = P.setAudioFx(E.hist.cur, c.id, patch, o.all); if (q === E.hist.cur) renderDock(); else commit(q); };
    var keys = [{ key: 'bass', label: 'Bass' }, { key: 'mid', label: 'Mid' }, { key: 'treble', label: 'Treble' }, { key: 'pitch', label: 'Pitch' }, { key: 'echo', label: 'Echo' }], cur = chipKey('audiofx', keys, 'bass');
    body.appendChild(chips([{ key: 'clip', label: 'This clip' }, { key: 'all', label: 'Whole row' }], o.all ? 'all' : 'clip', function (k){ o.all = k === 'all'; renderDock(); }));
    body.appendChild(chips(AFX_PRESETS, null, function (k){ var p = AFX_PRESETS.filter(function (x){ return x.key === k; })[0]; if (p) set(p.v); }));
    body.appendChild(chips(keys, cur, pickChip('audiofx')));
    var one = function (v){ var patch = {}; patch[cur] = cur === 'echo' ? v / 100 : v; set(patch); };
    if (cur === 'echo') body.appendChild(sliderRow('Echo', 0, 100, 5, Math.round(a.echo * 100), pct, null, one));
    else if (cur === 'pitch') body.appendChild(sliderRow('Pitch', -12, 12, 1, a.pitch, function (v){ return (v > 0 ? '+' : '') + v + ' st'; }, null, one));
    else body.appendChild(sliderRow(cur === 'bass' ? 'Bass' : cur === 'mid' ? 'Mid' : 'Treble', -12, 12, 1, a[cur], function (v){ return (v > 0 ? '+' : '') + v + ' dB'; }, null, one));
    body.appendChild(actions([{ id: 'edAfxNorm', label: a.normalize ? 'Even out loudness: on' : 'Even out loudness: off', on: !!a.normalize, run: function (){ set({ normalize: !a.normalize }); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Pitch changes how high the voice sounds without changing its speed. Even out loudness makes quiet and loud parts closer. The preview plays the sound without these effects; the exported video has them. Videos with sound effects export with the compatible engine, which takes longer. Undo takes them back.'));
  } };

  // ----- colour tools: curves, colour mixer, LUT -----
  G.grade = svg('<path d="M3 20C8 20 8 4 21 4"/><circle cx="12" cy="12" r="2"/>');
  // While a clip has a grade, a canvas over the picture shows the frame with the grade applied (about 480 px wide). A cropped clip previews without it.
  function syncGrade(m, vc, css){
    var u = E.ui, g = vc && vc.grade;
    if (!NCL || !g || vc.crop || !movieReady() || E.swapping || !m.videoWidth || m.readyState < 2){ if (u.gradecv && E.gradeOn){ u.gradecv.style.display = 'none'; E.gradeOn = false; } return; }
    var pf = u.picframe, PW = pf.clientWidth, PH = pf.clientHeight; if (!PW || !PH) return;
    var now = performance.now(); if (E.playing && E.gradeAt && now - E.gradeAt < 55) return;
    E.gradeAt = now;
    if (!u.gradecv){ u.gradecv = mk('canvas'); u.gradecv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none'; pf.insertBefore(u.gradecv, u.layoutcv); }
    var sc = Math.min(1, 480 / PW), W = Math.max(2, Math.round(PW * sc)), H = Math.max(2, Math.round(PH * sc)), cv = u.gradecv;
    if (cv.width !== W || cv.height !== H){ cv.width = W; cv.height = H; }
    var key = JSON.stringify(g); if (E.gradeKey !== key){ E.gradeKey = key; E.gradeLut = NCL.bakeLut(g, 33); }
    var gx = cv.getContext('2d', { willReadFrequently: true });
    previewFrame(gx, m, vc, W, H);
    var img = gx.getImageData(0, 0, W, H); NCL.applyToImageData(img.data, E.gradeLut, 33); gx.putImageData(img, 0, 0);
    cv.style.filter = css || ''; cv.style.opacity = String(vc.opacity != null ? vc.opacity : 1); cv.style.display = 'block'; E.gradeOn = true;
  }
  function importCubeFile(id){
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.cube,text/plain';
    inp.onchange = function (){
      var f = inp.files && inp.files[0]; if (!f) return;
      if (f.size > 40e6){ toast('That file is too big for a LUT.'); return; }
      (f.text ? f.text() : new Promise(function (res){ var r = new FileReader(); r.onload = function (){ res(r.result); }; r.readAsText(f); })).then(function (text){
        var r = NCL.parseCube(text); if (r.error){ toast(r.error, 8000); return; }
        var enc = NCL.encodeLut(r, 25), nm = r.title || f.name.split('.').slice(0, -1).join('.') || f.name;
        var q = P.setGrade(E.hist.cur, id, { lut: { name: nm, size: enc.size, b64: enc.b64 }, lutAmt: 1 });
        if (q === E.hist.cur){ toast('That LUT did not change anything.'); return; }
        commit(q); toast('LUT "' + nm + '" added. Use Intensity to make it weaker.', 6000);
      });
    };
    inp.click();
  }
  // Colour match: this clip is measured near its start, the clip before it near its end, and red / green / blue curves are made to bring this one toward that one.
  function sampleStats(url, ms){
    return new Promise(function (resolve, reject){
      var vid = document.createElement('video'), done = false;
      function fin(err, val){ if (done) return; done = true; try { vid.removeAttribute('src'); vid.load(); } catch (e){} if (err) reject(err); else resolve(val); }
      vid.muted = true; vid.preload = 'auto'; vid.setAttribute('playsinline', '');
      vid.onerror = function (){ fin(new Error('This clip could not be read.')); };
      vid.onloadedmetadata = function (){ try { vid.currentTime = Math.max(0, Math.min(ms / 1000, (vid.duration || 1e9) - 0.05)); } catch (e){ fin(e); } };
      vid.onseeked = function (){
        try {
          var w = 96, ht = Math.max(2, Math.round(w * (vid.videoHeight || 9) / (vid.videoWidth || 16))), cv = document.createElement('canvas');
          cv.width = w; cv.height = ht; var cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(vid, 0, 0, w, ht);
          fin(null, NCL.frameStats(cx.getImageData(0, 0, w, ht).data));
        } catch (e){ fin(e); }
      };
      setTimeout(function (){ fin(new Error('Reading the clip took too long.')); }, 8000);
      vid.src = url;
    });
  }
  function matchPrevious(c){
    var f = P.findClip(E.proj, c.id); if (!f) return;
    var list = f.track.clips.filter(function (x){ return x.type === 'video' || x.type === 'freeze'; }).sort(function (a, b){ return a.start - b.start; }), i = list.indexOf(c), prev = i > 0 ? list[i - 1] : null;
    if (!prev){ toast('There is no picture clip before this one to match.'); return; }
    var u1 = clipUrl(f.track, prev), u2 = clipUrl(f.track, c);
    if (!u1 || !u2){ toast('The movie file for one of these clips is not loaded.'); return; }
    var t1 = prev.in + Math.max(0, prev.dur * (prev.speed || 1) - 300), t2 = c.in + 200;
    toast('Measuring the two pictures...', 2500);
    Promise.all([sampleStats(u1, t1), sampleStats(u2, t2)]).then(function (stats){
      var m = NCL.matchGrade(stats[0], stats[1], 1);
      if (!m.r && !m.g && !m.b){ toast('These two pictures already look alike.'); return; }
      var q = P.setGrade(E.hist.cur, c.id, { curves: { r: m.r, g: m.g, b: m.b } });
      if (q === E.hist.cur) renderDock(); else commit(q);
      toast('Matched to the clip before. Fine-tune it under Curves.', 5000);
    }, function (err){ toast(err && err.message ? err.message : 'Could not match the colour.', 7000); });
  }
  PANELS.grade = { title: 'Colour', build: function (body){
    if (!NCL){ body.appendChild(mk('div', 'ed-hint', 'colour.js is not loaded. Add <script src="colour.js"></script> to index.html, before project.js.')); return; }
    var c = needPicture(body); if (!c) return;
    if (c.type !== 'video' && c.type !== 'freeze'){ body.appendChild(mk('div', 'ed-hint', 'Pick a picture clip.')); return; }
    var g = c.grade || {}, tabs = [{ key: 'curves', label: 'Curves' }, { key: 'mixer', label: 'Colour mixer' }, { key: 'lut', label: 'LUT' }, { key: 'looks', label: 'Looks' }], tab = chipKey('grade', tabs, 'curves');
    var set = function (patch){ var q = P.setGrade(E.hist.cur, c.id, patch); if (q === E.hist.cur) renderDock(); else commit(q); };
    var setLive = function (patch){ live(P.setGrade(E.hist.cur, c.id, patch)); };
    body.appendChild(chips(tabs, tab, pickChip('grade')));
    if (tab === 'curves'){
      var chs = [{ key: 'm', label: 'Master' }, { key: 'r', label: 'Red' }, { key: 'g', label: 'Green' }, { key: 'b', label: 'Blue' }], ch = chipKey('gradech', chs, 'm');
      var COL = { m: '#ffffff', r: '#ff5a5a', g: '#5adf7a', b: '#5aa0ff' };
      body.appendChild(chips(chs, ch, function (k){ E.chip.gradech = k; E.chip.grsel = -1; renderDock(); }));
      var pts = (g.curves && g.curves[ch] ? g.curves[ch] : [[0, 0], [1, 1]]).map(function (p){ return p.slice(); }), drag = -1;
      if (E.chip.grsel == null || E.chip.grsel >= pts.length) E.chip.grsel = -1;
      var NS = 'http://www.w3.org/2000/svg', sv = document.createElementNS(NS, 'svg');
      sv.setAttribute('viewBox', '0 0 200 200'); sv.setAttribute('role', 'img'); sv.setAttribute('aria-label', 'Colour curve');
      sv.style.cssText = 'display:block;width:100%;max-width:220px;margin:6px auto;touch-action:none;background:rgba(255,255,255,.05);border-radius:8px';
      var X = function (u){ return 10 + u * 180; }, Y = function (v){ return 190 - v * 180; };
      var node = function (tag, attrs){ var e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k){ e.setAttribute(k, attrs[k]); }); return e; };
      var draw = function (){
        while (sv.firstChild) sv.removeChild(sv.firstChild);
        [0.25, 0.5, 0.75].forEach(function (v){
          sv.appendChild(node('line', { x1: X(v), x2: X(v), y1: Y(0), y2: Y(1), stroke: 'rgba(255,255,255,.15)', 'stroke-width': 1 }));
          sv.appendChild(node('line', { x1: X(0), x2: X(1), y1: Y(v), y2: Y(v), stroke: 'rgba(255,255,255,.15)', 'stroke-width': 1 }));
        });
        sv.appendChild(node('line', { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), stroke: 'rgba(255,255,255,.3)', 'stroke-dasharray': '4 4' }));
        var fn = NCL.curveFn(pts), d = ''; for (var i = 0; i <= 48; i++){ var u = i / 48; d += (i ? 'L' : 'M') + X(u).toFixed(1) + ' ' + Y(fn(u)).toFixed(1); }
        sv.appendChild(node('path', { d: d, fill: 'none', stroke: COL[ch], 'stroke-width': 2.5 }));
        pts.forEach(function (p, i){ sv.appendChild(node('circle', { cx: X(p[0]), cy: Y(p[1]), r: i === E.chip.grsel ? 8 : 6, fill: i === E.chip.grsel ? COL[ch] : '#111b24', stroke: COL[ch], 'stroke-width': 2 })); });
      };
      var where = function (ev){ var r = sv.getBoundingClientRect(), s = 200 / (r.width || 200); return { x: ((ev.clientX - r.left) * s - 10) / 180, y: (190 - (ev.clientY - r.top) * s) / 180 }; };
      var patchOf = function (){ var cp = {}; cp[ch] = pts.map(function (p){ return p.slice(); }); return { curves: cp }; };
      sv.addEventListener('pointerdown', function (ev){
        var p = where(ev), best = -1, bd = 0.09;
        pts.forEach(function (pt, i){ var dd = Math.hypot(pt[0] - p.x, pt[1] - p.y); if (dd < bd){ bd = dd; best = i; } });
        if (best < 0){
          var x = clamp(p.x, 0.03, 0.97);
          if (pts.length >= 12 || pts.some(function (q){ return Math.abs(q[0] - x) < 0.03; })) return;
          pts.push([x, clamp(p.y, 0, 1)]); pts.sort(function (a, b){ return a[0] - b[0]; });
          best = pts.map(function (q){ return q[0]; }).indexOf(x);
        }
        drag = best; E.chip.grsel = best; try { sv.setPointerCapture(ev.pointerId); } catch (e) {} ev.preventDefault(); draw();
      });
      sv.addEventListener('pointermove', function (ev){
        if (drag < 0) return;
        var p = where(ev), last = pts.length - 1, x = pts[drag][0];
        if (drag > 0 && drag < last) x = clamp(p.x, pts[drag - 1][0] + 0.03, pts[drag + 1][0] - 0.03);
        pts[drag] = [x, clamp(p.y, 0, 1)]; draw(); setLive(patchOf());
      });
      var letGo = function (){ if (drag < 0) return; drag = -1; set(patchOf()); };
      sv.addEventListener('pointerup', letGo); sv.addEventListener('pointercancel', letGo);
      draw(); body.appendChild(sv);
      body.appendChild(actions([
        { id: 'edCurveDelPt', label: 'Delete point', run: function (){
          var s = E.chip.grsel; if (s <= 0 || s >= pts.length - 1){ toast('Tap a point first (not the first or the last one).'); return; }
          pts.splice(s, 1); E.chip.grsel = -1; set(patchOf()); } },
        { id: 'edCurveResetCh', label: 'Reset this curve', run: function (){ var cp = {}; cp[ch] = null; E.chip.grsel = -1; set({ curves: cp }); } }]));
      body.appendChild(mk('div', 'ed-hint', 'Tap the graph to add a point and drag it: up brightens that tone, down darkens it. Master moves all colours; Red, Green and Blue move one colour. Drag the first or last point up or down to lift the blacks or dim the whites.'));
    } else if (tab === 'mixer'){
      var bs = NCL.BANDS.map(function (b){ return { key: b.key, label: b.label }; }), band = chipKey('gradeband', bs, 'red'), v = (g.hsl && g.hsl[band]) || [0, 0, 0];
      body.appendChild(chips(bs, band, pickChip('gradeband')));
      var patchHsl = function (i, val){ var a = v.slice(); a[i] = val / 100; var h = {}; h[band] = a; return { hsl: h }; };
      ['Hue', 'Saturation', 'Luminance'].forEach(function (lab, i){
        body.appendChild(sliderRow(lab, -100, 100, 1, Math.round(v[i] * 100), function (n){ return String(n); }, function (n){ setLive(patchHsl(i, n)); }, function (n){ set(patchHsl(i, n)); }));
      });
      body.appendChild(mk('div', 'ed-hint', 'Pick a colour, then change only that colour: for example turn the sky bluer or make skin tones warmer. Grey and very pale colours are left alone.'));
    } else if (tab === 'lut'){
      body.appendChild(mk('div', 'ed-hint', g.lut ? 'LUT: ' + g.lut.name : 'No LUT yet. A LUT is a .cube file with a ready-made colour look.'));
      var la = [{ id: 'edLutImport', label: 'Import .cube', run: function (){ importCubeFile(c.id); } }];
      if (g.lut) la.push({ id: 'edLutRemove', label: 'Remove LUT', run: function (){ set({ lut: null }); } });
      body.appendChild(actions(la));
      if (g.lut) body.appendChild(sliderRow('Intensity', 0, 100, 5, Math.round((g.lutAmt == null ? 1 : g.lutAmt) * 100), pct, function (n){ setLive({ lutAmt: n / 100 }); }, function (n){ set({ lutAmt: n / 100 }); }));
      body.appendChild(mk('div', 'ed-hint', 'Only 3D .cube files work (the usual kind from colour packs). The LUT is shrunk to a 25 point grid to keep your project small, which is fine for looks. It is applied after the curves and the colour mixer.'));
    } else {
      body.appendChild(chips(NCL.PRESETS, null, function (k){ var p = NCL.PRESETS.filter(function (x){ return x.key === k; })[0]; if (p) set({ replace: p.grade }); }));
      body.appendChild(mk('div', 'ed-hint', 'A look sets the curves and the colour mixer together, replacing what was there (and any LUT). Open Curves or Colour mixer afterwards to fine-tune it.'));
    }
    body.appendChild(actions([
      { id: 'edGradeMatch', label: 'Match previous clip', run: function (){ matchPrevious(c); } },
      { id: 'edGradeAll', label: 'Apply to all', run: function (){ commit(P.setGrade(E.hist.cur, null, { replace: c.grade || null })); toast('This colour is on every clip now.'); } },
      { id: 'edGradeReset', label: 'Reset colour', run: function (){ E.chip.grsel = -1; set({ replace: null }); } }]));
    body.appendChild(mk('div', 'ed-hint', 'The preview is a close match. The exported video uses the compatible engine, which takes longer. A cropped clip previews without colour; the export has both.'));
  } };

  // ----- timeline basics: copy / paste, paste look, several clips at once, snapping switch -----
  var CB = null, LOOKCB = null;
  G.paste = svg('<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V3h6v2"/>');
  G.sel = svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2 4-4"/>');
  (function (){
    if (typeof document === 'undefined' || !document.head) return;
    var s = document.createElement('style'); s.textContent = '.ed-clip.multi{outline:2px solid #ff9f1c;outline-offset:-2px}'; document.head.appendChild(s);
  })();
  function snapTh(){ return E.snap === false ? 0 : 8 / E.ppm; }
  function toggleSnap(){ E.snap = (E.snap === false); toast(E.snap === false ? 'Snapping off: clips move freely.' : 'Snapping on: clips snap to edges, the playhead and markers.'); renderDock(); }
  // the clips tools work on: the group when there is one, else the tapped clip
  function selIds(){
    var ids = Object.keys(E.multi || {});
    if (!ids.length && E.sel) ids = [E.sel];
    return ids.filter(function (id){ return P.findClip(E.proj, id); });
  }
  function setMulti(ids){ E.multi = {}; ids.forEach(function (id){ E.multi[id] = true; }); E.sel = null; renderTimeline(); renderDock(); }
  function clearMulti(){ E.multi = {}; renderTimeline(); renderDock(); }
  function selectRightHere(){
    var ids = P.selectRight(E.hist.cur, Math.round(E.t));
    if (!ids.length){ toast('There are no clips after the playhead.'); return; }
    setMulti(ids); toast(ids.length + ' clip' + (ids.length === 1 ? '' : 's') + ' selected. Use Move or Delete, or Clear to let go.', 5000);
  }
  function selectAllClips(){
    var ids = P.selectRight(E.hist.cur, 0);
    if (!ids.length){ toast('There are no clips yet.'); return; }
    setMulti(ids); toast(ids.length + ' clips selected.', 4000);
  }
  function deleteMulti(){
    var ids = selIds(); if (!ids.length){ toast('Select a clip first.'); return; }
    var q = P.deleteClips(E.hist.cur, ids); if (q === E.hist.cur){ toast('Those rows are locked or there is nothing to delete.'); return; }
    E.multi = {}; E.sel = null; commit(q); toast(ids.length === 1 ? 'Deleted.' : 'Deleted ' + ids.length + ' clips. Undo brings them back.', 4000);
  }
  function moveSel(delta){
    var ids = selIds(); if (!ids.length){ toast('Select a clip first.'); return; }
    var q = P.moveClips(E.hist.cur, ids, delta); if (q === E.hist.cur){ toast('There is no room to move them that way.'); return; }
    commit(q);
  }
  function moveSelToHead(){
    var ids = selIds(); if (!ids.length){ toast('Select a clip first.'); return; }
    var first = null; ids.forEach(function (id){ var f = P.findClip(E.proj, id); if (f && (first === null || f.clip.start < first)) first = f.clip.start; });
    var delta = Math.round(E.t) - first; if (!delta){ toast('They already start here.'); return; }
    moveSel(delta);
  }
  function selInGroup(){ return selIds().some(function (id){ return P.groupIds(E.proj, id).length > 1; }); }
  function groupSel(){
    var ids = selIds(); if (ids.length < 2){ toast('Pick two or more clips first (Pick clips, Select right or Select all).', 5000); return; }
    var q = P.groupClips(E.hist.cur, ids); if (q === E.hist.cur){ toast('They could not be grouped. Clips on locked rows cannot join a group.', 5000); return; }
    E.pickMulti = false; commit(q); toast('Grouped. Tap one clip to select the whole group. They move, copy and delete together.', 6000);
  }
  function ungroupSel(){
    var q = E.hist.cur; selIds().forEach(function (id){ q = P.ungroupClips(q, id); });
    if (q === E.hist.cur){ toast('Those clips are not in a group.'); return; }
    E.multi = {}; E.sel = null; commit(q); toast('Ungrouped.');
  }
  function togglePick(){ E.pickMulti = !E.pickMulti; toast(E.pickMulti ? 'Tap clips to add or remove them. Tap Pick clips again when you are done.' : 'Picking is off.', 5000); renderDock(); }
  function copySel(){
    var id = E.sel || selIds()[0]; if (!id){ toast('Tap a clip first.'); return; }
    var cb = (P.copyGroup && P.copyGroup(E.hist.cur, id)) || P.copyClip(E.hist.cur, id); if (!cb){ toast('That clip cannot be copied.'); return; }
    CB = cb; toast('Copied. Move the playhead, then tap Paste.'); renderDock();
  }
  function pasteHere(){
    if (!CB){ toast('Copy a clip first.'); return; }
    var out = {}, q = CB.group ? P.pasteGroup(E.hist.cur, CB, Math.round(E.t), out) : P.pasteClip(E.hist.cur, CB, Math.round(E.t), out);
    if (q === E.hist.cur){ toast('There is no room to paste here. Move the playhead earlier.'); return; }
    var nf = out.id && P.findClip(q, out.id); if (nf) E.t = nf.clip.start;
    E.multi = {}; E.sel = out.id || null; commit(q); toast('Pasted.');
  }
  function copyLook(){
    var id = E.sel || selIds()[0]; if (!id){ toast('Tap a clip first.'); return; }
    var lk = P.captureLook(E.hist.cur, id); if (!lk){ toast('That clip has no look to copy.'); return; }
    LOOKCB = lk; toast('Look copied. Select other clips of the same kind, then tap Paste look.', 5000); renderDock();
  }
  function pasteLookHere(){
    if (!LOOKCB){ toast('Copy a look first.'); return; }
    var ids = selIds(); if (!ids.length){ toast('Select the clips to paste onto first.'); return; }
    var q = P.pasteLook(E.hist.cur, LOOKCB, ids);
    if (q === E.hist.cur){ toast('Nothing changed. Paste look only works on clips of the same kind, with a different look.', 6000); return; }
    commit(q); toast('Look pasted.');
  }
  PANELS.shiftclips = { title: 'Move selected', build: function (body){
    var ids = selIds();
    if (!ids.length){ body.appendChild(mk('div', 'ed-hint', 'Select clips first: Select right, Select all, or tap a clip.')); return; }
    var o = E.chip.shift || (E.chip.shift = { ms: 500 });
    body.appendChild(chips([100, 500, 1000, 5000].map(function (v){ return { key: v, label: secs(v) }; }), o.ms, function (k){ o.ms = k; renderDock(); }));
    body.appendChild(actions([
      { id: 'edShiftEarlier', label: 'Earlier', run: function (){ moveSel(-o.ms); } },
      { id: 'edShiftLater', label: 'Later', run: function (){ moveSel(o.ms); } },
      { id: 'edShiftHead', label: 'Start at playhead', run: moveSelToHead }]));
    body.appendChild(mk('div', 'ed-hint', ids.length + ' clip' + (ids.length === 1 ? '' : 's') + ' selected. They move together, and a picture moves with its sound. If something is in the way, nothing moves. Clips on locked rows stay where they are.'));
  } };
  ROWS.select = function (){
    var n = Object.keys(E.multi || {}).length, any = selIds().length > 0;
    return [
      { id: 'edSelCopy', label: 'Copy', icon: G.dup, run: copySel, disabled: !any },
      { id: 'edSelPaste', label: 'Paste', icon: G.paste, run: pasteHere, disabled: !CB },
      { id: 'edSelCopyLook', label: 'Copy look', icon: G.style, run: copyLook, disabled: !any },
      { id: 'edSelPasteLook', label: 'Paste look', icon: G.style, run: pasteLookHere, disabled: !LOOKCB || !any },
      { id: 'edSelRight', label: 'Select right', icon: G.gap, run: selectRightHere },
      { id: 'edSelAll', label: 'Select all', icon: G.sel, run: selectAllClips },
      { id: 'edSelClear', label: 'Clear', icon: G.reset, run: clearMulti, disabled: !n },
      { id: 'edSelPick', label: E.pickMulti ? 'Picking: on' : 'Pick clips', icon: G.sel, run: togglePick, on: !!E.pickMulti },
      { id: 'edSelGroup', label: 'Group', icon: G.join, run: groupSel, disabled: selIds().length < 2 },
      { id: 'edSelUngroup', label: 'Ungroup', icon: G.gap, run: ungroupSel, disabled: !selInGroup() },
      { id: 'edSelMove', label: 'Move', icon: G.join, run: function (){ openPanel('shiftclips'); }, disabled: !any },
      { id: 'edSelDelete', label: 'Delete', icon: G.trash, run: deleteMulti, disabled: !any },
      { id: 'edSnap', label: 'Snapping', icon: G.magnet, run: toggleSnap, on: E.snap !== false }
    ];
  };
  // Copy / Paste / Copy look / Paste look are also at the end of the other tool rows, so they are in reach when a clip is tapped.
  ['edit', 'audio', 'text', 'sticker', 'overlay', 'fx', 'layout'].forEach(function (k){
    var orig = ROWS[k]; if (!orig) return;
    ROWS[k] = function (){
      return orig().concat([
        { id: 'edXCopy', label: 'Copy', icon: G.dup, run: copySel },
        { id: 'edXPaste', label: 'Paste', icon: G.paste, run: pasteHere, disabled: !CB },
        { id: 'edXCopyLook', label: 'Copy look', icon: G.style, run: copyLook },
        { id: 'edXPasteLook', label: 'Paste look', icon: G.style, run: pasteLookHere, disabled: !LOOKCB }]);
    };
  });

  // ----- save still: the picture at the playhead as a PNG, in one tap -----
  // Waits until the preview video has finished moving to the playhead, so the still is the right picture.
  function stillWait(m){
    return new Promise(function (res){
      if (!m.seeking && m.readyState >= 2) return res(true);
      var done = false, tm = 0;
      function fin(ok){ if (done) return; done = true; m.removeEventListener('seeked', onSeek); clearTimeout(tm); res(ok); }
      function onSeek(){ if (m.readyState >= 2) fin(true); }
      tm = setTimeout(function (){ fin(m.readyState >= 2); }, 3000);
      m.addEventListener('seeked', onSeek);
    });
  }
  // Draws the frame the way the export does: background, the picture (crop, then flip / turn / zoom, fitted in the frame), look, fade, stickers, titles.
  function drawStill(g, m, vc, W, H){
    var f = E.proj.format, bgc = '#111b24';
    try { if (frameAspect() && NF && f) bgc = NF.fillColor(NF.normalizeBg(f.bg)); } catch (e) {}
    g.fillStyle = bgc; g.fillRect(0, 0, W, H);
    var vw = m.videoWidth, vh = m.videoHeight; if (!vw || !vh) return;
    var t = vc.transform; if (vc.kf && NANIM) t = NANIM.pictureTransform(vc.transform, vc.kf, E.t - vc.start);
    var cr = vc.crop || { x: 0, y: 0, w: 1, h: 1 };
    g.save();
    if (NF && NF.containLayout){
      var L = NF.containLayout(t, W, H, vw * cr.w, vh * cr.h), b = L.box;
      g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip();
      if (vc.opacity != null && vc.opacity < 1) g.globalAlpha = Math.max(0, vc.opacity);
      var fl = vc.filter;
      if (fl) g.filter = 'brightness(' + (fl.brightness == null ? 1 : fl.brightness) + ') contrast(' + (fl.contrast == null ? 1 : fl.contrast) + ') saturate(' + (fl.saturate == null ? 1 : fl.saturate) + ')';
      g.translate(b.x + b.w / 2 + L.panX, b.y + b.h / 2 + L.panY); g.scale(L.zoom, L.zoom); g.rotate(L.rot * Math.PI / 180); if (L.flip) g.scale(-1, 1);
      g.drawImage(m, cr.x * vw, cr.y * vh, cr.w * vw, cr.h * vh, -L.dw / 2, -L.dh / 2, L.dw, L.dh);
    } else g.drawImage(m, cr.x * vw, cr.y * vh, cr.w * vw, cr.h * vh, 0, 0, W, H);
    g.restore();
    var fo = fadeOpacity(vc, E.t);
    if (fo < 1){ g.save(); g.globalAlpha = 1 - fo; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.restore(); }
    if (NSTK) P.stickersAt(E.proj, E.t).forEach(function (c){ try { NSTK.drawSticker(g, Object.assign({}, c, { x: NANIM.valueOf(c, 'sticker', 'x', E.t - c.start), y: NANIM.valueOf(c, 'sticker', 'y', E.t - c.start) }), W, H); } catch (e) {} });
    var LKs = lookLib();
    if (LKs.drawTitle) P.textsAt(E.proj, E.t).forEach(function (c){ if (c.text) try { var sh0 = NANIM ? NANIM.shiftOf(c, E.t - c.start) : { x: 0, y: 0 }; g.save(); g.translate(sh0.x * W, sh0.y * H); LKs.drawTitle(g, c, W, H); g.restore(); } catch (e) {} });
  }
  // Saves the picture at the playhead as a PNG. Resolves to true when it was saved.
  function exportStill(){
    var none = function (msg){ toast(msg); return Promise.resolve(false); };
    if (!movieReady()) return none('Choose the movie for this session first.');
    if (E.swapping) return none('One moment, the video is still loading. Try again.');
    pause();
    var s = P.sourceAt(E.proj, E.t), vc = s.video && s.video.clip;
    if (!vc) return none('There is no picture at the playhead. Move it onto the video first.');
    if (isPhotoClip(vc)) return none('Save still is for video clips. A photo already is a picture.');
    var m = E.hooks.movie; syncMedia();
    return stillWait(m).then(function (ready){
      if (!ready || !m.videoWidth) return none('The picture is not ready yet. Try again in a moment.');
      var vw = m.videoWidth, vh = m.videoHeight, a = frameAspect() || vw / vh, W, H;
      if (a >= 1){ H = Math.min(vh, 1080); W = Math.round(H * a); } else { W = Math.min(vw, 1080); H = Math.round(W / a); }
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      drawStill(cv.getContext('2d'), m, vc, W, H);
      return new Promise(function (res){
        cv.toBlob(function (blob){
          if (!blob){ toast('The still could not be made on this device.'); res(false); return; }
          var base = String((E.sess && E.sess.name) || 'naki').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'naki';
          var name = base + '_still_' + (E.t / 1000).toFixed(1).replace('.', '_') + 's.png', a2 = document.createElement('a');
          a2.href = URL.createObjectURL(blob); a2.download = name; document.body.appendChild(a2); a2.click();
          setTimeout(function (){ URL.revokeObjectURL(a2.href); a2.remove(); }, 2000);
          toast('Saved ' + name); res(true);
        }, 'image/png');
      });
    });
  }
  // Saves the still first (the picture is the same before and after), then holds the picture.
  function freezeThenStill(){ return exportStill().then(function (){ freezeHere(); }); }
  // ----- stabilize panel -----
  PANELS.stabilize = { title: 'Stabilize', build: function (body){
    var c = needPicture(body); if (!c) return;
    if (c.type !== 'video'){ body.appendChild(mk('div', 'ed-hint', 'A paused picture has nothing to steady. Pick a part where the movie plays.')); return; }
    if (c.reverse){ body.appendChild(mk('div', 'ed-hint', 'A reversed clip cannot be stabilized. Turn Reverse off first.')); return; }
    var cur = Math.round((c.stabilize || 0) * 100), set = function (v){ return P.setStabilize(E.hist.cur, c.id, v / 100); };
    body.appendChild(chips([{ key: 0, label: 'Off' }, { key: 30, label: 'Light' }, { key: 60, label: 'Medium' }, { key: 90, label: 'Strong' }], cur, function (k){ commit(set(k)); }));
    body.appendChild(sliderRow('Strength', 0, 100, 5, cur, pct, null, function (v){ commit(set(v)); }));
    body.appendChild(actions([{ id: 'edStabilizeAll', label: 'Apply to all', run: function (){ commit(P.setStabilize(E.hist.cur, null, cur / 100)); toast('This stabilization is on every clip now.'); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Steadies shaky, handheld footage. It is done when you export, so the preview does not show it. Stronger steadies more but can look floaty. Exporting takes longer, and uses the compatible engine. It cannot be used on a paused or reversed picture.'));
  } };
  // ----- text effects: gradient, curve, glow, bubble, 3D, word art -----
  function isStyledText(c){ var L = lookLib(); return !!(L.hasTitleFx && L.hasTitleFx(c)); }
  // Draws a title with effects on a canvas laid over the whole text layer, using look.js (the same drawing as both exports).
  function paintStyledText(layer, c){
    var LK = lookLib(), d = E.textEls[c.id], W = layer.clientWidth || 320, H = layer.clientHeight || 240;
    if (!d){
      d = E.textEls[c.id] = mk('canvas', 'ed-textstyled'); d._styled = true;
      d.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
      layer.appendChild(d);
    }
    var stt = (c.anim && NMO) ? NMO.textState(c.anim, E.t - c.start, c.dur) : null, shown = c.text || '';
    if (stt && stt.chars < 1) shown = NMO.visibleText(shown, stt.chars);
    var dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1), cw = Math.max(2, Math.round(W * dpr)), ch = Math.max(2, Math.round(H * dpr));
    var key = JSON.stringify([shown, c.size, c.color, c.pos, c.weight, c.bg, c.font, c.outline, c.shadow, c.grad, c.arc, c.glow, c.bubble, c.extrude, cw, ch]);
    if (d._key !== key){
      if (d.width !== cw) d.width = cw;
      if (d.height !== ch) d.height = ch;
      var g = d.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
      d._lines = LK.drawTitle(g, Object.assign({}, c, { text: shown }), cw, ch) || []; d._key = key;
    }
    var fk = c.font || 'sans'; E.fontsAsked = E.fontsAsked || {};
    if (!E.fontsAsked[fk] && LK.loadFonts){   // a canvas needs the font loaded first: draw again when it arrives
      E.fontsAsked[fk] = 1;
      LK.loadFonts([{ font: c.font, weight: c.weight, text: c.text }]).then(function (){
        Object.keys(E.textEls).forEach(function (id){ if (E.textEls[id]._styled) E.textEls[id]._key = null; });
        if (E.isOpen) syncMedia();
      });
    }
    if (stt){
      var py = NMO.pivotY(c, H, (d._lines || [1]).length);
      d.style.transformOrigin = '50% ' + py + 'px'; d.style.opacity = shown ? String(stt.alpha) : '0';
      d.style.transform = 'translate(' + (stt.dx * W) + 'px,' + (stt.dy * H) + 'px) rotate(' + stt.rot + 'deg) scale(' + stt.scale + ')';
    } else { if (d.style.transform) d.style.transform = ''; if (d.style.opacity) d.style.opacity = ''; }
  }
  PANELS.textfx = { title: 'Text effects', build: function (body){
    var c = selText(), LK = lookLib();
    if (!c){ body.appendChild(mk('div', 'ed-hint', 'Tap a text on the timeline first.')); return; }
    if (!LK.ART){ body.appendChild(mk('div', 'ed-hint', 'look.js is out of date. Copy the new look.js into the www folder.')); return; }
    var keys = [{ key: 'art', label: 'Word art' }, { key: 'grad', label: 'Gradient' }, { key: 'arc', label: 'Curve' }, { key: 'glow', label: 'Glow' }, { key: 'bubble', label: 'Bubble' }, { key: 'extrude', label: '3D' }];
    var cur = chipKey('textfx', keys, 'art'), pt = function (o){ return P.setTextProps(E.hist.cur, c.id, o); };
    body.appendChild(chips(keys, cur, pickChip('textfx')));
    function colorRow(label, val, put){
      var ci = mk('input'); ci.type = 'color'; ci.value = val; ci.setAttribute('aria-label', label);
      ci.oninput = function (){ live(put(ci.value)); }; ci.onchange = function (){ commit(put(ci.value)); };
      var r = mk('div', 'ed-mixrow wide'); add(r, mk('span', 'ed-mixname', label), ci); return r;
    }
    if (cur === 'art'){
      body.appendChild(chips(LK.ART.map(function (a){ return { key: a.key, label: a.label }; }), E.chip.artKey || null, function (k){ E.chip.artKey = k; commit(pt(LK.art(k))); }));
    } else if (cur === 'arc'){
      body.appendChild(sliderRow('Curve', -100, 100, 5, Math.round((c.arc || 0) * 100), function (v){ return v === 0 ? 'Off' : (v > 0 ? 'Arch ' : 'Smile ') + Math.abs(v); },
        function (v){ live(pt({ arc: v / 100 })); }, function (v){ commit(pt({ arc: v / 100 })); }));
    } else {
      var D = { grad: { c1: '#ff512f', c2: '#f9d423', angle: 90 }, glow: { color: '#00e5ff', amount: 0.8 }, bubble: { color: '#ff4fa3', width: 0.6 }, extrude: { color: '#ee4266', depth: 0.7 } }[cur];
      var prop = { glow: 'amount', bubble: 'width', extrude: 'depth' }[cur], lab = { glow: 'Strength', bubble: 'Thickness', extrude: 'Depth' }[cur], v0 = c[cur];
      body.appendChild(actions([{ id: 'edTextFxOn', label: v0 ? 'On: tap to turn off' : 'Off: tap to turn on', on: !!v0, run: function (){ var o = {}; o[cur] = v0 ? null : D; commit(pt(o)); } }]));
      if (v0){
        var put = function (k){ return function (val){ var o = {}, n = Object.assign({}, c[cur]); n[k] = val; o[cur] = n; return pt(o); }; };
        if (cur === 'grad'){
          body.appendChild(colorRow('Top / left colour', v0.c1, put('c1'))); body.appendChild(colorRow('Bottom / right colour', v0.c2, put('c2')));
          body.appendChild(sliderRow('Direction', 0, 345, 15, v0.angle, function (x){ return x + '\u00b0'; }, function (x){ live(put('angle')(x)); }, function (x){ commit(put('angle')(x)); }));
        } else {
          body.appendChild(colorRow('Colour', v0.color, put('color')));
          body.appendChild(sliderRow(lab, 5, 100, 5, Math.round(v0[prop] * 100), pct, function (x){ live(put(prop)(x / 100)); }, function (x){ commit(put(prop)(x / 100)); }));
        }
      }
    }
    if (c.caption) body.appendChild(actions([{ id: 'edTextFxAll', label: 'Apply this to all captions', run: function (){
      commit(P.setCaptionStyle(E.hist.cur, { color: c.color, font: c.font || 'sans', outline: c.outline || 0, shadow: c.shadow == null ? 1 : c.shadow, grad: c.grad || null, arc: c.arc || null, glow: c.glow || null, bubble: c.bubble || null, extrude: c.extrude || null }));
      toast('Every caption has this look now.'); } }]));
    body.appendChild(mk('div', 'ed-hint', 'The effects are drawn the same way in the preview and in the exported video, and can be mixed. Word art sets a whole look at once, with its own font. Curve bends the whole text. Word-by-word highlight is not used on a text that has effects.'));
  } };
  // ----- text to speech -----
  G.speak = svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>');
  function ttsState(){
    if (!E.chip.tts) E.chip.tts = Object.assign({ text: '', voice: null, lang: 'all', speed: 1, pitch: 0, vol: 100, fit: true, edit: null, from: null }, NTTS ? NTTS.getPrefs() : {});
    return E.chip.tts;
  }
  function ttsSave(o){ if (NTTS) NTTS.setPrefs({ voice: o.voice, lang: o.lang, speed: o.speed, pitch: o.pitch, vol: o.vol, fit: o.fit }); }
  function ttsSay(m){ if (E.tts) E.tts.msg = m; if (E.ttsStatus) E.ttsStatus.textContent = m; }
  function ttsFail(err){ E.tts = null; renderDock(); toast('Text to speech did not work' + (err && err.message ? ': ' + err.message : '') + '.', 9000); }
  function shortText(t){ t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > 28 ? t.slice(0, 27) + '\u2026' : t; }
  // Opens the panel. A speech clip that is selected is opened for changing; a selected title or caption is opened for reading aloud.
  function openTts(){
    var o = ttsState(), f = E.sel && P.findClip(E.proj, E.sel), m = (f && P.ttsOf) ? P.ttsOf(E.proj, f.clip.id) : null;
    o.edit = null; o.from = null;
    if (m){ o.edit = f.clip.id; o.text = m.text; if (m.voice) o.voice = m.voice; o.speed = m.speed; o.pitch = m.pitch; o.vol = Math.round((f.clip.volume != null ? f.clip.volume : 1) * 100); }
    else if (f && f.track.kind === 'text' && f.clip.text){ o.text = f.clip.text; o.from = f.clip.id; }
    openPanel('tts', 'audio');
  }
  // The voices to choose from: the offline ones once they are loaded, otherwise the browser's own (for listening only).
  function ttsVoices(){
    var off = NTTS && NTTS.offlineEngine(), list = [];
    if (off) off.voices().forEach(function (v){ list.push({ key: off.id + ':' + v.id, label: v.label, lang: v.langLabel || v.lang, offline: true }); });
    else (E.ttsBrowser || []).forEach(function (v){ list.push({ key: 'browser:' + v.voiceURI, label: String(v.name).replace(/^(Microsoft|Google) /, ''), lang: NTTS.langName(v.lang), offline: false }); });
    return list;
  }
  function ttsLoadEngine(){
    if (!NTTS || (E.tts && E.tts.running)) return;
    E.tts = { running: true, msg: 'Loading the offline voices...' }; renderDock();
    NTTS.loadEngine('piper', ttsSay).then(function (){
      E.tts = null; NTTS.setPrefs({ engine: 'piper' }); ttsState().voice = null; renderDock(); toast('Offline voices are ready.');
    }, ttsFail);
  }
  function ttsListen(){
    var o = ttsState(); if (!NTTS) return;
    if (!NTTS.hasSpeech(o.text)){ toast('Type some words first.'); return; }
    ttsSave(o);
    var off = NTTS.offlineEngine(), v = o.voice || '';
    if (!off || !v || v.indexOf('browser:') === 0){
      if (!NTTS.previewSpeak(o.text, { voiceURI: v.replace(/^browser:/, ''), rate: o.speed, pitch: NTTS.pitchToBrowser(o.pitch), volume: Math.min(1, o.vol / 100) })) toast('This browser cannot speak text aloud.');
      return;
    }
    if (E.tts && E.tts.running) return;
    pause(); E.tts = { running: true, msg: 'Starting...' }; renderDock();
    NTTS.synthRaw(o.text, v, ttsSay).then(function (raw){
      var r = NTTS.render(raw, { speed: o.speed, pitch: o.pitch }); E.tts = null; renderDock(); NTTS.playBlob(r.blob);
    }, ttsFail);
  }
  // jobs = [{ text, at (ms), fitMs (0 = natural length) }]. Each job becomes a speech clip; all of them are one undo step.
  // When editing a speech clip (o.edit), the one job replaces that clip's sound instead.
  function ttsGenerate(jobs){
    var o = ttsState(), v = o.voice, off = NTTS.offlineEngine(), editId = o.edit;
    if (!off || !v || v.indexOf('browser:') === 0){ toast('Speech can only go on the timeline with an offline voice: tap Load offline voices first. Listen works with the browser voices.', 9000); return; }
    if (E.tts && E.tts.running) return;
    ttsSave(o); pause(); E.tts = { running: true, msg: 'Starting...' }; renderDock();
    var q = E.hist.cur, made = 0, cut = 0, skipped = 0, over = 0, lastId = null;
    jobs.reduce(function (chain, job, i){
      return chain.then(function (){
        return NTTS.synthRaw(job.text, v, function (m){ ttsSay(jobs.length > 1 ? (i + 1) + ' of ' + jobs.length + ': ' + m : m); });
      }).then(function (raw){
        var r = NTTS.render(raw, { speed: o.speed, pitch: o.pitch });
        if (job.fitMs){   // too long for its caption: speed it up (up to 1.6 times) so it ends with it
          var m = r.durMs / job.fitMs;
          if (m > 1.02){ r = NTTS.render(raw, { speed: o.speed * Math.min(1.6, m), pitch: o.pitch }); if (m > 1.6) over++; }
        }
        var file = new File([r.blob], 'speech.wav', { type: 'audio/wav' }), name = 'Speech: ' + shortText(job.text), meta = { text: job.text, voice: v, speed: o.speed, pitch: o.pitch }, out = {}, q2;
        if (editId){
          q2 = P.replaceSpeech(q, editId, { durMs: r.durMs, name: name }, meta, out);
          if (q2 === q){ skipped++; return; }
          E.hooks.setSfxFile(out.asset, file); q = P.setClipProps(q2, editId, { volume: o.vol / 100 }); lastId = editId; made++; if (out.cut) cut++;
        } else {
          q2 = P.addSfx(q, job.at, { file: file, name: name, durMs: r.durMs }, out);
          if (q2 === q){ skipped++; return; }
          E.hooks.setSfxFile(out.asset, file); q2 = P.setAssetTts(q2, out.asset, meta); q = P.setClipProps(q2, out.id, { volume: o.vol / 100 }); lastId = out.id; made++;
          var nc = P.findClip(q, out.id); if (nc && nc.clip.dur < r.durMs - 50) cut++;
        }
      });
    }, Promise.resolve()).then(function (){
      E.tts = null; o.edit = null; o.from = null;
      if (!made){ renderDock(); toast(skipped ? 'There was no room for the speech there. Move the playhead, or free some space on the sound rows.' : 'Nothing was made.', 7000); return; }
      E.sel = lastId; commit(q);
      var bits = [made + ' speech clip' + (made === 1 ? '' : 's') + ' ' + (editId ? 'updated' : 'added')];
      if (skipped) bits.push(skipped + ' had no room');
      if (cut) bits.push(cut + ' cut short by the end of the video or the next clip');
      if (over) bits.push(over + ' still longer than ' + (over === 1 ? 'its caption' : 'their captions') + ' even sped up');
      toast(bits.join('. ') + '.', 8000);
    }, ttsFail);
  }
  function ttsAdd(){
    var o = ttsState();
    if (!NTTS.hasSpeech(o.text)){ toast('Type some words first.'); return; }
    var f = o.from && P.findClip(E.proj, o.from), at = f ? f.clip.start : Math.round(E.t);
    ttsGenerate([{ text: o.text, at: at, fitMs: (f && o.fit) ? f.clip.dur : 0 }]);
  }
  function ttsReadCaptions(){
    var o = ttsState(), list = P.captionList(E.hist.cur).filter(function (c){ return NTTS.hasSpeech(c.text); });
    if (!list.length){ toast('There are no captions to read. Add captions first (Text, then Captions).'); return; }
    o.edit = null; o.from = null;
    ttsGenerate(list.map(function (c){ return { text: c.text, at: c.start, fitMs: o.fit ? c.end - c.start : 0 }; }));
  }
  PANELS.tts = { title: 'Text to speech', build: function (body){
    var T = NTTS;
    if (!T){ body.appendChild(mk('div', 'ed-hint', 'tts.js is not loaded. Add <script src="tts.js"></script> to index.html, before editor.js.')); return; }
    var o = ttsState(), off = T.offlineEngine(), busy = !!(E.tts && E.tts.running);
    if (!E.ttsAsked){
      E.ttsAsked = true;
      T.browserVoices().then(function (l){ E.ttsBrowser = l; if (E.panel === 'tts') renderDock(); });
      if (T.getPrefs().engine === 'piper' && !off) T.loadEngine('piper').then(function (){ if (E.panel === 'tts') renderDock(); }, function (){});   // loaded before: load it again quietly
    }
    var ta = mk('textarea', 'ed-textin'); ta.rows = 3; ta.value = o.text || ''; ta.placeholder = 'Type what the voice should say'; ta.setAttribute('aria-label', 'Text to speak');
    ta.oninput = function (){ o.text = ta.value; }; ta.onchange = function (){ o.text = ta.value; };
    body.appendChild(ta);
    var st = mk('div', 'ed-hint', busy ? E.tts.msg : off ? 'Offline voices are ready: speech can go on the timeline and in the exported video.' : 'Listen works now, with your browser\u2019s voices. To put speech on the timeline and in the exported video, load the offline voices.');
    E.ttsStatus = st; body.appendChild(st);
    if (!off) body.appendChild(actions([{ id: 'edTtsLoad', label: busy ? 'Working...' : 'Load offline voices', run: ttsLoadEngine }]));
    var vs = ttsVoices(), langs = [{ key: 'all', label: 'All languages' }], seen = {};
    vs.forEach(function (v){ if (!seen[v.lang] && langs.length < 30){ seen[v.lang] = 1; langs.push({ key: v.lang, label: v.lang }); } });
    var lang = langs.some(function (l){ return l.key === o.lang; }) ? o.lang : 'all', shown = vs.filter(function (v){ return lang === 'all' || v.lang === lang; }).slice(0, 80);
    if (vs.length && !vs.some(function (v){ return v.key === o.voice; })) o.voice = (shown[0] || vs[0]).key;
    if (!vs.length) body.appendChild(mk('div', 'ed-hint', 'No voices were found. Load the offline voices, or use a browser that has speech voices.'));
    else {
      body.appendChild(chips(langs, lang, function (k){ o.lang = k; ttsSave(o); renderDock(); }));
      body.appendChild(chips(shown.map(function (v){ return { key: v.key, label: v.label + (lang === 'all' ? ' \u00b7 ' + v.lang : '') }; }), o.voice, function (k){ o.voice = k; ttsSave(o); renderDock(); }));
    }
    body.appendChild(sliderRow('Speed', 50, 200, 5, Math.round(o.speed * 100), pct, function (v){ o.speed = v / 100; }, function (v){ o.speed = v / 100; ttsSave(o); }));
    body.appendChild(sliderRow('Pitch', -6, 6, 1, o.pitch, function (v){ return v > 0 ? '+' + v : String(v); }, function (v){ o.pitch = v; }, function (v){ o.pitch = v; ttsSave(o); }));
    body.appendChild(sliderRow('Volume', 0, 200, 5, o.vol, pct, function (v){ o.vol = v; }, function (v){ o.vol = v; ttsSave(o); }));
    body.appendChild(actions([{ id: 'edTtsListen', label: 'Listen', run: ttsListen }, { id: 'edTtsStop', label: 'Stop', run: function (){ T.stopPreview(); } },
      { id: 'edTtsAdd', label: o.edit ? 'Update speech' : (o.from ? 'Add at the text' : 'Add at playhead'), run: ttsAdd }]));
    body.appendChild(actions([{ id: 'edTtsCaps', label: 'Read all captions', run: ttsReadCaptions }]));
    body.appendChild(chips([{ key: 'fit', label: 'Fit to the text or caption' }, { key: 'free', label: 'Natural length' }], o.fit ? 'fit' : 'free', function (k){ o.fit = k === 'fit'; ttsSave(o); renderDock(); }));
    body.appendChild(mk('div', 'ed-hint', 'Add puts the speech on a sound row at the playhead (or at the start of the title or caption you opened this from). It is an ordinary sound clip: move it, cut it, and change its volume and fades under Clip. Read all captions makes one clip per caption. Fit speeds a clip up, never more than 1.6 times, so it ends with its caption. To change the words or the voice, tap the speech clip and open Text to speech again.'));
  } };
  // ----- multi-camera -----
  G.cam = svg('<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/>');
  function camShort(s){ s = String(s || ''); return s.length > 22 ? s.slice(0, 21) + '\u2026' : s; }
  function camSyncText(sync){
    if (sync === null) return 'not synced yet';
    if (!sync) return 'synced (starts together)';
    return 'synced: started ' + (Math.abs(sync) / 1000).toFixed(2) + ' s ' + (sync > 0 ? 'earlier' : 'later') + ' than the main video';
  }
  function runCamSync(asset){
    if (E.cam && E.cam.running) return;
    if (!NMC){ toast('multicam.js is not loaded. Add <script src="multicam.js"></script> to index.html, before editor.js.'); return; }
    var h = E.hooks, fa = h.getAssetFile && h.getAssetFile('movie'), fb = h.getAssetFile && h.getAssetFile(asset);
    if (!fa || !fb){ toast('The video file for a camera is not available here.'); return; }
    pause(); E.cam = { running: true, msg: 'Starting...' }; renderDock();
    var say = function (m){ if (E.cam) E.cam.msg = m; if (E.camStatus) E.camStatus.textContent = m; };
    NMC.syncFiles(fa, fb, { onStatus: say }).then(function (r){
      E.cam = null;
      if (!r){ renderDock(); toast('No match was found. The two videos need to hear the same sounds in their first 90 seconds. Try nudging by hand.', 9000); return; }
      var q = P.setAssetSync(E.hist.cur, asset, r.offsetMs);
      if (q === E.hist.cur) renderDock(); else commit(q);
      toast(r.confidence >= 0.5 ? 'Synced (' + (r.offsetMs / 1000).toFixed(2) + ' s).' : 'Synced (' + (r.offsetMs / 1000).toFixed(2) + ' s), but Naki is not sure: the sounds matched weakly. Switch cameras and check, or nudge by hand.', 9000);
    }).catch(function (err){ E.cam = null; renderDock(); toast('Sync did not work' + (err && err.message ? ': ' + err.message : '') + '.', 9000); });
  }
  function showCamera(asset){
    var c = targetVideo(); if (!c){ toast('Move the playhead onto the picture, or tap a picture clip first.'); return; }
    var out = {}, q = P.switchAngle(E.hist.cur, c.id, asset, out);
    if (out.error){ toast(out.error, 7000); return; }
    if (q !== E.hist.cur) commit(q);
  }
  PANELS.cameras = { title: 'Cameras', build: function (body){
    var c = needPicture(body); if (!c) return;
    var list = P.angleList(E.proj), cams = list.filter(function (a){ return a.asset !== 'movie'; });
    if (!cams.length){ body.appendChild(mk('div', 'ed-hint', 'Add a second video first (Edit, then Add video). Each added video is another camera.')); return; }
    var key = chipKey('cam', cams.map(function (a){ return { key: a.asset, label: a.name }; }), cams[0].asset), cam = cams.filter(function (a){ return a.asset === key; })[0], busy = !!(E.cam && E.cam.running);
    body.appendChild(chips(cams.map(function (a){ return { key: a.asset, label: camShort(a.name) }; }), key, pickChip('cam')));
    var here = (c.asset || 'movie') === 'movie' ? 'the main video' : camShort((E.proj.assets[c.asset] || {}).name);
    var st = mk('div', 'ed-hint', busy ? E.cam.msg : camShort(cam.name) + ': ' + camSyncText(cam.sync) + '. The clip under the playhead shows ' + here + '.');
    E.camStatus = st; body.appendChild(st);
    body.appendChild(actions([{ id: 'edCamSync', label: busy ? 'Working...' : 'Sync automatically', run: function (){ runCamSync(key); } },
      { id: 'edCamClear', label: 'Clear sync', run: function (){ var q = P.setAssetSync(E.hist.cur, key, null); if (q === E.hist.cur) renderDock(); else commit(q); } }]));
    var step = E.chip.camstep || 33;
    body.appendChild(chips([{ key: 33, label: '1 frame' }, { key: 100, label: '0.1 s' }, { key: 500, label: '0.5 s' }, { key: 1000, label: '1 s' }], step, function (k){ E.chip.camstep = k; renderDock(); }));
    body.appendChild(actions([{ id: 'edCamNudgeBack', label: '\u2212 Nudge', run: function (){ commit(P.setAssetSync(E.hist.cur, key, (cam.sync || 0) - step)); } },
      { id: 'edCamNudgeFwd', label: '+ Nudge', run: function (){ commit(P.setAssetSync(E.hist.cur, key, (cam.sync || 0) + step)); } }]));
    body.appendChild(actions([{ id: 'edCamShow', label: 'Show this camera here', run: function (){ showCamera(key); } }, { id: 'edCamMain', label: 'Back to the main video', run: function (){ showCamera('movie'); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Sync listens to the first 90 seconds of both videos and lines up the sounds, so both cameras need to have heard the same thing. To change camera in the middle, Split the clip where you want the change, then Show this camera here on the part you want. The sound you already have keeps playing; only the picture changes. If the two pictures are a frame or two apart, nudge until they match.'));
  } };
  // ----- crop (CapCut style): a dimmed picture with a frame you drag -----
  function cropAspectOf(k, vw, vh){
    if (k === 'orig') return vw / vh;
    var p = String(k).split(':'); return (p.length === 2 && +p[0] > 0 && +p[1] > 0) ? +p[0] / +p[1] : 0;
  }
  function cropAspect(){ var m = E.hooks && E.hooks.movie; return cropAspectOf(E.chip.crop || 'free', (m && m.videoWidth) || 16, (m && m.videoHeight) || 9); }
  // where the whole picture sits inside the crop layer (px)
  function cropPicRect(){
    var lay = E.ui.croplayer, m = E.hooks.movie, W = lay.clientWidth || 1, H = lay.clientHeight || 1, vw = m.videoWidth || 16, vh = m.videoHeight || 9, s = Math.min(W / vw, H / vh);
    return { x: (W - vw * s) / 2, y: (H - vh * s) / 2, w: vw * s, h: vh * s };
  }
  var CROP_HD = { nw: 'left:-2px;top:-2px', n: 'left:50%;top:-2px;margin-left:-15px', ne: 'right:-2px;top:-2px', e: 'right:-2px;top:50%;margin-top:-15px',
    se: 'right:-2px;bottom:-2px', s: 'left:50%;bottom:-2px;margin-left:-15px', sw: 'left:-2px;bottom:-2px', w: 'left:-2px;top:50%;margin-top:-15px' };
  var CROP_MK = { nw: 'top:0;left:0;width:18px;height:18px;border-top:4px solid #fff;border-left:4px solid #fff', ne: 'top:0;right:0;width:18px;height:18px;border-top:4px solid #fff;border-right:4px solid #fff',
    se: 'bottom:0;right:0;width:18px;height:18px;border-bottom:4px solid #fff;border-right:4px solid #fff', sw: 'bottom:0;left:0;width:18px;height:18px;border-bottom:4px solid #fff;border-left:4px solid #fff',
    n: 'top:0;left:50%;margin-left:-11px;width:22px;height:4px;background:#fff', s: 'bottom:0;left:50%;margin-left:-11px;width:22px;height:4px;background:#fff',
    w: 'left:0;top:50%;margin-top:-11px;width:4px;height:22px;background:#fff', e: 'right:0;top:50%;margin-top:-11px;width:4px;height:22px;background:#fff' };
  function buildCropUI(){
    var lay = E.ui.croplayer, box = mk('div');
    box.style.cssText = 'position:absolute;box-sizing:border-box;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.6);cursor:move;touch-action:none;pointer-events:auto';
    [1 / 3, 2 / 3].forEach(function (f){
      var vl = mk('i'), hl = mk('i');
      vl.style.cssText = 'position:absolute;top:0;bottom:0;width:1px;background:rgba(255,255,255,.35);pointer-events:none;left:' + (f * 100) + '%';
      hl.style.cssText = 'position:absolute;left:0;right:0;height:1px;background:rgba(255,255,255,.35);pointer-events:none;top:' + (f * 100) + '%';
      box.appendChild(vl); box.appendChild(hl);
    });
    box.addEventListener('pointerdown', function (ev){ cropDown(ev, 'move'); });
    E.ui.croph = {};
    Object.keys(CROP_HD).forEach(function (k){
      var hd = mk('div'), mark = mk('i');
      hd.style.cssText = 'position:absolute;width:30px;height:30px;touch-action:none;pointer-events:auto;cursor:' + k + '-resize;' + CROP_HD[k];
      mark.style.cssText = 'position:absolute;pointer-events:none;' + CROP_MK[k];
      hd.appendChild(mark); hd.addEventListener('pointerdown', function (ev){ cropDown(ev, k); });
      box.appendChild(hd); E.ui.croph[k] = hd;
    });
    E.ui.cropbox = box; lay.appendChild(box);
  }
  function drawCrop(){
    var lay = E.ui.croplayer, box = E.ui.cropbox; if (!lay || !box || lay.style.display === 'none') return;
    var pr = cropPicRect(), r = E.cropDraft || { x: 0, y: 0, w: 1, h: 1 }, a = cropAspect();
    box.style.left = (pr.x + r.x * pr.w) + 'px'; box.style.top = (pr.y + r.y * pr.h) + 'px'; box.style.width = (r.w * pr.w) + 'px'; box.style.height = (r.h * pr.h) + 'px';
    Object.keys(E.ui.croph).forEach(function (k){ E.ui.croph[k].style.display = (a && k.length === 1) ? 'none' : ''; });   // with a locked shape only the corners resize
  }
  function cropDown(ev, hdl){
    var c = targetVideo(); if (!c || !E.cropDraft) return;
    ev.preventDefault(); ev.stopPropagation();
    var d0 = { x: E.cropDraft.x, y: E.cropDraft.y, w: E.cropDraft.w, h: E.cropDraft.h }, pr = cropPicRect(), a = cropAspect(), x0 = ev.clientX, y0 = ev.clientY, MIN = 0.05, id = c.id;
    function mv(e){
      var dx = (e.clientX - x0) / (pr.w || 1), dy = (e.clientY - y0) / (pr.h || 1), r;
      if (hdl === 'move') r = { x: clamp(d0.x + dx, 0, 1 - d0.w), y: clamp(d0.y + dy, 0, 1 - d0.h), w: d0.w, h: d0.h };
      else {
        var L = d0.x, T = d0.y, R = d0.x + d0.w, B = d0.y + d0.h;
        if (hdl.indexOf('w') >= 0) L = clamp(d0.x + dx, 0, R - MIN);
        if (hdl.indexOf('e') >= 0) R = clamp(d0.x + d0.w + dx, L + MIN, 1);
        if (hdl.indexOf('n') >= 0) T = clamp(d0.y + dy, 0, B - MIN);
        if (hdl.indexOf('s') >= 0) B = clamp(d0.y + d0.h + dy, T + MIN, 1);
        if (a && hdl.length === 2){   // locked shape: the opposite corner stays put
          var w = R - L, h = w * pr.w / (a * pr.h), room = hdl.indexOf('n') >= 0 ? B : 1 - T;
          if (h > room){ h = room; w = h * a * pr.h / pr.w; }
          if (w < MIN){ w = MIN; h = w * pr.w / (a * pr.h); }
          if (hdl.indexOf('w') >= 0) L = R - w; else R = L + w;
          if (hdl.indexOf('n') >= 0) T = B - h; else B = T + h;
        }
        r = { x: L, y: T, w: R - L, h: B - T };
      }
      E.cropDraft = r; drawCrop();
    }
    function up(){
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      commit(P.setCrop(E.hist.cur, id, E.cropDraft));
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  // Shows the frame while the Crop panel is open. The preview then shows the whole picture; when the panel closes it shows the crop again.
  function syncCrop(){
    var lay = E.ui.croplayer; if (!lay) return;
    var c = (E.panel === 'crop' && E.isOpen) ? targetVideo() : null, on = !!c;
    if (on){ if (!E.ui.cropbox) buildCropUI(); lay.style.display = 'block'; drawCrop(); } else lay.style.display = 'none';
    if (on !== !!E.cropOn){ E.cropOn = on; if (E.isOpen) syncMedia(); }
  }
  // ----- scroll cues: arrows and soft edges on every row that scrolls sideways, so you can tell there is more to the left or the right -----
  G.fwd = svg('<path d="M9 5l7 7-7 7"/>');
  G.pick = svg('<path d="M20.5 3.5a2.1 2.1 0 00-3 0L14 7l-1-1-1.5 1.5 1 1L5 15.5V19h3.5l7-7 1 1L18 11.5l-1-1 3.5-3.5a2.1 2.1 0 000-3z"/>');
  var KFD_OFF = svg('<path d="M12 3l8 9-8 9-8-9z"/>'), KFD_ON = svg('<path d="M12 3l8 9-8 9-8-9z"/>', true);
  function cueScroller(sc, big){
    var w = mk('div', 'ed-sw' + (big ? ' big' : '')), l = btn(null, null, 'ed-sarr l', 'Scroll left'), r = btn(null, null, 'ed-sarr r', 'Scroll right');
    l.innerHTML = G.back; r.innerHTML = G.fwd; l.tabIndex = -1; r.tabIndex = -1;
    function upd(){ var max = sc.scrollWidth - sc.clientWidth; w.classList.toggle('can-l', sc.scrollLeft > 3); w.classList.toggle('can-r', max - sc.scrollLeft > 3); }
    function by(dir){ return function (ev){ ev.preventDefault(); var d = Math.max(120, sc.clientWidth * 0.7) * dir; if (sc.scrollBy) sc.scrollBy({ left: d, behavior: 'smooth' }); else sc.scrollLeft += d; }; }
    l.onclick = by(-1); r.onclick = by(1);
    sc.addEventListener('scroll', upd, { passive: true });
    add(w, sc, l, r);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(upd).observe(sc);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(upd);
    setTimeout(upd, 80);
    return w;
  }
  function chips(list, cur, pick){ return cueScroller(chipsRaw(list, cur, pick), false); }
  // The first time a row of tools needs scrolling, it slides a little and back, to show that it moves.
  function peekRow(sc){
    if (!sc || !E.tool) return; E.peeked = E.peeked || {};
    if (E.peeked[E.tool]) return;
    setTimeout(function (){
      if (!sc.parentNode || sc.scrollWidth <= sc.clientWidth + 24 || sc.scrollLeft > 0) return;
      E.peeked[E.tool] = 1;
      try { sc.scrollTo({ left: 56, behavior: 'smooth' }); setTimeout(function (){ try { sc.scrollTo({ left: 0, behavior: 'smooth' }); } catch (e) {} }, 650); } catch (e) {}
    }, 350);
  }
  // When a clip is selected, its own tools come first and the "add something" tools go to the end, so Edit is never hidden off to the right.
  (function (){
    var CREATE = { overlay: ['edAddOverlay', 'edAddShape', 'edAddArrow', 'edAddSpot', 'edAddFrame'], sticker: ['edAddSticker'], fx: ['edAddFx'], text: ['edAddText', 'edTextTpl', 'edCaptions'] };
    var WHICH = { overlay: function (){ return selOverlay(); }, sticker: function (){ return selSticker(); }, fx: function (){ return selFx(); }, text: function (){ return selText(); } };
    Object.keys(CREATE).forEach(function (k){
      var orig = ROWS[k];
      ROWS[k] = function (){
        var items = orig(); if (!WHICH[k]()) return items;
        var a = [], b = []; items.forEach(function (it){ (CREATE[k].indexOf(it.id) >= 0 ? b : a).push(it); });
        return a.concat(b);
      };
    });
  })();

  // ----- the keyframe bar (CapCut style): ◀ ◆ ▶ and the easing graph, always in reach while a clip is selected -----
  function kfState(){
    var f = E.sel && E.proj && P.findClip(E.proj, E.sel); if (!f || !P.keyframeProps) return null;
    var c = f.clip, props = P.keyframeProps(E.proj, c.id); if (!props.length) return null;
    var rel = relNow(c), times = P.keyframeTimes(E.proj, c.id), out = E.t < c.start || E.t > c.start + c.dur;
    return { c: c, rel: rel, out: out, n: times.length, here: !out && P.keyframesHere(E.proj, c.id, rel).length > 0,
      pt: P.neighbourKeyframe(E.proj, c.id, out ? (E.t < c.start ? -1 : c.dur + 1) : rel, -1), nt: P.neighbourKeyframe(E.proj, c.id, out ? (E.t < c.start ? -1 : c.dur + 1) : rel, 1) };
  }
  function kfBar(){
    var st = kfState(); if (!st){ E.ui.kfparts = null; return null; }
    var bar = mk('div', 'ed-kfbar'), prev = iconBtn('edKfPrev', G.back, 'Previous keyframe', 'ed-ibtn ed-kfb'), nxt = iconBtn('edKfNext', G.fwd, 'Next keyframe', 'ed-ibtn ed-kfb'),
      dia = iconBtn('edKfDiamond', KFD_OFF, 'Add keyframe', 'ed-ibtn ed-kfb ed-kfd'), ez = iconBtn('edKfEase', G.curve, 'Easing', 'ed-ibtn ed-kfb'), lab = mk('span', 'ed-kfn');
    prev.onclick = function (){ var s = kfState(); if (s && s.pt != null) seek(s.c.start + s.pt); };
    nxt.onclick = function (){ var s = kfState(); if (s && s.nt != null) seek(s.c.start + s.nt); };
    dia.onclick = function (){ var s = kfState(); if (s && !s.out) commit(P.toggleKeyframes(E.hist.cur, s.c.id, s.rel)); };
    ez.onclick = function (){ openPanel('keyease'); };
    add(bar, prev, dia, nxt, ez, lab);
    E.ui.kfparts = { bar: bar, prev: prev, nxt: nxt, dia: dia, ez: ez, lab: lab, here: null, text: '' };
    updateKfBar();
    return bar;
  }
  // Called whenever the playhead moves, so the diamond fills in on a keyframe and the arrows know where the next one is.
  function updateKfBar(){
    var k = E.ui.kfparts; if (!k || !k.bar.parentNode) return;
    var st = kfState(); if (!st) return;
    k.prev.disabled = st.pt == null; k.nxt.disabled = st.nt == null; k.dia.disabled = st.out; k.ez.disabled = !st.here;
    if (k.here !== st.here){ k.here = st.here; k.dia.classList.toggle('on', st.here); k.dia.innerHTML = st.here ? KFD_ON : KFD_OFF; k.dia.setAttribute('aria-label', st.here ? 'Remove keyframe' : 'Add keyframe'); }
    var text = st.out ? 'Move the playhead onto this clip' : st.n ? st.n + ' keyframe' + (st.n === 1 ? '' : 's') + (st.here ? ' \u00b7 on one now' : '') : 'Tap the diamond to add a keyframe';
    if (k.text !== text){ k.text = text; k.lab.textContent = text; }
  }

  // ----- the colour picker for Chroma key: a ring you drag over the picture, like CapCut's -----
  // The colour under the ring, read from the overlay itself (before it is keyed), as #rrggbb; null when the ring is not on the overlay.
  function samplePoint(c, fx, fy){
    var d = E.overlayEls && E.overlayEls[c.id]; if (!d) return null;
    var sw = d.videoWidth || d.naturalWidth || 0, sh = d.videoHeight || d.naturalHeight || 0, lay = E.ui.overlaylayer, W = lay.clientWidth, H = lay.clientHeight;
    if (!sw || !sh || !W || !H) return null;
    var s = NANIM.overlayState(c, E.t - c.start), bw = s.size * W, bh = bw * sh / sw, a = s.rot * Math.PI / 180, dx = fx * W - s.x * W, dy = fy * H - s.y * H;
    var lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a), u = lx / bw + 0.5, v = ly / bh + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    var cv = E.pickCv || (E.pickCv = document.createElement('canvas')); cv.width = cv.height = 5;
    try {
      var g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(d, clamp(u * sw - 2.5, 0, sw - 5), clamp(v * sh - 2.5, 0, sh - 5), 5, 5, 0, 0, 5, 5);
      var px = g.getImageData(0, 0, 5, 5).data, r = 0, gg = 0, b = 0, n = 0;
      for (var i = 0; i < px.length; i += 4){ if (px[i + 3] < 10) continue; r += px[i]; gg += px[i + 1]; b += px[i + 2]; n++; }
      if (!n) return null;
      var hx = function (x){ var t = Math.round(x / n).toString(16); return t.length < 2 ? '0' + t : t; };
      return '#' + hx(r) + hx(gg) + hx(b);
    } catch (e) { return null; }
  }
  function syncPicker(){
    var lay = E.ui.overlaylayer; if (!lay) return;
    var c = (E.panel === 'chromakey' && E.pickOn) ? selOverlay() : null, pk = E.ui.picker;
    if (!c || !c.chroma || c.gen){ if (pk) pk.style.display = 'none'; return; }
    if (!pk){ pk = E.ui.picker = mk('div', 'ed-picker'); pk.appendChild(mk('i')); pk.addEventListener('pointerdown', pickerDown); }
    if (pk.parentNode !== lay) lay.appendChild(pk);
    if (E.pickId !== c.id || !E.pickPos){
      E.pickId = c.id;
      var s = NANIM.overlayState(c, E.t - c.start), W = lay.clientWidth || 1, H = lay.clientHeight || 1, d = E.overlayEls && E.overlayEls[c.id], dw = d && (d.videoWidth || d.naturalWidth), dh = d && (d.videoHeight || d.naturalHeight), asp = dw && dh ? dh / dw : 9 / 16;
      E.pickPos = { x: clamp(s.x - 0.4 * s.size, 0.04, 0.96), y: clamp(s.y - 0.4 * s.size * asp * W / H, 0.04, 0.96) };
    }
    pk.style.display = 'block'; pk.style.left = (E.pickPos.x * 100) + '%'; pk.style.top = (E.pickPos.y * 100) + '%';
  }
  function pickerDown(ev){
    var c = selOverlay(); if (!c) return;
    ev.preventDefault(); ev.stopPropagation();
    var lay = E.ui.overlaylayer, fx = function (o){ return P.setOverlayFx(E.hist.cur, c.id, o); };
    function at(e){
      var r = lay.getBoundingClientRect();
      E.pickPos = { x: clamp((e.clientX - r.left) / (r.width || 1), 0, 1), y: clamp((e.clientY - r.top) / (r.height || 1), 0, 1) };
      E.ui.picker.style.left = (E.pickPos.x * 100) + '%'; E.ui.picker.style.top = (E.pickPos.y * 100) + '%';
      return samplePoint(c, E.pickPos.x, E.pickPos.y);
    }
    function mv(e){ var col = at(e); if (col){ live(fx({ chroma: { color: col } })); E.ui.picker.firstChild.style.background = col; } }
    function up(e){
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      var col = at(e); if (col) commit(fx({ chroma: { color: col } }));
    }
    mv(ev);
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  // ----- sound effects -----
  function placeSfx(info){
    var out = {}, q = P.addSfx(E.hist.cur, Math.round(E.t), info, out);
    if (q === E.hist.cur){ toast('There is no room for a sound effect at the playhead.'); return; }
    E.hooks.setSfxFile(out.asset, info.file);
    E.sel = out.id; commit(q); closePanel(); toast('Added at the playhead. Press play to hear it.');
  }
  function addSfxBuiltin(key){
    if (!NSFX || !E.hooks.setSfxFile){ toast('Sound effects are not available here.'); return; }
    var def = NSFX.find(key), wav = NSFX.toWav(NSFX.render(key, 48000), 48000);
    placeSfx({ file: new File([wav], key + '.wav', { type: 'audio/wav' }), name: def.label, durMs: def.durMs });
  }
  function addSfxFromFile(){
    if (!E.hooks.pickSfx || !E.hooks.setSfxFile){ toast('Importing sounds is not available here.'); return; }
    pause();
    Promise.resolve(E.hooks.pickSfx()).then(function (info){ if (info) placeSfx(info); });
  }
  // The effects that sound at the playhead: one small audio element each, kept in step with the playhead.
  function syncSfx(s){
    if (!E.sfxEls) E.sfxEls = {};
    var want = {};
    s.audio.forEach(function (a){
      if (a.role !== 'sfx') return;
      var c = a.clip, url = E.hooks.sfxUrl ? E.hooks.sfxUrl(c.asset) : ''; if (!url) return;
      want[c.id] = true;
      var d = E.sfxEls[c.id]; if (!d){ d = E.sfxEls[c.id] = new Audio(); d.preload = 'auto'; d._src = ''; }
      if (d._src !== url){ d._src = url; d.src = url; }
      d.volume = Math.max(0, Math.min(1, a.gain));
      var at = a.sourceMs / 1000;
      if (E.playing){
        if (d.paused){ d.currentTime = at; var pr = d.play(); if (pr && pr.catch) pr.catch(function (){}); }
        else if (Math.abs(d.currentTime - at) > 0.3) d.currentTime = at;
      } else if (!d.paused) d.pause();
    });
    Object.keys(E.sfxEls).forEach(function (id){ if (!want[id]){ try { E.sfxEls[id].pause(); } catch (e) {} delete E.sfxEls[id]; } });
  }
  function pauseSfx(){ Object.keys(E.sfxEls || {}).forEach(function (id){ try { E.sfxEls[id].pause(); } catch (e) {} }); }
  function removeSfx(){ pauseSfx(); E.sfxEls = {}; }
  // ----- auto captions -----
  function applyCaptionItems(items){
    var had = P.captionList(E.hist.cur).length;
    if (had && !confirm('Replace your ' + had + ' caption lines with the ' + items.length + ' new ones?')){ renderDock(); return; }
    var out = {}, q = P.addCaptions(E.hist.cur, items, { replace: true }, out);
    if (q === E.hist.cur && !out.added){ toast('None of the lines fit the video.'); renderDock(); return; }
    commit(q); openPanel('captions', 'text');
    toast(out.added + ' caption line' + (out.added === 1 ? '' : 's') + ' added. Check them, speech recognition makes mistakes.', 8000);
  }
  // Works for any language: a caption slot for every stretch where you were talking. You type the words.
  function markSpeech(){
    var ranges = NCAP.chunkRanges(P.speechRanges(E.hist.cur, { thresholdDb: E.quietDb }), 6000);
    if (!ranges.length){ toast('No speech was found in your recording.'); return; }
    applyCaptionItems(ranges.map(function (r){ return { startMs: r.start, endMs: r.end, text: '\u2026' }; }));
  }
  // ----- auto captions from the movie's own sound -----
  function noNarration(){ return !!(E.sess && (E.sess.warnings || []).some(function (w){ return w.type === 'no_narration'; })); }
  var movieAudioLib = null;
  // The movie's sound as a small mono 16000 Hz WAV file (what the speech model reads), so a big video is never decoded whole in memory.
  function extractMovieAudio(file, say){
    if (!movieAudioLib) movieAudioLib = import(new URL('vendor/mediabunny/mediabunny.min.mjs', location.href).href);
    return movieAudioLib.then(function (M){
      var input = new M.Input({ source: new M.BlobSource(file), formats: M.ALL_FORMATS }), output = new M.Output({ format: new M.WavOutputFormat(), target: new M.BufferTarget() });
      return M.Conversion.init({ input: input, output: output, video: { discard: true }, audio: { codec: 'pcm-s16', sampleRate: 16000, numberOfChannels: 1 } }).then(function (conv){
        if (!conv.isValid) throw new Error('this movie has no sound that can be read');
        conv.onProgress = function (p){ say('Reading the movie\u2019s sound... ' + Math.round(p * 100) + '%'); };
        return conv.execute().then(function (){ return new Blob([output.target.buffer], { type: 'audio/wav' }); });
      });
    });
  }
  function runAutoCaptions(langKey, source){
    if ((source || (noNarration() ? 'movie' : 'voice')) !== 'movie') return runAutoCaptionsVoice(langKey);
    if (E.ac && E.ac.running) return;
    var file = E.hooks.getAssetFile && E.hooks.getAssetFile('movie'), lane = E.proj.tracks.filter(function (t){ return t.role === 'movie'; })[0];
    var clips = lane ? lane.clips.filter(function (c){ return c.type === 'video' && (!c.asset || c.asset === 'movie') && !c.reverse; }) : [];
    if (!file){ toast('The movie file is not available here. Choose the movie for this session first.'); return; }
    if (!clips.length){ toast('There is no part of the original movie on the timeline to listen to.'); return; }
    pause(); E.ac = { running: true, msg: 'Starting...' }; renderDock();
    var status = function (m){ if (E.ac) E.ac.msg = m; if (E.acStatus) E.acStatus.textContent = m; };
    extractMovieAudio(file, status).catch(function (err){ console.warn('could not read the movie sound out, trying the whole file', err); status('Trying the whole file...'); return file; }).then(function (src){
      return NCAP.recognize(src, { language: langKey, onStatus: status });
    }).then(function (segs){
      var items = NCAP.splitLines(NCAP.toTimeline(segs, clips), 42);
      E.ac = null;
      if (!items.length){ toast('No speech was found in the movie, in the parts you kept. Check the language, or the movie may have no speech.', 8000); renderDock(); return; }
      applyCaptionItems(items);
    }).catch(function (err){
      E.ac = null; console.error('auto captions from the movie failed', err); renderDock();
      toast('Auto captions did not work' + (err && err.message ? ': ' + err.message : '') + '. The first time it needs internet. A very long movie may be too much for this device.', 10000);
    });
  }
  function runAutoCaptionsVoice(langKey){
    if (E.ac && E.ac.running) return;
    var blob = E.hooks.getVoiceBlob && E.hooks.getVoiceBlob();
    if (!blob || !blob.size){ toast('There is no voice recording to listen to.'); return; }
    pause(); E.ac = { running: true, msg: 'Starting...' }; renderDock();
    var status = function (m){ if (E.ac) E.ac.msg = m; if (E.acStatus) E.acStatus.textContent = m; };
    NCAP.recognize(blob, { language: langKey, onStatus: status }).then(function (segs){
      var items = P.captionsFromVoice(E.hist.cur, NCAP.splitLines(segs, 42));
      E.ac = null;
      if (!items.length){ toast('No speech was found in the part of the recording you kept.', 7000); renderDock(); return; }
      applyCaptionItems(items);
    }).catch(function (err){
      E.ac = null; console.error('auto captions failed', err); renderDock();
      toast('Auto captions did not work' + (err && err.message ? ': ' + err.message : '') + '. The first time it needs internet.', 10000);
    });
  }
  // A filter preset puts every slider where it wants it, including the ones that came later (highlights, shadows, tint, hue, grain).
  function presetPatch(k, a){ return Object.assign({ highlights: 0, shadows: 0, tint: 0, hue: 0, grain: 0 }, NPR['apply'](k, a)); }
  // ----- the extra Adjust sliders in the preview -----
  // Hue, and the tone curve (highlights and shadows), are filters on the picture; tint and grain are layers over it. Preview only: the export is exact.
  function lookExtras(look){
    var u = E.ui; if (!NL2 || !u.toneR) return '';
    var tb = NL2.previewTone(look).join(' ');
    if (E.lastTone !== tb){ u.toneR.setAttribute('tableValues', tb); u.toneG.setAttribute('tableValues', tb); u.toneB.setAttribute('tableValues', tb); E.lastTone = tb; }
    var tint = NL2.previewTint(look), grain = NL2.previewGrain(look);
    if (tint !== E.lastTint2){ u.tint2.style.background = tint; u.tint2.style.display = tint ? 'block' : 'none'; E.lastTint2 = tint; }
    E.grainBase = grain;
    return (tb !== '0 0.25 0.5 0.75 1' ? 'url(#nakiTone) ' : '') + NL2.previewHue(look) + ' ';
  }
  // ----- video effects: shake, glitch, blur, flash, RGB split, film grain -----
  function syncFx(){
    var u = E.ui; if (!NL2 || !u.fxflash || !E.proj || !E.proj.tracks) return;
    var r = (NFX && NFX.vfx) ? NFX.vfx.preview(P.fxAt(E.proj, E.t), E.t) : NL2.previewFx(P.fxAt(E.proj, E.t), E.t); applyFxExtras(r);
    u.picbox.style.transform = r.transform; u.picbox.style.filter = r.filter.trim();
    var fl = String(Math.round(r.flash * 1000) / 1000); if (fl !== u.fxflash._o){ u.fxflash.style.opacity = fl; u.fxflash._o = fl; }
    var gr = String(Math.round(Math.max(r.grain, E.grainBase || 0) * 1000) / 1000); if (gr !== u.grain._o){ u.grain.style.opacity = gr; u.grain.style.display = +gr ? 'block' : 'none'; u.grain._o = gr; }
  }
  function selFx(){ var f = E.sel && P.findClip(E.proj, E.sel); return f && f.track.kind === 'fx' ? f.clip : null; }
  function addFxHere(key){
    var out = {}, q = P.addFx(E.hist.cur, Math.round(E.t), key, out);
    if (q === E.hist.cur){ toast('There is no room for an effect at the playhead.'); return; }
    E.sel = out.id; commit(q); openPanel('fxedit', 'fx');
  }
  // ----- text templates and animation -----
  function applyTemplate(key){
    var tp = NTPL && NTPL.find(key); if (!tp) return;
    var c = selText(), q, id;
    if (c){ q = P.setTextProps(E.hist.cur, c.id, tp.style); id = c.id; }
    else {
      var out = {}; q = P.addTextClip(E.hist.cur, Math.round(E.t), 3000, out);
      if (q === E.hist.cur){ toast('There is no room for text at the playhead. Move it or shorten the other text.'); return; }
      id = out.id; q = P.setTextProps(q, id, Object.assign({ text: tp.text }, tp.style));
    }
    q = P.setTextAnim(q, id, tp.anim); E.sel = id; commit(q);
  }
    // ----- the speed curve graph (Speed > Curve) -----
  var CVG = { W: 300, H: 130, x0: 14, x1: 286, y0: 12, y1: 116 };
  function cvX(u){ return CVG.x0 + u * (CVG.x1 - CVG.x0); }
  function cvY(v){ return CVG.y1 - Math.log(v / 0.25) / Math.log(16) * (CVG.y1 - CVG.y0); }
  function cvU(x){ return clamp((x - CVG.x0) / (CVG.x1 - CVG.x0), 0, 1); }
  function cvV(y){ return clamp(0.25 * Math.pow(16, (CVG.y1 - y) / (CVG.y1 - CVG.y0)), 0.25, 4); }
  // How long the picture's own stretch of movie is (ms) and how long it plays for now (they differ once it has a speed).
  function curveSpan(c){
    var info = P.speedCurveOf(E.hist.cur, c.id);
    if (!info) return { now: c.dur, span: c.dur * (c.speed || 1) };
    var now = 0, span = 0; P.curvePieces(E.hist.cur, info.g).forEach(function (p){ now += p.dur; span += p.dur * (p.speed || 1); });
    return { now: now, span: span };
  }
  function layoutTextLayer(){ layoutTextLayerBase(); layoutPicture(); syncStickers(); syncOverlays(); drawCrop(); syncTrackBox(); }
  function layoutTextLayerBase(){
    var m = E.hooks && E.hooks.movie, st = E.ui.stage, boxes = [E.ui.textlayer, E.ui.picframe, E.ui.stickerlayer, E.ui.overlaylayer, E.ui.croplayer]; if (!boxes[0]) return;
    var sw = st.clientWidth, sh = st.clientHeight, vw = m && m.videoWidth, vh = m && m.videoHeight;
    if (m && E.curAsset && E.curAsset !== 'movie' && E.frameDims) { vw = E.frameDims.w; vh = E.frameDims.h; } else if (vw && vh) E.frameDims = { w: vw, h: vh };   // an added video is fitted inside this frame
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
  // word highlight in the preview: each word is its own span, the spoken one gets the colour
  function hlPreview(d, c, text){
    var words = String(text).split(/\s+/).filter(Boolean), key = words.join(' ');
    if (d._hlTxt !== key){
      d._sp.textContent = ''; d._hlSp = [];
      words.forEach(function (w, i){ if (i) d._sp.appendChild(document.createTextNode(' ')); var s = mk('span', null, w); d._sp.appendChild(s); d._hlSp.push(s); });
      d._hlTxt = key; d._txt = null;
    }
    var wt = P.wordTimes(c, c.dur), on = P.wordIndexAt(wt, E.t - c.start);
    d._hlSp.forEach(function (s, i){ var col = i === on ? c.hl : ''; if (s._col !== col){ s.style.color = col; s._col = col; } });
  }
  function renderTexts(list){
    var layer = E.ui.textlayer; if (!layer) return;
    var want = {};
    list.forEach(function (c){
      want[c.id] = true;
      var d = E.textEls[c.id];
      var sty = isStyledText(c);   // a title with effects is drawn on a canvas by look.js, the same drawing the exports use
      if (d && !!d._styled !== sty){ d.remove(); delete E.textEls[c.id]; d = null; }
      if (sty){ paintStyledText(layer, c); return; }
      if (!d){
        // the dark box is a box around the words only (like the export draws it): an inline box with the same padding the export uses (0.4 letters each side, 0.2 above and below)
        d = E.textEls[c.id] = mk('div', 'ed-textov'); d._sp = mk('span'); d._sp.style.cssText = 'display:inline-block;padding:0.2em 0.4em;white-space:pre-wrap;word-break:break-word';
        d.style.left = d.style.right = 'calc(6% - 0.4em)'; d.appendChild(d._sp); layer.appendChild(d); layoutTextLayer();
      }
      var shownText = c.text || '', stt = (c.anim && NMO) ? NMO.textState(c.anim, E.t - c.start, c.dur) : null;   // typewriter: only the typed part
      if (stt && stt.chars < 1) shownText = NMO.visibleText(shownText, stt.chars);
      if (c.hl && !stt && P.wordTimes) hlPreview(d, c, shownText);
      else {
        if (d._hlSp){ d._hlSp = null; d._hlTxt = null; d._txt = null; }
        if (d._txt !== shownText){ d._sp.textContent = shownText; d._txt = shownText; }
      }
      var st = lookLib().titleStyle(c, layer.clientHeight || 240);
      d.style.fontSize = st.px + 'px'; d.style.fontFamily = st.fontFamily; d.style.textShadow = st.shadow;
      d.style.webkitTextStroke = st.stroke; d.style.paintOrder = 'stroke fill';
      d.style.color = c.color || '#fff'; d.style.fontWeight = c.weight || 700;
      d.style.top = ((NP.TEXT_POS[c.pos] != null ? NP.TEXT_POS[c.pos] : NP.TEXT_POS.bottom) * 100) + '%';
      d._sp.style.background = c.bg ? 'rgba(0,0,0,.55)' : 'transparent';
      var an = c.anim && NMO ? NMO.textState(c.anim, E.t - c.start, c.dur) : null;
      if (an){
        var LW = layer.clientWidth || 320, LH = layer.clientHeight || 240;
        d.style.transformOrigin = '50% 50%'; d.style.opacity = shownText ? String(an.alpha) : '0';
        d.style.transform = 'translate(' + (an.dx * LW) + 'px,' + (an.dy * LH) + 'px) rotate(' + an.rot + 'deg) scale(' + an.scale + ')';
      } else { if (d.style.transform) d.style.transform = ''; if (d.style.opacity) d.style.opacity = ''; }
    });
    list.forEach(function (c){   // a tracked text is moved by its offset from the usual place
      var d = E.textEls[c.id], sh = NANIM ? NANIM.shiftOf(c, E.t - c.start) : null; if (!d || !sh || (!sh.x && !sh.y)) return;
      d.style.transform = 'translate(' + (sh.x * (layer.clientWidth || 320)) + 'px,' + (sh.y * (layer.clientHeight || 240)) + 'px) ' + (d.style.transform || '');
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
    try {
      var src = ctx.createMediaElementSource(el), g = ctx.createGain(), tail = src;
      if (key === 'voiceGain' && NFX && NFX.voice){ E.voiceFx = NFX.voice.makeNodes(ctx); NFX.voice.setNodes(E.voiceFx, null); src.connect(E.voiceFx.input); tail = E.voiceFx.output; }
      tail.connect(g); g.connect(ctx.destination); E[key] = g;
    } catch (e) {}
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
    var css = lookExtras(look) + (ex.sharpen ? 'url(#nakiSharp) ' : '') + (look ? 'brightness(' + look.brightness + ') contrast(' + look.contrast + ') saturate(' + look.saturate + ')' : '') + (fo < 1 ? ' brightness(' + fo.toFixed(3) + ')' : '');
    var tintBg = LK.tintCss(ex.warmth) || '', veilBg = [LK.vignetteCss(ex.vignette), LK.matteCss(ex.matte)].filter(Boolean).join(', ');
    if (tintBg !== E.lastTint){ E.ui.tint.style.background = tintBg; E.ui.tint.style.display = tintBg ? 'block' : 'none'; E.lastTint = tintBg; }
    if (veilBg !== E.lastVeil){ E.ui.veil.style.background = veilBg; E.ui.veil.style.display = veilBg ? 'block' : 'none'; E.lastVeil = veilBg; }
    if (ex.sharpen !== E.lastSharp){ if (ex.sharpen) E.ui.sharpK.setAttribute('kernelMatrix', LK.sharpenKernel(ex.sharpen)); E.lastSharp = ex.sharpen; }
    // A clip from another file (Add video) swaps the file the preview's video element shows.
    var photo = !!(vc && vc.type === 'freeze' && isPhotoClip(vc)), em = photo ? photoEl() : m, wantAsset = (vc && vc.asset) || 'movie', skipMedia = false;
    photoSync(photo, vc);
    if (vc && !photo && wantAsset !== E.curAsset) skipMedia = !swapSource(wantAsset, m);
    if (photo && !(E.hooks.videoUrl && E.hooks.videoUrl(vc.asset))) skipMedia = true;
    if (skipMedia !== !!E.skipMsg){ E.skipMsg = skipMedia; E.ui.stageMsg.textContent = skipMedia ? 'The file for this part is missing. Use Add video to add it again.' : (movieReady() ? '' : 'Choose the movie for this session in Preview first, then come back to edit.'); }
    var op = vc ? String(vc.opacity != null ? vc.opacity : 1) : '0';
    var tcss = vc ? (E.cropOn ? framePicture(null, em, null) : framePicture((vc.kf && NANIM) ? NANIM.pictureTransform(vc.transform, vc.kf, E.t - vc.start) : vc.transform, em, vc.crop)) : '';
    if (tcss !== E.lastTransform){ em.style.transform = tcss; E.lastTransform = tcss; }
    if (css !== E.lastFilter){ em.style.filter = css; E.lastFilter = css; }
    if (op !== E.lastOpacity){ em.style.opacity = op; E.lastOpacity = op; }
    if (photo){ if (!m.paused) m.pause(); } else if (movieReady() && !E.swapping && !skipMedia){
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
    syncStickers(); syncOverlays(); syncSfx(s); syncFx(); syncTransition(m, s, vc); syncScopes(); syncLayout(m, photo ? null : vc, css); syncGrade(m, photo ? null : vc, css);
    var ms = null, vo = null, mu = null;
    s.audio.forEach(function (a){ if (a.role === 'movieSound') ms = a; else if (a.role === 'voice') vo = a; else if (a.role === 'music') mu = a; });
    h.setMovieGain(ms && !ms.clip.reverse ? ms.gain : 0);
    applyVoiceFx();
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
    try { E.hooks.movie.pause(); E.hooks.voice.pause(); if (E.hooks.music) E.hooks.music.pause(); E.ui.bgvid.pause(); E.ui.xvid.pause(); pauseOverlays(); pauseSfx(); } catch (e) {}
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
    var kfD = tg.closest && tg.closest('.ed-kf');
    var mkF = tg.closest && tg.closest('.ed-mflag');
    if (mkF){ markerTap(mkF.dataset.id); return; }
    if (kfD && clipE){ var kf0 = P.findClip(E.proj, clipE.dataset.id); if (kf0){ E.sel = kf0.clip.id; seek(kf0.clip.start + (+kfD.dataset.t || 0)); renderSelectionOnly(); return; } }
    if (ev.pointerType === 'touch'){
      E.pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      if (Object.keys(E.pointers).length === 2){ endDrag(true); startPinch(); return; }
    }
    if (E.pinch) return;
    if (clipE){
      var id = clipE.dataset.id, f = P.findClip(E.proj, id); if (!f) return;
      if (E.pickMulti && E.tool === 'select' && !handle){   // Pick clips: each tap adds the clip to the selection or takes it out
        delete E.pointers[ev.pointerId]; E.multi = E.multi || {}; if (E.multi[id]) delete E.multi[id]; else E.multi[id] = true; E.sel = null; renderSelectionOnly(); return;
      }
      if (E.multi && Object.keys(E.multi).length) E.multi = {};
      var wasSel = E.sel === id; E.sel = id; var tr = f.track, c = f.clip;
      var gm = P.groupIds ? P.groupIds(E.proj, id) : [id]; if (gm.length > 1){ E.multi = {}; gm.forEach(function (g){ E.multi[g] = true; }); }   // a group is selected as a whole
      if (tr.locked){ renderSelectionOnly(); toast('This row is locked. Tap its lock to edit it.'); return; }
      E.drag = { mode: handle ? (handle.classList.contains('ed-hl') ? 'trimL' : 'trimR') : 'pending', id: id, x0: ev.clientX, y0: ev.clientY, el: clipE, tr: tr,
        s0: c.start, e0: c.start + c.dur, touch: ev.pointerType === 'touch', moved: false, press: 0, timer: 0, wasSel: wasSel, sl0: E.ui.scroll.scrollLeft, lastX: ev.clientX };
        if (E.drag.mode === 'pending' && E.drag.touch && wasSel && tr.kind !== 'video') E.drag.mode = 'move';
      if (E.drag.mode === 'pending' && E.drag.touch) E.drag.press = setTimeout(function (){
        if (E.drag && E.drag.mode === 'pending'){ E.drag.mode = 'move'; try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} }
      }, 300);
      
      renderSelectionOnly();
    } else {
      if (ev.pointerType === 'touch' && !(tg.closest && tg.closest('.ed-ruler'))) E.drag = { mode: 'tap', x0: ev.clientX, y0: ev.clientY, t: xToT(ev.clientX) };
else { E.drag = { mode: 'scrub' }; seek(xToT(ev.clientX)); }
    }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onCancel);
  }
  function renderSelectionOnly(){
    var els = E.ui.inner.querySelectorAll('.ed-clip');
    for (var i = 0; i < els.length; i++){ els[i].classList.toggle('sel', els[i].dataset.id === E.sel); els[i].classList.toggle('multi', !!(E.multi && E.multi[els[i].dataset.id])); }
    renderSelected(); updateButtons(); syncDock(); try { syncOverlays(); } catch (e) {}
  }
  function snapped(t){ return P.snapTime(E.proj, t, snapTh(), snapPts()); }
  function onMove(ev){
    if (ev.pointerType === 'touch' && E.pointers[ev.pointerId]) E.pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    if (E.pinch){ movePinch(); return; }
    var d = E.drag; if (!d) return;
    if (d.mode === 'tap'){ d.lx = ev.clientX; d.ly = ev.clientY; return; }
    var dx = ev.clientX - d.x0;
    if (d.mode === 'scrub'){ seek(xToT(ev.clientX)); return; }
    if (d.mode === 'pending'){
      if (d.touch){ if (Math.abs(dx) > 10 || Math.abs(ev.clientY - d.y0) > 10){ clearTimeout(d.press); E.drag = null; } return; }
      if ((Math.abs(dx) > 4 || Math.abs(ev.clientY - d.y0) > 4) && !d.noMove) d.mode = 'move'; else return;
    }
    if (d.touch && (d.mode === 'move' || d.mode === 'trimL' || d.mode === 'trimR') && !d.armed){
  if (Math.abs(dx) < 6 && Math.abs(ev.clientY - d.y0) < 6) return; d.armed = true;
}
    d.moved = true; var dt = dx / E.ppm;
    if (d.mode === 'trimL'){ d.newStart = clamp(snapped(d.s0 + dt), 0, d.e0 - 100); d.el.style.left = tx(d.newStart) + 'px'; d.el.style.width = Math.max(3, (d.e0 - d.newStart) * E.ppm) + 'px'; }
    else if (d.mode === 'trimR'){ d.newEnd = Math.max(d.s0 + 100, snapped(d.e0 + dt)); d.el.style.width = Math.max(3, (d.newEnd - d.s0) * E.ppm) + 'px'; }
    else if (d.mode === 'move'){ d.lastX = ev.clientX; d.lastY = ev.clientY; if (!d.timer) d.timer = setInterval(autoScrollTick, 30); moveTo(d); }
  }
  function onUp(){ endDrag(false); }
  function onCancel(){ endDrag(true); }
  function endDrag(cancel){
    var d = E.drag; E.drag = null;
    if (E.ui.snapline) E.ui.snapline.style.display = 'none';
    clearTargets();
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel);
    E.pointers = {}; E.pinch = null;
    if (!d) return; clearTimeout(d.press); clearInterval(d.timer);
    if (cancel){ renderTimeline(); return; }
    if (d.mode === 'tap'){
  if (Math.abs((d.lx || d.x0) - d.x0) < 10 && Math.abs((d.ly || d.y0) - d.y0) < 10){
    seek(d.t); if (E.sel || Object.keys(E.multi || {}).length){ E.multi = {}; select(null); }
  }
  return;
}
    if (d.mode === 'trimL' || d.mode === 'trimR') finishTrim(d);
    else if (d.mode === 'move' && d.moved){
      var cur0 = E.hist.cur, gm0 = (P.groupIds && !d.target) ? P.groupIds(cur0, d.id) : [];
      if (gm0.length > 1 && d.newStart !== d.s0){
        var gq = P.moveClips(cur0, gm0, d.newStart - d.s0);
        if (gq === cur0){ renderTimeline(); toast('There is no room to move the group there.'); } else commit(gq);
        return;
      }
      var rowMove = d.target ? P.moveClipToRow(cur0, d.id, d.target.track, d.newStart, d.target.pos) : cur0;
      if (rowMove !== cur0){ commit(rowMove); return; }
      var q = P.placeClip(cur0, d.id, d.newStart), pic0 = d.tr.role === 'movie' || d.tr.role === 'movieSound';
      if (q === cur0){ renderTimeline(); var pl0 = P.planPlace(cur0, d.id, d.newStart); if (pl0 && (pl0.start !== d.s0 || pl0.pushed)) toast('There is no room for it there.'); } else commit(pic0 ? tidy(q) : q);
    }
    else if (!d.moved && d.wasSel && !d.touch && (d.mode === 'pending' || d.mode === 'move')){ E.sel = null; renderSelectionOnly(); }   // a tap on the clip that is already selected lets go of it
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
      else if (k === 'c' || k === 'C') copySel();
      else if (k === 'v' || k === 'V'){ if (ev.shiftKey) pasteLookHere(); else pasteHere(); }
      else ok = false;
    }
    else if (k === ' ' || k === 'Enter'){ if (tag === 'BUTTON') ok = false; else togglePlay(); }
    else if (k === 's' || k === 'S') split();
    else if (k === 'm' || k === 'M') addMarkerHere();
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
    E.markSel = null; E.lastFilter = ''; E.lastOpacity = ''; E.lastRate = 1; E.lastTransform = ''; E.lastTint = E.lastVeil = ''; E.lastSharp = -1; E.boxKey = null; E.boxMode = '';
    E.curAsset = 'movie'; E.swapping = false; E.skipMsg = false; E.layoutOn = false;
    E.multi = {}; E.tool = null; E.panel = null; E.autoDock = false; E.rowScroll = null; E.chip = {}; E.pickOn = false; E.pickPos = null; E.rbg = {}; E.trkSet = {}; E.trkRun = null; renderDock();
    E.root.hidden = false; E.isOpen = true;
    document.addEventListener('keydown', onKey);
    layoutTextLayer(); fit(); readout(); syncMedia();
    if (E.hooks.proxy && E.hooks.proxy.load) E.hooks.proxy.load().then(function (s){
      if (E.isOpen && s && s.canMake && s.big && !s.have && !s.advised){ E.hooks.proxy.advised(); toast('This movie is heavy to edit on a phone. Format > Smooth editing makes a light copy so it scrubs and plays smoothly. Your export still uses the original.', 10000); }
    }).catch(function () {});
  }
  function close(){
    if (!E.isOpen) return;
    if (E.vo && E.vo.on) voiceOverStop();
    pause(); endDrag(true); try { E.ui.bgvid.pause(); } catch (e) {}
    if (E.saveT) flushSave();
    document.removeEventListener('keydown', onKey);
    var h = E.hooks; try { h.voice.volume = 1; if (E.voiceGain) E.voiceGain.gain.value = 1; if (E.musicGain) E.musicGain.gain.value = 1; h.setMovieGain(1); } catch (e) {}
    try { h.movie.style.filter = ''; h.movie.style.opacity = ''; h.movie.style.transform = ''; h.movie.playbackRate = 1; E.ui.tint.style.display = E.ui.veil.style.display = 'none'; E.lastTint = E.lastVeil = ''; E.lastSharp = -1; } catch (e) {}
    renderTexts([]); try { photoSync(false, null); } catch (e) {}
    E.layoutOn = false; try { E.ui.layoutcv.style.display = 'none'; } catch (e) {}
    E.gradeOn = false; try { if (E.ui.gradecv) E.ui.gradecv.style.display = 'none'; } catch (e) {}
    try { stopEyedrop(); } catch (e) {}
    E.xOn = false; try { E.ui.xvid.pause(); E.ui.xvid.style.display = 'none'; } catch (e) {}
    removeOverlays(); removeSfx();
    if (TS) TS.release(); if (PS) PS.release();
    Object.keys(E.stickerEls || {}).forEach(function (id){ E.stickerEls[id].remove(); }); E.stickerEls = {};
    if (E.curAsset && E.curAsset !== 'movie'){ var mu = h.movieUrl && h.movieUrl(); if (mu){ h.movie.style.objectFit = ''; h.movie.src = mu; h.movie.load(); } }   // the preview screen needs the original movie again
    E.curAsset = 'movie'; E.swapping = false;
    if (E.home && E.home.parent) E.home.parent.insertBefore(h.movie, E.home.next);
    E.root.hidden = true; E.isOpen = false;
    if (h.onClose) h.onClose();
  }

  return { init: init, open: open, close: close, isOpen: function (){ return E.isOpen; },
    project: function (){ return E.proj; }, split: split, cutOut: cutOut, deleteSel: deleteSel, undo: undo, redo: redo, select: select,
    seek: seek, planFor: planFor, scanQuiet: scanQuiet, play: play, pause: pause, setZoom: setZoom, fit: fit,
    openTool: openTool, openPanel: openPanel, closeTool: closeTool, freezeHere: freezeHere, reverseSel: reverseSel, flushSave: flushSave, duplicateSel: duplicateSel, rotateSel: rotateSel, flipSel: flipSel,
    hasEdits: hasEdits, exportStill: exportStill, replaceMovie: replaceMovie, importCaptions: importCaptions, exportSrt: exportSrt, detachSel: detachSel };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NakiEditor;

// Which version of this file is running (the Home screen lists these, so a stale copy is easy to spot).
if (typeof window !== 'undefined'){ window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['editor.js'] = 'timeline'; }
