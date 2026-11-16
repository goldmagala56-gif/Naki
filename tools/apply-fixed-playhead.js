'use strict';
// Naki timeline, CapCut style on the phone: the playhead stays in the middle and YOU scroll the timeline underneath it.
//   - phone / touch screens (narrow, coarse pointer): on by default
//   - computer: unchanged, the playhead moves along the timeline. A small button in the top bar (arrows) switches either way and is remembered.
//   - everything stays: tapping a clip, long-press trim / move, pinch zoom, markers, keyframes, the scrub bar, undo, all of it.
// Only www/editor.js is edited (plus a new test). All or nothing.   node tools/apply-fixed-playhead.js   then   npm test
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'www', 'editor.js');
const raw = fs.readFileSync(file, 'utf8'), CRLF = raw.indexOf('\r\n') >= 0; let s = raw.replace(/\r\n/g, '\n');
if (s.indexOf('E.fixedPref') >= 0) { console.log('Already applied.'); process.exit(0); }
const fail = (m) => { console.error('STOPPED, nothing changed: ' + m); process.exit(1); };
function rep(a, b, label) { const n = s.split(a).length - 1; if (n !== 1) fail('"' + label + '" found ' + n + ' times (needs 1)'); s = s.replace(a, () => b); }

// 1. the button in the top bar
rep("add(top, u.close, mk('div', 'ed-title', 'Edit video'), u.saved, u.zout, u.zin, u.fit, u.exportBtn);",
  "u.tlMode = btn('edTlMode', '⇆', 'ed-btn ed-sq', 'Timeline style: playhead in the middle, or moving');\n    add(top, u.close, mk('div', 'ed-title', 'Edit video'), u.saved, u.zout, u.zin, u.fit, u.tlMode, u.exportBtn);", 'top bar');

// 2. helpers + listeners, placed right after the existing ruler listener
rep("u.tl.addEventListener('scroll', stickRuler);", `u.tl.addEventListener('scroll', stickRuler);
    // ----- playhead in the middle (phone): the timeline scrolls, the time follows -----
    if (typeof document !== 'undefined' && !document.getElementById('ed-fixed-css')){
      var fcss = document.createElement('style'); fcss.id = 'ed-fixed-css';
      fcss.textContent = '.ed .ed-tl{position:relative}.ed .ed-fhead{position:absolute;top:0;bottom:0;width:2px;background:#fff;box-shadow:0 0 8px rgba(255,255,255,.45);pointer-events:none;z-index:7;display:none}.ed .ed-fhead::before{content:"";position:absolute;top:0;left:-4px;width:10px;height:10px;border-radius:50%;background:#fff}#edTlMode.on{background:var(--mango);color:var(--on-accent);border-color:transparent}';
      document.head.appendChild(fcss);
    }
    u.fhead = mk('div', 'ed-fhead'); u.tl.appendChild(u.fhead);
    var us = { down: false, last: 0 }; E.us = us;
    u.scroll.addEventListener('touchstart', function (){ if (!E.fixed) return; us.down = true; us.last = Date.now(); if (E.playing) pause(); }, { passive: true });
    ['touchend', 'touchcancel'].forEach(function (k){ u.scroll.addEventListener(k, function (){ us.down = false; us.last = Date.now(); }, { passive: true }); });
    u.scroll.addEventListener('wheel', function (){ us.last = Date.now(); }, { passive: true });
    u.scroll.addEventListener('scroll', function (){
      if (!E.fixed || !E.isOpen) return;
      var sc = u.scroll;
      if (E.progLeft != null && Math.abs(sc.scrollLeft - E.progLeft) < 2){ E.progLeft = null; return; }   // we moved it ourselves
      E.progLeft = null;
      if (E.drag && E.drag.mode !== 'tap') return;   // a clip being dragged to the edge: the time stays where it is
      if (us.down || Date.now() - us.last < 350){ us.last = Date.now(); E.fromScroll = true; try { seek(sc.scrollLeft / E.ppm); } finally { E.fromScroll = false; } }
      else { var want = Math.round(E.t * E.ppm); if (Math.abs(sc.scrollLeft - want) > 1){ E.progLeft = want; sc.scrollLeft = want; } }   // something else moved it: put it back under the playhead
    });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function (){
      if (!E.isOpen) return;
      var f = wantFixed(), w = u.scroll.clientWidth, pad = (f && w > 100) ? Math.round(w / 2) : 16;
      if (f !== E.fixed || pad !== PAD){ renderTimeline(); }
    }).observe(u.scroll);
    u.tlMode.onclick = function (){
      var on = !E.fixed; E.fixedPref = on ? 'on' : 'off'; try { localStorage.setItem('naki.tlfixed', E.fixedPref); } catch (e) {}
      renderTimeline();
      if (on){ E.progLeft = null; u.scroll.scrollLeft = Math.round(E.t * E.ppm); } else keepHeadInView();
      toast(on ? 'The playhead stays in the middle. Drag the timeline to move through the video.' : 'The playhead moves along the timeline.');
    };`, 'ruler scroll listener');

