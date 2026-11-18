// Run from the project root:  node tools/apply-clip-mask.js
// Masks on the main video / photo clips (not only overlays): Edit > Mask, with the same shapes, feather, invert,
// and move / size / turn handles on the picture. The fast export engine draws it; what is outside the mask is black.
const fs = require('fs'), path = require('path');
const W = 'www';
const files = { project: 'project.js', plan: 'plan.js', web: 'webcodecs-export.js', editor: 'editor.js' };
const src = {}, crlf = {};
for (const k in files) {
  const p = path.join(W, files[k]);
  if (!fs.existsSync(p)) { console.error('Run this from the Naki project root (' + p + ' not found).'); process.exit(1); }
  const raw = fs.readFileSync(p, 'utf8'); crlf[k] = raw.includes('\r\n'); src[k] = raw.replace(/\r\n/g, '\n');
}
if (src.project.includes('Naki:clip-mask')) { console.log('Already applied.'); process.exit(0); }
function rep(k, a, b, label) {
  const n = src[k].split(a).length - 1;
  if (n !== 1) { console.error('Nothing changed. Anchor "' + label + '" found ' + n + ' times in ' + files[k] + '.'); process.exit(1); }
  src[k] = src[k].replace(a, () => b);
}

// ---- project.js ----
rep('project', "['filter', 'opacity', 'transform', 'crop', 'grade'].forEach(function (k){", "['filter', 'opacity', 'transform', 'crop', 'grade', 'mask'].forEach(function (k){", 'look list');
rep('project', "  if (JSON.stringify(a.grade || null) !== JSON.stringify(b.grade || null)) return false;\n",
  "  if (JSON.stringify(a.grade || null) !== JSON.stringify(b.grade || null)) return false;\n  if (JSON.stringify(a.mask || null) !== JSON.stringify(b.mask || null)) return false;\n", 'merge check');
rep('project', "// ---------- text to speech ----------",
`// ---------- Naki:clip-mask: a shape mask on a picture clip (see fx.js) ----------
// patch = a mask { shape, x, y, w, h, rot, feather, invert, corner } (merged into the one already there), or null to take the mask off.
function setClipMask(p, id, patch){
  if (!_FX) return p;
  var q = cloneProject(p), list = pictureClips(q, id); if (!list.length) return p;
  list.forEach(function (c){
    if (c.type !== 'video' && c.type !== 'freeze') return;
    var m = _FX.cleanMask(patch === null ? null : Object.assign({}, c.mask || {}, patch));
    if (m) c.mask = m; else delete c.mask;
  });
  return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) ? p : finish(q);
}

// ---------- text to speech ----------`, 'text to speech marker');
rep('project', "setOverlayFx: setOverlayFx,", "setOverlayFx: setOverlayFx, setClipMask: setClipMask,", 'exports');

// ---- plan.js ----
rep('plan', "      if (c.grade) sp.grade = JSON.parse(JSON.stringify(c.grade));\n", "      if (c.grade) sp.grade = JSON.parse(JSON.stringify(c.grade));\n      if (c.mask) sp.mask = JSON.parse(JSON.stringify(c.mask));\n", 'plan grade');

// ---- webcodecs-export.js ----
rep('web', "      drawLayerFx(tMs);\n      var lv = fadeLevel(sp, tMs - sp.sessionStart);",
`      drawLayerFx(tMs);
      var mk0 = sp.mask && NFX && NFX.cleanMask ? NFX.cleanMask(sp.mask) : null;   // Naki:clip-mask
      if (mk0) {   // the picture is cut to the shape; the rest is black
        if (!maskLayer) maskLayer = makeCanvas(W, H);
        var mg = maskLayer.getContext('2d'); mg.globalCompositeOperation = 'source-over'; mg.globalAlpha = 1; mg.clearRect(0, 0, W, H); mg.drawImage(canvas, 0, 0);
        mg.globalCompositeOperation = 'destination-in'; mg.drawImage(NFX.maskCanvas(mk0, W, H), 0, 0); mg.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.drawImage(maskLayer, 0, 0);
      }
      var lv = fadeLevel(sp, tMs - sp.sessionStart);`, 'compose');
rep('web', "    function compose(sp, tMs) {", "    var maskLayer = null;\n    function compose(sp, tMs) {", 'compose start');

