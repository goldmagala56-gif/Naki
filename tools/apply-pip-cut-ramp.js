'use strict';
// node tools/apply-pip-cut-ramp.js   (run apply-crop.js and apply-crop-editor.js first)
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
const pj = load('www/project.js'), ed = load('www/editor.js'), ix = load('www/index.html'), sw = load('www/sw.js');
if (pj.text.includes('function setOverlayPlace')) { console.log('Already applied. Nothing to do.'); process.exit(0); }
if (!pj.text.includes('function setCrop')) { console.log('Run apply-crop.js and apply-crop-editor.js first.'); process.exit(1); }

// ---------- sw.js: the missing comma (this is what breaks app.test.js), the doubled reframe.js, and the new files ----------
const BAD = "'./layout.js' './fonts/satisfy-latin-400-normal.woff2'";
if (sw.text.includes(BAD)) rep(sw, BAD, "'./layout.js', './fonts/satisfy-latin-400-normal.woff2'", 'sw: missing comma');
const DUP = "'./fonts/old-standard-tt-latin-700-normal.woff2', './reframe.js', './fonts/alfa-slab-one-latin-400-normal.woff2'";
if (sw.text.includes(DUP)) rep(sw, DUP, "'./fonts/old-standard-tt-latin-700-normal.woff2', './fonts/alfa-slab-one-latin-400-normal.woff2'", 'sw: doubled reframe.js');
rep(sw, "'./reframe.js', './backup.js'", "'./reframe.js', './autocut.js', './speedramp.js'" + (sw.text.includes("'./markers.js'") ? '' : ", './markers.js'") + ", './backup.js'", 'sw: new files');

// ---------- index.html ----------
rep(ix, '<script src="reframe.js"></script>', '<script src="reframe.js"></script>\n<script src="autocut.js"></script>\n<script src="speedramp.js"></script>', 'index: scripts');

// ---------- project.js ----------
rep(pj, '// ---------- replacing the movie file ----------', `// ---------- picture in picture presets ----------
// A preset puts an overlay (photo or video) in a corner, the middle or one half of the frame. x, y = its centre and size = its width, as fractions of the frame.
var PIP_PRESETS = [{ key: 'tl', label: 'Top left' }, { key: 'tr', label: 'Top right' }, { key: 'bl', label: 'Bottom left' }, { key: 'br', label: 'Bottom right' },
  { key: 'center', label: 'Centre' }, { key: 'left', label: 'Left half' }, { key: 'right', label: 'Right half' }, { key: 'full', label: 'Full screen' }];
var PIP_SIZES = { s: 0.22, m: 0.3, l: 0.42 };
// frameAsp = frame width / height, ovAsp = overlay height / width. Returns { x, y, size } or null.
function pipPlacement(key, size, frameAsp, ovAsp){
  if (!PIP_PRESETS.some(function (k){ return k.key === key; })) return null;
  frameAsp = frameAsp > 0 ? frameAsp : 16 / 9; ovAsp = ovAsp > 0 ? ovAsp : 9 / 16;
  var m = 0.04, s = size > 0 ? size : 0.3, hOf = function (w){ return w * ovAsp * frameAsp; }, h, x, y;
  if (key === 'left' || key === 'right' || key === 'full' || key === 'center'){
    if (key === 'left' || key === 'right') s = 0.5; else if (key === 'full') s = 1;
    h = hOf(s); if (h > 1){ s = s / h; h = 1; }
    x = key === 'left' ? 0.25 : key === 'right' ? 0.75 : 0.5; y = 0.5;
  } else {
    var room = 1 - 2 * m * frameAsp; h = hOf(s); if (h > room){ s = s * room / h; h = hOf(s); }
    x = key.charAt(1) === 'l' ? m + s / 2 : 1 - m - s / 2;
    y = key.charAt(0) === 't' ? m * frameAsp + h / 2 : 1 - m * frameAsp - h / 2;
  }
  return { x: r3(x), y: r3(y), size: r3(s) };
}
// Puts one overlay at place = { x, y, size } and turns it upright. Its x / y / size / turn keyframes are taken away. Not for shapes, arrows, spotlights or frames.
function setOverlayPlace(p, id, place){
  var f = findClip(p, id); if (!f || f.track.kind !== 'overlay' || f.clip.gen || !place) return p;
  var x = +place.x, y = +place.y, s = +place.size; if (isNaN(x) || isNaN(y) || isNaN(s)) return p;
  var q = cloneProject(p), c = findClip(q, id).clip;
  c.x = r3(Math.max(0, Math.min(1, x))); c.y = r3(Math.max(0, Math.min(1, y))); c.size = r3(Math.max(0.05, Math.min(1.5, s))); c.rot = 0;
  if (c.kf){ ['x', 'y', 'size', 'rot'].forEach(function (k){ delete c.kf[k]; }); if (!Object.keys(c.kf).length) delete c.kf; }
  return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) ? p : finish(q);
}

// ---------- auto cut ----------
// movieTimes = places (ms in the movie FILE the clip plays from) where the scene changes. The picture clip and its linked sound are cut there.
// Cuts that would leave a piece shorter than opts.minMs (1000) are skipped. out.cuts says how many were made. A clip with a speed curve is not cut.
function autoCutClip(p, id, movieTimes, opts, out){
  opts = opts || {}; out = out || {}; out.cuts = 0;
  var f = findClip(p, id);
  if (!f || f.track.kind !== 'video' || f.clip.type !== 'video' || f.clip.reverse || !movieTimes || !movieTimes.length) return p;
  var c = f.clip; if (c.curve){ out.curveBlocked = true; return p; }
  var sp = c.speed || 1, minMs = Math.max(300, opts.minMs || 1000), end = clipEnd(c), times = [];
  movieTimes.slice().sort(function (a, b){ return a - b; }).forEach(function (ms){
    var t = Math.round(c.start + (ms - c.in) / sp);
    if (t - c.start < minMs || end - t < minMs) return;
    if (times.length && t - times[times.length - 1] < minMs) return;
    times.push(t);
  });
  times = times.slice(0, opts.max || 60);
  if (!times.length) return p;
  var q = cloneProject(p), cur = id;
  times.forEach(function (t){ var rid = splitLinked(q, cur, t); if (rid){ cur = rid; out.cuts++; } });
  return out.cuts ? finish(q) : p;
}

// ---------- replacing the movie file ----------`, 'project: pip + auto cut');
rep(pj, 'cleanCrop: cleanCrop, setStabilize: setStabilize,', 'cleanCrop: cleanCrop, setStabilize: setStabilize, setOverlayPlace: setOverlayPlace, pipPlacement: pipPlacement, PIP_PRESETS: PIP_PRESETS, PIP_SIZES: PIP_SIZES, autoCutClip: autoCutClip,', 'project: exports');

