'use strict';
// One-time patch (after apply-touch2.js): Big preview + Full screen for the editor's picture.
//   - a button in the corner of the picture: Big preview. The timeline is tucked away and the picture takes the room (the play row and the dock stay,
//     so every tool, and the Track motion panel with its square, still work)
//   - a second button: Full screen (turns the phone sideways when the browser allows it)
//   - the Track motion panel gets a Big preview button too, so the square can be placed precisely on a large picture
// Run from the project folder:   node tools/apply-bigpreview.js
// It checks that every spot it needs to change is found exactly once BEFORE writing anything, so it does everything or nothing.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

const FUNCS = `// ----- big preview and full screen -----
  var G_EXPAND = svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'), G_SHRINK = svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'), G_LAND = svg('<rect x="2.5" y="7" width="19" height="10" rx="2"/><path d="M18.5 12h.01"/>');
  function updateBigBtns(){
    var u = E.ui, fs = typeof document !== 'undefined' && !!document.fullscreenElement;
    if (u.bigBtn){ u.bigBtn.innerHTML = E.big ? G_SHRINK : G_EXPAND; u.bigBtn.setAttribute('aria-label', E.big ? 'Small preview' : 'Big preview'); u.bigBtn.title = E.big ? 'Small preview' : 'Big preview'; }
    if (u.fullBtn){ u.fullBtn.classList.toggle('on', fs); u.fullBtn.setAttribute('aria-label', fs ? 'Leave full screen' : 'Full screen'); u.fullBtn.title = fs ? 'Leave full screen' : 'Full screen'; }
  }
  function setBig(on){
    E.big = !!on; if (E.root) E.root.classList.toggle('big', E.big); updateBigBtns();
    if (E.isOpen){ layoutTextLayer(); renderTexts(P.textsAt(E.proj, E.t)); }
    if (E.panel === 'track') renderDock();   // the Track motion button shows the right words
  }
  function unlockLandscape(){ try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {} }
  function exitBig(){
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) {}
    unlockLandscape(); E.big = false; if (E.root) E.root.classList.remove('big'); updateBigBtns();
  }
  function toggleFull(){
    var r = E.root;
    if (typeof document !== 'undefined' && document.fullscreenElement){ try { document.exitFullscreen(); } catch (e) {} return; }
    var go = r && (r.requestFullscreen || r.webkitRequestFullscreen);
    if (!go){ setBig(true); toast('Full screen is not available on this browser. The big preview is on instead.'); return; }
    setBig(true);
    var pr; try { pr = go.call(r); } catch (e) { pr = null; }
    Promise.resolve(pr).then(function (){
      try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function (){}); } catch (e) {}
      updateBigBtns();
    }, function (){ toast('Full screen was refused here. The big preview is on instead.'); });
  }
  `;

const CSS = `
/* big preview and full screen */
.ed-stagebtn{position:absolute;top:8px;right:8px;z-index:50;width:36px;height:36px;background:rgba(0,0,0,.55);color:#fff;opacity:.85}
.ed-stagebtn.b2{right:52px}
.ed-stagebtn.on{background:var(--mango);color:#1d1300}
.ed.big{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto auto 0 auto;grid-template-areas:"top" "stage" "bar" "note" "tl" "tools"}
.ed.big .ed-tl,.ed.big .ed-insp{display:none}
.ed.big .ed-pbody{max-height:30vh}
.ed.big:fullscreen .ed-top{display:none}
@media (orientation:landscape) and (max-height:520px){ .ed.big .ed-pbody{max-height:36vh} }
`;

const EDITS = {
  'www/editor.js': [
    { label: 'buttons on the picture', find: `u.stage.appendChild(u.croplayer);`,
      replace: `u.stage.appendChild(u.croplayer);
    u.bigBtn = iconBtn('edBig', G_EXPAND, 'Big preview', 'ed-ibtn ed-stagebtn b2'); u.fullBtn = iconBtn('edFull', G_LAND, 'Full screen', 'ed-ibtn ed-stagebtn');
    [u.bigBtn, u.fullBtn].forEach(function (b){ b.addEventListener('pointerdown', function (ev){ ev.stopPropagation(); }); u.stage.appendChild(b); });
    u.bigBtn.onclick = function (){ setBig(!E.big); }; u.fullBtn.onclick = toggleFull;` },
    { label: 'functions', find: `function renderSelectionOnly(){`, replace: FUNCS + `function renderSelectionOnly(){` },
    { label: 'full screen changes', find: `if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function (){ if (E.isOpen){ layoutTextLayer(); renderTexts(P.textsAt(E.proj, E.t)); } }).observe(u.stage);`,
      replace: `if (typeof document !== 'undefined') document.addEventListener('fullscreenchange', function (){ if (!document.fullscreenElement) unlockLandscape(); updateBigBtns(); });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function (){ if (E.isOpen){ layoutTextLayer(); renderTexts(P.textsAt(E.proj, E.t)); } }).observe(u.stage);` },
    { label: 'closing the editor leaves big preview', find: `if (TS) TS.release(); if (PS) PS.release();`, replace: `if (TS) TS.release(); if (PS) PS.release();\n    exitBig();` },
    { label: 'Track motion panel: Big preview button', find: `E.trkStatus = st; body.appendChild(st);`,
      replace: `E.trkStatus = st; body.appendChild(st);
    body.appendChild(actions([{ id: 'edTrackBig', label: E.big ? 'Small preview' : 'Big preview (place the square more precisely)', run: function (){ setBig(!E.big); } }]));` }
  ]
};

function load(rel){ const f = path.join(root, rel); const raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o){ fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const files = {}, problems = [];
files['www/editor.js'] = load('www/editor.js');
if (files['www/editor.js'].text.indexOf('function setBig(') >= 0){ console.log('Already applied. Nothing to do.'); process.exit(0); }
EDITS['www/editor.js'].forEach(e => {
  const o = files['www/editor.js'], n = o.text.split(e.find).length - 1;
  if (n !== 1){ problems.push(e.label + ': found ' + n + ' times (need exactly 1)'); return; }
  o.text = o.text.replace(e.find, () => e.replace);
});
const css = load('www/editor.css'); css.text = css.text.replace(/\s*$/, '\n') + CSS; files['www/editor.css'] = css;
if (problems.length){
  console.log('NOTHING WAS CHANGED. These spots did not match your files:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
Object.keys(files).forEach(rel => save(files[rel]));
console.log('Done. Changed www/editor.js and www/editor.css. Now run:  npm test');