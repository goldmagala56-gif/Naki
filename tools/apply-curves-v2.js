"use strict";
// One-time patch: ten speed curves as tiles, ten colour tone shapes as tiles, and live labels on the speed, colour and easing graphs.
// Also needs the new www/speedcurve.js (10 presets) copied in. Run from the project folder:   node tools/apply-curves-v2.js
// It checks that every spot is found exactly once BEFORE it writes anything, so it does everything or nothing.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), file = path.join(root, 'www', 'editor.js');
const EDITS = [
 [
  "helper: gallery tiles, tone shapes, playhead lookup",
  "var CVG = { W: 300, H: 130, x0: 14, x1: 286, y0: 12, y1: 116 };",
  "// ----- ten ready-made speed curves, ten tone shapes for colour, drawn as small pictures (like CapCut's rows of curve tiles) -----\n  var TONE_SHAPES = [\n    { key: 'contrast', label: 'Contrast', pts: [[0, 0], [0.25, 0.18], [0.75, 0.82], [1, 1]] },\n    { key: 'strong', label: 'Strong contrast', pts: [[0, 0], [0.25, 0.1], [0.75, 0.9], [1, 1]] },\n    { key: 'soft', label: 'Soft contrast', pts: [[0, 0.06], [0.25, 0.28], [0.75, 0.72], [1, 0.94]] },\n    { key: 'bright', label: 'Brighten', pts: [[0, 0], [0.5, 0.64], [1, 1]] },\n    { key: 'dark', label: 'Darken', pts: [[0, 0], [0.5, 0.36], [1, 1]] },\n    { key: 'lift', label: 'Lift shadows', pts: [[0, 0.1], [0.3, 0.4], [1, 1]] },\n    { key: 'crush', label: 'Crush blacks', pts: [[0, 0], [0.2, 0.06], [0.6, 0.6], [1, 1]] },\n    { key: 'fade', label: 'Fade', pts: [[0, 0.12], [0.5, 0.5], [1, 0.9]] },\n    { key: 'rolloff', label: 'Soft highlights', pts: [[0, 0], [0.7, 0.72], [0.9, 0.84], [1, 0.92]] },\n    { key: 'negative', label: 'Negative', pts: [[0, 1], [1, 0]] }\n  ];\n  function speedThumb(pts, W, H){\n    var p = 6, d = '', i, u, y = function (s){ return (H - p) - Math.log(Math.max(0.25, Math.min(4, s)) / 0.25) / Math.log(16) * (H - 2 * p); };\n    for (i = 0; i <= 36; i++){ u = i / 36; d += (i ? 'L' : 'M') + (p + u * (W - 2 * p)).toFixed(1) + ' ' + y(NCV.valueAt(pts, u)).toFixed(1); }\n    return '<svg viewBox=\"0 0 ' + W + ' ' + H + '\" fill=\"none\"><path d=\"M' + p + ' ' + y(1).toFixed(1) + 'H' + (W - p) + '\" stroke=\"currentColor\" stroke-opacity=\".3\" stroke-dasharray=\"3 3\"/><path d=\"' + d + '\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>';\n  }\n  function toneThumb(pts, W, H){\n    var p = 6, fn = NCL.curveFn(pts && pts.length >= 2 ? pts : [[0, 0], [1, 1]]), d = '', i, u;\n    for (i = 0; i <= 36; i++){ u = i / 36; d += (i ? 'L' : 'M') + (p + u * (W - 2 * p)).toFixed(1) + ' ' + ((H - p) - fn(u) * (H - 2 * p)).toFixed(1); }\n    return '<svg viewBox=\"0 0 ' + W + ' ' + H + '\" fill=\"none\"><path d=\"M' + p + ' ' + (H - p) + 'L' + (W - p) + ' ' + p + '\" stroke=\"currentColor\" stroke-opacity=\".3\" stroke-dasharray=\"3 3\"/><path d=\"' + d + '\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>';\n  }\n  // A row of curve tiles. kind: 'speed' (amber) or 'tone' (the channel colour). list = [{ key, label, pts }].\n  function curveGallery(kind, list, cur, pick, color){\n    var gal = mk('div', 'ed-cgal ' + kind);\n    if (color) gal.style.setProperty('--cc', color);\n    list.forEach(function (it){\n      var b = mk('button', 'ed-cgt' + (it.key === cur ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-label', it.label);\n      b.innerHTML = (kind === 'speed' ? speedThumb(it.pts, 64, 40) : toneThumb(it.pts, 64, 40)) + '<span>' + it.label + '</span>';\n      b.onclick = function (){ pick(it.key); }; gal.appendChild(b);\n    });\n    return cueScroller(gal, false);\n  }\n  // Where the playhead is on a clip's speed curve: how far through the picture (u) and the speed there. Null when the clip has no curve or the playhead is elsewhere.\n  function speedNow(c){\n    var info = P.speedCurveOf(E.hist.cur, c.id); if (!info) return null;\n    var hit = null; P.curvePieces(E.hist.cur, info.g).forEach(function (p){ if (E.t >= p.start && E.t < p.start + p.dur) hit = p; });\n    return hit ? { u: (hit.curve.u0 + hit.curve.u1) / 2, speed: hit.speed || 1 } : null;\n  }\n  var CVG = { W: 300, H: 130, x0: 14, x1: 286, y0: 12, y1: 116 };"
 ],
 [
  "speed: presets carry their points",
  "var list = [{ key: 'none', label: 'Normal' }].concat(NCV.PRESETS.map(function (p){ return { key: p.key, label: p.label }; }));",
  "var list = [{ key: 'none', label: 'Normal', pts: [[0, 1], [1, 1]] }].concat(NCV.PRESETS.map(function (p){ return { key: p.key, label: p.label, pts: p.pts }; }));"
 ],
 [
  "speed: custom tile",
  "if (info) list.push({ key: 'custom', label: 'Custom' });",
  "if (info) list.push({ key: 'custom', label: 'Custom', pts: cv.pts });"
 ],
 [
  "speed: gallery instead of chips",
  "body.appendChild(chips(list, cv.preset, function (k){",
  "body.appendChild(curveGallery('speed', list, cv.preset, function (k){"
 ],
 [
  "speed graph: faster / slower areas, labels, playhead",
  "svg0.appendChild(node('path', { d: d, 'class': 'ed-cpath' }));",
  "var y1 = cvY(1), edge = d + 'L' + cvX(1).toFixed(1) + ' ' + y1.toFixed(1) + 'L' + cvX(0).toFixed(1) + ' ' + y1.toFixed(1) + 'Z', defs = node('defs', {});\n        [['edCvFast', 0, y1], ['edCvSlow', y1, CVG.H - y1]].forEach(function (r){ var cp = node('clipPath', { id: r[0] }); cp.appendChild(node('rect', { x: 0, y: r[1], width: CVG.W, height: r[2] })); defs.appendChild(cp); });\n        svg0.appendChild(defs);\n        svg0.appendChild(node('path', { d: edge, 'class': 'ed-carea fast', 'clip-path': 'url(#edCvFast)' }));\n        svg0.appendChild(node('path', { d: edge, 'class': 'ed-carea slow', 'clip-path': 'url(#edCvSlow)' }));\n        svg0.appendChild(node('path', { d: d, 'class': 'ed-cpath' }));\n        var tf = node('text', { x: CVG.x1 - 3, y: CVG.y0 + 9, 'text-anchor': 'end', 'class': 'ed-cnote fast' }); tf.textContent = '\\u25b2 faster'; svg0.appendChild(tf);\n        var ts = node('text', { x: CVG.x1 - 3, y: CVG.y1 - 4, 'text-anchor': 'end', 'class': 'ed-cnote slow' }); ts.textContent = '\\u25bc slower'; svg0.appendChild(ts);\n        var nw = speedNow(c);\n        if (nw){ svg0.appendChild(node('line', { x1: cvX(nw.u), x2: cvX(nw.u), y1: CVG.y0, y2: CVG.y1, 'class': 'ed-cnow' })); svg0.appendChild(node('circle', { cx: cvX(nw.u), cy: cvY(Math.max(0.25, Math.min(4, nw.speed))), r: 4, 'class': 'ed-cnowdot' })); }"
 ],
 [
  "speed graph: live readout",
  "var sp = curveSpan(c); out.textContent = 'Length: ' + fmtP(sp.now) + ' now, ' + fmtP(sp.span * NCV.outputFactor(cv.pts)) + ' with this curve.';",
  "var sp = curveSpan(c), pt = cv.sel >= 0 ? cv.pts[cv.sel] : null, nw2 = speedNow(c);\n        out.textContent = (pt ? 'Point: ' + pt[1].toFixed(2) + '\\u00d7 at ' + Math.round(pt[0] * 100) + '% of the clip.  ' : 'Tap a dot to read its speed.  ') + (nw2 ? 'Playhead: ' + nw2.speed.toFixed(2) + '\\u00d7.  ' : '') + 'Length: ' + fmtP(sp.now) + ' now, ' + fmtP(sp.span * NCV.outputFactor(cv.pts)) + ' with this curve.';"
 ],
 [
  "speed graph: follows the playhead",
  "body.appendChild(svg0); draw(); body.appendChild(out);",
  "body.appendChild(svg0); draw(); body.appendChild(out);\n      var lastNow = -2; E.cvLive = function (){   // while the speed curve is open, the playhead marker and its speed follow the playhead\n        if (E.panel !== 'speedcurve' || !svg0.isConnected){ E.cvLive = null; return; }\n        var nw = speedNow(c), k = nw ? Math.round(nw.u * 1000) : -1; if (k !== lastNow){ lastNow = k; draw(); }\n      };"
 ],
 [
  "playhead moves: tell the open curve",
  "E.ui.time.textContent = fmtP(E.t) + ' / ' + fmtP(E.proj.durationMs); updateKfBar();",
  "E.ui.time.textContent = fmtP(E.t) + ' / ' + fmtP(E.proj.durationMs); updateKfBar(); if (E.cvLive) E.cvLive();"
 ],
 [
  "colour curves: tone shape gallery",
  "body.appendChild(chips(chs, ch, function (k){ E.chip.gradech = k; E.chip.grsel = -1; renderDock(); }));",
  "body.appendChild(chips(chs, ch, function (k){ E.chip.gradech = k; E.chip.grsel = -1; renderDock(); }));\n      var toneNow = 'linear', cur0 = g.curves && g.curves[ch] ? JSON.stringify(g.curves[ch]) : '';\n      if (cur0){ toneNow = 'custom'; TONE_SHAPES.forEach(function (s){ if (JSON.stringify(NCL.cleanCurve(s.pts)) === cur0) toneNow = s.key; }); }\n      body.appendChild(curveGallery('tone', [{ key: 'linear', label: 'Normal', pts: [[0, 0], [1, 1]] }].concat(TONE_SHAPES, toneNow === 'custom' ? [{ key: 'custom', label: 'Custom', pts: g.curves[ch] }] : []), toneNow, function (k){\n        if (k === 'custom') return;\n        var cp = {}, sh = TONE_SHAPES.filter(function (x){ return x.key === k; })[0]; cp[ch] = sh ? NCL.cleanCurve(sh.pts) : null; E.chip.grsel = -1; set({ curves: cp });\n      }, COL[ch]));"
 ],
 [
  "colour curves: live readout",
  "pts.forEach(function (p, i){ sv.appendChild(node('circle', { cx: X(p[0]), cy: Y(p[1]), r: i === E.chip.grsel ? 8 : 6, fill: i === E.chip.grsel ? COL[ch] : '#111b24', stroke: COL[ch], 'stroke-width': 2 })); });",
  "pts.forEach(function (p, i){ sv.appendChild(node('circle', { cx: X(p[0]), cy: Y(p[1]), r: i === E.chip.grsel ? 8 : 6, fill: i === E.chip.grsel ? COL[ch] : '#111b24', stroke: COL[ch], 'stroke-width': 2 })); });\n        if (gro){ var gp = pts[E.chip.grsel]; gro.textContent = gp ? 'Tone in ' + Math.round(gp[0] * 100) + '%  \\u2192  out ' + Math.round(gp[1] * 100) + '%' : 'Tap the graph to add a point, drag it to bend the tones.'; }"
 ],
 [
  "colour curves: readout line",
  "draw(); body.appendChild(sv);",
  "var gro = mk('div', 'ed-hint ed-cread'); draw(); body.appendChild(sv); body.appendChild(gro);"
 ],
 [
  "easing: readout line",
  "draw(); box.appendChild(svg0);",
  "var ezr = mk('div', 'ed-hint ed-cread'); draw(); box.appendChild(svg0); box.appendChild(ezr); draw();"
 ],
 [
  "easing: live numbers",
  "svg0.appendChild(node('circle', { cx: px(bz[0]), cy: ezY(bz[1]), r: 8, 'class': 'ed-ezdot' })); svg0.appendChild(node('circle', { cx: px(bz[2]), cy: ezY(bz[3]), r: 8, 'class': 'ed-ezdot' })); }",
  "svg0.appendChild(node('circle', { cx: px(bz[0]), cy: ezY(bz[1]), r: 8, 'class': 'ed-ezdot' })); svg0.appendChild(node('circle', { cx: px(bz[2]), cy: ezY(bz[3]), r: 8, 'class': 'ed-ezdot' })); }\n      if (ezr) ezr.textContent = handles ? 'Handles:  ' + bz.map(function (v){ return v.toFixed(2); }).join('  \u00b7  ') + (dragged ? '' : '   (' + name + ')') : 'Preset: ' + name + '. This one has no handles.';"
 ]
];
const raw = fs.readFileSync(file, 'utf8'), crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');
if (text.includes('function curveGallery(')) { console.log('Already applied (editor.js has curveGallery). Nothing to do.'); process.exit(0); }
const problems = [];
EDITS.forEach(function (e) {
  const n = text.split(e[1]).length - 1;
  if (n !== 1) { problems.push(e[0] + ': found ' + n + ' times (need exactly 1)'); return; }
  text = text.replace(e[1], function () { return e[2]; });
});
if (problems.length) {
  console.log('NOTHING WAS CHANGED. These spots did not match www/editor.js:\n  - ' + problems.join('\n  - ') + '\n\nSend me that list and I will adjust.');
  process.exit(1);
}
fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
console.log('Done. ' + EDITS.length + ' changes made in www/editor.js.\nNow copy the new www/speedcurve.js in, then run:  npm test');