'use strict';
// Naki: Export works like CapCut. In the editor, tap Export and it starts at once with the settings you chose before.
//   - no settings page in the way: you see the progress, then the finished video with Share / Download
//   - the settings (size, quality, frame rate, logo, GIF, sound only) live behind a small gear next to Export in the editor,
//     and are remembered (size, quality, frame rate) between visits
//   - if an export fails or is cancelled, the settings come back so you can change something and try again
//   - the Export button on the project screen still opens the full sheet
// Edits www/index.html and www/editor.js, adding only. All or nothing.   node tools/apply-simple-export.js   then   npm test
const fs = require('fs'), path = require('path'), R = (p) => path.join(__dirname, '..', p);
const fail = (m) => { console.error('STOPPED, nothing changed: ' + m); process.exit(1); };
function load(p) { const raw = fs.readFileSync(R(p), 'utf8'); return { crlf: raw.indexOf('\r\n') >= 0, s: raw.replace(/\r\n/g, '\n') }; }
const H = load('www/index.html'), E = load('www/editor.js');
if (H.s.indexOf('naki.exportPrefs') >= 0) { console.log('Already applied.'); process.exit(0); }
function rep(o, a, b, label) { const n = o.s.split(a).length - 1; if (n !== 1) fail('"' + label + '" found ' + n + ' times (needs 1)'); o.s = o.s.replace(a, () => b); }

/* ---------- index.html ---------- */
rep(H, "onExport: function(){ openExportSheet(); },", "onExport: function(){ openExportSheet({ auto: true }); },\n      onExportSettings: function(){ openExportSheet({ settings: true, fromEditor: true }); },", 'editor hook');
rep(H, "window.openExportSheet = function(){", "window.openExportSheet = function(opts){", 'openExportSheet head');
rep(H, "$('shName').textContent = S.sess.name; est(); $('exportSheet').hidden = false;",
`$('shName').textContent = S.sess.name; est();
    var sh = $('exportSheet'), auto = !!(opts && opts.auto === true); S.exFromEditor = !!(opts && opts.fromEditor === true);
    sh.classList.remove('exrun', 'exdone', 'exauto');
    if (auto && !$('bExport').disabled){ setKind('video'); est(); sh.classList.add('exauto', 'exrun'); }
    sh.hidden = false;
    if (auto && !$('bExport').disabled){   // Export in the editor starts at once, with the settings from last time
      setTimeout(function(){ $('bExport').click(); setTimeout(function(){ if ($('exportBox').hidden) sh.classList.remove('exrun', 'exauto'); }, 1800); }, 80);
    }`, 'open body');
rep(H, "function closeSheet(){ $('exportSheet').hidden = true; }",
`function closeSheet(){
    var sh = $('exportSheet'); sh.hidden = true; sh.classList.remove('exrun', 'exdone', 'exauto');
    if (S.exFromEditor){ S.exFromEditor = false; setTimeout(function(){ var b = $('btnEditor'); if (b) b.click(); }, 50); }   // settings opened from the editor: back to the editor
  }`, 'closeSheet');
const hook = '  // what happens to the finished MP4: nothing for a video; a GIF or a sound-only file is made from it\n';
rep(H, hook, `  /* remember the export choices (size, quality, frame rate); the shape comes from the editor's Format */
  function savePrefs(){ try { localStorage.setItem('naki.exportPrefs', JSON.stringify({ res: S.exportRes, q: S.exportQuality, fps: S.exportFps })); } catch (e) {} }
  function loadPrefs(){
    try {
      var p = JSON.parse(localStorage.getItem('naki.exportPrefs') || 'null'); if (!p) return;
      var r = document.querySelector('#segRes [data-res="' + p.res + '"]'); if (r) r.click();
      $(p.q === 'sharper' ? 'bQualitySharper' : 'bQualityFaster').click();
      if (p.fps) setFps(p.fps);
    } catch (e) {}
  }
  $('exportSheet').addEventListener('click', function(){ setTimeout(savePrefs, 0); });
  loadPrefs();
  // an export that started by itself: hide the settings while it runs and after it is done; bring them back if it failed or was cancelled
  new MutationObserver(function(){
    var sh = $('exportSheet'), b = $('bExport'); if (!sh.classList.contains('exauto')) return;
    if (b.disabled){ sh.classList.add('exrun'); return; }
    sh.classList.remove('exrun');
    if (!$('exportDone').hidden) sh.classList.add('exdone'); else sh.classList.remove('exauto');
  }).observe($('bExport'), { attributes: true, attributeFilter: ['disabled'] });
` + hook, 'export options hook');
const cssAnchor = '<style id="editor-polish">';
rep(H, cssAnchor, `<style id="export-simple">
/* Export started from the editor: only the progress, then the finished video */
#exportSheet.exrun .excards,#exportSheet.exrun .est,#exportSheet.exrun .exmore,#exportSheet.exrun .foot,#exportSheet.exrun .sheet>p,
#exportSheet.exdone .excards,#exportSheet.exdone .est,#exportSheet.exdone .exmore,#exportSheet.exdone #bExport,#exportSheet.exdone .sheet>p{display:none!important}
</style>
` + cssAnchor, 'editor-polish style');

/* ---------- editor.js ---------- */
const pre = "add(top, u.close, mk('div', 'ed-title', 'Edit video'), u.saved, u.zout, u.zin, u.fit, ";
rep(E, pre, "u.exSet = btn('edExportSet', '⚙', 'ed-btn ed-sq', 'Export settings');\n    " + pre + "u.exSet, ", 'top bar');
const ex = "u.exportBtn.onclick = function (){ if (!E.hooks.onExport){ toast('Export is not available here.'); return; } close(); E.hooks.onExport(); };";
rep(E, ex, ex + "\n    u.exSet.onclick = function (){ if (!E.hooks.onExportSettings){ toast('Export settings are not available here.'); return; } close(); E.hooks.onExportSettings(); };", 'export button');

fs.writeFileSync(R('www/index.html'), H.crlf ? H.s.replace(/\n/g, '\r\n') : H.s);
fs.writeFileSync(R('www/editor.js'), E.crlf ? E.s.replace(/\n/g, '\r\n') : E.s);
fs.writeFileSync(R('tests/simple-export.test.js'), `'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const rd = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8').replace(/\\r\\n/g, '\\n');
const html = rd('index.html'), ed = rd('editor.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
ok('the editor has an Export settings gear and the page has a hook for it', () => {
  new vm.Script(ed, { filename: 'editor.js' });
  ["u.exSet = btn('edExportSet'", 'E.hooks.onExportSettings()'].forEach(s => assert(ed.includes(s), s));
  ["onExportSettings: function(){ openExportSheet({ settings: true, fromEditor: true }); }", "onExport: function(){ openExportSheet({ auto: true }); }"].forEach(s => assert(html.includes(s), s));
});
ok('Export from the editor starts by itself, hides the settings while it runs, and brings them back on a failure', () => {
  ["sh.classList.add('exauto', 'exrun')", "$('bExport').click()", '#exportSheet.exrun .excards', "if (!$('exportDone').hidden) sh.classList.add('exdone'); else sh.classList.remove('exauto');"].forEach(s => assert(html.includes(s), s));
});
ok('size, quality and frame rate are remembered', () => { ['naki.exportPrefs', 'function savePrefs()', 'function loadPrefs()'].forEach(s => assert(html.includes(s), s)); });
console.log('\\n' + n + ' checks passed');
`);
console.log('index.html and editor.js updated, tests/simple-export.test.js added. Now run: npm test');