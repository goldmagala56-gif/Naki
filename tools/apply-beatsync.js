'use strict';
// One-time patch: Beat sync (a beat grid on the music, cut the picture on the beats, fit clips to the beats, beat marks on the ruler).
// Run from the project folder, after copying www/beatsync.js and tests/beatsync.test.js into place:
//   node tools/apply-beatsync.js
// editor.js is checked first: if any spot is not found exactly once, NOTHING is changed and the list is printed.
// index.html and sw.js are changed only when their lines are found exactly once; if not, it tells you the one line to add by hand
// (the editor works without them: it just says beatsync.js is not loaded).
// It does not depend on apply-templates.js: run them in either order.
var fs = require('fs'), path = require('path');
var www = path.join(__dirname, '..', 'www');
var edPath = path.join(www, 'editor.js'), htmlPath = path.join(www, 'index.html'), swPath = path.join(www, 'sw.js');

if (!fs.existsSync(path.join(www, 'beatsync.js'))){
  console.log('www/beatsync.js is missing. Copy it into the www folder first, then run this again.'); process.exit(1);
}
var ed = fs.readFileSync(edPath, 'utf8');
if (ed.indexOf('beatsync.js') >= 0){ console.log('editor.js already has beat sync. Nothing to do.'); process.exit(0); }

function count(src, s){ return src.split(s).length - 1; }
function L(arr){ return arr.join('\n'); }

var FUNCS = L([
  '// ----- beat sync: a beat grid on the music, then cut and fit the picture to it -----',
  '  function bsNeed(){ if (NBS) return true; toast(\'Beat sync is not loaded. Add <script src="beatsync.js"></script> to index.html, before editor.js.\'); return false; }',
  '  function beatMusic(){ var tr = E.proj.tracks.filter(function (t){ return t.role === \'music\'; })[0]; return tr && tr.clips[0] ? tr.clips[0] : null; }',
  '  // Lets the browser decode the music file and finds the tempo and where the beats fall (the first 90 s of the part you use).',
  '  function detectBeatsNow(){',
  '    if (!bsNeed() || E.beatBusy) return;',
  '    var mc = beatMusic(); if (!mc){ toast(\'Add music first (Audio, then Add music).\'); return; }',
  '    var got = E.hooks.getAssetFile ? E.hooks.getAssetFile(\'music\') : null;',
  '    if (!got){ toast(\'The music file is not available here. Tap along, or type the tempo.\'); return; }',
  '    E.beatBusy = true; pause(); renderDock();',
  '    Promise.resolve(got).then(function (file){',
  '      if (!file) throw new Error(\'the music file is not available\');',
  '      return NBS.decodeFile(file);',
  '    }).then(function (d){',
  '      return NBS.analyzeBuffer(d.channels, d.sr, { startMs: mc.in, maxMs: Math.min(90000, mc.dur * (mc.speed || 1)) });',
  '    }).then(function (r){',
  '      E.beatBusy = false;',
  '      if (!r){ toast(\'No steady beat was found in the music. Tap along or type the tempo.\', 8000); renderDock(); return; }',
  '      commit(NBS.setGrid(E.hist.cur, r));',
  '      toast(\'Found \' + r.bpm.toFixed(1) + \' BPM. Check that the marks on the ruler sit on the beats. If there are twice or half as many as you feel, use \\u00f7 2 or \\u00d7 2.\', 9000);',
  '    }).catch(function (err){ E.beatBusy = false; renderDock(); toast(\'Could not read the music\' + (err && err.message ? \': \' + err.message : \'\') + \'. Tap along or type the tempo.\', 9000); });',
  '  }',
  '  // Tap along while the music plays: the taps are turned into the music file\'s own time, so the grid stays right wherever the music sits.',
  '  function tapBeat(){',
  '    if (!bsNeed()) return;',
  '    if (!beatMusic()){ toast(\'Add music first (Audio, then Add music).\'); return; }',
  '    if (!E.playing){ play(); toast(\'Playing. Tap along with the beat, at least 4 taps.\'); return; }',
  '    var now = performance.now(), bt = E.chip.beatTaps || (E.chip.beatTaps = { list: [], last: 0 });',
  '    if (now - bt.last > 2500) bt.list = [];',
  '    bt.last = now; var ft = NBS.fileTimeAt(E.hist.cur, E.t); if (ft != null) bt.list.push(ft);',
  '    bt.res = NBS.tapTempo(bt.list); renderDock();',
  '  }',
  '  // The beats as small marks along the bottom of the time ruler (not when they would be too crowded to see).',
  '  function drawBeatTicks(ruler){',
  '    if (!NBS) return;',
  '    var ts = NBS.beatTimes(E.proj, 1); if (ts.length < 2 || (ts[1] - ts[0]) * E.ppm < 5) return;',
  '    ts.slice(0, 1500).forEach(function (t, i){',
  '      var d = mk(\'i\'); d.style.cssText = \'position:absolute;bottom:0;width:1px;pointer-events:none;background:rgba(255,196,64,.9);height:\' + (i % 4 === 0 ? 9 : 5) + \'px;left:\' + tx(t) + \'px\';',
  '      ruler.appendChild(d);',
  '    });',
  '  }',
  '  function selText(){'
]);

