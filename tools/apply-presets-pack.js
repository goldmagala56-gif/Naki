'use strict';
// One-time patch: 12 new colour looks in the filter list (Golden, Teal, Noir, Sepia, Dream, Pop, Moody, Sunset, Frost, Film, Matte, Drama).
// They use only the six colour controls the Adjust panel already has, so they work in the preview and in both export engines.
// Put this file in the tools folder and run from the project folder:   node tools/apply-presets-pack.js
// It checks that the spot is found exactly once BEFORE writing anything, so it does everything or nothing.
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'www', 'presets.js');
const raw = fs.readFileSync(file, 'utf8'), crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');
if (text.includes("key: 'golden'")) { console.log('Already applied. Nothing to do.'); process.exit(0); }

const NEW = [
  "{ key: 'golden', label: 'Golden', v: { brightness: 1.05, contrast: 1.1, saturate: 1.2, warmth: 0.45, vignette: 0.2 } }",
  "{ key: 'teal', label: 'Teal', v: { brightness: 0.95, contrast: 1.25, saturate: 1.1, warmth: -0.2, vignette: 0.35 } }",
  "{ key: 'noir', label: 'Noir', v: { brightness: 0.95, contrast: 1.3, saturate: 0, vignette: 0.45 } }",
  "{ key: 'sepia', label: 'Sepia', v: { contrast: 1.05, saturate: 0.5, warmth: 0.45, matte: 0.2 } }",
  "{ key: 'dream', label: 'Dream', v: { brightness: 1.08, contrast: 0.9, saturate: 1.15, warmth: 0.15, matte: 0.25 } }",
  "{ key: 'pop', label: 'Pop', v: { brightness: 1.05, contrast: 1.2, saturate: 1.35 } }",
  "{ key: 'moody', label: 'Moody', v: { brightness: 0.88, contrast: 1.2, saturate: 0.8, warmth: -0.15, vignette: 0.45 } }",
  "{ key: 'sunset', label: 'Sunset', v: { contrast: 1.12, saturate: 1.25, warmth: 0.45, vignette: 0.3 } }",
  "{ key: 'frost', label: 'Frost', v: { brightness: 1.05, contrast: 1.05, saturate: 0.75, warmth: -0.4, matte: 0.2 } }",
  "{ key: 'film', label: 'Film', v: { contrast: 1.1, saturate: 0.9, warmth: 0.2, vignette: 0.3, matte: 0.2 } }",
  "{ key: 'matte', label: 'Matte', v: { contrast: 0.92, saturate: 0.9, matte: 0.4 } }",
  "{ key: 'drama', label: 'Drama', v: { brightness: 0.92, contrast: 1.3, saturate: 1.1, vignette: 0.45 } }"
];
const re = /(\{ key: 'night',[^\n]*\})[ \t]*\n([ \t]*)\];/g;
const n = (text.match(re) || []).length;
if (n !== 1) {
  console.log('NOTHING WAS CHANGED. The last look ("night") was found ' + n + ' times (need exactly 1) in presets.js.\nSend me that and I will adjust.');
  process.exit(1);
}
text = text.replace(re, (m, last, ind) => last + ',\n    ' + NEW.join(',\n    ') + '\n' + ind + '];');
fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
console.log('Done. Added 12 looks to www/presets.js.\nNow run:  npm test');