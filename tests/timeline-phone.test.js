'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ed = fs.readFileSync(path.join(__dirname, '..', 'www', 'editor.js'), 'utf8').replace(/\r\n/g, '\n');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
ok('phones always use the playhead in the middle, and the style button is hidden there', () => {
  new vm.Script(ed, { filename: 'editor.js' });
  ['function isPhone()', 'if (isPhone()) return true;', "u.tlMode.style.display = isPhone() ? 'none' : '';"].forEach(s => assert(ed.includes(s), s));
});
ok('computers keep the old moving playhead and the button', () => { assert(ed.includes("else if (E.ui.head) E.ui.head.style.left = tx(E.t) + 'px';")); assert(ed.includes("u.tlMode = btn('edTlMode'")); });
console.log('\n' + n + ' checks passed');
