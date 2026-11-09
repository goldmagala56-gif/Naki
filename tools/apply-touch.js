'use strict';
// One-time patch (after apply-timeline-layers.js): a timeline that is easy to use with a thumb.
//   - trim handles are wide, sit outside the clip, and only work on the SELECTED clip (no more accidental trims)
//   - a selected overlay / sound / text / sticker / effect drags at once; the picture row keeps long-press so it can still scroll
//   - a small dead zone, so finger jitter does not move or trim anything
//   - swiping empty timeline space just scrolls (the playhead no longer jumps); a plain tap moves the playhead and lets go of the selection
//   - a tap on the clip you already have selected no longer deselects it (touch screens)
//   - taller rows and bigger lock / hide buttons on touch screens
//   - every clip gets a short code (A1, A2, P1, C1, T1 ...) shown on small clips, and a bar under the timeline for the selected clip with
//     its name, Zoom to clip, Split, Duplicate and DELETE (works for sounds, photos, overlays, everything)
// Run from the project folder:   node tools/apply-touch.js
// It checks that every spot it needs to change is found exactly once BEFORE writing anything, so it does everything or nothing.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

const CLIPCODES = `'use strict';
/* Naki clip codes: a short name for every clip (A1, A2, P1, C1 ...), numbered in time order within each kind.
   Used by the timeline to label clips that are too small to show their name. Pure logic, no page code. */
var NakiCodes = (function () {
  // C = picture clip of the movie, V = an added video, P = a photo, A = sound effect / voice-over / speech, VO = your voice, MU = music,
  // MS = movie sound, O = overlay, ST = sticker, T = title, CP = caption, FX = video effect, LY = layout
  function prefix(p, tr, c) {
    if (tr.kind === 'video') {
      var a = c.asset && p.assets && p.assets[c.asset];
      if (c.type === 'freeze' && a && a.type === 'image') return 'P';
      return c.asset && c.asset !== 'movie' ? 'V' : 'C';
    }
    if (tr.kind === 'audio') return tr.role === 'sfx' ? 'A' : tr.role === 'voice' ? 'VO' : tr.role === 'music' ? 'MU' : 'MS';
    if (tr.kind === 'overlay') return 'O';
    if (tr.kind === 'sticker') return 'ST';
    if (tr.kind === 'text') return tr.role === 'captions' ? 'CP' : 'T';
    if (tr.kind === 'fx') return 'FX';
    if (tr.kind === 'layout') return 'LY';
    return 'X';
  }
  // { clipId: 'A1', ... }
  function build(p) {
    var groups = {}, out = {};
    (p.tracks || []).forEach(function (tr) {
      (tr.clips || []).forEach(function (c) { var k = prefix(p, tr, c); (groups[k] = groups[k] || []).push(c); });
    });
    Object.keys(groups).forEach(function (k) {
      groups[k].sort(function (a, b) { return a.start - b.start; }).forEach(function (c, i) { out[c.id] = k + (i + 1); });
    });
    return out;
  }
  var api = { prefix: prefix, build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiCodes = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['clipcodes.js'] = 'touch'; }
  return api;
})();
`;

