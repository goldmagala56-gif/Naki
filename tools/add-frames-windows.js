'use strict';
// Frames, batch 1: "Windows" (20 frames where the picture shows through a shape).
// Adds a new "Windows" tab to the Frames picker. Only www/fx.js is changed, and nothing else in the app.
// Run from the project folder:   node tools/add-frames-windows.js
// Safe: it checks the spot is found exactly once, checks the edited file still parses, and draws every new frame on a stand-in
// canvas to make sure none of them throws. If anything fails, NOTHING is written.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const file = path.join(root, 'www', 'fx.js');
const raw = fs.readFileSync(file, 'utf8'), crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');

if (text.includes("'w_circle'")){ console.log('Already applied. Nothing to do.'); process.exit(0); }

const ANCHOR = `add('phone', 'Phone screen', 'Social', '#0e0e10', 0.06, function (g, w, h, m, col) {`;
const NEW = `// ----- Windows: the picture shows through a shape (batch 1) -----
      (function () {
        var PI2 = Math.PI * 2;
        function fitBox(x, y, w, h, ar) { var w2 = Math.min(w, h * ar), h2 = w2 / ar; return { x: x + (w - w2) / 2, y: y + (h - h2) / 2, w: w2, h: h2 }; }
        function ptsP(g, p) { g.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); }
        function circ(g, x, y, r) { g.moveTo(x + r, y); g.arc(x, y, r, 0, PI2); g.closePath(); }
        function starP(g, cx, cy, Ro, Ri, n) { var i, a, r; for (i = 0; i < n * 2; i++) { a = -Math.PI / 2 + i * Math.PI / n; r = i % 2 ? Ri : Ro; if (i) g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); }
        var S = {
          circle: function (g, x, y, w, h) { circ(g, x + w / 2, y + h / 2, Math.min(w, h) / 2); },
          oval: function (g, x, y, w, h) { g.moveTo(x + w, y + h / 2); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, PI2); g.closePath(); },
          arch: function (g, x, y, w, h) { var r = Math.min(w / 2, h * 0.9); g.moveTo(x, y + h); g.lineTo(x, y + r); g.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, Math.PI * 1.5, PI2); g.lineTo(x + w, y + h); g.closePath(); },
          heart: function (g, x, y, w, h) { var cx = x + w / 2; g.moveTo(cx, y + h * 0.3); g.bezierCurveTo(cx, y, x, y, x, y + h * 0.32); g.bezierCurveTo(x, y + h * 0.62, cx - w * 0.05, y + h * 0.8, cx, y + h); g.bezierCurveTo(cx + w * 0.05, y + h * 0.8, x + w, y + h * 0.62, x + w, y + h * 0.32); g.bezierCurveTo(x + w, y, cx, y, cx, y + h * 0.3); g.closePath(); },
          star: function (g, x, y, w, h) { var R = Math.min(w / 1.902, h / 1.809); starP(g, x + w / 2, y + (h - 1.809 * R) / 2 + R, R, R * 0.42, 5); },
          hexagon: function (g, x, y, w, h) { ptsP(g, [[x + w * 0.25, y], [x + w * 0.75, y], [x + w, y + h / 2], [x + w * 0.75, y + h], [x + w * 0.25, y + h], [x, y + h / 2]]); },
          diamond: function (g, x, y, w, h) { ptsP(g, [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]]); },
          octagon: function (g, x, y, w, h) { var c = Math.min(w, h) * 0.29; ptsP(g, [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]]); },
          squircle: function (g, x, y, w, h) { rrect(g, x, y, w, h, Math.min(w, h) * 0.3); },
          cloud: function (g, x, y, w, h) { circ(g, x + w * 0.27, y + h * 0.62, h * 0.22); circ(g, x + w * 0.5, y + h * 0.45, h * 0.3); circ(g, x + w * 0.76, y + h * 0.6, h * 0.24); rrect(g, x + w * 0.12, y + h * 0.58, w * 0.76, h * 0.34, h * 0.17); },
          drop: function (g, x, y, w, h) { var cx = x + w / 2; g.moveTo(cx, y); g.bezierCurveTo(cx + w * 0.15, y + h * 0.25, x + w, y + h * 0.4, x + w, y + h * 0.68); g.bezierCurveTo(x + w, y + h * 0.87, cx + w * 0.27, y + h, cx, y + h); g.bezierCurveTo(cx - w * 0.27, y + h, x, y + h * 0.87, x, y + h * 0.68); g.bezierCurveTo(x, y + h * 0.4, cx - w * 0.15, y + h * 0.25, cx, y); g.closePath(); },
          keyhole: function (g, x, y, w, h) { var cx = x + w / 2, r = w * 0.5, cy = y + r; circ(g, cx, cy, r); ptsP(g, [[cx - w * 0.17, cy + r * 0.6], [cx + w * 0.17, cy + r * 0.6], [cx + w * 0.3, y + h], [cx - w * 0.3, y + h]]); },
          shield: function (g, x, y, w, h) { var cx = x + w / 2; g.moveTo(cx, y); g.lineTo(x + w, y + h * 0.12); g.lineTo(x + w, y + h * 0.5); g.bezierCurveTo(x + w, y + h * 0.8, cx + w * 0.2, y + h * 0.95, cx, y + h); g.bezierCurveTo(cx - w * 0.2, y + h * 0.95, x, y + h * 0.8, x, y + h * 0.5); g.lineTo(x, y + h * 0.12); g.closePath(); },
          bubble: function (g, x, y, w, h) { rrect(g, x, y, w, h * 0.82, Math.min(w, h) * 0.18); ptsP(g, [[x + w * 0.2, y + h * 0.78], [x + w * 0.38, y + h * 0.78], [x + w * 0.2, y + h]]); },
          label: function (g, x, y, w, h) { ptsP(g, [[x, y], [x + w * 0.82, y], [x + w, y + h / 2], [x + w * 0.82, y + h], [x, y + h]]); },
          moon: function (g, x, y, w, h) { circ(g, x + w / 2, y + h / 2, Math.min(w, h) / 2); },
          leaf: function (g, x, y, w, h) { g.moveTo(x, y + h); g.bezierCurveTo(x + w * 0.05, y + h * 0.3, x + w * 0.5, y, x + w, y); g.bezierCurveTo(x + w * 0.95, y + h * 0.7, x + w * 0.5, y + h, x, y + h); g.closePath(); },
          flower: function (g, x, y, w, h) { var cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2, k; for (k = 0; k < 6; k++) circ(g, cx + Math.cos(k * Math.PI / 3 - Math.PI / 2) * R * 0.62, cy + Math.sin(k * Math.PI / 3 - Math.PI / 2) * R * 0.62, R * 0.36); circ(g, cx, cy, R * 0.3); },
          sun: function (g, x, y, w, h) { var R = Math.min(w, h) / 2; starP(g, x + w / 2, y + h / 2, R, R * 0.72, 12); },
          ticket: function (g, x, y, w, h) { rrect(g, x, y, w, h, Math.min(w, h) * 0.08); }
        };
        // some shapes put a little colour back on top (the bite of a crescent, the notches of a ticket)
        var BACK = {
          moon: function (g, x, y, w, h) { var R = Math.min(w, h) / 2; circ(g, x + w / 2 + R * 0.45, y + h / 2 - R * 0.08, R * 0.82); },
          ticket: function (g, x, y, w, h) { var r = Math.min(w, h) * 0.11; circ(g, x, y + h / 2, r); circ(g, x + w, y + h / 2, r); }
        };
        function win(key, label, col, wd, ar, shape, trim) {
          add('w_' + key, label, 'Windows', col, wd, function (g, w, h, m, c) {
            var bw = Math.max(4, w - 2 * m), bh = Math.max(4, h - 2 * m), b = ar ? fitBox(m, m, bw, bh, ar) : { x: m, y: m, w: bw, h: bh };
            g.fillStyle = c; g.fillRect(0, 0, w, h);
            g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath(); S[shape](g, b.x, b.y, b.w, b.h); g.fill(); g.restore();
            if (BACK[shape]) { g.fillStyle = c; g.beginPath(); BACK[shape](g, b.x, b.y, b.w, b.h); g.fill(); }
            if (trim) { lw(g, Math.max(1, m * 0.07), mix(c, ink(c) === '#ffffff' ? '#ffffff' : '#000000', 0.5)); g.beginPath(); S[shape](g, b.x, b.y, b.w, b.h); g.stroke(); }
          });
        }
        win('circle', 'Porthole', '#1c1c1e', 0.11, 1, 'circle', true);
        win('oval', 'Cameo', '#2b1d16', 0.1, 0.8, 'oval', true);
        win('arch', 'Arch window', '#f3ece0', 0.09, 0.8, 'arch', true);
        win('heart', 'Heart', '#ff4d79', 0.1, 1.1, 'heart', true);
        win('star', 'Star', '#ffd60a', 0.1, 1.05, 'star', true);
        win('hex', 'Hexagon', '#14532d', 0.1, 1.15, 'hexagon', true);
        win('diamond', 'Diamond', '#111111', 0.1, 0.9, 'diamond', true);
        win('octagon', 'Octagon', '#7f1d1d', 0.1, 1, 'octagon', true);
        win('squircle', 'Squircle', '#0f172a', 0.1, 0, 'squircle', true);
        win('cloud', 'Cloud', '#7fd8ff', 0.08, 1.5, 'cloud', false);
        win('drop', 'Teardrop', '#0ea5e9', 0.1, 0.8, 'drop', true);
        win('keyhole', 'Keyhole', '#111111', 0.09, 0.62, 'keyhole', false);
        win('shield', 'Shield', '#1e3a8a', 0.1, 0.85, 'shield', true);
        win('bubble', 'Speech bubble', '#ffffff', 0.09, 0, 'bubble', false);
        win('label', 'Label', '#f59e0b', 0.1, 0, 'label', true);
        win('moon', 'Crescent moon', '#1e1b4b', 0.1, 1, 'moon', false);
        win('leaf', 'Leaf', '#166534', 0.1, 1, 'leaf', true);
        win('flower', 'Flower', '#ff8fb8', 0.1, 1, 'flower', false);
        win('sun', 'Sunburst', '#ff9f1c', 0.1, 1, 'sun', true);
        win('ticket', 'Ticket stub', '#f2d27a', 0.08, 0, 'ticket', false);
      })();

      `;

