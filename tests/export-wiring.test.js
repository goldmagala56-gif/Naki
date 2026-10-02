'use strict';
// node tests/export-wiring.test.js
// Guards the places where an export edit can silently go missing: index.html must use the edited timeline,
// must check whether the fast engine can draw it, and must hand the music file to the engines.
const assert = require('assert'), fs = require('fs'), path = require('path');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const page = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
const fnAt = page.indexOf('function runExport(');
const body = fnAt < 0 ? '' : page.slice(fnAt, page.indexOf('\nS.exportVertical', fnAt) > fnAt ? page.indexOf('\nS.exportVertical', fnAt) : fnAt + 3000);
ok('the export plan comes from the editor (so your edits are what gets exported)', () => assert(/NakiEditor\.planFor\(/.test(page)));
ok('runExport asks the fast engine whether it can draw the edits (titles, speed, filters, opacity...)', () => assert(/WebCodecsExport\.canRender\(/.test(body), 'runExport never calls WebCodecsExport.canRender, so titles and other edits are silently left out on phones that use the fast engine'));
ok('the music file reaches both engines', () => assert(/ffmpegOpts\.musicFile\s*=/.test(body) && /webcodecsOpts\.musicFile\s*=/.test(body), 'musicFile is not passed to both engines in runExport'));
ok('a missing music file is reported, not silently dropped', () => assert(/music file is missing/.test(body)));
console.log('\n' + n + ' checks passed');