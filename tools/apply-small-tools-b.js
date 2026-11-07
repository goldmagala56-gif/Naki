'use strict';
// node tools/apply-small-tools-b.js   (from the project folder)
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
if (!fs.existsSync(path.join(root, 'www', 'scopes.js'))) { console.log('NOTHING WAS CHANGED. Put scopes.js in the www folder first.'); process.exit(1); }
const ed = load('www/editor.js'), css = load('www/editor.css'), html = load('www/index.html');
if (ed.text.includes('function startEyedrop')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

rep(ed, `{ id: 'edAdjust', label: 'Adjust', icon: G.adjust, run: P2('adjust') },`, `{ id: 'edAdjust', label: 'Adjust', icon: G.adjust, run: P2('adjust') },\n        { id: 'edScopes', label: 'Scopes', icon: G.scopes, run: P2('scopes') },`, 'editor: Scopes in the Edit row');
rep(ed, `syncTransition(m, s, vc);`, `syncTransition(m, s, vc); syncScopes();`, 'editor: scopes follow the playhead');
rep(ed, `syncPicker(); syncCrop();`, `syncPicker(); syncCrop(); addEyedroppers();`, 'editor: eyedropper buttons next to every colour box');
rep(ed, `E.xOn = false; try { E.ui.xvid.pause();`, `try { stopEyedrop(); } catch (e) {}\n    E.xOn = false; try { E.ui.xvid.pause();`, 'editor: stop the eyedropper when closing');

const BLOCK = `/* ---------- scopes and the eyedropper ---------- */
  var NSC = (typeof module !== 'undefined' && module.exports) ? require('./scopes.js') : (typeof window !== 'undefined' ? window.NakiScopes : null);
  G.scopes = svg('<path d="M3 20h18M5 20V12M9 20V6M13 20V10M17 20V4"/>');
  // The frame at the playhead, with the colour look, as a small picture; the scope is worked out from it.
  function drawScopesNow(){
    var m = E.hooks && E.hooks.movie, cv = E.scopeCv; if (!NSC || !m || !cv || !m.videoWidth || m.readyState < 2) return;
    var sc = E.scopeSrc || (E.scopeSrc = document.createElement('canvas')); sc.width = 160; sc.height = Math.max(2, Math.round(160 * m.videoHeight / m.videoWidth));
    var g = sc.getContext('2d', { willReadFrequently: true });
    try { g.filter = String(E.lastFilter || 'none').replace(/url\\([^)]*\\)\\s*/g, '').trim() || 'none'; } catch (e) {}
    g.drawImage(m, 0, 0, sc.width, sc.height); try { g.filter = 'none'; } catch (e) {}
    var px; try { px = g.getImageData(0, 0, sc.width, sc.height); } catch (e) { return; }
    var a = NSC.analyze(px.data, sc.width, sc.height), type = E.chip.scopes || 'hist', c = cv.getContext('2d');
    if (type === 'hist') NSC.drawHistogram(c, a, cv.width, cv.height); else NSC.drawWaveform(c, a, cv.width, cv.height, type === 'parade' ? 'parade' : 'luma');
  }
  function syncScopes(){
    if (E.panel !== 'scopes' || !E.scopeCv || !E.scopeCv.parentNode) return;
    var now = performance.now(); if (now - (E.scopeAt || 0) < 120) return; E.scopeAt = now;
    drawScopesNow();
  }
  PANELS.scopes = { title: 'Scopes', build: function (body){
    if (!NSC){ body.appendChild(mk('div', 'ed-hint', 'Scopes are not loaded. Add <script src="scopes.js"></script> to index.html, before editor.js.')); return; }
    var types = [{ key: 'hist', label: 'Histogram' }, { key: 'wave', label: 'Waveform' }, { key: 'parade', label: 'RGB parade' }], cur = chipKey('scopes', types, 'hist');
    body.appendChild(chips(types, cur, pickChip('scopes')));
    var cv = mk('canvas', 'ed-scopecv'); cv.width = 320; cv.height = 140; E.scopeCv = cv; E.scopeAt = 0; body.appendChild(cv);
    body.appendChild(mk('div', 'ed-hint', cur === 'hist' ? 'How much of the picture sits at each level, dark on the left, bright on the right. A pile against the left edge means crushed shadows; against the right, blown highlights.'
      : cur === 'wave' ? 'Left to right is the picture left to right; up is brighter. Keep the bright parts under the top and the dark parts above the bottom.' : 'Red, green and blue shown side by side. If one is higher than the others, the picture leans that colour.'));
    drawScopesNow();
  } };
  // ----- eyedropper: a small dropper next to every colour box -----
  function eyeFrame(g, W, H){
    var m = E.hooks.movie, s = P.sourceAt(E.proj, E.t), vc = s.video && s.video.clip;
    if (typeof previewFrame === 'function' && vc){ previewFrame(g, m, vc, W, H); return; }
    g.fillStyle = '#111b24'; g.fillRect(0, 0, W, H); if (m.videoWidth && m.readyState >= 2) g.drawImage(m, 0, 0, W, H);
  }
  function stopEyedrop(){ E.eye = null; if (E.ui.eyelayer) E.ui.eyelayer.style.display = 'none'; if (E.ui.eyering) E.ui.eyering.style.display = 'none'; }
  function startEyedrop(inp){
    if (E.eye){ stopEyedrop(); return; }
    var done = function (hex){ if (!hex) return; inp.value = hex; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); };
    if (typeof window !== 'undefined' && window.EyeDropper){   // desktop Chrome has its own
      try { new window.EyeDropper().open().then(function (r){ done(r.sRGBHex); }, function (){}); return; } catch (e) {}
    }
    var u = E.ui, lay = u.eyelayer;
    if (!lay){
      lay = u.eyelayer = mk('div', 'ed-eyelayer'); u.eyering = mk('div', 'ed-eyering'); lay.appendChild(u.eyering); u.stage.appendChild(lay);
      lay.addEventListener('pointerdown', function (ev){ if (!E.eye) return; ev.preventDefault(); try { lay.setPointerCapture(ev.pointerId); } catch (e) {} E.eye.drag = true; eyeAt(ev); });
      lay.addEventListener('pointermove', function (ev){ if (E.eye && E.eye.drag) eyeAt(ev); });
      lay.addEventListener('pointerup', function (ev){ if (!E.eye) return; var hx = eyeAt(ev), d = E.eye.done; stopEyedrop(); if (hx) d(hx); });
      lay.addEventListener('pointercancel', stopEyedrop);
    }
    E.eye = { done: done, drag: false }; lay.style.display = 'block';
    toast('Drag over the picture and let go to pick a colour. Tap the dropper again to cancel.', 5000);
  }
  // The colour of the picture under the pointer (average of a small square) as #rrggbb; moves the ring and fills it with that colour.
  function eyeAt(ev){
    var u = E.ui, r = u.picframe.getBoundingClientRect(), sr = u.stage.getBoundingClientRect(), W = Math.max(2, Math.round(r.width)), H = Math.max(2, Math.round(r.height));
    var fx = (ev.clientX - r.left) / (r.width || 1), fy = (ev.clientY - r.top) / (r.height || 1);
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1){ u.eyering.style.display = 'none'; return null; }
    var cv = E.eyeCv || (E.eyeCv = document.createElement('canvas')); cv.width = W; cv.height = H;
    var g = cv.getContext('2d', { willReadFrequently: true }); eyeFrame(g, W, H);
    var x = clamp(Math.round(fx * W) - 1, 0, W - 3), y = clamp(Math.round(fy * H) - 1, 0, H - 3), d;
    try { d = g.getImageData(x, y, 3, 3).data; } catch (e) { return null; }
    var rr = 0, gg = 0, bb = 0, k, hx = function (v){ var t = Math.round(v / 9).toString(16); return t.length < 2 ? '0' + t : t; };
    for (k = 0; k < d.length; k += 4){ rr += d[k]; gg += d[k + 1]; bb += d[k + 2]; }
    var col = '#' + hx(rr) + hx(gg) + hx(bb);
    u.eyering.style.display = 'block'; u.eyering.style.left = (ev.clientX - sr.left) + 'px'; u.eyering.style.top = (ev.clientY - sr.top) + 'px'; u.eyering.style.background = col;
    return col;
  }
  function addEyedroppers(){
    if (!E.ui.dock) return;
    var list = E.ui.dock.querySelectorAll('input[type=color]');
    for (var i = 0; i < list.length; i++){
      var inp = list[i]; if (inp._eye) continue; inp._eye = true;
      var b = btn(null, null, 'ed-ibtn ed-eyebtn', 'Pick a colour from the picture'); b.innerHTML = G.pick;
      b.onclick = (function (x){ return function (){ startEyedrop(x); }; })(inp);
      inp.parentNode.insertBefore(b, inp.nextSibling);
    }
  }

  /* ---------- titles drawn over the preview ---------- */`;
rep(ed, `/* ---------- titles drawn over the preview ---------- */`, BLOCK, 'editor: scopes and eyedropper');

if (!css.text.includes('.ed-scopecv')) {
  css.text = css.text.replace(/\s*$/, '\n') + `
/* scopes and the eyedropper */
.ed-scopecv{width:100%;max-width:420px;height:auto;display:block;background:#0f1820;border:1px solid var(--line);border-radius:10px}
.ed-eyebtn{width:34px;height:34px}
.ed-stage .ed-eyelayer{position:absolute;inset:0;z-index:40;display:none;cursor:crosshair;touch-action:none}
.ed-stage .ed-eyering{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #111b24,0 2px 10px rgba(0,0,0,.6);display:none;pointer-events:none}
`;
}
rep(html, `<script src="editor.js"></script>`, `<script src="scopes.js"></script>\n<script src="editor.js"></script>`, 'index.html: load scopes.js');
rep(html, `'look.js': 'fonts', `, `'look.js': 'fonts', 'scopes.js': 'scopes', `, 'index.html: version check', true);

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[ed, css, html].forEach(save);
console.log('Done.' + (notes.length ? '\n  ' + notes.join('\n  ') : '') + '\nAlso add scopes.js to the file list in sw.js so it works offline.\nNow run:  node tests/small-tools-b.test.js   and then   npm test');