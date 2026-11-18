// Run from the project root:  node tools/apply-boot-guard.js
// If part of Naki fails to load or crashes while starting (the "screens look broken" problem), the app now says so
// and offers a Repair button that refreshes the app's saved files. Projects and recordings are never touched.
const fs = require('fs'), path = require('path');
const file = path.join('www', 'index.html');
if (!fs.existsSync(file)) { console.error('Run this from the Naki project root.'); process.exit(1); }
let raw = fs.readFileSync(file, 'utf8'); const crlf = raw.includes('\r\n'); let s = raw.replace(/\r\n/g, '\n');
if (s.includes('Naki:boot-guard')) { console.log('Already applied.'); process.exit(0); }
const anchor = '<script src="core.js"></script>\n';
if (s.split(anchor).length !== 2) { console.error('Anchor not found exactly once; nothing changed.'); process.exit(1); }
const block = `<script>
/* Naki:boot-guard - tells you when part of the app did not load, and offers Repair (keeps all your projects) */
(function(){
  var t0 = Date.now(), problems = [], shown = false;
  function banner(){
    if (shown || !document.body) return; shown = true;
    var d = document.createElement('div'); d.id = 'bootGuard';
    d.style.cssText = 'position:fixed;left:10px;right:10px;bottom:10px;z-index:99999;background:#1b2630;color:#f3eee3;border:1px solid #ff9f1c;border-radius:14px;padding:12px 14px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5)';
    d.innerHTML = '<b>Part of Naki did not start properly.</b><div style="opacity:.8;margin:4px 0 10px">Repair refreshes the app\\u2019s saved files. Your projects and recordings stay safe.</div>' +
      '<div id="bgMsg" style="color:#ffb347;margin-bottom:8px;display:none"></div>' +
      '<button id="bgFix" style="min-height:40px;padding:0 16px;border:0;border-radius:10px;background:#ff9f1c;color:#1d1300;font-weight:700">Repair</button> ' +
      '<button id="bgHide" style="min-height:40px;padding:0 14px;border:1px solid #3a4854;border-radius:10px;background:transparent;color:#f3eee3">Not now</button>' +
      '<div style="opacity:.5;font-size:11px;margin-top:8px;word-break:break-all">' + problems.slice(0, 3).join(' | ').replace(/</g, '&lt;') + '</div>';
    document.body.appendChild(d);
    document.getElementById('bgHide').onclick = function(){ d.parentNode.removeChild(d); };
    document.getElementById('bgFix').onclick = function(){
      var m = document.getElementById('bgMsg');
      if (navigator.onLine === false){ m.style.display = 'block'; m.textContent = 'You are offline. Connect to the internet first, because Repair downloads the app files again.'; return; }
      this.disabled = true; this.textContent = 'Repairing...';
      var jobs = [];
      try { if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) jobs.push(navigator.serviceWorker.getRegistrations().then(function(rs){ return Promise.all(rs.map(function(r){ return r.unregister(); })); })); } catch (e) {}
      try { if (window.caches && caches.keys) jobs.push(caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k); })); })); } catch (e) {}
      Promise.all(jobs).catch(function(){}).then(function(){ location.reload(); });
    };
  }
  window.addEventListener('error', function(e){
    var t = e && e.target;
    if (t && t !== window && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) problems.push('did not load: ' + (t.src || t.href || '').split('/').pop());
    else if (Date.now() - t0 < 20000) problems.push((e && e.message ? e.message : 'error') + (e && e.filename ? ' (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')' : ''));
    else return;
    setTimeout(banner, 300);
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    if (Date.now() - t0 < 20000){ problems.push('promise: ' + String(e && e.reason && e.reason.message || e.reason || '').slice(0, 120)); }
  });
})();
</script>
`;
s = s.replace(anchor, () => block + anchor);
fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
fs.writeFileSync(path.join('tests', 'boot-guard.test.js'), `const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const h = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8').replace(/\\r\\n/g, '\\n');
const i = h.indexOf('Naki:boot-guard'); assert(i > 0, 'guard present');
const start = h.lastIndexOf('<script>', i) + 8, end = h.indexOf('</script>', i);
new vm.Script(h.slice(start, end));
assert(h.indexOf('<script>', i) === -1 || h.indexOf('boot-guard') < h.indexOf('src="core.js"'), 'guard runs before the app files');
console.log('boot-guard ok');
`);
console.log('Done. Now run: npm test');