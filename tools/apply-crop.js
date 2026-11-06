'use strict';
// node tools/apply-crop.js   (from the project folder)
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
const pj = load('www/project.js'), pl = load('www/plan.js'), ee = load('www/export-engine.js');
if (pj.text.includes('function setCrop')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- project.js ----------
const CROP_FUNCS = `// ---------- crop ----------
// A crop keeps one rectangle of the picture: clip.crop = { x, y, w, h }, all fractions (0 to 1) of the ORIGINAL picture, before it is turned,
// flipped or zoomed. The cropped part is then fitted inside the frame (with bars when its shape differs), like CapCut. Not stored when it covers everything.
var CROP_MIN = 0.05;
function r4(x){ return Math.round(x * 10000) / 10000; }
function cleanCrop(c){
  if (!c) return null;
  var w = Math.max(CROP_MIN, Math.min(1, +c.w)), h = Math.max(CROP_MIN, Math.min(1, +c.h));
  if (isNaN(w) || isNaN(h)) return null;
  w = r4(w); h = r4(h);
  if (w > 0.999 && h > 0.999) return null;
  return { x: r4(Math.max(0, Math.min(1 - w, +c.x || 0))), y: r4(Math.max(0, Math.min(1 - h, +c.y || 0))), w: w, h: h };
}
// The biggest rectangle of shape rw:rh that fits in a srcW x srcH picture, centred on (cx, cy) (fractions, default the middle). Returns fractions.
function cropRect(rw, rh, srcW, srcH, cx, cy){
  if (!(rw > 0 && rh > 0 && srcW > 0 && srcH > 0)) return null;
  var a = rw / rh, s = srcW / srcH, w = a >= s ? 1 : a / s, h = a >= s ? s / a : 1;
  return cleanCrop({ x: (cx == null ? 0.5 : cx) - w / 2, y: (cy == null ? 0.5 : cy) - h / 2, w: w, h: h }) || { x: 0, y: 0, w: 1, h: 1 };
}
// rect = { x, y, w, h } or null (take the crop away). id null = every picture clip.
function setCrop(p, id, rect){
  var q = cloneProject(p), list = pictureClips(q, id); if (!list.length) return p;
  var c = rect ? cleanCrop(rect) : null;
  list.forEach(function (cl){ if (cl.type !== 'video' && cl.type !== 'freeze') return; if (c) cl.crop = JSON.parse(JSON.stringify(c)); else delete cl.crop; });
  return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) ? p : finish(q);
}

// ---------- reverse ----------`;
rep(pj, '// ---------- reverse ----------', CROP_FUNCS, 'project: crop functions');
rep(pj, 'setReverse: setReverse, linkedClips: linkedClips,', 'setReverse: setReverse, linkedClips: linkedClips, setCrop: setCrop, cropRect: cropRect, cleanCrop: cleanCrop,', 'project: exports');
rep(pj, "['filter', 'opacity', 'transform'].forEach(", "['filter', 'opacity', 'transform', 'crop'].forEach(", 'project: freeze keeps the crop');
rep(pj, '[a.filter || null, a.opacity, a.transform || null]', '[a.filter || null, a.opacity, a.transform || null, a.crop || null]', 'project: join (a)');
rep(pj, '[b.filter || null, b.opacity, b.transform || null]', '[b.filter || null, b.opacity, b.transform || null, b.crop || null]', 'project: join (b)');

// ---------- plan.js ----------
rep(pl, 'if (c.vFadeIn) sp.vFadeIn = c.vFadeIn;',
  "if (c.crop) sp.crop = { x: c.crop.x, y: c.crop.y, w: c.crop.w, h: c.crop.h };\n      if (c.vFadeIn) sp.vFadeIn = c.vFadeIn;", 'plan: crop in the plan');

// ---------- export-engine.js (ffmpeg.wasm) ----------
rep(ee, 'function baseFit(sp) {', 'function baseFit(sp) {\n    if (sp && sp.crop) return containFit;   // a cropped picture is fitted inside the frame, never stretched', 'engine: cropped pictures are fitted');
rep(ee, 'mi = assetOf(sp) || movieInfo,', 'mi = cropInfo(sp, assetOf(sp) || movieInfo),', 'engine: zoom keyframes work on the cropped size');
const ENG = `// ---- crop: keep one rectangle of the original picture (before flip / turn / zoom), then fit it inside the frame ----
  function cropPre(sp) {
    var c = sp && sp.crop; if (!c) return '';
    var f = function (v) { return Number(v).toFixed(4); };
    return 'crop=w=trunc(iw*' + f(c.w) + '/2)*2:h=trunc(ih*' + f(c.h) + '/2)*2:x=trunc(iw*' + f(c.x) + '/2)*2:y=trunc(ih*' + f(c.y) + '/2)*2';
  }
  function cropInfo(sp, mi) {   // the size of the picture after the crop (same rounding as cropPre)
    var c = sp && sp.crop; if (!c) return mi;
    return Object.assign({}, mi, { width: Math.max(2, Math.floor(mi.width * c.w / 2) * 2), height: Math.max(2, Math.floor(mi.height * c.h / 2) * 2) });
  }
  var _tfNoCrop = transformFit, _tpNoCrop = transformPre;
  transformFit = function (sp) { var b = _tfNoCrop(sp); return sp.crop ? cropPre(sp) + ',' + b : b; };
  transformPre = function (sp) { var b = _tpNoCrop(sp); return sp.crop ? cropPre(sp) + (b ? ',' + b : '') : b; };

  // ---- transitions: where two touching pictures meet`;
rep(ee, '// ---- transitions: where two touching pictures meet', ENG, 'engine: crop filter');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(pj); save(pl); save(ee);
console.log('Done.\nNow run:  node tests/crop.test.js   and then   npm test');