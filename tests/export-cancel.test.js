'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
const ix = rd('index.html'), wc = rd('webcodecs-export.js'), ee = rd('export-engine.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
ok('the page has a cancel button that starts hidden', () => assert(/id="bCancelExport"[^>]*hidden/.test(ix)));
ok('the fast engine checks for cancel on every frame and progress update', () => { assert((wc.match(/check\(\); await videoSource\.add/g) || []).length === 3); assert(wc.includes('var prog = function (p) { check(); prog0(p); };')); });
ok('the ffmpeg engine checks between jobs and can be terminated', () => { assert(ee.includes('checkCancel(); var job = built.jobs[i];')); assert(ee.includes('ffmpeg.terminate()')); });
ok('the page never falls back to the other engine after a cancel', () => assert(ix.includes('if (S.xc && S.xc.cancelled) throw err; return viaFfmpeg')));
console.log('\n' + n + ' checks passed');

