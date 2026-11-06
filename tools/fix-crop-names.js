'use strict';
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', 'www', 'editor.js'), raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n'), bad = [];
[["var v = mk('i'), h = mk('i');", "var vl = mk('i'), hl = mk('i');"],
 ["v.style.cssText = 'position:absolute;top:0;bottom:0;", "vl.style.cssText = 'position:absolute;top:0;bottom:0;"],
 ["h.style.cssText = 'position:absolute;left:0;right:0;", "hl.style.cssText = 'position:absolute;left:0;right:0;"],
 ["box.appendChild(v); box.appendChild(h);", "box.appendChild(vl); box.appendChild(hl);"]].forEach(([a, b]) => {
  if (t.split(a).length - 1 !== 1) bad.push(a); else t = t.replace(a, () => b);
});
if (bad.length) { console.log('NOTHING WAS CHANGED. Not found once:\n  - ' + bad.join('\n  - ')); process.exit(1); }
fs.writeFileSync(f, crlf ? t.replace(/\n/g, '\r\n') : t);
console.log('Fixed. Now run:  npm test');