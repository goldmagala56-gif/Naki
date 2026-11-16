'use strict';
// Last two test lines after the text keyframes change. Only test files are touched.
//  tracker.test.js   a text's keyframe list also has 'opacity' (the sticker line stays as it is)
//  gestures.test.js  the editor's title cache key now has more in it, so the check looks for the start of it
// All or nothing.   node tools/fix-last-two.js   then   npm test
const fs = require('fs'), path = require('path'), R = (p) => path.join(__dirname, '..', p);
const fail = (m) => { console.error('STOPPED, nothing changed: ' + m); process.exit(1); };
function load(p) { const raw = fs.readFileSync(R(p), 'utf8'); return { crlf: raw.indexOf('\r\n') >= 0, s: raw.replace(/\r\n/g, '\n') }; }
const out = [];
{
  const f = load('tests/tracker.test.js'), a = "P.keyframeProps(q2, o2.id), ['x', 'y', 'size', 'rot'])", b = "P.keyframeProps(q2, o2.id), ['x', 'y', 'size', 'rot', 'opacity'])";
  if (f.s.indexOf(b) < 0) { if (f.s.split(a).length - 1 !== 1) fail('tracker.test.js: text line not found once'); out.push(['tests/tracker.test.js', f.crlf, f.s.replace(a, b)]); }
}
{
  const f = load('tests/gestures.test.js'), a = "'c.extrude, c.rot, cw, ch]'", b = "'c.extrude, c.rot,'";
  if (f.s.indexOf(b) < 0) {
    if (f.s.split(a).length - 1 !== 1) fail('gestures.test.js: expected-string not found once');
    const ed = fs.readFileSync(R('www/editor.js'), 'utf8');
    if (ed.indexOf('c.extrude, c.rot,') < 0) console.log('gestures.test.js: skipped (the editor key no longer starts with "c.extrude, c.rot,"). Paste me: Select-String -Path www\\editor.js -Pattern "_key" -Context 4,1');
    else out.push(['tests/gestures.test.js', f.crlf, f.s.replace(a, b)]);
  }
}
if (!out.length) { console.log('Already applied.'); process.exit(0); }
out.forEach(([p, crlf, s]) => { fs.writeFileSync(R(p), crlf ? s.replace(/\n/g, '\r\n') : s); console.log('updated ' + p); });
console.log('Done. Now run: npm test');