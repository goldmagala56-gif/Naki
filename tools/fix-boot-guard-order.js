// Run from the project root:  node tools/fix-boot-guard-order.js
// app.test.js wants core.js to be the first script, so the repair guard now sits right after it.
const fs = require('fs'), path = require('path');
const f = path.join('www', 'index.html'), tf = path.join('tests', 'boot-guard.test.js');
let raw = fs.readFileSync(f, 'utf8'); const crlf = raw.includes('\r\n'); let s = raw.replace(/\r\n/g, '\n');
const core = '<script src="core.js"></script>\n';
const i = s.indexOf('Naki:boot-guard'); if (i < 0) { console.error('Guard not found.'); process.exit(1); }
const st = s.lastIndexOf('<script>', i), en = s.indexOf('</script>\n', i) + 10;
const block = s.slice(st, en);
if (s.indexOf(core) < st) { console.log('Already fixed.'); process.exit(0); }
{
  s = s.slice(0, st) + s.slice(en);
  if (s.split(core).length !== 2) { console.error('core.js line not found once.'); process.exit(1); }
  s = s.replace(core, () => core + block);
  fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s);
}
if (!s.includes('Naki:boot-guard')) { console.error('Something went wrong; not saved.'); process.exit(1); }
let t = fs.readFileSync(tf, 'utf8');
t = t.replace(/assert\(h\.indexOf\('<script>', i\)[^\n]*\n/, "assert(h.indexOf('src=\"core.js\"') < i && i < h.indexOf('src=\"reverse.js\"'), 'the guard sits right after core.js');\n");
fs.writeFileSync(tf, t);
console.log('Done. Now run: npm test');