'use strict';
// node tools/apply-markers.js   (from the project folder)
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
if (!fs.existsSync(path.join(root, 'www', 'markers.js'))) { console.log('NOTHING WAS CHANGED. Put markers.js in the www folder first.'); process.exit(1); }
const ed = load('www/editor.js'), css = load('www/editor.css'), html = load('www/index.html');
if (ed.text.includes('function addMarkerHere')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

const BLOCK = `/* ---------- timeline markers (flags on the ruler, CapCut style) ---------- */
  var NMK = (typeof module !== 'undefined' && module.exports) ? require('./markers.js') : (typeof window !== 'undefined' ? window.NakiMarkers : null);
  G.flag = svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>');
  function markerNeed(){ if (NMK) return true; toast('Markers are not loaded. Add <script src="markers.js"></script> to index.html, before editor.js.'); return false; }
  // the times a dragged or trimmed clip snaps to: the playhead and every marker
  function snapPts(){ return [E.t].concat(NMK ? NMK.times(E.proj) : []); }
  // the marker the tools work on: the one you tapped, or else the one at the playhead
  function curMarker(){
    if (!NMK) return null;
    var l = NMK.list(E.hist.cur), i;
    if (E.markSel) for (i = 0; i < l.length; i++) if (l[i].id === E.markSel) return l[i];
    return NMK.at(E.hist.cur, Math.round(E.t));
  }
  function addMarkerHere(){
    if (!markerNeed()) return;
    var out = {}, q = NMK.add(E.hist.cur, Math.round(E.t), null, out);
    if (out.full){ toast('That is the most markers a project can have.'); return; }
    E.markSel = out.id;
    if (q === E.hist.cur){ renderTimeline(); openPanel('markeredit', 'marker'); return; }   // there is already one here: just open it
    commit(q); openPanel('markeredit', 'marker');
  }
  function markerTap(id){
    var m = NMK && NMK.list(E.hist.cur).filter(function (x){ return x.id === id; })[0]; if (!m) return;
    E.markSel = id; seek(m.t); renderTimeline(); openPanel('markeredit', 'marker');
  }
  function jumpMarker(dir){
    if (!markerNeed()) return;
    var m = NMK.neighbour(E.hist.cur, E.t, dir);
    if (!m){ toast(dir > 0 ? 'There is no marker after the playhead.' : 'There is no marker before the playhead.'); return; }
    E.markSel = m.id; seek(m.t);
    var sc = E.ui.scroll, x = tx(m.t);
    if (x < sc.scrollLeft + 20 || x > sc.scrollLeft + sc.clientWidth - 20) sc.scrollLeft = Math.max(0, x - sc.clientWidth / 2);
    renderTimeline(); renderDock();
  }
  function deleteMarker(){
    var m = curMarker(); if (!m){ toast('Tap a flag, or move the playhead onto one, first.'); return; }
    E.markSel = null; commit(NMK.remove(E.hist.cur, m.id));
  }
  function clearMarkers(){
    var n = NMK ? NMK.list(E.hist.cur).length : 0; if (!n) return;
    if (!confirm('Remove all ' + n + ' markers?')) return;
    E.markSel = null; commit(NMK.clear(E.hist.cur));
  }
  // The flags along the ruler. Tapping one is handled in onDown.
  function drawMarkerFlags(ruler){
    if (!NMK) return;
    NMK.list(E.proj).forEach(function (m){
      var f = mk('div', 'ed-mflag' + (m.id === E.markSel ? ' sel' : '')); f.dataset.id = m.id;
      f.style.left = tx(m.t) + 'px'; f.style.setProperty('--mc', NMK.colorCss(m.color)); f.title = (m.name ? m.name + ' \\u00b7 ' : '') + fmtP(m.t);
      if (m.name) f.appendChild(mk('span', null, m.name));
      ruler.appendChild(f);
    });
  }
  ROWS.marker = function (){
    var has = !!(NMK && NMK.list(E.hist.cur).length), cm = curMarker();
    return [
      { id: 'edMarkerAdd', label: 'Add marker', icon: G.flag, run: addMarkerHere },
      { id: 'edMarkerEdit', label: 'Edit', icon: G.pencil, run: function (){ openPanel('markeredit'); }, disabled: !has },
      { id: 'edMarkerPrev', label: 'Previous', icon: G.back, run: function (){ jumpMarker(-1); }, disabled: !has },
      { id: 'edMarkerNext', label: 'Next', icon: G.fwd, run: function (){ jumpMarker(1); }, disabled: !has },
      { id: 'edMarkerDel', label: 'Delete', icon: G.trash, run: deleteMarker, disabled: !cm },
      { id: 'edMarkerClear', label: 'Clear all', icon: G.reset, run: clearMarkers, disabled: !has }
    ];
  };
  PANELS.markeredit = { title: 'Markers', build: function (body){
    if (!markerNeed()) return;
    var l = NMK.list(E.hist.cur);
    if (!l.length){
      body.appendChild(mk('div', 'ed-hint', 'No markers yet. Move the playhead to a spot and add one. Markers show as flags on the ruler, and clips snap to them when you drag or trim.'));
      body.appendChild(actions([{ id: 'edMarkerAdd2', label: 'Add marker here', run: addMarkerHere }]));
      return;
    }
    var c = curMarker();
    body.appendChild(chips(l.map(function (m){ return { key: m.id, label: fmtP(m.t) + (m.name ? '  ' + (m.name.length > 16 ? m.name.slice(0, 15) + '\\u2026' : m.name) : '') }; }), c ? c.id : null, function (id){ markerTap(id); }));
    if (!c){ body.appendChild(mk('div', 'ed-hint', 'Tap a flag on the ruler, or pick one above, to rename or recolour it.')); return; }
    var ti = mk('input', 'ed-textin'); ti.type = 'text'; ti.maxLength = 40; ti.placeholder = 'Marker name'; ti.value = c.name || ''; ti.setAttribute('aria-label', 'Marker name');
    ti.oninput = function (){ live(NMK.update(E.hist.cur, c.id, { name: ti.value })); };
    ti.onchange = function (){ commit(NMK.update(E.hist.cur, c.id, { name: ti.value })); };
    body.appendChild(ti);
    body.appendChild(chips(NMK.COLORS.map(function (x){ return { key: x.key, label: x.label }; }), c.color, function (k){ commit(NMK.update(E.hist.cur, c.id, { color: k })); }));
    body.appendChild(actions([{ id: 'edMarkerHere', label: 'Move to playhead', run: function (){ commit(NMK.update(E.hist.cur, c.id, { t: Math.round(E.t) })); } }, { id: 'edMarkerDel2', label: 'Delete marker', run: deleteMarker }]));
    body.appendChild(mk('div', 'ed-hint', 'Markers do not change your video. They are for you: to mark a beat, a cut or a note. They stay put when you cut other parts out.'));
  } };

  /* ---------- titles drawn over the preview ---------- */`;

rep(ed, `/* ---------- titles drawn over the preview ---------- */`, BLOCK, 'editor: marker functions and panel');
rep(ed, `go: function (){ openTool('fx'); } }`,
  `go: function (){ openTool('fx'); } },\n    { name: 'marker', label: 'Marker', icon: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'), go: function (){ openTool('marker'); } }`, 'editor: Marker button in the toolbar');
rep(ed, `try { drawBeatTicks(ruler); } catch (e) {}`, `try { drawBeatTicks(ruler); } catch (e) {}\n    try { drawMarkerFlags(ruler); } catch (e) {}`, 'editor: flags on the ruler');
rep(ed, `var kfD = tg.closest && tg.closest('.ed-kf');`, `var kfD = tg.closest && tg.closest('.ed-kf');\n    var mkF = tg.closest && tg.closest('.ed-mflag');\n    if (mkF){ markerTap(mkF.dataset.id); return; }`, 'editor: tap a flag');
rep(ed, `P.snapTime(E.proj, t, 8 / E.ppm, [E.t])`, `P.snapTime(E.proj, t, 8 / E.ppm, snapPts())`, 'editor: trim snaps to markers');
rep(ed, `P.snapTime(E.proj, start, th, [E.t], skip)`, `P.snapTime(E.proj, start, th, snapPts(), skip)`, 'editor: move snaps to markers (start)');
rep(ed, `P.snapTime(E.proj, start + dur, th, [E.t], skip)`, `P.snapTime(E.proj, start + dur, th, snapPts(), skip)`, 'editor: move snaps to markers (end)');
rep(ed, `P.snapTime(E.proj, raw, th, [E.t], skip)`, `P.snapTime(E.proj, raw, th, snapPts(), skip)`, 'editor: snap guide (start)');
rep(ed, `P.snapTime(E.proj, raw + len, th, [E.t], skip)`, `P.snapTime(E.proj, raw + len, th, snapPts(), skip)`, 'editor: snap guide (end)');
rep(ed, `else if (k === 's' || k === 'S') split();`, `else if (k === 's' || k === 'S') split();\n    else if (k === 'm' || k === 'M') addMarkerHere();`, 'editor: M key');
rep(ed, `E.lastFilter = ''; E.lastOpacity = ''; E.lastRate = 1; E.lastTransform = '';`, `E.markSel = null; E.lastFilter = ''; E.lastOpacity = ''; E.lastRate = 1; E.lastTransform = '';`, 'editor: forget the selected marker on open', true);

if (!css.text.includes('.ed-mflag')) {
  css.text = css.text.replace(/\s*$/, '\n') + `
/* timeline markers: flags on the ruler */
.ed-mflag{position:absolute;top:0;height:26px;min-width:22px;margin-left:-1px;cursor:pointer;z-index:4;touch-action:none;--mc:#ff4d4f}
.ed-mflag::before{content:"";position:absolute;left:0;top:2px;bottom:0;width:2px;background:var(--mc)}
.ed-mflag::after{content:"";position:absolute;left:2px;top:2px;width:12px;height:11px;background:var(--mc);clip-path:polygon(0 0,100% 0,72% 50%,100% 100%,0 100%)}
.ed-mflag span{position:absolute;left:16px;top:2px;max-width:80px;font-size:10px;line-height:12px;color:var(--chalk);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,.8);pointer-events:none}
.ed-mflag.sel{filter:drop-shadow(0 0 3px #fff)}
`;
}
rep(html, `<script src="editor.js"></script>`, `<script src="markers.js"></script>\n<script src="editor.js"></script>`, 'index.html: load markers.js');
rep(html, `'reverse.js': 'reverse' };`, `'reverse.js': 'reverse', 'markers.js': 'markers' };`, 'index.html: version check', true);

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(ed); save(css); save(html);
console.log('Done.' + (notes.length ? '\n  ' + notes.join('\n  ') : '') + '\nAlso add markers.js to the file list in sw.js so it works offline.\nNow run:  npm test');