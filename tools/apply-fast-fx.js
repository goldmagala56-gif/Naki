// Run from the project root:  node tools/apply-fast-fx.js
// Lets the fast export engine draw video effects (shake, flash, glow, colour looks...) itself,
// so projects with effects no longer fall back to the slow ffmpeg engine.
const fs = require('fs'), path = require('path');
const file = path.join('www', 'webcodecs-export.js');
if (!fs.existsSync(file)) { console.error('Run this from the Naki project root (www\\webcodecs-export.js not found).'); process.exit(1); }
let raw = fs.readFileSync(file, 'utf8'); const crlf = raw.includes('\r\n'); let s = raw.replace(/\r\n/g, '\n');
if (s.includes('Naki:fast-fx')) { console.log('Already applied.'); process.exit(0); }
function rep(a, b) { const n = s.split(a).length - 1; if (n !== 1) { console.error('Anchor not found exactly once (' + n + '):\n' + a.slice(0, 120)); process.exit(1); } s = s.replace(a, () => b); }

rep("    if ((plan.fx || []).length) return false;   // video effects are made by the ffmpeg engine",
"    if ((plan.fx || []).length && !(NFX && NFX.vfx && NFX.vfx.preview && filterSupported())) return false;   // Naki:fast-fx effects are drawn here when the canvas can filter");

rep("    function compose(sp, tMs) {\n      ctx.globalAlpha = 1;\n      ctx.drawImage(layer, 0, 0);",
`    // video effects, drawn the same way the editor preview shows them (NFX.vfx.preview)
    var fxNoise = null;
    function fxOps(tr) { var ops = [], re = /(translate|scale|rotate)\\(([^)]*)\\)/g, m; while ((m = re.exec(tr || ''))) ops.push([m[1], m[2].split(',').map(function (v) { return parseFloat(v) || 0; })]); return ops; }
    function drawLayerFx(tMs) {
      var list = plan.fx || [], act = [];
      for (var i = 0; i < list.length; i++) { var f = list[i]; if (tMs >= f.startMs && tMs < f.startMs + f.durMs) act.push({ fx: f.fx, strength: f.strength, start: f.startMs, dur: f.durMs }); }
      if (!act.length || !NFX || !NFX.vfx) { ctx.drawImage(layer, 0, 0); return; }
      var r = NFX.vfx.preview(act, tMs);
      ctx.save();
      if (r.transform) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        ctx.translate(W / 2, H / 2);
        fxOps(r.transform).forEach(function (o) {
          var a = o[1];
          if (o[0] === 'translate') ctx.translate(a[0] / 100 * W, (a[1] || 0) / 100 * H);
          else if (o[0] === 'scale') ctx.scale(a[0], a.length > 1 ? a[1] : a[0]);
          else ctx.rotate(a[0] * Math.PI / 180);
        });
        ctx.translate(-W / 2, -H / 2);
      }
      if (r.filter) { try { ctx.filter = r.filter; } catch (e) {} }
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
      (r.tints || []).forEach(function (t) { ctx.save(); ctx.globalCompositeOperation = (!t.mode || t.mode === 'normal') ? 'source-over' : t.mode; ctx.fillStyle = t.bg; ctx.fillRect(0, 0, W, H); ctx.restore(); });
      if (r.bars) { var bh = Math.round(r.bars * H); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh); }
      if (r.flash) { ctx.save(); ctx.globalAlpha = Math.min(1, r.flash); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      if (r.grain) {
        if (!fxNoise) {
          fxNoise = [];
          for (var q = 0; q < 4; q++) { var nc = makeCanvas(128, 128), ng = nc.getContext('2d'), id = ng.createImageData(128, 128); for (var p = 0; p < id.data.length; p += 4) { var v = Math.random() * 255; id.data[p] = id.data[p + 1] = id.data[p + 2] = v; id.data[p + 3] = 255; } ng.putImageData(id, 0, 0); fxNoise.push(nc); }
        }
        var pat = ctx.createPattern(fxNoise[Math.floor(tMs / 33) % 4], 'repeat');
        if (pat) { ctx.save(); ctx.globalAlpha = Math.min(1, r.grain * 0.5); ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      }
    }
    function compose(sp, tMs) {
      ctx.globalAlpha = 1;
      drawLayerFx(tMs);`);

fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
fs.writeFileSync(path.join('tests', 'fast-fx.test.js'), `const assert = require('assert');
const W = require('../www/webcodecs-export.js');
const plan = { video: [{ filter: {} }], audio: [], fx: [{ startMs: 0, durMs: 1000, fx: 'shake', strength: 0.5 }] };
W._test.setFilterSupport(true);
assert.strictEqual(W.canRender(plan), true, 'effects no longer force the slow engine');
W._test.setFilterSupport(false);
assert.strictEqual(W.canRender(plan), false, 'without canvas filters the slow engine is kept');
console.log('fast-fx ok');
`);
console.log('Done. Now run: npm test');