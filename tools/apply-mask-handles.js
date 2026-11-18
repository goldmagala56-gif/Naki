// Run from the project root:  node tools/apply-mask-handles.js
// Masks on overlays can now be moved, resized and turned right on the picture (a dashed outline with a turn knob and a corner grip),
// like CapCut. They show while the Mask panel is open. Nothing about how masks are stored or exported changes.
const fs = require('fs'), path = require('path');
const file = path.join('www', 'editor.js');
if (!fs.existsSync(file)) { console.error('Run this from the Naki project root.'); process.exit(1); }
let raw = fs.readFileSync(file, 'utf8'); const crlf = raw.includes('\r\n'); let s = raw.replace(/\r\n/g, '\n');
if (s.includes('Naki:mask-handles')) { console.log('Already applied.'); process.exit(0); }
const A = '  function pauseOverlays(){';
if (s.split(A).length !== 2) { console.error('Anchor not found exactly once; nothing changed.'); process.exit(1); }
if (!/function renderDock\s*\(/.test(s) || !/function syncOverlays\s*\(/.test(s)) { console.error('renderDock/syncOverlays not found; nothing changed.'); process.exit(1); }
const block = `  // ---- Naki:mask-handles: move, size and turn an overlay's mask on the picture ----
  function maskPanelOpen(){ return E.panel === 'maskonly' || (E.panel === 'overlayfx' && E.chip && E.chip.overlayfx === 'mask'); }
  function ensureMaskCss(){
    if (document.getElementById('ed-maskh-css')) return;
    var st = document.createElement('style'); st.id = 'ed-maskh-css';
    st.textContent = '.ed-maskh{position:absolute;pointer-events:none;display:none;z-index:8}' +
      '.ed-maskf{position:absolute;border:2px dashed #fff;box-shadow:0 0 0 1px rgba(0,0,0,.65);pointer-events:auto;touch-action:none;cursor:move;box-sizing:border-box}' +
      '.ed-maskk{position:absolute;left:50%;top:-34px;width:24px;height:24px;margin-left:-12px;border-radius:50%;background:#ff9f1c;border:2px solid #fff;pointer-events:auto;touch-action:none;cursor:grab;box-sizing:border-box}' +
      '.ed-maskk::after{content:"";position:absolute;left:50%;top:22px;width:2px;height:12px;margin-left:-1px;background:#fff}' +
      '.ed-masks{position:absolute;right:-14px;bottom:-14px;width:28px;height:28px;border-radius:8px;background:#ff9f1c;border:2px solid #fff;pointer-events:auto;touch-action:none;cursor:nwse-resize;box-sizing:border-box}';
    (document.head || document.documentElement).appendChild(st);
  }
  function maskGeom(c){
    var layer = E.ui.overlaylayer, d = E.overlayEls && E.overlayEls[c.id]; if (!layer || !d) return null;
    var r = layer.getBoundingClientRect(), nw = d.videoWidth || d.naturalWidth || d.width, nh = d.videoHeight || d.naturalHeight || d.height;
    if (!r.width || !nw || !nh) return null;
    var s = NANIM.overlayState(c, E.t - c.start), OW = s.size * r.width;
    return { r: r, s: s, OW: OW, OH: OW * nh / nw, cx: r.left + s.x * r.width, cy: r.top + s.y * r.height };
  }
  function maskDrag(ev, mode){
    var f = E.sel && P.findClip(E.proj, E.sel); if (!f || f.track.kind !== 'overlay') return;
    var c = f.clip, g = maskGeom(c), m0 = NFX && NFX.cleanMask(c.mask); if (!g || !m0) return;
    ev.preventDefault(); ev.stopPropagation();
    var a = g.s.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), id = c.id, moved = false;
    function local(e){ var dx = e.clientX - g.cx, dy = e.clientY - g.cy; return { x: dx * ca + dy * sa, y: -dx * sa + dy * ca }; }
    var p0 = local(ev), mx = (m0.x - 0.5) * g.OW, my = (m0.y - 0.5) * g.OH;
    function at(e){
      var p = local(e), o = {};
      if (mode === 'move'){ o.x = Math.max(0, Math.min(1, m0.x + (p.x - p0.x) / g.OW)); o.y = Math.max(0, Math.min(1, m0.y + (p.y - p0.y) / g.OH)); }
      else if (mode === 'turn'){ o.rot = Math.atan2(p.y - my, p.x - mx) * 180 / Math.PI + 90; }
      else {
        var qx = p.x - mx, qy = p.y - my, b = m0.rot * Math.PI / 180, lx = qx * Math.cos(b) + qy * Math.sin(b), ly = -qx * Math.sin(b) + qy * Math.cos(b);
        if (m0.shape !== 'mirror') o.w = Math.max(0.05, 2 * Math.abs(lx) / g.OW);
        if (m0.shape !== 'line') o.h = Math.max(0.05, 2 * Math.abs(ly) / g.OH);
      }
      return P.setOverlayFx(E.hist.cur, id, { mask: o });
    }
    function mv(e){ moved = true; live(at(e)); }
    function up(e){
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (moved) commit(at(e));
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  function syncMaskHandles(){
    var u = E.ui, layer = u && u.overlaylayer; if (!layer || !NFX || !NANIM) return;
    var f = E.sel && E.proj && P.findClip(E.proj, E.sel), c = (f && f.track.kind === 'overlay' && maskPanelOpen()) ? f.clip : null;
    var m = c && c.mask ? NFX.cleanMask(c.mask) : null, g = m ? maskGeom(c) : null;
    if (!g){ if (u.maskh) u.maskh.style.display = 'none'; return; }
    ensureMaskCss();
    if (!u.maskh){
      var box = u.maskh = mk('div', 'ed-maskh'), fr = u.maskf = mk('div', 'ed-maskf');
      u.maskk = mk('div', 'ed-maskk'); u.masks = mk('div', 'ed-masks');
      fr.appendChild(u.maskk); fr.appendChild(u.masks); box.appendChild(fr); layer.appendChild(box);
      fr.addEventListener('pointerdown', function (e){ if (e.target === fr) maskDrag(e, 'move'); });
      u.maskk.addEventListener('pointerdown', function (e){ maskDrag(e, 'turn'); });
      u.masks.addEventListener('pointerdown', function (e){ maskDrag(e, 'size'); });
    }
    var box2 = u.maskh, fr2 = u.maskf, line = m.shape === 'line', band = m.shape === 'mirror';
    var mw = (line || band) ? g.OW : m.w * g.OW, mh = line ? 2 : (band ? m.h * g.OH : m.h * g.OH);
    box2.style.display = 'block'; box2.style.left = (g.s.x * g.r.width) + 'px'; box2.style.top = (g.s.y * g.r.height) + 'px';
    box2.style.width = g.OW + 'px'; box2.style.height = g.OH + 'px'; box2.style.transform = 'translate(-50%,-50%) rotate(' + g.s.rot + 'deg)';
    fr2.style.width = mw + 'px'; fr2.style.height = mh + 'px'; fr2.style.left = (m.x * g.OW - mw / 2) + 'px'; fr2.style.top = (m.y * g.OH - mh / 2) + 'px';
    fr2.style.transform = 'rotate(' + m.rot + 'deg)'; u.masks.style.display = line ? 'none' : '';
  }
  var _syncOv0 = syncOverlays; syncOverlays = function (){ var r = _syncOv0.apply(this, arguments); try { syncMaskHandles(); } catch (e) {} return r; };
  var _renderDock0 = renderDock; renderDock = function (){ var r = _renderDock0.apply(this, arguments); try { syncMaskHandles(); } catch (e) {} return r; };
`;
s = s.replace(A, () => block + A);
fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
fs.writeFileSync(path.join('tests', 'mask-handles.test.js'), `'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ed = fs.readFileSync(path.join(__dirname, '..', 'www', 'editor.js'), 'utf8').replace(/\\r\\n/g, '\\n');
new vm.Script(ed, { filename: 'editor.js' });
['function syncMaskHandles()', 'function maskDrag(ev, mode)', "maskDrag(e, 'turn')", "maskDrag(e, 'size')", "maskDrag(e, 'move')", 'var _syncOv0 = syncOverlays;', 'var _renderDock0 = renderDock;']
  .forEach(x => assert(ed.includes(x), 'missing ' + x));
console.log('mask-handles ok');
`);
console.log('Done. Now run: npm test');