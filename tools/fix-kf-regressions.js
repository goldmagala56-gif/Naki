'use strict';
// Fixes the four tests that broke after the text / sticker keyframes change:
//  1. www/project.js   a sticker's turn and size set through setAnimated are tidied again (whole degrees, -180..180, size 0.04-0.9), like setStickerProps does
//  2. tests/textfx.test.js   the editor source check now expects the title call as it is written today
//  3. tests/text-keyframes.test.js and tests/tracker.test.js   a text now also has size / turn / opacity keyframes, a sticker has size / turn
// All or nothing: if any anchor is missing, nothing is written.   Run from the project folder:  node tools/fix-kf-regressions.js   then  npm test
const fs = require('fs'), path = require('path');
const R = (p) => path.join(__dirname, '..', p);
const jobs = [];
function read(p) { const raw = fs.readFileSync(R(p), 'utf8'); return { raw, crlf: raw.indexOf('\r\n') >= 0, s: raw.replace(/\r\n/g, '\n') }; }
function plan(p, edit) { const f = read(p); const out = edit(f.s); if (out != null && out !== f.s) jobs.push({ p, text: f.crlf ? out.replace(/\n/g, '\r\n') : out }); }
const fail = (m) => { console.error('STOPPED, nothing changed: ' + m); process.exit(1); };

plan('www/project.js', (s) => {
  const a = "if (kind === 'overlay' || kind === 'sticker'){ c[prop] = v; return; }";
  if (s.indexOf('if (kind === \'sticker\'){ if (prop === \'rot\')') >= 0) return null;
  if (s.split(a).length - 1 !== 1) fail('project.js: setStaticProp line not found exactly once');
  return s.replace(a, "if (kind === 'sticker'){ if (prop === 'rot') v = ((Math.round(v) % 360) + 540) % 360 - 180; else if (prop === 'size') v = Math.max(0.04, Math.min(0.9, v)); c[prop] = v; return; }   // same tidy-up as setStickerProps\n  if (kind === 'overlay'){ c[prop] = v; return; }");
});
plan('tests/textfx.test.js', (s) => {
  const a = "'LK.drawTitle(g, Object.assign({}, c, { text: shown }), cw, ch)'", b = "'LK.drawTitle(g, Object.assign({}, c, { text: shown }, lk ? { rot: 0 } : {}), cw, ch)'";
  if (s.indexOf(b) >= 0) return null;
  if (s.split(a).length - 1 !== 1) fail('textfx.test.js: the expected-string line not found exactly once');
  return s.replace(a, b);
});
function stale(p, want) {
  plan(p, (s) => {
    const re = /\[\s*['"]x['"]\s*,\s*['"]y['"]\s*\]/, lines = s.split('\n'); let hit = 0;
    lines.forEach((l, i) => { if (/keyframeProps/.test(l) && re.test(l) && l.indexOf(want) < 0) { lines[i] = l.replace(re, want); hit++; } });
    if (!hit && !lines.some((l) => l.indexOf(want) >= 0)) fail(p + ': could not find the keyframeProps line (paste it to me)');
    return hit ? lines.join('\n') : null;
  });
}
stale('tests/text-keyframes.test.js', "['x', 'y', 'size', 'rot', 'opacity']");
stale('tests/tracker.test.js', "['x', 'y', 'size', 'rot']");

if (!jobs.length) { console.log('Already applied.'); process.exit(0); }
jobs.forEach((j) => { fs.writeFileSync(R(j.p), j.text); console.log('updated ' + j.p); });
console.log('Done. Now run: npm test');