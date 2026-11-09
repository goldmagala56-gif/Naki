'use strict';
// One-time patch (after apply-touch2.js): more room, and a tidier play bar.
//   - the dock at the bottom has a height limit and scrolls inside itself, so long panels (Text to speech...) can always be reached
//   - preview and timeline share the leftover height instead of the timeline having a fixed height
//   - shorter timeline rows (main picture 45 px, other rows 32 px, thin rows 26 px; a little taller on touch screens)
//   - the precision-meter button leaves the play bar and becomes a small ruler icon in the corner above the row icons
//   - the time ruler (and that icon) stay pinned at the top while you scroll down through the rows
// Run from the project folder:   node tools/apply-touch3.js
// It checks that every spot it needs to change is found exactly once BEFORE writing anything, so it does everything or nothing.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

const FUNCS = `// ----- the ruler (and the meter icon above the row icons) stay in view while the rows scroll up and down -----
  var G_RULER = svg('<path d="M3 17L17 3l4 4L7 21z"/><path d="M7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l2 2"/>');
  function stickRuler(){
    var u = E.ui, y = u.tl ? u.tl.scrollTop : 0, t = y ? 'translateY(' + y + 'px)' : '';
    if (u.ruler) u.ruler.style.transform = t;
    var sp = u.labels && u.labels.firstChild; if (sp && sp.style) sp.style.transform = t;
  }
  `;

const SPACER = `u.labels.textContent = '';
    var sp = mk('div', 'ed-spacer'), mb = iconBtn('edBarMeter', G_RULER, E.meter ? 'Close precision meter' : 'Precision meter', 'ed-spacerbtn' + (E.meter ? ' on' : ''));
    mb.title = 'Precision meter';
    mb.addEventListener('pointerdown', function (ev){ ev.stopPropagation(); });
    mb.onclick = function (ev){ ev.stopPropagation(); if (E.meter) closeMeter(); else openMeter(); };
    sp.appendChild(mb); if (u.tl && u.tl.scrollTop) sp.style.transform = 'translateY(' + u.tl.scrollTop + 'px)';
    u.labels.appendChild(sp);`;

const CSS = `
/* more room: a dock that scrolls inside itself, the leftover height shared by preview and timeline, a pinned ruler, the meter icon in the corner */
.ed-dock{max-height:42vh;display:flex;flex-direction:column;min-height:0}
.ed-dock>*{flex:0 0 auto}
.ed-dock>.ed-panel{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
.ed-dock .ed-pbody{max-height:none!important;flex:1 1 auto;min-height:0;overflow-y:auto}
.ed.big .ed-dock{max-height:34vh}
.ed{grid-template-rows:auto minmax(110px,1.5fr) auto auto minmax(110px,1fr) auto}
@media (min-width:900px){
  .ed{grid-template-rows:auto minmax(140px,2fr) auto auto minmax(110px,1fr) auto}
  .ed-dock{max-height:36vh}
}
.ed-ruler{background:var(--panel);z-index:6}
.ed-head{z-index:7}
.ed-labels .ed-spacer{position:relative;z-index:6;background:var(--panel);height:26px}
.ed-spacerbtn{appearance:none;border:0;background:transparent;color:var(--dim);width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;touch-action:manipulation}
.ed-spacerbtn svg{width:19px;height:19px}
.ed-spacerbtn.on{background:var(--mango);color:#1d1300}
`;

const EDITS = {
  'www/editor.js': [
    { label: 'shorter rows (sizes)', find: "var s = tr.kind === 'video' ? 56 : (tr.kind === 'text' || tr.kind === 'sticker' || tr.kind === 'fx' || tr.kind === 'layout') ? 30 : 44;",
      replace: "var s = tr.kind === 'video' ? 45 : (tr.kind === 'text' || tr.kind === 'sticker' || tr.kind === 'fx' || tr.kind === 'layout') ? 26 : 32;" },
    { label: 'shorter rows (touch screens)', find: "return COARSE ? s + (s < 40 ? 10 : 4) : s;", replace: "return COARSE ? s + (s < 30 ? 6 : 3) : s;" },
    { label: 'the timeline box can be scrolled by code', find: "var tl = mk('div', 'ed-tl'); u.labels = mk('div', 'ed-labels');", replace: "var tl = mk('div', 'ed-tl'); u.tl = tl; u.labels = mk('div', 'ed-labels');" },
    { label: 'pin the ruler while scrolling', find: "u.scroll.addEventListener('contextmenu', function (ev){ ev.preventDefault(); });",
      replace: "u.scroll.addEventListener('contextmenu', function (ev){ ev.preventDefault(); });\n    u.tl.addEventListener('scroll', stickRuler);" },
    { label: 'pinning function and ruler icon', find: "function placeHead(){", replace: FUNCS + "function placeHead(){" },
    { label: 'pin the ruler after drawing', find: "placeHead(); renderLabels(); renderMix(); renderSelected(); updateButtons();", replace: "placeHead(); renderLabels(); renderMix(); renderSelected(); updateButtons(); stickRuler();" },
    { label: 'meter icon in the corner', find: "u.labels.textContent = ''; u.labels.appendChild(mk('div', 'ed-spacer'));", replace: SPACER },
    { label: 'meter button leaves the play bar (1)', find: "u.meterBtn = iconBtn('edBarMeter', G_METER, 'Precision meter'); u.meterBtn.onclick = function (){ if (E.meter) closeMeter(); else openMeter(); };", replace: "" },
    { label: 'meter button leaves the play bar (2)', find: "add(bar, u.play, u.meterBtn, u.time, u.scrub, u.kfBtn, u.undo, u.redo);", replace: "add(bar, u.play, u.time, u.scrub, u.kfBtn, u.undo, u.redo);" },
    { label: 'icon lights up when the meter opens', find: "renderDock(); drawGrid(); keepHeadInView();", replace: "renderDock(); renderLabels(); drawGrid(); keepHeadInView();" },
    { label: 'icon goes dark when the meter closes', find: "hideGrid(); renderDock();", replace: "hideGrid(); renderDock(); renderLabels();" }
  ]
};

function load(rel){ const f = path.join(root, rel); const raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o){ fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const files = {}, problems = [];
files['www/editor.js'] = load('www/editor.js');
const ed = files['www/editor.js'];
if (ed.text.indexOf('function stickRuler(') >= 0){ console.log('Already applied. Nothing to do.'); process.exit(0); }
if (ed.text.indexOf('function armTrim(') < 0){ console.log('Apply tools/apply-touch2.js first (function armTrim is missing).'); process.exit(1); }
EDITS['www/editor.js'].forEach(e => {
  const n = ed.text.split(e.find).length - 1;
  if (n !== 1){ problems.push(e.label + ': found ' + n + ' times (need exactly 1)'); return; }
  ed.text = ed.text.replace(e.find, () => e.replace);
});
const css = load('www/editor.css'); css.text = css.text.replace(/\s*$/, '\n') + CSS; files['www/editor.css'] = css;
if (problems.length){
  console.log('NOTHING WAS CHANGED. These spots did not match your files:\n  - ' + problems.join('\n  - '));
  console.log('\nSend me that list and I will adjust.');
  process.exit(1);
}
Object.keys(files).forEach(rel => save(files[rel]));
console.log('Done. Changed www/editor.js and www/editor.css. Reload the page (and close/reopen the app if it was installed) to see it.');