const TEST = `'use strict';
// node tests/touch.test.js
// The short codes (A1, A2, P1 ...) that name the clips on the timeline.
const assert = require('assert'), C = require('../www/clipcodes.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
function make() {
  return { assets: { movie: { type: 'video' }, v1: { type: 'video' }, v2: { type: 'image' }, fx1: { type: 'audio' }, fx2: { type: 'audio' } }, tracks: [
    { id: 't-movie', kind: 'video', role: 'movie', clips: [
      { id: 'a', type: 'video', asset: 'movie', start: 0 }, { id: 'b', type: 'freeze', asset: 'v2', start: 4000 },
      { id: 'c', type: 'video', asset: 'v1', start: 8000 }, { id: 'd', type: 'video', asset: 'movie', start: 12000 }, { id: 'e', type: 'freeze', asset: 'movie', start: 16000 }] },
    { id: 't-moviesound', kind: 'audio', role: 'movieSound', clips: [{ id: 'ms1', start: 0 }] },
    { id: 't-voice', kind: 'audio', role: 'voice', clips: [{ id: 'vo1', start: 0 }] },
    { id: 't-fx1', kind: 'audio', role: 'sfx', clips: [{ id: 's2', asset: 'fx2', start: 5000 }, { id: 's1', asset: 'fx1', start: 1000 }] },
    { id: 't-fx2', kind: 'audio', role: 'sfx', clips: [{ id: 's3', asset: 'fx1', start: 3000 }] },
    { id: 't-text', kind: 'text', role: 'text', clips: [{ id: 'tx1', start: 0 }] },
    { id: 't-captions', kind: 'text', role: 'captions', clips: [{ id: 'cp2', start: 2000 }, { id: 'cp1', start: 500 }] },
    { id: 't-stk1', kind: 'sticker', role: 'stickers', clips: [{ id: 'st1', start: 0 }] },
    { id: 't-ov1', kind: 'overlay', role: 'overlay', clips: [{ id: 'o1', start: 0 }] } ] };
}
ok('codes: every kind of clip has its own prefix', () => {
  const k = C.build(make());
  assert.strictEqual(k.a, 'C1'); assert.strictEqual(k.d, 'C2'); assert.strictEqual(k.e, 'C3'); assert.strictEqual(k.b, 'P1', 'a photo'); assert.strictEqual(k.c, 'V1', 'an added video');
  assert.strictEqual(k.ms1, 'MS1'); assert.strictEqual(k.vo1, 'VO1'); assert.strictEqual(k.tx1, 'T1'); assert.strictEqual(k.st1, 'ST1'); assert.strictEqual(k.o1, 'O1');
});
ok('codes: numbered in time order across all rows of a kind, whatever order the clips are stored in', () => {
  const k = C.build(make());
  assert.deepStrictEqual([k.s1, k.s3, k.s2], ['A1', 'A2', 'A3'], 'sound effects on two rows share one count');
  assert.deepStrictEqual([k.cp1, k.cp2], ['CP1', 'CP2'], 'captions');
});
ok('codes: moving a clip renumbers by its new place; the project is never changed', () => {
  const p = make(), snap = JSON.stringify(p); C.build(p); assert.strictEqual(JSON.stringify(p), snap);
  p.tracks[3].clips.find(c => c.id === 's1').start = 9000;
  const k = C.build(p); assert.deepStrictEqual([k.s3, k.s2, k.s1], ['A1', 'A2', 'A3']);
  assert.deepStrictEqual(C.build({ tracks: [] }), {}); assert.strictEqual(C.prefix({ assets: {} }, { kind: 'zzz' }, {}), 'X');
});
console.log('\\n' + n + ' checks passed');
`;

const CSS = `
/* touch comfort: wide handles on the selected clip, bigger hit areas, selected-clip bar */
.ed-h{pointer-events:none}
.ed-clip.sel{overflow:visible;z-index:3}
.ed-clip.sel canvas{border-radius:6px}
.ed-clip.sel .ed-h{pointer-events:auto;width:32px;max-width:none}
.ed-clip.sel .ed-hl{left:-16px}
.ed-clip.sel .ed-hr{right:-16px}
.ed-clip.sel .ed-h::after{left:13px;right:auto;width:6px;top:18%;bottom:18%;box-shadow:0 0 0 1px #111b24}
.ed-clip.sel .ed-hl::after,.ed-clip.sel .ed-hr::after{left:13px;right:auto}
.ed-row:not(.k-movie) .ed-clip.sel{touch-action:none}
.ed-clip{-webkit-touch-callout:none}
.ed-clip.tiny{overflow:visible}
.ed-clip.tiny::before{content:"";position:absolute;inset:-8px -10px}
.ed-clip .ed-cl.ed-code{left:50%;right:auto;transform:translateX(-50%);padding:0 4px;max-width:none;overflow:visible;font-weight:800;font-size:11px;background:rgba(0,0,0,.5);border-radius:4px}
.ed-selbar{display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid var(--line)}
.ed-seln{flex:1;min-width:0;font-size:12.5px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ed-selbar .ed-ibtn{width:40px;height:40px}
.ed-selbar-del{color:var(--hibiscus)}
@media (pointer:coarse){
  .ed-label .ed-lb{width:30px;min-width:30px;height:30px}
  .ed-labels{flex:0 0 108px;width:108px}
}
`;

