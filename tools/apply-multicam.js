'use strict';
// node tools/apply-multicam.js   (from the project folder; run apply-crop-editor.js first; www/multicam.js must be in place)
// Multi-camera: add a second video (Edit, Add video) = a second camera. "Sync automatically" lines its sound up with the main video, then
// "Show this camera here" switches the picture of the clip under the playhead to that camera, in step. Cut the clip where you want to change camera.
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
if (!fs.existsSync(path.join(root, 'www', 'multicam.js'))) { console.log('Copy multicam.js into the www folder first.'); process.exit(1); }
const pj = load('www/project.js'), ed = load('www/editor.js'), ix = load('www/index.html'), sw = load('www/sw.js');
if (!ed.text.includes('function buildCropUI')) { console.log('Run  node tools/apply-crop-editor.js  first.'); process.exit(1); }
if (pj.text.includes('function switchAngle')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- project.js ----------
const CAM_FUNCS = `// ---------- multi-camera ----------
// Every added video (Add video) is a camera. assets[id].syncMs says how it lines up with the main movie: time in that camera's file = time in the movie file + syncMs
// (positive: that camera started recording earlier). The main movie is 0. Without a syncMs a camera cannot be switched to.
function setAssetSync(p, asset, ms){
  if (!/^v\\d+$/.test(asset) || !p.assets[asset]) return p;
  var v = ms == null ? null : Math.round(Math.max(-600000, Math.min(600000, +ms)));
  if (v !== null && isNaN(v)) return p;
  if (v === null ? p.assets[asset].syncMs === undefined : p.assets[asset].syncMs === v) return p;
  var q = cloneProject(p); if (v === null) delete q.assets[asset].syncMs; else q.assets[asset].syncMs = v;
  return q;
}
function angleSyncOf(p, a){ if (!a || a === 'movie') return 0; var x = p.assets[a]; return x && typeof x.syncMs === 'number' ? x.syncMs : null; }
// The cameras: the main movie and every added video, with their sync (null = not synced yet).
function angleList(p){
  var out = [{ asset: 'movie', name: (p.assets.movie && p.assets.movie.name) || 'Main video', sync: 0 }];
  Object.keys(p.assets).filter(function (k){ return /^v\\d+$/.test(k) && p.assets[k].type === 'video'; }).sort(function (a, b){ return +a.slice(1) - +b.slice(1); })
    .forEach(function (k){ out.push({ asset: k, name: p.assets[k].name || k, sync: angleSyncOf(p, k) }); });
  return out;
}
// Shows another camera in a picture clip, at the same moment of the event. Its sound is not touched (the sound you already have goes on).
// Refuses (out.error) when the camera is not synced, did not film that moment, or the clip is reversed.
function switchAngle(p, id, to, out){
  out = out || {}; to = to || 'movie';
  var f = findClip(p, id);
  if (!f || f.track.role !== 'movie' || (f.clip.type !== 'video' && f.clip.type !== 'freeze')){ out.error = 'Pick a picture clip first.'; return p; }
  var c = f.clip, from = c.asset || 'movie';
  if (from === to) return p;
  if (to !== 'movie' && !p.assets[to]){ out.error = 'That camera is not in the project.'; return p; }
  var sf = angleSyncOf(p, from), st = angleSyncOf(p, to);
  if (sf === null || st === null){ out.error = 'Sync that camera first (Sync automatically).'; return p; }
  if (c.reverse && to !== 'movie'){ out.error = 'A reversed clip can only use the main video.'; return p; }
  var nin = Math.round(c.in + (st - sf)), need = c.type === 'freeze' ? 0 : c.dur * (c.speed || 1), D = p.assets[to] && p.assets[to].durMs;
  if (nin < 0 || (D && nin + need > D + 40)){ out.error = 'That camera did not film this part: it started or stopped too soon.'; out.short = true; return p; }
  var q = cloneProject(p), qc = findClip(q, id).clip; qc.asset = to; qc.in = nin;
  return finish(q);
}

// ---------- reverse ----------`;
rep(pj, '// ---------- reverse ----------', CAM_FUNCS, 'project: camera functions');
rep(pj, 'setCrop: setCrop, cropRect: cropRect, cleanCrop: cleanCrop,', 'setCrop: setCrop, cropRect: cropRect, cleanCrop: cleanCrop, setAssetSync: setAssetSync, angleList: angleList, switchAngle: switchAngle,', 'project: exports');

// ---------- index.html and sw.js ----------
rep(ix, '<script src="editor.js"></script>', '<script src="multicam.js"></script>\n<script src="editor.js"></script>', 'index: multicam.js loads before editor.js');
rep(sw, "'./editor.js'", "'./editor.js', './multicam.js'", 'sw: cache multicam.js');

// ---------- editor.js ----------
rep(ed, "var NMO = (typeof module !== 'undefined' && module.exports) ? require('./motion.js') : (typeof window !== 'undefined' ? window.NakiMotion : null);",
  "var NMO = (typeof module !== 'undefined' && module.exports) ? require('./motion.js') : (typeof window !== 'undefined' ? window.NakiMotion : null);\n  var NMC = (typeof module !== 'undefined' && module.exports) ? require('./multicam.js') : (typeof window !== 'undefined' ? window.NakiMulticam : null);", 'editor: multicam library');
rep(ed, "{ id: 'edAddVideo', label: 'Add video', icon: G.addVideo, run: addVideoFromFile },",
  "{ id: 'edAddVideo', label: 'Add video', icon: G.addVideo, run: addVideoFromFile },\n        { id: 'edCameras', label: 'Cameras', icon: G.cam, run: P2('cameras') },", 'editor: Cameras button');
const EDCODE = `// ----- multi-camera -----
  G.cam = svg('<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/>');
  function camShort(s){ s = String(s || ''); return s.length > 22 ? s.slice(0, 21) + '\\u2026' : s; }
  function camSyncText(sync){
    if (sync === null) return 'not synced yet';
    if (!sync) return 'synced (starts together)';
    return 'synced: started ' + (Math.abs(sync) / 1000).toFixed(2) + ' s ' + (sync > 0 ? 'earlier' : 'later') + ' than the main video';
  }
  function runCamSync(asset){
    if (E.cam && E.cam.running) return;
    if (!NMC){ toast('multicam.js is not loaded. Add <script src="multicam.js"></script> to index.html, before editor.js.'); return; }
    var h = E.hooks, fa = h.getAssetFile && h.getAssetFile('movie'), fb = h.getAssetFile && h.getAssetFile(asset);
    if (!fa || !fb){ toast('The video file for a camera is not available here.'); return; }
    pause(); E.cam = { running: true, msg: 'Starting...' }; renderDock();
    var say = function (m){ if (E.cam) E.cam.msg = m; if (E.camStatus) E.camStatus.textContent = m; };
    NMC.syncFiles(fa, fb, { onStatus: say }).then(function (r){
      E.cam = null;
      if (!r){ renderDock(); toast('No match was found. The two videos need to hear the same sounds in their first 90 seconds. Try nudging by hand.', 9000); return; }
      var q = P.setAssetSync(E.hist.cur, asset, r.offsetMs);
      if (q === E.hist.cur) renderDock(); else commit(q);
      toast(r.confidence >= 0.5 ? 'Synced (' + (r.offsetMs / 1000).toFixed(2) + ' s).' : 'Synced (' + (r.offsetMs / 1000).toFixed(2) + ' s), but Naki is not sure: the sounds matched weakly. Switch cameras and check, or nudge by hand.', 9000);
    }).catch(function (err){ E.cam = null; renderDock(); toast('Sync did not work' + (err && err.message ? ': ' + err.message : '') + '.', 9000); });
  }
  function showCamera(asset){
    var c = targetVideo(); if (!c){ toast('Move the playhead onto the picture, or tap a picture clip first.'); return; }
    var out = {}, q = P.switchAngle(E.hist.cur, c.id, asset, out);
    if (out.error){ toast(out.error, 7000); return; }
    if (q !== E.hist.cur) commit(q);
  }
  PANELS.cameras = { title: 'Cameras', build: function (body){
    var c = needPicture(body); if (!c) return;
    var list = P.angleList(E.proj), cams = list.filter(function (a){ return a.asset !== 'movie'; });
    if (!cams.length){ body.appendChild(mk('div', 'ed-hint', 'Add a second video first (Edit, then Add video). Each added video is another camera.')); return; }
    var key = chipKey('cam', cams.map(function (a){ return { key: a.asset, label: a.name }; }), cams[0].asset), cam = cams.filter(function (a){ return a.asset === key; })[0], busy = !!(E.cam && E.cam.running);
    body.appendChild(chips(cams.map(function (a){ return { key: a.asset, label: camShort(a.name) }; }), key, pickChip('cam')));
    var here = (c.asset || 'movie') === 'movie' ? 'the main video' : camShort((E.proj.assets[c.asset] || {}).name);
    var st = mk('div', 'ed-hint', busy ? E.cam.msg : camShort(cam.name) + ': ' + camSyncText(cam.sync) + '. The clip under the playhead shows ' + here + '.');
    E.camStatus = st; body.appendChild(st);
    body.appendChild(actions([{ id: 'edCamSync', label: busy ? 'Working...' : 'Sync automatically', run: function (){ runCamSync(key); } },
      { id: 'edCamClear', label: 'Clear sync', run: function (){ var q = P.setAssetSync(E.hist.cur, key, null); if (q === E.hist.cur) renderDock(); else commit(q); } }]));
    var step = E.chip.camstep || 33;
    body.appendChild(chips([{ key: 33, label: '1 frame' }, { key: 100, label: '0.1 s' }, { key: 500, label: '0.5 s' }, { key: 1000, label: '1 s' }], step, function (k){ E.chip.camstep = k; renderDock(); }));
    body.appendChild(actions([{ id: 'edCamNudgeBack', label: '\\u2212 Nudge', run: function (){ commit(P.setAssetSync(E.hist.cur, key, (cam.sync || 0) - step)); } },
      { id: 'edCamNudgeFwd', label: '+ Nudge', run: function (){ commit(P.setAssetSync(E.hist.cur, key, (cam.sync || 0) + step)); } }]));
    body.appendChild(actions([{ id: 'edCamShow', label: 'Show this camera here', run: function (){ showCamera(key); } }, { id: 'edCamMain', label: 'Back to the main video', run: function (){ showCamera('movie'); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Sync listens to the first 90 seconds of both videos and lines up the sounds, so both cameras need to have heard the same thing. To change camera in the middle, Split the clip where you want the change, then Show this camera here on the part you want. The sound you already have keeps playing; only the picture changes. If the two pictures are a frame or two apart, nudge until they match.'));
  } };
  // ----- crop (CapCut style): a dimmed picture with a frame you drag -----`;
rep(ed, '// ----- crop (CapCut style): a dimmed picture with a frame you drag -----', EDCODE, 'editor: camera code and panel');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[pj, ed, ix, sw].forEach(save);
console.log('Done.\nNow run:  node tests/multicam.test.js   and then   npm test');