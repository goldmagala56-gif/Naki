'use strict';
// node tools/apply-movie-captions.js   (from the project folder)
// Auto captions for the sound of the MOVIE itself (an imported video has no narration, so the old Auto captions found nothing to listen to).
//   captions.js  toTimeline(): moves captions from the movie's own time onto the edited timeline (cuts, speed and gaps are followed)
//   editor.js    Auto captions panel: "My voice / Movie sound" choice (Movie sound is the default for a video with no narration);
//                the movie's sound is read out into a small 16 kHz mono file first, so a big video is not decoded whole
// All or nothing: nothing is written unless every spot is found exactly once.
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
const cap = load('www/captions.js'), ed = load('www/editor.js');
if (cap.text.includes('function toTimeline')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- captions.js ----------
rep(cap, '  var api = { LIB_URL: LIB_URL,', `  // Captions made from the MOVIE's sound are in the time of the movie file. This moves them onto the edited timeline.
  // segs = [{ startMs, endMs, text }] in movie time; clips = the picture clips that play that movie: [{ start, dur, in, speed }] (timeline ms, movie ms).
  // A line is followed through cuts, speed changes and gaps. A line that falls in a cut-out part is dropped; one that is cut in two keeps its bigger half
  // (when that half is at least half of the line), so no caption shows half a sentence. Lines are never made to overlap.
  function toTimeline(segs, clips) {
    var list = (clips || []).filter(function (c) { return c && c.dur > 0; }).map(function (c) {
      var sp = c.speed > 0 ? c.speed : 1, from = c.in || 0;
      return { start: c.start, from: from, to: from + c.dur * sp, sp: sp };
    }), out = [];
    (segs || []).forEach(function (sg) {
      var len = Math.max(1, sg.endMs - sg.startMs), parts = [];
      list.forEach(function (c) {
        var a = Math.max(sg.startMs, c.from), b = Math.min(sg.endMs, c.to);
        if (b - a <= 0) return;
        parts.push({ s: Math.round(c.start + (a - c.from) / c.sp), e: Math.round(c.start + (b - c.from) / c.sp), cover: b - a });
      });
      parts.sort(function (x, y) { return x.s - y.s; });
      var merged = [];
      parts.forEach(function (p) {
        var l = merged[merged.length - 1];
        if (l && p.s - l.e <= 40) { l.e = Math.max(l.e, p.e); l.cover += p.cover; } else merged.push({ s: p.s, e: p.e, cover: p.cover });
      });
      var best = null; merged.forEach(function (m) { if (!best || m.cover > best.cover) best = m; });
      if (!best || best.cover < len * 0.5) return;
      out.push({ startMs: best.s, endMs: Math.max(best.e, best.s + 400), text: sg.text });
    });
    out.sort(function (x, y) { return x.startMs - y.startMs; });
    for (var i = 0; i < out.length - 1; i++) if (out[i].endMs > out[i + 1].startMs) out[i].endMs = out[i + 1].startMs;
    return out.filter(function (x) { return x.endMs - x.startMs >= 150; });
  }
  var api = { LIB_URL: LIB_URL,`, 'captions: toTimeline');
rep(cap, 'splitLines: splitLines, recognize: recognize,', 'splitLines: splitLines, toTimeline: toTimeline, recognize: recognize,', 'captions: export');

// ---------- editor.js ----------
rep(ed, '  function runAutoCaptions(langKey){', `  // ----- auto captions from the movie's own sound -----
  function noNarration(){ return !!(E.sess && (E.sess.warnings || []).some(function (w){ return w.type === 'no_narration'; })); }
  var movieAudioLib = null;
  // The movie's sound as a small mono 16000 Hz WAV file (what the speech model reads), so a big video is never decoded whole in memory.
  function extractMovieAudio(file, say){
    if (!movieAudioLib) movieAudioLib = import(new URL('vendor/mediabunny/mediabunny.min.mjs', location.href).href);
    return movieAudioLib.then(function (M){
      var input = new M.Input({ source: new M.BlobSource(file), formats: M.ALL_FORMATS }), output = new M.Output({ format: new M.WavOutputFormat(), target: new M.BufferTarget() });
      return M.Conversion.init({ input: input, output: output, video: { discard: true }, audio: { codec: 'pcm-s16', sampleRate: 16000, numberOfChannels: 1 } }).then(function (conv){
        if (!conv.isValid) throw new Error('this movie has no sound that can be read');
        conv.onProgress = function (p){ say('Reading the movie\\u2019s sound... ' + Math.round(p * 100) + '%'); };
        return conv.execute().then(function (){ return new Blob([output.target.buffer], { type: 'audio/wav' }); });
      });
    });
  }
  function runAutoCaptions(langKey, source){
    if ((source || (noNarration() ? 'movie' : 'voice')) !== 'movie') return runAutoCaptionsVoice(langKey);
    if (E.ac && E.ac.running) return;
    var file = E.hooks.getAssetFile && E.hooks.getAssetFile('movie'), lane = E.proj.tracks.filter(function (t){ return t.role === 'movie'; })[0];
    var clips = lane ? lane.clips.filter(function (c){ return c.type === 'video' && (!c.asset || c.asset === 'movie') && !c.reverse; }) : [];
    if (!file){ toast('The movie file is not available here. Choose the movie for this session first.'); return; }
    if (!clips.length){ toast('There is no part of the original movie on the timeline to listen to.'); return; }
    pause(); E.ac = { running: true, msg: 'Starting...' }; renderDock();
    var status = function (m){ if (E.ac) E.ac.msg = m; if (E.acStatus) E.acStatus.textContent = m; };
    extractMovieAudio(file, status).catch(function (err){ console.warn('could not read the movie sound out, trying the whole file', err); status('Trying the whole file...'); return file; }).then(function (src){
      return NCAP.recognize(src, { language: langKey, onStatus: status });
    }).then(function (segs){
      var items = NCAP.splitLines(NCAP.toTimeline(segs, clips), 42);
      E.ac = null;
      if (!items.length){ toast('No speech was found in the movie, in the parts you kept. Check the language, or the movie may have no speech.', 8000); renderDock(); return; }
      applyCaptionItems(items);
    }).catch(function (err){
      E.ac = null; console.error('auto captions from the movie failed', err); renderDock();
      toast('Auto captions did not work' + (err && err.message ? ': ' + err.message : '') + '. The first time it needs internet. A very long movie may be too much for this device.', 10000);
    });
  }
  function runAutoCaptionsVoice(langKey){`, 'editor: movie captions');
rep(ed, "body.appendChild(chips(keys, cur, pickChip('autocaptions')));",
  `body.appendChild(chips(keys, cur, pickChip('autocaptions')));
      var srcKeys = [{ key: 'voice', label: 'My voice' }, { key: 'movie', label: 'Movie sound' }], src = chipKey('acsource', srcKeys, noNarration() ? 'movie' : 'voice');
      body.appendChild(chips(srcKeys, src, pickChip('acsource')));`, 'editor: source chips');
rep(ed, 'run: function (){ runAutoCaptions(cur); }', 'run: function (){ runAutoCaptions(cur, src); }', 'editor: start button');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[cap, ed].forEach(save);
console.log('Done.\nNow run:  node tests/movie-captions.test.js   and then   npm test');
