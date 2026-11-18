// Run from the project root: node tools/fix-fast-fx-test.js
const fs = require('fs'), f = 'tests/fast-fx.test.js';
let s = fs.readFileSync(f, 'utf8');
const a = "const W = require('../www/webcodecs-export.js');";
if (!s.includes(a)) { console.log('Nothing to change.'); process.exit(0); }
fs.writeFileSync(f, s.replace(a, "const W = require('../www/webcodecs-export.js').WebCodecsExport;"));
console.log('Fixed. Now run: npm test');