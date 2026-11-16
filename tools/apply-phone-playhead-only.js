'use strict';
// Phones: the playhead is always in the middle and you scroll the timeline under it. The old moving-playhead style is gone there,
// and so is the small arrows button in the top bar (it is hidden on phones). Computers keep the moving playhead and the button.
// Only www/editor.js changes.   node tools/apply-phone-playhead-only.js   then   npm test
const fs = require('fs'), path = require('path'), R = (p) => path.join(__dirname, '..', p), file = R('www/editor.js');
const raw = fs.readFileSync(file, 'utf8'), crlf = raw.indexOf('\r\n') >= 0; let s = raw.replace(/\r\n/g, '\n');
if (s.indexOf('function isPhone()') >= 0) { console.log('Already applied.'); process.exit(0); }
const fail = (m) => { console.error('STOPPED, nothing changed: ' + m); process.exit(1); };
function rep(a, b, label) { const n = s.split(a).length - 1; if (n !== 1) fail('"' + label + '" found ' + n + ' times (needs 1; run tools/apply-fixed-playhead.js first)'); s = s.replace(a, () => b); }
rep("  function wantFixed(){\n", `  function isPhone(){ try { return !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(max-width: 899px)').matches); } catch (e) { return false; } }
  function wantFixed(){
    if (isPhone()) return true;   // phones always keep the playhead in the middle
`, 'wantFixed');
rep("if (u.tlMode){ u.tlMode.classList.toggle('on', !!E.fixed);", "if (u.tlMode){ u.tlMode.style.display = isPhone() ? 'none' : ''; u.tlMode.classList.toggle('on', !!E.fixed);", 'button');
fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
fs.writeFileSync(R('tests/timeline-phone.test.js'), `'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ed = fs.readFileSync(path.join(__dirname, '..', 'www', 'editor.js'), 'utf8').replace(/\\r\\n/g, '\\n');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
ok('phones always use the playhead in the middle, and the style button is hidden there', () => {
  new vm.Script(ed, { filename: 'editor.js' });
  ['function isPhone()', 'if (isPhone()) return true;', "u.tlMode.style.display = isPhone() ? 'none' : '';"].forEach(s => assert(ed.includes(s), s));
});
ok('computers keep the old moving playhead and the button', () => { assert(ed.includes("else if (E.ui.head) E.ui.head.style.left = tx(E.t) + 'px';")); assert(ed.includes("u.tlMode = btn('edTlMode'")); });
console.log('\\n' + n + ' checks passed');
`);
console.log('editor.js updated, tests/timeline-phone.test.js added. Now run: npm test');