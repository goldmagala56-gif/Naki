'use strict';
// node tools/apply-group-clips.js   (from the project folder)
// Group clips: pick several clips (even on different rows), group them, and they select, move, copy and delete as one block.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function load(rel) { const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o) { fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const problems = [];
function rep(o, find, replace, label) {
  const n = o.text.split(find).length - 1;
  if (n !== 1) { problems.push(label + ': found ' + n + ' times (need exactly 1) in ' + o.rel); return; }
  o.text = o.text.replace(find, () => replace);
}
const pj = load('www/project.js'), ed = load('www/editor.js');
let css = null; try { css = load('www/editor.css'); } catch (e) {}
if (pj.text.includes('function groupClips')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- project.js ----------
rep(pj, '// ---------- smooth slow-motion ----------',
`// ---------- groups ----------
// Clips with the same clip.group move, copy and delete together. A group is only a tag: every clip keeps its own row, look and length.
function groupIds(p, id){   // the clip and everyone in its group (just [id] when it is alone)
  var f = findClip(p, id); if (!f) return [];
  var out = [id], g = f.clip.group; if (!g) return out;
  p.tracks.forEach(function (tr){ tr.clips.forEach(function (c){ if (c.group === g && c.id !== id) out.push(c.id); }); });
  return out;
}
// Puts the clips in one group (clips already in a group bring their whole group along). Clips on locked rows cannot join. Fewer than two: nothing happens.
function groupClips(p, ids){
  var q = cloneProject(p), set = {}, list = [];
  (ids || []).forEach(function (id){ groupIds(q, id).forEach(function (cid){ if (!set[cid]){ set[cid] = 1; list.push(cid); } }); });
  var g = newId('g'), n = 0;
  list.forEach(function (cid){ var f = findClip(q, cid); if (f && !f.track.locked){ f.clip.group = g; n++; } });
  return n < 2 ? p : finish(q);
}
function ungroupClips(p, id){
  var f = findClip(p, id); if (!f || !f.clip.group) return p;
  var q = cloneProject(p), g = f.clip.group;
  q.tracks.forEach(function (tr){ tr.clips.forEach(function (c){ if (c.group === g) delete c.group; }); });
  return finish(q);
}
// A copy of a whole group (null when the clip is not in one): each clip with its distance from the first one.
function copyGroup(p, id){
  var ids = groupIds(p, id); if (ids.length < 2) return null;
  var inSet = {}; ids.forEach(function (cid){ inSet[cid] = 1; });
  var items = [], first = Infinity;
  ids.forEach(function (cid){
    var f = findClip(p, cid); if (!f) return;
    if (f.track.role === 'movieSound' && f.clip.link && linkedIds(p, cid).some(function (x){ var g = findClip(p, x); return x !== cid && g && g.track.role === 'movie' && inSet[x]; })) return;   // a movie's sound is copied with its picture
    first = Math.min(first, f.clip.start); items.push({ cb: copyClip(p, cid), start: f.clip.start });
  });
  if (items.length < 2) return null;
  return { group: items.map(function (it){ return { cb: it.cb, off: it.start - first }; }) };
}
// Puts a copied group at time t as a new group. If one clip does not fit, nothing is pasted. out.ids = the new clips.
function pasteGroup(p, cbg, t, out){
  out = out || {};
  if (!cbg || !cbg.group || !cbg.group.length) return p;
  var items = cbg.group.slice().sort(function (a, b){ return ((a.cb.role === 'movie') ? 0 : 1) - ((b.cb.role === 'movie') ? 0 : 1) || a.off - b.off; });
  var q = p, ids = [];
  for (var i = 0; i < items.length; i++){
    var o = {}, q2 = pasteClip(q, items[i].cb, Math.round(t) + items[i].off, o);
    if (q2 === q || !o.id) return p;
    q = q2; ids.push(o.id);
  }
  q = cloneProject(q); var g = newId('g');
  ids.forEach(function (id){ var f = findClip(q, id); if (f) f.clip.group = g; });
  out.ids = ids; out.id = ids[0];
  return finish(q);
}

// ---------- smooth slow-motion ----------`, 'project: group functions');
rep(pj, 'setReverse: setReverse, linkedClips: linkedClips,', 'setReverse: setReverse, linkedClips: linkedClips, groupIds: groupIds, groupClips: groupClips, ungroupClips: ungroupClips, copyGroup: copyGroup, pasteGroup: pasteGroup,', 'project: exports');
// moving and deleting reach the whole group
rep(pj, "ids.forEach(function (id){ linkedIds(q, id).forEach(function (cid){ if (seen[cid]) return; seen[cid] = 1; var f = findClip(q, cid); if (f && !f.track.locked) list.push(f.clip); }); });",
  "ids.forEach(function (id0){ groupIds(q, id0).forEach(function (id){ linkedIds(q, id).forEach(function (cid){ if (seen[cid]) return; seen[cid] = 1; var f = findClip(q, cid); if (f && !f.track.locked) list.push(f.clip); }); }); });", 'project: moving reaches the group');
rep(pj, "var q = p; (ids || []).forEach(function (id){ q = deleteClip(q, id); });",
  "var q = p, all = [], seen = {}; (ids || []).forEach(function (id0){ groupIds(p, id0).forEach(function (g){ if (!seen[g]){ seen[g] = 1; all.push(g); } }); });\n  all.forEach(function (id){ q = deleteClip(q, id); });", 'project: deleting reaches the group');
// a pasted copy is never part of the old group
rep(pj, "delete copy.curve; delete copy.transition;\n  if (copy.asset && !q.assets[copy.asset]) return p;", "delete copy.curve; delete copy.transition; delete copy.group;\n  if (copy.asset && !q.assets[copy.asset]) return p;", 'project: a pasted clip leaves the group');
rep(pj, "var cc = JSON.parse(JSON.stringify(l.clip)); delete cc.curve;", "var cc = JSON.parse(JSON.stringify(l.clip)); delete cc.curve; delete cc.group;", 'project: a pasted sound leaves the group');

// ---------- editor.js ----------
rep(ed, "(E.multi && E.multi[c.id] ? ' multi' : ''));\n    e.dataset.id = c.id;", "(E.multi && E.multi[c.id] ? ' multi' : '') + (c.group ? ' grp' : ''));\n    e.dataset.id = c.id;", 'editor: grouped clips look grouped');
rep(ed, "function closeTool(){ E.multi = {}; E.tool = null;", "function closeTool(){ E.multi = {}; E.pickMulti = false; E.tool = null;", 'editor: closing the tool stops picking');
// tapping a clip of a group selects the whole group; Pick clips mode adds and removes single clips
rep(ed, "var id = clipE.dataset.id, f = P.findClip(E.proj, id); if (!f) return;\n      if (E.multi && Object.keys(E.multi).length) E.multi = {};\n      var wasSel = E.sel === id; E.sel = id; var tr = f.track, c = f.clip;",
`var id = clipE.dataset.id, f = P.findClip(E.proj, id); if (!f) return;
      if (E.pickMulti && E.tool === 'select' && !handle){   // Pick clips: each tap adds the clip to the selection or takes it out
        delete E.pointers[ev.pointerId]; E.multi = E.multi || {}; if (E.multi[id]) delete E.multi[id]; else E.multi[id] = true; E.sel = null; renderSelectionOnly(); return;
      }
      if (E.multi && Object.keys(E.multi).length) E.multi = {};
      var wasSel = E.sel === id; E.sel = id; var tr = f.track, c = f.clip;
      var gm = P.groupIds ? P.groupIds(E.proj, id) : [id]; if (gm.length > 1){ E.multi = {}; gm.forEach(function (g){ E.multi[g] = true; }); }   // a group is selected as a whole`, 'editor: tap selects the group');
// dragging one clip of a group moves them all
rep(ed, "var cur0 = E.hist.cur, rowMove = d.target ?",
`var cur0 = E.hist.cur, gm0 = (P.groupIds && !d.target) ? P.groupIds(cur0, d.id) : [];
      if (gm0.length > 1 && d.newStart !== d.s0){
        var gq = P.moveClips(cur0, gm0, d.newStart - d.s0);
        if (gq === cur0){ renderTimeline(); toast('There is no room to move the group there.'); } else commit(gq);
        return;
      }
      var rowMove = d.target ?`, 'editor: dragging moves the group');
// copy and paste
rep(ed, "var cb = P.copyClip(E.hist.cur, id); if (!cb){ toast('That clip cannot be copied.'); return; }", "var cb = (P.copyGroup && P.copyGroup(E.hist.cur, id)) || P.copyClip(E.hist.cur, id); if (!cb){ toast('That clip cannot be copied.'); return; }", 'editor: copy a group');
rep(ed, "var out = {}, q = P.pasteClip(E.hist.cur, CB, Math.round(E.t), out);", "var out = {}, q = CB.group ? P.pasteGroup(E.hist.cur, CB, Math.round(E.t), out) : P.pasteClip(E.hist.cur, CB, Math.round(E.t), out);", 'editor: paste a group');
// the buttons
rep(ed, "  function copySel(){",
`  function selInGroup(){ return selIds().some(function (id){ return P.groupIds(E.proj, id).length > 1; }); }
  function groupSel(){
    var ids = selIds(); if (ids.length < 2){ toast('Pick two or more clips first (Pick clips, Select right or Select all).', 5000); return; }
    var q = P.groupClips(E.hist.cur, ids); if (q === E.hist.cur){ toast('They could not be grouped. Clips on locked rows cannot join a group.', 5000); return; }
    E.pickMulti = false; commit(q); toast('Grouped. Tap one clip to select the whole group. They move, copy and delete together.', 6000);
  }
  function ungroupSel(){
    var q = E.hist.cur; selIds().forEach(function (id){ q = P.ungroupClips(q, id); });
    if (q === E.hist.cur){ toast('Those clips are not in a group.'); return; }
    E.multi = {}; E.sel = null; commit(q); toast('Ungrouped.');
  }
  function togglePick(){ E.pickMulti = !E.pickMulti; toast(E.pickMulti ? 'Tap clips to add or remove them. Tap Pick clips again when you are done.' : 'Picking is off.', 5000); renderDock(); }
  function copySel(){`, 'editor: group functions');
rep(ed, "{ id: 'edSelClear', label: 'Clear', icon: G.reset, run: clearMulti, disabled: !n },",
  "{ id: 'edSelClear', label: 'Clear', icon: G.reset, run: clearMulti, disabled: !n },\n      { id: 'edSelPick', label: E.pickMulti ? 'Picking: on' : 'Pick clips', icon: G.sel, run: togglePick, on: !!E.pickMulti },\n      { id: 'edSelGroup', label: 'Group', icon: G.join, run: groupSel, disabled: selIds().length < 2 },\n      { id: 'edSelUngroup', label: 'Ungroup', icon: G.gap, run: ungroupSel, disabled: !selInGroup() },", 'editor: Pick, Group and Ungroup buttons');

if (css) css.text = css.text.replace(/\n*$/, '\n') + '.ed-clip.grp{box-shadow:inset 0 -3px 0 #ffd400}\n';
if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(pj); save(ed); if (css) save(css);
console.log('Done.' + (css ? '' : ' (editor.css was not found, so grouped clips have no yellow line.)') + '\nNow run:  node tests/group-clips.test.js   and then   npm test');