const n = text.split(ANCHOR).length - 1;
if (n !== 1){
  console.log('NOTHING WAS CHANGED. The spot before the "Phone screen" frame was found ' + n + ' times (need exactly 1) in fx.js.\nSend me the part of fx.js where the frames are added and I will adjust.');
  process.exit(1);
}
const out = text.replace(ANCHOR, () => NEW + ANCHOR);

// check 1: the edited file still parses, and check 2: every new frame draws without an error (on a stand-in canvas)
let api;
try {
  const m = { exports: {} };
  new Function('module', out)(m);
  api = m.exports;
} catch (e) { console.log('NOTHING WAS CHANGED. The edited fx.js would not load: ' + e.message); process.exit(1); }
try {
  const calls = [], ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : function () { calls.push(String(k)); }), set: (t, k, v) => { t[k] = v; return true; } });
  const wins = api.gen.FRAMES.filter(f => f.cat === 'Windows');
  if (wins.length !== 20) throw new Error('expected 20 Windows frames, found ' + wins.length);
  wins.forEach(f => { const d = api.gen.frameDefaults(f.key); [[640, 360], [360, 640]].forEach(sz => api.gen.draw(ctx, { kind: 'frame', frame: f.key, color: d.color, width: d.width }, sz[0], sz[1])); });
  const keys = api.gen.FRAMES.map(f => f.key); if (new Set(keys).size !== keys.length) throw new Error('two frames share a name');
} catch (e) { console.log('NOTHING WAS CHANGED. A new frame failed its test draw: ' + e.message); process.exit(1); }

fs.writeFileSync(file, crlf ? out.replace(/\n/g, '\r\n') : out);
console.log('Done. Added 20 frames in a new "Windows" tab (www/fx.js).\nClose Naki completely and open it again (on a phone, remove the installed app and reinstall, or clear the site data).');