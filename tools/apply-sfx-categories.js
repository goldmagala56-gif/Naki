'use strict';
// One-time patch: category buttons (All, Motion, Interface, Drums, Impact, Fun, Nature) above the sound effects in the editor, so 50 effects are easy to find.
// The categories come from the "cat" of each effect in www/sfx.js, so new effects and new categories show up by themselves.
// Run from the project folder:   node tools/apply-sfx-categories.js
// It checks that the spot it needs to change is found exactly once BEFORE writing anything, so it does everything or nothing.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const TEST = `'use strict';
// node tests/sfx-categories.test.js
// Every sound effect belongs to a category, and the editor shows category buttons above the effects.
const assert = require('assert'), fs = require('fs'), path = require('path');
const S = require('../www/sfx.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
ok('every effect has a unique key, a unique name and a category', () => {
  const keys = new Set(), labels = new Set();
  S.LIST.forEach(x => { assert(x.cat && typeof x.cat === 'string', x.key + ' has no category'); assert(!keys.has(x.key), 'duplicate key ' + x.key); assert(!labels.has(x.label), 'duplicate name ' + x.label); keys.add(x.key); labels.add(x.label); });
});
ok('there are several categories, each with at least two effects, so the buttons are worth having', () => {
  const by = {}; S.LIST.forEach(x => { by[x.cat] = (by[x.cat] || 0) + 1; });
  assert(Object.keys(by).length >= 2, 'categories: ' + Object.keys(by));
  Object.keys(by).forEach(c => assert(by[c] >= 2, c + ' has only ' + by[c]));
});
ok('the editor shows the category buttons', () => {
  const src = fs.readFileSync(path.join(__dirname, '../www/editor.js'), 'utf8');
  assert(src.includes("chipKey('sfxpick'") && src.includes("pickChip('sfxpick')"));
});
console.log('\\n' + n + ' checks passed');
`;
const OLD = "(NSFX ? NSFX.LIST : []).forEach(function (x){ var b = btn(null, x.label, 'ed-chip'); b.onclick = function (){ addSfxBuiltin(x.key); }; g.appendChild(b); });";
const NEW = "var cats = [{ key: 'all', label: 'All' }], seenCat = {};\n" +
  "      (NSFX ? NSFX.LIST : []).forEach(function (x){ var c = x.cat || 'Other'; if (!seenCat[c]){ seenCat[c] = 1; cats.push({ key: c, label: c }); } });\n" +
  "      var catNow = chipKey('sfxpick', cats, 'all');\n" +
  "      body.appendChild(chips(cats, catNow, pickChip('sfxpick')));\n" +
  "      (NSFX ? NSFX.LIST : []).forEach(function (x){ if (catNow !== 'all' && (x.cat || 'Other') !== catNow) return; var b = btn(null, x.label, 'ed-chip'); b.onclick = function (){ addSfxBuiltin(x.key); }; g.appendChild(b); });";

function load(rel){ const f = path.join(root, rel); const raw = fs.readFileSync(f, 'utf8'); return { f, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o){ fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const ed = load('www/editor.js'), pk = load('package.json'), sfx = fs.readFileSync(path.join(root, 'www', 'sfx.js'), 'utf8');
if (ed.text.includes("chipKey('sfxpick'")){ console.log('Already applied. Nothing to do.'); process.exit(0); }
const problems = [], n = ed.text.split(OLD).length - 1;
if (n !== 1) problems.push('sound effects panel: found ' + n + ' times (need exactly 1) in editor.js');
if (!/cat:\s*'/.test(sfx)) problems.push('www/sfx.js has no "cat" on its effects');
if (problems.length){ console.log('NOTHING WAS CHANGED. These spots did not match your files:\n  - ' + problems.join('\n  - ') + '\n\nSend me that list and I will adjust.'); process.exit(1); }
ed.text = ed.text.replace(OLD, () => NEW);
let note = '';
if (!pk.text.includes('sfx-categories.test.js')){
  if (/("test":\s*"[^"]*)"/.test(pk.text)) pk.text = pk.text.replace(/("test":\s*"[^"]*)"/, (m, g1) => g1 + ' && node tests/sfx-categories.test.js"');
  else note = '\nAdd  node tests/sfx-categories.test.js  to the "test" line in package.json yourself.';
}
save(ed); save(pk);
fs.writeFileSync(path.join(root, 'tests', 'sfx-categories.test.js'), TEST);
console.log('Done. Changed www/editor.js and package.json, added tests/sfx-categories.test.js.' + note + '\nNow run:  npm test');