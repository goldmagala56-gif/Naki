'use strict';
// node tools/remove-my-tracker.js   (from the project folder)
// Takes my first motion tracker out of editor.js (the chips and the "Track motion" button in the overlay's Edit panel, and the trackOverlay code behind them),
// so only the Track motion panel that uses tracker.js is left. It finds the pieces by their words, not by exact spacing, and changes NOTHING if anything looks different from what it expects.
// To undo:  git checkout www/editor.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), f = path.join(root, 'www/editor.js');
const raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n'), lines = raw.replace(/\r\n/g, '\n').split('\n');
const idx = (re, from) => { for (let i = from || 0; i < lines.length; i++) if (re.test(lines[i])) return i; return -1; };
const count = re => lines.filter(l => re.test(l)).length;
if (count(/function trackOverlay\s*\(/) === 0) { console.log('My tracker is not in editor.js (no trackOverlay). Nothing to do.'); process.exit(0); }
const problems = [];

// 1. the four lines in the overlay panel: chips, button, hint -> the hint that was there before
const a = idx(/var tkOn\s*=\s*!!\(E\.tk/);
if (a < 0 || count(/var tkOn\s*=/) !== 1 || !/chips\(tareas/.test(lines[a + 1] || '') || !/edTrack/.test(lines[a + 2] || '') || !/Track motion: put the middle/.test(lines[a + 3] || '')) problems.push('the four Track motion lines in the overlay panel were not found as expected');

// 2. the block of code: from its comment (or from TRACK_AREAS) up to addOverlayFromFile
let s = idx(/var TRACK_AREAS\s*=/); const e = idx(/function addOverlayFromFile\s*\(/);
if (s > 0 && /^\s*\/\//.test(lines[s - 1]) && /tracking/i.test(lines[s - 1])) s--;
if (s < 0 || e < 0 || e <= s || e - s > 150) problems.push('the tracking code block was not found as expected');
else {
  const block = lines.slice(s, e).join('\n');
  if (!/function trackOverlay\s*\(/.test(block) || !/function trackWait\s*\(/.test(block)) problems.push('the tracking code block does not look like mine');
}
if (problems.length) { console.log('NOTHING WAS CHANGED:\n  - ' + problems.join('\n  - ') + '\nPaste me the lines around "trackOverlay" and I will adjust the script.'); process.exit(1); }

const HINT = "      body.appendChild(mk('div', 'ed-hint', 'Drag the overlay on the picture to move it. For movement, put a keyframe here, move the playhead, change the value, and it glides between them. An overlay has no sound.'));";
const out = lines.slice(0, a).concat([HINT], lines.slice(a + 4, s), lines.slice(e));
// nothing of mine may be left behind
const left = out.map((l, i) => [i + 1, l]).filter(p => /TRACK_AREAS|trackOverlay|trackWait|trackarea|E\.tk\b/.test(p[1]));
if (left.length) { console.log('NOTHING WAS CHANGED: these lines still use my tracker, so I did not cut:\n' + left.map(p => '  ' + p[0] + ': ' + p[1].trim().slice(0, 120)).join('\n')); process.exit(1); }
new (require('vm').Script)(out.join('\n'));
fs.writeFileSync(f, crlf ? out.join('\n').replace(/\n/g, '\r\n') : out.join('\n'));
for (const r of ['tests/motion-tracking.test.js', 'tools/apply-motion-tracking.js']) { try { fs.unlinkSync(path.join(root, r)); console.log('deleted ' + r); } catch (er) {} }
console.log('Done. My tracker is out of editor.js (' + (lines.length - out.length) + ' lines removed). Your tracker.js panel is untouched.\nNow run:  npm test');