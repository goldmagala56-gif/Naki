'use strict';
// Naki: fixes "The video engine could not be loaded" / "NakiExport is not defined" on export.
//  - the two export engines are now fetched quietly in the background (so they are ready before you press Export),
//    retried once, and a clear message is shown when the phone is offline
//  - the service worker (www/sw.js) is told to keep webcodecs-export.js and the mediabunny files for offline use,
//    and one missing file can no longer stop the whole offline copy from installing
// Run from the project folder:  node tools/fix-export-load.js      then  npm test
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'www');
const html = path.join(root, 'index.html'), swp = path.join(root, 'sw.js');
let h = fs.readFileSync(html, 'utf8');
const CRLF = h.indexOf('\r\n') >= 0; if (CRLF) h = h.replace(/\r\n/g, '\n');   // anchors are written with plain line ends; the file's own style is put back when saving
if (h.indexOf('function loadScriptOnce') >= 0) { console.log('Already applied.'); process.exit(0); }
function once(s, a, label) { const n = s.split(a).length - 1; if (n !== 1) { console.error('STOPPED, nothing changed. "' + label + '" found ' + n + ' times (needs 1).'); process.exit(1); } }

// 1. engine loaders
const a0 = 'var exportEngineLoaded = false;\nfunction loadExportEngine(){';
const a1 = '// Tries the hardware-accelerated engine first;';
once(h, a0, 'loader start'); once(h, a1, 'loader end');
const i0 = h.indexOf(a0), i1 = h.indexOf(a1);
if (i1 < i0) { console.error('STOPPED: loader anchors out of order.'); process.exit(1); }
const loaders = `function loadScriptOnce(src){
  return new Promise(function(resolve, reject){
    var n = 0;
    (function go(){
      var s = document.createElement('script');
      s.src = src + (n ? '?r=' + Date.now() : '');
      s.onload = function(){ resolve(); };
      s.onerror = function(){
        try { s.remove(); } catch (e) {}
        if (++n < 2) { setTimeout(go, 700); return; }
        reject(new Error(navigator.onLine === false
          ? 'You are offline. Connect to the internet once so Naki can save its export tools, then export works offline too.'
          : 'Naki could not load its export tools (' + src + '). Check your connection and try again.'));
      };
      document.head.appendChild(s);
    })();
  });
}
var exportEngineLoaded = false, exportEnginePromise = null;
function loadExportEngine(){
  if (exportEngineLoaded || typeof NakiExport !== 'undefined'){ exportEngineLoaded = true; return Promise.resolve(); }
  if (!exportEnginePromise) exportEnginePromise = loadScriptOnce('export-engine.js').then(function(){ exportEngineLoaded = true; }, function(e){ exportEnginePromise = null; throw e; });
  return exportEnginePromise;
}
var webcodecsEngineLoaded = false, webcodecsEnginePromise = null;
function loadWebCodecsEngine(){
  if (webcodecsEngineLoaded || typeof WebCodecsExport !== 'undefined'){ webcodecsEngineLoaded = true; return Promise.resolve(); }
  if (!webcodecsEnginePromise) webcodecsEnginePromise = loadScriptOnce('webcodecs-export.js').then(function(){ webcodecsEngineLoaded = true; }, function(e){ webcodecsEnginePromise = null; throw e; });
  return webcodecsEnginePromise;
}
// Fetch both export tools quietly while you edit, so they are ready (and saved for offline use) before Export is pressed.
function warmExportTools(){
  if (navigator.onLine === false) return;
  loadWebCodecsEngine().catch(function(){});
  setTimeout(function(){ loadExportEngine().catch(function(){}); }, 3000);
}
setTimeout(warmExportTools, 2500);
window.addEventListener('online', warmExportTools);
`;
h = h.slice(0, i0) + loaders + h.slice(i1);

// 2. never run the engine when it is not there
const g0 = 'return loadExportEngine().then(function(){ return NakiExport.run(movieFile, voiceBlob, plan, ffmpegOpts, callbacks); }).catch(function(err){';
once(h, g0, 'compatible-engine catch');
h = h.replace(g0, g0 + ' if (typeof NakiExport === \'undefined\') throw err;');
fs.writeFileSync(html, CRLF ? h.replace(/\n/g, '\r\n') : h);
console.log('index.html updated.');

// 3. service worker
if (!fs.existsSync(swp)) { console.log('www/sw.js not found: skipped the offline part.'); process.exit(0); }
let s = fs.readFileSync(swp, 'utf8'), changed = [];
function addFile(name) {
  if (s.indexOf(name) >= 0) return;
  const m = "'./export-engine.js',";
  if (s.split(m).length - 1 !== 1) { console.log('sw.js: could not place ' + name + ' (add it to FILES by hand).'); return; }
  s = s.replace(m, m + " '" + name + "',"); changed.push(name);
}
addFile('./webcodecs-export.js'); addFile('./vendor/mediabunny/mediabunny.min.mjs');
const re = /(\w+)\.addAll\(FILES\)/g, hits = s.match(re) || [];
if (hits.length === 1) { s = s.replace(re, function (_, c) { return 'Promise.all(FILES.map(function(u){ return ' + c + '.add(u).catch(function(){}); }))'; }); changed.push('tolerant install'); }
else console.log('sw.js: install line not recognised (' + hits.length + ' matches), left as it is.');
if (changed.length) { fs.writeFileSync(swp, s); console.log('sw.js updated: ' + changed.join(', ')); } else console.log('sw.js: nothing to change.');
console.log('Done. Publish, open Naki once online, then try Export.');