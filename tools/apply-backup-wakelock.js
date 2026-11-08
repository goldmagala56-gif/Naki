'use strict';
// node tools/apply-backup-wakelock.js   (from the project folder)
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
const html = load('www/index.html');
if (html.text.includes('function wakeSync')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- backup.js is loaded ----------
rep(html, `<script src="editor.js"></script>`, `<script src="backup.js"></script>\n<script src="editor.js"></script>`, 'index.html: load backup.js');
rep(html, `'tracker.js': 'track' };`, `'tracker.js': 'track', 'backup.js': 'backup1' };`, 'index.html: version check', true);

// ---------- keeping the screen on ----------
rep(html, `try { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(function(w){ S.wake = w; }, function(){}); } catch (e) {}`, `wakeOn('rec');`, 'wake: recording asks through wakeOn');
rep(html, `function releaseWake(){ try { if (S.wake) S.wake.release(); } catch (e) {} S.wake = null; }`,
`function releaseWake(){ wakeOff('rec'); }
/* ---------- keeping the screen on: recording, exporting and converting each ask for it; the lock is held while any of them still does ---------- */
/*wake:start*/
function wakeAny(){ return Object.keys(S.wakeUsers || {}).length > 0; }
function wakeOn(who){ S.wakeUsers = S.wakeUsers || {}; S.wakeUsers[who] = 1; wakeSync(); }
function wakeOff(who){ if (S.wakeUsers) delete S.wakeUsers[who]; wakeSync(); }
function wakeSync(){
  if (!wakeAny()){
    if (S.wake){ var old = S.wake; S.wake = null; try { old.release(); } catch (e) {} }
    return;
  }
  if (S.wake || S.wakeAsking || !('wakeLock' in navigator)) return;
  S.wakeAsking = true;
  var p;
  try { p = navigator.wakeLock.request('screen'); } catch (e) { S.wakeAsking = false; return; }
  p.then(function(w){
    S.wakeAsking = false;
    if (!wakeAny()){ try { w.release(); } catch (e) {} return; }   // everyone let go while we were asking
    S.wake = w;
    try { w.addEventListener('release', function(){ if (S.wake === w) S.wake = null; }); } catch (e) {}
  }, function(){ S.wakeAsking = false; });
}
/*wake:end*/
document.addEventListener('visibilitychange', function(){ if (!document.hidden) wakeSync(); });   // the phone drops the lock when the page is hidden: ask again when it is back
try { if (!('wakeLock' in navigator) && $('exportAwake')) $('exportAwake').textContent = 'Keep Naki open and turn off screen sleep until it finishes. This browser cannot keep the screen on for you.'; } catch (e) {}`, 'wake: shared helper');
rep(html, `<button id="bCancelExport" class="btn" hidden>Cancel export</button>`,
  `<p id="exportAwake" class="dim small" style="margin:6px 0">Keep Naki open and the screen on until it finishes. Naki asks your phone not to sleep while it works.</p>\n    <button id="bCancelExport" class="btn" hidden>Cancel export</button>`, 'export sheet: keep-open note');
rep(html, `runExport(plan, ffmpegOpts, webcodecsOpts, S.movieFile, S.sess.voiceBlob, {`, `wakeOn('export');\n  runExport(plan, ffmpegOpts, webcodecsOpts, S.movieFile, S.sess.voiceBlob, {`, 'wake: export starts');
rep(html, `$('bExport').disabled = false; $('bCancelExport').hidden = true;`, `$('bExport').disabled = false; $('bCancelExport').hidden = true; wakeOff('export');`, 'wake: export ends');
rep(html, `$('prepareStatus').textContent = 'Starting...';`, `$('prepareStatus').textContent = 'Starting...'; wakeOn('convert');`, 'wake: convert starts');
rep(html, `var newFile = new File([blob], newName, { type: 'video/mp4' });`, `wakeOff('convert'); var newFile = new File([blob], newName, { type: 'video/mp4' });`, 'wake: convert ends');
rep(html, `console.error('convert failed', err);`, `wakeOff('convert'); console.error('convert failed', err);`, 'wake: convert fails');

// ---------- backup buttons ----------
rep(html, `var restoring = false;`,
`// Before a backup: save the latest edits, and find out whether the movie is in it (a movie too big to remember is not).
var backupWarn = '';
function backupPrepare(s){
  backupWarn = '';
  var jobs = [];
  try { if (window.NakiEditor && NakiEditor.isOpen()) jobs.push(NakiEditor.flushSave()); } catch (e) {}
  if (S.sess && S.sess.id === s.id && !S.rec.on) jobs.push(persistSession(S.sess, false));
  jobs.push(DB.get('movies', s.id).then(function(rec){
    if (!(rec && rec.blob)) backupWarn = ' This backup has no copy of the movie, so you will need to choose the movie again after restoring.';
  }, function(){}));
  return Promise.all(jobs);
}
var restoring = false;`, 'backup: prepare');
rep(html, `NakiBackup.exportSession(DB, s.id, { app: NAKI_VERSION }).then(function(blob){`,
  `backupPrepare(s).then(function(){ return NakiBackup.exportSession(DB, s.id, { app: NAKI_VERSION }); }).then(function(blob){`, 'backup: prepare first');
rep(html, `Keep it somewhere safe.', 8000);`, `Keep it somewhere safe.' + backupWarn, 10000);`, 'backup: movie warning');
rep(html, `h('button', { class: 'btn icon ghost', 'data-noskin': '', 'aria-label': 'Delete', onclick: function(){ delSaved(s); } },`,
  `h('button', { class: 'btn icon ghost', 'data-noskin': '', 'aria-label': 'Back up', onclick: function(){ backupSaved(s); } }, h('span', { 'data-ic': 'download', 'data-s': '18' }, h('span', { class: 'lbl' }, 'Back up'))),
          h('button', { class: 'btn icon ghost', 'data-noskin': '', 'aria-label': 'Delete', onclick: function(){ delSaved(s); } },`, 'backup: button on every project card');
rep(html, `<div class="row"><button id="bReport" class="btn">Copy test report</button></div>`,
  `<div class="row"><button id="bBackup" class="btn">Back up this project (.naki file)</button></div>\n            <div class="row"><button id="bReport" class="btn">Copy test report</button></div>`, 'backup: button in Advanced');
rep(html, `$('btnRestore').onclick = function(){ if (!restoring) $('restorePick').click(); };`,
  `$('btnRestore').onclick = function(){ if (!restoring) $('restorePick').click(); };\n$('bBackup').onclick = function(){ if (!S.sess){ toast('Open a project first.'); return; } backupSaved(S.sess); };`, 'backup: Advanced button works');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(html);
console.log('Done.' + (notes.length ? '\n  ' + notes.join('\n  ') : '') + '\nNow run:  node tests/backup-wakelock.test.js   and then   npm test');