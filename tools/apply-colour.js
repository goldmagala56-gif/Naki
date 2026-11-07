'use strict';
// node tools/apply-colour.js   (from the project folder; run the crop scripts first)
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
const pj = load('www/project.js'), pl = load('www/plan.js'), ee = load('www/export-engine.js'), wc = load('www/webcodecs-export.js'), ed = load('www/editor.js'), ix = load('www/index.html'), sw = load('www/sw.js');
if (pj.text.includes('function setGrade')) { console.log('Already applied. Nothing to do.'); process.exit(0); }
if (!pj.text.includes('function setCrop')) { console.log('Run apply-crop.js and apply-crop-editor.js first.'); process.exit(1); }
if (!fs.existsSync(path.join(root, 'www/colour.js'))) { console.log('Put colour.js in the www folder first.'); process.exit(1); }

// ---------- index.html and sw.js ----------
rep(ix, '<script src="project.js"></script>', '<script src="colour.js"></script>\n<script src="project.js"></script>', 'index: script');
rep(sw, "'./backup.js'", "'./colour.js', './backup.js'", 'sw: file list');

// ---------- project.js ----------
rep(pj, 'var _idn = 0;', "var _CL = (typeof module !== 'undefined' && module.exports) ? require('./colour.js') : (typeof window !== 'undefined' ? window.NakiColour : null);\nvar _idn = 0;", 'project: module');
rep(pj, '// ---------- reverse ----------', `// ---------- colour grade (curves, colour mixer, LUT) ----------
// clip.grade = { curves, hsl, lut, lutAmt } (see colour.js). patch = { curves: { m: points | null }, hsl: { red: [h, s, l] | null }, lut, lutAmt, replace }.
// id null = every picture clip. Nothing is stored for a neutral grade.
function setGrade(p, id, patch){
  var q = cloneProject(p), list = pictureClips(q, id); if (!list.length || !_CL) return p;
  list.forEach(function (c){
    if (c.type !== 'video' && c.type !== 'freeze') return;
    var g = _CL.merge(c.grade || null, patch || {});
    if (g) c.grade = g; else delete c.grade;
  });
  return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) ? p : finish(q);
}

// ---------- reverse ----------`, 'project: setGrade');
rep(pj, 'setStabilize: setStabilize,', 'setStabilize: setStabilize, setGrade: setGrade,', 'project: export');
rep(pj, "['filter', 'opacity', 'transform', 'crop']", "['filter', 'opacity', 'transform', 'crop', 'grade']", 'project: a held picture keeps the grade');
rep(pj, '  if (a.vFadeOut || b.vFadeIn) return false;', '  if (JSON.stringify(a.grade || null) !== JSON.stringify(b.grade || null)) return false;\n  if (a.vFadeOut || b.vFadeIn) return false;', 'project: join keeps grades apart');

// ---------- plan.js ----------
rep(pl, "      if (c.crop) sp.crop = { x: c.crop.x, y: c.crop.y, w: c.crop.w, h: c.crop.h };", "      if (c.crop) sp.crop = { x: c.crop.x, y: c.crop.y, w: c.crop.w, h: c.crop.h };\n      if (c.grade) sp.grade = JSON.parse(JSON.stringify(c.grade));", 'plan: grade');

// ---------- export-engine.js ----------
rep(ee, 'var GAIN_HZ = 1000;', "var GAIN_HZ = 1000;\nvar _CL = (typeof module !== 'undefined' && module.exports) ? require('./colour.js') : (typeof window !== 'undefined' ? window.NakiColour : null);", 'engine: module');
rep(ee, '  // The colour / speed / fade part of a picture chain. Empty for a plain clip.', `  // Colour grades: each different grade is baked into a .cube file (the runner writes them before the jobs run) and applied with lut3d.
  var gradeFiles = {}, gradeNames = {};
  function gradeFile(g) {
    var key = JSON.stringify(g);
    if (!gradeNames[key]) { var nm = 'grade' + Object.keys(gradeNames).length + '.cube'; gradeNames[key] = nm; gradeFiles[nm] = _CL.toCube(_CL.bakeLut(g, 33), 33, 'Naki'); }
    return gradeNames[key];
  }
  // The colour / speed / fade part of a picture chain. Empty for a plain clip.`, 'engine: grade files');