// ---------- editor.js ----------
rep(ed, 'window.NakiReframe : null);', `window.NakiReframe : null);
  var NAC = (typeof module !== 'undefined' && module.exports) ? require('./autocut.js') : (typeof window !== 'undefined' ? window.NakiAutoCut : null);
  var NRP = (typeof module !== 'undefined' && module.exports) ? require('./speedramp.js') : (typeof window !== 'undefined' ? window.NakiRamp : null);`, 'editor: modules');
rep(ed, "{ id: 'edReframe', label: 'Auto reframe', icon: G.reframe, run: P2('reframe') },",
  `{ id: 'edReframe', label: 'Auto reframe', icon: G.reframe, run: P2('reframe') },
        { id: 'edAutoCut', label: 'Auto cut', icon: G.cut, run: P2('autocut') },
        { id: 'edSpeedRamp', label: 'Auto ramp', icon: G.curve, run: P2('speedramp') },`, 'editor: Edit row buttons');
rep(ed, "{ id: 'edAddFrame', label: 'Frames', icon: G.frame, run: function (){ openPanel('framepick'); } },",
  `{ id: 'edAddFrame', label: 'Frames', icon: G.frame, run: function (){ openPanel('framepick'); } },
        { id: 'edOverlayPip', label: 'PiP', icon: G.pip, run: function (){ openPanel('pip'); }, disabled: !isO || !!selGen() },`, 'editor: PiP button');
rep(ed, "label: 'Speed curve (graph)', run: function (){ openPanel('speedcurve'); } }",
  "label: 'Speed curve (graph)', run: function (){ openPanel('speedcurve'); } }, { id: 'edSpeedAuto', label: 'Auto ramp', run: function (){ openPanel('speedramp'); } }", 'editor: Speed panel link');

