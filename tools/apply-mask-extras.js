'use strict';
// Three small mask improvements in one patch. Run from the project folder:   node tools/apply-mask-extras.js
//   1. Size slider: one slider that makes the mask bigger or smaller (width and height together), first chip in the mask settings
//   2. Faster preview: the mask picture is built at a lower resolution for the preview only (the export is untouched), and the
//      overlay canvas is not redrawn when nothing changed (same picture, same mask)
//   3. Rounded-corner default: picking Rectangle starts with soft corners (20%) instead of sharp ones; the Corners slider still works
// Works on your current fx.js (masks-fx2+shapes) and editor.js. It checks every spot is found exactly once BEFORE writing anything,
// so it does everything or nothing.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

const EDITS = {
  'www/fx.js': [
    { label: 'fx: maskCanvas takes an optional size cap',
      find: `function maskCanvas(m, w, h) {`,
      replace: `function maskCanvas(m, w, h, cap) {` },
    { label: 'fx: maskCanvas builds at a lower resolution when capped',
      find: `m = cleanMask(m); w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));`,
      replace: `m = cleanMask(m); w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (cap && Math.max(w, h) > cap) { var kc = cap / Math.max(w, h); w = Math.max(2, Math.round(w * kc)); h = Math.max(2, Math.round(h * kc)); }` },
    { label: 'fx: fxInto stretches the (maybe smaller) mask over the picture; fast = preview only',
      find: `g.drawImage(maskCanvas(fx.mask, w, h), 0, 0);`,
      replace: `g.drawImage(maskCanvas(fx.mask, w, h, fx.fast ? 200 : 0), 0, 0, w, h);` }
  ],
  'www/editor.js': [
    { label: 'editor: the preview asks for the fast mask and skips redrawing when nothing changed',
      find: `try { NFX.fxInto(cv, d, { chroma: d._ch, mask: d._mk }); } catch (e) {}`,
      replace: `var fk = JSON.stringify([d._ch, d._mk]) + '|' + cw + 'x' + chh + '|' + (d.currentSrc || d.src || ''), kind = d.tagName;
    if ((kind === 'IMG' || kind === 'VIDEO') && d._fk === fk && (kind === 'IMG' || d._ft === d.currentTime)) return;
    d._fk = fk; d._ft = d.currentTime;
    try { NFX.fxInto(cv, d, { chroma: d._ch, mask: d._mk, fast: true }); } catch (e) {}` },
    { label: 'editor: a new frame (load, seek) always redraws',
      find: `d.addEventListener(ev, function (){ if (d._cv) keyOverlayFrame(d); });`,
      replace: `d.addEventListener(ev, function (){ d._fk = null; if (d._cv) keyOverlayFrame(d); });` },
    { label: 'editor: forget the redraw memory when the canvas goes away',
      find: `d._cv.remove(); d._cv = null; d._ch = null; d._mk = null;`,
      replace: `d._cv.remove(); d._cv = null; d._ch = null; d._mk = null; d._fk = null;` },
    { label: 'editor: Rectangle starts with rounded corners',
      find: `body.appendChild(chips(NFX.MASKS, shape, function (k){ commit(fx({ mask: { shape: k } })); }));`,
      replace: `body.appendChild(chips(NFX.MASKS, shape, function (k){ commit(fx({ mask: (k === 'rect' && !(m0 && m0.corner)) ? { shape: k, corner: 0.2 } : { shape: k } })); }));` },
    { label: 'editor: Size chip in the mask settings',
      find: `props.push({ key: 'x', label: 'Left / right' }, { key: 'y', label: 'Up / down' }, { key: 'rot', label: 'Turn' }, { key: 'feather', label: 'Feather' });`,
      replace: `props.push({ key: 'x', label: 'Left / right' }, { key: 'y', label: 'Up / down' }, { key: 'rot', label: 'Turn' }, { key: 'feather', label: 'Feather' });
          if (m0.shape !== 'line' && m0.shape !== 'mirror') props.unshift({ key: 'size', label: 'Size' });` },
    { label: 'editor: Size changes width and height together',
      find: `var pk = chipKey('maskprop', props, props[0].key), val = m0[pk], put = function (v){ var o = {}; o[pk] = v; return fx({ mask: o }); };`,
      replace: `var pk = chipKey('maskprop', props, props[0].key), big = Math.max(m0.w, m0.h), val = pk === 'size' ? big : m0[pk],
            put = function (v){ var o = {}; if (pk === 'size'){ var k = v / big; o.w = m0.w * k; o.h = m0.h * k; } else o[pk] = v; return fx({ mask: o }); };` },
    { label: 'editor: the Size slider',
      find: `else if (pk === 'w' || pk === 'h') body.appendChild(`,
      replace: `else if (pk === 'w' || pk === 'h' || pk === 'size') body.appendChild(` }
  ]
};

function load(rel){ const f = path.join(root, rel); const raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o){ fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }

if (!fs.existsSync(path.join(root, 'www', 'fx.js'))){ console.log('www/fx.js is missing. Run this from the project folder.'); process.exit(1); }
if (fs.readFileSync(path.join(root, 'www', 'fx.js'), 'utf8').includes('cap && Math.max(w, h) > cap')){ console.log('Already applied. Nothing to do.'); process.exit(0); }

const problems = [], files = {};
Object.keys(EDITS).forEach(rel => {
  const o = files[rel] = load(rel);
  EDITS[rel].forEach(e => {
    const n = o.text.split(e.find).length - 1;
    if (n !== 1){ problems.push(e.label + ': found ' + n + ' times (need exactly 1) in ' + path.basename(rel)); return; }
    o.text = o.text.replace(e.find, () => e.replace);
  });
});
if (problems.length){
  console.log('NOTHING WAS CHANGED. These spots did not match your files:\n  - ' + problems.join('\n  - '));
  console.log('\nSend me that list (and the file names) and I will adjust.');
  process.exit(1);
}
Object.keys(files).forEach(rel => save(files[rel]));
console.log('Done. Changed ' + Object.keys(files).length + ' files (fx.js, editor.js).\nNow run:  npm test');