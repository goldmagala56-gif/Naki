'use strict';
// node tools/apply-photos.js   (from the project folder)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function load(rel) { const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o) { fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const problems = [], notes = [];
function rep(o, find, replace, label, optional) {
  const n = o.text.split(find).length - 1;
  if (n !== 1) { if (optional) { notes.push(label + ': skipped (found ' + n + ' times)'); return; } problems.push(label + ': found ' + n + ' times (need exactly 1) in ' + o.rel); return; }
  o.text = o.text.replace(find, () => replace);
}
const ed = load('www/editor.js'), pj = load('www/project.js'), pl = load('www/plan.js'), ee = load('www/export-engine.js'), wc = load('www/webcodecs-export.js');
if (ed.text.includes('function addPhotoFromFile')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

/* ---------------- project.js ---------------- */
rep(pj, `// ---------- undo / redo ----------`, `// ---------- photos on the picture line ----------
// A photo is a picture clip of type 'freeze' whose asset is an image (project.assets[asset].type === 'image'), so it trims, splits, moves, zooms, has a
// transition and a Ken Burns movement (the usual zoom / pan keyframes) like any other picture clip. The file is kept by the page, like an added video.
function isPhotoAsset(p, asset){ var a = asset && p.assets && p.assets[asset]; return !!(a && a.type === 'image'); }
// info = { name, w, h }. Goes after the last picture clip. durMs defaults to 3 s.
function addPhotoClip(p, info, out, durMs){
  info = info || {};
  var q = cloneProject(p), lane = pictureLane(q); if (!lane) return p;
  var d = Math.round(Math.max(500, Math.min(60000, +durMs || 3000))), start = 0;
  lane.clips.forEach(function (c){ start = Math.max(start, clipEnd(c)); });
  var n = 1; while (q.assets['v' + n]) n++;
  var asset = 'v' + n; q.assets[asset] = { type: 'image', name: info.name || 'photo', durMs: null, w: info.w || 0, h: info.h || 0 };
  var id = newId('c');
  lane.clips.push({ id: id, type: 'freeze', asset: asset, start: start, dur: d, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 });
  if (out){ out.id = id; out.asset = asset; }
  return finish(q);
}
// How long a photo shows (0.5 to 60 s). The picture clips after it move up or back; its keyframes (Ken Burns) stretch with it.
function setPhotoDuration(p, id, ms){
  var f = findClip(p, id); if (!f || f.track.role !== 'movie' || f.clip.type !== 'freeze' || !isPhotoAsset(p, f.clip.asset)) return p;
  var d = Math.round(+ms); if (isNaN(d)) return p;
  d = Math.max(500, Math.min(60000, d)); if (d === f.clip.dur) return p;
  var q = cloneProject(p), c = findClip(q, id).clip, old = c.dur, ratio = d / old, delta = d - old, anchor = c.start + old;
  if (c.kf){
    var kk = {}; Object.keys(c.kf).forEach(function (k){ kk[k] = c.kf[k].map(function (pt){ return pt.length > 2 ? [Math.round(pt[0] * ratio), pt[1], pt[2]] : [Math.round(pt[0] * ratio), pt[1]]; }); });
    c.kf = kk;
  }
  c.dur = d;
  if (c.vFadeIn) c.vFadeIn = Math.min(c.vFadeIn, Math.floor(d / 2));
  if (c.vFadeOut) c.vFadeOut = Math.min(c.vFadeOut, Math.floor(d / 2));
  q.tracks.forEach(function (tr){
    if (tr.role !== 'movie' && tr.role !== 'movieSound') return;
    tr.clips.forEach(function (x){ if (x.id !== id && x.start >= anchor) x.start += delta; });
  });
  return validate(q).length ? p : finish(q);
}

// ---------- undo / redo ----------`, 'project: photo functions');
rep(pj, `selectRight: selectRight, deleteClips: deleteClips`, `selectRight: selectRight, deleteClips: deleteClips, addPhotoClip: addPhotoClip, setPhotoDuration: setPhotoDuration, isPhotoAsset: isPhotoAsset`, 'project: export');

/* ---------------- plan.js ---------------- */
rep(pl, `if (c.asset && c.asset !== 'movie') sp.asset = c.asset;`, `if (c.asset && c.asset !== 'movie') sp.asset = c.asset;
      if (sp.type === 'freeze' && p.assets && p.assets[c.asset] && p.assets[c.asset].type === 'image') sp.image = true;   // a photo: the engines draw the picture file itself`, 'plan: photo flag');

/* ---------------- export-engine.js (ffmpeg) ---------------- */
rep(ee, `} else if (sp.type === 'freeze') {`, `} else if (sp.type === 'freeze' && sp.image) {   // a photo: the picture file is looped, so zoom / pan keyframes (Ken Burns) move frame by frame
      jobs.push({ label: 'photo ' + (i + 1), produces: vfile,
        args: pictureArgs(['-loop', '1', '-framerate', String(FPS), '-t', (spanSec + 1).toFixed(3), '-i', fileOf(sp)], pictureFit(sp), nFrames, vfile, sp, spanSec, 1, 0) });
    } else if (sp.type === 'freeze') {`, 'ffmpeg engine: photos');
rep(ee, `if (sp.type === 'freeze') return { piece: piece,`, `if (sp.type === 'freeze' && sp.image) return { piece: piece, src: ['-loop', '1', '-framerate', String(FPS), '-t', (dSec + 1).toFixed(3), '-i', fileOf(sp)], fit: pictureFit(piece), speed: 1, tpad: 0, pad: 0 };
      if (sp.type === 'freeze') return { piece: piece,`, 'ffmpeg engine: photos in transitions');

/* ---------------- webcodecs-export.js (fast engine) ---------------- */
rep(wc, `var vin = new M.Input({ source: new M.BlobSource(vfiles[vkeys[vk]]), formats: M.ALL_FORMATS }), vtrack = await vin.getPrimaryVideoTrack();`,
  `var vin = new M.Input({ source: new M.BlobSource(vfiles[vkeys[vk]]), formats: M.ALL_FORMATS }), vtrack = null;
      try { vtrack = await vin.getPrimaryVideoTrack(); } catch (e) { vtrack = null; }   // a photo is not a video: it is read below`, 'fast engine: photos are not videos');
rep(wc, `function sinkFor(sp) { return (sp.asset && vids[sp.asset]) ? vids[sp.asset].sink : sink; }`, `var imgs = {};   // the photos on the picture line: asset -> picture
    for (var pi = 0; pi < plan.video.length; pi++) {
      var psp = plan.video[pi];
      if (psp.image && psp.asset && !imgs[psp.asset] && vfiles[psp.asset]) { try { imgs[psp.asset] = await createImageBitmap(vfiles[psp.asset]); } catch (e) {} }
    }
    function sinkFor(sp) { return (sp.asset && vids[sp.asset]) ? vids[sp.asset].sink : sink; }`, 'fast engine: load the photos');
rep(wc, `var held = await sinkFor(sp).getSample(sp.movieAt / 1000);`, `var photoBm = (sp.image && sp.asset && imgs[sp.asset]) || null, held = photoBm ? null : await sinkFor(sp).getSample(sp.movieAt / 1000);`, 'fast engine: photo span');
rep(wc, `if (held) { paintSample(held, NA ? NA.spanAt(sp, 0) : sp); if (!sp.kf) { held.close(); held = null; } } else paintLayer(null, 0, 0, sp);`,
  `if (photoBm) paintLayer(photoBm, photoBm.width, photoBm.height, NA ? NA.spanAt(sp, 0) : sp);
          else if (held) { paintSample(held, NA ? NA.spanAt(sp, 0) : sp); if (!sp.kf) { held.close(); held = null; } } else paintLayer(null, 0, 0, sp);`, 'fast engine: draw the photo');
rep(wc, `if (held && sp.kf) paintSample(held, NA.spanAt(sp, j * 1000 / FPS));`, `if (held && sp.kf) paintSample(held, NA.spanAt(sp, j * 1000 / FPS)); else if (photoBm && sp.kf) paintLayer(photoBm, photoBm.width, photoBm.height, NA.spanAt(sp, j * 1000 / FPS));`, 'fast engine: Ken Burns on a photo');

/* ---------------- editor.js ---------------- */
rep(ed, `{ id: 'edAddVideo', label: 'Add video', icon: G.addVideo, run: addVideoFromFile },`, `{ id: 'edAddVideo', label: 'Add video', icon: G.addVideo, run: addVideoFromFile },
        { id: 'edAddPhoto', label: 'Add photo', icon: G.photo, run: addPhotoFromFile },
        { id: 'edSlideshow', label: 'Slideshow', icon: G.slides, run: function (){ openPanel('slideshow'); } },
        { id: 'edPhoto', label: 'Photo', icon: G.photo, run: function (){ openPanel('photo'); }, disabled: !(c && c.type === 'freeze' && isPhotoClip(c)) },`, 'editor: photo buttons');
// the preview: a photo on the picture row is shown by its own <img>, laid out exactly like the video
rep(ed, `var wantAsset = (vc && vc.asset) || 'movie', skipMedia = false;`, `var photo = !!(vc && vc.type === 'freeze' && isPhotoClip(vc)), em = photo ? photoEl() : m, wantAsset = (vc && vc.asset) || 'movie', skipMedia = false;
    photoSync(photo, vc);`, 'editor: preview, photo or video');
rep(ed, `if (vc && wantAsset !== E.curAsset) skipMedia = !swapSource(wantAsset, m);`, `if (vc && !photo && wantAsset !== E.curAsset) skipMedia = !swapSource(wantAsset, m);
    if (photo && !(E.hooks.videoUrl && E.hooks.videoUrl(vc.asset))) skipMedia = true;`, 'editor: preview, photo file');
rep(ed, `var tcss = vc ? (E.cropOn ? framePicture(null, m, null) : framePicture((vc.kf && NANIM) ? NANIM.pictureTransform(vc.transform, vc.kf, E.t - vc.start) : vc.transform, m, vc.crop)) : '';`,
  `var tcss = vc ? (E.cropOn ? framePicture(null, em, null) : framePicture((vc.kf && NANIM) ? NANIM.pictureTransform(vc.transform, vc.kf, E.t - vc.start) : vc.transform, em, vc.crop)) : '';`, 'editor: preview, photo transform');
rep(ed, `if (tcss !== E.lastTransform){ m.style.transform = tcss; E.lastTransform = tcss; }`, `if (tcss !== E.lastTransform){ em.style.transform = tcss; E.lastTransform = tcss; }`, 'editor: preview, photo transform (2)');
rep(ed, `if (css !== E.lastFilter){ m.style.filter = css; E.lastFilter = css; }`, `if (css !== E.lastFilter){ em.style.filter = css; E.lastFilter = css; }`, 'editor: preview, photo look');
rep(ed, `if (op !== E.lastOpacity){ m.style.opacity = op; E.lastOpacity = op; }`, `if (op !== E.lastOpacity){ em.style.opacity = op; E.lastOpacity = op; }`, 'editor: preview, photo opacity');
rep(ed, `if (movieReady() && !E.swapping && !skipMedia){`, `if (photo){ if (!m.paused) m.pause(); } else if (movieReady() && !E.swapping && !skipMedia){`, 'editor: preview, no movie time for a photo');
rep(ed, `syncLayout(m, vc, css); syncGrade(m, vc, css);`, `syncLayout(m, photo ? null : vc, css); syncGrade(m, photo ? null : vc, css);`, 'editor: preview, layouts and colour grades use the movie frame');
rep(ed, `var other = tr.before ? tr.b : tr.a, want = (tr.before ? tr.bMs : tr.aMs) / 1000, p = tr.p;`, `var oth = tr.before ? tr.b : tr.a;
    if (E.photoOn || (oth.asset || 'movie') !== ((vc && vc.asset) || 'movie')){ if (E.xOn){ x.style.display = 'none'; try { x.pause(); } catch (e) {} E.xOn = false; } return; }   // the preview can only blend two pictures from the same file; the export has the real transition
    var other = tr.before ? tr.b : tr.a, want = (tr.before ? tr.bMs : tr.aMs) / 1000, p = tr.p;`, 'editor: preview, transitions next to a photo');
rep(ed, `E.lastTransform = vc ? css : ''; m.style.transform = vc ? css : '';`, `if (E.photoOn){ E.lastTransform = ''; E.boxKey = null; E.boxMode = ''; } else { E.lastTransform = vc ? css : ''; m.style.transform = vc ? css : ''; }`, 'editor: resize while a photo shows');
rep(ed, `renderTexts([]);`, `renderTexts([]); try { photoSync(false, null); } catch (e) {}`, 'editor: put the video back when the editor closes');
// the timeline
rep(ed, `image: tr.kind === 'overlay' && c.type === 'freeze', store: TS,`, `image: (tr.kind === 'overlay' && c.type === 'freeze') || (tr.kind === 'video' && c.type === 'freeze' && isPhotoClip(c)), store: TS,`, 'editor: photo thumbnails');
rep(ed, `return (c.type === 'freeze' ? 'Paused picture' : (c.asset && c.asset !== 'movie' ?`, `return (c.type === 'freeze' ? (isPhotoClip(c) ? 'Photo · ' + ((E.proj.assets[c.asset] && E.proj.assets[c.asset].name) || '') : 'Paused picture') : (c.asset && c.asset !== 'movie' ?`, 'editor: photo clip name');
// tools that only make sense on the movie
rep(ed, `if (c.type !== 'video' && c.type !== 'freeze'){ body.appendChild(mk('div', 'ed-hint', 'Pick a picture clip to crop.')); return; }`, `if (c.type !== 'video' && c.type !== 'freeze'){ body.appendChild(mk('div', 'ed-hint', 'Pick a picture clip to crop.')); return; }
      if (isPhotoClip(c)){ body.appendChild(mk('div', 'ed-hint', 'Crop is for video clips for now. For a photo, use Zoom (and Left / right, Up / down) to frame it.')); return; }`, 'editor: crop not for photos');
rep(ed, `var m = E.hooks.movie; syncMedia();`, `if (isPhotoClip(vc)) return none('Save still is for video clips. A photo already is a picture.');
    var m = E.hooks.movie; syncMedia();`, 'editor: save still not for photos');

const BLOCK = `/* ---------- photos on the picture line: Add photo, Ken Burns, slideshow ---------- */
  G.photo = svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>');
  G.slides = svg('<rect x="3" y="6" width="13" height="11" rx="1.5"/><path d="M19 8v9M22 10v5"/>');
  (function (){
    if (typeof document === 'undefined' || !document.head) return;
    var s = document.createElement('style'); s.textContent = '.ed-photo{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;pointer-events:none}'; document.head.appendChild(s);
  })();
  function isPhotoClip(c){ var a = c && c.asset && E.proj && E.proj.assets[c.asset]; return !!(a && a.type === 'image'); }
  // The picture of a photo clip is an <img> inside the same box as the video. This returns something that looks enough like the video element
  // (videoWidth, videoHeight, style) for the picture layout code to place it.
  function photoEl(){
    var im = E.ui.photo;
    if (!im){
      im = E.ui.photo = mk('img', 'ed-photo'); im.draggable = false; im.alt = ''; im.style.display = 'none';
      im.onload = function (){ E.boxKey = null; E.lastTransform = ''; if (E.isOpen) syncMedia(); };
      E.ui.picbox.appendChild(im);
    }
    return { img: im, videoWidth: im.naturalWidth || 0, videoHeight: im.naturalHeight || 0, style: im.style };
  }
  // Shows the photo (and hides the video) while a photo clip is under the playhead, and puts the video back afterwards.
  function photoSync(photo, vc){
    var m = E.hooks && E.hooks.movie, im = E.ui.photo;
    if (!photo){
      if (E.photoOn){
        E.photoOn = false; if (im) im.style.display = 'none'; if (m) m.style.visibility = '';
        E.lastTransform = E.lastFilter = E.lastOpacity = ''; E.boxKey = null; E.boxMode = '';
      }
      return;
    }
    photoEl(); im = E.ui.photo;
    var url = E.hooks.videoUrl ? E.hooks.videoUrl(vc.asset) : '';
    if (url && im._src !== url){ im._src = url; im.src = url; E.boxKey = null; }
    if (!E.photoOn){
      E.photoOn = true; im.style.display = 'block'; if (m) m.style.visibility = 'hidden';
      E.lastTransform = E.lastFilter = E.lastOpacity = ''; E.boxKey = null; E.boxMode = '';
    }
  }
  function readPhoto(f){
    return new Promise(function (res){
      var u = URL.createObjectURL(f), im = new Image();
      im.onload = function (){ URL.revokeObjectURL(u); res({ file: f, name: f.name, kind: 'image', w: im.naturalWidth, h: im.naturalHeight }); };
      im.onerror = function (){ URL.revokeObjectURL(u); toast('The picture "' + f.name + '" could not be read. Use a JPG, PNG or WebP photo.', 7000); res(null); };
      im.src = u;
    });
  }
  // Opens the file chooser for photos; resolves a list of { file, name, w, h } (empty when nothing was chosen).
  function pickPhotos(multi){
    return new Promise(function (res){
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = !!multi;
      inp.onchange = function (){
        var l = [].slice.call(inp.files || []); if (!l.length) return res([]);
        Promise.all(l.map(readPhoto)).then(function (a){ res(a.filter(Boolean)); });
      };
      inp.addEventListener('cancel', function (){ res([]); });
      inp.click();
    });
  }
  function addPhotoFromFile(){
    if (!E.hooks.setVideoFile){ toast('Adding photos is not available here.'); return; }
    pause();
    pickPhotos(false).then(function (list){
      var info = list[0]; if (!info) return;
      var out = {}, q = P.addPhotoClip(E.hist.cur, info, out);
      if (q === E.hist.cur){ toast('That photo could not be added.'); return; }
      E.hooks.setVideoFile(out.asset, info.file);
      var nf = P.findClip(q, out.id); if (nf) E.t = nf.clip.start;
      E.sel = out.id; commit(q); openPanel('photo', 'edit');
      toast('Photo added at the end of the picture row, 3 seconds long. Set its length and a Ken Burns movement here.', 6000);
    });
  }
  // o = { dur (ms per photo), kb (Ken Burns on), trans (transition key or 'none') }. The photos you choose go after the last picture clip, one after another.
  function buildSlideshow(o){
    if (!E.hooks.setVideoFile){ toast('Adding photos is not available here.'); return; }
    pause();
    pickPhotos(true).then(function (list){
      if (!list.length) return;
      var q = E.hist.cur, KB = ['zoomin', 'panright', 'zoomout', 'panleft'], firstId = null, n = 0;
      list.forEach(function (info){
        var out = {}, q2 = P.addPhotoClip(q, info, out, o.dur);
        if (q2 === q) return;
        E.hooks.setVideoFile(out.asset, info.file); q = q2; n++;
        if (!firstId) firstId = out.id;
        if (o.kb) q = P.setMotionPreset(q, out.id, KB[(n - 1) % KB.length]);
        if (o.trans !== 'none' && n > 1) q = P.setTransition(q, out.id, { type: o.trans, durMs: 600 });
      });
      if (!n){ toast('None of those photos could be added.'); return; }
      var f0 = P.findClip(q, firstId); if (f0) E.t = f0.clip.start;
      E.sel = firstId; commit(q); closePanel();
      toast(n + ' photo' + (n === 1 ? '' : 's') + ' added after the last clip, ' + (o.dur / 1000) + ' s each.' + (n < list.length ? ' ' + (list.length - n) + ' could not be added.' : '') + ' Undo takes them all back.', 8000);
    });
  }
  PANELS.photo = { title: 'Photo', build: function (body){
    var c = targetVideo();
    if (!c || c.type !== 'freeze' || !isPhotoClip(c)){ body.appendChild(mk('div', 'ed-hint', 'Tap a photo on the picture row first (Add photo puts one there).')); return; }
    body.appendChild(chips([2000, 3000, 5000, 8000].map(function (v){ return { key: v, label: secs(v) }; }), c.dur, function (k){ var q = P.setPhotoDuration(E.hist.cur, c.id, k); if (q === E.hist.cur) renderDock(); else commit(q); }));
    body.appendChild(sliderRow('Length', 500, 15000, 100, Math.min(15000, c.dur), secs, null, function (v){ commit(P.setPhotoDuration(E.hist.cur, c.id, v)); }));
    if (NMO){
      var cur = (E.chip.motion && E.chip.motion.id === c.id) ? E.chip.motion.key : 'none';
      body.appendChild(mk('div', 'ed-hint', 'Ken Burns movement:'));
      body.appendChild(chips(NMO.PICTURE_PRESETS, cur, function (k){ E.chip.motion = { id: c.id, key: k }; commit(P.setMotionPreset(E.hist.cur, c.id, k)); seek(c.start); }));
    }
    body.appendChild(actions([{ id: 'edPhotoTrans', label: 'Transition', run: function (){ openPanel('transition'); } }, { id: 'edPhotoZoom', label: 'Zoom / pan', run: function (){ openPanel('frame'); } }]));
    body.appendChild(mk('div', 'ed-hint', 'A photo is an ordinary picture clip with no sound: drag its ends to change how long it shows, Split it, add a Transition from the clip before it, and use Adjust, Filters, Zoom and Fade on it. Ken Burns is a slow zoom or pan made of zoom keyframes; Length stretches it. Press play to see it.'));
  } };
  PANELS.slideshow = { title: 'Slideshow', build: function (body){
    var o = E.chip.show || (E.chip.show = { dur: 3000, kb: true, trans: 'fade' });
    body.appendChild(chips([2000, 3000, 4000, 6000].map(function (v){ return { key: v, label: secs(v) + ' each' }; }), o.dur, function (k){ o.dur = k; renderDock(); }));
    body.appendChild(chips([{ key: 'kb', label: 'Ken Burns zoom' }, { key: 'still', label: 'Still photos' }], o.kb ? 'kb' : 'still', function (k){ o.kb = k === 'kb'; renderDock(); }));
    body.appendChild(chips([{ key: 'none', label: 'No transition' }, { key: 'fade', label: 'Fade' }, { key: 'fadeblack', label: 'Dip to black' }, { key: 'slideleft', label: 'Slide' }, { key: 'zoomin', label: 'Zoom' }], o.trans, function (k){ o.trans = k; renderDock(); }));
    body.appendChild(actions([{ id: 'edShowGo', label: 'Choose photos', run: function (){ buildSlideshow(o); } }]));
    body.appendChild(mk('div', 'ed-hint', 'Choose several photos at once. They are added one after another at the end of the picture row, each with the length, Ken Burns movement and transition you picked here. Afterwards every photo is an ordinary clip you can shorten, move or change. Add music under Audio, and Beat sync can fit the photos to it. Naki starts from a movie, so the photos go after it; delete the movie part first if you want only photos.'));
  } };

  /* ---------- titles drawn over the preview ---------- */`;
rep(ed, `/* ---------- titles drawn over the preview ---------- */`, BLOCK, 'editor: photos');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[ed, pj, pl, ee, wc].forEach(save);
console.log('Done.' + (notes.length ? '\n  ' + notes.join('\n  ') : '') + '\nNow run:  node tests/photos.test.js   and   npm test');