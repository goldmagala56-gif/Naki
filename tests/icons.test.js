'use strict';
// node tests/icons.test.js
// The icon set (Lucide): all there, drawn with the text colour, sizes work, an unknown name is harmless, and the licence is kept with the app.
const assert = require('assert'), fs = require('fs'), path = require('path');
const I = require('../www/icons.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const NEED = ['house', 'plus', 'x', 'check', 'chevron-left', 'chevron-right', 'chevron-down', 'ellipsis', 'search', 'settings', 'download', 'upload', 'share-2', 'play', 'pause', 'skip-back', 'skip-forward',
  'volume-2', 'volume-x', 'mic', 'scissors', 'split', 'copy', 'trash-2', 'undo-2', 'redo-2', 'magnet', 'lock', 'lock-open', 'eye', 'eye-off', 'crop', 'rotate-cw', 'flip-horizontal-2', 'zoom-in', 'zoom-out',
  'layers', 'image', 'video', 'music', 'audio-waveform', 'captions', 'type', 'sparkles', 'wand-sparkles', 'zap', 'palette', 'sliders-horizontal', 'shapes', 'sticker', 'frame', 'picture-in-picture-2', 'film', 'clapperboard', 'mic-vocal', 'folder-open'];

ok('the set: more than two hundred icons, every name unique, and every icon the editor, the home screen and the export sheet will need is in it', () => {
  const names = I.names(); assert(names.length >= 200, 'icons: ' + names.length); assert.strictEqual(new Set(names).size, names.length);
  NEED.forEach(k => assert(I.has(k), 'missing: ' + k)); assert.strictEqual(I.has('nope'), false); assert.strictEqual(I.has('toString'), false, 'only real icons, not built-in object names');
});
ok('each icon is a clean svg: drawn with the text colour, a 24 grid, round line ends, hidden from screen readers, and no scripts or outside pictures', () => {
  I.names().forEach(k => {
    const s = I.svg(k); assert(s.startsWith('<svg') && s.endsWith('</svg>'), k); assert(s.includes('viewBox="0 0 24 24"') && s.includes('stroke="currentColor"') && s.includes('fill="none"') && s.includes('stroke-linecap="round"'), k);
    assert(s.includes('aria-hidden="true"') && s.includes('class="lc lc-' + k + '"'), k); assert(!/<script|onload|onclick|href=|<image|<use|<foreignObject/i.test(s), k + ' has something it should not');
    assert((s.match(/<svg/g) || []).length === 1 && /<(path|circle|rect|line|polyline|polygon|ellipse)/.test(s), k + ' has a drawing');
  });
});
ok('options: size, line thickness and an extra class are applied; the default is 24 with a line of 2; an unknown name gives nothing', () => {
  assert(I.svg('play').includes('width="24" height="24"') && I.svg('play').includes('stroke-width="2"'));
  const s = I.svg('play', { size: 18, stroke: 1.5, cls: 'big' }); assert(s.includes('width="18" height="18"') && s.includes('stroke-width="1.5"') && s.includes('class="lc lc-play big"'));
  assert.strictEqual(I.svg('nope'), ''); assert.strictEqual(I.svg(undefined), ''); assert.strictEqual(I.svg('play', null).includes('width="24"'), true);
});
ok('the licence of the icons is kept with the app (ISC asks for it to be copied along)', () => {
  const f = path.join(__dirname, '..', 'www', 'icons', 'LICENSE-lucide.txt'); assert(fs.existsSync(f), 'copy LICENSE-lucide.txt into www/icons/'); const t = fs.readFileSync(f, 'utf8'); assert(/ISC License/.test(t) && /Lucide/.test(t));
});
console.log('\n' + n + ' checks passed');
