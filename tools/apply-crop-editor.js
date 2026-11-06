'use strict';
// node tools/apply-crop-editor.js   (from the project folder; run apply-crop.js first)
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
const ed = load('www/editor.js'), wc = load('www/webcodecs-export.js'), pj = load('www/project.js');
if (!pj.text.includes('function setCrop')) { console.log('Run  node tools/apply-crop.js  first.'); process.exit(1); }
if (ed.text.includes('function buildCropUI')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- editor.js ----------
rep(ed, "G.shape = svg(", `G.crop = svg('<path d="M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14"/>');
  G.shape = svg(`, 'editor: crop icon');

rep(ed, "{ id: 'edRotate', label: 'Rotate', icon: G.rotate, run: rotateSel },",
  `{ id: 'edCrop', label: 'Crop', icon: G.crop, run: P2('crop') },
        { id: 'edRotate', label: 'Rotate', icon: G.rotate, run: rotateSel },`, 'editor: Crop button');

rep(ed, "u.textlayer = mk('div', 'ed-textlayer'); u.stage.appendChild(u.textlayer);",
  `u.textlayer = mk('div', 'ed-textlayer'); u.stage.appendChild(u.textlayer);
    u.croplayer = mk('div', 'ed-croplayer'); u.croplayer.style.cssText = 'position:absolute;display:none;overflow:hidden;pointer-events:none;z-index:6'; u.stage.appendChild(u.croplayer);`, 'editor: crop layer');

rep(ed, "boxes = [E.ui.textlayer, E.ui.picframe, E.ui.stickerlayer, E.ui.overlaylayer]",
  "boxes = [E.ui.textlayer, E.ui.picframe, E.ui.stickerlayer, E.ui.overlaylayer, E.ui.croplayer]", 'editor: crop layer follows the frame');
rep(ed, "layoutTextLayerBase(); layoutPicture(); syncStickers(); syncOverlays(); }",
  "layoutTextLayerBase(); layoutPicture(); syncStickers(); syncOverlays(); drawCrop(); }", 'editor: redraw the crop frame on resize');
rep(ed, "syncPicker();", "syncPicker(); syncCrop();", 'editor: dock shows / hides the crop frame');

// the picture box: reset, contain mode (do this one BEFORE adding the crop branch, which has the same line)
rep(ed, "m.style.position = ''; m.style.left = m.style.top = ''; m.style.width = m.style.height = '';",
  "m.style.position = ''; m.style.left = m.style.top = ''; m.style.width = m.style.height = ''; m.style.transformOrigin = ''; u.picbox.style.overflow = '';", 'editor: resetBox');
rep(ed, "E.boxKey = key; E.boxMode = 'contain';",
  "m.style.transformOrigin = ''; u.picbox.style.overflow = ''; E.boxKey = key; E.boxMode = 'contain';", 'editor: contain mode clears crop settings');
rep(ed, "function framePicture(t, m){", "function framePicture(t, m, crop){", 'editor: framePicture takes a crop');
rep(ed, "if (!fr || !W || !H || !m.videoWidth || !NF){",
`if (crop && W && H && m.videoWidth && NF && NF.containLayout){
      // crop first, then flip / turn / zoom, then the cropped piece is fitted inside the frame (bars when the shape differs), like the export
      var cw = m.videoWidth * crop.w, ch = m.videoHeight * crop.h, CL = NF.containLayout(t, W, H, cw, ch);
      var ckey = ['c', W, H, m.videoWidth, m.videoHeight, CL.rot, crop.x, crop.y, crop.w, crop.h].join('|');
      if (E.boxKey !== ckey){
        var cb = CL.box, fw = CL.dw / crop.w, fh = CL.dh / crop.h, ccx = crop.x + crop.w / 2, ccy = crop.y + crop.h / 2;
        u.picbox.style.left = cb.x + 'px'; u.picbox.style.top = cb.y + 'px'; u.picbox.style.width = cb.w + 'px'; u.picbox.style.height = cb.h + 'px'; u.picbox.style.overflow = 'hidden';
        m.style.position = 'absolute'; m.style.width = fw + 'px'; m.style.height = fh + 'px';
        m.style.left = (cb.w / 2 - ccx * fw) + 'px'; m.style.top = (cb.h / 2 - ccy * fh) + 'px';
        m.style.transformOrigin = (ccx * 100) + '% ' + (ccy * 100) + '%';
        E.boxKey = ckey; E.boxMode = 'contain';
      }
      return 'translate(' + CL.panX + 'px,' + CL.panY + 'px) scale(' + CL.zoom + ') rotate(' + CL.rot + 'deg)' + (CL.flip ? ' scaleX(-1)' : '');
    }
    if (!fr || !W || !H || !m.videoWidth || !NF){`, 'editor: crop in the preview');

rep(ed, "css = framePicture(vc ? vc.transform : null, m);",
  "css = framePicture(vc && !E.cropOn ? vc.transform : null, m, vc && !E.cropOn ? vc.crop : null);", 'editor: layoutPicture uses the crop');
rep(ed, "var tcss = vc ? framePicture((vc.kf && NANIM) ? NANIM.pictureTransform(vc.transform, vc.kf, E.t - vc.start) : vc.transform, m) : '';",
  "var tcss = vc ? (E.cropOn ? framePicture(null, m, null) : framePicture((vc.kf && NANIM) ? NANIM.pictureTransform(vc.transform, vc.kf, E.t - vc.start) : vc.transform, m, vc.crop)) : '';", 'editor: syncMedia uses the crop');

// the panel
rep(ed, "opacity: { title: 'Opacity', build: function (body){",
`crop: { title: 'Crop', build: function (body){
      var c = needPicture(body); if (!c) return;
      if (c.type !== 'video' && c.type !== 'freeze'){ body.appendChild(mk('div', 'ed-hint', 'Pick a picture clip to crop.')); return; }
      var m = E.hooks.movie, vw = m.videoWidth || 16, vh = m.videoHeight || 9;
      E.cropDraft = c.crop ? { x: c.crop.x, y: c.crop.y, w: c.crop.w, h: c.crop.h } : { x: 0, y: 0, w: 1, h: 1 };
      var RAT = [{ key: 'free', label: 'Free' }, { key: 'orig', label: 'Original' }, { key: '16:9', label: '16:9' }, { key: '9:16', label: '9:16' }, { key: '4:3', label: '4:3' },
        { key: '3:4', label: '3:4' }, { key: '1:1', label: '1:1' }, { key: '3:2', label: '3:2' }, { key: '2:3', label: '2:3' }];
      var cur = chipKey('crop', RAT, 'free');
      body.appendChild(chips(RAT, cur, function (k){
        E.chip.crop = k;
        var a = cropAspectOf(k, vw, vh), q = E.hist.cur, d = E.cropDraft;
        if (a) q = P.setCrop(q, c.id, P.cropRect(a, 1, vw, vh, d.x + d.w / 2, d.y + d.h / 2));
        if (q === E.hist.cur) renderDock(); else commit(q);
      }));
      body.appendChild(actions([
        { id: 'edCropReset', label: 'Reset', run: function (){ E.chip.crop = 'free'; var q = P.setCrop(E.hist.cur, c.id, null); if (q === E.hist.cur) renderDock(); else commit(q); } },
        { id: 'edCropAll', label: 'Apply to all', run: function (){ commit(P.setCrop(E.hist.cur, null, c.crop || null)); toast('This crop is on every clip now.'); } }]));
      body.appendChild(mk('div', 'ed-hint', 'Drag the frame to move it, or drag its corners and edges to resize. Pick a shape to lock the proportions. The cropped part is fitted inside the video, with bars if its shape differs. Close the panel to see the result.'));
    } },
    opacity: { title: 'Opacity', build: function (body){`, 'editor: crop panel');

// the crop frame on the picture
rep(ed, "// ----- scroll cues: arrows and soft edges",
`// ----- crop (CapCut style): a dimmed picture with a frame you drag -----
  function cropAspectOf(k, vw, vh){
    if (k === 'orig') return vw / vh;
    var p = String(k).split(':'); return (p.length === 2 && +p[0] > 0 && +p[1] > 0) ? +p[0] / +p[1] : 0;
  }
  function cropAspect(){ var m = E.hooks && E.hooks.movie; return cropAspectOf(E.chip.crop || 'free', (m && m.videoWidth) || 16, (m && m.videoHeight) || 9); }
  // where the whole picture sits inside the crop layer (px)
  function cropPicRect(){
    var lay = E.ui.croplayer, m = E.hooks.movie, W = lay.clientWidth || 1, H = lay.clientHeight || 1, vw = m.videoWidth || 16, vh = m.videoHeight || 9, s = Math.min(W / vw, H / vh);
    return { x: (W - vw * s) / 2, y: (H - vh * s) / 2, w: vw * s, h: vh * s };
  }
  var CROP_HD = { nw: 'left:-2px;top:-2px', n: 'left:50%;top:-2px;margin-left:-15px', ne: 'right:-2px;top:-2px', e: 'right:-2px;top:50%;margin-top:-15px',
    se: 'right:-2px;bottom:-2px', s: 'left:50%;bottom:-2px;margin-left:-15px', sw: 'left:-2px;bottom:-2px', w: 'left:-2px;top:50%;margin-top:-15px' };
  var CROP_MK = { nw: 'top:0;left:0;width:18px;height:18px;border-top:4px solid #fff;border-left:4px solid #fff', ne: 'top:0;right:0;width:18px;height:18px;border-top:4px solid #fff;border-right:4px solid #fff',
    se: 'bottom:0;right:0;width:18px;height:18px;border-bottom:4px solid #fff;border-right:4px solid #fff', sw: 'bottom:0;left:0;width:18px;height:18px;border-bottom:4px solid #fff;border-left:4px solid #fff',
    n: 'top:0;left:50%;margin-left:-11px;width:22px;height:4px;background:#fff', s: 'bottom:0;left:50%;margin-left:-11px;width:22px;height:4px;background:#fff',
    w: 'left:0;top:50%;margin-top:-11px;width:4px;height:22px;background:#fff', e: 'right:0;top:50%;margin-top:-11px;width:4px;height:22px;background:#fff' };
  function buildCropUI(){
    var lay = E.ui.croplayer, box = mk('div');
    box.style.cssText = 'position:absolute;box-sizing:border-box;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.6);cursor:move;touch-action:none;pointer-events:auto';
    [1 / 3, 2 / 3].forEach(function (f){
      var v = mk('i'), h = mk('i');
      v.style.cssText = 'position:absolute;top:0;bottom:0;width:1px;background:rgba(255,255,255,.35);pointer-events:none;left:' + (f * 100) + '%';
      h.style.cssText = 'position:absolute;left:0;right:0;height:1px;background:rgba(255,255,255,.35);pointer-events:none;top:' + (f * 100) + '%';
      box.appendChild(v); box.appendChild(h);
    });
    box.addEventListener('pointerdown', function (ev){ cropDown(ev, 'move'); });
    E.ui.croph = {};
    Object.keys(CROP_HD).forEach(function (k){
      var hd = mk('div'), mark = mk('i');
      hd.style.cssText = 'position:absolute;width:30px;height:30px;touch-action:none;pointer-events:auto;cursor:' + k + '-resize;' + CROP_HD[k];
      mark.style.cssText = 'position:absolute;pointer-events:none;' + CROP_MK[k];
      hd.appendChild(mark); hd.addEventListener('pointerdown', function (ev){ cropDown(ev, k); });
      box.appendChild(hd); E.ui.croph[k] = hd;
    });
    E.ui.cropbox = box; lay.appendChild(box);
  }
  function drawCrop(){
    var lay = E.ui.croplayer, box = E.ui.cropbox; if (!lay || !box || lay.style.display === 'none') return;
    var pr = cropPicRect(), r = E.cropDraft || { x: 0, y: 0, w: 1, h: 1 }, a = cropAspect();
    box.style.left = (pr.x + r.x * pr.w) + 'px'; box.style.top = (pr.y + r.y * pr.h) + 'px'; box.style.width = (r.w * pr.w) + 'px'; box.style.height = (r.h * pr.h) + 'px';
    Object.keys(E.ui.croph).forEach(function (k){ E.ui.croph[k].style.display = (a && k.length === 1) ? 'none' : ''; });   // with a locked shape only the corners resize
  }
  function cropDown(ev, hdl){
    var c = targetVideo(); if (!c || !E.cropDraft) return;
    ev.preventDefault(); ev.stopPropagation();
    var d0 = { x: E.cropDraft.x, y: E.cropDraft.y, w: E.cropDraft.w, h: E.cropDraft.h }, pr = cropPicRect(), a = cropAspect(), x0 = ev.clientX, y0 = ev.clientY, MIN = 0.05, id = c.id;
    function mv(e){
      var dx = (e.clientX - x0) / (pr.w || 1), dy = (e.clientY - y0) / (pr.h || 1), r;
      if (hdl === 'move') r = { x: clamp(d0.x + dx, 0, 1 - d0.w), y: clamp(d0.y + dy, 0, 1 - d0.h), w: d0.w, h: d0.h };
      else {
        var L = d0.x, T = d0.y, R = d0.x + d0.w, B = d0.y + d0.h;
        if (hdl.indexOf('w') >= 0) L = clamp(d0.x + dx, 0, R - MIN);
        if (hdl.indexOf('e') >= 0) R = clamp(d0.x + d0.w + dx, L + MIN, 1);
        if (hdl.indexOf('n') >= 0) T = clamp(d0.y + dy, 0, B - MIN);
        if (hdl.indexOf('s') >= 0) B = clamp(d0.y + d0.h + dy, T + MIN, 1);
        if (a && hdl.length === 2){   // locked shape: the opposite corner stays put
          var w = R - L, h = w * pr.w / (a * pr.h), room = hdl.indexOf('n') >= 0 ? B : 1 - T;
          if (h > room){ h = room; w = h * a * pr.h / pr.w; }
          if (w < MIN){ w = MIN; h = w * pr.w / (a * pr.h); }
          if (hdl.indexOf('w') >= 0) L = R - w; else R = L + w;
          if (hdl.indexOf('n') >= 0) T = B - h; else B = T + h;
        }
        r = { x: L, y: T, w: R - L, h: B - T };
      }
      E.cropDraft = r; drawCrop();
    }
    function up(){
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      commit(P.setCrop(E.hist.cur, id, E.cropDraft));
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  // Shows the frame while the Crop panel is open. The preview then shows the whole picture; when the panel closes it shows the crop again.
  function syncCrop(){
    var lay = E.ui.croplayer; if (!lay) return;
    var c = (E.panel === 'crop' && E.isOpen) ? targetVideo() : null, on = !!c;
    if (on){ if (!E.ui.cropbox) buildCropUI(); lay.style.display = 'block'; drawCrop(); } else lay.style.display = 'none';
    if (on !== !!E.cropOn){ E.cropOn = on; if (E.isOpen) syncMedia(); }
  }
  // ----- scroll cues: arrows and soft edges`, 'editor: crop frame code');

// ---------- webcodecs-export.js: crops are made by the ffmpeg engine ----------
rep(wc, "if ((plan.audio || []).some(function (a) { return a.speed && a.speed !== 1; })) return false;",
  "if ((plan.video || []).some(function (s) { return s.crop; })) return false;   // crops are made by the ffmpeg engine\n    if ((plan.audio || []).some(function (a) { return a.speed && a.speed !== 1; })) return false;", 'fast engine: crops go to ffmpeg');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(ed); save(wc);
console.log('Done.\nNow run:  node tests/crop-editor.test.js   and then   npm test');