'use strict';
// node tools/fix-stale-tests.js   (from the project folder)
// The photos feature made two lines in editor.js photo-aware (m became em, vc became photo ? null : vc). Two older tests still look for the old text.
// This changes only those two test lines, and only after checking that editor.js really has the new lines. To undo:  git checkout tests/colour.test.js tests/crop-editor.test.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), ed = fs.readFileSync(path.join(root, 'www/editor.js'), 'utf8');
const jobs = [
  { file: 'tests/colour.test.js', old: "'syncGrade(m, vc, css);'", neu: "'syncGrade(m, photo ? null : vc, css);'", need: 'syncGrade(m, photo ? null : vc, css);' },
  { file: 'tests/crop-editor.test.js', old: "'E.cropOn ? framePicture(null, m, null)'", neu: "'E.cropOn ? framePicture(null, em, null)'", need: 'E.cropOn ? framePicture(null, em, null)' }
];
let bad = 0;
jobs.forEach(j => {
  if (!ed.includes(j.need)) { console.log('NOT CHANGED ' + j.file + ': editor.js does not contain  ' + j.need + '  so the code itself would be missing it. Paste me the lines around syncMedia.'); bad++; return; }
  const f = path.join(root, j.file); let raw = fs.readFileSync(f, 'utf8');
  if (raw.includes(j.neu)) { console.log('already fixed: ' + j.file); return; }
  const n = raw.split(j.old).length - 1;
  if (n !== 1) { console.log('NOT CHANGED ' + j.file + ': found the old line ' + n + ' times (need exactly 1).'); bad++; return; }
  fs.writeFileSync(f, raw.replace(j.old, () => j.neu)); console.log('fixed ' + j.file);
});
console.log(bad ? '\nSomething was left alone, see above.' : '\nDone. Now run:  npm test');
process.exit(bad ? 1 : 0);