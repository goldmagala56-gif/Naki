'use strict';
// node tools/apply-small-tools-a.js   (from the project folder)
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
const pr = load('www/project.js'), pl = load('www/plan.js'), ex = load('www/export-engine.js'), wc = load('www/webcodecs-export.js'), ed = load('www/editor.js');
if (pr.text.includes('function setDenoise')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

/* ---------- project.js ---------- */
const PJ_BLOCK = `// ---------- noise reduction, motion blur, intro / outro pieces and countdowns ----------
// Noise reduction lives on a sound row (track.denoise, 0 to 1); the export takes steady background noise out of that row. Motion blur (clip.mblur, 0 to 1)
// blends the frames while a picture clip zooms / pans or an overlay moves (it needs keyframes or a motion preset to have anything to blur).
function setDenoise(p, trackId, amount){
  var tr0 = p.tracks.filter(function (t){ return t.id === trackId && t.kind === 'audio'; })[0]; if (!tr0) return p;
  var v = r3(Math.max(0, Math.min(1, +amount))); if (isNaN(v)) return p; if (v < 0.01) v = 0;
  if ((tr0.denoise || 0) === v) return p;
  var q = cloneProject(p), tr = q.tracks.filter(function (t){ return t.id === trackId; })[0];
  if (v) tr.denoise = v; else delete tr.denoise;
  return q;
}
function setMotionBlur(p, id, amount){
  var f = findClip(p, id), kind = f && kfKind(f.track); if (kind !== 'overlay' && kind !== 'picture') return p;
  if (f.clip.gen && f.clip.gen.full) return p;
  var v = r3(Math.max(0, Math.min(1, +amount))); if (isNaN(v)) return p; if (v < 0.05) v = 0;
  if ((f.clip.mblur || 0) === v) return p;
  var q = cloneProject(p), c = findClip(q, id).clip; if (v) c.mblur = v; else delete c.mblur;
  return finish(q);
}
var PIECE_LIST = [
  { key: 'part', label: 'Part', numbered: true, text: function (n){ return 'Part ' + n; }, size: 14, pos: 'center', dur: 2500, bg: true },
  { key: 'chapter', label: 'Chapter', numbered: true, text: function (n){ return 'Chapter ' + n; }, size: 12, pos: 'center', dur: 2500, bg: true },
  { key: 'welcome', label: 'Welcome', text: 'Welcome', size: 14, pos: 'center', dur: 3000, bg: true },
  { key: 'thanks', label: 'Thanks for watching', text: 'Thanks for watching', size: 9, pos: 'center', dur: 3500, bg: true },
  { key: 'end', label: 'The End', text: 'The End', size: 14, pos: 'center', dur: 3000, bg: true },
  { key: 'tbc', label: 'To be continued', text: 'To be continued...', size: 8, pos: 'bottom', dur: 3000, bg: true }
];
// The text animation to use for a piece: the first of prefs that exists in motion.js, else any "in" animation, else none.
function pieceAnim(list, prefs){
  if (!_MO || !list) return null;
  for (var i = 0; i < prefs.length; i++) if (_MO.has(list, prefs[i])) return prefs[i];
  for (var j = 0; j < list.length; j++) if (list[j] && list[j].key && list[j].key !== 'none') return list[j].key;
  return null;
}
// A ready-made title card as an ordinary text clip at t. n = the number for Part / Chapter.
function addPiece(p, t, key, n, out){
  var d = PIECE_LIST.filter(function (x){ return x.key === key; })[0]; if (!d) return p;
  var o = {}, q = addTextClip(p, t, d.dur, o); if (q === p) return p;
  var num = Math.max(1, Math.min(99, Math.round(+n || 1)));
  q = setTextProps(q, o.id, { text: typeof d.text === 'function' ? d.text(num) : d.text, size: d.size, pos: d.pos, bg: d.bg, color: '#ffffff', weight: 700, outline: 0 });
  var a = pieceAnim(_MO && _MO.TEXT_IN, ['pop', 'zoom', 'fade']); if (a) q = setTextAnim(q, o.id, { in: a });
  if (out) out.id = o.id;
  return q;
}
// A countdown: one text clip a second long for each number, back to back from t. If anything in the way would move one of them, nothing is added.
function addCountdown(p, t, from, out){
  from = Math.max(2, Math.min(10, Math.round(+from || 3)));
  var q = p, ids = [], a = pieceAnim(_MO && _MO.TEXT_IN, ['pop', 'zoom', 'fade']);
  for (var i = 0; i < from; i++){
    var o = {}, want = Math.round(t) + i * 1000, r = addTextClip(q, want, 1000, o);
    if (r === q) return p;
    var f = findClip(r, o.id); if (!f || f.clip.start !== want || f.clip.dur < 900) return p;
    q = setTextProps(r, o.id, { text: String(from - i), size: 16, pos: 'center', color: '#ffffff', weight: 700, bg: false, outline: 0.5 });
    if (a) q = setTextAnim(q, o.id, { in: a });
    ids.push(o.id);
  }
  if (out){ out.id = ids[0]; out.ids = ids; }
  return q;
}

`;
const PJ_ANCHOR = pr.text.includes('// ---------- picture in picture presets ----------') ? '// ---------- picture in picture presets ----------' : '// ---------- rows (layers): moving a clip to another row, or onto a row of its own ----------';
rep(pr, PJ_ANCHOR, PJ_BLOCK + PJ_ANCHOR, 'project: noise reduction, motion blur, pieces');
rep(pr, `setReverse: setReverse, linkedClips: linkedClips,`, `setReverse: setReverse, linkedClips: linkedClips, setDenoise: setDenoise, setMotionBlur: setMotionBlur, addPiece: addPiece, addCountdown: addCountdown, PIECES: PIECE_LIST.map(function (d){ return { key: d.key, label: d.label, numbered: !!d.numbered }; }),`, 'project: exports');

/* ---------- plan.js ---------- */
rep(pl, `if (tr.role === 'sfx') a.file = c.asset + '.in';`, `if (tr.denoise) a.denoise = tr.denoise;\n        if (tr.role === 'sfx') a.file = c.asset + '.in';`, 'plan: noise reduction');
rep(pl, `if (c.blend) o.blend = c.blend;`, `if (c.mblur) o.mblur = c.mblur;\n        if (c.blend) o.blend = c.blend;`, 'plan: overlay motion blur');
rep(pl, `if (c.vFadeIn) sp.vFadeIn = c.vFadeIn;`, `if (c.mblur) sp.mblur = c.mblur;\n      if (c.vFadeIn) sp.vFadeIn = c.vFadeIn;`, 'plan: picture motion blur');

/* ---------- export-engine.js (compatible engine) ---------- */
rep(ex, `function enhanceChain(src, c) {`, `// Noise reduction on a sound row: ffmpeg's own noise remover, 6 to 30 dB.\n  function denoiseChain(c) { return c.denoise ? ',afftdn=nr=' + (6 + 24 * c.denoise).toFixed(1) + ':nf=-45:tn=1' : ''; }\n  function enhanceChain(src, c) {`, 'export-engine: noise reduction filter');
rep(ex, `sourceChain(src, ai) + enhanceChain(src, c)`, `sourceChain(src, ai) + denoiseChain(c) + enhanceChain(src, c)`, 'export-engine: use it on each sound');
rep(ex, `if (sp.vFadeIn) parts.push(`, `if (sp.mblur && sp.kf) parts.push('tmix=frames=' + Math.round(2 + 3 * sp.mblur));   // motion blur on a zoom / pan: blend the last few frames\n    if (sp.vFadeIn) parts.push(`, 'export-engine: picture motion blur');
rep(ex, `if (!bm) {`,
`if (o.mblur && o.kf && !bm) {   // motion blur: the overlay is drawn on a see-through frame, the last few frames are blended, and that is laid over the picture
        var Lm = 'mb' + next, ci2 = next, oi2 = next + 1, part2 = ((sp.sessionEnd - sp.sessionStart) / 1000 + 1).toFixed(3);
        inputs.push('-f', 'lavfi', '-i', 'color=c=black@0:s=' + width + 'x' + height + ':r=' + FPS + ':d=' + part2 + ',format=rgba');
        inputs.push.apply(inputs, op.inputs);
        fc.push('[' + oi2 + ':v]' + op.chain + '[' + Lm + 'o]');
        fc.push('[' + ci2 + ':v][' + Lm + "o]overlay=x='" + op.x + "':y='" + op.y + "':eof_action=pass:format=auto,tmix=frames=" + Math.round(2 + 3 * o.mblur) + '[' + Lm + 'g]');
        fc.push('[' + cur + '][' + Lm + "g]overlay=eof_action=pass:enable='between(t," + op.a.toFixed(3) + ',' + op.b.toFixed(3) + ")'[v" + (++n) + ']');
        cur = 'v' + n; next += 2;
        return;
      }
      if (!bm) {`, 'export-engine: overlay motion blur');

/* ---------- webcodecs-export.js (fast engine): these edits are made by the compatible engine ---------- */
rep(wc, `if ((plan.audio || []).some(function (a) { return a.speed && a.speed !== 1; })) return false;`,
`if ((plan.audio || []).some(function (a) { return a.speed && a.speed !== 1; })) return false;
    if ((plan.audio || []).some(function (a) { return a.denoise; })) return false;   // noise reduction is made by the ffmpeg engine
    if ((plan.video || []).some(function (s) { return s.mblur; }) || (plan.overlays || []).some(function (o) { return o.mblur; })) return false;   // so is motion blur`, 'webcodecs: leave these to the compatible engine');

/* ---------- editor.js ---------- */
rep(ed, `{ id: 'edMotion', label: 'Motion', icon: G.motion, run: P2('motion') },`, `{ id: 'edMotion', label: 'Motion', icon: G.motion, run: P2('motion') },\n        { id: 'edMotionBlur', label: 'Motion blur', icon: G.mblur, run: P2('motionblur') },`, 'editor: Motion blur in the Edit row');
rep(ed, `{ id: 'edOverlayMotion', label: 'Motion', icon: G.motion, run: function (){ openPanel('motion'); }, disabled: !isO },`, `{ id: 'edOverlayMotion', label: 'Motion', icon: G.motion, run: function (){ openPanel('motion'); }, disabled: !isO },\n        { id: 'edOverlayMblur', label: 'Motion blur', icon: G.mblur, run: function (){ openPanel('motionblur'); }, disabled: !isO },`, 'editor: Motion blur in the Overlay row');
rep(ed, `items.push({ id: 'edVoiceFx', label: 'Enhance voice', icon: G.volume, run: function (){ openPanel('voicefx'); } });`, `items.push({ id: 'edVoiceFx', label: 'Enhance voice', icon: G.volume, run: function (){ openPanel('voicefx'); } });\n      items.push({ id: 'edDenoise', label: 'Noise reduction', icon: G.denoise, run: function (){ openPanel('denoise'); } });`, 'editor: Noise reduction in the Audio row');
rep(ed, `{ id: 'edCaptions', label: 'Captions', icon: G.captions, run: function (){ openPanel('captions'); } },`, `{ id: 'edCaptions', label: 'Captions', icon: G.captions, run: function (){ openPanel('captions'); } },\n        { id: 'edPieces', label: 'Intro / outro', icon: G.piece, run: function (){ openPanel('pieces'); } },`, 'editor: Intro / outro in the Text row');

const ED_BLOCK = `/* ---------- small tools: noise reduction, motion blur, intro / outro pieces and countdown ---------- */
  G.mblur = svg('<path d="M3 8h8M3 12h12M3 16h8"/><circle cx="17" cy="12" r="4"/>');
  G.denoise = svg('<path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4"/>');
  G.piece = svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10h8M8 14h5"/>');
  function addPieceHere(key, n){
    var out = {}, q = P.addPiece(E.hist.cur, Math.round(E.t), key, n, out);
    if (q === E.hist.cur){ toast('There is no room for a title at the playhead. Move it or shorten the other text.'); return; }
    E.sel = out.id; commit(q); openPanel('textedit', 'text');
  }
  function addCountdownHere(from){
    var out = {}, q = P.addCountdown(E.hist.cur, Math.round(E.t), from, out);
    if (q === E.hist.cur){ toast('There is no room for the countdown. It needs ' + from + ' free seconds of text row from the playhead.', 6000); return; }
    E.sel = out.ids[0]; commit(q); closePanel(); toast('Countdown added: one second for each number.');
  }
  PANELS.denoise = { title: 'Noise reduction', build: function (body){
    var tracks = E.proj.tracks.filter(function (t){ return t.kind === 'audio'; });
    if (!tracks.length){ body.appendChild(mk('div', 'ed-hint', 'There is no sound to clean.')); return; }
    var keys = tracks.map(function (t){ return { key: t.id, label: ROLE_NAME[t.role] || t.role }; }), cur = chipKey('denoise', keys, keys[0].key), tr = tracks.filter(function (t){ return t.id === cur; })[0];
    var set = function (v){ return P.setDenoise(E.hist.cur, tr.id, v / 100); };
    body.appendChild(chips(keys, cur, pickChip('denoise')));
    body.appendChild(sliderRow('Strength', 0, 100, 5, Math.round((tr.denoise || 0) * 100), pct, function (v){ live(set(v)); }, function (v){ commit(set(v)); }));
    body.appendChild(actions([{ id: 'edDenoiseOff', label: tr.denoise ? 'Turn off' : 'Off', on: !tr.denoise, run: function (){ commit(set(0)); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Takes out steady background noise such as hiss, hum and fan noise from the sound you pick. Start low: a high setting can make voices sound thin. The exported video has it, the preview does not. Videos with noise reduction export with the compatible engine, which takes longer.'));
  } };
  PANELS.motionblur = { title: 'Motion blur', build: function (body){
    var f = E.sel && P.findClip(E.proj, E.sel), isO = !!(f && f.track.kind === 'overlay'), c = isO ? f.clip : needPicture(body); if (!c) return;
    var set = function (v){ return P.setMotionBlur(E.hist.cur, c.id, v / 100); }, moves = !!(c.kf && Object.keys(c.kf).length);
    body.appendChild(sliderRow('Motion blur', 0, 100, 5, Math.round((c.mblur || 0) * 100), pct, function (v){ live(set(v)); }, function (v){ commit(set(v)); }));
    body.appendChild(mk('div', 'ed-hint', moves ? 'Blends the frames while this clip moves or zooms, so fast movement looks smooth instead of stepping. The preview does not show it, the exported video does (compatible engine, slower).' : 'This clip does not move yet, so there is nothing to blur. Add keyframes, or pick a Motion preset, then come back.'));
  } };
  PANELS.pieces = { title: 'Intro / outro', build: function (body){
    var tabs = [{ key: 'title', label: 'Titles' }, { key: 'count', label: 'Countdown' }], tab = chipKey('pieces', tabs, 'title'), o = E.chip.pieceOpt || (E.chip.pieceOpt = { n: 1, from: 3 });
    body.appendChild(chips(tabs, tab, pickChip('pieces')));
    if (tab === 'title'){
      body.appendChild(chips(P.PIECES.map(function (d){ return { key: d.key, label: d.label }; }), null, function (k){ addPieceHere(k, o.n); }));
      body.appendChild(chips([1, 2, 3, 4, 5, 6].map(function (n){ return { key: n, label: 'No. ' + n }; }), o.n, function (k){ o.n = k; renderDock(); }));
      body.appendChild(mk('div', 'ed-hint', 'Tap a title to put it at the playhead (the number is for Part and Chapter). It is a normal text clip, so you can change the words, style and animation afterwards.'));
    } else {
      body.appendChild(chips([3, 5, 10].map(function (n){ return { key: n, label: n + ' to 1' }; }), o.from, function (k){ o.from = k; renderDock(); }));
      body.appendChild(actions([{ id: 'edCountdownAdd', label: 'Add countdown here', run: function (){ addCountdownHere(o.from); } }]));
      body.appendChild(mk('div', 'ed-hint', 'Adds one big number for each second, starting at the playhead. Each number is its own text clip, so you can restyle or move them.'));
    }
  } };

  /* ---------- titles drawn over the preview ---------- */`;
rep(ed, `/* ---------- titles drawn over the preview ---------- */`, ED_BLOCK, 'editor: panels');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[pr, pl, ex, wc, ed].forEach(save);
console.log('Done.' + (notes.length ? '\n  ' + notes.join('\n  ') : '') + '\nNow run:  node tests/small-tools-a.test.js   and then   npm test');