'use strict';
// One-time patch: the files behind sound effects, overlays and added videos are no longer thrown away when the editor closes.
// Before: closing the editor ran loadSfx / loadOverlays / loadVideos, which empty the list and then refill it slowly from saved storage.
// The editor's own Export button exports right after closing, so it found the lists empty and left those edits out.
// After: if it is the same session, the files already held in memory are kept (storage can still add to them).
// Put this file in the tools folder and run from the project folder:   node tools/apply-keep-files.js
// It checks that every spot is found exactly once BEFORE writing anything, so it does everything or nothing.
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'www', 'index.html');
const raw = fs.readFileSync(file, 'utf8'), crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');
if (text.includes('keepSfx')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

const problems = [];
const count = (re) => (text.match(new RegExp(re.source, 'g')) || []).length;
// [function name, the list on S, the storage table]
[['Sfx', 'sfx', 'sfx'], ['Overlays', 'overlays', 'overlays'], ['Videos', 'videos', 'videos']].forEach(([fn, key, table]) => {
  const head = new RegExp('function load' + fn + '\\(s\\)\\{');
  const tail = new RegExp("if \\(!DB\\.ok\\) return;(\\s*)DB\\.range\\('" + table + "', s\\.id\\)");
  const a = count(head), b = count(tail);
  if (a !== 1) problems.push('function load' + fn + ': found ' + a + ' times (need exactly 1)');
  if (b !== 1) problems.push("the line before DB.range('" + table + "'): found " + b + ' times (need exactly 1)');
  if (a !== 1 || b !== 1) return;
  const keep = 'keep' + fn, sid = 'S.' + key + 'Sid';
  text = text.replace(head, () => 'function load' + fn + '(s){\n  var ' + keep + ' = (' + sid + ' === s.id) ? S.' + key + ' : {}; ' + sid + ' = s.id;   // the same session: keep the files already held');
  text = text.replace(tail, (m, gap) =>
    'Object.keys(' + keep + ').forEach(function(k){ var o = ' + keep + '[k]; if (o && o.file) S.' + key + '[k] = Object.assign({}, o, { url: URL.createObjectURL(o.file) }); });\n  if (!DB.ok) return;' + gap + "DB.range('" + table + "', s.id)");
});

if (problems.length) {
  console.log('NOTHING WAS CHANGED. These spots did not match your file:\n  - ' + problems.join('\n  - '));
  console.log('\nSend me that list and I will adjust.');
  process.exit(1);
}
fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
console.log('Done. Changed www/index.html (3 places).\nNow run:  npm test');