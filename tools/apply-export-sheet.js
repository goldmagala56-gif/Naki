'use strict';
// Naki: a simpler Export sheet, in the order CapCut users expect.
//   1. four big cards on top: Share (720p), Best quality (1080p), Sound only, GIF. One tap sets size, quality and type.
//   2. one line under them: size, resolution and how long it will take
//   3. every old choice (shape, resolution, quality, preset, frame rate, save as, logo) is still there, folded under "More options"
//   4. the progress line says plain things: Getting ready / Making your video / Mixing the sound / Saving
// Only www/index.html changes, and only by adding. Every old button keeps its id, so nothing else has to change.
// All or nothing.   node tools/apply-export-sheet.js   then   npm test
const fs = require('fs'), path = require('path'), file = path.join(__dirname, '..', 'www', 'index.html');
let raw = fs.readFileSync(file, 'utf8'); const CRLF = raw.indexOf('\r\n') >= 0; let h = raw.replace(/\r\n/g, '\n');
if (h.indexOf('id="exCards"') >= 0) { console.log('Already applied.'); process.exit(0); }
const fail = (m) => { console.error('STOPPED, nothing changed: ' + m); process.exit(1); };
function once(a, label) { const n = h.split(a).length - 1; if (n !== 1) fail('"' + label + '" found ' + n + ' times (needs 1)'); }
function rep(a, b, label) { once(a, label); h = h.replace(a, () => b); }

// 1. markup: cards + estimate on top, the old choices folded
const shapeStart = '  <div class="opt"><label>Shape <span>TikTok is tall</span></label>';
const logoEnd = '<button type="button" id="bClearLogo" class="btn" hidden>Remove logo</button></div></div>\n';
const estLine = '  <div class="est"><span data-ic="info" data-s="18"></span><span id="shEst"></span></div>\n';
once(shapeStart, 'Shape row'); once(logoEnd, 'Logo row end'); once(estLine, 'estimate line');
h = h.replace(estLine, '');
rep(shapeStart, `  <div id="exCards" class="excards" role="group" aria-label="Quick choices">
    <button type="button" data-card="share" aria-pressed="false"><b>Share</b><span>720p · quick</span></button>
    <button type="button" data-card="best" aria-pressed="false"><b>Best quality</b><span>1080p · sharper</span></button>
    <button type="button" data-card="sound" aria-pressed="false"><b>Sound only</b><span>M4A file</span></button>
    <button type="button" data-card="gif" aria-pressed="false"><b>GIF</b><span>short loop</span></button>
  </div>
` + estLine + `  <details id="exMore" class="exmore"><summary>More options <span class="dim small">shape, size, frame rate, logo</span></summary>
` + shapeStart, 'Shape row (again)');
rep(logoEnd, logoEnd + '  </details>\n', 'Logo row end (again)');

// 2. look
const css = `<style id="export-polish">
/* ---- Export sheet: four cards, one line of facts, the rest folded ---- */
.excards{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:4px 0 12px}
@media (min-width:560px){.excards{grid-template-columns:repeat(4,1fr)}}
.excards button{appearance:none;border:1px solid var(--line);background:var(--panel-2);color:var(--chalk);border-radius:14px;padding:12px 10px;min-height:64px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:3px;touch-action:manipulation;transition:border-color .12s,background .12s}
.excards button b{font-size:15px;font-weight:750}
.excards button span{font-size:12.5px;color:var(--dim)}
.excards button[aria-pressed="true"]{border-color:var(--mango);background:rgba(255,159,28,.12);box-shadow:inset 0 0 0 1px var(--mango)}
.excards button:active{transform:scale(.98)}
#exportSheet .est{margin:2px 0 12px;font-size:14px}
.exmore{margin:0 0 12px;border:1px solid var(--line);border-radius:14px;padding:0 12px}
.exmore>summary{cursor:pointer;list-style:none;min-height:46px;display:flex;align-items:center;gap:10px;font-weight:650}
.exmore>summary::-webkit-details-marker{display:none}
.exmore>summary::after{content:"\\203A";margin-left:auto;font-size:20px;color:var(--dim);transition:transform .15s}
.exmore[open]>summary::after{transform:rotate(90deg)}
.exmore[open]{padding-bottom:6px}
@media (prefers-reduced-motion:reduce){.excards button,.exmore>summary::after{transition:none}}
</style>
`;
const cssAnchor = '<style id="editor-polish">';
once(cssAnchor, 'editor-polish style'); h = h.replace(cssAnchor, () => css + cssAnchor);

