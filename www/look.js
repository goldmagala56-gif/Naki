'use strict';
/* Naki look: the "More adjust" looks (warmth, sharpen, vignette, faded), shared by the editor preview, the fast
   export engine and the ffmpeg export engine so all three draw them the same way. Pure logic, no page code.

   A picture clip's `filter` already holds brightness / contrast / saturate. More adjust adds four optional keys,
   stored only when they are not zero:   warmth -1..1 (cool..warm)   sharpen 0..1   vignette 0..1   matte 0..1
   Warmth and the faded look are plain colour layers laid over the picture, the vignette is a dark ring that grows
   toward the corners, sharpen is an unsharp mask (the fast engine cannot draw it, see webcodecs-export.js). */
var NakiLook = (function () {
  var MATTE_GRAY = 140, MATTE_MAX = 0.35, VIG_ANGLE = 0.9, SHARP_MAX = 1.5;
  var KEYS = ['warmth', 'sharpen', 'vignette', 'matte'];
  function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
  function r4(x){ return Math.round(x * 10000) / 10000; }
  function num(v){ v = +v; return isNaN(v) ? 0 : v; }

  function extras(f){
    f = f || {};
    return { warmth: clamp(num(f.warmth), -1, 1), sharpen: clamp(num(f.sharpen), 0, 1), vignette: clamp(num(f.vignette), 0, 1), matte: clamp(num(f.matte), 0, 1) };
  }
  function hasExtras(f){ var x = extras(f); return !!(x.warmth || x.sharpen || x.vignette || x.matte); }

  // Warmth multiplies the colour channels: warm keeps red and lowers blue (a little green), cool does the opposite.
  function tint(w){
    if (!w) return null;
    return w > 0 ? { r: 1, g: 1 - 0.06 * w, b: 1 - 0.15 * w } : { r: 1 - 0.15 * -w, g: 1 - 0.04 * -w, b: 1 };
  }
  function tintCss(w){
    var t = tint(w); if (!t) return null;
    return 'rgb(' + Math.round(t.r * 255) + ',' + Math.round(t.g * 255) + ',' + Math.round(t.b * 255) + ')';
  }
  // Faded look: blends the picture toward a light grey, which lifts the blacks and softens the contrast.
  function matteAlpha(m){ return r4(m * MATTE_MAX); }
  function matteCss(m){ return m ? 'rgba(' + MATTE_GRAY + ',' + MATTE_GRAY + ',' + MATTE_GRAY + ',' + matteAlpha(m) + ')' : null; }
  // Vignette: the picture keeps cos(angle * t)^4 of its brightness at fraction t of the way from the centre (0)
  // to the corner (1). That is the curve of ffmpeg's own vignette filter, so the three renderers agree.
  function vignetteAngle(v){ return r4(v * VIG_ANGLE); }
  function vignetteLevel(v, t){ return Math.pow(Math.cos(vignetteAngle(v) * t), 4); }
  function vignetteStops(v){
    var out = []; for (var i = 0; i <= 12; i++){ var t = i / 12; out.push([t, r4(1 - vignetteLevel(v, t))]); } return out;
  }
  function vignetteCss(v){
    if (!v) return null;
    return 'radial-gradient(circle farthest-corner at 50% 50%, ' +
      vignetteStops(v).map(function (s){ return 'rgba(0,0,0,' + s[1] + ') ' + Math.round(s[0] * 100) + '%'; }).join(', ') + ')';
  }
  // The preview's sharpen: a 3x3 kernel for an SVG feConvolveMatrix.
  function sharpenKernel(s){ var a = 0.5 * s; return [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0].map(r4).join(' '); }

  // ffmpeg filters for the four looks, in the order they are laid on: warmth, sharpen, faded, vignette.
  function ffmpegExtras(f){
    var x = extras(f), out = [], t = tint(x.warmth);
    if (t) out.push('colorchannelmixer=rr=' + t.r.toFixed(4) + ':gg=' + t.g.toFixed(4) + ':bb=' + t.b.toFixed(4) + ',format=yuv420p');
    if (x.sharpen) out.push('unsharp=5:5:' + (x.sharpen * SHARP_MAX).toFixed(3) + ':5:5:0');
    if (x.matte){
      var a = matteAlpha(x.matte), k = (1 - a).toFixed(4), Y = 16 + 219 * MATTE_GRAY / 255;   // grey in video (limited) range
      out.push("lutyuv=y='val*" + k + '+' + (Y * a).toFixed(3) + "':u='val*" + k + '+' + (128 * a).toFixed(3) + "':v='val*" + k + '+' + (128 * a).toFixed(3) + "'");
    }
    if (x.vignette) out.push('vignette=angle=' + vignetteAngle(x.vignette).toFixed(4) + ':eval=init');
    return out;
  }

  /* ---------- titles and captions: one drawing shared by the editor preview, the fast engine and the ffmpeg engine ---------- */
  var TITLE_POS = { top: 0.07, center: 0.40, bottom: 0.76 };   // as a fraction of the picture height (same numbers as plan.js)
  var FONTS = {
    sans: { label: 'Sans', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    serif: { label: 'Serif', css: 'Georgia, "Times New Roman", "Noto Serif", serif' },
    mono: { label: 'Mono', css: 'ui-monospace, Menlo, Consolas, "Courier New", monospace' },
    bold: { label: 'Bold', css: 'Impact, "Arial Black", "Roboto Condensed", system-ui, sans-serif' },
    script: { label: 'Script', css: '"Segoe Script", "Brush Script MT", "Comic Sans MS", cursive' },
    inter: { label: 'Inter', css: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    montserrat: { label: 'Montserrat', css: '"Montserrat", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    poppins: { label: 'Poppins', css: '"Poppins", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    bebas: { label: 'Bebas Neue', css: '"Bebas Neue", Impact, "Arial Narrow", sans-serif' },
    anton: { label: 'Anton', css: '"Anton", Impact, "Arial Narrow", sans-serif' },
    oswald: { label: 'Oswald', css: '"Oswald", Impact, "Arial Narrow", sans-serif' },
    archivo: { label: 'Archivo Black', css: '"Archivo Black", "Arial Black", Impact, sans-serif' },
    bangers: { label: 'Bangers', css: '"Bangers", Impact, "Comic Sans MS", cursive' },
    righteous: { label: 'Righteous', css: '"Righteous", system-ui, -apple-system, "Segoe UI", sans-serif' },
    playfair: { label: 'Playfair', css: '"Playfair Display", Georgia, "Times New Roman", serif' },
    pacifico: { label: 'Pacifico', css: '"Pacifico", "Brush Script MT", "Segoe Script", cursive' },
    lobster: { label: 'Lobster', css: '"Lobster", "Brush Script MT", "Segoe Script", cursive' },
    caveat: { label: 'Caveat', css: '"Caveat", "Segoe Script", "Comic Sans MS", cursive' },
    dancing: { label: 'Dancing Script', css: '"Dancing Script", "Brush Script MT", "Segoe Script", cursive' },
    lora: { label: 'Lora', css: '"Lora", Georgia, "Times New Roman", serif' },
    merriweather: { label: 'Merriweather', css: '"Merriweather", Georgia, "Times New Roman", serif' },
    librebaskerville: { label: 'Libre Baskerville', css: '"Libre Baskerville", Georgia, "Times New Roman", serif' },
    crimsontext: { label: 'Crimson', css: '"Crimson", Georgia, "Times New Roman", serif' },
    ebgaramond: { label: 'EB Garamond', css: '"EB Garamond", Georgia, "Times New Roman", serif' },
    cormorantgaramond: { label: 'Cormorant', css: '"Cormorant", Georgia, "Times New Roman", serif' },
    ptserif: { label: 'PT Serif', css: '"PT Serif", Georgia, "Times New Roman", serif' },
    sourceserif4: { label: 'Source Serif', css: '"Source Serif", Georgia, "Times New Roman", serif' },
    librecaslontext: { label: 'Libre Caslon', css: '"Libre Caslon", Georgia, "Times New Roman", serif' },
    abrilfatface: { label: 'Abril Fatface', css: '"Abril Fatface", Georgia, "Times New Roman", serif' },
    dmserifdisplay: { label: 'DM Serif Display', css: '"DM Serif Display", Georgia, "Times New Roman", serif' },
    cinzel: { label: 'Cinzel', css: '"Cinzel", Georgia, "Times New Roman", serif' },
    cinzeldecorative: { label: 'Cinzel Decorative', css: '"Cinzel Decorative", Georgia, "Times New Roman", serif' },
    marcellus: { label: 'Marcellus', css: '"Marcellus", Georgia, "Times New Roman", serif' },
    oldstandardtt: { label: 'Old Standard', css: '"Old Standard", Georgia, "Times New Roman", serif' },
    alfaslabone: { label: 'Alfa Slab', css: '"Alfa Slab", Impact, "Arial Narrow", sans-serif' },
    unifrakturcook: { label: 'Gothic', css: '"Gothic", Georgia, "Times New Roman", serif' },
    greatvibes: { label: 'Great Vibes', css: '"Great Vibes", "Brush Script MT", "Segoe Script", cursive' },
    sacramento: { label: 'Sacramento', css: '"Sacramento", "Brush Script MT", "Segoe Script", cursive' },
    allura: { label: 'Allura', css: '"Allura", "Brush Script MT", "Segoe Script", cursive' },
    parisienne: { label: 'Parisienne', css: '"Parisienne", "Brush Script MT", "Segoe Script", cursive' },
    alexbrush: { label: 'Alex Brush', css: '"Alex Brush", "Brush Script MT", "Segoe Script", cursive' },
    pinyonscript: { label: 'Pinyon Script', css: '"Pinyon Script", "Brush Script MT", "Segoe Script", cursive' },
    italianno: { label: 'Italianno', css: '"Italianno", "Brush Script MT", "Segoe Script", cursive' },
    tangerine: { label: 'Tangerine', css: '"Tangerine", "Brush Script MT", "Segoe Script", cursive' },
    satisfy: { label: 'Satisfy', css: '"Satisfy", "Brush Script MT", "Segoe Script", cursive' },
    kaushanscript: { label: 'Kaushan Script', css: '"Kaushan Script", "Brush Script MT", "Segoe Script", cursive' },
    yellowtail: { label: 'Yellowtail', css: '"Yellowtail", "Brush Script MT", "Segoe Script", cursive' },
    courgette: { label: 'Courgette', css: '"Courgette", "Brush Script MT", "Segoe Script", cursive' },
    cookie: { label: 'Cookie', css: '"Cookie", "Brush Script MT", "Segoe Script", cursive' },
    playball: { label: 'Playball', css: '"Playball", "Brush Script MT", "Segoe Script", cursive' },
    shadowsintolight: { label: 'Shadows Into Light', css: '"Shadows Into Light", "Segoe Script", "Comic Sans MS", cursive' },
    indieflower: { label: 'Indie Flower', css: '"Indie Flower", "Segoe Script", "Comic Sans MS", cursive' },
    permanentmarker: { label: 'Permanent Marker', css: '"Permanent Marker", "Segoe Script", "Comic Sans MS", cursive' },
    rocksalt: { label: 'Rock Salt', css: '"Rock Salt", "Segoe Script", "Comic Sans MS", cursive' },
    amaticsc: { label: 'Amatic', css: '"Amatic", "Segoe Script", "Comic Sans MS", cursive' },
    gloriahallelujah: { label: 'Gloria Hallelujah', css: '"Gloria Hallelujah", "Segoe Script", "Comic Sans MS", cursive' },
    luckiestguy: { label: 'Luckiest Guy', css: '"Luckiest Guy", Impact, "Arial Narrow", sans-serif' },
    chewy: { label: 'Chewy', css: '"Chewy", Impact, "Arial Narrow", sans-serif' },
    creepster: { label: 'Creepster', css: '"Creepster", Impact, "Arial Narrow", sans-serif' },
    bungee: { label: 'Bungee', css: '"Bungee", Impact, "Arial Narrow", sans-serif' },
    staatliches: { label: 'Staatliches', css: '"Staatliches", Impact, "Arial Narrow", sans-serif' },
    monoton: { label: 'Monoton', css: '"Monoton", Impact, "Arial Narrow", sans-serif' },
    blackopsone: { label: 'Black Ops', css: '"Black Ops", Impact, "Arial Narrow", sans-serif' },
    russoone: { label: 'Russo One', css: '"Russo One", Impact, "Arial Narrow", sans-serif' },
    pressstart2p: { label: 'Pixel', css: '"Pixel", Impact, "Arial Narrow", sans-serif' },
    orbitron: { label: 'Orbitron', css: '"Orbitron", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    specialelite: { label: 'Typewriter', css: '"Typewriter", Georgia, "Times New Roman", serif' },
    lilitaone: { label: 'Lilita One', css: '"Lilita One", Impact, "Arial Narrow", sans-serif' },
    fredoka: { label: 'Fredoka', css: '"Fredoka", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    teko: { label: 'Teko', css: '"Teko", Impact, "Arial Narrow", sans-serif' },
    lato: { label: 'Lato', css: '"Lato", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    opensans: { label: 'Open Sans', css: '"Open Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    roboto: { label: 'Roboto', css: '"Roboto", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    raleway: { label: 'Raleway', css: '"Raleway", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    nunito: { label: 'Nunito', css: '"Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    quicksand: { label: 'Quicksand', css: '"Quicksand", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    comfortaa: { label: 'Comfortaa', css: '"Comfortaa", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    josefinsans: { label: 'Josefin Sans', css: '"Josefin Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    barlowcondensed: { label: 'Barlow Condensed', css: '"Barlow Condensed", Impact, "Arial Narrow", sans-serif' },
    baloo2: { label: 'Baloo', css: '"Baloo", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }
  };
  function fontCss(k){ return (FONTS[k] || FONTS.sans).css; }
  function fontList(){ return Object.keys(FONTS).map(function (k){ return { key: k, label: FONTS[k].label }; }); }
  // Loads the web fonts the titles use, so a canvas draws them and not a stand-in. items: { font, weight, text } (or just a font key). Only the parts of a font
  // that the text needs are fetched. It never waits more than 8 seconds and never fails, so an export is not held up.
  function loadFonts(items){
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return Promise.resolve();
    var seen = {}, jobs = [];
    (items || []).forEach(function (it){
      var o = typeof it === 'string' ? { font: it } : (it || {}), spec = (o.weight || 700) + ' 32px ' + fontCss(o.font), text = String(o.text || 'Aa'), id = spec + '|' + text;
      if (seen[id]) return; seen[id] = 1;
      try { jobs.push(document.fonts.load(spec, text)); } catch (e) {}
    });
    var all = Promise.all(jobs).catch(function (){}), timer, wait = new Promise(function (res){ timer = setTimeout(res, 8000); });
    return Promise.race([all, wait]).then(function (){ clearTimeout(timer); });
  }
  // Size in pixels, the visible width of the outline (up to 6% of the letter size), and the strength of the shadow (1 = the look titles always had).
  function titleLook(t, H){
    var px = Math.max(10, Math.round((t.size || 7) / 100 * H)), o = clamp(num(t.outline), 0, 1), sh = t.shadow == null ? 1 : clamp(num(t.shadow), 0, 1);
    return { px: px, outlinePx: o > 0 ? r4(px * 0.06 * o) : 0, shadow: sh, blur: Math.max(2, px * 0.08) * sh, offY: Math.max(1, px * 0.04) * sh };
  }
  // The same look as CSS, for the preview.
  function titleStyle(t, H){
    var L = titleLook(t, H);
    return { px: L.px, fontFamily: fontCss(t.font), stroke: L.outlinePx ? (L.outlinePx * 2) + 'px #000' : '',
      shadow: L.shadow > 0 ? '0 ' + r4(L.offY) + 'px ' + r4(L.blur) + 'px rgba(0,0,0,0.7)' : 'none' };
  }
  /* ---------- text effects: gradient fill, curved text, glow, bubble, 3D (and word art, which is a mix of these) ----------
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
    String(t.text || '').split('\n').forEach(function (par){
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
  // ---------- a turned title, and where a title is ----------
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
    if (hasTitleFx(t)) return drawStyledTitle(g, t, W, H);
    var L = titleLook(t, H), px = L.px;
    g.font = (t.weight || 700) + ' ' + px + 'px ' + fontCss(t.font);
    g.textAlign = 'center'; g.textBaseline = 'top';
    var maxW = W * 0.88, lines = [];
    String(t.text || '').split('\n').forEach(function (par){
      var line = '';
      par.split(' ').forEach(function (w){
        var test = line ? line + ' ' + w : w;
        if (line && g.measureText(test).width > maxW){ lines.push(line); line = w; } else line = test;
      });
      lines.push(line);
    });
    var lh = Math.round(px * 1.2), y0 = Math.round((TITLE_POS[t.pos] != null ? TITLE_POS[t.pos] : TITLE_POS.bottom) * H);
    if (t.bg){
      var widest = 0; lines.forEach(function (l){ widest = Math.max(widest, g.measureText(l).width); });
      var bw = Math.min(W, widest + px * 0.8);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(Math.round(W / 2 - bw / 2), Math.round(y0 - px * 0.2), Math.round(bw), Math.round(lines.length * lh + px * 0.4));
    }
    function shadow(){
      if (L.shadow > 0){ g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = L.blur; g.shadowOffsetY = L.offY; }
      else { g.shadowColor = 'rgba(0,0,0,0)'; g.shadowBlur = 0; g.shadowOffsetY = 0; }
    }
    if (L.outlinePx > 0 && g.strokeText){
      // outline first (the shadow follows the outline), then the letters on top of it
      shadow(); g.lineJoin = 'round'; g.lineWidth = L.outlinePx * 2; g.strokeStyle = '#000';
      lines.forEach(function (l, i){ g.strokeText(l, W / 2, y0 + i * lh); });
      g.fillStyle = t.color || '#ffffff'; g.shadowColor = 'rgba(0,0,0,0)'; g.shadowBlur = 0; g.shadowOffsetY = 0;
    } else { g.fillStyle = t.color || '#ffffff'; shadow(); }
    if (t.hlWord != null && t.hlColor && g.measureText){
      // word highlight: the word being spoken (t.hlWord, counted from 0 over all the lines) in its own colour, the rest in the title colour
      var wi = 0, base = t.color || '#ffffff', spw = g.measureText(' ').width;
      g.textAlign = 'left';
      lines.forEach(function (l, i){
        var x = W / 2 - g.measureText(l).width / 2;
        l.split(' ').forEach(function (tk){ g.fillStyle = wi === t.hlWord ? t.hlColor : base; g.fillText(tk, x, y0 + i * lh); x += g.measureText(tk).width + spw; wi++; });
      });
      g.textAlign = 'center'; g.fillStyle = base;
    } else lines.forEach(function (l, i){ g.fillText(l, W / 2, y0 + i * lh); });
    return lines;
  }

  var api = { KEYS: KEYS, extras: extras, hasExtras: hasExtras, tint: tint, tintCss: tintCss, matteAlpha: matteAlpha, matteCss: matteCss,
    vignetteAngle: vignetteAngle, vignetteLevel: vignetteLevel, vignetteStops: vignetteStops, vignetteCss: vignetteCss,
    sharpenKernel: sharpenKernel, ffmpegExtras: ffmpegExtras, MATTE_GRAY: MATTE_GRAY,
    fontCss: fontCss, fontList: fontList, loadFonts: loadFonts, titleLook: titleLook, titleStyle: titleStyle, drawTitle: drawTitle, TITLE_POS: TITLE_POS,
    hasTitleFx: hasTitleFx, cleanStyle: cleanStyle, ART: ART, art: art, FX_KEYS: FX_KEYS, titleBox: titleBox };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiLook = api;
  return api;
})();

// Which version of this file is running (the Home screen lists these, so a stale copy is easy to spot).
if (typeof window !== 'undefined'){ window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['look.js'] = 'textfx'; }
