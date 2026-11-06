'use strict';
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', 'www', 'export-engine.js'), raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const bad = "} else jobs.push({ label: 'picture ' + (i + 1), produces: vfile, cleanup: rv.chunks,";
if (t.split(bad).length - 1 !== 1) { console.log('Did not find the wrong line. Send me the lines around "picture " + (i + 1) in export-engine.js.'); process.exit(1); }
t = t.replace(bad, () => "} else jobs.push({ label: 'picture ' + (i + 1), produces: vfile,");
if (!t.includes('cleanup: rv.chunks')) {   // the reverse picture job should carry it instead
  const good = "produces: vfile, files: rv.files,";
  if (t.split(good).length - 1 === 1) t = t.replace(good, () => "produces: vfile, files: rv.files, cleanup: rv.chunks,");
  else console.log('Note: could not add cleanup to the reverse job by itself. It is optional.');
}
fs.writeFileSync(f, crlf ? t.replace(/\n/g, '\r\n') : t);
console.log('Fixed. Now run:  npm test');