rep(ee, "    if (_L2 && f) _L2.ffmpegAdjust(f).forEach(function (x) { parts.push(x); });", "    if (_L2 && f) _L2.ffmpegAdjust(f).forEach(function (x) { parts.push(x); });\n    if (sp.grade && _CL) parts.push('format=rgb24,lut3d=file=' + gradeFile(sp.grade) + ':interp=trilinear,format=yuv420p');", 'engine: lut3d');
rep(ee, 'return { jobs: jobs, videoList: videoList, lanes: laneLists, width: width, height: height, textFiles: textFiles };', 'return { jobs: jobs, videoList: videoList, lanes: laneLists, width: width, height: height, textFiles: textFiles, gradeFiles: gradeFiles };', 'engine: return');
rep(ee, "    var genOv = (plan.overlays || []).filter(function (o) { return o.gen; });", `    var gnames = Object.keys(built.gradeFiles || {});
    if (gnames.length) { say('Preparing your colours...'); var genc = new TextEncoder(); gnames.forEach(function (nm) { ffmpeg.writeFile(nm, genc.encode(built.gradeFiles[nm])); extra.push(nm); }); }
    var genOv = (plan.overlays || []).filter(function (o) { return o.gen; });`, 'engine: runner writes the files');

// ---------- webcodecs-export.js ----------
rep(wc, '    if ((plan.video || []).some(function (s) { return s.stabilize; })) return false;', "    if ((plan.video || []).some(function (s) { return s.grade; })) return false;   // colour grades (curves, mixer, LUT) are made by the ffmpeg engine\n    if ((plan.video || []).some(function (s) { return s.stabilize; })) return false;", 'fast engine: grade goes to ffmpeg');

