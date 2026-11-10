'use strict';
// Finds out why Beat sync does not show or work. Changes nothing.   Run from the project folder:   node tools/check-beatsync.js
const fs = require('fs'), path = require('path'), www = path.join(__dirname, '..', 'www');
const rd = f => { try { return fs.readFileSync(path.join(www, f), 'utf8'); } catch (e) { return null; } };
const out = []; const say = (ok, msg) => out.push((ok ? '  OK    ' : '  FIX   ') + msg);
const bs = rd('beatsync.js'), html = rd('index.html'), ed = rd('editor.js'), sw = rd('sw.js');
say(!!bs, bs ? 'www/beatsync.js exists (' + bs.length + ' bytes)' : 'www/beatsync.js is MISSING: copy it into the www folder');
if (bs) say(/NakiBeats/.test(bs), 'beatsync.js defines NakiBeats (what the editor looks for)');
if (html) {
  const a = html.indexOf('<script src="beatsync.js"'), b = html.indexOf('<script src="editor.js"');
  say(a > 0 && b > 0 && a < b, a < 0 ? 'index.html does not load beatsync.js' : 'index.html loads beatsync.js ' + (a < b ? 'before' : 'AFTER') + ' editor.js (must be before)');
}
if (ed) {
  say(/window\.NakiBeats/.test(ed), 'editor.js looks for NakiBeats');
  say(ed.includes("id: 'edBeats'"), "editor.js has the Beat sync button in the Edit tools (id 'edBeats')");
  say(ed.includes("id: 'edBeatsA'"), "editor.js has the Beat sync button in the Audio tools (id 'edBeatsA')");
  say(/beats: \{ title: 'Beat sync'/.test(ed), 'editor.js has the Beat sync panel');
  say(ed.includes('drawBeatTicks'), 'editor.js draws the beat marks on the ruler');
  if (!ed.includes("id: 'edBeats'")) out.push('        -> apply-beatsync.js was not run on this editor.js (or a later patch replaced it). Run:  node tools/apply-beatsync.js');
}
if (sw) say(sw.includes('beatsync.js'), sw.includes('beatsync.js') ? 'sw.js caches beatsync.js' : 'sw.js does not list beatsync.js: add it next to editor.js and raise the cache version');
if (sw) { const m = sw.match(/(CACHE|VERSION|CACHE_NAME|cacheName)[^\n]*['"]([^'"]+)['"]/i); out.push('        sw.js cache name: ' + (m ? m[2] : '(not found)') + '   <- if this did not change since beatsync was added, phones still run the OLD app'); }
console.log('\nBeat sync check\n' + out.join('\n') + '\n\nIn the app (Chrome, press F12, Console) type:  typeof NakiBeats   -> it must say "object". If it says "undefined" the browser is running old files: hard refresh (Ctrl+Shift+R) or, in F12 > Application > Service Workers, press Unregister.\n');