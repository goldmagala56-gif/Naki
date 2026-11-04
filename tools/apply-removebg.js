'use strict';
// node tools/apply-removebg.js   (run from the project folder, after www/removebg.js exists)
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
if (!fs.existsSync(path.join(root, 'www', 'removebg.js'))) { console.log('Create www/removebg.js first.'); process.exit(1); }
const ed = load('www/editor.js'), ix = load('www/index.html'), sw = load('www/sw.js');
if (ed.text.includes('NakiRemoveBg') || ed.text.includes('NRB')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

rep(ed, `var NBS = (typeof module`,
  `var NRB = (typeof module !== 'undefined' && module.exports) ? require('./removebg.js') : (typeof window !== 'undefined' ? window.NakiRemoveBg : null);\n  var NBS = (typeof module`, 'editor: lookup');
rep(ed, `G.frame = svg('<rect x="3" y="4" width="18" height="16" rx="1.5"/><rect x="7" y="8" width="10" height="8" rx="1"/>');`,
  `G.frame = svg('<rect x="3" y="4" width="18" height="16" rx="1.5"/><rect x="7" y="8" width="10" height="8" rx="1"/>');\n  G.rembg = svg('<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0113 0"/><path d="M3 3l2 2M21 3l-2 2M3 21l2-2M21 21l-2-2"/>');`, 'editor: icon');
rep(ed, `{ id: 'edOverlayChroma', label: 'Chroma key',`,
  `{ id: 'edOverlayRemoveBg', label: 'Remove BG', icon: G.rembg, run: function (){ openPanel('removebg'); }, disabled: !isO || !!selGen() },\n        { id: 'edOverlayChroma', label: 'Chroma key',`, 'editor: tool button');
rep(ed, `chromakey: { title: 'Chroma key', build: function (body){`,
  `removebg: { title: 'Remove background', build: function (body){\n      if (!NRB){ body.appendChild(mk('div', 'ed-hint', 'removebg.js is not loaded.')); return; }\n      NRB.buildPanel(body, { clip: selOverlay(), hooks: E.hooks, store: E.rbg || (E.rbg = {}), mk: mk, sliderRow: sliderRow, actions: actions, toast: toast, refresh: renderDock, redraw: function (){ renderTimeline(); syncMedia(); } });\n    } },\n    chromakey: { title: 'Chroma key', build: function (body){`, 'editor: panel');
rep(ed, `E.pickOn = false; E.pickPos = null; renderDock();`, `E.pickOn = false; E.pickPos = null; E.rbg = {}; renderDock();`, 'editor: reset on open');
rep(ix, `<script src="editor.js"></script>`, `<script src="removebg.js"></script>\n<script src="editor.js"></script>`, 'index: script tag');
rep(sw, `'./editor.js', `, `'./editor.js', './removebg.js', `, 'sw: file list');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[ed, ix, sw].forEach(save);
console.log('Done. Reload with Ctrl+Shift+R, then: Overlay > add a photo > select it > Remove BG.');