var PANEL = L([
  'beats: { title: \'Beat sync\', build: function (body){',
  '      if (!NBS){ body.appendChild(mk(\'div\', \'ed-hint\', \'Beat sync is not loaded. Add <script src="beatsync.js"></script> to index.html, before editor.js.\')); return; }',
  '      var tabs = [{ key: \'grid\', label: \'1  Beat grid\' }, { key: \'cut\', label: \'2  Cut on beats\' }, { key: \'fit\', label: \'3  Fit clips\' }], tab = chipKey(\'beats\', tabs, \'grid\');',
  '      body.appendChild(chips(tabs, tab, pickChip(\'beats\')));',
  '      if (!beatMusic()){ body.appendChild(mk(\'div\', \'ed-hint\', \'Add music first (Audio, then Add music). The beat grid belongs to the music.\')); return; }',
  '      var g = NBS.gridOf(E.hist.cur), o = E.chip.beatOpt || (E.chip.beatOpt = { every: 4, beats: 0, method: \'trim\' });',
  '      if (tab === \'grid\'){',
  '        var bt = E.chip.beatTaps, tapRes = bt && bt.res;',
  '        body.appendChild(mk(\'div\', \'ed-hint\', g ? \'Beat grid: \' + g.bpm.toFixed(1) + \' BPM, a beat \' + (g.offsetMs / 1000).toFixed(2) + \' s into the music. The marks on the time ruler are the beats.\' : \'No beat grid yet. Let Naki listen to the music, tap along while it plays, or type the tempo below.\'));',
  '        body.appendChild(actions([{ id: \'edBeatDetect\', label: E.beatBusy ? \'Listening...\' : \'Detect from music\', run: detectBeatsNow },',
  '          { id: \'edBeatTap\', label: \'Tap along\' + (bt && bt.list.length ? \' (\' + bt.list.length + \')\' : \'\'), run: tapBeat }]));',
  '        if (tapRes) body.appendChild(actions([{ id: \'edBeatUseTap\', label: \'Use \' + tapRes.bpm.toFixed(1) + \' BPM from the taps\', run: function (){ E.chip.beatTaps = null; commit(NBS.setGrid(E.hist.cur, tapRes)); } }]));',
  '        if (g){',
  '          body.appendChild(sliderRow(\'Tempo\', NBS.MIN_BPM, NBS.MAX_BPM, 0.5, g.bpm, function (v){ return v.toFixed(1) + \' BPM\'; }, null, function (v){ commit(NBS.setGrid(E.hist.cur, { bpm: v, offsetMs: g.offsetMs })); }));',
  '          body.appendChild(sliderRow(\'First beat\', 0, Math.round(60000 / g.bpm), 5, Math.round(g.offsetMs), function (v){ return v + \' ms\'; }, null, function (v){ commit(NBS.setGrid(E.hist.cur, { bpm: g.bpm, offsetMs: v })); }));',
  '          body.appendChild(actions([',
  '            { id: \'edBeatHalf\', label: \'\\u00f7 2\', run: function (){ if (g.bpm / 2 < NBS.MIN_BPM){ toast(\'That is too slow.\'); return; } commit(NBS.setGrid(E.hist.cur, { bpm: g.bpm / 2, offsetMs: g.offsetMs })); } },',
  '            { id: \'edBeatDouble\', label: \'\\u00d7 2\', run: function (){ if (g.bpm * 2 > NBS.MAX_BPM){ toast(\'That is too fast.\'); return; } commit(NBS.setGrid(E.hist.cur, { bpm: g.bpm * 2, offsetMs: g.offsetMs })); } },',
  '            { id: \'edBeatClear\', label: \'Clear grid\', run: function (){ commit(NBS.setGrid(E.hist.cur, null)); } }]));',
  '        }',
  '        body.appendChild(mk(\'div\', \'ed-hint\', \'Detect works best on music with clear drums. Tempo is sometimes found at twice or half the speed you feel: press \\u00f7 2 or \\u00d7 2. If the marks are a little early or late, move First beat. The grid stays with the music clip when you move, trim or cut it.\'));',
  '      } else if (!g){',
  '        body.appendChild(mk(\'div\', \'ed-hint\', \'Set the beat grid first (tab 1).\'));',
  '      } else if (tab === \'cut\'){',
  '        body.appendChild(chips([{ key: 1, label: \'Every beat\' }, { key: 2, label: \'Every 2 beats\' }, { key: 4, label: \'Every bar (4)\' }, { key: 8, label: \'Every 2 bars\' }], o.every, function (k){ o.every = k; renderDock(); }));',
  '        var pts = NBS.cutPoints(E.hist.cur, o.every);',
  '        body.appendChild(mk(\'div\', \'ed-hint\', pts.length ? \'This will cut the picture in \' + pts.length + \' place\' + (pts.length === 1 ? \'\' : \'s\') + \'.\' : \'There are no new cuts to make at these beats.\'));',
  '        body.appendChild(actions([{ id: \'edBeatCut\', label: \'Cut on the beat\', run: function (){',
  '          var out = {}, q = NBS.cutOnBeats(E.hist.cur, { every: o.every }, out);',
  '          if (q === E.hist.cur){ toast(NBS.describe(out)); return; }',
  '          commit(q); toast(NBS.describe(out), 8000); } }]));',
  '        body.appendChild(mk(\'div\', \'ed-hint\', \'Cuts only the picture and its movie sound. Your voice, music and titles are not cut. Afterwards you can delete or move pieces, add transitions, or change speed on them. Undo takes all the cuts back at once.\'));',
  '      } else {',
  '        body.appendChild(chips([{ key: 0, label: \'Nearest beat\' }, { key: 1, label: \'1 beat\' }, { key: 2, label: \'2 beats\' }, { key: 4, label: \'4 beats\' }, { key: 8, label: \'8 beats\' }], o.beats, function (k){ o.beats = k; renderDock(); }));',
  '        body.appendChild(chips([{ key: \'trim\', label: \'Trim ends\' }, { key: \'speed\', label: \'Change speed\' }], o.method, function (k){ o.method = k; renderDock(); }));',
  '        body.appendChild(actions([{ id: \'edBeatFit\', label: \'Fit clips to the beat\', run: function (){',
  '          var out = {}, q = NBS.fitToBeats(E.hist.cur, { beats: o.beats, method: o.method }, out);',
  '          if (q === E.hist.cur){ toast(NBS.describe(out)); return; }',
  '          commit(q); toast(NBS.describe(out), 9000); } }]));',
  '        body.appendChild(mk(\'div\', \'ed-hint\', o.method === \'trim\'',
  '          ? \'Each picture clip is shortened so it ends on a beat (a clip that would have to get longer is left alone). Gaps close. Nothing plays faster or slower.\'',
  '          : \'Each picture clip plays a little faster or slower (between half and double speed) so it ends exactly on a beat. The movie sound changes with it; your voice does not.\'));',
  '        body.appendChild(mk(\'div\', \'ed-hint\', o.beats ? \'Each clip lasts \' + o.beats + \' beat\' + (o.beats === 1 ? \'\' : \'s\') + \' (the first one also holds the time before the first beat).\' : \'Each clip ends on the beat nearest to where it ends now.\'));',
  '      }',
  '    } },',
  '    duck: { title: \'Duck music\', build: function (body){'
]);

