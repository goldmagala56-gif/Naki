'use strict';
// gestures.test.js: the editor's title cache key now reads "c.extrude, lk ? 0 : c.rot, cw, ch]" (a title with a turn keyframe is turned by the preview, not by the cached picture).
// Only the expected text in the test changes.   node tools/fix-gestures-key.js   then   npm test
const fs = require('fs'), path = require('path'), p = path.join(__dirname, '..', 'tests', 'gestures.test.js');
const raw = fs.readFileSync(p, 'utf8'), crlf = raw.indexOf('\r\n') >= 0, s = raw.replace(/\r\n/g, '\n');
const a = "'c.extrude, c.rot, cw, ch]'", b = "'c.extrude, lk ? 0 : c.rot, cw, ch]'";
if (s.indexOf(b) >= 0) { console.log('Already applied.'); process.exit(0); }
if (s.split(a).length - 1 !== 1) { console.error('STOPPED, nothing changed: the expected text was not found exactly once.'); process.exit(1); }
const out = s.replace(a, b); fs.writeFileSync(p, crlf ? out.replace(/\n/g, '\r\n') : out); console.log('updated tests/gestures.test.js. Now run: npm test');