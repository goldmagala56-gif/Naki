'use strict';
// node tests/skin.test.js
// The skin: every button name it knows points at a real icon, the name matching behaves, and the theme keeps its colour line and its safety rules.
const assert = require('assert'), fs = require('fs'), path = require('path');
const S = require('../www/skin.js'), I = require('../www/icons.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

ok('every button name it knows points at an icon that really exists, and there are plenty', () => {
  const keys = Object.keys(S.BY_LABEL); assert(keys.length >= 100, 'names: ' + keys.length);
  keys.forEach(k => { assert(I.has(S.BY_LABEL[k]), k + ' -> ' + S.BY_LABEL[k] + ' is not an icon'); assert.strictEqual(k, k.toLowerCase().trim(), k + ' must be written in small letters'); });
});
ok('names are matched without caring about capitals, spaces or the diamond signs on keyframe buttons', () => {
  assert.strictEqual(S.iconFor('Split'), 'split'); assert.strictEqual(S.iconFor('  EXPORT  '), 'download'); assert.strictEqual(S.iconFor('Add   text'), 'type');
  assert.strictEqual(S.iconFor('\u25c6 Something unknown'), null, 'an unknown name stays unknown'); assert.strictEqual(S.iconFor(''), null); assert.strictEqual(S.iconFor(null), null); assert.strictEqual(S.iconFor('toString'), null);
});
ok('rows: lock, hide and mute buttons are told apart from their opposites, and "Add ..." buttons get a plus', () => {
  assert.strictEqual(S.iconFor('Lock Picture'), 'lock'); assert.strictEqual(S.iconFor('Unlock Picture'), 'lock-open'); assert.strictEqual(S.iconFor('Hide Text'), 'eye-off'); assert.strictEqual(S.iconFor('Show Text'), 'eye');
  assert.strictEqual(S.iconFor('Mute Music'), 'volume-x'); assert.strictEqual(S.iconFor('Unmute Music'), 'volume-2'); assert.strictEqual(S.iconFor('Add sticker \u2665'), 'sticker'); assert.strictEqual(S.iconFor('Add overlay'), 'plus');
});
ok('the screens: the session and finished-video buttons have icons too', () => {
  ['Record again', 'Take back from here', 'Edit video', 'Home', 'Play session', 'Landscape', 'Vertical (TikTok)', 'Faster export', 'Sharper (slower)', 'Add logo (optional)'].forEach(l => assert(S.iconFor(l), l));
});
ok('the theme: it sets the accent colour in one line, uses no outside files, and does not move anything (no layout rules)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'www', 'theme.css'), 'utf8');
  assert(/--mango:\s*#[0-9a-f]{6}/i.test(css) && /THE ACCENT COLOUR/.test(css), 'one accent line'); assert(!/@import|url\(\s*['"]?https?:/i.test(css), 'nothing from outside');
  assert(!/\b(grid-template|position\s*:\s*(fixed|absolute)|display\s*:\s*none|z-index)\b/i.test(css), 'colours, borders and shapes only'); assert(/:focus-visible/.test(css), 'keyboard focus stays visible');
});
console.log('\n' + n + ' checks passed');