// ---- editor.js ----
rep('editor', "        { id: 'edOpacity', label: 'Opacity', icon: G.opacity, run: P2('opacity') },\n",
  "        { id: 'edOpacity', label: 'Opacity', icon: G.opacity, run: P2('opacity') },\n        { id: 'edMask', label: 'Mask', icon: G.shape, run: P2('clipmask') },\n", 'edit row');
rep('editor', "    adjust: { title: 'Adjust', build: function (body){",
`    clipmask: { title: 'Mask', build: function (body){   // Naki:clip-mask
      var c = needPicture(body); if (!c || !NFX) return;
      var m0 = NFX.cleanMask(c.mask), shape = m0 ? m0.shape : 'none', set = function (o){ return P.setClipMask(E.hist.cur, c.id, o); };
      body.appendChild(chips(NFX.MASKS, shape, function (k){ commit(set(k === 'none' ? null : (k === 'rect' && !(m0 && m0.corner)) ? { shape: k, corner: 0.2 } : { shape: k })); }));
      if (m0){
        var props = [];
        if (m0.shape !== 'line' && m0.shape !== 'mirror') props.push({ key: 'size', label: 'Size' }, { key: 'w', label: 'Width' });
        if (m0.shape !== 'line') props.push({ key: 'h', label: m0.shape === 'mirror' ? 'Band' : 'Height' });
        props.push({ key: 'x', label: 'Left / right' }, { key: 'y', label: 'Up / down' }, { key: 'rot', label: 'Turn' }, { key: 'feather', label: 'Feather' });
        if (m0.shape === 'rect') props.push({ key: 'corner', label: 'Corners' });
        var pk = chipKey('clipmaskprop', props, props[0].key), big = Math.max(m0.w, m0.h), val = pk === 'size' ? big : m0[pk],
          put = function (v){ var o = {}; if (pk === 'size'){ var k = v / big; o.w = m0.w * k; o.h = m0.h * k; } else o[pk] = v; return set(o); };
        body.appendChild(chips(props, pk, pickChip('clipmaskprop')));
        if (pk === 'rot') body.appendChild(sliderRow('Turn', -180, 180, 5, Math.round(val), function (v){ return v + '\\u00b0'; }, function (v){ live(put(v)); }, function (v){ commit(put(v)); }));
        else if (pk === 'w' || pk === 'h' || pk === 'size') body.appendChild(sliderRow('Size', 5, 200, 5, Math.round(val * 100), pct, function (v){ live(put(v / 100)); }, function (v){ commit(put(v / 100)); }));
        else body.appendChild(sliderRow('Amount', 0, 100, 1, Math.round(val * 100), pct, function (v){ live(put(v / 100)); }, function (v){ commit(put(v / 100)); }));
        body.appendChild(actions([{ id: 'edClipMaskInvert', label: m0.invert ? 'Invert: on' : 'Invert: off', on: !!m0.invert, run: function (){ commit(set({ invert: !m0.invert })); } }]));
      }
      body.appendChild(mk('div', 'ed-hint', 'Shows the picture only inside a shape (the rest is black). Drag the dashed outline on the picture to move it, the orange square to resize, the knob to turn.'));
    } },
    adjust: { title: 'Adjust', build: function (body){`, 'panels');

// handles for picture clips
rep('editor', "function maskPanelOpen(){ return E.panel === 'maskonly' ||", "function maskPanelOpen(){ return E.panel === 'clipmask' || E.panel === 'maskonly' ||", 'panel open');
rep('editor', "  function maskDrag(ev, mode){",
`  function maskGeomPic(){
    var layer = E.ui.overlaylayer; if (!layer) return null;
    var r = layer.getBoundingClientRect(); if (!r.width || !r.height) return null;
    return { r: r, s: { x: 0.5, y: 0.5, rot: 0, size: 1 }, OW: r.width, OH: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }
  function maskDrag(ev, mode){`, 'drag start');
