'use strict';
// node tools/apply-audio-fx.js   (from the project folder; run the crop scripts first)
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
const pj = load('www/project.js'), pl = load('www/plan.js'), ee = load('www/export-engine.js'), wc = load('www/webcodecs-export.js'), ed = load('www/editor.js');
if (pj.text.includes('function setAudioFx')) { console.log('Already applied. Nothing to do.'); process.exit(0); }
if (!pj.text.includes('function setCrop')) { console.log('Run apply-crop.js and apply-crop-editor.js first.'); process.exit(1); }

// ---------- project.js ----------
rep(pj, '// ---------- detach audio ----------', `// ---------- audio effects ----------
// clip.afx = { bass, mid, treble (dB, -12 to 12), pitch (semitones, -12 to 12), echo (0 to 1), normalize (true) }. Only what is not neutral is stored.
function cleanAfx(a){
  if (!a) return null;
  function num(k, lo, hi, int){ var v = +a[k]; if (isNaN(v)) v = 0; v = Math.max(lo, Math.min(hi, v)); return int ? Math.round(v) : r3(v); }
  var o = {}, bass = num('bass', -12, 12, true), mid = num('mid', -12, 12, true), treble = num('treble', -12, 12, true), pitch = num('pitch', -12, 12, true), echo = num('echo', 0, 1, false);
  if (bass) o.bass = bass; if (mid) o.mid = mid; if (treble) o.treble = treble; if (pitch) o.pitch = pitch; if (echo) o.echo = echo;
  if (a.normalize) o.normalize = true;
  return Object.keys(o).length ? o : null;
}
// Changes the effects of one sound clip, or of every clip on its row when all is true. Only what the patch mentions changes.
function setAudioFx(p, id, patch, all){
  var f = findClip(p, id); if (!f || f.track.kind !== 'audio') return p;
  var q = cloneProject(p), tr = q.tracks.filter(function (t){ return t.id === f.track.id; })[0];
  var targets = all ? tr.clips : [findClip(q, id).clip];
  targets.forEach(function (c){
    var cl = cleanAfx(Object.assign({}, c.afx || {}, patch || {}));
    if (cl) c.afx = cl; else delete c.afx;
  });
  return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) ? p : finish(q);
}

// ---------- detach audio ----------`, 'project: audio fx');
rep(pj, 'setStabilize: setStabilize,', 'setStabilize: setStabilize, setAudioFx: setAudioFx, cleanAfx: cleanAfx,', 'project: exports');
rep(pj, '  if (a.vFadeOut || b.vFadeIn) return false;', '  if (JSON.stringify(a.afx || null) !== JSON.stringify(b.afx || null)) return false;\n  if (a.vFadeOut || b.vFadeIn) return false;', 'project: join keeps effects apart');

// ---------- plan.js ----------
rep(pl, "        if (tr.role === 'sfx') a.file = c.asset + '.in';", "        if (c.afx) a.afx = JSON.parse(JSON.stringify(c.afx));\n        if (tr.role === 'sfx') a.file = c.asset + '.in';", 'plan: afx');

// ---------- export-engine.js ----------
rep(ee, '  // Voice enhance (gate, tone, compressor), after the usual voice clean-up. Nothing for other sounds or when it is off.',
`  // Audio effects (equalizer, pitch, echo, loudness) from the Sound FX panel. Pitch changes the sample rate and then puts the speed back with atempo.
  function afxChain(c) {
    var a = c.afx; if (!a) return '';
    var p = [];
    if (a.bass) p.push('bass=g=' + a.bass + ':f=100');
    if (a.mid) p.push('equalizer=f=1000:t=q:w=1:g=' + a.mid);
    if (a.treble) p.push('treble=g=' + a.treble + ':f=5000');
    if (a.pitch) { var k = Math.pow(2, a.pitch / 12); p.push('asetrate=' + Math.round(SR * k), 'aresample=' + SR, 'atempo=' + (1 / k).toFixed(5)); }
    if (a.echo > 0) p.push('aecho=0.8:0.9:' + Math.round(40 + a.echo * 160) + '|' + Math.round(80 + a.echo * 320) + ':' + (0.2 + a.echo * 0.3).toFixed(2) + '|' + (0.1 + a.echo * 0.2).toFixed(2));
    if (a.normalize) p.push('loudnorm=I=-16:TP=-1.5:LRA=11', 'aresample=' + SR);
    return p.length ? ',' + p.join(',') : '';
  }
  // Voice enhance (gate, tone, compressor), after the usual voice clean-up. Nothing for other sounds or when it is off.`, 'engine: afxChain');
rep(ee, "enhanceChain(src, c) + (rev ? ',areverse' : '')", "enhanceChain(src, c) + afxChain(c) + (rev ? ',areverse' : '')", 'engine: use afxChain');

// ---------- webcodecs-export.js ----------
rep(wc, "    if ((plan.audio || []).some(function (a) { return a.speed && a.speed !== 1; })) return false;",
  "    if ((plan.audio || []).some(function (a) { return a.afx; })) return false;   // sound effects (pitch, equalizer, echo, loudness) are made by the ffmpeg engine\n    if ((plan.audio || []).some(function (a) { return a.speed && a.speed !== 1; })) return false;", 'fast engine: afx goes to ffmpeg');

