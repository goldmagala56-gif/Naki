'use strict';
// node tools/apply-text-sticker-kf.js   (from the project folder)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function load(rel) { const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o) { fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const problems = [];
function rep(o, find, replace, label) {
  const n = o.text.split(find).length - 1;
  if (n !== 1) { problems.push(label + ': found ' + n + ' times (need exactly 1) in ' + o.rel); return; }
  o.text = o.text.replace(find, () => replace);
}
const an = load('www/anim.js'), pj = load('www/project.js'), pl = load('www/plan.js'), ee = load('www/export-engine.js'), wc = load('www/webcodecs-export.js'), ed = load('www/editor.js');
if (an.text.includes('function textLook')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- anim.js ----------
rep(an, `var PICTURE = { zoom: 1, x: 0, y: 0 };`, `var PICTURE = { zoom: 1, x: 0, y: 0 };
  var STICKER = { x: 0.5, y: 0.5, size: 0.2, rot: 0 };`, 'anim: sticker defaults');
rep(an, `sticker: { x: [0, 1], y: [0, 1] }, text: { x: [-1, 1], y: [-1, 1] } };`,
  `sticker: { x: [0, 1], y: [0, 1], size: [0.04, 0.9], rot: [-180, 180] }, text: { x: [-1, 1], y: [-1, 1], size: [3, 30], rot: [-180, 180], opacity: [0, 1] } };`, 'anim: ranges');
rep(an, `if (kind === 'sticker') return c[prop] != null ? c[prop] : 0.5;`, `if (kind === 'sticker') return c[prop] != null ? c[prop] : (STICKER[prop] != null ? STICKER[prop] : 0.5);`, 'anim: sticker valueOf');
rep(an, `if (kind === 'text') return c[prop === 'x' ? 'dx' : 'dy'] || 0;`,
  `if (kind === 'text') { if (prop === 'x') return c.dx || 0; if (prop === 'y') return c.dy || 0; if (prop === 'size') return c.size || 7; if (prop === 'rot') return c.rot || 0; if (prop === 'opacity') return c.opacity != null ? c.opacity : 1; return 0; }`, 'anim: text valueOf');
rep(an, `function overlayState(o, relMs) {`, `// A title that has size / turn / opacity keyframes (or a fixed opacity below 1) is drawn as its base picture, then scaled, turned and faded around its middle line.
  function textHasLook(t) {
    var kf = (t && t.kf) || {};
    return !!((kf.size && kf.size.length) || (kf.rot && kf.rot.length) || (kf.opacity && kf.opacity.length) || (t && t.opacity != null && t.opacity < 0.999));
  }
  // { scale (against the title's own size), rot (the whole turn, in degrees), alpha } at relMs, or null when the title has none of those. When this is not null the base
  // picture of the title must be drawn without its own fixed turn (rot 0), because rot here already holds it.
  function textLook(t, relMs) {
    if (!textHasLook(t)) return null;
    var kf = t.kf || {}, has = function (k) { return kf[k] && kf[k].length; }, base = t.size > 0 ? t.size : 7;
    var sz = has('size') ? fitVal('text', 'size', kfValue(kf.size, relMs)) : base, op = has('opacity') ? kfValue(kf.opacity, relMs) : (t.opacity != null ? t.opacity : 1);
    return { scale: sz / base, rot: has('rot') ? kfValue(kf.rot, relMs) : (t.rot || 0), alpha: Math.max(0, Math.min(1, op)) };
  }
  // A sticker's x, y, size and turn at relMs.
  function stickerState(s, relMs) { var o = {}; ['x', 'y', 'size', 'rot'].forEach(function (k) { o[k] = valueOf(s, 'sticker', k, relMs); }); return o; }
  function overlayState(o, relMs) {`, 'anim: textLook');
rep(an, `wrapDeg: wrapDeg, snapTo: snapTo, snapRot: snapRot,`, `textHasLook: textHasLook, textLook: textLook, stickerState: stickerState, wrapDeg: wrapDeg, snapTo: snapTo, snapRot: snapRot,`, 'anim: exports');

// ---------- project.js ----------
rep(pj, `if (kind === 'text'){ var tk = prop === 'x' ? 'dx' : 'dy'; if (v) c[tk] = v; else delete c[tk]; return; }`,
  `if (kind === 'text'){
    if (prop === 'size'){ c.size = v; return; }
    if (prop === 'rot'){ if (Math.abs(v) >= 0.05) c.rot = v; else delete c.rot; return; }
    if (prop === 'opacity'){ if (v < 0.999) c.opacity = v; else delete c.opacity; return; }
    var tk = prop === 'x' ? 'dx' : 'dy'; if (v) c[tk] = v; else delete c[tk]; return;   // a text put back on its usual line stores nothing
  }`, 'project: static text props');
rep(pj, `if (kind === 'sticker') return ['x', 'y'];`, `if (kind === 'sticker') return ['x', 'y', 'size', 'rot'];`, 'project: sticker keyframe props');
rep(pj, `if (kind === 'text') return ['x', 'y'];`, `if (kind === 'text') return ['x', 'y', 'size', 'rot', 'opacity'];`, 'project: text keyframe props');
rep(pj, `['dx', 'dy'].forEach(function (k){ if (patch[k] === undefined) return;`,
  `if (patch.opacity !== undefined){ var opv = r3(Math.max(0, Math.min(1, +patch.opacity))); if (!isNaN(opv) && opv < 0.999) clip.opacity = opv; else delete clip.opacity; }
  ['dx', 'dy'].forEach(function (k){ if (patch[k] === undefined) return;`, 'project: text opacity patch');

// ---------- plan.js ----------
rep(pl, `if (c.kf && (c.kf.x || c.kf.y) && NAN && NAN.bakeKf){ var tk = {}; ['x', 'y'].forEach(function (k) { if (c.kf[k] && c.kf[k].length) tk[k] = c.kf[k]; }); tx.kf = NAN.bakeKf(tk); tx.kfT0 = s; }`,
  `if (c.kf && NAN && NAN.bakeKf){ var tk = {}; ['x', 'y', 'size', 'rot', 'opacity'].forEach(function (k) { if (c.kf[k] && c.kf[k].length) tk[k] = c.kf[k]; }); if (Object.keys(tk).length){ tx.kf = NAN.bakeKf(tk, 'text'); tx.kfT0 = s; } }`, 'plan: text keyframes');
rep(pl, `if (c.rot) tx.rot = c.rot;`, `if (c.rot) tx.rot = c.rot;
          if (c.opacity != null && c.opacity < 1) tx.opacity = c.opacity;`, 'plan: text opacity');
rep(pl, `if (c.kf && (c.kf.x || c.kf.y) && NAN && NAN.bakeKf){ var sk = {}; ['x', 'y'].forEach(function (k) { if (c.kf[k] && c.kf[k].length) sk[k] = c.kf[k]; }); so.kf = NAN.bakeKf(sk); }`,
  `if (c.kf && NAN && NAN.bakeKf){ var sk = {}; ['x', 'y', 'size', 'rot'].forEach(function (k) { if (c.kf[k] && c.kf[k].length) sk[k] = c.kf[k]; }); if (Object.keys(sk).length){ so.kf = NAN.bakeKf(sk, 'sticker'); so.kfT0 = s; } }`, 'plan: sticker keyframes');

// ---------- export-engine.js (ffmpeg) ----------
rep(ee, `// Titles are drawn by the page as transparent full-size pictures (textFiles) and laid over the video`,
  `// A title with size / turn / opacity keyframes becomes a list of still pictures, each shown for its own slice of time (like a text animation). Slices of an
  // animation that the title also has are cut finer. The base picture is drawn without the title's fixed turn, because the state carries the whole turn.
  function lookSegments(t, animSegs) {
    var dur = Math.round(t.durMs), len = Array.from(String(t.text || '')).length, step = Math.max(66, Math.ceil(dur / 48)), out = [];
    var base = animSegs || [{ a: 0, b: dur, st: { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, chars: 1 } }];
    base.forEach(function (sg) {
      var n = Math.max(1, Math.ceil((sg.b - sg.a) / step)), w = (sg.b - sg.a) / n;
      for (var k = 0; k < n; k++) {
        var a = Math.round(sg.a + k * w), b = k === n - 1 ? sg.b : Math.round(sg.a + (k + 1) * w), lk = _NA.textLook(t, (a + b) / 2) || { scale: 1, rot: t.rot || 0, alpha: 1 };
        var st = Object.assign({}, sg.st, { alpha: sg.st.alpha * lk.alpha, scale: sg.st.scale * lk.scale, rot: sg.st.rot + lk.rot });
        if (st.alpha > 0.003 && st.scale > 0.003 && !(len > 0 && st.chars <= 0)) out.push({ a: a, b: b, st: st, noRot: true });
      }
    });
    return out;
  }
  // The stickers as pictures. One with size or turn keyframes becomes a picture per slice of time (its position keyframes still move it with the overlay x / y).
  function stickerFiles() {
    var out = [];
    (plan.stickers || []).forEach(function (s, i) {
      var nm = 'stk' + String(i).padStart(3, '0'), kf = s.kf || {};
      if (!_NA || !((kf.size && kf.size.length) || (kf.rot && kf.rot.length))) { out.push({ name: nm + '.png', clip: s, sticker: true, width: width, height: height }); return; }
      var dur = Math.round(s.durMs), step = Math.max(66, Math.ceil(dur / 48)), k = 0;
      for (var a = 0; a < dur;) {
        var b = Math.min(dur, a + step); if (dur - b < 20) b = dur;
        var mid = (a + b) / 2;
        out.push({ name: nm + '_' + String(k++).padStart(2, '0') + '.png', clip: Object.assign({}, s, { startMs: s.startMs + a, durMs: b - a, size: _NA.valueOf(s, 'sticker', 'size', mid), rot: _NA.valueOf(s, 'sticker', 'rot', mid), kfT0: s.kfT0 != null ? s.kfT0 : s.startMs }), sticker: true, width: width, height: height });
        a = b;
      }
    });
    return out;
  }
  // Titles are drawn by the page as transparent full-size pictures (textFiles) and laid over the video`, 'engine: helpers');
rep(ee, `var segs = (_MO && t.anim) ? _MO.textTimeline(t.anim, t.durMs, Array.from(String(t.text || '')).length) : null, nm = 'txt' + String(i).padStart(3, '0');`,
  `var segs = (_MO && t.anim) ? _MO.textTimeline(t.anim, t.durMs, Array.from(String(t.text || '')).length) : null, nm = 'txt' + String(i).padStart(3, '0');
    if (_NA && _NA.textHasLook && _NA.textHasLook(t) && !(t.hl && t.hl.t && t.hl.t.length && !segs)) segs = lookSegments(t, segs);`, 'engine: look slices');
rep(ee, `clip: Object.assign({}, t, { startMs: t.startMs + sg.a, durMs: sg.b - sg.a }), state: sg.st,`,
  `clip: Object.assign({}, t, { startMs: t.startMs + sg.a, durMs: sg.b - sg.a }, sg.noRot ? { rot: 0 } : {}), state: sg.st,`, 'engine: slice clip');
rep(ee, `textFiles = (plan.stickers || []).map(function (s, i) { return { name: 'stk' + String(i).padStart(3, '0') + '.png', clip: s, sticker: true, width: width, height: height }; }).concat(textFiles);`,
  `textFiles = stickerFiles().concat(textFiles);`, 'engine: sticker files');

// ---------- webcodecs-export.js (fast engine) ----------
rep(wc, `function drawTitleAnim(ti, tMs) {`, `function stickerLive(sk) { var kf = sk.s.kf; return !!(NSTK && NA && kf && ((kf.size && kf.size.length) || (kf.rot && kf.rot.length))); }
    function drawStickerLive(sk, tMs) { NSTK.drawSticker(ctx, Object.assign({}, sk.s, NA.stickerState(sk.s, tMs - sk.a)), W, H); }
    function drawTitleAnim(ti, tMs) {`, 'fast: live sticker helpers');
rep(wc, `var an = ti.t.anim, st = (NMO && an) ? NMO.textState(an, tMs - ti.a, ti.b - ti.a) : null;`,
  `var an = ti.t.anim, st = (NMO && an) ? NMO.textState(an, tMs - ti.a, ti.b - ti.a) : null;
      var lk = (!ti.hl && NA && NA.textLook) ? NA.textLook(ti.t, tMs - ti.a) : null;   // size / turn / opacity keyframes
      if (lk) { st = Object.assign({}, st || { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, chars: 1 }); st.alpha *= lk.alpha; st.scale *= lk.scale; st.rot += lk.rot; }`, 'fast: title look');
rep(wc, `if (!ti.mo) ti.mo = { drawFn: drawTitle, makeCanvas: makeCanvas, cache: {} };`,
  `if (lk) { if (!ti.moL) ti.moL = { drawFn: drawTitle, makeCanvas: makeCanvas, cache: {} }; NMO.drawTitleState(ctx, Object.assign({}, ti.t, { rot: 0 }), st, W, H, ti.moL); return; }
      if (!ti.mo) ti.mo = { drawFn: drawTitle, makeCanvas: makeCanvas, cache: {} };`, 'fast: draw look');
rep(wc, `var ssh = stickerShift(stickers[ks], tMs); ctx.drawImage(stickers[ks].c, ssh.x * W, ssh.y * H);`,
  `if (stickerLive(stickers[ks])) drawStickerLive(stickers[ks], tMs); else { var ssh = stickerShift(stickers[ks], tMs); ctx.drawImage(stickers[ks].c, ssh.x * W, ssh.y * H); }`, 'fast: sticker draw');

// ---------- editor.js ----------
// stickers on the preview
rep(ed, `d.style.fontSize = Math.round(c.size * H) + 'px';`, `d.style.fontSize = Math.round(NANIM.valueOf(c, 'sticker', 'size', E.t - c.start) * H) + 'px';`, 'editor: sticker size');
rep(ed, `d.style.transform = 'translate(-50%,-50%) rotate(' + (c.rot || 0) + 'deg)';`, `d.style.transform = 'translate(-50%,-50%) rotate(' + NANIM.valueOf(c, 'sticker', 'rot', E.t - c.start) + 'deg)';`, 'editor: sticker turn');
// titles on the preview (plain)
rep(ed, `var an = c.anim && NMO ? NMO.textState(c.anim, E.t - c.start, c.dur) : null;`, `var an = c.anim && NMO ? NMO.textState(c.anim, E.t - c.start, c.dur) : null, lk = NANIM ? NANIM.textLook(c, E.t - c.start) : null;`, 'editor: text look');
rep(ed, `d.style.transformOrigin = '50% 50%'; d.style.opacity = shownText ? String(an.alpha) : '0';`, `d.style.transformOrigin = '50% 50%'; d.style.opacity = shownText ? String(an.alpha * (lk ? lk.alpha : 1)) : '0';`, 'editor: text alpha with animation');
rep(ed, `scale(' + an.scale + ')' + (c.rot ? ' rotate(' + c.rot + 'deg)' : '');`, `scale(' + an.scale + ')' + (lk ? ' rotate(' + lk.rot + 'deg) scale(' + lk.scale + ')' : (c.rot ? ' rotate(' + c.rot + 'deg)' : ''));`, 'editor: text transform with animation');
rep(ed, `} else { var trn = c.rot ? 'rotate(' + c.rot + 'deg)' : ''; if (d.style.transform !== trn) d.style.transform = trn; if (d.style.opacity) d.style.opacity = ''; }`,
  `} else { var trn = lk ? 'rotate(' + lk.rot + 'deg) scale(' + lk.scale + ')' : (c.rot ? 'rotate(' + c.rot + 'deg)' : ''), opv = (lk && lk.alpha < 1) ? String(lk.alpha) : ''; if (d.style.transform !== trn) d.style.transform = trn; if (d.style.opacity !== opv) d.style.opacity = opv; }`, 'editor: text transform');
// titles on the preview (with effects, drawn on a canvas)
rep(ed, `var stt = (c.anim && NMO) ? NMO.textState(c.anim, E.t - c.start, c.dur) : null, shown = c.text || '';`, `var stt = (c.anim && NMO) ? NMO.textState(c.anim, E.t - c.start, c.dur) : null, shown = c.text || '', lk = NANIM ? NANIM.textLook(c, E.t - c.start) : null;`, 'editor: styled look');
rep(ed, `c.extrude, c.rot, cw, ch]);`, `c.extrude, lk ? 0 : c.rot, cw, ch]);`, 'editor: styled key');
rep(ed, `d._lines = LK.drawTitle(g, Object.assign({}, c, { text: shown }), cw, ch) || []; d._key = key;`, `d._lines = LK.drawTitle(g, Object.assign({}, c, { text: shown }, lk ? { rot: 0 } : {}), cw, ch) || []; d._key = key;`, 'editor: styled draw');
rep(ed, `if (stt){`, `if (stt || lk){`, 'editor: styled branch');
rep(ed, `d.style.transformOrigin = '50% ' + py + 'px'; d.style.opacity = shown ? String(stt.alpha) : '0';`, `d.style.transformOrigin = '50% ' + py + 'px'; d.style.opacity = shown ? String((stt ? stt.alpha : 1) * (lk ? lk.alpha : 1)) : '0';`, 'editor: styled alpha');
rep(ed, `d.style.transform = 'translate(' + (stt.dx * W) + 'px,' + (stt.dy * H) + 'px) rotate(' + stt.rot + 'deg) scale(' + stt.scale + ')';`,
  `d.style.transform = 'translate(' + (stt ? stt.dx * W : 0) + 'px,' + (stt ? stt.dy * H : 0) + 'px) rotate(' + ((stt ? stt.rot : 0) + (lk ? lk.rot : 0)) + 'deg) scale(' + ((stt ? stt.scale : 1) * (lk ? lk.scale : 1)) + ')';`, 'editor: styled transform');
// text style panel
rep(ed, `{ key: 'rot', label: 'Turn' }, { key: 'color', label: 'Colour' }, { key: 'bg', label: 'Dark box' },`, `{ key: 'rot', label: 'Turn' }, { key: 'opacity', label: 'Opacity' }, { key: 'color', label: 'Colour' }, { key: 'bg', label: 'Dark box' },`, 'editor: text style keys');
rep(ed, `'Size', 3, 30, 1, Math.round(c.size || 7), function (v){ return v + '%'; }, function (v){ live(pt({ size: v })); }, function (v){ commit(pt({ size: v })); }`,
  `'Size', 3, 30, 1, Math.round(NANIM.valueOf(c, 'text', 'size', relNow(c))), function (v){ return v + '%'; }, function (v){ live(P.setAnimated(E.hist.cur, c.id, 'size', v, relNow(c))); }, function (v){ commit(P.setAnimated(E.hist.cur, c.id, 'size', v, relNow(c))); }`, 'editor: text size slider');
rep(ed, `'Turn', -180, 180, 5, Math.round(c.rot || 0),`, `'Turn', -180, 180, 5, Math.round(NANIM.valueOf(c, 'text', 'rot', relNow(c))),`, 'editor: text turn value');
rep(ed, `function (v){ live(pt({ rot: v })); }, function (v){ commit(pt({ rot: v })); }`, `function (v){ live(P.setAnimated(E.hist.cur, c.id, 'rot', v, relNow(c))); }, function (v){ commit(P.setAnimated(E.hist.cur, c.id, 'rot', v, relNow(c))); }`, 'editor: text turn slider');
rep(ed, `else if (cur === 'font')`, `else if (cur === 'opacity') body.appendChild(sliderRow('Opacity', 0, 100, 5, Math.round(NANIM.valueOf(c, 'text', 'opacity', relNow(c)) * 100), pct, function (v){ live(P.setAnimated(E.hist.cur, c.id, 'opacity', v / 100, relNow(c))); }, function (v){ commit(P.setAnimated(E.hist.cur, c.id, 'opacity', v / 100, relNow(c))); }));
      else if (cur === 'font')`, 'editor: text opacity slider');
rep(ed, `if (c.caption) body.appendChild(actions([{ id: 'edCapStyleAll'`, `if (cur === 'size' || cur === 'rot' || cur === 'opacity') body.appendChild(keyframeActions(c, cur));
      if (c.caption) body.appendChild(actions([{ id: 'edCapStyleAll'`, 'editor: text keyframe actions');
// sticker panel
rep(ed, `skv = function (k){ return (k === 'x' || k === 'y') ? NANIM.valueOf(c, 'sticker', k, relNow(c)) : c[k]; }`, `skv = function (k){ return (k === 'color') ? c[k] : NANIM.valueOf(c, 'sticker', k, relNow(c)); }`, 'editor: sticker values');
rep(ed, `if (k === 'x' || k === 'y') q = P.setAnimated(q, c.id, k, o[k], relNow(c));`, `if (k === 'x' || k === 'y' || k === 'size' || k === 'rot') q = P.setAnimated(q, c.id, k, o[k], relNow(c));`, 'editor: sticker setter');
rep(ed, `sliderRow('Size', 4, 90, 1, Math.round(c.size * 100), pct,`, `sliderRow('Size', 4, 90, 1, Math.round(skv('size') * 100), pct,`, 'editor: sticker size value');
rep(ed, `'Turn', -180, 180, 5, c.rot || 0,`, `'Turn', -180, 180, 5, Math.round(skv('rot')),`, 'editor: sticker turn value');
rep(ed, `body.appendChild(mk('div', 'ed-hint', 'You can also drag the sticker on the picture, and drag its ends on the timeline to change how long it shows.'));`,
  `if (cur === 'size' || cur === 'rot' || cur === 'x' || cur === 'y') body.appendChild(keyframeActions(c, cur));
      body.appendChild(mk('div', 'ed-hint', 'You can also drag the sticker on the picture, and drag its ends on the timeline to change how long it shows. To animate: tap Add keyframe, move the playhead, change a value.'));`, 'editor: sticker keyframe actions');
// gestures
rep(ed, `return { size: c.size || (tg.kind === 'text' ? 7 : 0.2), rot: c.rot || 0 };`, `var rl = relNow(c); return { size: NANIM.valueOf(c, tg.kind, 'size', rl) || (tg.kind === 'text' ? 7 : 0.2), rot: NANIM.valueOf(c, tg.kind, 'rot', rl) };`, 'editor: gesture shape');
rep(ed, `if (tg.kind === 'text') return P.setTextProps(base, c.id, { size: Math.round(z * 10) / 10, rot: r });`, `if (tg.kind === 'text'){ q = P.setAnimated(base, c.id, 'size', Math.round(z * 10) / 10, rel); return P.setAnimated(q, c.id, 'rot', r, rel); }`, 'editor: gesture text');
rep(ed, `if (tg.kind === 'sticker') return P.setStickerProps(base, c.id, { size: z, rot: r });`, `if (tg.kind === 'sticker'){ q = P.setAnimated(base, c.id, 'size', z, rel); return P.setAnimated(q, c.id, 'rot', r, rel); }`, 'editor: gesture sticker');
rep(ed, `return { cx: b.cx + sh.x * W, cy: b.cy + sh.y * H, w: b.w, h: b.h, rot: c.rot || 0 };`, `var lk0 = NANIM.textLook(c, rel); return { cx: b.cx + sh.x * W, cy: b.cy + sh.y * H, w: b.w * (lk0 ? lk0.scale : 1), h: b.h * (lk0 ? lk0.scale : 1), rot: lk0 ? lk0.rot : (c.rot || 0) };`, 'editor: text box');
rep(ed, `w: el.offsetWidth, h: el.offsetHeight, rot: c.rot || 0 };`, `w: el.offsetWidth, h: el.offsetHeight, rot: NANIM.valueOf(c, 'sticker', 'rot', rel) };`, 'editor: sticker box');
// save still
rep(ed, `{ x: NANIM.valueOf(c, 'sticker', 'x', E.t - c.start), y: NANIM.valueOf(c, 'sticker', 'y', E.t - c.start) }`,
  `NANIM.stickerState(c, E.t - c.start)`, 'editor: still stickers');
rep(ed, `g.translate(sh0.x * W, sh0.y * H); LKs.drawTitle(g, c, W, H);`,
  `g.translate(sh0.x * W, sh0.y * H); var lk0 = NANIM ? NANIM.textLook(c, E.t - c.start) : null; if (lk0){ var pv0 = NMO ? NMO.pivotY(c, H, 1) : H / 2; g.globalAlpha = lk0.alpha; g.translate(W / 2, pv0); g.rotate(lk0.rot * Math.PI / 180); g.scale(lk0.scale, lk0.scale); g.translate(-W / 2, -pv0); LKs.drawTitle(g, Object.assign({}, c, { rot: 0 }), W, H); } else LKs.drawTitle(g, c, W, H);`, 'editor: still titles');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[an, pj, pl, ee, wc, ed].forEach(save);
console.log('Done.\nNow run:  node tests/text-sticker-kf.test.js   and then   npm test');