rep('editor', "    var f = E.sel && P.findClip(E.proj, E.sel); if (!f || f.track.kind !== 'overlay') return;\n    var c = f.clip, g = maskGeom(c), m0 = NFX && NFX.cleanMask(c.mask); if (!g || !m0) return;",
`    var pic = E.panel === 'clipmask', c, f;
    if (pic){ var pt = pictureTarget(); if (!pt) return; c = pt.clip; }
    else { f = E.sel && P.findClip(E.proj, E.sel); if (!f || f.track.kind !== 'overlay') return; c = f.clip; }
    var g = pic ? maskGeomPic() : maskGeom(c), m0 = NFX && NFX.cleanMask(c.mask); if (!g || !m0) return;`, 'drag head');
rep('editor', "      return P.setOverlayFx(E.hist.cur, id, { mask: o });\n    }\n    function mv(e){ moved = true;", "      return pic ? P.setClipMask(E.hist.cur, id, o) : P.setOverlayFx(E.hist.cur, id, { mask: o });\n    }\n    function mv(e){ moved = true;", 'drag set');
rep('editor', "    var f = E.sel && E.proj && P.findClip(E.proj, E.sel), c = (f && f.track.kind === 'overlay' && maskPanelOpen()) ? f.clip : null;\n    var m = c && c.mask ? NFX.cleanMask(c.mask) : null, g = m ? maskGeom(c) : null;",
`    var pic = E.panel === 'clipmask' && E.proj && E.proj.tracks, pt = pic ? pictureTarget() : null;
    var f = !pic && E.sel && E.proj && P.findClip(E.proj, E.sel), c = pic ? (pt && pt.clip) : ((f && f.track.kind === 'overlay' && maskPanelOpen()) ? f.clip : null);
    var m = c && c.mask ? NFX.cleanMask(c.mask) : null, g = m ? (pic ? maskGeomPic() : maskGeom(c)) : null;`, 'sync head');

// the preview of a picture mask
rep('editor', "  var _syncOv0 = syncOverlays;",
`  function syncPicMask(){   // the picture clip's mask on the preview: the picture frame is cut with a mask image made by fx.js
    var u = E.ui, pf = u && u.picframe; if (!pf || !NFX || !E.proj || !E.proj.tracks) return;
    var t = pictureTarget(), m = t && t.clip.mask ? NFX.cleanMask(t.clip.mask) : null;
    if (!m){ if (pf._mk){ pf._mk = ''; ['maskImage', 'webkitMaskImage', 'maskSize', 'webkitMaskSize', 'maskRepeat', 'webkitMaskRepeat'].forEach(function (k){ pf.style[k] = ''; }); } return; }
    var r = pf.getBoundingClientRect(); if (!r.width || !r.height) return;
    var ch = Math.max(8, Math.round(256 * r.height / r.width)), key = JSON.stringify(m) + '|' + ch;
    if (pf._mk === key) return; pf._mk = key;
    var url = 'url(' + NFX.maskCanvas(m, 256, ch).toDataURL() + ')';
    pf.style.maskImage = pf.style.webkitMaskImage = url; pf.style.maskSize = pf.style.webkitMaskSize = '100% 100%'; pf.style.maskRepeat = pf.style.webkitMaskRepeat = 'no-repeat';
  }
  var _syncFx0 = syncFx; syncFx = function (){ var r = _syncFx0.apply(this, arguments); try { syncPicMask(); } catch (e) {} return r; };
  var _syncOv0 = syncOverlays;`, 'preview hook');

for (const k in files) fs.writeFileSync(path.join(W, files[k]), crlf[k] ? src[k].replace(/\n/g, '\r\n') : src[k]);
fs.writeFileSync(path.join('tests', 'clip-mask.test.js'), `'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const rd = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8').replace(/\\r\\n/g, '\\n');
['project.js', 'plan.js', 'webcodecs-export.js', 'editor.js'].forEach(f => new vm.Script(rd(f), { filename: f }));
const P = require('../www/project.js');
assert.strictEqual(typeof P.setClipMask, 'function', 'setClipMask is exported');
const ed = rd('editor.js');
['clipmask: { title', "run: P2('clipmask')", 'function syncPicMask()', 'function maskGeomPic()'].forEach(x => assert(ed.includes(x), 'editor is missing ' + x));
assert(rd('plan.js').includes('sp.mask'), 'plan carries the mask'); assert(rd('webcodecs-export.js').includes('maskLayer'), 'fast export draws the mask');
console.log('clip-mask ok');
`);
console.log('Done. Now run: npm test');