rep(ed, '  // ----- save still: the picture at the playhead as a PNG, in one tap -----', `  // ----- picture in picture, auto cut, auto speed ramp -----
  G.pip = svg('<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>');
  PANELS.pip = { title: 'Picture in picture', build: function (body){
    var c = selOverlay();
    if (!c || c.gen){ body.appendChild(mk('div', 'ed-hint', 'Tap a photo or video overlay on the timeline or the picture first.')); return; }
    var o = E.chip.pip || (E.chip.pip = { size: 'm' }), a = E.proj.assets[c.asset] || {}, ovAsp = (a.w > 0 && a.h > 0) ? a.h / a.w : 9 / 16;
    var fa = frameAspect() || ((E.frameDims && E.frameDims.h) ? E.frameDims.w / E.frameDims.h : 16 / 9);
    body.appendChild(chips([{ key: 's', label: 'Small' }, { key: 'm', label: 'Medium' }, { key: 'l', label: 'Large' }], o.size, function (k){ o.size = k; renderDock(); }));
    body.appendChild(chips(P.PIP_PRESETS, null, function (k){
      var pl = P.pipPlacement(k, P.PIP_SIZES[o.size], fa, ovAsp); if (!pl) return;
      var q = P.setOverlayPlace(E.hist.cur, c.id, pl); if (q === E.hist.cur) toast('It is already there.'); else commit(q);
    }));
    var m0 = NFX && c.mask ? NFX.cleanMask(c.mask) : null, round = !!(m0 && m0.shape === 'rect');
    body.appendChild(actions([{ id: 'edPipRound', label: round ? 'Rounded corners: on' : 'Rounded corners: off', on: round,
      run: function (){ commit(P.setOverlayFx(E.hist.cur, c.id, { mask: round ? null : { shape: 'rect', corner: 0.2 } })); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Tap a spot to put the overlay there at the size you chose. It stays an ordinary overlay, so you can still drag it, resize it or animate it under Edit. A preset takes away its position and size keyframes. If the rounded corners crop too much, open Mask and raise Size.'));
  } };

  function cutTargets(all){
    var out = [];
    if (all){ var lane = E.proj.tracks.filter(function (t){ return t.role === 'movie'; })[0]; if (lane) lane.clips.forEach(function (c){ if (c.type === 'video' && !c.reverse && !c.curve) out.push(c); }); }
    else { var c = targetVideo(); if (c && c.type === 'video' && !c.reverse && !c.curve) out.push(c); }
    return out;
  }
  function runAutoCut(o){
    if (E.cutRun) return;
    if (!NAC){ toast('autocut.js is not loaded. Add <script src="autocut.js"></script> to index.html, before editor.js.'); return; }
    var list = cutTargets(o.all), h = E.hooks;
    if (!list.length){ toast('Pick a picture clip where the movie plays forwards and has no speed curve.'); return; }
    pause();
    var jobs = list.map(function (c){
      var asset = (c.asset && c.asset !== 'movie') ? c.asset : 'movie';
      return { id: c.id, url: asset === 'movie' ? (h.movieUrl && h.movieUrl()) : (h.videoUrl && h.videoUrl(asset)), from: c.in, to: c.in + c.dur * (c.speed || 1) };
    });
    if (jobs.some(function (j){ return !j.url; })){ toast('The video file for a clip is not available here.'); return; }
    E.cutRun = { msg: 'Starting...' }; renderDock();
    var say = function (m){ if (E.cutRun) E.cutRun.msg = m; if (E.cutStatus) E.cutStatus.textContent = m; }, found = [];
    jobs.reduce(function (chain, j, i){
      return chain.then(function (){
        return NAC.analyzeVideo(j.url, j.from, j.to, { onProgress: function (f){ say('Watching clip ' + (i + 1) + ' of ' + jobs.length + '... ' + Math.round(f * 100) + '%'); } })
          .then(function (samples){ found.push(NAC.detect(samples, { sensitivity: o.sens, minMs: o.min })); });
      });
    }, Promise.resolve()).then(function (){
      var q = E.hist.cur, total = 0;
      jobs.forEach(function (j, i){ var r = {}; q = P.autoCutClip(q, j.id, found[i], { minMs: o.min }, r); total += r.cuts || 0; });
      E.cutRun = null;
      if (q === E.hist.cur){ renderDock(); toast('No scene changes were found. Try Every change, or a shorter piece.', 7000); return; }
      commit(q); toast('Cut in ' + total + ' place' + (total === 1 ? '' : 's') + '. Delete or move the pieces; Undo takes all the cuts back.', 8000);
    }).catch(function (err){
      E.cutRun = null; console.error('auto cut failed', err); renderDock();
      toast('Auto cut did not work' + (err && err.message ? ': ' + err.message : '') + '.', 9000);
    });
  }
  PANELS.autocut = { title: 'Auto cut', build: function (body){
    if (!NAC){ body.appendChild(mk('div', 'ed-hint', 'autocut.js is not loaded. Add <script src="autocut.js"></script> to index.html, before editor.js.')); return; }
    var c = needPicture(body); if (!c) return;
    if (c.type !== 'video' || c.reverse || c.curve){ body.appendChild(mk('div', 'ed-hint', 'Pick a part where the movie plays forwards. A paused, reversed or speed-curved clip cannot be auto cut.')); return; }
    var o = E.chip.autocut || (E.chip.autocut = { sens: 'medium', min: 1000, all: false }), run = !!E.cutRun;
    body.appendChild(chips(NAC.SENS_LIST, o.sens, function (k){ o.sens = k; renderDock(); }));
    body.appendChild(chips([{ key: 'clip', label: 'This clip' }, { key: 'all', label: 'Whole video' }], o.all ? 'all' : 'clip', function (k){ o.all = k === 'all'; renderDock(); }));
    body.appendChild(sliderRow('Shortest piece', 500, 5000, 100, o.min, secs, null, function (v){ o.min = v; }));
    var st = mk('div', 'ed-hint', run ? E.cutRun.msg : 'Naki watches the picture on this device and cuts the clip wherever the scene changes.');
    E.cutStatus = st; body.appendChild(st);
    body.appendChild(actions([{ id: 'edAutoCutGo', label: run ? 'Working...' : 'Find and cut', run: function (){ runAutoCut(o); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Only the picture and its movie sound are cut; your voice, music and titles stay as they are. A fast-moving shot can look like a cut, so pick Big changes only if you get too many pieces. It can take a minute on a long clip.'));
  } };

  function applyRamp(key, all){
    var q = E.hist.cur, list = [], seen = {};
    if (all){
      var lane = q.tracks.filter(function (t){ return t.role === 'movie'; })[0];
      (lane ? lane.clips.slice().sort(function (a, b){ return a.start - b.start; }) : []).forEach(function (c){
        if (c.type !== 'video' || c.reverse) return;
        var g = c.curve && c.curve.g; if (g){ if (seen[g]) return; seen[g] = 1; }
        list.push(c);
      });
    } else { var t = targetVideo(); if (t && t.type === 'video' && !t.reverse) list.push(t); }
    if (!list.length){ toast('Pick a picture clip where the movie plays forwards.'); return; }
    var done = 0;
    list.forEach(function (c, i){
      var q2;
      if (key === 'none') q2 = P.clearSpeedCurve(q, c.id);
      else { var pts = NRP.points(key === 'auto' ? NRP.auto(i, list.length, c.dur) : key); if (!pts) return; q2 = P.setSpeedCurve(q, c.id, pts); }
      if (q2 !== q){ q = q2; done++; }
    });
    if (q === E.hist.cur){ toast('Nothing changed. A clip needs to be at least half a second long.'); return; }
    E.cv = null; commit(q);
    toast(key === 'none' ? 'Back to normal speed.' : 'Speed ramp on ' + done + ' clip' + (done === 1 ? '' : 's') + '. Press play to see it; fine-tune it under Curve.', 7000);
  }
  PANELS.speedramp = { title: 'Auto speed ramp', build: function (body){
    if (!NRP || !NCV){ body.appendChild(mk('div', 'ed-hint', 'speedramp.js is not loaded. Add <script src="speedramp.js"></script> to index.html, before editor.js.')); return; }
    var c = needPicture(body); if (!c) return;
    if (c.type !== 'video' || c.reverse){ body.appendChild(mk('div', 'ed-hint', 'Pick a part where the movie plays forwards. A paused or reversed picture has no speed ramp.')); return; }
    var o = E.chip.ramp || (E.chip.ramp = { all: false });
    body.appendChild(chips([{ key: 'clip', label: 'This clip' }, { key: 'all', label: 'Whole track' }], o.all ? 'all' : 'clip', function (k){ o.all = k === 'all'; renderDock(); }));
    body.appendChild(chips([{ key: 'auto', label: 'Auto' }].concat(NRP.PRESETS.map(function (p){ return { key: p.key, label: p.label }; }), [{ key: 'none', label: 'Normal' }]), null, function (k){ applyRamp(k, o.all); }));
    body.appendChild(mk('div', 'ed-hint', 'Tap one to apply it. Auto picks a ramp for each clip: the first speeds up, the last slows down, short clips stay gentle. Whole track does every picture clip at once. The movie sound follows the speed; your voice does not. Videos with a speed export with the compatible engine, which takes longer. Undo takes it all back.'));
  } };

  // ----- save still: the picture at the playhead as a PNG, in one tap -----`, 'editor: panels');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(pj); save(ed); save(ix); save(sw);
console.log('Done.\nNow run:  node tests/pip-cut-ramp.test.js   and then   npm test');