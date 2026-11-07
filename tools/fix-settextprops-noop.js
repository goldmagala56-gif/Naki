'use strict';
// node tools/fix-settextprops-noop.js   (from the project folder)
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', 'www', 'project.js'), raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n'), text = raw.replace(/\r\n/g, '\n');
const find = "  applyTextPatch(f.clip, patch || {});\n  return finish(q);\n}\nfunction textsAt(";
const repl = "  applyTextPatch(f.clip, patch || {});\n  return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) ? p : finish(q);   // nothing changed: same project, so no empty undo step\n}\nfunction textsAt(";
const n = text.split(find).length - 1;
if (text.includes('nothing changed: same project, so no empty undo step')) { console.log('Already applied.'); process.exit(0); }
if (n !== 1) { console.log('NOTHING WAS CHANGED: found ' + n + ' matches for the end of setTextProps. Send me your current setTextProps function.'); process.exit(1); }
const out = text.replace(find, () => repl);
fs.writeFileSync(f, crlf ? out.replace(/\n/g, '\r\n') : out);
console.log('Done. Now run:  node tests/textfx.test.js   and then   npm test');