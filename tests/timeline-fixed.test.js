'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ed = fs.readFileSync(path.join(__dirname, '..', 'www', 'editor.js'), 'utf8').replace(/\r\n/g, '\n');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
ok('editor.js still parses', () => { new vm.Script(ed, { filename: 'editor.js' }); });
ok('the playhead can stay in the middle: padding is half the width, scroll follows the time, time follows the scroll', () => {
  ['function wantFixed()', 'function refreshFixed()', 'PAD = (E.fixed && w > 100) ? Math.round(w / 2) : 16', 'var want = Math.round(E.t * E.ppm)', 'seek(sc.scrollLeft / E.ppm)',
   "u.tlMode = btn('edTlMode'", "naki.tlfixed", "if (!E.fixed) seek(d.t);", 'ax = (anchorX != null && !E.fixed)'].forEach(s => assert(ed.includes(s), 'missing: ' + s));
});
ok('the computer keeps its moving playhead: the old placement is still there for the other mode', () => {
  assert(ed.includes("else if (E.ui.head) E.ui.head.style.left = tx(E.t) + 'px';")); assert(ed.includes("if (!E.fixed && (x > sc.scrollLeft + sc.clientWidth - 40"));
});
console.log('\n' + n + ' checks passed');
