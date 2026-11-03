'use strict';
// One-time fix after the keyframe bar patch: tests/editor-hooks.test.js reads every "h.something" in editor.js as a call to a page hook, and the colour picker
// used a variable called h (h.length), so it asked for a hook called "length". The variable is renamed. Run from the project folder:   node tools/apply-keyframe-fix.js
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', 'www', 'editor.js'), raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n'), text = raw.replace(/\r\n/g, '\n');
const find = "var hx = function (x){ var h = Math.round(x / n).toString(16); return h.length < 2 ? '0' + h : h; };";
const rep = "var hx = function (x){ var t = Math.round(x / n).toString(16); return t.length < 2 ? '0' + t : t; };";
if (text.includes(rep)){ console.log('Already fixed. Nothing to do.'); process.exit(0); }
const n = text.split(find).length - 1;
if (n !== 1){ console.log('NOTHING WAS CHANGED: the spot was found ' + n + ' times in editor.js (need exactly 1). Send me the lines around "samplePoint" in editor.js.'); process.exit(1); }
const out = text.replace(find, () => rep);
fs.writeFileSync(f, crlf ? out.replace(/\n/g, '\r\n') : out);
console.log('Done. Now run:  npm test');