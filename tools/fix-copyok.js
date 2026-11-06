'use strict';
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', 'www', 'export-engine.js'), raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const problems = [];
function rep(find, replace, label) {
  const n = t.split(find).length - 1;
  if (n !== 1) { problems.push(label + ': found ' + n + ' times (need exactly 1)'); return; }
  t = t.replace(find, () => replace);
}
// 1. take the copy line out of wherever it landed
const re = /^[ \t]*if \(copyOk\) return sourceArgs\.concat\(\[[^\n]*\n/m;
if (!re.test(t)) problems.push('the "if (copyOk) return" line was not found');
else t = t.replace(re, '');
// 2. the parameter
rep('function pictureArgs(sourceArgs, fitChain, nFrames, vfile, sp, spanSec, speed, tpadSec, padStart) {',
    'function pictureArgs(sourceArgs, fitChain, nFrames, vfile, sp, spanSec, speed, tpadSec, padStart, copyOk) {', 'pictureArgs signature');
// 3. put the line back, inside the plain-clip branch only
rep('// a plain clip: exactly the chain the earlier versions used\n',
    "// a plain clip: exactly the chain the earlier versions used\n      if (copyOk) return sourceArgs.concat(['-an', '-c:v', 'copy', '-frames:v', String(nFrames), '-f', 'mpegts', '-muxdelay', '0', '-muxpreload', '0', vfile]);   // reversed pieces are already encoded: just join them\n", 'plain-clip branch');
// 4. the reverse job asks for it (only when the clip does not start at the very beginning of the movie, where the last piece can be a frame short)
rep("args: pictureArgs(rv.sourceArgs, 'null', nFrames, vfile, sp, spanSec, 1, 1) });",
    "args: pictureArgs(rv.sourceArgs, 'null', nFrames, vfile, sp, spanSec, 1, 1, 0, sp.movieStart >= 100) });", 'reverse job');
if (problems.length) { console.log('NOTHING WAS CHANGED:\n  - ' + problems.join('\n  - ') + '\nSend me the lines around "function pictureArgs" and "reversePicture" in export-engine.js.'); process.exit(1); }
fs.writeFileSync(f, crlf ? t.replace(/\n/g, '\r\n') : t);
console.log('Fixed. Now run:  npm test');