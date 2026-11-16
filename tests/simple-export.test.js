'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const rd = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8').replace(/\r\n/g, '\n');
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
console.log('\n' + n + ' checks passed');
