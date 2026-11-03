'use strict';
// Diagnostics for "video effects do not show in the exported video". It changes nothing about how a video is made; it only records what happened.
//   - the export engines report which version of themselves is running
//   - "Copy test report" then also says how many effects were in the plan, which engine made the video, the last lines ffmpeg printed,
//     and, when effects were left out, the real reason
//   - the "effects were left out" message now includes that reason
// Run from the project folder:   node tools/apply-export-diagnostics.js
// It checks that every spot is found exactly once BEFORE writing anything, so it does everything or nothing.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

const EDITS = {
  'www/export-engine.js': [
    { label: 'ffmpeg engine: version stamp',
      find: `var SR = 48000;`,
      replace: `var SR = 48000;
if (typeof window !== 'undefined') { window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['export-engine.js'] = 'fx-export'; }` },
    { label: 'ffmpeg engine: a place to send ffmpeg log lines',
      find: `var loaded = null;`,
      replace: `var loaded = null, logSink = null;` },
    { label: 'ffmpeg engine: always listen to ffmpeg log, send it to the current run',
      find: `if (onLog) ffmpeg.on('log', function (e) { onLog(e.message || ''); });`,
      replace: `ffmpeg.on('log', function (e) { if (logSink) logSink(e.message || ''); });` },
    { label: 'ffmpeg engine: the current run takes the log',
      find: `var log = callbacks.onLog || function () {};`,
      replace: `var log = callbacks.onLog || function () {}; logSink = log;` }
  ],
  'www/webcodecs-export.js': [
    { label: 'fast engine: version stamp',
      find: `var AUDIO_SR = 48000;`,
      replace: `var AUDIO_SR = 48000;
  if (typeof window !== 'undefined') { window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['webcodecs-export.js'] = 'fx-export'; }` }
  ],
  'www/index.html': [
    { label: 'page: keep the last ffmpeg lines of an export',
      find: `callbacks = callbacks || {};`,
      replace: `callbacks = callbacks || {};
  S.ffLog = []; callbacks = Object.assign({}, callbacks, { onLog: function(l){ S.ffLog.push(l); if (S.ffLog.length > 40) S.ffLog.shift(); } });` },
    { label: 'page: the record of an export says how many effects the plan had',
      find: `engineCanDrawTitles: typeof drawTitle === 'function' };`,
      replace: `engineCanDrawTitles: typeof drawTitle === 'function',
    effectsInPlan: (plan.fx || []).length, effectKinds: (plan.fx || []).map(function(x){ return x.fx; }).join(',') };` },
    { label: 'page: say why effects were left out',
      find: `toast('Transitions or effects could not be made on this device, so they were left out.', 8000);`,
      replace: `S.lastExport.effectsDropped = String(err && err.message ? err.message : err);
      toast('Transitions or effects could not be made, so they were left out. Reason: ' + S.lastExport.effectsDropped.slice(0, 140) + ' (Copy test report has more.)', 14000);` },
    { label: 'page: the test report includes engine versions and the ffmpeg lines',
      find: `if (S.lastExport) L.push('', 'Last export:', '  ' + JSON.stringify(S.lastExport));`,
      replace: `if (S.lastExport) L.push('', 'Last export:', '  ' + JSON.stringify(S.lastExport));
    var nv = window.NakiVersions || {};
    L.push('', 'Engine files: export-engine.js=' + (nv['export-engine.js'] || 'not loaded or old copy') + ', webcodecs-export.js=' + (nv['webcodecs-export.js'] || 'not loaded or old copy') +
      ', fx.js=' + (nv['fx.js'] || '?') + ', plan.js=' + (nv['plan.js'] || '?') + ', look2.js=' + (nv['look2.js'] || '?'));
    if (S.ffLog && S.ffLog.length) L.push('', 'Last ffmpeg lines:'), S.ffLog.slice(-25).forEach(function(l){ L.push('  ' + l); });` }
  ]
};

function load(rel){ const f = path.join(root, rel); const raw = fs.readFileSync(f, 'utf8'); return { f, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o){ fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }

if (fs.readFileSync(path.join(root, 'www', 'export-engine.js'), 'utf8').includes("'fx-export'")){ console.log('Already applied. Nothing to do.'); process.exit(0); }

const problems = [], files = {};
Object.keys(EDITS).forEach(rel => {
  const o = files[rel] = load(rel);
  EDITS[rel].forEach(e => {
    const n = o.text.split(e.find).length - 1;
    if (n !== 1){ problems.push(e.label + ': found ' + n + ' times (need exactly 1) in ' + path.basename(rel)); return; }
    o.text = o.text.replace(e.find, () => e.replace);
  });
});
if (problems.length){
  console.log('NOTHING WAS CHANGED. These spots did not match your files:\n  - ' + problems.join('\n  - '));
  console.log('\nSend me that list (and the file names) and I will adjust.');
  process.exit(1);
}
Object.keys(files).forEach(rel => save(files[rel]));
console.log('Done. Changed ' + Object.keys(files).length + ' files.\nNow close Naki completely, open it again, and see the steps I sent.');