// ---------- editor.js ----------
rep(ed, 'window.NakiReframe : null);', "window.NakiReframe : null);\n  var NCL = (typeof module !== 'undefined' && module.exports) ? require('./colour.js') : (typeof window !== 'undefined' ? window.NakiColour : null);", 'editor: module');
rep(ed, "{ id: 'edAdjust', label: 'Adjust', icon: G.adjust, run: P2('adjust') },", "{ id: 'edAdjust', label: 'Adjust', icon: G.adjust, run: P2('adjust') },\n        { id: 'edGrade', label: 'Colour', icon: G.grade, run: P2('grade') },", 'editor: button');
rep(ed, 'syncStickers(); syncOverlays(); syncSfx(s); syncFx(); syncTransition(m, s, vc); syncLayout(m, vc, css);', 'syncStickers(); syncOverlays(); syncSfx(s); syncFx(); syncTransition(m, s, vc); syncLayout(m, vc, css); syncGrade(m, vc, css);', 'editor: preview hook');
rep(ed, "E.layoutOn = false; try { E.ui.layoutcv.style.display = 'none'; } catch (e) {}", "E.layoutOn = false; try { E.ui.layoutcv.style.display = 'none'; } catch (e) {}\n    E.gradeOn = false; try { if (E.ui.gradecv) E.ui.gradecv.style.display = 'none'; } catch (e) {}", 'editor: close');
rep(ed, '  // ----- save still: the picture at the playhead as a PNG, in one tap -----', `  // ----- colour tools: curves, colour mixer, LUT -----
  G.grade = svg('<path d="M3 20C8 20 8 4 21 4"/><circle cx="12" cy="12" r="2"/>');
  // While a clip has a grade, a canvas over the picture shows the frame with the grade applied (about 480 px wide). A cropped clip previews without it.
  function syncGrade(m, vc, css){
    var u = E.ui, g = vc && vc.grade;
    if (!NCL || !g || vc.crop || !movieReady() || E.swapping || !m.videoWidth || m.readyState < 2){ if (u.gradecv && E.gradeOn){ u.gradecv.style.display = 'none'; E.gradeOn = false; } return; }
    var pf = u.picframe, PW = pf.clientWidth, PH = pf.clientHeight; if (!PW || !PH) return;
    var now = performance.now(); if (E.playing && E.gradeAt && now - E.gradeAt < 55) return;
    E.gradeAt = now;
    if (!u.gradecv){ u.gradecv = mk('canvas'); u.gradecv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none'; pf.insertBefore(u.gradecv, u.layoutcv); }
    var sc = Math.min(1, 480 / PW), W = Math.max(2, Math.round(PW * sc)), H = Math.max(2, Math.round(PH * sc)), cv = u.gradecv;
    if (cv.width !== W || cv.height !== H){ cv.width = W; cv.height = H; }
    var key = JSON.stringify(g); if (E.gradeKey !== key){ E.gradeKey = key; E.gradeLut = NCL.bakeLut(g, 33); }
    var gx = cv.getContext('2d', { willReadFrequently: true });
    previewFrame(gx, m, vc, W, H);
    var img = gx.getImageData(0, 0, W, H); NCL.applyToImageData(img.data, E.gradeLut, 33); gx.putImageData(img, 0, 0);
    cv.style.filter = css || ''; cv.style.opacity = String(vc.opacity != null ? vc.opacity : 1); cv.style.display = 'block'; E.gradeOn = true;
  }
  function importCubeFile(id){
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.cube,text/plain';
    inp.onchange = function (){
      var f = inp.files && inp.files[0]; if (!f) return;
      if (f.size > 40e6){ toast('That file is too big for a LUT.'); return; }
      (f.text ? f.text() : new Promise(function (res){ var r = new FileReader(); r.onload = function (){ res(r.result); }; r.readAsText(f); })).then(function (text){
        var r = NCL.parseCube(text); if (r.error){ toast(r.error, 8000); return; }
        var enc = NCL.encodeLut(r, 25), nm = r.title || f.name.split('.').slice(0, -1).join('.') || f.name;
        var q = P.setGrade(E.hist.cur, id, { lut: { name: nm, size: enc.size, b64: enc.b64 }, lutAmt: 1 });
        if (q === E.hist.cur){ toast('That LUT did not change anything.'); return; }
        commit(q); toast('LUT "' + nm + '" added. Use Intensity to make it weaker.', 6000);
      });
    };
    inp.click();
  }
  PANELS.grade = { title: 'Colour', build: function (body){
    if (!NCL){ body.appendChild(mk('div', 'ed-hint', 'colour.js is not loaded. Add <script src="colour.js"></script> to index.html, before project.js.')); return; }
    var c = needPicture(body); if (!c) return;
    if (c.type !== 'video' && c.type !== 'freeze'){ body.appendChild(mk('div', 'ed-hint', 'Pick a picture clip.')); return; }
    var g = c.grade || {}, tabs = [{ key: 'curves', label: 'Curves' }, { key: 'mixer', label: 'Colour mixer' }, { key: 'lut', label: 'LUT' }, { key: 'looks', label: 'Looks' }], tab = chipKey('grade', tabs, 'curves');
    var set = function (patch){ var q = P.setGrade(E.hist.cur, c.id, patch); if (q === E.hist.cur) renderDock(); else commit(q); };
    var setLive = function (patch){ live(P.setGrade(E.hist.cur, c.id, patch)); };
    body.appendChild(chips(tabs, tab, pickChip('grade')));
    if (tab === 'curves'){
      var chs = [{ key: 'm', label: 'Master' }, { key: 'r', label: 'Red' }, { key: 'g', label: 'Green' }, { key: 'b', label: 'Blue' }], ch = chipKey('gradech', chs, 'm');
      var COL = { m: '#ffffff', r: '#ff5a5a', g: '#5adf7a', b: '#5aa0ff' };
      body.appendChild(chips(chs, ch, function (k){ E.chip.gradech = k; E.chip.grsel = -1; renderDock(); }));
      var pts = (g.curves && g.curves[ch] ? g.curves[ch] : [[0, 0], [1, 1]]).map(function (p){ return p.slice(); }), drag = -1;
      if (E.chip.grsel == null || E.chip.grsel >= pts.length) E.chip.grsel = -1;
      var NS = 'http://www.w3.org/2000/svg', sv = document.createElementNS(NS, 'svg');
      sv.setAttribute('viewBox', '0 0 200 200'); sv.setAttribute('role', 'img'); sv.setAttribute('aria-label', 'Colour curve');
      sv.style.cssText = 'display:block;width:100%;max-width:220px;margin:6px auto;touch-action:none;background:rgba(255,255,255,.05);border-radius:8px';
      var X = function (u){ return 10 + u * 180; }, Y = function (v){ return 190 - v * 180; };
      var node = function (tag, attrs){ var e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k){ e.setAttribute(k, attrs[k]); }); return e; };
      var draw = function (){
        while (sv.firstChild) sv.removeChild(sv.firstChild);
        [0.25, 0.5, 0.75].forEach(function (v){
          sv.appendChild(node('line', { x1: X(v), x2: X(v), y1: Y(0), y2: Y(1), stroke: 'rgba(255,255,255,.15)', 'stroke-width': 1 }));
          sv.appendChild(node('line', { x1: X(0), x2: X(1), y1: Y(v), y2: Y(v), stroke: 'rgba(255,255,255,.15)', 'stroke-width': 1 }));
        });
        sv.appendChild(node('line', { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), stroke: 'rgba(255,255,255,.3)', 'stroke-dasharray': '4 4' }));
        var fn = NCL.curveFn(pts), d = ''; for (var i = 0; i <= 48; i++){ var u = i / 48; d += (i ? 'L' : 'M') + X(u).toFixed(1) + ' ' + Y(fn(u)).toFixed(1); }
        sv.appendChild(node('path', { d: d, fill: 'none', stroke: COL[ch], 'stroke-width': 2.5 }));
        pts.forEach(function (p, i){ sv.appendChild(node('circle', { cx: X(p[0]), cy: Y(p[1]), r: i === E.chip.grsel ? 8 : 6, fill: i === E.chip.grsel ? COL[ch] : '#111b24', stroke: COL[ch], 'stroke-width': 2 })); });
      };
      var where = function (ev){ var r = sv.getBoundingClientRect(), s = 200 / (r.width || 200); return { x: ((ev.clientX - r.left) * s - 10) / 180, y: (190 - (ev.clientY - r.top) * s) / 180 }; };
      var patchOf = function (){ var cp = {}; cp[ch] = pts.map(function (p){ return p.slice(); }); return { curves: cp }; };
      sv.addEventListener('pointerdown', function (ev){
        var p = where(ev), best = -1, bd = 0.09;
        pts.forEach(function (pt, i){ var dd = Math.hypot(pt[0] - p.x, pt[1] - p.y); if (dd < bd){ bd = dd; best = i; } });
        if (best < 0){
          var x = clamp(p.x, 0.03, 0.97);
          if (pts.length >= 12 || pts.some(function (q){ return Math.abs(q[0] - x) < 0.03; })) return;
          pts.push([x, clamp(p.y, 0, 1)]); pts.sort(function (a, b){ return a[0] - b[0]; });
          best = pts.map(function (q){ return q[0]; }).indexOf(x);
        }
        drag = best; E.chip.grsel = best; try { sv.setPointerCapture(ev.pointerId); } catch (e) {} ev.preventDefault(); draw();
      });
      sv.addEventListener('pointermove', function (ev){
        if (drag < 0) return;
        var p = where(ev), last = pts.length - 1, x = pts[drag][0];
        if (drag > 0 && drag < last) x = clamp(p.x, pts[drag - 1][0] + 0.03, pts[drag + 1][0] - 0.03);
        pts[drag] = [x, clamp(p.y, 0, 1)]; draw(); setLive(patchOf());
      });
      var letGo = function (){ if (drag < 0) return; drag = -1; set(patchOf()); };
      sv.addEventListener('pointerup', letGo); sv.addEventListener('pointercancel', letGo);
      draw(); body.appendChild(sv);
      body.appendChild(actions([
        { id: 'edCurveDelPt', label: 'Delete point', run: function (){
          var s = E.chip.grsel; if (s <= 0 || s >= pts.length - 1){ toast('Tap a point first (not the first or the last one).'); return; }
          pts.splice(s, 1); E.chip.grsel = -1; set(patchOf()); } },
        { id: 'edCurveResetCh', label: 'Reset this curve', run: function (){ var cp = {}; cp[ch] = null; E.chip.grsel = -1; set({ curves: cp }); } }]));
      body.appendChild(mk('div', 'ed-hint', 'Tap the graph to add a point and drag it: up brightens that tone, down darkens it. Master moves all colours; Red, Green and Blue move one colour. Drag the first or last point up or down to lift the blacks or dim the whites.'));
    } else if (tab === 'mixer'){
      var bs = NCL.BANDS.map(function (b){ return { key: b.key, label: b.label }; }), band = chipKey('gradeband', bs, 'red'), v = (g.hsl && g.hsl[band]) || [0, 0, 0];
      body.appendChild(chips(bs, band, pickChip('gradeband')));
      var patchHsl = function (i, val){ var a = v.slice(); a[i] = val / 100; var h = {}; h[band] = a; return { hsl: h }; };
      ['Hue', 'Saturation', 'Luminance'].forEach(function (lab, i){
        body.appendChild(sliderRow(lab, -100, 100, 1, Math.round(v[i] * 100), function (n){ return String(n); }, function (n){ setLive(patchHsl(i, n)); }, function (n){ set(patchHsl(i, n)); }));
      });
      body.appendChild(mk('div', 'ed-hint', 'Pick a colour, then change only that colour: for example turn the sky bluer or make skin tones warmer. Grey and very pale colours are left alone.'));
    } else if (tab === 'lut'){
      body.appendChild(mk('div', 'ed-hint', g.lut ? 'LUT: ' + g.lut.name : 'No LUT yet. A LUT is a .cube file with a ready-made colour look.'));
      var la = [{ id: 'edLutImport', label: 'Import .cube', run: function (){ importCubeFile(c.id); } }];
      if (g.lut) la.push({ id: 'edLutRemove', label: 'Remove LUT', run: function (){ set({ lut: null }); } });
      body.appendChild(actions(la));
      if (g.lut) body.appendChild(sliderRow('Intensity', 0, 100, 5, Math.round((g.lutAmt == null ? 1 : g.lutAmt) * 100), pct, function (n){ setLive({ lutAmt: n / 100 }); }, function (n){ set({ lutAmt: n / 100 }); }));
      body.appendChild(mk('div', 'ed-hint', 'Only 3D .cube files work (the usual kind from colour packs). The LUT is shrunk to a 25 point grid to keep your project small, which is fine for looks. It is applied after the curves and the colour mixer.'));
    } else {
      body.appendChild(chips(NCL.PRESETS, null, function (k){ var p = NCL.PRESETS.filter(function (x){ return x.key === k; })[0]; if (p) set({ replace: p.grade }); }));
      body.appendChild(mk('div', 'ed-hint', 'A look sets the curves and the colour mixer together, replacing what was there (and any LUT). Open Curves or Colour mixer afterwards to fine-tune it.'));
    }
    body.appendChild(actions([
      { id: 'edGradeAll', label: 'Apply to all', run: function (){ commit(P.setGrade(E.hist.cur, null, { replace: c.grade || null })); toast('This colour is on every clip now.'); } },
      { id: 'edGradeReset', label: 'Reset colour', run: function (){ E.chip.grsel = -1; set({ replace: null }); } }]));
    body.appendChild(mk('div', 'ed-hint', 'The preview is a close match. The exported video uses the compatible engine, which takes longer. A cropped clip previews without colour; the export has both.'));
  } };

  // ----- save still: the picture at the playhead as a PNG, in one tap -----`, 'editor: panel');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[pj, pl, ee, wc, ed, ix, sw].forEach(save);
console.log('Done.\nNow run:  node tests/colour.test.js   and then   npm test');