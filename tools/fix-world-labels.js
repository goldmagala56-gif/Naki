'use strict';
// Renames two new frames whose names clashed with existing ones. Run from the project folder: node tools/fix-world-labels.js   then   npm test
const fs = require('fs'), path = require('path'), f = path.join(__dirname, '..', 'www', 'fx.js');
let s = fs.readFileSync(f, 'utf8');
const pairs = [["'x_vfilm', 'Film strip'", "'x_vfilm', 'Old film strip'"], ["'x_ogreek', 'Greek key'", "'x_ogreek', 'Greek meander'"]];
for (const [a] of pairs) if (s.split(a).length - 1 > 1) { console.log('NOTHING CHANGED: found more than once: ' + a); process.exit(1); }
let n = 0; for (const [a, b] of pairs) if (s.includes(a)) { s = s.replace(a, b); n++; }
fs.writeFileSync(f, s); console.log(n ? 'Done. Renamed ' + n + ' frame(s). Now run:  npm test' : 'Nothing to rename (already fixed).');