// ---------- editor.js ----------
rep(ed, "      items.push({ id: 'edClipAudio', label: 'Clip', icon: G.clip, run: function (){ openPanel('clipaudio'); } });",
  "      items.push({ id: 'edClipAudio', label: 'Clip', icon: G.clip, run: function (){ openPanel('clipaudio'); } });\n      items.push({ id: 'edAudioFx', label: 'Sound FX', icon: G.mix, run: function (){ openPanel('audiofx'); } });", 'editor: button');
rep(ed, '  // ----- save still: the picture at the playhead as a PNG, in one tap -----', `  // ----- audio effects: equalizer, pitch, echo, loudness -----
  var AFX_PRESETS = [
    { key: 'none', label: 'Normal', v: { bass: 0, mid: 0, treble: 0, pitch: 0, echo: 0, normalize: false } },
    { key: 'deep', label: 'Deep voice', v: { bass: 4, mid: 0, treble: -2, pitch: -4, echo: 0, normalize: false } },
    { key: 'high', label: 'High voice', v: { bass: -2, mid: 0, treble: 3, pitch: 4, echo: 0, normalize: false } },
    { key: 'chip', label: 'Chipmunk', v: { bass: -4, mid: 0, treble: 4, pitch: 8, echo: 0, normalize: false } },
    { key: 'radio', label: 'Radio', v: { bass: -12, mid: 6, treble: -6, pitch: 0, echo: 0, normalize: false } },
    { key: 'boost', label: 'Bass boost', v: { bass: 9, mid: 0, treble: 0, pitch: 0, echo: 0, normalize: false } },
    { key: 'cave', label: 'Cave', v: { bass: 0, mid: 0, treble: 0, pitch: 0, echo: 0.7, normalize: false } }];
  PANELS.audiofx = { title: 'Audio effects', build: function (body){
    var f = E.sel && P.findClip(E.proj, E.sel), c = f && f.track.kind === 'audio' ? f.clip : null;
    if (!c){ body.appendChild(mk('div', 'ed-hint', 'Tap a sound clip on the timeline first (your voice, music, movie sound or an effect).')); return; }
    var a = Object.assign({ bass: 0, mid: 0, treble: 0, pitch: 0, echo: 0, normalize: false }, c.afx || {}), o = E.chip.afx || (E.chip.afx = { all: false });
    var set = function (patch){ var q = P.setAudioFx(E.hist.cur, c.id, patch, o.all); if (q === E.hist.cur) renderDock(); else commit(q); };
    var keys = [{ key: 'bass', label: 'Bass' }, { key: 'mid', label: 'Mid' }, { key: 'treble', label: 'Treble' }, { key: 'pitch', label: 'Pitch' }, { key: 'echo', label: 'Echo' }], cur = chipKey('audiofx', keys, 'bass');
    body.appendChild(chips([{ key: 'clip', label: 'This clip' }, { key: 'all', label: 'Whole row' }], o.all ? 'all' : 'clip', function (k){ o.all = k === 'all'; renderDock(); }));
    body.appendChild(chips(AFX_PRESETS, null, function (k){ var p = AFX_PRESETS.filter(function (x){ return x.key === k; })[0]; if (p) set(p.v); }));
    body.appendChild(chips(keys, cur, pickChip('audiofx')));
    var one = function (v){ var patch = {}; patch[cur] = cur === 'echo' ? v / 100 : v; set(patch); };
    if (cur === 'echo') body.appendChild(sliderRow('Echo', 0, 100, 5, Math.round(a.echo * 100), pct, null, one));
    else if (cur === 'pitch') body.appendChild(sliderRow('Pitch', -12, 12, 1, a.pitch, function (v){ return (v > 0 ? '+' : '') + v + ' st'; }, null, one));
    else body.appendChild(sliderRow(cur === 'bass' ? 'Bass' : cur === 'mid' ? 'Mid' : 'Treble', -12, 12, 1, a[cur], function (v){ return (v > 0 ? '+' : '') + v + ' dB'; }, null, one));
    body.appendChild(actions([{ id: 'edAfxNorm', label: a.normalize ? 'Even out loudness: on' : 'Even out loudness: off', on: !!a.normalize, run: function (){ set({ normalize: !a.normalize }); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Pitch changes how high the voice sounds without changing its speed. Even out loudness makes quiet and loud parts closer. The preview plays the sound without these effects; the exported video has them. Videos with sound effects export with the compatible engine, which takes longer. Undo takes them back.'));
  } };

  // ----- save still: the picture at the playhead as a PNG, in one tap -----`, 'editor: panel');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\\n  - ' + problems.join('\\n  - ') + '\\nSend me that list.'); process.exit(1); }
save(pj); save(pl); save(ee); save(wc); save(ed);
console.log('Done.\\nNow run:  node tests/audio-fx.test.js   and then   npm test');