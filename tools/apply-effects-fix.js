'use strict';
// One-time fix after the effects library patch: the old six effects (Shake, Glitch, Blur, Flash, RGB split, Film grain) go back to being exported by the
// original effects code, so tests/look2.test.js (which checks the exact ffmpeg filters of those six) passes again. The 59 new effects use the new library.
// Film grain keeps its old default length (2 seconds). Run from the project folder:   node tools/apply-effects-fix.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const EDITS = {
  'www/fx.js': [
    { label: 'fx: which effects are the old six', find: 'return { CATS: CATS, LIST: LIST, KEYS: KEYS, has: has,', replace: "return { legacy: function (k) { return ['shake', 'glitch', 'blur', 'flash', 'rgbsplit', 'grain'].indexOf(k) >= 0; }, CATS: CATS, LIST: LIST, KEYS: KEYS, has: has," },
    { label: 'fx: Film grain keeps its old length', find: "def('grain', 'retro', 'Film grain', { dur: 3000,", replace: "def('grain', 'retro', 'Film grain', { dur: 2000," }
  ],
  'www/export-engine.js': [
    { label: 'ffmpeg: the old six use the old effects code', find: '_FX && _FX.vfx && _FX.vfx.has(x.fx) ? _FX.vfx.graph(x, a0, b0, cur, out, width, height)', replace: '_FX && _FX.vfx && _FX.vfx.has(x.fx) && !_FX.vfx.legacy(x.fx) ? _FX.vfx.graph(x, a0, b0, cur, out, width, height)' }
  ],
  'tests/vfx.test.js': [
    { label: 'test: the old six keep the old export', find: '// ---- real ffmpeg, only when this computer has a recent one ----',
      replace: "ok('ffmpeg engine: the six effects that existed before are still made by the original effects code, the new ones by the library', () => {\n  const g = gOf(E.planToJobs(planFx([{ startMs: 500, durMs: 1500, fx: 'blur', strength: 0.5 }, { startMs: 500, durMs: 1500, fx: 'pixel', strength: 0.5 }]), info0, { height: 360 }));\n  assert(g.includes('flags=neighbor') && g.includes('xv2_'), g); assert(!g.includes('xv1_'), 'the first (blur) is not made by the library: ' + g);\n});\n// ---- real ffmpeg, only when this computer has a recent one ----" }
  ]
};
const problems = [], files = {};
Object.keys(EDITS).forEach(rel => {
  const f = path.join(root, rel); if (!fs.existsSync(f)){ problems.push(rel + ' does not exist'); return; }
  const raw = fs.readFileSync(f, 'utf8'), o = files[rel] = { f, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') };
  EDITS[rel].forEach(e => {
    if (o.text.includes(e.replace) && !e.find.includes(e.replace)) return;
    const n = o.text.split(e.find).length - 1;
    if (n !== 1){ problems.push(e.label + ': found ' + n + ' times (need exactly 1) in ' + path.basename(rel)); return; }
    o.text = o.text.replace(e.find, () => e.replace);
  });
});
if (problems.length){ console.log('NOTHING WAS CHANGED. These spots did not match your files:\n  - ' + problems.join('\n  - ') + '\n\nSend me that list and I will adjust.'); process.exit(1); }
Object.keys(files).forEach(rel => { const o = files[rel]; fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); });
console.log('Done. Changed ' + Object.keys(files).length + ' files.\nNow run:  npm test');