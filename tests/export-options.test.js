'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const E = require('../www/export-engine.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const plan = { durationMs: 1000, movie: { name: 'm', durationMs: 8000 }, video: [{ type: 'play', sessionStart: 0, sessionEnd: 1000, movieStart: 0 }], audio: [] };
const info = { width: 320, height: 180, sar: 1, hasAudio: false, audioMono: false, durationSec: 8 };
const pic = o => E.planToJobs(plan, info, o).jobs.filter(j => /^picture/.test(j.label))[0].args.join(' ');

ok('the ffmpeg engine follows the chosen frame rate and goes back to 30 without one', () => {
  const a = pic({ height: 180, fps: 60 }); assert(a.includes('-r 60') && a.includes('-frames:v 60'), a);
  const b = pic({ height: 180 }); assert(b.includes('-r 30') && b.includes('-frames:v 30'), b);
});
ok('the fast engine takes the frame rate from the options', () => {
  assert(read('webcodecs-export.js').includes('FPS = opts.fps > 0 ? opts.fps : await pickFps(videoTrack)'));
});
ok('the sheet has presets, frame rate and save-as, and the export converts GIF and sound only', () => {
  const ix = read('index.html');
  ['id="segPreset"', 'id="segFps"', 'id="segKind"', 'window.postExport', "S.exportKind === 'audio'", 'convertMedia'].forEach(s => assert(ix.includes(s), s));
  assert(read('export-engine.js').includes('convertMedia: convertMedia'));
});
ok('every inline script in index.html is still valid JavaScript', () => {
  const re = /<script>([\s\S]*?)<\/script>/g; let m, c = 0;
  while ((m = re.exec(read('index.html')))) { new vm.Script(m[1]); c++; }
  assert(c >= 2);
});
console.log('\n' + n + ' checks passed');