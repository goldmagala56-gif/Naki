'use strict';
// node tools/apply-markers-fix.js   (from the project folder)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function load(rel) { const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o) { fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const problems = [], notes = [];
function rep(o, find, replace, label, optional) {
  const n = o.text.split(find).length - 1;
  if (n !== 1) { if (optional) { notes.push(label + ': skipped (found ' + n + ' times)'); return; } problems.push(label + ': found ' + n + ' times (need exactly 1) in ' + o.rel); return; }
  o.text = o.text.replace(find, () => replace);
}
const pr = load('www/project.js'), ed = load('www/editor.js');
if (pr.text.includes('q.markers')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// 1. markers are copied with the project, so no edit drops them
rep(pr, `format: p.format ? JSON.parse(JSON.stringify(p.format)) : undefined };`,
  `format: p.format ? JSON.parse(JSON.stringify(p.format)) : undefined,
    markers: p.markers ? JSON.parse(JSON.stringify(p.markers)) : undefined };`, 'project: cloneProject keeps markers');

// 2. cutting a part out: markers after it move earlier, markers inside it land on the cut
rep(pr, `var q = cloneProject(p), gap = b - a, rightLink = {};`,
  `var q = cloneProject(p), gap = b - a, rightLink = {};
  if (q.markers) q.markers.forEach(function (m){ if (m.t >= b) m.t -= gap; else if (m.t > a) m.t = a; });`, 'project: rippleDelete moves markers');

// 3. holding a picture: markers after it move later
rep(pr, `  if (p.levels && p.levels.length){
    var at = Math.min(p.levels.length`,
  `  if (q.markers) q.markers.forEach(function (m){ if (m.t >= t) m.t += dur; });
  if (p.levels && p.levels.length){
    var at = Math.min(p.levels.length`, 'project: insertFreeze moves markers');

// 4. the panel hint now tells the truth
rep(ed, `They stay put when you cut other parts out.`, `They move with the video when you cut a part out or hold a picture.`, 'editor: marker hint');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(pr); save(ed);
console.log('Done.' + (notes.length ? '\n  ' + notes.join('\n  ') : '') + '\nNow run:  npm test');