// 3. when is it on, and the padding it needs (half the width, so time 0 and the end can reach the middle)
rep("  function tx(t){ return PAD + t * E.ppm; }", `  function tx(t){ return PAD + t * E.ppm; }
  function wantFixed(){
    var pref = E.fixedPref; if (!pref){ try { pref = localStorage.getItem('naki.tlfixed') || ''; } catch (e) { pref = ''; } }
    if (pref === 'on') return true; if (pref === 'off') return false;
    try { return !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(max-width: 899px)').matches); } catch (e) { return false; }
  }
  function refreshFixed(){ E.fixed = wantFixed(); var w = E.ui && E.ui.scroll ? E.ui.scroll.clientWidth : 0; PAD = (E.fixed && w > 100) ? Math.round(w / 2) : 16; }
  function layoutFixed(){
    var u = E.ui; if (!u.fhead) return;
    u.fhead.style.display = E.fixed ? 'block' : 'none'; if (u.head) u.head.style.display = E.fixed ? 'none' : '';
    if (E.fixed) u.fhead.style.left = (u.scroll.offsetLeft + u.scroll.clientWidth / 2 - 1) + 'px';
    if (u.tlMode){ u.tlMode.classList.toggle('on', !!E.fixed); u.tlMode.setAttribute('aria-pressed', String(!!E.fixed)); }
  }`, 'tx()');

// 4. drawing the timeline
rep("u.inner.style.width = (PAD + p.durationMs * E.ppm + 240) + 'px';", "refreshFixed(); u.inner.style.width = (PAD + p.durationMs * E.ppm + (E.fixed ? PAD : 240)) + 'px';", 'inner width');
rep("placeHead(); renderLabels(); renderMix(); renderSelected(); updateButtons(); stickRuler();", "layoutFixed(); placeHead(); renderLabels(); renderMix(); renderSelected(); updateButtons(); stickRuler();", 'end of renderTimeline');
rep("var sp = u.labels && u.labels.firstChild; if (sp && sp.style) sp.style.transform = t;", "var sp = u.labels && u.labels.firstChild; if (sp && sp.style) sp.style.transform = t;\n    if (u.fhead) u.fhead.style.transform = t;", 'stickRuler');

// 5. the playhead: moves the timeline (phone) or moves itself (computer)
rep("function placeHead(){ if (E.ui.head) E.ui.head.style.left = tx(E.t) + 'px'; if (E.meter) drawGrid(); }",
`function placeHead(){
    if (E.fixed){
      var sc = E.ui.scroll;
      if (sc && !E.fromScroll){ var want = Math.round(E.t * E.ppm); if (Math.abs(sc.scrollLeft - want) > 1){ E.progLeft = want; sc.scrollLeft = want; } }
    } else if (E.ui.head) E.ui.head.style.left = tx(E.t) + 'px';
    if (E.meter) drawGrid();
  }`, 'placeHead');

// 6. fit, zoom (around the middle), playing
rep("E.ppm = clamp((w - PAD * 2) / Math.max(E.proj.durationMs, 1000), MIN_PPM, 0.2);", "E.ppm = clamp((w - 32) / Math.max(E.proj.durationMs, 1000), MIN_PPM, 0.2);", 'fit');
rep("var sc = E.ui.scroll, ax = anchorX != null ? anchorX - sc.getBoundingClientRect().left : sc.clientWidth / 2;", "var sc = E.ui.scroll, ax = (anchorX != null && !E.fixed) ? anchorX - sc.getBoundingClientRect().left : sc.clientWidth / 2;", 'setZoom');
rep("if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 40);", "if (!E.fixed && (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft)) sc.scrollLeft = Math.max(0, x - 40);", 'follow while playing');

// 7. touches: a tap on empty timeline (or the ruler) no longer jumps the playhead, it only lets go of the selection
rep("ev.pointerType === 'touch' && !(tg.closest && tg.closest('.ed-ruler'))) E.drag = { mode: 'tap'", "ev.pointerType === 'touch' && (E.fixed || !(tg.closest && tg.closest('.ed-ruler')))) E.drag = { mode: 'tap'", 'onDown tap');
rep("    seek(d.t); if (E.sel || Object.keys(E.multi || {}).length){", "    if (!E.fixed) seek(d.t); if (E.sel || Object.keys(E.multi || {}).length){", 'tap end');
rep("if (cancel){ renderTimeline(); return; }", "if (cancel){ if (!(E.fixed && d.mode === 'tap')) renderTimeline(); return; }", 'cancel');

fs.writeFileSync(file, CRLF ? s.replace(/\n/g, '\r\n') : s);

// the test
const tp = path.join(__dirname, '..', 'tests', 'timeline-fixed.test.js');
fs.writeFileSync(tp, `'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ed = fs.readFileSync(path.join(__dirname, '..', 'www', 'editor.js'), 'utf8').replace(/\\r\\n/g, '\\n');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
ok('editor.js still parses', () => { new vm.Script(ed, { filename: 'editor.js' }); });
ok('the playhead can stay in the middle: padding is half the width, scroll follows the time, time follows the scroll', () => {
  ['function wantFixed()', 'function refreshFixed()', 'PAD = (E.fixed && w > 100) ? Math.round(w / 2) : 16', 'var want = Math.round(E.t * E.ppm)', 'seek(sc.scrollLeft / E.ppm)',
   "u.tlMode = btn('edTlMode'", "naki.tlfixed", "if (!E.fixed) seek(d.t);", 'ax = (anchorX != null && !E.fixed)'].forEach(s => assert(ed.includes(s), 'missing: ' + s));
});
ok('the computer keeps its moving playhead: the old placement is still there for the other mode', () => {
  assert(ed.includes("else if (E.ui.head) E.ui.head.style.left = tx(E.t) + 'px';")); assert(ed.includes("if (!E.fixed && (x > sc.scrollLeft + sc.clientWidth - 40"));
});
console.log('\\n' + n + ' checks passed');
`);
console.log('editor.js updated and tests/timeline-fixed.test.js added. Now run: npm test');