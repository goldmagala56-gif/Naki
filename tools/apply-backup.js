'use strict';
// node tools/apply-backup.js   (from the project folder, after www/backup.js exists)
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
if (!fs.existsSync(path.join(root, 'www', 'backup.js'))) { console.log('Create www/backup.js first.'); process.exit(1); }
const ix = load('www/index.html'), sw = load('www/sw.js');
if (ix.text.includes('NakiBackup')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

const GLUE = `// ---------- backup and restore (.naki file) ----------
if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
function backupSaved(s){
  if (!window.NakiBackup){ toast('backup.js is not loaded.'); return; }
  toast('Making the backup...', 4000);
  NakiBackup.exportSession(DB, s.id, { app: NAKI_VERSION }).then(function(blob){
    var name = safeName(s.name) + '.naki', a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 60000);
    toast('Backup saved as ' + name + ' (' + fmtBytes(blob.size) + '). Keep it somewhere safe.', 8000);
  }, function(err){ toast('The backup could not be made: ' + (err && err.message ? err.message : err), 9000); });
}
var restoring = false;
$('btnRestore').onclick = function(){ if (!restoring) $('restorePick').click(); };
$('restorePick').addEventListener('change', function(){
  var f = this.files && this.files[0]; this.value = '';
  if (!f || restoring) return;
  if (!window.NakiBackup || !DB.ok){ toast('Restoring is not available here (saving is off).', 7000); return; }
  restoring = true; toast('Restoring "' + f.name + '"...', 4000);
  NakiBackup.importSession(DB, f).then(function(r){
    toast('Restored "' + r.name + '". It is in Your sessions.', 7000); return refreshHome();
  }, function(err){ toast('Could not restore: ' + (err && err.message ? err.message : err), 10000); })
  .then(function(){ restoring = false; });
});
`;
rep(ix, `function delSaved(s){`, GLUE + `function delSaved(s){`, 'page: backup functions');
rep(sw, `'./editor.js', `, `'./editor.js', './backup.js', `, 'service worker: file list');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[ix, sw].forEach(save);
console.log('Done. Now run:  npm test');