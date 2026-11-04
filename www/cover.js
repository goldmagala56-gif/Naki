'use strict';
/* Naki cover maker: a cover image (thumbnail) for the finished video. Pick any moment of the edited video, crop it to the shape you need,
   add a title and a subtitle, and save it as a JPG or PNG in the size YouTube, TikTok, Instagram or a square post wants.

   The drawing is plain canvas code, kept apart from the screen so the same picture comes out whatever the controls look like.
   open({...}) shows the full-screen maker (it builds its own screen, so the page only needs this file). What the page gives it:
     durationMs, startMs        how long the edited video is, and where the playhead was
     frameAt(ms)                -> a promise of { canvas, w, h }: the picture at that moment of the edited video (or null)
     fonts, fontFamily(key), loadFonts(keys)   the title fonts the editor already has (all optional)
     title, fileBase, toast, onClose                                                               (all optional) */
var NakiCover = (function () {
  var SIZES = [
    { key: 'youtube', label: 'YouTube', w: 1280, h: 720 },
    { key: 'tiktok', label: 'TikTok / Shorts / Reels', w: 1080, h: 1920 },
    { key: 'portrait', label: 'Instagram 4:5', w: 1080, h: 1350 },
    { key: 'square', label: 'Square', w: 1080, h: 1080 }
  ];
  var YT_LIMIT = 2000000;   // YouTube accepts cover images up to 2 MB

  function sizeOf(key){ for (var i = 0; i < SIZES.length; i++) if (SIZES[i].key === key) return SIZES[i]; return SIZES[0]; }
  function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
  function defaults(title){
    return { size: 'youtube', fit: 'fill', zoom: 1, px: 0.5, py: 0.5, punch: 0,
      title: title || '', sub: '', font: 'sans', textSize: 12, color: '#ffffff', subColor: '#ffd447', pos: 'bottom', outline: 0.6, shadow: 1, band: false, format: 'jpg' };
  }

  // ---------- shapes (pure) ----------
  // The part of a picture (sw x sh) that fills a box (dw x dh) completely: zoom 1 to 4, and px / py (0 to 1) say where in the picture the box looks.
  function coverRect(sw, sh, dw, dh, zoom, px, py){
    var s = Math.max(dw / sw, dh / sh) * Math.max(1, zoom || 1), vw = Math.min(sw, dw / s), vh = Math.min(sh, dh / s);
    return { sx: (sw - vw) * clamp(px == null ? 0.5 : px, 0, 1), sy: (sh - vh) * clamp(py == null ? 0.5 : py, 0, 1), sw: vw, sh: vh };
  }
  // The largest rectangle of the picture's shape that fits inside the box, centred.
  function containRect(sw, sh, dw, dh){
    var s = Math.min(dw / sw, dh / sh), w = sw * s, h = sh * s;
    return { x: (dw - w) / 2, y: (dh - h) / 2, w: w, h: h };
  }
  // Breaks text into lines that fit maxW. measure(text) gives the width. Lines in the text stay lines. A word too long for a line is broken.
  // With maxLines, anything after that is cut and the last line ends with an ellipsis.
  function wrapLines(measure, text, maxW, maxLines){
    var out = [];
    String(text == null ? '' : text).split(/\n/).forEach(function (para){
      var words = para.split(/\s+/).filter(Boolean), cur = '';
      if (!words.length){ out.push(''); return; }
      words.forEach(function (w){
        var t = cur ? cur + ' ' + w : w;
        if (measure(t) <= maxW){ cur = t; return; }
        if (cur){ out.push(cur); cur = ''; }
        if (measure(w) <= maxW){ cur = w; return; }
        var part = '';
        for (var i = 0; i < w.length; i++){
          var tt = part + w.charAt(i);
          if (measure(tt) > maxW && part){ out.push(part); part = w.charAt(i); } else part = tt;
        }
        cur = part;
      });
      if (cur) out.push(cur);
    });
    if (maxLines && out.length > maxLines){ out = out.slice(0, maxLines); out[maxLines - 1] = out[maxLines - 1].replace(/[\s.,;:!?-]+$/, '') + '\u2026'; }
    return out;
  }

  // ---------- drawing ----------
  function drawText(g, p, W, H, family){
    var blocks = [];
    if (String(p.title || '').trim()) blocks.push({ text: p.title, px: p.textSize / 100 * H, color: p.color, weight: 800 });
    if (String(p.sub || '').trim()) blocks.push({ text: p.sub, px: p.textSize / 100 * H * 0.55, color: p.subColor, weight: 700 });
    if (!blocks.length) return;
    var maxW = W * 0.88;
    function layout(sc, cap){
      var out = [], tot = 0, n = 0;
      blocks.forEach(function (b){
        var px = Math.max(8, Math.round(b.px * sc)), lh = Math.round(px * 1.12);
        g.font = b.weight + ' ' + px + 'px ' + family;
        var ls = wrapLines(function (s){ return g.measureText(s).width; }, b.text, maxW, cap);
        out.push({ lines: ls, px: px, lh: lh, color: b.color, weight: b.weight }); tot += ls.length * lh; n += ls.length;
      });
      return { out: out, tot: tot, n: n };
    }
    var scale = 1, L = layout(scale, 12), guard = 0;
    while ((L.tot > H * 0.7 || L.n > 5) && guard++ < 14){ scale *= 0.88; L = layout(scale, 12); }   // a long title gets smaller instead of running off the picture
    if (L.n > 5) L = layout(scale, 4);   // still too long at the smallest size: keep the first lines
    var pad = Math.round(H * 0.04), y = p.pos === 'top' ? pad : p.pos === 'center' ? (H - L.tot) / 2 : H - pad - L.tot;
    if (p.band){ g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, y - pad * 0.6, W, L.tot + pad * 1.2); }
    g.textAlign = 'center'; g.textBaseline = 'top'; g.lineJoin = 'round';
    L.out.forEach(function (b){
      g.font = b.weight + ' ' + b.px + 'px ' + family;
      b.lines.forEach(function (line){
        if (p.shadow > 0){ g.shadowColor = 'rgba(0,0,0,' + (0.75 * p.shadow) + ')'; g.shadowBlur = b.px * 0.18 * p.shadow; g.shadowOffsetY = b.px * 0.05 * p.shadow; }
        if (p.outline > 0){ g.lineWidth = b.px * 0.16 * p.outline; g.strokeStyle = '#000000'; g.strokeText(line, W / 2, y); g.shadowColor = 'rgba(0,0,0,0)'; }
        g.fillStyle = b.color; g.fillText(line, W / 2, y);
        g.shadowColor = 'rgba(0,0,0,0)'; g.shadowBlur = 0; g.shadowOffsetY = 0;
        y += b.lh;
      });
    });
  }
  // snap = { canvas, w, h } (a still picture); p = the settings (see defaults); family = the CSS font family for the title.
  function draw(canvas, snap, p, family){
    var size = sizeOf(p.size), W = size.w, H = size.h;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    var g = canvas.getContext('2d'), canFilter = typeof g.filter === 'string', u = clamp((p.punch || 0) / 100, 0, 1);
    var punch = (canFilter && u > 0) ? 'contrast(' + (1 + 0.3 * u).toFixed(3) + ') saturate(' + (1 + 0.6 * u).toFixed(3) + ') brightness(' + (1 + 0.06 * u).toFixed(3) + ')' : 'none';
    g.save();
    g.clearRect(0, 0, W, H); g.fillStyle = '#0d141b'; g.fillRect(0, 0, W, H);
    if (snap && snap.canvas && snap.w && snap.h){
      if (p.fit === 'blur'){   // the whole picture, over a soft blurred copy of itself that fills the space
        var bg = coverRect(snap.w, snap.h, W, H, 1.15, 0.5, 0.5);
        if (canFilter) g.filter = 'blur(' + Math.round(Math.min(W, H) * 0.03) + 'px) brightness(0.7)';
        g.drawImage(snap.canvas, bg.sx, bg.sy, bg.sw, bg.sh, 0, 0, W, H);
        g.filter = 'none';
        if (!canFilter){ g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, W, H); }
        var c = containRect(snap.w, snap.h, W, H);
        if (canFilter) g.filter = punch;
        g.drawImage(snap.canvas, 0, 0, snap.w, snap.h, c.x, c.y, c.w, c.h);
      } else {
        var r = coverRect(snap.w, snap.h, W, H, p.zoom, p.px, p.py);
        if (canFilter) g.filter = punch;
        g.drawImage(snap.canvas, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H);
      }
      g.filter = 'none';
    }
    drawText(g, p, W, H, family || 'system-ui, -apple-system, "Segoe UI", sans-serif');
    g.restore();
  }
  // The image as a file. JPG is made smaller step by step until it is under maxBytes (YouTube: 2 MB). -> promise of { blob, quality }
  function encode(canvas, fmt, maxBytes){
    return new Promise(function (resolve, reject){
      if (fmt === 'png'){ canvas.toBlob(function (b){ if (b) resolve({ blob: b, quality: null }); else reject(new Error('The image could not be made.')); }, 'image/png'); return; }
      var q = 0.92;
      (function next(){
        canvas.toBlob(function (b){
          if (!b){ reject(new Error('The image could not be made.')); return; }
          if (!maxBytes || b.size <= maxBytes || q <= 0.5){ resolve({ blob: b, quality: q }); return; }
          q = Math.round((q - 0.07) * 100) / 100; next();
        }, 'image/jpeg', q);
      })();
    });
  }

  // ---------- the screen ----------
  function open(o){
    o = o || {};
    if (typeof document === 'undefined') return null;
    var doc = document, p = defaults(o.title), snap = null, tMs = Math.max(0, Math.round(o.startMs || 0)), total = Math.max(1, Math.round(o.durationMs || 1));
    var raf = 0, frameTimer = 0, token = 0, gone = false, toast = o.toast || function (){};
    function mk(tag, css, text){ var e = doc.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
    function add(parent){ for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }
    var BTN = 'border:1px solid var(--line,#2f4556);background:var(--panel-2,#20313f);color:var(--chalk,#f3eee3);border-radius:12px;padding:0 14px;min-height:44px;font:inherit;font-weight:650;cursor:pointer;flex:none;';
    var BTN_ON = 'background:var(--mango,#ff9f1c);color:#1d1300;border-color:transparent;';
    function button(text, on, fn){ var b = mk('button', BTN + (on ? BTN_ON : ''), text); b.type = 'button'; b.addEventListener('click', fn); return b; }
    function family(){ return (o.fontFamily && p.font !== 'sans') ? (o.fontFamily(p.font) || '') : ''; }

    var root = mk('div', 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:200;background:var(--ink,#172938);color:var(--chalk,#f3eee3);display:flex;flex-direction:column;font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Cover image');
    var head = mk('div', 'display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line,#2f4556);');
    var closeBtn = button('\u2039 Back', false, close);
    add(head, closeBtn, mk('div', 'font-weight:800;font-size:18px;flex:1;', 'Cover image'));
    var stage = mk('div', 'padding:10px 14px;display:flex;justify-content:center;background:#0d141b;');
    var canvas = mk('canvas', 'max-width:100%;max-height:40vh;border-radius:10px;background:#000;display:block;');
    add(stage, canvas);
    var body = mk('div', 'flex:1;overflow:auto;padding:12px 14px 28px;');
    var inner = mk('div', 'display:grid;gap:14px;max-width:560px;margin:0 auto;width:100%;');
    add(body, inner);
    add(root, head, stage, body);

    var dim = 'color:var(--dim,#9fb0bd);font-size:13px;';
    function section(title){ return mk('div', 'font-weight:750;margin-top:2px;', title); }
    function hint(text){ return mk('div', dim, text); }
    function chips(list, cur, pick){
      var row = mk('div', 'display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;');
      list.forEach(function (it){ row.appendChild(button(it.label, it.key === cur, function (){ pick(it.key); })); });
      return row;
    }
    function slider(label, min, max, step, val, fmt, onInput){
      var wrap = mk('div', 'display:grid;gap:2px;'), top = mk('div', 'display:flex;justify-content:space-between;' + dim), out = mk('span', null, fmt(val)), r = mk('input', 'width:100%;accent-color:var(--mango,#ff9f1c);');
      r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val; r.setAttribute('aria-label', label);
      r.addEventListener('input', function (){ out.textContent = fmt(+r.value); onInput(+r.value); });
      add(top, mk('span', null, label), out); add(wrap, top, r);
      return wrap;
    }
    function textBox(label, val, multi, onInput){
      var wrap = mk('div', 'display:grid;gap:4px;'), t = mk(multi ? 'textarea' : 'input', 'width:100%;background:var(--panel,#192733);color:inherit;border:1px solid var(--line,#2f4556);border-radius:10px;padding:10px 12px;font:inherit;');
      if (multi) t.rows = 2; else t.type = 'text';
      t.value = val; t.setAttribute('aria-label', label); t.placeholder = label;
      t.addEventListener('input', function (){ onInput(t.value); });
      return add(wrap, t);
    }
    function colour(label, val, onInput){
      var r = mk('div', 'display:flex;align-items:center;justify-content:space-between;gap:10px;'), c = mk('input', 'width:56px;height:36px;border:0;background:none;padding:0;');
      c.type = 'color'; c.value = val; c.setAttribute('aria-label', label); c.addEventListener('input', function (){ onInput(c.value); });
      return add(r, mk('span', dim, label), c);
    }
    var status = mk('div', dim + 'min-height:20px;');

    function schedule(){ if (raf || gone) return; raf = requestAnimationFrame(function (){ raf = 0; if (!gone) draw(canvas, snap, p, family()); }); }
    function ensureFont(){
      var fam = family(); if (!fam){ schedule(); return; }
      var p1 = Promise.resolve(o.loadFonts ? o.loadFonts([p.font]) : null);
      p1.then(function (){ return (doc.fonts && doc.fonts.load) ? doc.fonts.load('800 40px ' + fam) : null; }).then(schedule, schedule);
    }
    function fmtT(ms){ var s = ms / 1000, m = Math.floor(s / 60); return m + ':' + ((s - m * 60) < 10 ? '0' : '') + (s - m * 60).toFixed(1); }
    function loadFrame(){
      if (!o.frameAt){ status.textContent = 'No picture is available here.'; return; }
      var mine = ++token; status.textContent = 'Loading the picture...';
      Promise.resolve(o.frameAt(tMs)).then(function (s){
        if (mine !== token || gone) return;
        if (!s || !s.canvas){ status.textContent = 'That moment could not be read. Try another one.'; return; }
        snap = s; status.textContent = ''; schedule();
      }, function (){ if (mine === token) status.textContent = 'That moment could not be read. Try another one.'; });
    }
    function laterFrame(){ clearTimeout(frameTimer); frameTimer = setTimeout(loadFrame, 160); }
    function nudge(ms){ tMs = clamp(tMs + ms, 0, total); build(); laterFrame(); }

    function build(){
      inner.textContent = '';
      var size = sizeOf(p.size);
      add(inner, section('Size'),
        chips(SIZES.map(function (s){ return { key: s.key, label: s.label }; }), p.size, function (k){ p.size = k; build(); schedule(); }),
        hint(size.w + ' \u00d7 ' + size.h + ' pixels' + (p.size === 'youtube' ? ' (YouTube asks for 1280 \u00d7 720, under 2 MB)' : p.size === 'tiktok' ? ' (the shape TikTok, YouTube Shorts and Reels use)' : '')));
      add(inner, section('Picture'),
        slider('Moment of the video', 0, total, 100, tMs, fmtT, function (v){ tMs = v; laterFrame(); }),
        (function (){ var r = mk('div', 'display:flex;gap:8px;'); add(r, button('\u2039 1 s', false, function (){ nudge(-1000); }), button('\u2039 0.1 s', false, function (){ nudge(-100); }), button('0.1 s \u203a', false, function (){ nudge(100); }), button('1 s \u203a', false, function (){ nudge(1000); })); return r; })(),
        chips([{ key: 'fill', label: 'Fill the shape' }, { key: 'blur', label: 'Whole picture on blur' }], p.fit, function (k){ p.fit = k; build(); schedule(); }));
      if (p.fit === 'fill') add(inner,
        slider('Zoom', 100, 300, 5, Math.round(p.zoom * 100), function (v){ return v + '%'; }, function (v){ p.zoom = v / 100; schedule(); }),
        slider('Left / right', 0, 100, 1, Math.round(p.px * 100), function (v){ return v + '%'; }, function (v){ p.px = v / 100; schedule(); }),
        slider('Up / down', 0, 100, 1, Math.round(p.py * 100), function (v){ return v + '%'; }, function (v){ p.py = v / 100; schedule(); }));
      var probe = canvas.getContext && canvas.getContext('2d');
      if (probe && typeof probe.filter === 'string') add(inner, slider('Punch (colour and contrast)', 0, 100, 5, p.punch, function (v){ return v + '%'; }, function (v){ p.punch = v; schedule(); }));
      add(inner, section('Title'),
        textBox('Title', p.title, true, function (v){ p.title = v; schedule(); }),
        textBox('Subtitle (optional)', p.sub, false, function (v){ p.sub = v; schedule(); }));
      if (o.fonts && o.fonts.length) add(inner, chips(o.fonts, p.font, function (k){ p.font = k; build(); ensureFont(); }));
      add(inner,
        slider('Text size', 4, 30, 1, p.textSize, function (v){ return v + '%'; }, function (v){ p.textSize = v; schedule(); }),
        chips([{ key: 'top', label: 'Top' }, { key: 'center', label: 'Middle' }, { key: 'bottom', label: 'Bottom' }], p.pos, function (k){ p.pos = k; build(); schedule(); }),
        colour('Title colour', p.color, function (v){ p.color = v; schedule(); }),
        colour('Subtitle colour', p.subColor, function (v){ p.subColor = v; schedule(); }),
        slider('Outline', 0, 100, 5, Math.round(p.outline * 100), function (v){ return v + '%'; }, function (v){ p.outline = v / 100; schedule(); }),
        slider('Shadow', 0, 100, 5, Math.round(p.shadow * 100), function (v){ return v + '%'; }, function (v){ p.shadow = v / 100; schedule(); }),
        chips([{ key: 'off', label: 'No dark band' }, { key: 'on', label: 'Dark band behind text' }], p.band ? 'on' : 'off', function (k){ p.band = k === 'on'; build(); schedule(); }));
      add(inner, section('Save'),
        chips([{ key: 'jpg', label: 'JPG (smaller)' }, { key: 'png', label: 'PNG (sharpest)' }], p.format, function (k){ p.format = k; build(); }),
        (function (){ var r = mk('div', 'display:flex;gap:8px;flex-wrap:wrap;'); add(r, button('Download', true, function (){ save(false); }), button('Share / save to gallery', false, function (){ save(true); })); return r; })(),
        status);
    }
    function save(share){
      if (!snap){ toast('Wait for the picture to load first.'); return; }
      draw(canvas, snap, p, family());
      status.textContent = 'Making the image...';
      encode(canvas, p.format, p.size === 'youtube' ? YT_LIMIT : 0).then(function (r){
        var ext = p.format === 'png' ? 'png' : 'jpg', base = String(o.fileBase || 'naki').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'naki', name = base + '_cover_' + p.size + '.' + ext;
        var kb = Math.round(r.blob.size / 1024), note = (p.format === 'png' && p.size === 'youtube' && r.blob.size > YT_LIMIT) ? ' This is over YouTube\u2019s 2 MB limit: choose JPG.' : '';
        if (share && typeof navigator !== 'undefined' && navigator.share && navigator.canShare){
          var f = new File([r.blob], name, { type: r.blob.type });
          if (navigator.canShare({ files: [f] })){
            return navigator.share({ files: [f], title: name }).then(function (){ status.textContent = 'Shared ' + name + ' (' + kb + ' KB).' + note; }, function (){ status.textContent = ''; });
          }
        }
        var a = doc.createElement('a'); a.href = URL.createObjectURL(r.blob); a.download = name;
        doc.body.appendChild(a); a.click(); setTimeout(function (){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        status.textContent = 'Saved ' + name + ' (' + kb + ' KB).' + note;
      }).catch(function (err){ status.textContent = (err && err.message) || 'The image could not be made.'; });
    }
    function onKey(ev){ if (ev.key === 'Escape') close(); }
    function close(){
      if (gone) return; gone = true; clearTimeout(frameTimer); doc.removeEventListener('keydown', onKey);
      if (root.parentNode) root.parentNode.removeChild(root);
      if (o.onClose) o.onClose();
    }

    doc.body.appendChild(root); doc.addEventListener('keydown', onKey);
    build(); schedule(); loadFrame(); if (p.font !== 'sans') ensureFont();
    return { close: close };
  }

  var api = { SIZES: SIZES, sizeOf: sizeOf, defaults: defaults, coverRect: coverRect, containRect: containRect, wrapLines: wrapLines, draw: draw, encode: encode, open: open };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiCover = api;
  return api;
})();

// Which version of this file is running (the Home screen lists these, so a stale copy is easy to spot).
if (typeof window !== 'undefined'){ window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['cover.js'] = 'cover1'; }