var EDITS = [
  { name: 'editor: load the beat sync module',
    find: 'var NMO = (typeof module',
    put: 'var NBS = (typeof module !== \'undefined\' && module.exports) ? require(\'./beatsync.js\') : (typeof window !== \'undefined\' ? window.NakiBeats : null);\n  var NMO = (typeof module' },
  { name: 'editor: the Beat sync button in the Edit tools',
    find: '{ id: \'edQuiet\', label: \'Quiet\'',
    put: '{ id: \'edBeats\', label: \'Beat sync\', icon: G.music, run: P2(\'beats\') },\n        { id: \'edQuiet\', label: \'Quiet\'' },
  { name: 'editor: the Beat sync button in the Audio tools',
    find: 'items.push({ id: \'edDuck\', label: \'Duck music\'',
    put: 'items.push({ id: \'edBeatsA\', label: \'Beat sync\', icon: G.mix, run: function (){ openPanel(\'beats\'); } });\n      items.push({ id: \'edDuck\', label: \'Duck music\'' },
  { name: 'editor: the beat sync panel',
    find: 'duck: { title: \'Duck music\', build: function (body){',
    put: PANEL },
  { name: 'editor: beat sync functions',
    find: 'function selText(){',
    put: FUNCS },
  { name: 'editor: beat marks on the time ruler',
    find: 'u.inner.appendChild(ruler);',
    put: 'try { drawBeatTicks(ruler); } catch (e) {}\n    u.inner.appendChild(ruler);' }
];

