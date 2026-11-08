'use strict';
// node tools/apply-tts.js   (from the project folder; run apply-crop-editor.js first; www/tts.js and www/tts-piper.js must be in place)
// Text to speech: type text (or read a title / all captions), pick a voice, speed and pitch, Listen, and add the speech to the timeline as a sound clip.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function load(rel) { const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o) { fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const problems = [], notes = [];
function rep(o, find, replace, label) {
  const n = o.text.split(find).length - 1;
  if (n !== 1) { problems.push(label + ': found ' + n + ' times (need exactly 1) in ' + o.rel); return; }
  o.text = o.text.replace(find, () => replace);
}
function optrep(o, find, replace, label) {
  const n = o.text.split(find).length - 1;
  if (n === 1) o.text = o.text.replace(find, () => replace); else notes.push('Skipped (not found): ' + label);
}
['tts.js', 'tts-piper.js'].forEach(f => { if (!fs.existsSync(path.join(root, 'www', f))) { console.log('Copy ' + f + ' into the www folder first.'); process.exit(1); } });
const pj = load('www/project.js'), ed = load('www/editor.js'), ix = load('www/index.html'), sw = load('www/sw.js');
if (!ed.text.includes('function buildCropUI')) { console.log('Run  node tools/apply-crop-editor.js  first.'); process.exit(1); }
if (pj.text.includes('function replaceSpeech')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- project.js ----------
const TTS_FUNCS = `// ---------- text to speech ----------
// A speech clip is an ordinary sound-effect clip (it moves, cuts, fades and exports like any sound). Its sound file belongs to an asset, and the asset
// remembers how it was made: assets[id].tts = { text, voice, speed, pitch }, so the speech can be changed later.
function cleanTts(m){
  return { text: String(m.text == null ? '' : m.text).slice(0, 4000), voice: String(m.voice || ''),
    speed: Math.round(Math.max(0.5, Math.min(3, +m.speed || 1)) * 100) / 100, pitch: Math.round(Math.max(-12, Math.min(12, +m.pitch || 0))) };
}
function setAssetTts(p, asset, meta){
  if (!p.assets[asset]) return p;
  var q = cloneProject(p); if (meta) q.assets[asset].tts = cleanTts(meta); else delete q.assets[asset].tts;
  return JSON.stringify(q.assets) === JSON.stringify(p.assets) ? p : q;
}
function ttsOf(p, id){
  var f = findClip(p, id), a = f && f.clip.asset ? p.assets[f.clip.asset] : null;
  return a && a.tts ? a.tts : null;
}
// Puts a new take of the speech behind a speech clip: the clip keeps its place, volume and fades. The new sound gets a NEW asset (out.asset), so nothing
// old (a cached waveform, say) is shown for it. The clip is made as long as the new speech, but never past the next clip on its row or the end of the video
// (out.cut says it was cut short). info = { durMs, name }.
function replaceSpeech(p, id, info, meta, out){
  out = out || {};
  var f = findClip(p, id); if (!f || f.track.role !== 'sfx' || !f.clip.asset || !p.assets[f.clip.asset]) return p;
  var d0 = Math.round(+(info && info.durMs) || 0); if (d0 < 100) return p;
  var q = cloneProject(p), qf = findClip(q, id), c = qf.clip, nextStart = null, old = c.asset;
  qf.track.clips.forEach(function (x){ if (x.id !== id && x.start >= c.start && (nextStart === null || x.start < nextStart)) nextStart = x.start; });
  var room = Math.min(q.durationMs - c.start, nextStart === null ? Infinity : nextStart - c.start), d = Math.min(d0, room);
  if (d < 100){ out.error = 'There is no room for the new speech there.'; return p; }
  var n = 1; while (q.assets['fx' + n]) n++;
  var asset = 'fx' + n; q.assets[asset] = { type: 'audio', name: (info && info.name) || q.assets[old].name, durMs: d0 };
  if (meta) q.assets[asset].tts = cleanTts(meta);
  c.asset = asset; c.in = 0; c.dur = d; c.fadeInOff = 0; c.fadeOutOff = 0;
  var half = Math.floor(d / 2); if (c.fadeIn > half) c.fadeIn = half; if (c.fadeOut > half) c.fadeOut = half;
  out.asset = asset; out.cut = d < d0;
  return finish(q);
}

// ---------- reverse ----------`;
rep(pj, '// ---------- reverse ----------', TTS_FUNCS, 'project: speech functions');
rep(pj, 'setCrop: setCrop, cropRect: cropRect, cleanCrop: cleanCrop,', 'setCrop: setCrop, cropRect: cropRect, cleanCrop: cleanCrop, setAssetTts: setAssetTts, ttsOf: ttsOf, replaceSpeech: replaceSpeech,', 'project: exports');

// ---------- index.html and sw.js ----------
rep(ix, '<script src="editor.js"></script>', '<script src="tts.js"></script>\n<script src="editor.js"></script>', 'index: tts.js loads before editor.js');
rep(sw, "'./editor.js'", "'./editor.js', './tts.js', './tts-piper.js'", 'sw: cache the speech files');

// ---------- editor.js ----------
rep(ed, "var NMO = (typeof module !== 'undefined' && module.exports) ? require('./motion.js') : (typeof window !== 'undefined' ? window.NakiMotion : null);",
  "var NMO = (typeof module !== 'undefined' && module.exports) ? require('./motion.js') : (typeof window !== 'undefined' ? window.NakiMotion : null);\n  var NTTS = (typeof module !== 'undefined' && module.exports) ? require('./tts.js') : (typeof window !== 'undefined' ? window.NakiTTS : null);", 'editor: speech library');
rep(ed, "items.push({ id: 'edSfx', label: 'Effects', icon: G.music, run: function (){ openPanel('sfxpick'); } });",
  "items.push({ id: 'edSfx', label: 'Effects', icon: G.music, run: function (){ openPanel('sfxpick'); } });\n      items.push({ id: 'edTts', label: 'Text to speech', icon: G.speak, run: openTts });", 'editor: Audio row button');
rep(ed, "{ id: 'edTextDup', label: 'Duplicate', icon: G.dup, run: duplicateSel, disabled: !isText },",
  "{ id: 'edTextSpeak', label: 'Read aloud', icon: G.speak, run: openTts, disabled: !isText },\n        { id: 'edTextDup', label: 'Duplicate', icon: G.dup, run: duplicateSel, disabled: !isText },", 'editor: Text row button');
optrep(ed, "{ id: 'edCapMark', label: 'Mark speech', run: markSpeech }]));", "{ id: 'edCapMark', label: 'Mark speech', run: markSpeech }, { id: 'edCapSpeak', label: 'Read aloud', run: openTts }]));", 'Read aloud in the Captions panel');

const EDCODE = `// ----- text to speech -----
  G.speak = svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>');
  function ttsState(){
    if (!E.chip.tts) E.chip.tts = Object.assign({ text: '', voice: null, lang: 'all', speed: 1, pitch: 0, vol: 100, fit: true, edit: null, from: null }, NTTS ? NTTS.getPrefs() : {});
    return E.chip.tts;
  }
  function ttsSave(o){ if (NTTS) NTTS.setPrefs({ voice: o.voice, lang: o.lang, speed: o.speed, pitch: o.pitch, vol: o.vol, fit: o.fit }); }
  function ttsSay(m){ if (E.tts) E.tts.msg = m; if (E.ttsStatus) E.ttsStatus.textContent = m; }
  function ttsFail(err){ E.tts = null; renderDock(); toast('Text to speech did not work' + (err && err.message ? ': ' + err.message : '') + '.', 9000); }
  function shortText(t){ t = String(t || '').replace(/\\s+/g, ' ').trim(); return t.length > 28 ? t.slice(0, 27) + '\\u2026' : t; }
  // Opens the panel. A speech clip that is selected is opened for changing; a selected title or caption is opened for reading aloud.
  function openTts(){
    var o = ttsState(), f = E.sel && P.findClip(E.proj, E.sel), m = (f && P.ttsOf) ? P.ttsOf(E.proj, f.clip.id) : null;
    o.edit = null; o.from = null;
    if (m){ o.edit = f.clip.id; o.text = m.text; if (m.voice) o.voice = m.voice; o.speed = m.speed; o.pitch = m.pitch; o.vol = Math.round((f.clip.volume != null ? f.clip.volume : 1) * 100); }
    else if (f && f.track.kind === 'text' && f.clip.text){ o.text = f.clip.text; o.from = f.clip.id; }
    openPanel('tts', 'audio');
  }
  // The voices to choose from: the offline ones once they are loaded, otherwise the browser's own (for listening only).
  function ttsVoices(){
    var off = NTTS && NTTS.offlineEngine(), list = [];
    if (off) off.voices().forEach(function (v){ list.push({ key: off.id + ':' + v.id, label: v.label, lang: v.langLabel || v.lang, offline: true }); });
    else (E.ttsBrowser || []).forEach(function (v){ list.push({ key: 'browser:' + v.voiceURI, label: String(v.name).replace(/^(Microsoft|Google) /, ''), lang: NTTS.langName(v.lang), offline: false }); });
    return list;
  }
  function ttsLoadEngine(){
    if (!NTTS || (E.tts && E.tts.running)) return;
    E.tts = { running: true, msg: 'Loading the offline voices...' }; renderDock();
    NTTS.loadEngine('piper', ttsSay).then(function (){
      E.tts = null; NTTS.setPrefs({ engine: 'piper' }); ttsState().voice = null; renderDock(); toast('Offline voices are ready.');
    }, ttsFail);
  }
  function ttsListen(){
    var o = ttsState(); if (!NTTS) return;
    if (!NTTS.hasSpeech(o.text)){ toast('Type some words first.'); return; }
    ttsSave(o);
    var off = NTTS.offlineEngine(), v = o.voice || '';
    if (!off || !v || v.indexOf('browser:') === 0){
      if (!NTTS.previewSpeak(o.text, { voiceURI: v.replace(/^browser:/, ''), rate: o.speed, pitch: NTTS.pitchToBrowser(o.pitch), volume: Math.min(1, o.vol / 100) })) toast('This browser cannot speak text aloud.');
      return;
    }
    if (E.tts && E.tts.running) return;
    pause(); E.tts = { running: true, msg: 'Starting...' }; renderDock();
    NTTS.synthRaw(o.text, v, ttsSay).then(function (raw){
      var r = NTTS.render(raw, { speed: o.speed, pitch: o.pitch }); E.tts = null; renderDock(); NTTS.playBlob(r.blob);
    }, ttsFail);
  }
  // jobs = [{ text, at (ms), fitMs (0 = natural length) }]. Each job becomes a speech clip; all of them are one undo step.
  // When editing a speech clip (o.edit), the one job replaces that clip's sound instead.
  function ttsGenerate(jobs){
    var o = ttsState(), v = o.voice, off = NTTS.offlineEngine(), editId = o.edit;
    if (!off || !v || v.indexOf('browser:') === 0){ toast('Speech can only go on the timeline with an offline voice: tap Load offline voices first. Listen works with the browser voices.', 9000); return; }
    if (E.tts && E.tts.running) return;
    ttsSave(o); pause(); E.tts = { running: true, msg: 'Starting...' }; renderDock();
    var q = E.hist.cur, made = 0, cut = 0, skipped = 0, over = 0, lastId = null;
    jobs.reduce(function (chain, job, i){
      return chain.then(function (){
        return NTTS.synthRaw(job.text, v, function (m){ ttsSay(jobs.length > 1 ? (i + 1) + ' of ' + jobs.length + ': ' + m : m); });
      }).then(function (raw){
        var r = NTTS.render(raw, { speed: o.speed, pitch: o.pitch });
        if (job.fitMs){   // too long for its caption: speed it up (up to 1.6 times) so it ends with it
          var m = r.durMs / job.fitMs;
          if (m > 1.02){ r = NTTS.render(raw, { speed: o.speed * Math.min(1.6, m), pitch: o.pitch }); if (m > 1.6) over++; }
        }
        var file = new File([r.blob], 'speech.wav', { type: 'audio/wav' }), name = 'Speech: ' + shortText(job.text), meta = { text: job.text, voice: v, speed: o.speed, pitch: o.pitch }, out = {}, q2;
        if (editId){
          q2 = P.replaceSpeech(q, editId, { durMs: r.durMs, name: name }, meta, out);
          if (q2 === q){ skipped++; return; }
          E.hooks.setSfxFile(out.asset, file); q = P.setClipProps(q2, editId, { volume: o.vol / 100 }); lastId = editId; made++; if (out.cut) cut++;
        } else {
          q2 = P.addSfx(q, job.at, { file: file, name: name, durMs: r.durMs }, out);
          if (q2 === q){ skipped++; return; }
          E.hooks.setSfxFile(out.asset, file); q2 = P.setAssetTts(q2, out.asset, meta); q = P.setClipProps(q2, out.id, { volume: o.vol / 100 }); lastId = out.id; made++;
          var nc = P.findClip(q, out.id); if (nc && nc.clip.dur < r.durMs - 50) cut++;
        }
      });
    }, Promise.resolve()).then(function (){
      E.tts = null; o.edit = null; o.from = null;
      if (!made){ renderDock(); toast(skipped ? 'There was no room for the speech there. Move the playhead, or free some space on the sound rows.' : 'Nothing was made.', 7000); return; }
      E.sel = lastId; commit(q);
      var bits = [made + ' speech clip' + (made === 1 ? '' : 's') + ' ' + (editId ? 'updated' : 'added')];
      if (skipped) bits.push(skipped + ' had no room');
      if (cut) bits.push(cut + ' cut short by the end of the video or the next clip');
      if (over) bits.push(over + ' still longer than ' + (over === 1 ? 'its caption' : 'their captions') + ' even sped up');
      toast(bits.join('. ') + '.', 8000);
    }, ttsFail);
  }
  function ttsAdd(){
    var o = ttsState();
    if (!NTTS.hasSpeech(o.text)){ toast('Type some words first.'); return; }
    var f = o.from && P.findClip(E.proj, o.from), at = f ? f.clip.start : Math.round(E.t);
    ttsGenerate([{ text: o.text, at: at, fitMs: (f && o.fit) ? f.clip.dur : 0 }]);
  }
  function ttsReadCaptions(){
    var o = ttsState(), list = P.captionList(E.hist.cur).filter(function (c){ return NTTS.hasSpeech(c.text); });
    if (!list.length){ toast('There are no captions to read. Add captions first (Text, then Captions).'); return; }
    o.edit = null; o.from = null;
    ttsGenerate(list.map(function (c){ return { text: c.text, at: c.start, fitMs: o.fit ? c.end - c.start : 0 }; }));
  }
  PANELS.tts = { title: 'Text to speech', build: function (body){
    var T = NTTS;
    if (!T){ body.appendChild(mk('div', 'ed-hint', 'tts.js is not loaded. Add <script src="tts.js"></script> to index.html, before editor.js.')); return; }
    var o = ttsState(), off = T.offlineEngine(), busy = !!(E.tts && E.tts.running);
    if (!E.ttsAsked){
      E.ttsAsked = true;
      T.browserVoices().then(function (l){ E.ttsBrowser = l; if (E.panel === 'tts') renderDock(); });
      if (T.getPrefs().engine === 'piper' && !off) T.loadEngine('piper').then(function (){ if (E.panel === 'tts') renderDock(); }, function (){});   // loaded before: load it again quietly
    }
    var ta = mk('textarea', 'ed-textin'); ta.rows = 3; ta.value = o.text || ''; ta.placeholder = 'Type what the voice should say'; ta.setAttribute('aria-label', 'Text to speak');
    ta.oninput = function (){ o.text = ta.value; }; ta.onchange = function (){ o.text = ta.value; };
    body.appendChild(ta);
    var st = mk('div', 'ed-hint', busy ? E.tts.msg : off ? 'Offline voices are ready: speech can go on the timeline and in the exported video.' : 'Listen works now, with your browser\\u2019s voices. To put speech on the timeline and in the exported video, load the offline voices.');
    E.ttsStatus = st; body.appendChild(st);
    if (!off) body.appendChild(actions([{ id: 'edTtsLoad', label: busy ? 'Working...' : 'Load offline voices', run: ttsLoadEngine }]));
    var vs = ttsVoices(), langs = [{ key: 'all', label: 'All languages' }], seen = {};
    vs.forEach(function (v){ if (!seen[v.lang] && langs.length < 30){ seen[v.lang] = 1; langs.push({ key: v.lang, label: v.lang }); } });
    var lang = langs.some(function (l){ return l.key === o.lang; }) ? o.lang : 'all', shown = vs.filter(function (v){ return lang === 'all' || v.lang === lang; }).slice(0, 80);
    if (vs.length && !vs.some(function (v){ return v.key === o.voice; })) o.voice = (shown[0] || vs[0]).key;
    if (!vs.length) body.appendChild(mk('div', 'ed-hint', 'No voices were found. Load the offline voices, or use a browser that has speech voices.'));
    else {
      body.appendChild(chips(langs, lang, function (k){ o.lang = k; ttsSave(o); renderDock(); }));
      body.appendChild(chips(shown.map(function (v){ return { key: v.key, label: v.label + (lang === 'all' ? ' \\u00b7 ' + v.lang : '') }; }), o.voice, function (k){ o.voice = k; ttsSave(o); renderDock(); }));
    }
    body.appendChild(sliderRow('Speed', 50, 200, 5, Math.round(o.speed * 100), pct, function (v){ o.speed = v / 100; }, function (v){ o.speed = v / 100; ttsSave(o); }));
    body.appendChild(sliderRow('Pitch', -6, 6, 1, o.pitch, function (v){ return v > 0 ? '+' + v : String(v); }, function (v){ o.pitch = v; }, function (v){ o.pitch = v; ttsSave(o); }));
    body.appendChild(sliderRow('Volume', 0, 200, 5, o.vol, pct, function (v){ o.vol = v; }, function (v){ o.vol = v; ttsSave(o); }));
    body.appendChild(actions([{ id: 'edTtsListen', label: 'Listen', run: ttsListen }, { id: 'edTtsStop', label: 'Stop', run: function (){ T.stopPreview(); } },
      { id: 'edTtsAdd', label: o.edit ? 'Update speech' : (o.from ? 'Add at the text' : 'Add at playhead'), run: ttsAdd }]));
    body.appendChild(actions([{ id: 'edTtsCaps', label: 'Read all captions', run: ttsReadCaptions }]));
    body.appendChild(chips([{ key: 'fit', label: 'Fit to the text or caption' }, { key: 'free', label: 'Natural length' }], o.fit ? 'fit' : 'free', function (k){ o.fit = k === 'fit'; ttsSave(o); renderDock(); }));
    body.appendChild(mk('div', 'ed-hint', 'Add puts the speech on a sound row at the playhead (or at the start of the title or caption you opened this from). It is an ordinary sound clip: move it, cut it, and change its volume and fades under Clip. Read all captions makes one clip per caption. Fit speeds a clip up, never more than 1.6 times, so it ends with its caption. To change the words or the voice, tap the speech clip and open Text to speech again.'));
  } };
  // ----- crop (CapCut style): a dimmed picture with a frame you drag -----`;
rep(ed, '// ----- crop (CapCut style): a dimmed picture with a frame you drag -----', EDCODE, 'editor: speech code and panel');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[pj, ed, ix, sw].forEach(save);
console.log('Done.' + (notes.length ? '\n  ' + notes.join('\n  ') : '') + '\nNow run:  node tests/tts.test.js   and then   npm test\nThen read www/vendor/piper/README.txt to add the offline voices.');