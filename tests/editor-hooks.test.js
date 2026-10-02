'use strict';
// node tests/editor-hooks.test.js
// editor.js talks to the page only through the "hooks" that index.html passes to NakiEditor.init({...}).
// If the editor uses a hook the page never passes, a button silently does nothing (this is exactly how an
// Export button that "doesn't work" happens). This test finds every hook the editor uses and checks the page passes it.
const assert = require('assert'), fs = require('fs'), path = require('path');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const www = path.join(__dirname, '..', 'www');
const editor = fs.readFileSync(path.join(www, 'editor.js'), 'utf8');
const page = fs.readFileSync(path.join(www, 'index.html'), 'utf8');

// every hook name the editor reads: E.hooks.name, hooks.name, and h.name where h = E.hooks
const used = new Set();
let m; const re1 = /\bhooks\.(\w+)/g, re2 = /\bh\.(\w+)/g;
while ((m = re1.exec(editor))) used.add(m[1]);
const hasAlias = /\bh\s*=\s*(E\.)?hooks\b/.test(editor);
if (hasAlias) while ((m = re2.exec(editor))) used.add(m[1]);

const initAt = page.indexOf('NakiEditor.init(');
const block = initAt < 0 ? '' : page.slice(initAt, page.indexOf('\n});', initAt) + 4);

ok('the page calls NakiEditor.init({...})', () => assert(initAt >= 0 && block.length > 20, 'index.html has no NakiEditor.init block'));
ok('the editor uses some hooks (so this test is looking at the right thing)', () => assert(used.size >= 8, 'found only ' + [...used].join(', ')));
ok('every hook the editor uses is passed by the page', () => {
  const missing = [...used].filter(name => !new RegExp('(^|[\\s,{])' + name + '\\s*:').test(block));
  assert.deepStrictEqual(missing, [], 'index.html does not pass: ' + missing.join(', ') + '. A button that needs one of these will do nothing.');
});
console.log('\n' + n + ' checks passed');