// Temporary diagnostic. Run from the project root:  node tools/diag-render-loop.js        (adds guards)
//                                                   node tools/diag-render-loop.js undo   (removes them)
// Then run:  node tests/editor-dock.test.js   and paste the FIRST 25 lines of what it prints.
const fs = require('fs'), path = require('path');
const f = path.join('www', 'editor.js');
if (!fs.existsSync(f)) { console.error('Run from the Naki project root.'); process.exit(1); }
let raw = fs.readFileSync(f, 'utf8'); const crlf = raw.includes('\r\n'); let s = raw.replace(/\r\n/g, '\n');
const A = "  function renderTimeline(){\n    var p = E.proj, u = E.ui;\n";
const G1 = "    /*DIAG*/ var _n = Date.now(); if (!E._dg || _n - E._dg.t > 1000) E._dg = { t: _n, c: 0 }; if (++E._dg.c > 400) throw new Error('DIAG renderTimeline called ' + E._dg.c + ' times in 1s; ppm=' + E.ppm + ' PAD=' + PAD + ' dur=' + E.proj.durationMs + ' fixed=' + E.fixed);\n";
const B = "    for (var t = 0; t <= p.durationMs + step; t += step){\n";
const G2 = "      /*DIAG*/ if ((t / step) > 3000) throw new Error('DIAG ruler loop: step=' + step + ' ppm=' + E.ppm + ' dur=' + p.durationMs);\n";
if (process.argv[2] === 'undo') {
  s = s.split('\n').filter(l => !l.includes('/*DIAG*/')).join('\n');
  fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('Guards removed.'); process.exit(0);
}
if (s.includes('/*DIAG*/')) { console.log('Already added.'); process.exit(0); }
if (s.split(A).length !== 2 || s.split(B).length !== 2) { console.error('Anchors not found, nothing changed.'); process.exit(1); }
s = s.replace(A, () => A + G1).replace(B, () => B + G2);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('Guards added. Now run: node tests/editor-dock.test.js');