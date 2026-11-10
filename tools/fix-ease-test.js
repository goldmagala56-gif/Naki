'use strict';
// node tools/fix-ease-test.js   (from the project folder; safe to run again)
// After apply-curves.js: (1) a curve handle may go below 0 or above 1 (-0.6 .. 1.6) so Back / Bounce / Elastic can overshoot;
// (2) there are now 32 easing presets in groups (the first five are still linear, in, out, inout, hold). tests/ease.test.js still expects the old rules.
const fs = require('fs'), path = require('path'), f = path.join(__dirname, '..', 'tests', 'ease.test.js');
const raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n'), changed = [];
function swap(label, find, rep) { if (t.includes(find)) { t = t.replace(find, () => rep); changed.push(label); } }
swap('handle overshoot', '[1, 0, 0.5, 0.5]', '[1, -0.6, 0.5, 0.5]');
swap('handle message', 'kept inside the square, so a value never overshoots', 'a handle may go past the square (down to -0.6 and up to 1.6) so a move can overshoot, but not further');
swap('preset count', 'assert(A.EASES.length === 5)', "assert(A.EASES.length >= 5 && A.EASES.slice(0, 5).map(x => x.key).join() === 'linear,in,out,inout,hold')");
if (!changed.length) { console.log('Nothing left to change here. If npm test still fails on ease.test.js, send me the new error.'); process.exit(0); }
fs.writeFileSync(f, crlf ? t.replace(/\n/g, '\r\n') : t);
console.log('Fixed in tests/ease.test.js: ' + changed.join(', ') + '. Now run: npm test');