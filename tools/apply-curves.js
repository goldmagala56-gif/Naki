'use strict';
// One-time patch: CapCut-style keyframe curves (gallery, overshoot, bounce / elastic, live preview, thumbnail in the keyframe bar).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

const EASE_BLOCK_ANIM = `  var EASES = [];
  function addE(group, key, label, v, fn) { EASES.push({ key: key, label: label, v: v, group: group, fn: !!fn }); }
  addE('Basic', 'linear', 'Linear', null); addE('Basic', 'in', 'Ease in', [0.42, 0, 1, 1]); addE('Basic', 'out', 'Ease out', [0, 0, 0.58, 1]);
  addE('Basic', 'inout', 'Ease in-out', [0.42, 0, 0.58, 1]); addE('Basic', 'hold', 'Hold', 'hold');
  [['sine', 'Sine', [0.12, 0, 0.39, 0], [0.61, 1, 0.88, 1], [0.37, 0, 0.63, 1]], ['quad', 'Quad', [0.11, 0, 0.5, 0], [0.5, 1, 0.89, 1], [0.45, 0, 0.55, 1]],
    ['cubic', 'Cubic', [0.32, 0, 0.67, 0], [0.33, 1, 0.68, 1], [0.65, 0, 0.35, 1]], ['quart', 'Quart', [0.5, 0, 0.75, 0], [0.25, 1, 0.5, 1], [0.76, 0, 0.24, 1]],
    ['expo', 'Expo', [0.7, 0, 0.84, 0], [0.16, 1, 0.3, 1], [0.87, 0, 0.13, 1]], ['circ', 'Circ', [0.55, 0, 1, 0.45], [0, 0.55, 0.45, 1], [0.85, 0, 0.15, 1]],
    ['back', 'Back', [0.36, 0, 0.66, -0.56], [0.34, 1.56, 0.64, 1], [0.68, -0.6, 0.32, 1.6]]].forEach(function (r) {
    addE(r[1], r[0] + 'In', 'In', r[2]); addE(r[1], r[0] + 'Out', 'Out', r[3]); addE(r[1], r[0] + 'InOut', 'In-out', r[4]);
  });
  ['bounce', 'elastic'].forEach(function (k) { var g = k === 'bounce' ? 'Bounce' : 'Elastic'; addE(g, k + 'In', 'In', null, true); addE(g, k + 'Out', 'Out', null, true); addE(g, k + 'InOut', 'In-out', null, true); });
  var EASE_GROUPS = ['Basic', 'Sine', 'Quad', 'Cubic', 'Quart', 'Expo', 'Circ', 'Back', 'Bounce', 'Elastic'];
  var YMIN = -0.6, YMAX = 1.6;   // a handle may go past the 0..1 square up or down, which is what makes a move overshoot
  // Bounce and elastic are not one bezier, so they are stored by name and worked out by these formulas (the preview and the export use the same ones).
  var FN = {
    bounceOut: function (x) { var n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) { x -= 1.5 / d; return n * x * x + 0.75; } if (x < 2.5 / d) { x -= 2.25 / d; return n * x * x + 0.9375; } x -= 2.625 / d; return n * x * x + 0.984375; },
    bounceIn: function (x) { return 1 - FN.bounceOut(1 - x); },
    bounceInOut: function (x) { return x < 0.5 ? (1 - FN.bounceOut(1 - 2 * x)) / 2 : (1 + FN.bounceOut(2 * x - 1)) / 2; },
    elasticOut: function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1; },
    elasticIn: function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * (2 * Math.PI / 3)); },
    elasticInOut: function (x) { var c = 2 * Math.PI / 4.5; return x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * c)) / 2 : Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * c) / 2 + 1; }
  };
  function c01(x) { x = +x; return isNaN(x) ? 0 : Math.max(0, Math.min(1, x)); }
  function cy(x) { x = +x; return isNaN(x) ? 0 : Math.max(YMIN, Math.min(YMAX, x)); }
  function q3(x) { return Math.round(x * 1000) / 1000; }
  // A value that overshoots is kept inside what the property can hold (opacity 0..1, size, zoom, turn, volume). Positions may overshoot, which is the pop.
  function fitVal(kind, prop, v) {
    if ((prop === 'x' || prop === 'y') && kind !== 'picture') return v;
    var r = kind && RANGE[kind] && RANGE[kind][prop];
    return r ? Math.max(r[0], Math.min(r[1], v)) : v;
  }
  // Whatever was given (a name, four numbers, nothing) as what is stored: null (a straight line), 'hold', a name (bounce / elastic), or four numbers.
  function cleanEase(e) {
    if (e == null || e === 'linear') return null;
    if (e === 'hold') return 'hold';
    if (typeof e === 'string') {
      if (FN[e]) return e;
      var pr = EASES.filter(function (k) { return k.key === e; })[0];
      return pr && pr.v ? (pr.v === 'hold' ? 'hold' : pr.v.slice()) : null;
    }
    if (e.length === 4) {
      var a = [q3(c01(e[0])), q3(cy(e[1])), q3(c01(e[2])), q3(cy(e[3]))];
      return a[0] === a[1] && a[2] === a[3] ? null : a;   // handles on the diagonal are a straight line
    }
    return null;
  }
  function bezierOf(e) { var c = cleanEase(e); return c && typeof c !== 'string' ? c : [0.333, 0.333, 0.667, 0.667]; }
  function easeName(e) {
    var c = cleanEase(e);
    if (c === null) return 'linear'; if (c === 'hold') return 'hold'; if (typeof c === 'string') return c;
    for (var i = 0; i < EASES.length; i++) if (EASES[i].v && EASES[i].v !== 'hold' && EASES[i].v.join() === c.join()) return EASES[i].key;
    return 'custom';
  }
  function bezPt(e, t) {
    var u = 1 - t, a = 3 * u * u * t, b = 3 * u * t * t, c = t * t * t;
    return [a * e[0] + b * e[2] + c, a * e[1] + b * e[3] + c];
  }
  // How far along the move it is when f (0 to 1) of the time has passed. Mostly 0 to 1, but a Back / bounce / elastic curve goes past it.
  function easeProgress(e, f) {
    f = Math.max(0, Math.min(1, f));
    if (typeof e === 'string' && e !== 'hold') { if (FN[e]) return FN[e](f); e = cleanEase(e); if (typeof e === 'string' && e !== 'hold') return FN[e](f); }
    if (e == null) return f;
    if (e === 'hold') return f >= 1 ? 1 : 0;
    var lo = 0, hi = 1, t = f;
    for (var i = 0; i < 26; i++) { t = (lo + hi) / 2; if (bezPt(e, t)[0] < f) lo = t; else hi = t; }
    return bezPt(e, t)[1];
  }
`;

