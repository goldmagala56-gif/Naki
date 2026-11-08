'use strict';
// node tools/apply-proxy.js   (from the project folder)
// Smooth editing (a light copy): Naki makes a small, quick-to-seek copy of the movie and the editor's preview uses it, so heavy movies scrub and play
// smoothly on a weak phone. Exports always use the original movie, so nothing is lost.
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
const ix = load('www/index.html'), ed = load('www/editor.js');
if (ix.text.includes('smooth editing: a light copy')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- index.html: make, keep and hand out the light copy ----------
const PXCODE = `// ---------- smooth editing: a light copy of the movie for the editor's preview ----------
// The copy is small (about 640 px on the long side), with a key frame every second so seeking is quick. Only the editor's preview shows it;
// the export reads S.movieFile, the original. The copy is kept on the device (the movies store, under the name proxy:...) so it is made only once.
var PX = { key: '', blob: null, url: null, on: false, busy: false, conv: null, pct: 0, onProgress: null, advisedFor: '' };
function pxKey(f){ return f ? f.name + '|' + f.size + '|' + (f.lastModified || 0) : ''; }
function pxUrl(){ return (PX.on && PX.url) ? PX.url : S.movieUrl; }
function pxDrop(){
  if (PX.conv){ try { PX.conv.cancel(); } catch (e) {} }
  if (PX.url) URL.revokeObjectURL(PX.url);
  PX.key = ''; PX.blob = null; PX.url = null; PX.on = false; PX.busy = false; PX.conv = null; PX.pct = 0;
}
function pxBig(){
  var v = el.movie, f = S.movieFile;
  return !!f && (Math.max(v.videoWidth || 0, v.videoHeight || 0) > 1280 || f.size > 250 * 1024 * 1024);
}
function pxState(){
  return { canMake: !!S.movieFile, have: !!PX.url && PX.key === pxKey(S.movieFile), on: !!(PX.on && PX.url), busy: PX.busy, pct: PX.pct, big: pxBig(), advised: PX.advisedFor === pxKey(S.movieFile) };
}
function pxLoad(){
  var f = S.movieFile; if (!f) return Promise.resolve(pxState());
  var key = pxKey(f);
  if (PX.url && PX.key === key) return Promise.resolve(pxState());
  if (!DB.ok) return Promise.resolve(pxState());
  return DB.get('movies', 'proxy:' + key).then(function(rec){
    if (rec && rec.blob && pxKey(S.movieFile) === key && !PX.url){ PX.blob = rec.blob; PX.key = key; PX.url = URL.createObjectURL(rec.blob); }
    return pxState();
  }).catch(function(){ return pxState(); });
}
function pxBuild(){
  var file = S.movieFile; if (!file || PX.busy) return Promise.resolve(false);
  if (typeof VideoEncoder === 'undefined'){ toast('This browser cannot make a light copy.', 6000); return Promise.resolve(false); }
  PX.busy = true; PX.pct = 0; var key = pxKey(file);
  return import(new URL('vendor/mediabunny/mediabunny.min.mjs', location.href).href).then(function(M){
    var input = new M.Input({ source: new M.BlobSource(file), formats: M.ALL_FORMATS });
    return input.getPrimaryVideoTrack().then(function(vt){
      if (!vt) throw new Error('this file has no picture');
      var w = vt.displayWidth, h = vt.displayHeight, k = Math.min(1, 640 / Math.max(w, h));
      var ow = Math.max(2, Math.round(w * k / 2) * 2), oh = Math.max(2, Math.round(h * k / 2) * 2);
      var output = new M.Output({ format: new M.Mp4OutputFormat(), target: new M.BufferTarget() });
      return M.Conversion.init({ input: input, output: output, video: { width: ow, height: oh, fit: 'fill', frameRate: 30, bitrate: 1200000, keyFrameInterval: 1, forceTranscode: true } }).then(function(conv){
        if (!conv.isValid) throw new Error('this movie cannot be converted here');
        PX.conv = conv;
        conv.onProgress = function(p){ PX.pct = Math.round(p * 100); if (PX.onProgress) PX.onProgress(PX.pct); };
        return conv.execute().then(function(){ return new Blob([output.target.buffer], { type: 'video/mp4' }); });
      });
    });
  }).then(function(blob){
    if (pxKey(S.movieFile) !== key) return false;   // another movie was chosen while it was being made
    if (PX.url) URL.revokeObjectURL(PX.url);
    PX.blob = blob; PX.key = key; PX.url = URL.createObjectURL(blob);
    if (DB.ok) DB.put('movies', { sid: 'proxy:' + key, name: file.name, size: blob.size, blob: blob }).catch(function(){});
    return true;
  }).catch(function(err){
    if (!(err && err.name === 'ConversionCanceledError')){ console.error('light copy failed', err); toast('Could not make the light copy: ' + (err && err.message ? err.message : String(err)), 8000); }
    return false;
  }).then(function(ok){ PX.busy = false; PX.conv = null; return ok; });
}
var PXHOOK = {
  state: pxState, load: pxLoad,
  make: function(onProgress){ PX.onProgress = onProgress || null; return pxBuild().then(function(ok){ PX.onProgress = null; return ok; }); },
  cancel: function(){ if (PX.conv){ try { PX.conv.cancel(); } catch (e) {} } },
  set: function(on){ PX.on = !!on && !!PX.url; return PX.on; },
  advised: function(){ PX.advisedFor = pxKey(S.movieFile); }
};
// ---------- end smooth editing ----------

NakiEditor.init({`;
rep(ix, 'NakiEditor.init({', PXCODE, 'index: light copy code');
rep(ix, 'movieUrl: function(){ return S.movieUrl; },', 'movieUrl: function(){ return pxUrl(); }, proxy: PXHOOK,', 'index: the editor asks pxUrl for the movie');
rep(ix, "if (S.movieUrl) URL.revokeObjectURL(S.movieUrl);\n    S.movieFile = file;", "if (S.movieUrl) URL.revokeObjectURL(S.movieUrl);\n    if (typeof PX !== 'undefined' && PX && PX.key && PX.key !== pxKey(file)) pxDrop();   // a different movie: its light copy is no use\n    S.movieFile = file;", 'index: a new movie drops the old light copy');

// ---------- editor.js ----------
rep(ed, "body.appendChild(chips(NF.RATIOS, ratio, function (k){ set({ ratio: k }); }));",
  "body.appendChild(chips(NF.RATIOS, ratio, function (k){ set({ ratio: k }); }));\n      if (E.hooks.proxy) body.appendChild(actions([{ id: 'edProxy', label: 'Smooth editing', run: function (){ openPanel('proxy'); } }]));", 'editor: Smooth editing button in Format');
rep(ed, "    transition: { title: 'Transition', build: function (body",
`    proxy: { title: 'Smooth editing', build: function (body){
      var px = E.hooks.proxy; if (!px){ body.appendChild(mk('div', 'ed-hint', 'Not available here.')); return; }
      var s = px.state();
      if (!s.canMake){ body.appendChild(mk('div', 'ed-hint', 'Choose the movie for this session in Preview first.')); return; }
      if (s.busy){
        body.appendChild(mk('div', 'ed-hint', 'Making the light copy... ' + s.pct + '%. You can keep this screen open; it can take a few minutes for a long movie.'));
        body.appendChild(actions([{ id: 'edProxyCancel', label: 'Cancel', run: function (){ px.cancel(); } }]));
        return;
      }
      if (!s.have){
        body.appendChild(actions([{ id: 'edProxyMake', label: 'Make light copy', run: function (){
          var last = -5;
          px.make(function (p){ if (p - last >= 2){ last = p; if (E.isOpen && E.panel === 'proxy') renderDock(); } }).then(function (ok){
            if (ok){ px.set(true); resyncMedia(); toast('Light copy is on. Scrubbing and playing should be smoother. Your export still uses the original movie.', 7000); }
            if (E.isOpen && E.panel === 'proxy') renderDock();
          });
          renderDock();
        } }]));
        body.appendChild(mk('div', 'ed-hint', 'Makes a small copy of the movie just for editing, so heavy movies scrub and play smoothly on this phone. It is made once and kept on the device. When you export, Naki uses the original movie, so the quality does not change. The preview will look softer while it is on.'));
        return;
      }
      body.appendChild(actions([{ id: 'edProxyToggle', label: s.on ? 'Light copy: on' : 'Light copy: off', run: function (){
        pause(); px.set(!s.on); resyncMedia(); toast(s.on ? 'Light copy is off. The preview shows the original movie.' : 'Light copy is on.'); renderDock();
      } }]));
      body.appendChild(mk('div', 'ed-hint', 'The light copy only changes what you see while editing. Turn it off to check the picture quality; the export always uses the original movie.'));
    } },
    transition: { title: 'Transition', build: function (body`, 'editor: Smooth editing panel');
// the preview has one video element: forcing the swap makes the editor load the file movieUrl() gives now, and come back to the playhead
rep(ed, "  function swapSource(asset, m){",
  "  function resyncMedia(){ if (!E.isOpen) return; E.curAsset = ''; E.lastTransform = ''; E.boxKey = null; syncMedia(); }\n  function swapSource(asset, m){", 'editor: resync after the file changes');
// a heavy movie: say once that a light copy exists
rep(ed, "    layoutTextLayer(); fit(); readout(); syncMedia();\n  }\n  function close(){",
  "    layoutTextLayer(); fit(); readout(); syncMedia();\n    if (E.hooks.proxy && E.hooks.proxy.load) E.hooks.proxy.load().then(function (s){\n      if (E.isOpen && s && s.canMake && s.big && !s.have && !s.advised){ E.hooks.proxy.advised(); toast('This movie is heavy to edit on a phone. Format > Smooth editing makes a light copy so it scrubs and plays smoothly. Your export still uses the original.', 10000); }\n    }).catch(function () {});\n  }\n  function close(){", 'editor: advice for heavy movies');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(ix); save(ed);
console.log('Done.\nNow run:  node tests/proxy.test.js   and then   npm test');
