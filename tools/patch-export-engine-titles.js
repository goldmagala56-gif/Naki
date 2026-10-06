'use strict';
// Makes the ffmpeg export engine draw titles and captions with the shared drawing in look.js (fonts, outline, shadow).
// Run once from the project folder:   node tools/patch-export-engine-titles.js
// It writes export-engine.js.bak first, and stops without touching anything if a place is not found. Titles drawn the old way stay identical.
const fs = require('fs'), file = process.argv[2] || 'www/export-engine.js', orig = fs.readFileSync(file, 'utf8');
if (orig.includes('_LK.drawTitle')) { console.log('export-engine.js already draws titles with look.js. Nothing to do.'); process.exit(0); }
let s = orig;
function rep(old, neu) {
  if (s.split(old).length !== 2) { console.error('STOPPED: could not find this exactly once in ' + file + ':\n  ' + old.slice(0, 90) + '\nNothing was changed.'); process.exit(1); }
  s = s.replace(old, () => neu);
}
// the shared drawing is used when look.js is loaded; the old drawing stays below it as a fallback
rep('function drawTitle(g, t, W, H) {\n', 'function drawTitle(g, t, W, H) {\n  if (typeof _LK !== \'undefined\' && _LK && _LK.drawTitle) return _LK.drawTitle(g, t, W, H);   // fonts, outline, shadow: one drawing for everything\n');
// make sure _LK exists (an earlier step of this project adds it; add it here if it is missing)
if (!/var _LK\s*=/.test(s)) s = s.replace("'use strict';\n", "'use strict';\nvar _LK = ((typeof module !== 'undefined' && module.exports) ? require('./look.js') : window.NakiLook) || { ffmpegExtras: function () { return []; } };\n");
fs.writeFileSync(file + '.bak', orig); fs.writeFileSync(file, s);
console.log('Titles in ' + file + ' now use look.js (the old file is kept as ' + file + '.bak).');
