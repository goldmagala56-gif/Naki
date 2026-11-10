'use strict';
// node tools/fix-gestures-versions.js   (from the project folder)
// For a project that already ran the first apply-gestures.js: puts the version tags back the way index.html expects them
// (anim ease, look textfx, plan look2, project look2, editor timeline), and updates the text size check in tests/project.test.js (16 -> 30).
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
function edit(rel, fn) {
  const f = path.join(root, rel); if (!fs.existsSync(f)) { console.log('skipped (not found): ' + rel); return; }
  const raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n'), t = raw.replace(/\r\n/g, '\n'), out = fn(t);
  if (out === t) { console.log('already fine: ' + rel); return; }
  fs.writeFileSync(f, crlf ? out.replace(/\n/g, '\r\n') : out); console.log('fixed: ' + rel);
}
const tag = (name, want) => (t) => t.replace(new RegExp("(NakiVersions\\['" + name.replace('.', '\\.') + "'\\] = ')[^']*(')"), '$1' + want + '$2');
edit('www/anim.js', tag('anim.js', 'ease')); edit('www/look.js', tag('look.js', 'textfx')); edit('www/plan.js', tag('plan.js', 'look2'));
edit('www/project.js', tag('project.js', 'look2')); edit('www/editor.js', tag('editor.js', 'timeline'));
edit('tests/project.test.js', (t) => t.replace("assert.strictEqual(c.size, 16, 'size is kept within range');", "assert.strictEqual(c.size, 30, 'size is kept within range');"));
console.log('Now run: npm test');