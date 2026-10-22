'use strict';
// node tests/sfx-categories.test.js
// Every sound effect belongs to a category, and the editor shows category buttons above the effects.
const assert = require('assert'), fs = require('fs'), path = require('path');
const S = require('../www/sfx.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
ok('every effect has a unique key, a unique name and a category', () => {
  const keys = new Set(), labels = new Set();
  S.LIST.forEach(x => { assert(x.cat && typeof x.cat === 'string', x.key + ' has no category'); assert(!keys.has(x.key), 'duplicate key ' + x.key); assert(!labels.has(x.label), 'duplicate name ' + x.label); keys.add(x.key); labels.add(x.label); });
});
ok('there are several categories, each with at least two effects, so the buttons are worth having', () => {
  const by = {}; S.LIST.forEach(x => { by[x.cat] = (by[x.cat] || 0) + 1; });
  assert(Object.keys(by).length >= 2, 'categories: ' + Object.keys(by));
  Object.keys(by).forEach(c => assert(by[c] >= 2, c + ' has only ' + by[c]));
});
ok('the editor shows the category buttons', () => {
  const src = fs.readFileSync(path.join(__dirname, '../www/editor.js'), 'utf8');
  assert(src.includes("chipKey('sfxpick'") && src.includes("pickChip('sfxpick')"));
});
console.log('\n' + n + ' checks passed');