var bad = [];
EDITS.forEach(function (e){ var n = count(ed, e.find); if (n !== 1) bad.push('  - ' + e.name + ': found ' + n + ' times (need exactly 1) in editor.js'); });
if (bad.length){
  console.log('NOTHING WAS CHANGED. These spots did not match your files:\n' + bad.join('\n') + '\n\nSend me that list (and the file name) and I will adjust.');
  process.exit(1);
}
EDITS.forEach(function (e){ ed = ed.replace(e.find, function (){ return e.put; }); });
fs.writeFileSync(edPath, ed);
console.log('editor.js: beat sync added (Edit tools > Beat sync, and Audio tools > Beat sync).');

// ----- the soft steps -----
var manual = [];
function soft(file, label, fn){
  if (!fs.existsSync(file)){ manual.push(label + ': ' + path.basename(file) + ' was not found.'); return; }
  var src = fs.readFileSync(file, 'utf8'), out = fn(src);
  if (out === null) return;
  if (typeof out === 'object'){ manual.push(label + ': ' + out.msg); return; }
  fs.writeFileSync(file, out); console.log(path.basename(file) + ': ' + label + ' done.');
}
soft(htmlPath, 'script tag', function (src){
  if (src.indexOf('beatsync.js') >= 0) return null;
  var re = /<script\s+src="editor\.js[^"]*"\s*><\/script>/g, m = src.match(re);
  if (!m || m.length !== 1) return { msg: 'add <script src="beatsync.js"></script> just BEFORE the editor.js script tag in www/index.html.' };
  return src.replace(re, function (t){ return '<script src="beatsync.js"></script>\n' + t; });
});
soft(swPath, 'offline cache', function (src){
  if (src.indexOf('beatsync.js') >= 0) return null;
  var re = /(['"])([^'"]*)editor\.js\1/g, m = src.match(re);
  if (!m || m.length !== 1) return { msg: 'add beatsync.js next to editor.js in the list of cached files in www/sw.js, and raise the cache version number so phones fetch the new files.' };
  return src.replace(re, function (t, q, pre){ return t + ', ' + q + pre + 'beatsync.js' + q; });
});
if (manual.length) console.log('\nDo these by hand:\n  - ' + manual.join('\n  - '));
console.log('\nNext: node tests/beatsync.test.js   (and raise the cache version in sw.js if you use one, so phones pick up the new file)');
