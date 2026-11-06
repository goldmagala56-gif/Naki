'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
const ed = read('editor.js'), wc = read('webcodecs-export.js');
const WC = require('../www/webcodecs-export.js').WebCodecsExport;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
ok('the editor has the crop frame, the Crop button and the Crop panel', () => {
  ['function buildCropUI', 'function cropDown', 'function syncCrop', "id: 'edCrop'", "crop: { title: 'Crop'"].forEach(s => assert(ed.includes(s), s));
});
ok('the preview fits a cropped picture and shows the whole picture while the panel is open', () => {
  assert(ed.includes('function framePicture(t, m, crop)')); assert(ed.includes('E.cropOn ? framePicture(null, m, null)'));
});
ok('a plan with a crop is exported by the ffmpeg engine, and one without still can use the fast engine', () => {
  const base = { durationMs: 1000, video: [{ type: 'play', sessionStart: 0, sessionEnd: 1000, movieStart: 0 }], audio: [] };
  assert.strictEqual(WC.canRender(base), true);
  assert.strictEqual(WC.canRender({ durationMs: 1000, audio: [], video: [{ type: 'play', sessionStart: 0, sessionEnd: 1000, movieStart: 0, crop: { x: 0, y: 0, w: 0.5, h: 1 } }] }), false);
});
console.log('\n' + n + ' checks passed');
