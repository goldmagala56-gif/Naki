'use strict';
// Naki: a "Cover" tile at the start of the picture row on the timeline, like CapCut. Tap it to choose the cover image.
// It sits in the empty space before the first clip, so it shows on phones (playhead-in-the-middle timeline). The computer layout has no
// room there and is unchanged; the Cover button on the project screen stays.
// Edits www/editor.js and www/index.html, adding only. All or nothing.   node tools/apply-cover-tile.js   then   npm test
const fs = require('fs'), path = require('path'), R = (p) => path.join(__dirname, '..', p);
const fail = (m) => { console.error('STOPPED, nothing changed: ' + m); process.exit(1); };
function load(p) { const raw = fs.readFileSync(R(p), 'utf8'); return { crlf: raw.indexOf('\r\n') >= 0, s: raw.replace(/\r\n/g, '\n') }; }
const E = load('www/editor.js'), H = load('www/index.html');
if (E.s.indexOf('function coverTile(') >= 0) { console.log('Already applied.'); process.exit(0); }
function rep(o, a, b, label) { const n = o.s.split(a).length - 1; if (n !== 1) fail('"' + label + '" found ' + n + ' times (needs 1)'); o.s = o.s.replace(a, () => b); }

rep(E, "      u.inner.appendChild(row);\n", "      if (tr.role === 'movie' && PAD >= 90 && E.hooks && E.hooks.onCover) row.appendChild(coverTile(tr));   // the Cover tile, in the empty space before the first clip\n      u.inner.appendChild(row);\n", 'row append');
rep(E, "function rowH(tr){", `function coverTile(tr){
  if (typeof document !== 'undefined' && !document.getElementById('ed-cover-css')){
    var cs = document.createElement('style'); cs.id = 'ed-cover-css';
    cs.textContent = '.ed .ed-cover{position:absolute;top:2px;width:60px;padding:0;border-radius:8px;border:1px solid rgba(255,255,255,.28);background:#2a3340;color:#fff;font-size:11px;font-weight:650;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;touch-action:manipulation}.ed .ed-cover svg{width:20px;height:20px}';
    document.head.appendChild(cs);
  }
  var b = mk('button', 'ed-cover'); b.type = 'button'; b.setAttribute('aria-label', 'Choose the cover picture');
  b.style.left = (tx(0) - 72) + 'px'; b.style.height = (rowH(tr) - 4) + 'px';
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg><span>Cover</span>';
  b.addEventListener('pointerdown', function (ev){ ev.stopPropagation(); });
  b.onclick = function (){ close(); E.hooks.onCover(); };
  return b;
}
function rowH(tr){`, 'rowH');
rep(H, "      onExport: function(){", "      onCover: function(){ var b = document.getElementById('bCover'); if (b) b.click(); },\n      onExport: function(){", 'editor hooks');

fs.writeFileSync(R('www/editor.js'), E.crlf ? E.s.replace(/\n/g, '\r\n') : E.s);
fs.writeFileSync(R('www/index.html'), H.crlf ? H.s.replace(/\n/g, '\r\n') : H.s);
fs.writeFileSync(R('tests/cover-tile.test.js'), `'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const rd = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8').replace(/\\r\\n/g, '\\n');
const ed = rd('editor.js'), html = rd('index.html');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
ok('the picture row has a Cover tile that opens the cover maker, only where there is room', () => {
  new vm.Script(ed, { filename: 'editor.js' });
  ['function coverTile(tr)', "tr.role === 'movie' && PAD >= 90 && E.hooks && E.hooks.onCover", 'E.hooks.onCover()', "'ed-cover'"].forEach(s => assert(ed.includes(s), s));
  assert(html.includes("onCover: function(){ var b = document.getElementById('bCover'); if (b) b.click(); }"));
});
console.log('\\n' + n + ' checks passed');
`);
console.log('editor.js and index.html updated, tests/cover-tile.test.js added. Now run: npm test');