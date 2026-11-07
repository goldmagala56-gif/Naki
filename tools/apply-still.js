'use strict';
// node tools/apply-still.js   (from the project folder; run apply-crop-editor.js first)
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
const ed = load('www/editor.js');
if (!ed.text.includes('function buildCropUI')) { console.log('Run  node tools/apply-crop-editor.js  first.'); process.exit(1); }
if (ed.text.includes('function exportStill')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

rep(ed, "G.crop = svg('<path d=\"M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14\"/>');",
  "G.crop = svg('<path d=\"M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14\"/>');\n  G.still = svg('<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"1.6\"/><path d=\"M21 16l-5-5-8 8\"/>');", 'editor: still icon');

rep(ed, "{ id: 'edFreeze', label: 'Freeze', icon: G.freeze, run: P2('freeze') },",
  "{ id: 'edFreeze', label: 'Freeze', icon: G.freeze, run: P2('freeze') },\n        { id: 'edStill', label: 'Save still', icon: G.still, run: exportStill },", 'editor: Save still button');

rep(ed, "body.appendChild(actions([{ id: 'edFreeze', label: 'Freeze here', run: function (){ freezeHere(); } }]));",
  `body.appendChild(actions([{ id: 'edFreeze', label: 'Freeze here', run: function (){ freezeHere(); } },
        { id: 'edFreezeStill', label: 'Freeze + save still', run: freezeThenStill },
        { id: 'edStillNow', label: 'Save still', run: exportStill }]));
      body.appendChild(mk('div', 'ed-hint', 'Save still writes the picture at the playhead as a PNG: with its crop, zoom, look, fade, stickers and titles, in the shape you chose under Format. Overlays, effects and layouts are not in it.'));`, 'editor: freeze panel buttons');

const CODE = `// ----- save still: the picture at the playhead as a PNG, in one tap -----
  // Waits until the preview video has finished moving to the playhead, so the still is the right picture.
  function stillWait(m){
    return new Promise(function (res){
      if (!m.seeking && m.readyState >= 2) return res(true);
      var done = false, tm = 0;
      function fin(ok){ if (done) return; done = true; m.removeEventListener('seeked', onSeek); clearTimeout(tm); res(ok); }
      function onSeek(){ if (m.readyState >= 2) fin(true); }
      tm = setTimeout(function (){ fin(m.readyState >= 2); }, 3000);
      m.addEventListener('seeked', onSeek);
    });
  }
  // Draws the frame the way the export does: background, the picture (crop, then flip / turn / zoom, fitted in the frame), look, fade, stickers, titles.
  function drawStill(g, m, vc, W, H){
    var f = E.proj.format, bgc = '#111b24';
    try { if (frameAspect() && NF && f) bgc = NF.fillColor(NF.normalizeBg(f.bg)); } catch (e) {}
    g.fillStyle = bgc; g.fillRect(0, 0, W, H);
    var vw = m.videoWidth, vh = m.videoHeight; if (!vw || !vh) return;
    var t = vc.transform; if (vc.kf && NANIM) t = NANIM.pictureTransform(vc.transform, vc.kf, E.t - vc.start);
    var cr = vc.crop || { x: 0, y: 0, w: 1, h: 1 };
    g.save();
    if (NF && NF.containLayout){
      var L = NF.containLayout(t, W, H, vw * cr.w, vh * cr.h), b = L.box;
      g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip();
      if (vc.opacity != null && vc.opacity < 1) g.globalAlpha = Math.max(0, vc.opacity);
      var fl = vc.filter;
      if (fl) g.filter = 'brightness(' + (fl.brightness == null ? 1 : fl.brightness) + ') contrast(' + (fl.contrast == null ? 1 : fl.contrast) + ') saturate(' + (fl.saturate == null ? 1 : fl.saturate) + ')';
      g.translate(b.x + b.w / 2 + L.panX, b.y + b.h / 2 + L.panY); g.scale(L.zoom, L.zoom); g.rotate(L.rot * Math.PI / 180); if (L.flip) g.scale(-1, 1);
      g.drawImage(m, cr.x * vw, cr.y * vh, cr.w * vw, cr.h * vh, -L.dw / 2, -L.dh / 2, L.dw, L.dh);
    } else g.drawImage(m, cr.x * vw, cr.y * vh, cr.w * vw, cr.h * vh, 0, 0, W, H);
    g.restore();
    var fo = fadeOpacity(vc, E.t);
    if (fo < 1){ g.save(); g.globalAlpha = 1 - fo; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.restore(); }
    if (NSTK) P.stickersAt(E.proj, E.t).forEach(function (c){ try { NSTK.drawSticker(g, c, W, H); } catch (e) {} });
    var LKs = lookLib();
    if (LKs.drawTitle) P.textsAt(E.proj, E.t).forEach(function (c){ if (c.text) try { LKs.drawTitle(g, c, W, H); } catch (e) {} });
  }
  // Saves the picture at the playhead as a PNG. Resolves to true when it was saved.
  function exportStill(){
    var none = function (msg){ toast(msg); return Promise.resolve(false); };
    if (!movieReady()) return none('Choose the movie for this session first.');
    if (E.swapping) return none('One moment, the video is still loading. Try again.');
    pause();
    var s = P.sourceAt(E.proj, E.t), vc = s.video && s.video.clip;
    if (!vc) return none('There is no picture at the playhead. Move it onto the video first.');
    var m = E.hooks.movie; syncMedia();
    return stillWait(m).then(function (ready){
      if (!ready || !m.videoWidth) return none('The picture is not ready yet. Try again in a moment.');
      var vw = m.videoWidth, vh = m.videoHeight, a = frameAspect() || vw / vh, W, H;
      if (a >= 1){ H = Math.min(vh, 1080); W = Math.round(H * a); } else { W = Math.min(vw, 1080); H = Math.round(W / a); }
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      drawStill(cv.getContext('2d'), m, vc, W, H);
      return new Promise(function (res){
        cv.toBlob(function (blob){
          if (!blob){ toast('The still could not be made on this device.'); res(false); return; }
          var base = String((E.sess && E.sess.name) || 'naki').replace(/[^\\w\\-]+/g, '_').slice(0, 40) || 'naki';
          var name = base + '_still_' + (E.t / 1000).toFixed(1).replace('.', '_') + 's.png', a2 = document.createElement('a');
          a2.href = URL.createObjectURL(blob); a2.download = name; document.body.appendChild(a2); a2.click();
          setTimeout(function (){ URL.revokeObjectURL(a2.href); a2.remove(); }, 2000);
          toast('Saved ' + name); res(true);
        }, 'image/png');
      });
    });
  }
  // Saves the still first (the picture is the same before and after), then holds the picture.
  function freezeThenStill(){ return exportStill().then(function (){ freezeHere(); }); }
  // ----- crop (CapCut style): a dimmed picture with a frame you drag -----`;
rep(ed, '// ----- crop (CapCut style): a dimmed picture with a frame you drag -----', CODE, 'editor: save still code');
rep(ed, 'hasEdits: hasEdits, replaceMovie: replaceMovie,', 'hasEdits: hasEdits, exportStill: exportStill, replaceMovie: replaceMovie,', 'editor: public exportStill');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(ed);
console.log('Done.\nNow run:  node tests/still.test.js   and then   npm test');