const EDITS = {
  'www/editor.js': [
    { label: 'editor: clipcodes library', find: "var NRP = (typeof module !== 'undefined' && module.exports) ? require('./speedramp.js') : (typeof window !== 'undefined' ? window.NakiRamp : null);",
      replace: "var NRP = (typeof module !== 'undefined' && module.exports) ? require('./speedramp.js') : (typeof window !== 'undefined' ? window.NakiRamp : null);\n  var NCODES = (typeof module !== 'undefined' && module.exports) ? require('./clipcodes.js') : (typeof window !== 'undefined' ? window.NakiCodes : null);" },
    { label: 'editor: taller rows on touch screens', find: "function rowH(tr){ return tr.kind === 'video' ? 56 : (tr.kind === 'text' || tr.kind === 'sticker' || tr.kind === 'fx' || tr.kind === 'layout') ? 30 : 44; }",
      replace: "var COARSE = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;\n  function rowH(tr){\n    var s = tr.kind === 'video' ? 56 : (tr.kind === 'text' || tr.kind === 'sticker' || tr.kind === 'fx' || tr.kind === 'layout') ? 30 : 44;\n    return COARSE ? s + (s < 40 ? 10 : 4) : s;\n  }" },
    { label: 'editor: codes are worked out when the timeline is drawn', find: "function renderTimeline(){\n    var p = E.proj, u = E.ui;",
      replace: "function renderTimeline(){\n    var p = E.proj, u = E.ui;\n    E.codes = NCODES ? NCODES.build(p) : {};" },
    { label: 'editor: clip label / code badge', find: "if (c.dur * E.ppm > 46) e.appendChild(mk('span', 'ed-cl', clipTitle(tr, c)));",
      replace: "var wpx = c.dur * E.ppm, code = (E.codes && E.codes[c.id]) || '';\n    if (wpx > 70) e.appendChild(mk('span', 'ed-cl', (code ? code + ' \\u00b7 ' : '') + clipTitle(tr, c)));\n    else if (wpx >= 16 && code) e.appendChild(mk('span', 'ed-cl ed-code', code));\n    if (wpx < 44) e.classList.add('tiny');" },
    { label: 'editor: small clips are at least 16 px wide', find: "e.style.width = Math.max(3, c.dur * E.ppm) + 'px';",
      replace: "e.style.width = Math.max(tr.kind === 'video' ? 3 : 16, c.dur * E.ppm) + 'px';" },
    { label: 'editor: selected-clip bar and zoom to clip', find: "function openTool(name){",
      replace: "// The bar for the selected clip: its name (with code), Zoom to clip, Split, Duplicate and Delete. It works for every kind of clip.\n  function selBar(){\n    var f = E.sel && P.findClip(E.proj, E.sel); if (!f || E.panel) return null;\n    var c = f.clip, bar = mk('div', 'ed-selbar'), nm = mk('span', 'ed-seln', ((E.codes && E.codes[c.id]) || '') + ' \\u00b7 ' + clipTitle(f.track, c) + ' \\u00b7 ' + fmtP(c.dur));\n    function b(label, icon, fn, cls){ var x = iconBtn(null, icon, label, 'ed-ibtn' + (cls || '')); x.onclick = fn; return x; }\n    return add(bar, nm, b('Zoom to this clip', G.zoom, zoomToSel), b('Split', G.split, split), b('Duplicate', G.dup, duplicateSel),\n      b('Delete', G.trash, deleteSel, ' ed-selbar-del'), b('Done', G.check, function (){ E.multi = {}; select(null); }));\n  }\n  function zoomToSel(){\n    var f = E.sel && P.findClip(E.proj, E.sel); if (!f) return;\n    var sc = E.ui.scroll, c = f.clip;\n    E.ppm = clamp(sc.clientWidth * 0.6 / Math.max(300, c.dur), MIN_PPM, MAX_PPM);\n    renderTimeline(); sc.scrollLeft = Math.max(0, tx(c.start + c.dur / 2) - sc.clientWidth / 2);\n  }\n  function openTool(name){" },
    { label: 'editor: the bar sits in the dock', find: "var kb = kfBar(); if (kb) d.appendChild(kb);",
      replace: "var kb = kfBar(); if (kb) d.appendChild(kb);\n    var sb = selBar(); if (sb) d.appendChild(sb);" },
    { label: 'editor: a selected non-picture clip drags at once on touch', find: "if (E.drag.mode === 'pending' && E.drag.touch) E.drag.press = setTimeout(function (){",
      replace: "if (E.drag.mode === 'pending' && E.drag.touch && wasSel && tr.kind !== 'video') E.drag.mode = 'move';\n      if (E.drag.mode === 'pending' && E.drag.touch) E.drag.press = setTimeout(function (){" },
    { label: 'editor: long-press a little shorter', find: "}, 380);", replace: "}, 300);" },
    { label: 'editor: touching empty space is a tap, not a scrub', find: "E.drag = { mode: 'scrub' }; seek(xToT(ev.clientX));",
      replace: "if (ev.pointerType === 'touch' && !(tg.closest && tg.closest('.ed-ruler'))) E.drag = { mode: 'tap', x0: ev.clientX, y0: ev.clientY, t: xToT(ev.clientX) };\n      else { E.drag = { mode: 'scrub' }; seek(xToT(ev.clientX)); }" },
    { label: 'editor: remember where a tap ended', find: "if (d.mode === 'scrub'){ seek(xToT(ev.clientX)); return; }",
      replace: "if (d.mode === 'scrub'){ seek(xToT(ev.clientX)); return; }\n    if (d.mode === 'tap'){ d.lx = ev.clientX; d.ly = ev.clientY; return; }" },
    { label: 'editor: dead zone for finger jitter', find: "d.moved = true; var dt = dx / E.ppm;",
      replace: "if (d.touch && (d.mode === 'move' || d.mode === 'trimL' || d.mode === 'trimR') && !d.armed){\n      if (Math.abs(dx) < 6 && Math.abs(ev.clientY - d.y0) < 6) return;\n      d.armed = true;\n    }\n    d.moved = true; var dt = dx / E.ppm;" },
    { label: 'editor: finishing a tap', find: "if (cancel){ renderTimeline(); return; }",
      replace: "if (d.mode === 'tap'){   // a swipe ends as a cancel (the browser scrolled): nothing to do. A real tap moves the playhead and lets go of the selection.\n      if (!cancel && Math.abs((d.lx || d.x0) - d.x0) < 10 && Math.abs((d.ly || d.y0) - d.y0) < 10){\n        seek(d.t); if (E.sel || Object.keys(E.multi || {}).length){ E.multi = {}; select(null); }\n      }\n      return;\n    }\n    if (cancel){ renderTimeline(); return; }" },
    { label: 'editor: a tap on the selected clip keeps it selected on touch screens', find: "else if (!d.moved && d.wasSel && (d.mode === 'pending' || d.mode === 'move')){",
      replace: "else if (!d.moved && d.wasSel && !d.touch && (d.mode === 'pending' || d.mode === 'move')){" },
    { label: 'editor: no long-press menu over the timeline', find: "u.scroll.addEventListener('pointerdown', onDown);",
      replace: "u.scroll.addEventListener('pointerdown', onDown);\n    u.scroll.addEventListener('contextmenu', function (ev){ ev.preventDefault(); });" }
  ],
  'www/index.html': [
    { label: 'page: script', find: '<script src="editor.js"></script>', replace: '<script src="clipcodes.js"></script>\n<script src="editor.js"></script>' }
  ],
  'www/sw.js': [
    { label: 'service worker: file list', find: "'./fx.js'", replace: "'./fx.js', './clipcodes.js'", optional: true }
  ],
  'package.json': [
    { label: 'package.json: test list', re: '("test": "[^"]*)"', replace: '$1 && node tests/touch.test.js"' }
  ]
};

