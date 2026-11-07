'use strict';
// node tools/apply-reframe.js   (from the project folder; run apply-crop.js and apply-crop-editor.js first; www/reframe.js must be in place)
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
if (!fs.existsSync(path.join(root, 'www', 'reframe.js'))) { console.log('Copy reframe.js into the www folder first.'); process.exit(1); }
const pj = load('www/project.js'), ed = load('www/editor.js'), ix = load('www/index.html'), sw = load('www/sw.js');
if (!pj.text.includes('function setCrop') || !ed.text.includes('function buildCropUI')) { console.log('Run  node tools/apply-crop.js  and  node tools/apply-crop-editor.js  first.'); process.exit(1); }
if (pj.text.includes('function reframeClip')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- project.js ----------
const REFRAME_FUNCS = `// ---------- auto reframe ----------
// Keeps a subject in view when the video becomes another shape (landscape to tall, say). The clip is cut where the subject leaves the middle part
// of the crop, and every piece gets a crop (see setCrop) centred on the subject. Only the picture and its linked movie sound are cut.
// track = [{ ms, x, y }]: where the subject is (fractions 0 to 1 of the picture) at that time of the movie FILE, in order. ratio = [w, h].
// opts = { srcW, srcH (the picture's size in pixels), deadFrac (0.18), minMs (1200), maxPieces (40) }. out.pieces says how many pieces came out.
function trackAtMs(track, ms){
  var n = track.length;
  if (ms <= track[0].ms) return track[0];
  if (ms >= track[n - 1].ms) return track[n - 1];
  for (var i = 1; i < n; i++) if (ms <= track[i].ms){
    var a = track[i - 1], b = track[i], f = b.ms === a.ms ? 0 : (ms - a.ms) / (b.ms - a.ms);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
  return track[n - 1];
}
// Cuts clip id (and its linked sound) at time t, in place. Returns the id of the right-hand picture piece, or null.
function splitLinked(q, id, t){
  var rightLink = newId('l'), rightId = null;
  linkedIds(q, id).forEach(function (cid){
    var f = findClip(q, cid), c = f.clip;
    if (!(c.start < t && t < clipEnd(c))) return;
    var left = sliceClip(c, c.start, t), right = sliceClip(c, t, clipEnd(c));
    left.id = c.id; if (c.link) right.link = rightLink;
    f.track.clips = f.track.clips.filter(function (x){ return x.id !== cid; }).concat([left, right]);
    if (cid === id) rightId = right.id;
  });
  return rightId;
}
function reframeClip(p, id, ratio, track, opts, out){
  opts = opts || {}; out = out || {};
  var f = findClip(p, id);
  if (!f || f.track.kind !== 'video' || f.clip.type !== 'video' || f.clip.reverse || !track || !track.length || !ratio) return p;
  var rw = +ratio[0], rh = +ratio[1], sw = +opts.srcW, sh = +opts.srcH, base = cropRect(rw, rh, sw, sh);
  if (!base) return p;
  var roomX = 1 - base.w, roomY = 1 - base.h, c = f.clip, sp = c.speed || 1, end = clipEnd(c), S = [];
  out.pieces = 1;
  if (roomX < 0.01 && roomY < 0.01){ out.same = true; return p; }   // the picture already has this shape
  for (var t = c.start; t < end; t += 250){ var pos = trackAtMs(track, c.in + (t - c.start) * sp); S.push({ t: t, x: pos.x, y: pos.y }); }
  if (!S.length) return p;
  var minMs = Math.max(500, opts.minMs || 1200), maxPieces = opts.maxPieces || 40, dead = opts.deadFrac || 0.18;
  function startAt(i){ var n = 0, x = 0, y = 0; for (var k = i; k < S.length && k < i + 4; k++){ x += S[k].x; y += S[k].y; n++; } return { i: i, cx: x / n, cy: y / n }; }
  function segment(dz){
    var segs = [startAt(0)], cur = segs[0];
    for (var i = 1; i < S.length; i++){
      var farX = roomX >= 0.01 && Math.abs(S[i].x - cur.cx) > dz * base.w, farY = roomY >= 0.01 && Math.abs(S[i].y - cur.cy) > dz * base.h;
      if ((farX || farY) && S[i].t - S[cur.i].t >= minMs){ cur = startAt(i); segs.push(cur); }
    }
    if (segs.length > 1 && end - S[segs[segs.length - 1].i].t < 500) segs.pop();
    return segs;
  }
  var segs = segment(dead), guard = 0;
  while (segs.length > maxPieces && guard++ < 8){ dead *= 1.4; segs = segment(dead); }
  var q = cloneProject(p), ids = [id];
  for (var k = 1; k < segs.length; k++){
    var rid = splitLinked(q, ids[ids.length - 1], S[segs[k].i].t);
    if (!rid) break;
    ids.push(rid);
  }
  q = finish(q);
  ids.forEach(function (pid, k){ q = setCrop(q, pid, cropRect(rw, rh, sw, sh, segs[k].cx, segs[k].cy)); });
  out.pieces = ids.length;
  return q;
}

// ---------- reverse ----------`;
rep(pj, '// ---------- reverse ----------', REFRAME_FUNCS, 'project: reframe functions');
rep(pj, 'setCrop: setCrop, cropRect: cropRect, cleanCrop: cleanCrop,', 'setCrop: setCrop, cropRect: cropRect, cleanCrop: cleanCrop, reframeClip: reframeClip,', 'project: exports');

// ---------- index.html and sw.js ----------
rep(ix, '<script src="editor.js"></script>', '<script src="reframe.js"></script>\n<script src="editor.js"></script>', 'index: reframe.js loads before editor.js');
rep(sw, "'./editor.js'", "'./editor.js', './reframe.js'", 'sw: cache reframe.js');

// ---------- editor.js ----------
rep(ed, "var NMO = (typeof module !== 'undefined' && module.exports) ? require('./motion.js') : (typeof window !== 'undefined' ? window.NakiMotion : null);",
  "var NMO = (typeof module !== 'undefined' && module.exports) ? require('./motion.js') : (typeof window !== 'undefined' ? window.NakiMotion : null);\n  var NRF = (typeof module !== 'undefined' && module.exports) ? require('./reframe.js') : (typeof window !== 'undefined' ? window.NakiReframe : null);", 'editor: reframe library');
rep(ed, "G.crop = svg('<path d=\"M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14\"/>');",
  "G.crop = svg('<path d=\"M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14\"/>');\n  G.reframe = svg('<path d=\"M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3\"/><circle cx=\"12\" cy=\"12\" r=\"2.6\"/>');", 'editor: reframe icon');
rep(ed, "{ id: 'edCrop', label: 'Crop', icon: G.crop, run: P2('crop') },",
  "{ id: 'edCrop', label: 'Crop', icon: G.crop, run: P2('crop') },\n        { id: 'edReframe', label: 'Auto reframe', icon: G.reframe, run: P2('reframe') },", 'editor: Auto reframe button');
const EDCODE = `// ----- auto reframe -----
  function reframeTargets(all){
    var out = [];
    if (all){ var lane = E.proj.tracks.filter(function (t){ return t.role === 'movie'; })[0]; if (lane) lane.clips.forEach(function (c){ if (c.type === 'video' && !c.reverse) out.push(c); }); }
    else { var c = targetVideo(); if (c && c.type === 'video' && !c.reverse) out.push(c); }
    return out;
  }
  function runReframe(o){
    if (E.rf && E.rf.running) return;
    var rat = NRF && NRF.ratioOf(o.ratio), list = reframeTargets(o.all), h = E.hooks;
    if (!rat){ toast('reframe.js is not loaded. Add <script src="reframe.js"></script> to index.html, before editor.js.'); return; }
    if (!list.length){ toast('Pick a picture clip where the movie plays forwards.'); return; }
    pause();
    var jobs = list.map(function (c){
      var asset = (c.asset && c.asset !== 'movie') ? c.asset : 'movie', a = E.proj.assets[asset] || {}, mine = asset === 'movie';
      return { id: c.id, url: mine ? (h.movieUrl && h.movieUrl()) : (h.videoUrl && h.videoUrl(asset)), from: c.in, to: c.in + c.dur * (c.speed || 1),
        w: mine ? (E.frameDims && E.frameDims.w) : a.w, h: mine ? (E.frameDims && E.frameDims.h) : a.h };
    });
    if (jobs.some(function (j){ return !j.url || !j.w || !j.h; })){ toast('The video file for a clip is not available here.'); return; }
    E.rf = { running: true, msg: 'Starting...' }; renderDock();
    var say = function (m){ if (E.rf) E.rf.msg = m; if (E.rfStatus) E.rfStatus.textContent = m; }, tracks = [];
    jobs.reduce(function (chain, j, i){
      return chain.then(function (){
        return NRF.analyzeVideo(j.url, j.from, j.to, { onProgress: function (f){ say('Watching clip ' + (i + 1) + ' of ' + jobs.length + '... ' + Math.round(f * 100) + '%'); } })
          .then(function (raw){ tracks.push(NRF.smoothTrack(raw)); });
      });
    }, Promise.resolve()).then(function (){
      var q = E.hist.cur, total = 0;
      jobs.forEach(function (j, i){ var r = {}; q = P.reframeClip(q, j.id, rat, tracks[i], { srcW: j.w, srcH: j.h }, r); total += r.pieces || 0; });
      q = P.setFormat(q, { ratio: o.ratio });
      E.rf = null;
      if (q === E.hist.cur){ renderDock(); toast('Nothing needed to change.'); return; }
      commit(q);
      toast('Reframed to ' + o.ratio + ' in ' + total + ' piece' + (total === 1 ? '' : 's') + '. Play it to check; Undo takes it all back, and Crop can fine-tune any piece.', 9000);
    }).catch(function (err){
      E.rf = null; console.error('auto reframe failed', err); renderDock();
      toast('Auto reframe did not work' + (err && err.message ? ': ' + err.message : '') + '.', 9000);
    });
  }
  PANELS.reframe = { title: 'Auto reframe', build: function (body){
    if (!NRF){ body.appendChild(mk('div', 'ed-hint', 'reframe.js is not loaded. Add <script src="reframe.js"></script> to index.html, before editor.js.')); return; }
    var c = needPicture(body); if (!c) return;
    if (c.type !== 'video' || c.reverse){ body.appendChild(mk('div', 'ed-hint', 'Pick a part where the movie plays forwards (not a paused or reversed picture).')); return; }
    var o = E.chip.rf || (E.chip.rf = { ratio: '9:16', all: false }), run = !!(E.rf && E.rf.running);
    body.appendChild(chips([{ key: '9:16', label: '9:16 (TikTok)' }, { key: '4:5', label: '4:5' }, { key: '1:1', label: '1:1' }, { key: '3:4', label: '3:4' }, { key: '16:9', label: '16:9' }], o.ratio, function (k){ o.ratio = k; renderDock(); }));
    body.appendChild(chips([{ key: 'clip', label: 'This clip' }, { key: 'all', label: 'Whole video' }], o.all ? 'all' : 'clip', function (k){ o.all = k === 'all'; renderDock(); }));
    var st = mk('div', 'ed-hint', run ? E.rf.msg : 'Naki watches the picture, finds the part that moves, and crops to the new shape, cutting the clip where the subject moves out of the middle.');
    E.rfStatus = st; body.appendChild(st);
    body.appendChild(actions([
      { id: 'edReframeGo', label: run ? 'Working...' : 'Reframe', run: function (){ runReframe(o); } },
      { id: 'edReframeReset', label: 'Remove crops', run: function (){ var q = P.setCrop(E.hist.cur, o.all ? null : c.id, null); if (q === E.hist.cur) renderDock(); else commit(q); } }]));
    body.appendChild(mk('div', 'ed-hint', 'It follows movement (and detail when nothing moves), not faces, so it suits one person or one moving subject best. It also sets the video shape under Format. Analysis runs on this device and can take a minute on a long clip.'));
  } };
  // ----- crop (CapCut style): a dimmed picture with a frame you drag -----`;
rep(ed, '// ----- crop (CapCut style): a dimmed picture with a frame you drag -----', EDCODE, 'editor: reframe code and panel');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[pj, ed, ix, sw].forEach(save);
console.log('Done.\nNow run:  node tests/reframe.test.js   and then   npm test');