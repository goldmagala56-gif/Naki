'use strict';
// Updates two old test lines that still say "a text only has x and y keyframes" (a text now also has size, turn and opacity;
// a sticker has size and turn too). Only the expected list on the keyframeProps line is changed.
const fs = require('fs'), path = require('path');
function fix(file, want) {
  const p = path.join(__dirname, '..', 'tests', file);
  if (!fs.existsSync(p)) { console.log(file + ': not found'); return; }
  const raw = fs.readFileSync(p, 'utf8'), nl = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n', lines = raw.split(nl);
  let hits = 0;
  const re = /(\[\s*['"]x['"]\s*,\s*['"]y['"]\s*\])/;
  lines.forEach(function (l, i) {
    if (/keyframeProps/.test(l) && re.test(l) && l.indexOf(want) < 0) { lines[i] = l.replace(re, want); hits++; console.log(file + ' line ' + (i + 1) + ' updated'); }
  });
  if (hits) fs.writeFileSync(p, lines.join(nl)); else console.log(file + ': nothing matched (already updated or the line reads differently)');
}
fix('text-keyframes.test.js', "['x', 'y', 'size', 'rot', 'opacity']");
fix('tracker.test.js', "['x', 'y', 'size', 'rot']");