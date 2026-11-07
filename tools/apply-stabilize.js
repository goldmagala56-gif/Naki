'use strict';
// node tools/apply-stabilize.js   (from the project folder; run apply-crop.js and apply-crop-editor.js first)
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
const pj = load('www/project.js'), pl = load('www/plan.js'), ee = load('www/export-engine.js'), wc = load('www/webcodecs-export.js'), ed = load('www/editor.js'), ix = load('www/index.html');
if (!pj.text.includes('function setCrop') || !ed.text.includes('function buildCropUI')) { console.log('Run  node tools/apply-crop.js  and  node tools/apply-crop-editor.js  first.'); process.exit(1); }
if (pj.text.includes('function setStabilize')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- project.js ----------
const STAB_FUNCS = `// ---------- stabilize ----------
// clip.stabilize = 0.05 to 1: how hard the EXPORTED video steadies shaky footage (0 = off, and then it is not stored).
// Only a clip where the movie plays forwards can have it. Applies to one picture clip, or to all of them when id is null.
function setStabilize(p, id, amount){
  var q = cloneProject(p), list = pictureClips(q, id); if (!list.length) return p;
  var a = +amount; if (isNaN(a)) return p; a = r3(Math.max(0, Math.min(1, a)));
  list.forEach(function (c){ if (c.type !== 'video' || c.reverse) return; if (a < 0.05) delete c.stabilize; else c.stabilize = a; });
  return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) ? p : finish(q);
}

// ---------- reverse ----------`;
rep(pj, '// ---------- reverse ----------', STAB_FUNCS, 'project: stabilize function');
rep(pj, 'setCrop: setCrop, cropRect: cropRect, cleanCrop: cleanCrop,', 'setCrop: setCrop, cropRect: cropRect, cleanCrop: cleanCrop, setStabilize: setStabilize,', 'project: exports');
rep(pj, '[a.filter || null, a.opacity, a.transform || null, a.crop || null]', '[a.filter || null, a.opacity, a.transform || null, a.crop || null, a.stabilize || null]', 'project: join (a)');
rep(pj, '[b.filter || null, b.opacity, b.transform || null, b.crop || null]', '[b.filter || null, b.opacity, b.transform || null, b.crop || null, b.stabilize || null]', 'project: join (b)');

// ---------- plan.js ----------
rep(pl, 'if (c.crop) sp.crop = { x: c.crop.x, y: c.crop.y, w: c.crop.w, h: c.crop.h };',
  "if (c.crop) sp.crop = { x: c.crop.x, y: c.crop.y, w: c.crop.w, h: c.crop.h };\n      if (sp.type === 'play' && c.stabilize && !c.reverse) sp.stabilize = c.stabilize;", 'plan: stabilize in the plan');

// ---------- export-engine.js (ffmpeg.wasm) ----------
const ENG = `// ---- stabilize: steady shaky footage with ffmpeg's deshake filter. It runs FIRST, on the whole picture, before crop / turn / zoom ----
  function stabPre(sp) {
    var s = sp && sp.stabilize; if (!(s > 0)) return '';
    var r = Math.max(4, Math.min(64, Math.round(8 + 56 * s)));   // how far (pixels) it may move the picture to steady it
    return 'deshake=rx=' + r + ':ry=' + r + ':edge=mirror:blocksize=8:contrast=125';
  }
  var _tfNoStab = transformFit, _tpNoStab = transformPre;
  transformFit = function (sp) { var b = _tfNoStab(sp), s = stabPre(sp); return s ? s + ',' + b : b; };
  transformPre = function (sp) { var b = _tpNoStab(sp), s = stabPre(sp); return s ? s + (b ? ',' + b : '') : b; };

  // ---- transitions: where two touching pictures meet`;
rep(ee, '// ---- transitions: where two touching pictures meet', ENG, 'engine: stabilize filter');

// ---------- webcodecs-export.js: stabilize is made by the ffmpeg engine ----------
rep(wc, "if ((plan.video || []).some(function (s) { return s.crop; })) return false;",
  "if ((plan.video || []).some(function (s) { return s.crop; })) return false;\n    if ((plan.video || []).some(function (s) { return s.stabilize; })) return false;   // stabilize is made by the ffmpeg engine", 'fast engine: stabilize goes to ffmpeg');

// ---------- index.html: if the device's ffmpeg has no deshake, export without it rather than not at all ----------
rep(ix, '!plan.video.some(function(s){ return s.transitionIn; }) && !(plan.fx && plan.fx.length)',
  '!plan.video.some(function(s){ return s.transitionIn || s.stabilize; }) && !(plan.fx && plan.fx.length)', 'index: retry condition');
rep(ix, 'plan.video.forEach(function(s){ delete s.transitionIn; }); delete plan.fx;',
  'plan.video.forEach(function(s){ delete s.transitionIn; delete s.stabilize; }); delete plan.fx;', 'index: retry without stabilize');

// ---------- editor.js ----------
rep(ed, "G.crop = svg('<path d=\"M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14\"/>');",
  "G.crop = svg('<path d=\"M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14\"/>');\n  G.stabilize = svg('<rect x=\"4\" y=\"5\" width=\"16\" height=\"14\" rx=\"2\"/><path d=\"M7 12c1.5-2 3-2 4.5 0s3 2 4.5 0\"/>');", 'editor: stabilize icon');
rep(ed, "{ id: 'edCrop', label: 'Crop', icon: G.crop, run: P2('crop') },",
  "{ id: 'edCrop', label: 'Crop', icon: G.crop, run: P2('crop') },\n        { id: 'edStabilize', label: 'Stabilize', icon: G.stabilize, run: P2('stabilize') },", 'editor: Stabilize button');
const PANEL = `// ----- stabilize panel -----
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
  // ----- crop (CapCut style): a dimmed picture with a frame you drag -----`;
rep(ed, '// ----- crop (CapCut style): a dimmed picture with a frame you drag -----', PANEL, 'editor: stabilize panel');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[pj, pl, ee, wc, ed, ix].forEach(save);
console.log('Done.\nNow run:  node tests/stabilize.test.js   and then   npm test');