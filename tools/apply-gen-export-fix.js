'use strict';
// One-time patch: shapes, arrows, spotlights and frames are no longer left out of the exported video.
// They are drawn by code and have no file, but the export checked every overlay for its file, found none, and dropped them
// (with the message "An overlay file is missing, so it was left out") before either export engine could draw them.
// Put this file in the tools folder and run from the project folder:   node tools/apply-gen-export-fix.js
// It checks that every spot is found exactly once BEFORE writing anything, so it does everything or nothing.
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'www', 'index.html');
const raw = fs.readFileSync(file, 'utf8'), crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');
if (/return o\.gen \|\| ovFiles\[o\.asset\];/.test(text)) { console.log('Already applied. Nothing to do.'); process.exit(0); }

const problems = [];
function rep(re, to, label) {
  const g = new RegExp(re.source, 'g'), n = (text.match(g) || []).length;
  if (n !== 1) { problems.push(label + ': found ' + n + ' times (need exactly 1) in index.html'); return; }
  text = text.replace(re, () => to);
}
rep(/plan\.overlays\.some\(function\(o\)\{ return !ovFiles\[o\.asset\]; \}\)/, 'plan.overlays.some(function(o){ return !o.gen && !ovFiles[o.asset]; })', 'the check for a missing overlay file');
rep(/plan\.overlays\.filter\(function\(o\)\{ return ovFiles\[o\.asset\]; \}\)/, 'plan.overlays.filter(function(o){ return o.gen || ovFiles[o.asset]; })', 'the list of overlays that are kept');

if (problems.length) {
  console.log('NOTHING WAS CHANGED. These spots did not match your file:\n  - ' + problems.join('\n  - '));
  console.log('\nSend me that list and I will adjust.');
  process.exit(1);
}
fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
console.log('Done. Changed www/index.html (2 places).\nNow run:  npm test');