// 3. estimate line with the time
rep(String.raw`$('shEst').innerHTML = 'About <b>' + mb + ' MB</b> \u00b7 ' + h0 + 'p \u00b7 ' + (S.exportQuality === 'sharper' ? 'higher quality' : 'recommended quality');`,
  String.raw`var secs = Math.max(5, Math.round(ms / 1000 * (typeof VideoEncoder !== 'undefined' ? 0.6 : 2.5))), took = secs < 90 ? secs + ' sec' : Math.round(secs / 60) + ' min';
    $('shEst').innerHTML = h0 + 'p \u00b7 about <b>' + mb + ' MB</b> \u00b7 about ' + took;`, 'estimate text');

// 4. cards behaviour + plain status words (inside the same block as the export options)
const hook = '  // what happens to the finished MP4: nothing for a video; a GIF or a sound-only file is made from it\n';
rep(hook, `  /* quick cards: they press the same buttons the folded options use, so nothing else has to know about them */
  function clickEl(sel){ var e = document.querySelector(sel); if (e) e.click(); }
  var CARDS = {
    share: function(){ clickEl('#segKind [data-kind="video"]'); clickEl('#segRes [data-res="720"]'); $('bQualityFaster').click(); },
    best: function(){ clickEl('#segKind [data-kind="video"]'); clickEl('#segRes [data-res="1080"]'); $('bQualitySharper').click(); },
    sound: function(){ clickEl('#segKind [data-kind="audio"]'); },
    gif: function(){ clickEl('#segKind [data-kind="gif"]'); }
  };
  function cardsSync(){
    var k = S.exportKind, sharper = S.exportQuality === 'sharper';
    var on = k === 'audio' ? 'sound' : k === 'gif' ? 'gif' : (S.exportRes === '1080' && sharper) ? 'best' : (S.exportRes === '720' && !sharper) ? 'share' : '';
    [].forEach.call(document.querySelectorAll('#exCards button'), function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-card') === on)); });
  }
  [].forEach.call(document.querySelectorAll('#exCards button'), function(b){
    b.addEventListener('click', function(){ var f = CARDS[b.getAttribute('data-card')]; if (f) f(); setTimeout(function(){ est(); kindNote(); cardsSync(); }, 0); });
  });
  $('exportSheet').addEventListener('click', function(){ setTimeout(cardsSync, 0); });
  new MutationObserver(function(){ if (!$('exportSheet').hidden){ est(); cardsSync(); } }).observe($('exportSheet'), { attributes: true, attributeFilter: ['hidden'] });
  // the progress line in plain words (the engines' own wording stays in the console)
  window.friendlyStatus = function(t){
    t = String(t || '');
    if (/^done/i.test(t) || /cancel|wrong|error|could not|offline/i.test(t)) return t;
    if (/mix|sound|audio|voice/i.test(t)) return 'Mixing the sound...';
    if (/finish|final|sav|join|writ/i.test(t)) return 'Saving...';
    if (/start|load|read|download|prepar|engine|logo/i.test(t)) return 'Getting ready...';
    return 'Making your video...';
  };
` + hook, 'export options hook');
const st = "onStatus: function(t){ statusEl.textContent = t; }";
const n = h.split(st).length - 1; if (n !== 2) fail('status handler found ' + n + ' times (needs 2)');
h = h.split(st).join("onStatus: function(t){ statusEl.textContent = window.friendlyStatus ? window.friendlyStatus(t) : t; }");

fs.writeFileSync(file, CRLF ? h.replace(/\n/g, '\r\n') : h);
console.log('index.html updated: Export sheet has quick cards, one facts line and a "More options" fold. Now run: npm test');