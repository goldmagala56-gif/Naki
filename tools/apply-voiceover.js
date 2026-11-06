'use strict';
// node tools/apply-voiceover.js   (from the project folder)
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
const ed = load('www/editor.js');
if (ed.text.includes('voiceOverToggle')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

const FUNCS = `// ----- voice-over: record narration at the playhead onto an effects row -----
  function voiceOverToggle(){ if (E.vo && E.vo.on) voiceOverStop(); else voiceOverStart(); }
  function voiceOverStart(){
    if (!E.hooks.setSfxFile){ toast('Recording is not available here.'); return; }
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ toast('This browser cannot record from the microphone here.', 6000); return; }
    if (!movieReady()){ toast('Choose the movie for this session first.'); return; }
    if (E.t >= E.proj.durationMs - 300){ toast('Move the playhead earlier. There is no video left to record over.'); return; }
    pause();
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }).then(function (stream){
      var mime = '', list = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'], mr, i;
      for (i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])){ mime = list[i]; break; }
      try { mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); } catch (e) { stream.getTracks().forEach(function (t){ t.stop(); }); toast('Could not start recording on this device.'); return; }
      var vo = E.vo = { on: true, t0: Math.round(E.t), started: performance.now(), mr: mr, stream: stream, chunks: [], mime: mr.mimeType || mime || 'audio/webm', timer: 0 };
      mr.ondataavailable = function (ev){ if (ev.data && ev.data.size) vo.chunks.push(ev.data); };
      mr.onstop = function (){ voiceOverFinish(vo); };
      mr.start(1000); play();
      vo.timer = setInterval(function (){ if (!E.playing) voiceOverStop(); }, 150);   // pausing, or the end of the video, ends the take
      renderDock(); toast('Recording. Speak now. Tap Stop or pause to finish.', 3500);
    }, function (err){
      toast(err && err.name === 'NotAllowedError' ? 'The microphone is blocked. Allow it for this page and try again.' : 'Could not open the microphone.', 6000);
    });
  }
  function voiceOverStop(){
    var vo = E.vo; if (!vo || !vo.on) return;
    vo.on = false; clearInterval(vo.timer); vo.ms = Math.round(performance.now() - vo.started);
    pause();
    try { if (vo.mr.state !== 'inactive') vo.mr.stop(); else voiceOverFinish(vo); } catch (e) { voiceOverFinish(vo); }
  }
  function voiceOverFinish(vo){
    if (vo.done) return; vo.done = true;
    try { vo.stream.getTracks().forEach(function (t){ t.stop(); }); } catch (e) {}
    if (E.vo === vo) E.vo = null;
    var blob = new Blob(vo.chunks, { type: vo.mime });
    if (blob.size < 500 || (vo.ms || 0) < 300){ toast('Nothing was recorded.'); renderDock(); return; }
    var ext = /ogg/.test(vo.mime) ? '.ogg' : /mp4/.test(vo.mime) ? '.m4a' : '.webm', file = new File([blob], 'voice-over' + ext, { type: vo.mime });
    var out = {}, q = P.addSfx(E.hist.cur, vo.t0, { file: file, name: 'Voice-over', durMs: vo.ms }, out);
    if (q === E.hist.cur){ toast('There was no room for the recording.'); renderDock(); return; }
    E.hooks.setSfxFile(out.asset, file);
    E.sel = out.id; commit(q); renderDock();
    toast('Voice-over added. Drag it to move it, or open Clip for volume and fades.', 5000);
  }
  function addMusic(){`;

rep(ed, `function addMusic(){`, FUNCS, 'editor: voice-over functions');
rep(ed, `items.push({ id: 'edSfx', label: 'Effects', icon: G.music, run: function (){ openPanel('sfxpick'); } });`,
  `items.push({ id: 'edVoiceOver', label: (E.vo && E.vo.on) ? 'Stop' : 'Voice-over', icon: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v4"/>'), run: voiceOverToggle, on: !!(E.vo && E.vo.on) });
      items.push({ id: 'edSfx', label: 'Effects', icon: G.music, run: function (){ openPanel('sfxpick'); } });`, 'editor: Voice-over button');
rep(ed, `pause(); endDrag(true); try { E.ui.bgvid.pause(); } catch (e) {}`,
  `if (E.vo && E.vo.on) voiceOverStop();\n    pause(); endDrag(true); try { E.ui.bgvid.pause(); } catch (e) {}`, 'editor: stop recording when closing', true);

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(ed);
console.log('Done.' + (notes.length ? '\n  ' + notes.join('\n  ') : '') + '\nNow run:  npm test');