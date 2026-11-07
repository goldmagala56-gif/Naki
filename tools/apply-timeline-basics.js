'use strict';
// node tools/apply-timeline-basics.js   (from the project folder)
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
if (pj.text.includes('function pasteClip')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- project.js ----------
rep(pj, '// ---------- undo / redo ----------', `// ---------- copy, paste, paste look, moving several clips ----------
var LOOK_KEYS = {
  video: ['filter', 'opacity', 'transform', 'crop', 'grade', 'stabilize', 'vFadeIn', 'vFadeOut'],
  audio: ['volume', 'afx', 'fadeIn', 'fadeOut'],
  text: ['size', 'color', 'pos', 'weight', 'bg', 'font', 'outline', 'shadow', 'anim'],
  overlay: ['x', 'y', 'size', 'rot', 'opacity', 'blend', 'mask', 'chroma'],
  sticker: ['color', 'size', 'rot']
};
function lookKind(tr){ return (tr.kind === 'video' || tr.kind === 'audio' || tr.kind === 'text' || tr.kind === 'overlay' || tr.kind === 'sticker') ? tr.kind : null; }
// What Copy keeps: the clip, the row it came from, and (for a picture clip) its linked movie sound.
function copyClip(p, id){
  var f = findClip(p, id); if (!f) return null;
  var cb = { trackId: f.track.id, kind: f.track.kind, role: f.track.role, family: rowFamily(f.track), clip: JSON.parse(JSON.stringify(f.clip)), linked: [] };
  if (f.track.role === 'movie' && f.clip.link) linkedClips(p, id).forEach(function (x){ if (x && x.clip.id !== id) cb.linked.push({ role: x.track.role, clip: JSON.parse(JSON.stringify(x.clip)) }); });
  return cb;
}
// Puts a copied clip at time t. out.id = the new clip. Nothing fits: the same project comes back.
function pasteClip(p, cb, t, out){
  out = out || {};
  if (!cb || !cb.clip || !(p.durationMs > 0)) return p;
  var q = cloneProject(p), dur = Math.round(cb.clip.dur), start = Math.max(0, Math.round(t)), copy = JSON.parse(JSON.stringify(cb.clip));
  delete copy.curve; delete copy.transition;
  if (copy.asset && !q.assets[copy.asset]) return p;
  if (cb.role === 'movie'){
    var lane = pictureLane(q); if (!lane || lane.locked) return p;
    lane.clips.forEach(function (c){ if (c.start < start && start < clipEnd(c)) start = clipEnd(c); });
    q.tracks.forEach(function (tr){ if (tr.role !== 'movie' && tr.role !== 'movieSound') return; tr.clips.forEach(function (c){ if (c.start >= start) c.start += dur; }); });
    var link = newId('l');
    copy.id = newId('c'); copy.start = start; if (cb.linked && cb.linked.length) copy.link = link; else delete copy.link;
    lane.clips.push(copy); out.id = copy.id;
    (cb.linked || []).forEach(function (l){
      var tr = q.tracks.filter(function (x){ return x.role === l.role; })[0]; if (!tr) return;
      var cc = JSON.parse(JSON.stringify(l.clip)); delete cc.curve; cc.id = newId('c'); cc.start = start; cc.link = link; tr.clips.push(cc);
    });
    return finish(q);
  }
  var fam = cb.family, dest = null;
  var rows = q.tracks.filter(function (x){ return !x.locked && (fam ? rowFamily(x) === fam : x.id === cb.trackId); });
  function free(tr, s){ return !tr.clips.some(function (c){ return s < clipEnd(c) && s + dur > c.start; }); }
  if (!fam){
    if (!rows.length) return p;
    dest = rows[0];
    var moved = true; while (moved){ moved = false; dest.clips.forEach(function (c){ if (start < clipEnd(c) && start + dur > c.start){ start = clipEnd(c); moved = true; } }); }
  } else {
    for (var i = 0; i < rows.length && !dest; i++) if (free(rows[i], start)) dest = rows[i];
  }
  var d = Math.min(dur, p.durationMs - start); if (d < Math.min(dur, 300)) return p;
  if (!dest){
    var prefix = { sticker: 't-stk', overlay: 't-ov', fx: 't-vfx', layout: 't-lay', sfx: 't-fx', text: 't-text' }[fam] || 't-row', k = 1;
    while (q.tracks.some(function (x){ return x.id === prefix + k; })) k++;
    dest = { id: prefix + k, kind: cb.kind, role: cb.role, muted: false, hidden: false, volume: 1, locked: false, clips: [] };
    var idx = []; q.tracks.forEach(function (x, j){ if (rowFamily(x) === fam) idx.push(j); });
    if (idx.length) q.tracks.splice(Math.max.apply(null, idx) + 1, 0, dest); else q.tracks.push(dest);
  }
  copy.id = newId('c'); copy.start = start; delete copy.link;
  if (d < dur){
    copy.dur = d;
    if (copy.gain && copy.gain.length) copy.gain = gainSlice(cb.clip.gain, 0, d);
    if (copy.kf && _AN) copy.kf = kfSlice(copy.kf, 0, d);
    if (copy.fadeOut){ copy.fadeOut = 0; copy.fadeOutOff = 0; }
    delete copy.vFadeOut;
  }
  dest.clips.push(copy); out.id = copy.id;
  return finish(q);
}
// The look of one clip (its colour, sound effects, text style... see LOOK_KEYS), to paste onto other clips of the same kind.
function captureLook(p, id){
  var f = findClip(p, id), kind = f && lookKind(f.track); if (!kind) return null;
  var data = {}; LOOK_KEYS[kind].forEach(function (k){ if (f.clip[k] !== undefined) data[k] = JSON.parse(JSON.stringify(f.clip[k])); });
  return { kind: kind, data: data };
}
// Gives every clip in ids (of the same kind) that look. What the source does not have is taken away from the target.
function pasteLook(p, look, ids){
  if (!look || !ids || !ids.length) return p;
  var q = cloneProject(p);
  ids.forEach(function (id){
    var f = findClip(q, id); if (!f || f.track.locked || lookKind(f.track) !== look.kind) return;
    var c = f.clip, half = Math.floor(c.dur / 2);
    LOOK_KEYS[look.kind].forEach(function (k){
      if (k === 'stabilize' && c.type !== 'video') return;
      if (look.data[k] !== undefined) c[k] = JSON.parse(JSON.stringify(look.data[k])); else delete c[k];
    });
    ['vFadeIn', 'vFadeOut'].forEach(function (k){ if (c[k] != null){ if (c[k] > half) c[k] = half; if (!c[k]) delete c[k]; } });
    ['fadeIn', 'fadeOut'].forEach(function (k){ if (c[k] > half) c[k] = half; });
    if (c.fadeInOff) c.fadeInOff = 0; if (c.fadeOutOff) c.fadeOutOff = 0;
  });
  return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) ? p : finish(q);
}
// Moves several clips together by delta ms (linked sound goes with its picture). Clips on locked rows stay. Refuses when they would land on other clips.
function moveClips(p, ids, delta){
  delta = Math.round(delta); if (!delta || !ids || !ids.length) return p;
  var q = cloneProject(p), seen = {}, list = [];
  ids.forEach(function (id){ linkedIds(q, id).forEach(function (cid){ if (seen[cid]) return; seen[cid] = 1; var f = findClip(q, cid); if (f && !f.track.locked) list.push(f.clip); }); });
  if (!list.length) return p;
  var minStart = Math.min.apply(null, list.map(function (c){ return c.start; }));
  if (minStart + delta < 0) delta = -minStart;
  if (!delta) return p;
  list.forEach(function (c){ c.start += delta; });
  return validate(q).length ? p : finish(q);
}
// The ids of every clip that starts at or after time t (rows that are locked are left out).
function selectRight(p, t){
  var out = []; t = Math.round(t) - 1;
  p.tracks.forEach(function (tr){ if (tr.locked) return; tr.clips.forEach(function (c){ if (c.start >= t) out.push(c.id); }); });
  return out;
}
function deleteClips(p, ids){
  var q = p; (ids || []).forEach(function (id){ q = deleteClip(q, id); });
  return q;
}

// ---------- undo / redo ----------`, 'project: timeline basics');
rep(pj, 'layoutsAt: layoutsAt };', 'layoutsAt: layoutsAt,\n  copyClip: copyClip, pasteClip: pasteClip, captureLook: captureLook, pasteLook: pasteLook, moveClips: moveClips, selectRight: selectRight, deleteClips: deleteClips };', 'project: exports');

// ---------- editor.js ----------
rep(ed, "go: function (){ openTool('marker'); } }", `go: function (){ openTool('marker'); } },
    { name: 'select', label: 'Select', icon: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2 4-4"/>'), go: function (){ openTool('select'); } }`, 'editor: toolbar button');
rep(ed, 'if (E.sel && !P.findClip(E.proj, E.sel)) E.sel = null;\n    renderAll(); syncMedia(); syncDock(); queueSave();',
  "if (E.sel && !P.findClip(E.proj, E.sel)) E.sel = null;\n    if (E.multi) Object.keys(E.multi).forEach(function (id){ if (!P.findClip(E.proj, id)) delete E.multi[id]; });\n    renderAll(); syncMedia(); syncDock(); queueSave();", 'editor: afterEdit prunes the selection');
rep(ed, "function closeTool(){ E.tool = null; E.panel = null; E.autoDock = false; E.sel = null;", "function closeTool(){ E.multi = {}; E.tool = null; E.panel = null; E.autoDock = false; E.sel = null;", 'editor: back arrow clears the selection');
rep(ed, "var e = mk('div', 'ed-clip ' + clipKind(tr, c) + (c.id === E.sel ? ' sel' : ''));", "var e = mk('div', 'ed-clip ' + clipKind(tr, c) + (c.id === E.sel ? ' sel' : '') + (E.multi && E.multi[c.id] ? ' multi' : ''));", 'editor: clip outline');
rep(ed, "for (var i = 0; i < els.length; i++) els[i].classList.toggle('sel', els[i].dataset.id === E.sel);", "for (var i = 0; i < els.length; i++){ els[i].classList.toggle('sel', els[i].dataset.id === E.sel); els[i].classList.toggle('multi', !!(E.multi && E.multi[els[i].dataset.id])); }", 'editor: outline on tap');
rep(ed, 'var wasSel = E.sel === id; E.sel = id;', 'if (E.multi && Object.keys(E.multi).length) E.multi = {};\n      var wasSel = E.sel === id; E.sel = id;', 'editor: tapping a clip clears the group');
rep(ed, "E.tool = null; E.panel = null; E.autoDock = false; E.rowScroll = null; E.chip = {};", "E.multi = {}; E.tool = null; E.panel = null; E.autoDock = false; E.rowScroll = null; E.chip = {};", 'editor: open resets the group');
rep(ed, "len = d.e0 - d.s0, th = 8 / E.ppm;", "len = d.e0 - d.s0, th = snapTh();", 'editor: snap guide');
rep(ed, "(E.hist.cur, id).map(function (x){ return x.clip.id; }), th = 8 / E.ppm;", "(E.hist.cur, id).map(function (x){ return x.clip.id; }), th = snapTh();", 'editor: snap move');
rep(ed, "function snapped(t){ return P.snapTime(E.proj, t, 8 / E.ppm, snapPts()); }", "function snapped(t){ return P.snapTime(E.proj, t, snapTh(), snapPts()); }", 'editor: snap trim');
rep(ed, "else if (k === 'd' || k === 'D') duplicateSel();", "else if (k === 'd' || k === 'D') duplicateSel();\n      else if (k === 'c' || k === 'C') copySel();\n      else if (k === 'v' || k === 'V'){ if (ev.shiftKey) pasteLookHere(); else pasteHere(); }", 'editor: keys');

rep(ed, '  // ----- save still: the picture at the playhead as a PNG, in one tap -----', `  // ----- timeline basics: copy / paste, paste look, several clips at once, snapping switch -----
  var CB = null, LOOKCB = null;
  G.paste = svg('<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V3h6v2"/>');
  G.sel = svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2 4-4"/>');
  (function (){
    if (typeof document === 'undefined' || !document.head) return;
    var s = document.createElement('style'); s.textContent = '.ed-clip.multi{outline:2px solid #ff9f1c;outline-offset:-2px}'; document.head.appendChild(s);
  })();
  function snapTh(){ return E.snap === false ? 0 : 8 / E.ppm; }
  function toggleSnap(){ E.snap = (E.snap === false); toast(E.snap === false ? 'Snapping off: clips move freely.' : 'Snapping on: clips snap to edges, the playhead and markers.'); renderDock(); }
  // the clips tools work on: the group when there is one, else the tapped clip
  function selIds(){
    var ids = Object.keys(E.multi || {});
    if (!ids.length && E.sel) ids = [E.sel];
    return ids.filter(function (id){ return P.findClip(E.proj, id); });
  }
  function setMulti(ids){ E.multi = {}; ids.forEach(function (id){ E.multi[id] = true; }); E.sel = null; renderTimeline(); renderDock(); }
  function clearMulti(){ E.multi = {}; renderTimeline(); renderDock(); }
  function selectRightHere(){
    var ids = P.selectRight(E.hist.cur, Math.round(E.t));
    if (!ids.length){ toast('There are no clips after the playhead.'); return; }
    setMulti(ids); toast(ids.length + ' clip' + (ids.length === 1 ? '' : 's') + ' selected. Use Move or Delete, or Clear to let go.', 5000);
  }
  function selectAllClips(){
    var ids = P.selectRight(E.hist.cur, 0);
    if (!ids.length){ toast('There are no clips yet.'); return; }
    setMulti(ids); toast(ids.length + ' clips selected.', 4000);
  }
  function deleteMulti(){
    var ids = selIds(); if (!ids.length){ toast('Select a clip first.'); return; }
    var q = P.deleteClips(E.hist.cur, ids); if (q === E.hist.cur){ toast('Those rows are locked or there is nothing to delete.'); return; }
    E.multi = {}; E.sel = null; commit(q); toast(ids.length === 1 ? 'Deleted.' : 'Deleted ' + ids.length + ' clips. Undo brings them back.', 4000);
  }
  function moveSel(delta){
    var ids = selIds(); if (!ids.length){ toast('Select a clip first.'); return; }
    var q = P.moveClips(E.hist.cur, ids, delta); if (q === E.hist.cur){ toast('There is no room to move them that way.'); return; }
    commit(q);
  }
  function moveSelToHead(){
    var ids = selIds(); if (!ids.length){ toast('Select a clip first.'); return; }
    var first = null; ids.forEach(function (id){ var f = P.findClip(E.proj, id); if (f && (first === null || f.clip.start < first)) first = f.clip.start; });
    var delta = Math.round(E.t) - first; if (!delta){ toast('They already start here.'); return; }
    moveSel(delta);
  }
  function copySel(){
    var id = E.sel || selIds()[0]; if (!id){ toast('Tap a clip first.'); return; }
    var cb = P.copyClip(E.hist.cur, id); if (!cb){ toast('That clip cannot be copied.'); return; }
    CB = cb; toast('Copied. Move the playhead, then tap Paste.'); renderDock();
  }
  function pasteHere(){
    if (!CB){ toast('Copy a clip first.'); return; }
    var out = {}, q = P.pasteClip(E.hist.cur, CB, Math.round(E.t), out);
    if (q === E.hist.cur){ toast('There is no room to paste here. Move the playhead earlier.'); return; }
    var nf = out.id && P.findClip(q, out.id); if (nf) E.t = nf.clip.start;
    E.multi = {}; E.sel = out.id || null; commit(q); toast('Pasted.');
  }
  function copyLook(){
    var id = E.sel || selIds()[0]; if (!id){ toast('Tap a clip first.'); return; }
    var lk = P.captureLook(E.hist.cur, id); if (!lk){ toast('That clip has no look to copy.'); return; }
    LOOKCB = lk; toast('Look copied. Select other clips of the same kind, then tap Paste look.', 5000); renderDock();
  }
  function pasteLookHere(){
    if (!LOOKCB){ toast('Copy a look first.'); return; }
    var ids = selIds(); if (!ids.length){ toast('Select the clips to paste onto first.'); return; }
    var q = P.pasteLook(E.hist.cur, LOOKCB, ids);
    if (q === E.hist.cur){ toast('Nothing changed. Paste look only works on clips of the same kind, with a different look.', 6000); return; }
    commit(q); toast('Look pasted.');
  }
  PANELS.shiftclips = { title: 'Move selected', build: function (body){
    var ids = selIds();
    if (!ids.length){ body.appendChild(mk('div', 'ed-hint', 'Select clips first: Select right, Select all, or tap a clip.')); return; }
    var o = E.chip.shift || (E.chip.shift = { ms: 500 });
    body.appendChild(chips([100, 500, 1000, 5000].map(function (v){ return { key: v, label: secs(v) }; }), o.ms, function (k){ o.ms = k; renderDock(); }));
    body.appendChild(actions([
      { id: 'edShiftEarlier', label: 'Earlier', run: function (){ moveSel(-o.ms); } },
      { id: 'edShiftLater', label: 'Later', run: function (){ moveSel(o.ms); } },
      { id: 'edShiftHead', label: 'Start at playhead', run: moveSelToHead }]));
    body.appendChild(mk('div', 'ed-hint', ids.length + ' clip' + (ids.length === 1 ? '' : 's') + ' selected. They move together, and a picture moves with its sound. If something is in the way, nothing moves. Clips on locked rows stay where they are.'));
  } };
  ROWS.select = function (){
    var n = Object.keys(E.multi || {}).length, any = selIds().length > 0;
    return [
      { id: 'edSelCopy', label: 'Copy', icon: G.dup, run: copySel, disabled: !any },
      { id: 'edSelPaste', label: 'Paste', icon: G.paste, run: pasteHere, disabled: !CB },
      { id: 'edSelCopyLook', label: 'Copy look', icon: G.style, run: copyLook, disabled: !any },
      { id: 'edSelPasteLook', label: 'Paste look', icon: G.style, run: pasteLookHere, disabled: !LOOKCB || !any },
      { id: 'edSelRight', label: 'Select right', icon: G.gap, run: selectRightHere },
      { id: 'edSelAll', label: 'Select all', icon: G.sel, run: selectAllClips },
      { id: 'edSelClear', label: 'Clear', icon: G.reset, run: clearMulti, disabled: !n },
      { id: 'edSelMove', label: 'Move', icon: G.join, run: function (){ openPanel('shiftclips'); }, disabled: !any },
      { id: 'edSelDelete', label: 'Delete', icon: G.trash, run: deleteMulti, disabled: !any },
      { id: 'edSnap', label: 'Snapping', icon: G.magnet, run: toggleSnap, on: E.snap !== false }
    ];
  };
  // Copy / Paste / Copy look / Paste look are also at the end of the other tool rows, so they are in reach when a clip is tapped.
  ['edit', 'audio', 'text', 'sticker', 'overlay', 'fx', 'layout'].forEach(function (k){
    var orig = ROWS[k]; if (!orig) return;
    ROWS[k] = function (){
      return orig().concat([
        { id: 'edXCopy', label: 'Copy', icon: G.dup, run: copySel },
        { id: 'edXPaste', label: 'Paste', icon: G.paste, run: pasteHere, disabled: !CB },
        { id: 'edXCopyLook', label: 'Copy look', icon: G.style, run: copyLook },
        { id: 'edXPasteLook', label: 'Paste look', icon: G.style, run: pasteLookHere, disabled: !LOOKCB }]);
    };
  });

  // ----- save still: the picture at the playhead as a PNG, in one tap -----`, 'editor: block');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(pj); save(ed);
console.log('Done.\nNow run:  node tests/timeline-basics.test.js   and then   npm test');