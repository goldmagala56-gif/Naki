'use strict';
// node tools/apply-textfx.js   (from the project folder; run apply-crop-editor.js and apply-motion.js first)
// Batch 10: text effects: gradient fill, curved text, glow, bubble, 3D and ready-made word art.
// Titles are drawn by NakiLook.drawTitle in the preview AND in both exports, so they look the same everywhere.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function load(rel) { const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o) { fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const problems = [], notes = [];
function rep(o, find, replace, label) {
  const n = o.text.split(find).length - 1;
  if (n !== 1) { problems.push(label + ': found ' + n + ' times (need exactly 1) in ' + o.rel); return; }
  o.text = o.text.replace(find, () => replace);
}
function optrep(o, find, replace, label) {   // for spots that only exist if an earlier patch was applied
  const n = o.text.split(find).length - 1;
  if (n === 1) o.text = o.text.replace(find, () => replace); else notes.push('Skipped (not found): ' + label);
}
const lk = load('www/look.js'), pj = load('www/project.js'), pl = load('www/plan.js'), ed = load('www/editor.js'), ix = load('www/index.html'), ee = load('www/export-engine.js');
if (!ed.text.includes('function buildCropUI')) { console.log('Run  node tools/apply-crop-editor.js  first.'); process.exit(1); }
if (lk.text.includes('function drawStyledTitle')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- look.js: the drawing ----------
const LOOK_CODE = `/* ---------- text effects: gradient fill, curved text, glow, bubble, 3D (and word art, which is a mix of these) ----------
     A title clip can carry:  grad { c1, c2, angle }   arc -1..1 (+ arch, - smile)   glow { color, amount }   bubble { color, width }   extrude { color, depth }
     Stored only when used. A title with none of them is drawn by the original code below, exactly as before. */
  var FX_KEYS = ['grad', 'arc', 'glow', 'bubble', 'extrude'];
  function hex6(v, d){ var m = /^#?([0-9a-f]{6})$/i.exec(String(v == null ? '' : v)); return m ? '#' + m[1].toLowerCase() : d; }
  function hasTitleFx(t){ if (!t) return false; for (var i = 0; i < FX_KEYS.length; i++) if (t[FX_KEYS[i]] != null && t[FX_KEYS[i]] !== false) return true; return false; }
  // Tidies one effect value. null (or an empty / tiny one) means "off".
  function cleanStyle(k, v){
    if (v == null || v === false) return null;
    if (k === 'arc'){ var c = +v; if (isNaN(c)) return null; c = r4(clamp(c, -1, 1)); return Math.abs(c) < 0.02 ? null : c; }
    if (typeof v !== 'object') return null;
    if (k === 'grad') return { c1: hex6(v.c1, '#ff512f'), c2: hex6(v.c2, '#f9d423'), angle: ((Math.round(num(v.angle)) % 360) + 360) % 360 };
    var key = k === 'glow' ? 'amount' : k === 'bubble' ? 'width' : k === 'extrude' ? 'depth' : null; if (!key) return null;
    var a = clamp(num(v[key] == null ? 0.7 : v[key]), 0, 1); if (a < 0.02) return null;
    var out = { color: hex6(v.color, k === 'glow' ? '#00e5ff' : k === 'bubble' ? '#ff4fa3' : '#ee4266') }; out[key] = Math.round(a * 1000) / 1000;
    return out;
  }
  // Ready-made looks ("word art"). Each one sets every effect (so choosing one replaces what was there) plus a font, colour, outline and shadow.
  function mkArt(key, label, over){
    var p = { grad: null, arc: null, glow: null, bubble: null, extrude: null, color: '#ffffff', outline: 0, shadow: 1 };
    Object.keys(over).forEach(function (k){ p[k] = over[k]; });
    return { key: key, label: label, patch: p };
  }
  var ART = [
    { key: 'plain', label: 'Plain', patch: { grad: null, arc: null, glow: null, bubble: null, extrude: null, outline: 0, shadow: 1 } },
    mkArt('sunset', 'Sunset', { font: 'anton', outline: 0.4, grad: { c1: '#ff512f', c2: '#f9d423', angle: 90 } }),
    mkArt('neon', 'Neon', { font: 'righteous', shadow: 0, glow: { color: '#00e5ff', amount: 0.9 } }),
    mkArt('bubblegum', 'Bubblegum', { font: 'luckiestguy', bubble: { color: '#ff4fa3', width: 0.55 } }),
    mkArt('retro', 'Retro 3D', { font: 'bungee', color: '#ffd23f', outline: 0.3, shadow: 0, extrude: { color: '#ee4266', depth: 0.8 } }),
    mkArt('comic', 'Comic', { font: 'bangers', color: '#ffe600', outline: 1, shadow: 0, extrude: { color: '#000000', depth: 0.45 } }),
    mkArt('chrome', 'Chrome', { font: 'archivo', outline: 0.45, grad: { c1: '#ffffff', c2: '#6b7a8f', angle: 90 } }),
    mkArt('fire', 'Fire', { font: 'anton', outline: 0.2, shadow: 0, grad: { c1: '#fff200', c2: '#ff3b00', angle: 90 }, glow: { color: '#ff6a00', amount: 0.7 } }),
    mkArt('ice', 'Ice', { font: 'montserrat', shadow: 0, grad: { c1: '#ffffff', c2: '#7fd8ff', angle: 90 }, glow: { color: '#4fc3ff', amount: 0.8 } }),
    mkArt('rainbow', 'Rainbow arc', { font: 'pacifico', outline: 0.3, grad: { c1: '#ff5f6d', c2: '#4facfe', angle: 0 }, arc: 0.6 }),
    mkArt('smile', 'Smile', { font: 'lobster', outline: 0.35, arc: -0.5 })
  ];
  function art(key){
    for (var i = 0; i < ART.length; i++) if (ART[i].key === key) return JSON.parse(JSON.stringify(ART[i].patch));
    return null;
  }
  // A scratch canvas the size of the title picture (used to fill letters with a gradient). null when this place cannot make one.
  function mkLayer(W, H){
    try {
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(W, H);
      if (typeof document !== 'undefined'){ var c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
    } catch (e) {}
    return null;
  }
  // Draws a title that has effects. Same layout as the plain drawing (wrapped to 88%, same heights); returns the lines like drawTitle does.
  // Passes, back to front: glow, 3D, bubble outline, black outline, then the letters (colour or gradient). One drop shadow, under the first thing drawn.
  function drawStyledTitle(g, t, W, H){
    var L = titleLook(t, H), px = L.px, base = t.color || '#ffffff', fontStr = (t.weight || 700) + ' ' + px + 'px ' + fontCss(t.font);
    function setup(gx){ gx.font = fontStr; gx.textAlign = 'center'; gx.textBaseline = 'top'; }
    setup(g);
    var maxW = W * 0.88, lines = [];
    String(t.text || '').split('\\n').forEach(function (par){
      var line = '';
      par.split(' ').forEach(function (w){
        var test = line ? line + ' ' + w : w;
        if (line && g.measureText(test).width > maxW){ lines.push(line); line = w; } else line = test;
      });
      lines.push(line);
    });
    var lh = Math.round(px * 1.2), y0 = Math.round((TITLE_POS[t.pos] != null ? TITLE_POS[t.pos] : TITLE_POS.bottom) * H), widest = 0;
    lines.forEach(function (l){ widest = Math.max(widest, g.measureText(l).width); });
    if (t.bg){
      var bw = Math.min(W, widest + px * 0.8);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(Math.round(W / 2 - bw / 2), Math.round(y0 - px * 0.2), Math.round(bw), Math.round(lines.length * lh + px * 0.4));
    }
    // where every piece of text goes: a whole line, or (curved) one letter at a time along an arc
    var arc = t.arc ? clamp(num(t.arc), -1, 1) : 0, theta = Math.abs(arc) * Math.PI, items = [];
    lines.forEach(function (l, i){
      var yy = y0 + i * lh;
      if (!arc || !l){ items.push({ s: l, x: W / 2, y: yy, rot: 0 }); return; }
      var chars = Array.from(l), ws = chars.map(function (ch){ return g.measureText(ch).width; }), total = 0;
      ws.forEach(function (w){ total += w; });
      var R = total / theta, acc = -total / 2;
      chars.forEach(function (ch, k){
        var s = acc + ws[k] / 2, phi = s / R, sag = R * (1 - Math.cos(phi)); acc += ws[k];
        items.push({ s: ch, x: W / 2 + R * Math.sin(phi), y: yy + (arc > 0 ? sag : -sag), rot: arc > 0 ? phi : -phi });
      });
    });
    function paint(gx, how){
      items.forEach(function (it){
        if (!it.s) return;
        if (!it.rot){ if (how === 'fill') gx.fillText(it.s, it.x, it.y); else gx.strokeText(it.s, it.x, it.y); return; }
        gx.save(); gx.translate(it.x, it.y); gx.rotate(it.rot);
        if (how === 'fill') gx.fillText(it.s, 0, 0); else gx.strokeText(it.s, 0, 0);
        gx.restore();
      });
    }
    function noShadow(gx){ gx.shadowColor = 'rgba(0,0,0,0)'; gx.shadowBlur = 0; gx.shadowOffsetX = 0; gx.shadowOffsetY = 0; }
    var shadowLeft = L.shadow > 0;
    function dropShadow(gx){
      if (shadowLeft){ gx.shadowColor = 'rgba(0,0,0,0.7)'; gx.shadowBlur = L.blur; gx.shadowOffsetX = 0; gx.shadowOffsetY = L.offY; shadowLeft = false; } else noShadow(gx);
    }
    noShadow(g);
    if (t.glow){
      var ga = clamp(num(t.glow.amount), 0, 1), gc = hex6(t.glow.color, '#00e5ff');
      if (ga > 0){
        [0.35, 0.7, 1.2].forEach(function (m){ g.shadowColor = gc; g.shadowBlur = px * 0.5 * ga * m; g.shadowOffsetX = 0; g.shadowOffsetY = 0; g.fillStyle = gc; paint(g, 'fill'); });
        noShadow(g);
      }
    }
    if (t.extrude){
      var steps = Math.max(1, Math.round(px * 0.1 * clamp(num(t.extrude.depth), 0, 1))), ec = hex6(t.extrude.color, '#ee4266');
      for (var k = steps; k >= 1; k--){ g.save(); g.translate(k, k); dropShadow(g); g.fillStyle = ec; paint(g, 'fill'); g.restore(); }
    }
    g.lineJoin = 'round'; g.miterLimit = 2;
    if (t.bubble){
      g.lineWidth = px * (0.10 + 0.20 * clamp(num(t.bubble.width), 0, 1)); g.strokeStyle = hex6(t.bubble.color, '#ff4fa3');
      dropShadow(g); paint(g, 'stroke'); noShadow(g);
    }
    if (L.outlinePx > 0){ g.lineWidth = L.outlinePx * 2; g.strokeStyle = '#000'; dropShadow(g); paint(g, 'stroke'); noShadow(g); }
    // the letters: a colour, or a gradient across the whole text
    var sag0 = arc ? widest / theta * (1 - Math.cos(theta / 2)) : 0;
    function gradient(gx){
      var gr0 = t.grad, ang = num(gr0.angle) * Math.PI / 180, bx0 = W / 2 - widest / 2, bx1 = W / 2 + widest / 2, by0 = y0 - (arc < 0 ? sag0 : 0), by1 = y0 + lines.length * lh + (arc > 0 ? sag0 : 0);
      var cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, half = (Math.abs(Math.cos(ang)) * (bx1 - bx0) + Math.abs(Math.sin(ang)) * (by1 - by0)) / 2;
      var dx = Math.cos(ang) * half, dy = Math.sin(ang) * half, gr = gx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      gr.addColorStop(0, hex6(gr0.c1, '#ff512f')); gr.addColorStop(1, hex6(gr0.c2, '#f9d423'));
      return gr;
    }
    var layer = (t.grad && widest > 0) ? mkLayer(W, H) : null;
    if (layer){
      // letters in solid ink on a scratch picture, then the gradient poured into them, so a curved line gets ONE smooth gradient
      var lg = layer.getContext('2d'); setup(lg); noShadow(lg); lg.clearRect(0, 0, W, H);
      lg.globalCompositeOperation = 'source-over'; lg.fillStyle = '#000'; paint(lg, 'fill');
      lg.globalCompositeOperation = 'source-in'; lg.fillStyle = gradient(lg); lg.fillRect(0, 0, W, H); lg.globalCompositeOperation = 'source-over';
      dropShadow(g); g.drawImage(layer, 0, 0); noShadow(g);
    } else {
      g.fillStyle = (t.grad && widest > 0) ? gradient(g) : base; dropShadow(g); paint(g, 'fill'); noShadow(g);
    }
    return lines;
  }
  // Draws a title onto a canvas context of W x H pixels: wrapped to 88% of the width, at the same heights as the preview.`;
rep(lk, '// Draws a title onto a canvas context of W x H pixels: wrapped to 88% of the width, at the same heights as the preview.', LOOK_CODE, 'look: effects code');
rep(lk, 'function drawTitle(g, t, W, H){', 'function drawTitle(g, t, W, H){\n    if (hasTitleFx(t)) return drawStyledTitle(g, t, W, H);', 'look: hook into drawTitle');
rep(lk, 'titleStyle: titleStyle, drawTitle: drawTitle, TITLE_POS: TITLE_POS };', 'titleStyle: titleStyle, drawTitle: drawTitle, TITLE_POS: TITLE_POS,\n    hasTitleFx: hasTitleFx, cleanStyle: cleanStyle, ART: ART, art: art, FX_KEYS: FX_KEYS };', 'look: exports');
rep(lk, "window.NakiVersions['look.js'] = 'fonts';", "window.NakiVersions['look.js'] = 'textfx';", 'look: version stamp');
rep(ix, "'look.js': 'fonts'", "'look.js': 'textfx'", 'index: version list');

// ---------- project.js ----------
rep(pj, 'var _idn = 0;', "var _LK = (typeof module !== 'undefined' && module.exports) ? require('./look.js') : (typeof window !== 'undefined' ? window.NakiLook : null);\nvar _idn = 0;", 'project: look library');
rep(pj, 'function applyTextPatch(clip, patch){', `// Text effects (see look.js): grad, arc, glow, bubble, extrude. null / empty turns one off.
function applyTextStyleExtras(clip, patch){
  if (!_LK || !_LK.cleanStyle) return;
  ['grad', 'arc', 'glow', 'bubble', 'extrude'].forEach(function (k){
    if (patch[k] === undefined) return;
    var v = _LK.cleanStyle(k, patch[k]);
    if (v == null) delete clip[k]; else clip[k] = v;
  });
}
function applyTextPatch(clip, patch){`, 'project: text effect cleaner');
rep(pj, 'if (sh < 1) clip.shadow = sh; else delete clip.shadow; }', 'if (sh < 1) clip.shadow = sh; else delete clip.shadow; }\n  applyTextStyleExtras(clip, patch);', 'project: text patch uses it');
rep(pj, "['size', 'color', 'pos', 'weight', 'bg', 'font', 'outline', 'shadow'].forEach(function (k){ if (patch[k] !== undefined) style[k] = patch[k]; });",
  "['size', 'color', 'pos', 'weight', 'bg', 'font', 'outline', 'shadow', 'grad', 'arc', 'glow', 'bubble', 'extrude'].forEach(function (k){ if (patch[k] !== undefined) style[k] = patch[k]; });", 'project: caption style');
optrep(pj, "text: ['size', 'color', 'pos', 'weight', 'bg', 'font', 'outline', 'shadow', 'anim'],", "text: ['size', 'color', 'pos', 'weight', 'bg', 'font', 'outline', 'shadow', 'anim', 'grad', 'arc', 'glow', 'bubble', 'extrude'],", 'paste look keeps text effects (needs apply-timeline-basics)');

// ---------- plan.js ----------
rep(pl, 'if (c.font) tx.font = c.font; if (c.outline) tx.outline = c.outline; if (c.shadow != null) tx.shadow = c.shadow;',
  "if (c.font) tx.font = c.font; if (c.outline) tx.outline = c.outline; if (c.shadow != null) tx.shadow = c.shadow;\n          ['grad', 'arc', 'glow', 'bubble', 'extrude'].forEach(function (k) { if (c[k] != null) tx[k] = JSON.parse(JSON.stringify(c[k])); });", 'plan: text effects reach the export');

// ---------- editor.js ----------
optrep(ed, "{ id: 'edTextAnim', label: 'Animate', icon: G.anim, run: function (){ openPanel('textanim'); }, disabled: !isText },", "{ id: 'edTextAnim', label: 'Animate', icon: G.anim, run: function (){ openPanel('textanim'); }, disabled: !isText },\n        { id: 'edTextFx', label: 'Effects', icon: G.fx, run: function (){ openPanel('textfx'); }, disabled: !isText },", 'Effects button');
rep(ed, 'var d = E.textEls[c.id];', `var d = E.textEls[c.id];
      var sty = isStyledText(c);   // a title with effects is drawn on a canvas by look.js, the same drawing the exports use
      if (d && !!d._styled !== sty){ d.remove(); delete E.textEls[c.id]; d = null; }
      if (sty){ paintStyledText(layer, c); return; }`, 'editor: styled titles in the preview');
const ED_CODE = `// ----- text effects: gradient, curve, glow, bubble, 3D, word art -----
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
          body.appendChild(sliderRow('Direction', 0, 345, 15, v0.angle, function (x){ return x + '\\u00b0'; }, function (x){ live(put('angle')(x)); }, function (x){ commit(put('angle')(x)); }));
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
  // ----- crop (CapCut style): a dimmed picture with a frame you drag -----`;
rep(ed, '// ----- crop (CapCut style): a dimmed picture with a frame you drag -----', ED_CODE, 'editor: text effects code and panel');

// does the ffmpeg engine draw titles through look.js? (it has to, for the exported video to match)
if (!/NakiLook/.test(ee.text)) notes.push('CHECK: export-engine.js does not mention NakiLook. If its drawTitle is its own copy, text effects will only show in the fast export. Send me its drawTitle function.');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[lk, pj, pl, ed, ix].forEach(save);
console.log('Done.' + (notes.length ? '\n  ' + notes.join('\n  ') : '') + '\nNow run:  node tests/textfx.test.js   and then   npm test');