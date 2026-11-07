'use strict';
// node tools/apply-smooth-slowmo.js   (from the project folder)
// Smooth slow-motion: a picture clip slowed below 1x can blend the frames in between when it is exported, so it flows instead of stepping.
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
const pj = load('www/project.js'), pl = load('www/plan.js'), ee = load('www/export-engine.js'), ed = load('www/editor.js');
if (pj.text.includes('function setSmooth')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- project.js ----------
rep(pj, '// ---------- picture in picture presets ----------',
`// ---------- smooth slow-motion ----------
// clip.smooth = true: when the clip plays slower than normal, the export blends the frames in between (the plain way repeats the same frame several times,
// which steps). Only a picture clip that plays the movie (not a paused picture, not a reversed one) can have it. on undefined = switch.
function setSmooth(p, id, on){
  var f = findClip(p, id); if (!f || f.track.kind !== 'video' || f.clip.type !== 'video' || f.clip.reverse) return p;
  var want = on === undefined ? !f.clip.smooth : !!on;
  if (want === !!f.clip.smooth) return p;
  var q = cloneProject(p), c = findClip(q, id).clip;
  if (want) c.smooth = true; else delete c.smooth;
  return finish(q);
}

// ---------- picture in picture presets ----------`, 'project: setSmooth');
rep(pj, 'setReverse: setReverse, linkedClips: linkedClips,', 'setReverse: setReverse, linkedClips: linkedClips, setSmooth: setSmooth,', 'project: exports');
rep(pj, 'a.stabilize || null]) !== JSON.stringify(', 'a.stabilize || null, !!a.smooth]) !== JSON.stringify(', 'project: join keeps smooth apart (a)');
rep(pj, 'b.stabilize || null])) return false;', 'b.stabilize || null, !!b.smooth])) return false;', 'project: join keeps smooth apart (b)');

// ---------- plan.js ----------
rep(pl, "if (sp.type === 'play' && c.speed && c.speed !== 1) sp.speed = c.speed;",
  "if (sp.type === 'play' && c.speed && c.speed !== 1) sp.speed = c.speed;\n      if (sp.type === 'play' && c.smooth && c.speed && c.speed < 1 && !c.reverse) sp.smooth = true;   // smooth slow-motion", 'plan: smooth');

// ---------- export-engine.js (ffmpeg): blend the in-between frames instead of repeating them ----------
rep(ee, "(speed && speed !== 1 ? ',setpts=PTS/' + speed : '') + ',fps=' + FPS +",
  "(speed && speed !== 1 ? ',setpts=PTS/' + speed : '') + (sp.smooth && speed && speed < 1 ? ',framerate=fps=' + FPS : ',fps=' + FPS) +", 'engine: blend frames');

// ---------- editor.js: the switch in the Speed panel ----------
rep(ed, "body.appendChild(mk('div', 'ed-hint', 'The picture and its sound change together. The movie clips after it move up or back. Your voice stays where it is.'));",
  "if (cur < 1 && !c.reverse) body.appendChild(actions([{ id: 'edSmooth', label: c.smooth ? 'Smooth slow-mo: on' : 'Smooth slow-mo: off', run: function (){ commit(P.setSmooth(E.hist.cur, c.id)); } }]));\n      body.appendChild(mk('div', 'ed-hint', 'The picture and its sound change together. The movie clips after it move up or back. Your voice stays where it is.' + (cur < 1 ? ' Smooth slow-mo blends the frames in between when you export, so slow parts flow instead of stepping. The preview still shows plain frames.' : '')));", 'editor: Smooth slow-mo switch');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(pj); save(pl); save(ee); save(ed);
console.log('Done.\nNow run:  node tests/smooth-slowmo.test.js   and then   npm test');