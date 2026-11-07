'use strict';
// node tools/fix-layout-end.js   (from the project folder)
// tests/layout.test.js expects "no room at the very end": a layout asked for 100 ms before the end of the video is refused.
// addLayout pushed the start back to total - 300 instead, so it was added. This makes it refuse, like the test says.
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', 'www', 'project.js'), raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n'), text = raw.replace(/\r\n/g, '\n');
const find = 'var start = Math.max(0, Math.min(Math.round(t), total - 300)), d = Math.min(4000, total - start); if (d < 300) return p;';
const repl = 'var start = Math.max(0, Math.round(t)), d = Math.min(4000, total - start); if (d < 300) return p;';
const n = text.split(find).length - 1;
if (n === 0 && text.includes(repl)) { console.log('Already fixed.'); process.exit(0); }
if (n !== 1) { console.log('NOTHING WAS CHANGED: found the line ' + n + ' times (need exactly 1) in www/project.js. Send me the addLayout function.'); process.exit(1); }
const out = text.replace(find, () => repl);
fs.writeFileSync(f, crlf ? out.replace(/\n/g, '\r\n') : out);
console.log('Done.\nNow run:  node tests/layout.test.js');