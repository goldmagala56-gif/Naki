'use strict';
// node tools/apply-export-cancel.js   (from the project folder)
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
const ix = load('www/index.html'), wc = load('www/webcodecs-export.js'), ee = load('www/export-engine.js');
if (ix.text.includes('bCancelExport')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---- fast engine ----
rep(wc, `var prog = callbacks.onProgress || function () {};`,
`var cancelled = callbacks.isCancelled || function () { return false; };
    function check() { if (cancelled()) { var ce = new Error('Export cancelled'); ce.cancelled = true; throw ce; } }
    var prog0 = callbacks.onProgress || function () {};
    var prog = function (p) { check(); prog0(p); };`, 'fast: cancel check');
rep(wc, `await videoSource.add(t / 1000, 1 / FPS);`, `check(); await videoSource.add(t / 1000, 1 / FPS);`, 'fast: play frames');
rep(wc, `await videoSource.add(t2 / 1000, 1 / FPS);`, `check(); await videoSource.add(t2 / 1000, 1 / FPS);`, 'fast: safety frames');
rep(wc, `await videoSource.add(tf / 1000, 1 / FPS);`, `check(); await videoSource.add(tf / 1000, 1 / FPS);`, 'fast: held frames');

// ---- ffmpeg engine ----
rep(ee, `var log = callbacks.onLog || function () {}; logSink = log;`,
`var log = callbacks.onLog || function () {}; logSink = log;
    var cancelled = callbacks.isCancelled || function () { return false; };
    function checkCancel() { if (cancelled()) { var ce = new Error('Export cancelled'); ce.cancelled = true; throw ce; } }`, 'ffmpeg: cancel check');
rep(ee, `var ffmpeg = await ensureLoaded(log);`,
`var ffmpeg = await ensureLoaded(log);
    if (callbacks.onEngine) callbacks.onEngine({ terminate: function () { try { ffmpeg.terminate(); } catch (e) {} loaded = null; } });
    checkCancel();`, 'ffmpeg: terminate hook');
rep(ee, `var job = built.jobs[i];`, `checkCancel(); var job = built.jobs[i];`, 'ffmpeg: check between jobs');

// ---- page ----
rep(ix, `<div id="exportDone" hidden>`, `<button id="bCancelExport" class="btn" hidden>Cancel export</button>\n            <div id="exportDone" hidden>`, 'page: cancel button');
rep(ix, `callbacks = Object.assign({}, callbacks, { onLog:`,
  `callbacks = Object.assign({}, callbacks, { isCancelled: function(){ return !!(S.xc && S.xc.cancelled); }, onEngine: function(e){ if (S.xc) S.xc.engine = e; }, onLog:`, 'page: callbacks');
rep(ix, `if (!plan.video.some(function(s){ return s.transitionIn; }) && !(plan.fx && plan.fx.length)) throw err;`,
  `if ((S.xc && S.xc.cancelled) || (!plan.video.some(function(s){ return s.transitionIn; }) && !(plan.fx && plan.fx.length))) throw err;`, 'page: no retry after cancel');
rep(ix, `}).catch(function(err){ return viaFfmpeg(err && err.message ? err.message : String(err)); });`,
  `}).catch(function(err){ if (S.xc && S.xc.cancelled) throw err; return viaFfmpeg(err && err.message ? err.message : String(err)); });`, 'page: no fallback after cancel');
rep(ix, `$('bExport').disabled = true;`, `$('bExport').disabled = true; S.xc = { cancelled: false, engine: null }; $('bCancelExport').hidden = false;`, 'page: start of export');
rep(ix, `console.error('export failed', err);`,
  `if (S.xc && S.xc.cancelled){ statusEl.textContent = 'Export cancelled.'; bar.style.width = '0%'; pctEl.textContent = ''; toast('Export cancelled.'); return; }
    console.error('export failed', err);`, 'page: cancelled message');
rep(ix, `$('bExport').disabled = false;`, `$('bExport').disabled = false; $('bCancelExport').hidden = true;`, 'page: end of export');
rep(ix, `$('bReport').onclick = function(){`,
`$('bCancelExport').onclick = function(){
  if (!S.xc || S.xc.cancelled) return;
  S.xc.cancelled = true; $('exportStatus').textContent = 'Cancelling...';
  try { if (S.xc.engine && S.xc.engine.terminate) S.xc.engine.terminate(); } catch (e) {}
};
$('bReport').onclick = function(){`, 'page: cancel handler');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[ix, wc, ee].forEach(save);
console.log('Done. Now run:  npm test');