'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const www = p => path.join(__dirname, '..', 'www', p);
const ed = fs.readFileSync(www('editor.js'), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

ok('editor.js is still valid JavaScript', () => { new vm.Script(ed, { filename: 'editor.js' }); });
ok('there is a Save still button in the Edit row, and the Freeze panel has Freeze + save still and Save still', () => {
  ["id: 'edStill'", "id: 'edFreezeStill'", "id: 'edStillNow'", 'run: freezeThenStill', 'G.still = '].forEach(s => assert(ed.includes(s), s));
});
ok('the still code is there: it waits for the video, draws crop-first like the export, and saves a PNG', () => {
  ['function stillWait', 'function drawStill', 'function exportStill', 'function freezeThenStill', "'image/png'", 'NF.containLayout(t, W, H, vw * cr.w, vh * cr.h)',
    'g.drawImage(m, cr.x * vw, cr.y * vh, cr.w * vw, cr.h * vh', 'exportStill: exportStill'].forEach(s => assert(ed.includes(s), s));
});
ok('the still is made at the size of the chosen frame (never above 1080 on the short side)', () => {
  const size = (a, vw, vh) => { let W, H; if (a >= 1) { H = Math.min(vh, 1080); W = Math.round(H * a); } else { W = Math.min(vw, 1080); H = Math.round(W / a); } return [W, H]; };
  assert.deepStrictEqual(size(16 / 9, 1920, 1080), [1920, 1080]); assert.deepStrictEqual(size(9 / 16, 1920, 1080), [1080, 1920]);
  assert.deepStrictEqual(size(1, 1920, 1080), [1080, 1080]); assert.deepStrictEqual(size(16 / 9, 640, 360), [640, 360]);
  assert(ed.includes('if (a >= 1){ H = Math.min(vh, 1080); W = Math.round(H * a); } else { W = Math.min(vw, 1080); H = Math.round(W / a); }'), 'same maths as the code');
});
console.log('\n' + n + ' checks passed');