function load(rel) { const f = path.join(root, rel); const raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o) { fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
if (fs.existsSync(path.join(root, 'www', 'clipcodes.js'))) { console.log('Already applied (www/clipcodes.js exists). Nothing to do.'); process.exit(0); }
if (!fs.existsSync(path.join(root, 'www', 'thumbs.js'))) { console.log('Apply tools/apply-timeline.js and tools/apply-timeline-layers.js first: www/thumbs.js is missing.'); process.exit(1); }
const problems = [], warnings = [], files = {};
Object.keys(EDITS).forEach(rel => {
  let o;
  try { o = files[rel] = load(rel); } catch (err) {
    if (EDITS[rel].every(e => e.optional)) { warnings.push(rel + ' was not found, so it was skipped'); return; }
    problems.push(rel + ' could not be read'); return;
  }
  EDITS[rel].forEach(e => {
    const bad = msg => { if (e.optional) warnings.push(msg + ' (skipped)'); else problems.push(msg); };
    if (e.find !== undefined) {
      const n = o.text.split(e.find).length - 1;
      if (n !== 1) { bad(e.label + ': found ' + n + ' times (need exactly 1) in ' + path.basename(rel)); return; }
      o.text = o.text.replace(e.find, () => e.replace);
    } else {
      const m = o.text.match(new RegExp(e.re, 'g'));
      if (!m || m.length !== 1) { bad(e.label + ': found ' + (m ? m.length : 0) + ' times (need exactly 1) in ' + path.basename(rel)); return; }
      o.text = o.text.replace(new RegExp(e.re), e.replace);
    }
  });
});
const cssFile = load('www/editor.css'); cssFile.text = cssFile.text.replace(/\s*$/, '\n') + CSS; files['www/editor.css'] = cssFile;
if (problems.length) {
  console.log('NOTHING WAS CHANGED. These spots did not match your files:\n  - ' + problems.join('\n  - '));
  console.log('\nSend me that list (and the file names) and I will adjust.');
  process.exit(1);
}
Object.keys(files).forEach(rel => save(files[rel]));
fs.writeFileSync(path.join(root, 'www', 'clipcodes.js'), CLIPCODES);
fs.writeFileSync(path.join(root, 'tests', 'touch.test.js'), TEST);
console.log('Done. Changed ' + Object.keys(files).length + ' files, added www/clipcodes.js and tests/touch.test.js.');
if (warnings.length) console.log('Note:\n  - ' + warnings.join('\n  - ') + '\nIf sw.js was skipped, add \'./clipcodes.js\' to its file list by hand so the app works offline.');
console.log('Now run:  npm test');