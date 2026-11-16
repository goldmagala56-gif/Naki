'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const rd = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8').replace(/\r\n/g, '\n');
const ed = rd('editor.js'), html = rd('index.html');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
ok('the picture row has a Cover tile that opens the cover maker, only where there is room', () => {
  new vm.Script(ed, { filename: 'editor.js' });
  ['function coverTile(tr)', "tr.role === 'movie' && PAD >= 90 && E.hooks && E.hooks.onCover", 'E.hooks.onCover()', "'ed-cover'"].forEach(s => assert(ed.includes(s), s));
  assert(html.includes("onCover: function(){ var b = document.getElementById('bCover'); if (b) b.click(); }"));
});
console.log('\n' + n + ' checks passed');
