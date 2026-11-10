'use strict';
// node tools/fix-captions-test.js   (from the project folder)
// tests/captions.test.js checks that a caption size is limited to 16; text size now goes up to 30 (for pinch-to-resize), so that one expected number becomes 30.
const fs = require('fs'), path = require('path'), f = path.join(__dirname, '..', 'tests', 'captions.test.js');
const raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n'), lines = raw.replace(/\r\n/g, '\n').split('\n');
const i = lines.findIndex(l => l.includes('one setting does not undo another'));
if (i < 0) { console.log('Could not find the "one setting does not undo another" check. Send me tests/captions.test.js lines 60-70.'); process.exit(1); }
const before = lines[i];
const after = before.replace(/(\[\s*'[^']*'\s*,\s*[\d.]+\s*,\s*)16(\s*\])/, '$130$2');
if (after === before) {
  if (/(,\s*)30(\s*\])/.test(before)) { console.log('Already fine.'); process.exit(0); }
  console.log('Found the check (line ' + (i + 1) + ') but not the expected "16". Send me that line:\n' + before.trim().slice(0, 400)); process.exit(1);
}
lines[i] = after; const out = lines.join('\n');
fs.writeFileSync(f, crlf ? out.replace(/\n/g, '\r\n') : out);
console.log('Fixed line ' + (i + 1) + ' of tests/captions.test.js (16 -> 30). Now run: npm test');