const EASEBLOCK_EDITOR = `  var EZ = { X0: 26, X1: 178, Y0: 6, Y1: 164, MIN: -0.6, MAX: 1.6, W: 200, H: 170 };
  function ezY(p){ return EZ.Y1 - (p - EZ.MIN) / (EZ.MAX - EZ.MIN) * (EZ.Y1 - EZ.Y0); }
  // A small picture of an ease (used on the gallery tiles and on the keyframe bar button). e = what is stored: null, 'hold', a name or four numbers.
  function curveSvg(e, W, H, pad, base){
    var d = '', i, f, y = function (p){ return (H - pad) - (clamp(p, -0.5, 1.5) + 0.5) / 2 * (H - 2 * pad); };
    for (i = 0; i <= 28; i++){ f = i / 28; d += (i ? 'L' : 'M') + (pad + f * (W - 2 * pad)).toFixed(1) + ' ' + y(NANIM.easeProgress(e, f)).toFixed(1); }
    var g = base ? '<path d="M' + pad + ' ' + y(0).toFixed(1) + 'H' + (W - pad) + 'M' + pad + ' ' + y(1).toFixed(1) + 'H' + (W - pad) + '" stroke="currentColor" stroke-opacity=".25" stroke-width="1" fill="none"/>' : '';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" fill="none">' + g + '<path d="' + d + '" stroke="currentColor" stroke-width="' + (base ? 2.4 : 2.6) + '" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
  }
  function ezGroupOf(name){ var g = 'Basic'; NANIM.EASES.forEach(function (x){ if (x.key === name) g = x.group; }); return g; }
  // ----- the easing graph (CapCut style): a gallery of curves, a graph you can drag, and a ball that shows how it moves -----
  function easeBlock(c, prop, all){
    var info = NANIM && P.keyframeEase(E.hist.cur, c.id, prop, relNow(c)); if (!info) return null;
    var box = mk('div', 'ed-easebox');
    if (!info.hasNext){ box.appendChild(mk('div', 'ed-hint', 'This is the last keyframe, so there is nothing after it to ease into.')); return box; }
    var set = function (e){ var q = all ? P.setKeyframeEaseAll(E.hist.cur, c.id, relNow(c), e) : P.setKeyframeEase(E.hist.cur, c.id, prop, relNow(c), e); if (q === E.hist.cur) renderDock(); else commit(q); };
    var stored = NANIM.cleanEase(info.ease), name = NANIM.easeName(stored), bz = NANIM.bezierOf(stored).slice(), dragged = false;
    var handles = !(stored === 'hold' || typeof stored === 'string');
    var liveE = function (){ return dragged ? bz : stored; };
    var gk = NANIM.EASE_GROUPS.map(function (g){ return { key: g, label: g }; }), grp = chipKey('easegroup', gk, ezGroupOf(name));
    box.appendChild(mk('div', 'ed-hint', 'How it moves from this keyframe to the next:'));
    box.appendChild(chips(gk, grp, pickChip('easegroup')));
    var gal = mk('div', 'ed-ezgal');
    NANIM.EASES.filter(function (x){ return x.group === grp; }).forEach(function (x){
      var b = mk('button', 'ed-ezt' + (x.key === name ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-label', x.label);
      b.innerHTML = curveSvg(NANIM.cleanEase(x.key), 60, 40, 6, true) + '<span>' + x.label + '</span>';
      b.onclick = function (){ set(x.key); }; gal.appendChild(b);
    });
    if (grp === 'Basic'){
      var cb = mk('button', 'ed-ezt' + (name === 'custom' ? ' on' : '')); cb.type = 'button'; cb.setAttribute('aria-label', 'Custom');
      cb.innerHTML = curveSvg(name === 'custom' ? stored : [0.25, 0.1, 0.25, 1], 60, 40, 6, true) + '<span>Custom</span>';
      cb.onclick = function (){ set(name === 'custom' ? bz.slice() : [0.25, 0.1, 0.25, 1]); }; gal.appendChild(cb);
    }
    box.appendChild(cueScroller(gal, false));
    if (name === 'hold'){ box.appendChild(mk('div', 'ed-hint', 'Hold keeps the value still until the next keyframe, then jumps to it.')); }
    var NS = 'http://www.w3.org/2000/svg', svg0 = document.createElementNS(NS, 'svg');
    svg0.setAttribute('viewBox', '0 0 ' + EZ.W + ' ' + EZ.H); svg0.setAttribute('class', 'ed-ease'); svg0.setAttribute('role', 'img'); svg0.setAttribute('aria-label', 'Easing curve');
    var px = function (x){ return EZ.X0 + x * (EZ.X1 - EZ.X0); };
    var node = function (tag, attrs){ var e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k){ e.setAttribute(k, attrs[k]); }); return e; };
    var draw = function (){
      while (svg0.firstChild) svg0.removeChild(svg0.firstChild);
      svg0.appendChild(node('rect', { x: EZ.X0, y: ezY(1), width: EZ.X1 - EZ.X0, height: ezY(0) - ezY(1), 'class': 'ed-ezbox' }));
      svg0.appendChild(node('line', { x1: px(0), y1: ezY(0), x2: px(1), y2: ezY(1), 'class': 'ed-ezdiag' }));
      if (handles){
        svg0.appendChild(node('line', { x1: px(0), y1: ezY(0), x2: px(bz[0]), y2: ezY(bz[1]), 'class': 'ed-ezh' }));
        svg0.appendChild(node('line', { x1: px(1), y1: ezY(1), x2: px(bz[2]), y2: ezY(bz[3]), 'class': 'ed-ezh' }));
      }
      var d = '', e = liveE(); for (var i = 0; i <= 60; i++){ var f = i / 60; d += (i ? 'L' : 'M') + px(f).toFixed(1) + ' ' + ezY(NANIM.easeProgress(e, f)).toFixed(1); }
      svg0.appendChild(node('path', { d: d, 'class': 'ed-ezpath' }));
      if (handles){ svg0.appendChild(node('circle', { cx: px(bz[0]), cy: ezY(bz[1]), r: 8, 'class': 'ed-ezdot' })); svg0.appendChild(node('circle', { cx: px(bz[2]), cy: ezY(bz[3]), r: 8, 'class': 'ed-ezdot' })); }
    };
    var drag = -1, where = function (ev){ var r = svg0.getBoundingClientRect(), s = EZ.W / (r.width || EZ.W); return { x: (ev.clientX - r.left) * s, y: (ev.clientY - r.top) * s }; };
    svg0.addEventListener('pointerdown', function (ev){
      if (!handles) return;
      var p = where(ev), d1 = Math.hypot(px(bz[0]) - p.x, ezY(bz[1]) - p.y), d2 = Math.hypot(px(bz[2]) - p.x, ezY(bz[3]) - p.y);
      if (Math.min(d1, d2) > 26) return;
      drag = d1 <= d2 ? 0 : 1; dragged = true; try { svg0.setPointerCapture(ev.pointerId); } catch (e) {} ev.preventDefault();
    });
    svg0.addEventListener('pointermove', function (ev){
      if (drag < 0) return; var p = where(ev);
      bz[drag * 2] = clamp((p.x - EZ.X0) / (EZ.X1 - EZ.X0), 0, 1);
      bz[drag * 2 + 1] = clamp(EZ.MIN + (EZ.Y1 - p.y) / (EZ.Y1 - EZ.Y0) * (EZ.MAX - EZ.MIN), EZ.MIN, EZ.MAX); draw();
    });
    var letGo = function (){ if (drag < 0) return; drag = -1; set(bz.slice()); };
    svg0.addEventListener('pointerup', letGo); svg0.addEventListener('pointercancel', letGo);
    draw(); box.appendChild(svg0);
    // a ball that travels the way the value will: pause, move, pause, again
    var strip = mk('div', 'ed-ezprev'), ball = mk('i'); strip.appendChild(ball); box.appendChild(strip);
    var t0 = performance.now();
    (function tick(now){
      if (!strip.isConnected) return;
      var f = ((now - t0) % 1700) / 1700, ph = f < 0.12 ? 0 : f > 0.88 ? 1 : (f - 0.12) / 0.76, w = strip.clientWidth || 200;
      ball.style.left = Math.max(0, w * 0.22 + NANIM.easeProgress(liveE(), ph) * w * 0.45 - 8) + 'px';
      requestAnimationFrame(tick);
    })(t0);
    box.appendChild(actions([{ id: 'edEzAll', label: 'Apply to all keyframes', run: function (){
      var e = dragged ? bz.slice() : stored, q = E.hist.cur;
      P.keyframeTimes(q, c.id).forEach(function (t){ q = P.setKeyframeEaseAll(q, c.id, t, e); });
      if (q === E.hist.cur) renderDock(); else commit(q);
      toast('Every move on this clip now uses this curve.'); } }]));
    box.appendChild(mk('div', 'ed-hint', handles ? 'Pick a curve, or drag the two dots (they can go past the box for a bounce or pop). Back, Bounce and Elastic overshoot. Opacity, size, zoom and volume stay in their limits.' : 'Bounce, Elastic and Hold have no handles. Pick Custom to draw your own curve.'));
    return box;
  }
`;

