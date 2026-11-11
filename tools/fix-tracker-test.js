'use strict';
// The tracker test still says "a text has no keyframe bar" (an empty list). Texts now have left/right and up/down keyframes, so it should say ['x', 'y'].
// Changes ONE assertion in tests/tracker.test.js (line 80). If that line is not what I expect it prints it and changes nothing.
// Run from the project folder:   node tools/fix-tracker-test.js    then   npm test
const fs = require('fs'), path = require('path'), f = path.join(__dirname, '..', 'tests', 'tracker.test.js');
const raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n'), lines = raw.replace(/\r\n/g, '\n').split('\n');
const i = 79, line = lines[i] || '';
const re = /(keyframeProps\([^)]*\)\s*,\s*)\[\](\s*[,)])/g, hits = line.match(re) || [];
if (hits.length !== 1){ console.log('NOTHING CHANGED. Line 80 is not the one I expected. Paste me lines 78-82 of tests/tracker.test.js:\n' + lines.slice(77, 82).join('\n')); process.exit(1); }
lines[i] = line.replace(re, (m, a, b) => a + "['x', 'y']" + b);
fs.writeFileSync(f, lines.join('\n').replace(/\n/g, crlf ? '\r\n' : '\n'));
console.log('Done. Line 80 of tests/tracker.test.js now expects the x / y keyframes for a text.\nNow run:  npm test');