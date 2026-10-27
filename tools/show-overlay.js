'use strict';
// Shows what the export engines would do with the overlays and sound effects in your real plan. It only reads, it changes nothing.
// 1) save your plan as plan.json in the project folder (see the steps in the chat)   2) run from the project folder:   node tools/show-overlay.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const planFile = path.join(root, 'plan.json');
if (!fs.existsSync(planFile)) { console.log('plan.json is not in the project folder. Save it first (see the steps), then run this again.'); process.exit(1); }
let plan;
try { plan = JSON.parse(fs.readFileSync(planFile, 'utf8').replace(/^\uFEFF/, '')); }
catch (e) { console.log('plan.json could not be read: ' + e.message + '\nIt should be one long line starting with {"naki":"export-plan"\nProbably the clipboard held something else when you saved it. Do the two steps again without copying anything in between.'); process.exit(1); }

console.log('PLAN: duration ' + plan.durationMs + ' ms, picture parts ' + (plan.video || []).length + ', overlays ' + (plan.overlays || []).length + ', sound clips ' + (plan.audio || []).length);
console.log('\nOVERLAYS IN THE PLAN:\n' + JSON.stringify(plan.overlays || [], null, 1));
console.log('\nSOUND EFFECTS IN THE PLAN:\n' + JSON.stringify((plan.audio || []).filter(a => a.file), null, 1));

// ---- the fast engine: where each overlay lands in a 1280 x 720 frame ----
try {
  const NA = require(path.join(root, 'www', 'anim.js'));
  console.log('\n=== FAST ENGINE: where each overlay is drawn (frame 1280 x 720) ===');
  (plan.overlays || []).forEach((o, i) => {
    [0, Math.round(o.durMs / 2), Math.max(0, o.durMs - 40)].forEach(rel => {
      const R = NA.overlayRect(Object.assign({}, o, { w: o.w || 640, h: o.h || 360 }), NA.overlayState(o, rel), 1280, 720);
      const seen = R.cx + R.w / 2 > 0 && R.cx - R.w / 2 < 1280 && R.cy + R.h / 2 > 0 && R.cy - R.h / 2 < 720;
      console.log('overlay ' + i + ' (' + o.asset + ') at ' + (o.startMs + rel) + ' ms: centre ' + Math.round(R.cx) + ',' + Math.round(R.cy) + ' size ' + Math.round(R.w) + 'x' + Math.round(R.h) + ' turn ' + Math.round(R.rot) + ' opacity ' + (Math.round(R.opacity * 100) / 100) + (seen ? '' : '   <-- OFF THE PICTURE') + (R.opacity < 0.05 ? '   <-- INVISIBLE' : ''));
    });
  });
} catch (e) { console.log('\n(could not work out the overlay places: ' + e.message + ')'); }

// ---- the ffmpeg engine: the commands it builds ----
try {
  const E = require(path.join(root, 'www', 'export-engine.js'));
  const sec = (plan.movie && plan.movie.durationMs) ? plan.movie.durationMs / 1000 : 600;
  const r = E.planToJobs(plan, { hasAudio: true, audioMono: false, width: 1280, height: 720, sar: 1, durationSec: sec }, { height: 720 });
  console.log('\n=== FFMPEG ENGINE: ' + r.jobs.length + ' jobs built ===');
  const uses = (j, name) => j.args.join(' ').indexOf(name) >= 0;
  const names = (plan.overlays || []).map(o => o.asset + '.in').concat((plan.audio || []).filter(a => a.file).map(a => a.file)).filter((v, i, a) => a.indexOf(v) === i);
  names.forEach(name => {
    const hits = r.jobs.filter(j => uses(j, name));
    console.log('\n--- ' + name + ': used by ' + hits.length + ' command(s) ---');
    hits.slice(0, 1).forEach(j => console.log('[' + (j.label || '') + ']\n' + j.args.join(' ') + '\n'));
    if (!hits.length) console.log('NO COMMAND USES THIS FILE. The ffmpeg engine builds nothing for it.');
  });
} catch (e) { console.log('\n(the ffmpeg engine part stopped: ' + (e && e.message ? e.message : e) + ')'); }