const UPDATE_KF = `var ezk = '';
    if (st.here){
      var hk = P.keyframesHere(E.proj, st.c.id, st.rel), ke = hk.length ? P.keyframeEase(E.proj, st.c.id, hk[0], st.rel) : null;
      if (ke && ke.hasNext) ezk = JSON.stringify(ke.ease == null ? 'linear' : ke.ease);
      if (k.ezKey !== ezk){ k.ezKey = ezk; k.ez.innerHTML = ezk ? curveSvg(ke.ease, 24, 24, 3, false) : G.curve; }
    } else if (k.ezKey){ k.ezKey = ''; k.ez.innerHTML = G.curve; }
    var text = st.out ? 'Move the playhead onto this clip'`;

const CSS = `
/* curve gallery, taller graph, preview ball */
.ed-ease{width:200px;height:170px;max-width:100%}
.ed-ezgal{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 0}
.ed-ezgal::-webkit-scrollbar{display:none}
.ed-sw>.ed-ezgal{width:100%}
.ed-ezt{flex:0 0 72px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 2px;border:1px solid var(--line);border-radius:10px;background:var(--panel-2);color:var(--chalk);font:inherit;cursor:pointer;touch-action:manipulation}
.ed-ezt svg{width:60px;height:40px}
.ed-ezt span{font-size:11px;font-weight:650;color:var(--dim)}
.ed-ezt.on{background:var(--mango);border-color:transparent;color:#1d1300}
.ed-ezt.on span{color:#1d1300}
.ed-ezprev{position:relative;height:26px;background:#0f1820;border:1px solid var(--line);border-radius:13px}
.ed-ezprev i{position:absolute;top:4px;width:16px;height:16px;border-radius:50%;background:var(--mango)}
.ed-kfb svg{width:20px;height:20px}
`;

