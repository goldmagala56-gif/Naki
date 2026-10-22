'use strict';
/* Naki motion: animation for text (in / out / loop) and ready-made motion for picture and overlay clips. Pure helpers shared by the project model,
   the editor preview and both export engines, so all of them agree.
   Text:  clip.anim = { in, out, loop, inMs, outMs }  (every part optional, only stored when used).
          textState() says how a title looks at one moment: opacity, shift (fractions of the frame), size, turn and how much of the text is typed.
   Clips: clipPreset() makes keyframes for the keyframe system in anim.js (picture: zoom / x / y, overlay: x / y / size / rot / opacity). */
var NakiMotion = (function () {
  var TEXT_IN = [{ key: 'none', label: 'None' }, { key: 'fade', label: 'Fade' }, { key: 'slideup', label: 'Slide up' }, { key: 'slidedown', label: 'Slide down' },
    { key: 'slideleft', label: 'From left' }, { key: 'slideright', label: 'From right' }, { key: 'pop', label: 'Pop' }, { key: 'bounce', label: 'Bounce' },
    { key: 'spin', label: 'Spin' }, { key: 'typewriter', label: 'Typewriter' }];
  var TEXT_OUT = [{ key: 'none', label: 'None' }, { key: 'fade', label: 'Fade' }, { key: 'slideup', label: 'Slide up' }, { key: 'slidedown', label: 'Slide down' },
    { key: 'slideleft', label: 'To left' }, { key: 'slideright', label: 'To right' }, { key: 'pop', label: 'Shrink' }, { key: 'typewriter', label: 'Erase' }];
  var TEXT_LOOP = [{ key: 'none', label: 'None' }, { key: 'pulse', label: 'Pulse' }, { key: 'float', label: 'Float' }, { key: 'wiggle', label: 'Wiggle' }];
  var PICTURE_PRESETS = [{ key: 'none', label: 'None' }, { key: 'zoomin', label: 'Zoom in' }, { key: 'zoomout', label: 'Zoom out' }, { key: 'pulse', label: 'Pulse' },
    { key: 'panright', label: 'Pan right' }, { key: 'panleft', label: 'Pan left' }];
  var OVERLAY_PRESETS = [{ key: 'none', label: 'None' }, { key: 'slideleft', label: 'From left' }, { key: 'slideright', label: 'From right' }, { key: 'slideup', label: 'From below' },
    { key: 'pop', label: 'Pop' }, { key: 'spin', label: 'Spin in' }, { key: 'fadein', label: 'Fade in' }, { key: 'fadeout', label: 'Fade out' }];
  var TITLE_POS = { top: 0.07, center: 0.40, bottom: 0.76 };   // same numbers as look.js / plan.js
  var DEFAULT_MS = 500, MAX_STATES = 48, STEP_MS = 66, LOOP_STEP_MS = 125;

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function r3(x) { return Math.round(x * 1000) / 1000; }
  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }
  function easeOutBack(p) { var c1 = 1.70158, c3 = c1 + 1, x = p - 1; return 1 + c3 * x * x * x + c1 * x * x; }
  function bounceOut(p) {
    var n = 7.5625, d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) { p -= 1.5 / d; return n * p * p + 0.75; }
    if (p < 2.5 / d) { p -= 2.25 / d; return n * p * p + 0.9375; }
    p -= 2.625 / d; return n * p * p + 0.984375;
  }
  function has(list, key) { return list.some(function (x) { return x.key === key; }); }

  // How long the in / out part lasts for a title that shows for durMs (never more than half of it).
  function phaseMs(an, which, dur) {
    var v = +an[which + 'Ms']; if (!(v > 0)) v = DEFAULT_MS;
    return Math.max(0, Math.min(Math.round(v), Math.floor(dur / 2)));
  }
  function applyIn(kind, p, st) {
    var e = easeOut(p);
    if (kind === 'fade') st.alpha = p;
    else if (kind === 'slideup') { st.alpha = p; st.dy = (1 - e) * 0.08; }
    else if (kind === 'slidedown') { st.alpha = p; st.dy = -(1 - e) * 0.08; }
    else if (kind === 'slideleft') { st.alpha = p; st.dx = -(1 - e) * 0.2; }
    else if (kind === 'slideright') { st.alpha = p; st.dx = (1 - e) * 0.2; }
    else if (kind === 'pop') { st.scale = Math.max(0.01, easeOutBack(p)); st.alpha = Math.min(1, p * 4); }
    else if (kind === 'bounce') { st.dy = -(1 - bounceOut(p)) * 0.15; st.alpha = Math.min(1, p * 5); }
    else if (kind === 'spin') { st.rot = -(1 - e) * 180; st.scale = Math.max(0.01, e); st.alpha = Math.min(1, p * 3); }
    else if (kind === 'typewriter') st.chars = p;
  }
  function applyOut(kind, q, st) {
    var e = q * q;
    if (kind === 'fade') st.alpha *= 1 - q;
    else if (kind === 'slideup') { st.alpha *= 1 - q; st.dy += -e * 0.08; }
    else if (kind === 'slidedown') { st.alpha *= 1 - q; st.dy += e * 0.08; }
    else if (kind === 'slideleft') { st.alpha *= 1 - q; st.dx += -e * 0.2; }
    else if (kind === 'slideright') { st.alpha *= 1 - q; st.dx += e * 0.2; }
    else if (kind === 'pop') { st.scale *= Math.max(0.01, 1 - 0.6 * e); st.alpha *= 1 - q; }
    else if (kind === 'typewriter') st.chars = 1 - q;
  }
  function applyLoop(kind, rel, st) {
    var T = Math.PI * 2;
    if (kind === 'pulse') st.scale *= 1 + 0.06 * Math.sin(T * rel / 900);
    else if (kind === 'float') st.dy += 0.012 * Math.sin(T * rel / 1800);
    else if (kind === 'wiggle') st.rot += 3 * Math.sin(T * rel / 500);
  }
  // How a title looks relMs after it appeared, when it shows for durMs: { alpha 0-1, dx and dy (fractions of the frame width / height), scale, rot (degrees), chars (0-1 of the text typed) }.
  function textState(an, relMs, durMs) {
    an = an || {};
    var st = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, chars: 1 }, dur = Math.max(1, durMs), rel = Math.max(0, relMs);
    var inMs = an.in ? phaseMs(an, 'in', dur) : 0, outMs = an.out ? phaseMs(an, 'out', dur) : 0;
    if (inMs > 0 && rel < inMs) applyIn(an.in, clamp(rel / inMs, 0, 1), st);
    if (outMs > 0 && rel > dur - outMs) applyOut(an.out, clamp((rel - (dur - outMs)) / outMs, 0, 1), st);
    if (an.loop) applyLoop(an.loop, rel, st);
    st.alpha = clamp(st.alpha, 0, 1); st.chars = clamp(st.chars, 0, 1);
    return st;
  }
  // The first part of a text that is "typed" so far (frac 0 to 1 of its letters).
  function visibleText(text, frac) {
    var a = Array.from(String(text == null ? '' : text));
    if (frac >= 1) return a.join('');
    return a.slice(0, Math.max(0, Math.floor(frac * a.length + 1e-9))).join('');
  }
  // The y (in pixels) a title turns and grows around: the middle of its lines.
  function pivotY(t, H, nLines) {
    var px = Math.max(10, Math.round((t.size || 7) / 100 * H)), lh = Math.round(px * 1.2), y0 = Math.round((TITLE_POS[t.pos] != null ? TITLE_POS[t.pos] : TITLE_POS.bottom) * H);
    return y0 + Math.max(1, nLines || 1) * lh / 2;
  }
  // The ffmpeg engine cannot change a picture from frame to frame, so an animated title becomes a short list of still pictures:
  // [{ a, b, st }] (ms since the title appeared, and the state to draw), identical neighbours merged and invisible parts left out.
  // In and out parts are sampled about 15 times a second; a loop about 8 times a second, and only while that fits in MAX_STATES pictures
  // (a long title with a loop keeps the loop in the preview and the fast engine, and is still in the ffmpeg engine). len = letters in the text, for typewriter.
  function textTimeline(an, durMs, len) {
    if (!an || !(an.in || an.out || an.loop)) return null;
    var dur = Math.round(durMs), inMs = an.in ? phaseMs(an, 'in', dur) : 0, outMs = an.out ? phaseMs(an, 'out', dur) : 0, phases = [];
    if (inMs) phases.push([0, inMs, STEP_MS]);
    if (dur - outMs > inMs) {
      var step = dur - outMs - inMs;
      if (an.loop) { var budget = Math.max(4, MAX_STATES - Math.ceil(inMs / STEP_MS) - Math.ceil(outMs / STEP_MS)); if (step / LOOP_STEP_MS <= budget) step = LOOP_STEP_MS; }
      phases.push([inMs, dur - outMs, step]);
    }
    if (outMs) phases.push([dur - outMs, dur, STEP_MS]);
    var out = [];
    phases.forEach(function (ph) {
      for (var t = ph[0]; t < ph[1];) {
        var e = Math.min(ph[1], t + ph[2]); if (ph[1] - e < 20) e = ph[1];
        var st = textState(an, (t + e) / 2, dur);
        if (len > 0) st.chars = Math.floor(st.chars * len + 1e-6) / len;
        var key = JSON.stringify([r3(st.alpha), r3(st.dx), r3(st.dy), r3(st.scale), Math.round(st.rot * 10) / 10, r3(st.chars)]), last = out[out.length - 1];
        if (last && last.key === key && last.b === t) last.b = e; else out.push({ a: t, b: e, st: st, key: key });
        t = e;
      }
    });
    return out.filter(function (x) { return x.st.alpha > 0.003 && x.st.scale > 0.003 && !(len > 0 && x.st.chars <= 0); }).map(function (x) { return { a: x.a, b: x.b, st: x.st }; });
  }
  // Draws a title in some state onto g (a W x H canvas context). o = { drawFn(g, title, W, H) -> lines, makeCanvas(w, h), cache: {} };
  // keep the same cache object for every frame of one title: the text picture is only redrawn when the typed text changes.
  function drawTitleState(g, t, st, W, H, o) {
    var shown = st.chars < 1 ? visibleText(t.text, st.chars) : String(t.text == null ? '' : t.text), c = o.cache;
    if (!shown.trim() || st.alpha <= 0.001 || st.scale <= 0.001) return;
    if (!c.c || c.key !== shown) {
      if (!c.c) c.c = o.makeCanvas(W, H);
      var cg = c.c.getContext('2d'); cg.clearRect(0, 0, W, H); cg.save();
      c.lines = o.drawFn(cg, Object.assign({}, t, { text: shown }), W, H); cg.restore(); c.key = shown;
    }
    var py = pivotY(t, H, (c.lines || [1]).length);
    g.save(); g.globalAlpha = st.alpha;
    g.translate(W / 2 + st.dx * W, py + st.dy * H); if (st.rot) g.rotate(st.rot * Math.PI / 180); if (st.scale !== 1) g.scale(st.scale, st.scale);
    g.drawImage(c.c, -W / 2, -py, W, H); g.restore();
  }

  // Keyframes for a picture clip ('picture': zoom, x, y) or an overlay ('overlay': x, y, size, rot, opacity) that is durMs long.
  // base = the overlay's own fixed values { x, y, size, rot, opacity }. Returns { prop: [[ms, value], ...] }, or null for an unknown name.
  function clipPreset(kind, key, durMs, base) {
    var dur = Math.max(200, Math.round(durMs)), b = Object.assign({ x: 0.5, y: 0.5, size: 0.35, rot: 0, opacity: 1 }, base || {});
    function q(ms) { return Math.min(dur, ms); }
    if (kind === 'picture') {
      if (key === 'zoomin') return { zoom: [[0, 1], [dur, 1.3]] };
      if (key === 'zoomout') return { zoom: [[0, 1.3], [dur, 1]] };
      if (key === 'pulse') return { zoom: [[0, 1], [Math.round(dur / 2), 1.18], [dur, 1]] };
      if (key === 'panright') return { zoom: [[0, 1.25], [dur, 1.25]], x: [[0, -1], [dur, 1]] };
      if (key === 'panleft') return { zoom: [[0, 1.25], [dur, 1.25]], x: [[0, 1], [dur, -1]] };
      return null;
    }
    if (kind === 'overlay') {
      var half = b.size / 2 + 0.05;
      if (key === 'slideleft') return { x: [[0, r3(-half)], [q(600), b.x]] };
      if (key === 'slideright') return { x: [[0, r3(1 + half)], [q(600), b.x]] };
      if (key === 'slideup') return { y: [[0, 1.25], [q(600), b.y]] };
      if (key === 'pop') { var t1 = Math.round(Math.min(300, dur * 0.5)), t2 = q(t1 + 150); return { size: [[0, 0.05], [t1, r3(Math.min(1.5, b.size * 1.15))], [t2, b.size]], opacity: [[0, 0], [t1, b.opacity]] }; }
      if (key === 'spin') return { rot: [[0, -180], [q(700), b.rot]], size: [[0, 0.05], [q(700), b.size]], opacity: [[0, 0], [q(350), b.opacity]] };
      if (key === 'fadein') return { opacity: [[0, 0], [q(500), b.opacity]] };
      if (key === 'fadeout') return { opacity: [[Math.max(0, dur - 500), b.opacity], [dur, 0]] };
    }
    return null;
  }

  var api = { TEXT_IN: TEXT_IN, TEXT_OUT: TEXT_OUT, TEXT_LOOP: TEXT_LOOP, PICTURE_PRESETS: PICTURE_PRESETS, OVERLAY_PRESETS: OVERLAY_PRESETS, MAX_STATES: MAX_STATES,
    has: has, phaseMs: phaseMs, textState: textState, textTimeline: textTimeline, visibleText: visibleText, pivotY: pivotY, drawTitleState: drawTitleState, clipPreset: clipPreset };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiMotion = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['motion.js'] = 'motion'; }
  return api;
})();
