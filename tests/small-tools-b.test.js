'use strict';
// node tests/small-tools-b.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const S = require('../www/scopes.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
// 2 x 2 picture: black, white / red, green
const px = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255]);
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : function () {}), set: (t, k, v) => { t[k] = v; return true; } });

ok('the histogram counts each channel and the brightness', () => {
  const a = S.analyze(px, 2, 2);
  assert.strictEqual(a.hist.l[0], 1); assert.strictEqual(a.hist.l[255], 1); assert.strictEqual(a.hist.l[54], 1); assert.strictEqual(a.hist.l[182], 1);
  assert.strictEqual(a.hist.r[255], 2); assert.strictEqual(a.hist.r[0], 2); assert.strictEqual(a.hist.g[255], 2); assert.strictEqual(a.hist.b[255], 1);
  let total = 0; a.hist.l.forEach(v => { total += v; }); assert.strictEqual(total, 4);
});
ok('the waveform keeps one column per picture column', () => {
  const a = S.analyze(px, 2, 2);
  assert.strictEqual(a.wave.l.length, 2 * 256); assert.strictEqual(a.wave.l[0 * 256 + 0], 1); assert.strictEqual(a.wave.l[0 * 256 + 54], 1);
  assert.strictEqual(a.wave.l[1 * 256 + 255], 1); assert.strictEqual(a.wave.l[1 * 256 + 182], 1); assert.strictEqual(a.wave.r[0 * 256 + 255], 1);
});
ok('all three scopes draw without errors, even on an empty picture', () => {
  [px, new Uint8ClampedArray(16)].forEach(d => { const a = S.analyze(d, 2, 2); S.drawHistogram(ctx(), a, 320, 140); S.drawWaveform(ctx(), a, 320, 140, 'luma'); S.drawWaveform(ctx(), a, 320, 140, 'parade'); });
});
ok('the editor has the Scopes panel and the eyedropper, scopes.js loads before editor.js, and the files parse', () => {
  const ed = read('editor.js'), html = read('index.html'), css = read('editor.css');
  ["id: 'edScopes'", 'PANELS.scopes = ', 'function drawScopesNow', 'function startEyedrop', 'function addEyedroppers', 'syncScopes();', 'addEyedroppers();', 'stopEyedrop();'].forEach(s => assert(ed.includes(s), s));
  assert(css.includes('.ed-scopecv') && css.includes('.ed-eyelayer'));
  assert(html.includes('<script src="scopes.js"></script>') && html.indexOf('scopes.js') < html.indexOf('src="editor.js"'));
  ['editor.js', 'scopes.js'].forEach(f => new vm.Script(read(f)));
});
console.log('\n' + n + ' checks passed');