function load(rel){ const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function count(t, s){ return t.split(s).length - 1; }
const problems = [], files = {};
function get(rel){ return files[rel] || (files[rel] = load(rel)); }
function exact(rel, label, find, rep){
  const o = get(rel), n = count(o.text, find);
  if (n !== 1){ problems.push(label + ': found ' + n + ' times in ' + rel); return; }
  o.text = o.text.replace(find, () => rep);
}
function between(rel, label, a, b, rep){
  const o = get(rel), na = count(o.text, a), nb = count(o.text, b);
  if (na !== 1 || nb !== 1){ problems.push(label + ': start found ' + na + ', end found ' + nb + ' in ' + rel); return; }
  const i = o.text.indexOf(a), j = o.text.indexOf(b);
  if (j < i){ problems.push(label + ': markers are in the wrong order'); return; }
  o.text = o.text.slice(0, i) + rep + o.text.slice(j);
}
try {
  between('www/anim.js', 'anim: ease section', "  var EASES = [{ key: 'linear', label: 'Linear', v: null }", '  // The ease for the part of a move from f0 to f1', EASE_BLOCK_ANIM);
  exact('www/anim.js', 'anim: cutting a bounce / elastic move', "var c = cleanEase(e); if (c === null || c === 'hold') return c;",
    "var c = cleanEase(e); if (c === null || c === 'hold') return c;\n    if (typeof c === 'string') return (f0 < 1e-6 && f1 > 1 - 1e-6) ? c : 'out';   // a bounce cannot be cut into a smaller bezier: a piece falls back to Ease out");
  exact('www/anim.js', 'anim: bakeKf signature', 'function bakeKf(kf) {', 'function bakeKf(kf, kind) {');
  exact('www/anim.js', 'anim: bakeKf samples',
    "for (var j = 1; j < 12; j++) { var f = j / 12; arr.push([Math.round(p[0] + w * f), Math.round((p[1] + (nx[1] - p[1]) * easeProgress(p[2], f)) * 1000) / 1000]); }",
    "var NS = (typeof p[2] === 'string') ? Math.min(32, Math.max(2, Math.floor(w / 16))) : 12; for (var j = 1; j < NS; j++) { var f = j / NS; arr.push([Math.round(p[0] + w * f), Math.round(fitVal(kind, k, p[1] + (nx[1] - p[1]) * easeProgress(p[2], f)) * 1000) / 1000]); }");
  exact('www/anim.js', 'anim: valueOf keeps overshoot in range', 'if (pts && pts.length) return kfValue(pts, relMs);', 'if (pts && pts.length) return fitVal(kind, prop, kfValue(pts, relMs));');
  exact('www/anim.js', 'anim: picture transform keeps overshoot in range', 'if (kf && kf[k] && kf[k].length) o[k] = kfValue(kf[k], relMs);', "if (kf && kf[k] && kf[k].length) o[k] = fitVal('picture', k, kfValue(kf[k], relMs));");
  exact('www/anim.js', 'anim: exports', 'EASES: EASES, cleanEase: cleanEase,', 'EASES: EASES, EASE_GROUPS: EASE_GROUPS, YMIN: YMIN, YMAX: YMAX, cleanEase: cleanEase,');
  exact('www/project.js', 'project: volume cannot go negative', '_AN.kfValue(c.kf.volume, rel) :', 'Math.max(0, Math.min(2, _AN.kfValue(c.kf.volume, rel))) :');
  exact('www/plan.js', 'plan: picture keyframes', 'NAN && NAN.bakeKf ? NAN.bakeKf({ v: c.kf[k] }).v :', "NAN && NAN.bakeKf ? (function () { var oo = {}; oo[k] = c.kf[k]; return NAN.bakeKf(oo, 'picture')[k]; })() :");
  exact('www/plan.js', 'plan: overlay keyframes', 'o.kf = NAN && NAN.bakeKf ? NAN.bakeKf(c.kf) :', "o.kf = NAN && NAN.bakeKf ? NAN.bakeKf(c.kf, 'overlay') :");
  between('www/editor.js', 'editor: easeBlock', '  function easeBlock(c, prop, all){', '  function keyframeActions(c, prop){', EASEBLOCK_EDITOR);
  exact('www/editor.js', 'editor: curve thumbnail on the keyframe bar', "var text = st.out ? 'Move the playhead onto this clip'", UPDATE_KF);
} catch (err) { problems.push('could not read a file: ' + err.message); }
if (problems.length){ console.log('NOTHING WAS CHANGED:\n  - ' + problems.join('\n  - ')); process.exit(1); }
const css = load('www/editor.css'); css.text = css.text.replace(/\s*$/, '\n') + CSS; files['www/editor.css'] = css;
Object.keys(files).forEach(rel => { const o = files[rel]; fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); });
console.log('Done. Changed ' + Object.keys(files).length + ' files. Now run: npm test');