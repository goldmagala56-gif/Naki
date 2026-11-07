'use strict';
// node tools/apply-export-options.js   (from the project folder)
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
const ix = load('www/index.html'), ee = load('www/export-engine.js'), wc = load('www/webcodecs-export.js');
if (ix.text.includes('id="segFps"')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- export-engine.js: frame rate, and GIF / sound-only conversion ----------
rep(ee, '  var tier = opts.height || 480;', '  FPS = opts.fps > 0 ? opts.fps : 30;   // the frame rate chosen on the export sheet (30 when none)\n  var tier = opts.height || 480;', 'engine: fps');
rep(ee, '  return { run: run, convertToMp4: convertToMp4 };', `// Turns a finished export (an MP4) into a GIF or a sound-only M4A.
  // kind = 'gif' (opts.fps, opts.width) or 'audio'. Returns a Blob.
  async function convertMedia(file, kind, opts, callbacks) {
    callbacks = callbacks || {}; opts = opts || {};
    var say = callbacks.onStatus || function () {}, prog = callbacks.onProgress || function () {};
    say('Starting the video engine (first time only, this can take a moment)...');
    var ffmpeg = await ensureLoaded(callbacks.onLog);
    ffmpeg.writeFile('conv.in', await fetchFile(file));
    var args, out, type;
    if (kind === 'gif') {
      out = 'conv.gif'; type = 'image/gif';
      args = ['-i', 'conv.in', '-an', '-vf', 'fps=' + (opts.fps || 12) + ',scale=' + (opts.width || 480) + ':-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', out];
      say('Making the GIF...');
    } else {
      out = 'conv.m4a'; type = 'audio/mp4';
      args = ['-i', 'conv.in', '-vn', '-c:a', 'copy', '-movflags', '+faststart', out];
      say('Taking out the sound...');
    }
    var off = function (e) { if (e && typeof e.progress === 'number') prog(Math.min(1, Math.max(0, e.progress))); };
    ffmpeg.on('progress', off);
    var code = await ffmpeg.exec(args);
    ffmpeg.off('progress', off);
    if (code !== 0) { try { await ffmpeg.deleteFile('conv.in'); } catch (e) {} throw new Error('The conversion failed (code ' + code + ').'); }
    var data = await ffmpeg.readFile(out);
    try { await ffmpeg.deleteFile('conv.in'); await ffmpeg.deleteFile(out); } catch (e) {}
    return new Blob([data.buffer], { type: type });
  }

  return { run: run, convertToMp4: convertToMp4, convertMedia: convertMedia };`, 'engine: convertMedia');

// ---------- webcodecs-export.js: frame rate ----------
rep(wc, '    FPS = await pickFps(videoTrack);', '    FPS = opts.fps > 0 ? opts.fps : await pickFps(videoTrack);   // the sheet\'s choice, or the movie\'s own rate', 'fast engine: fps');

// ---------- index.html: the sheet ----------
rep(ix, '<div class="opt"><label>Logo <span>optional</span></label>', `<div class="opt"><label>Preset <span>sets the choices below</span></label><div class="seg" id="segPreset"><button type="button" data-preset="tiktok">TikTok</button><button type="button" data-preset="youtube">YouTube</button><button type="button" data-preset="status">WhatsApp</button><button type="button" data-preset="small">Small file</button></div></div>
  <div class="opt"><label>Frame rate <span>Auto keeps the movie's own</span></label><div class="seg" id="segFps"><button type="button" data-fps="auto" aria-pressed="true">Auto</button><button type="button" data-fps="24" aria-pressed="false">24</button><button type="button" data-fps="30" aria-pressed="false">30</button><button type="button" data-fps="60" aria-pressed="false">60</button></div></div>
  <div class="opt"><label>Save as <span>Sound only gives an M4A</span></label><div class="seg" id="segKind"><button type="button" data-kind="video" aria-pressed="true">Video</button><button type="button" data-kind="audio" aria-pressed="false">Sound only</button><button type="button" data-kind="gif" aria-pressed="false">GIF</button></div></div>
  <div class="opt"><label>Logo <span>optional</span></label>`, 'index: sheet rows');

// ---------- index.html: the export itself ----------
rep(ix, "  if (!S.sess.musicFile) plan.audio = plan.audio.filter(function(a){ return a.src !== 'music'; });",
  `  if (!S.sess.musicFile) plan.audio = plan.audio.filter(function(a){ return a.src !== 'music'; });
  // Sound only: export a tiny black picture (fast), then take the sound out of it afterwards.
  if (S.exportKind === 'audio'){ plan.video = [{ type: 'black', sessionStart: 0, sessionEnd: plan.durationMs }]; ['texts', 'stickers', 'overlays', 'fx', 'layouts'].forEach(function(k){ delete plan[k]; }); }`, 'index: audio-only plan');
rep(ix, '  targetH -= targetH % 2;', "  targetH -= targetH % 2;\n  if (S.exportKind === 'audio') targetH = 240; else if (S.exportKind === 'gif') targetH = Math.min(targetH, 480);", 'index: size for sound / gif');
rep(ix, "ffmpegOpts.ratio = webcodecsOpts.ratio = ratio0; ffmpegOpts.bg = webcodecsOpts.bg = (fmt0 && fmt0.bg) || null;",
  "ffmpegOpts.ratio = webcodecsOpts.ratio = ratio0; ffmpegOpts.bg = webcodecsOpts.bg = (fmt0 && fmt0.bg) || null;\n  if (S.exportFps && S.exportFps !== 'auto'){ ffmpegOpts.fps = webcodecsOpts.fps = +S.exportFps; }", 'index: fps option');
rep(ix, "  plan.audio = plan.audio.filter(function(a){ return !a.asset || vidFiles[a.asset]; });",
  "  if (S.exportKind === 'audio') plan.audio.forEach(function(a){ var f = a.asset && S.videos[a.asset]; if (f && f.file) vidFiles[a.asset] = f.file; });   // sound only still needs the sound of added videos\n  plan.audio = plan.audio.filter(function(a){ return !a.asset || vidFiles[a.asset]; });", 'index: added-video sound');
rep(ix, '.then(function(blob){\n    if (S.exportUrl) { try { URL.revokeObjectURL(S.exportUrl); } catch (e) {} }',
  '.then(function(blob){\n    return postExport(blob, statusEl, bar, pctEl);\n  }).then(function(res){\n    var blob = res.blob;\n    if (S.exportUrl) { try { URL.revokeObjectURL(S.exportUrl); } catch (e) {} }', 'index: post step');
rep(ix, "var filename = safeName(S.sess.name) + '_naki.mp4';", "var filename = safeName(S.sess.name) + '_naki.' + res.ext;", 'index: file name');
rep(ix, "preview.src = url;", "preview.hidden = (res.ext === 'gif'); preview.src = url;", 'index: preview');
rep(ix, "var file = new File([blob], filename, { type: 'video/mp4' });", "var file = new File([blob], filename, { type: res.type });", 'index: file type');

// ---------- index.html: the sheet's buttons ----------
rep(ix, "  icons(); window.markNav(S.view); document.documentElement.setAttribute('data-view', S.view);", `  /* export options: frame rate, save as, presets */
  S.exportFps = 'auto'; S.exportKind = 'video';
  function press(sel, attr, val){ [].forEach.call(document.querySelectorAll(sel + ' button'), function(b){ b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(val))); }); }
  function setFps(v){ S.exportFps = String(v); press('#segFps', 'data-fps', v); }
  function setKind(v){ S.exportKind = v; press('#segKind', 'data-kind', v); }
  function kindNote(){
    if (!S.sess) return;
    if (S.exportKind === 'audio'){ var mb = Math.max(1, Math.round(planMs() / 1000 * 192 / 8 / 1000)); $('shEst').innerHTML = 'Sound only: about <b>' + mb + ' MB</b> \\u00b7 M4A'; }
    else if (S.exportKind === 'gif') $('shEst').innerHTML = 'GIF: 480 px wide, 12 pictures a second. Best under about 15 seconds; long GIFs get very big.';
  }
  [].forEach.call(document.querySelectorAll('#segFps button'), function(b){ b.addEventListener('click', function(){ setFps(b.getAttribute('data-fps')); }); });
  [].forEach.call(document.querySelectorAll('#segKind button'), function(b){ b.addEventListener('click', function(){ setKind(b.getAttribute('data-kind')); est(); kindNote(); }); });
  [].forEach.call(document.querySelectorAll('#exportSheet .seg button'), function(b){ b.addEventListener('click', function(){ setTimeout(kindNote, 0); }); });
  var PRESETS = { tiktok: { vertical: true, res: '1080', q: 'faster', fps: 30 }, youtube: { vertical: false, res: '1080', q: 'sharper', fps: 30 },
    status: { vertical: true, res: '720', q: 'faster', fps: 30 }, small: { vertical: false, res: '480', q: 'faster', fps: 24 } };
  [].forEach.call(document.querySelectorAll('#segPreset button'), function(b){
    b.addEventListener('click', function(){
      var p = PRESETS[b.getAttribute('data-preset')]; if (!p) return;
      $(p.vertical ? 'bShapeVertical' : 'bShapeLandscape').click(); $(p.q === 'sharper' ? 'bQualitySharper' : 'bQualityFaster').click();
      var r = document.querySelector('#segRes [data-res="' + p.res + '"]'); if (r) r.click();
      setFps(p.fps); setKind('video'); est();
      toast('Preset set. If you chose a video shape in the editor (Format), that shape is used.', 5000);
    });
  });
  // what happens to the finished MP4: nothing for a video; a GIF or a sound-only file is made from it
  window.postExport = function(blob, statusEl, bar, pctEl){
    var kind = S.exportKind;
    if (kind !== 'audio' && kind !== 'gif') return Promise.resolve({ blob: blob, ext: 'mp4', type: 'video/mp4' });
    return loadExportEngine().then(function(){
      return NakiExport.convertMedia(blob, kind, { fps: 12, width: 480 }, {
        onStatus: function(t){ statusEl.textContent = t; },
        onProgress: function(p){ var pc = Math.round(p * 100); bar.style.width = pc + '%'; pctEl.textContent = pc + '%'; } });
    }).then(function(out){ return kind === 'gif' ? { blob: out, ext: 'gif', type: 'image/gif' } : { blob: out, ext: 'm4a', type: 'audio/mp4' }; });
  };
  icons(); window.markNav(S.view); document.documentElement.setAttribute('data-view', S.view);`, 'index: sheet code');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(ix); save(ee); save(wc);
console.log('Done.\nNow run:  node tests/export-options.test.js   and then   npm test');