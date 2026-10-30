// ---------- more frames: the creative set ----------
    // Each one is drawn by code onto a see-through picture the size of the video, so it looks the same in the preview and in both exports. The middle stays
    // clear. m is the thickness in pixels, col the colour the person picked (a few use more colours made from it).
    (function () {
      var PI = Math.PI;
      function rgb(h) { var n = parseInt(String(h).replace('#', ''), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
      function toHex(a) { return '#' + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
      function mix(a, b, t) { var x = rgb(a), y = rgb(b); return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); }
      function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
      function ink(h) { var c = rgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 150 ? '#111111' : '#ffffff'; }   // black or white, whichever shows on h
      function hueShift(h, deg) {
        var c = rgb(h), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = 0, hh = 0, d = mx - mn;
        if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6; }
        if (!s) return toHex([l * 255, l * 255, l * 255]);
        hh = (hh + deg / 360) % 1; if (hh < 0) hh += 1;
        function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        return toHex([f(p, q, hh + 1 / 3) * 255, f(p, q, hh) * 255, f(p, q, hh - 1 / 3) * 255]);
      }
      function rnd(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }   // 0 to 1, always the same
      function rrect(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
      function band(g, w, h, m, col, r) { g.fillStyle = col; g.beginPath(); g.rect(0, 0, w, h); if (r) rrect(g, m, m, w - 2 * m, h - 2 * m, r); else g.rect(m, m, w - 2 * m, h - 2 * m); g.fill('evenodd'); }
      function clipBand(g, w, h, m) { g.beginPath(); g.rect(0, 0, w, h); g.rect(m, m, w - 2 * m, h - 2 * m); g.clip('evenodd'); }
      function put(g, x, y, a, fn) { g.save(); g.translate(x, y); g.rotate(a); fn(); g.restore(); }
      // Items along the four sides, `off` pixels in from the edge, about `pitch` apart. fn(x, y, angle, i) is called for each; draw it with put() so that +y points into the picture.
      function along(w, h, off, pitch, fn) {
        var iw = w - 2 * off, ih = h - 2 * off, nx = Math.max(1, Math.round(iw / pitch)), ny = Math.max(1, Math.round(ih / pitch)), k, i = 0;
        for (k = 0; k < nx; k++) fn(off + (k + 0.5) * iw / nx, off, 0, i++);
        for (k = 0; k < ny; k++) fn(w - off, off + (k + 0.5) * ih / ny, PI / 2, i++);
        for (k = 0; k < nx; k++) fn(w - off - (k + 0.5) * iw / nx, h - off, PI, i++);
        for (k = 0; k < ny; k++) fn(off, h - off - (k + 0.5) * ih / ny, -PI / 2, i++);
      }
      function corners(g, w, h, fn) { [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]].forEach(function (q) { g.save(); g.translate(q[0], q[1]); g.scale(q[2], q[3]); fn(); g.restore(); }); }
      function lw(g, v, col) { g.lineWidth = Math.max(1, v); g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; }
      function poly(g, pts) { g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); }
      function heartPath(g, s) { g.beginPath(); g.moveTo(0, s * 0.35); g.bezierCurveTo(0, -s * 0.1, -s, -s * 0.1, -s, s * 0.35); g.bezierCurveTo(-s, s * 0.8, -s * 0.15, s * 1.0, 0, s * 1.25); g.bezierCurveTo(s * 0.15, s * 1.0, s, s * 0.8, s, s * 0.35); g.bezierCurveTo(s, -s * 0.1, 0, -s * 0.1, 0, s * 0.35); g.closePath(); }
      function starPath(g, r, pts, inner) { g.beginPath(); for (var i = 0; i < pts * 2; i++) { var a = -PI / 2 + i * PI / pts, rr = i % 2 ? r * inner : r; if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); }
      function glowOn(g, col, blur) { g.shadowColor = col; g.shadowBlur = blur; }
      function glowOff(g) { g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)'; }
      function neon(g, col, m, draw) {   // a glowing tube: a wide faint glow, the coloured tube, and a pale hot core
        var t = Math.max(2, m * 0.22);
        lw(g, t * 1.7, col); glowOn(g, col, m * 1.6); g.beginPath(); draw(); g.stroke();
        lw(g, t, col); glowOn(g, col, m * 0.6); g.beginPath(); draw(); g.stroke();
        glowOff(g); lw(g, t * 0.42, mix(col, '#ffffff', 0.82)); g.beginPath(); draw(); g.stroke();
      }
      function jag(g, x0, y0, x1, y1, amp, r, step) {   // a jagged line from one point to another
        var len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / step)), nx = -(y1 - y0) / len, ny = (x1 - x0) / len, i, o;
        g.moveTo(x0, y0);
        for (i = 1; i < n; i++) { o = (r() - 0.5) * 2 * amp; g.lineTo(x0 + (x1 - x0) * i / n + nx * o, y0 + (y1 - y0) * i / n + ny * o); }
        g.lineTo(x1, y1);
      }
      function stripes(g, w, h, m, a, b, sw) {   // diagonal stripes in two colours over the border band
        g.save(); clipBand(g, w, h, m);
        g.fillStyle = b; g.fillRect(0, 0, w, h);
        g.fillStyle = a;
        for (var x = -h; x < w + h; x += sw * 2) { poly(g, [[x, h], [x + sw, h], [x + sw + h, 0], [x + h, 0]]); g.fill(); }
        g.restore();
      }
      function add(key, label, cat, color, width, fn) { FRAMES.push({ key: key, label: label, cat: cat }); FRAME_DEF[key] = { color: color, width: width }; FR[key] = fn; }
      FRAMES.forEach(function (f) { if (!f.cat) f.cat = 'Classic'; });

      // ----- Lines -----
      add('thin', 'Thin line', 'Lines', '#ffffff', 0.04, function (g, w, h, m, col) { lw(g, m * 0.12, col); g.beginPath(); g.rect(m * 0.5, m * 0.5, w - m, h - m); g.stroke(); });
      add('double', 'Double line', 'Lines', '#ffffff', 0.05, function (g, w, h, m, col) {
        lw(g, m * 0.1, col); g.beginPath(); g.rect(m * 0.2, m * 0.2, w - m * 0.4, h - m * 0.4); g.stroke(); g.beginPath(); g.rect(m * 0.6, m * 0.6, w - m * 1.2, h - m * 1.2); g.stroke();
      });
      add('dashed', 'Dashed', 'Lines', '#ffffff', 0.05, function (g, w, h, m, col) { lw(g, m * 0.22, col); g.lineCap = 'butt'; g.setLineDash([m * 0.9, m * 0.5]); g.beginPath(); g.rect(m * 0.5, m * 0.5, w - m, h - m); g.stroke(); g.setLineDash([]); });
      add('dotted', 'Dotted', 'Lines', '#ffffff', 0.05, function (g, w, h, m, col) { lw(g, m * 0.34, col); g.setLineDash([0.01, m * 0.7]); g.beginPath(); g.rect(m * 0.5, m * 0.5, w - m, h - m); g.stroke(); g.setLineDash([]); });
      add('bevel', 'Bevel', 'Lines', '#b08850', 0.06, function (g, w, h, m, col) {
        var sides = [[[0, 0], [w, 0], [w - m, m], [m, m]], [[w, 0], [w, h], [w - m, h - m], [w - m, m]], [[w, h], [0, h], [m, h - m], [w - m, h - m]], [[0, h], [0, 0], [m, m], [m, h - m]]], tone = [0.55, 0.15, -0.35, 0.3];
        sides.forEach(function (s, i) { g.fillStyle = tone[i] > 0 ? mix(col, '#ffffff', tone[i]) : mix(col, '#000000', -tone[i]); poly(g, s); g.fill(); });
        lw(g, Math.max(1, m * 0.04), 'rgba(0,0,0,0.35)'); g.beginPath(); g.rect(m, m, w - 2 * m, h - 2 * m); g.stroke();
      });
      add('shadowbox', 'Shadow box', 'Lines', '#f4f1ea', 0.06, function (g, w, h, m, col) {
        band(g, w, h, m, col, 0); g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(m, m, w - 2 * m, m * 0.4); g.fillRect(m, m, m * 0.4, h - 2 * m);
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(m, m + m * 0.4, w - 2 * m, m * 0.25); g.fillRect(m + m * 0.4, m, m * 0.25, h - 2 * m);
      });
      add('roundline', 'Rounded outline', 'Lines', '#ffffff', 0.05, function (g, w, h, m, col) { lw(g, m * 0.24, col); g.beginPath(); rrect(g, m * 0.6, m * 0.6, w - m * 1.2, h - m * 1.2, m * 2.2); g.stroke(); });
      add('chamfer', 'Cut corners', 'Lines', '#ffffff', 0.05, function (g, w, h, m, col) {
        var c = m * 2.4; g.fillStyle = col; g.beginPath(); g.rect(0, 0, w, h);
        g.moveTo(m + c, m); g.lineTo(m, m + c); g.lineTo(m, h - m - c); g.lineTo(m + c, h - m); g.lineTo(w - m - c, h - m); g.lineTo(w - m, h - m - c); g.lineTo(w - m, m + c); g.lineTo(w - m - c, m); g.closePath(); g.fill('evenodd');
      });

      // ----- Cinema and screens -----
      add('letterbox', 'Letterbox', 'Cinema', '#000000', 0.07, function (g, w, h, m, col) { g.fillStyle = col; g.fillRect(0, 0, w, m * 2.2); g.fillRect(0, h - m * 2.2, w, m * 2.2); });
      add('cinescope', 'Widescreen', 'Cinema', '#000000', 0.07, function (g, w, h, m, col) {
        g.fillStyle = col; g.fillRect(0, 0, w, m * 2.6); g.fillRect(0, h - m * 2.6, w, m * 2.6);
        lw(g, Math.max(1, m * 0.05), 'rgba(255,255,255,0.45)'); g.beginPath(); g.moveTo(0, m * 2.6); g.lineTo(w, m * 2.6); g.moveTo(0, h - m * 2.6); g.lineTo(w, h - m * 2.6); g.stroke();
      });
      add('slate', 'Clapperboard', 'Cinema', '#111111', 0.06, function (g, w, h, m, col) {
        var bh = m * 1.7; g.save(); g.beginPath(); g.rect(0, 0, w, bh); g.clip(); g.fillStyle = col; g.fillRect(0, 0, w, bh); g.fillStyle = ink(col);
        for (var x = -bh; x < w + bh; x += bh * 1.6) { poly(g, [[x, bh], [x + bh * 0.8, bh], [x + bh * 1.8, 0], [x + bh, 0]]); g.fill(); }
        g.restore(); g.fillStyle = col; g.fillRect(0, bh, w, m * 0.25); g.fillRect(0, h - m * 0.7, w, m * 0.7);
      });
      add('vhs', 'VHS tape', 'Cinema', '#ffffff', 0.06, function (g, w, h, m, col) {
        var fs = Math.max(8, Math.round(m * 0.95)), r = rnd(5), i; g.font = 'bold ' + fs + 'px monospace'; g.textBaseline = 'top'; g.textAlign = 'left';
        g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = fs * 0.3; g.fillStyle = col;
        poly(g, [[m, m * 0.7], [m, m * 0.7 + fs * 0.8], [m + fs * 0.7, m * 0.7 + fs * 0.4]]); g.fill(); g.fillText('PLAY', m + fs * 1.0, m * 0.7);
        g.textAlign = 'right'; g.fillText('SP', w - m, m * 0.7); g.textBaseline = 'bottom'; g.fillText('0:00:00', w - m, h - m * 0.7); g.textAlign = 'left'; g.fillText('AUG. 12 1999', m, h - m * 0.7); g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)';
        for (i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.08 + r() * 0.12) + ')'; g.fillRect(r() * w * 0.5, h * 0.86 + i * m * 0.12, w * (0.2 + r() * 0.5), Math.max(1, m * 0.07)); }
        g.fillStyle = 'rgba(0,0,0,0.12)'; for (i = 0; i < h; i += Math.max(3, m * 0.35)) g.fillRect(0, i, w, Math.max(1, m * 0.08));
      });
      add('crt', 'Old TV', 'Cinema', '#1b1b1b', 0.07, function (g, w, h, m, col) {
        band(g, w, h, m, col, m * 3.4); lw(g, Math.max(1, m * 0.1), 'rgba(255,255,255,0.18)'); g.beginPath(); rrect(g, m * 1.05, m * 1.05, w - m * 2.1, h - m * 2.1, m * 3.0); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); g.arc(m * 3.4, m * 3.0, m * 0.7, 0, PI * 2); g.fill();
      });
      add('live', 'Live badge', 'Cinema', '#e11d2e', 0.05, function (g, w, h, m, col) {
        var bw = m * 3.2, bh = m * 1.25, x = m * 0.9, y = m * 0.9, fs = Math.max(8, Math.round(bh * 0.62));
        lw(g, m * 0.14, rgba(col, 0.9)); g.beginPath(); g.rect(m * 0.3, m * 0.3, w - m * 0.6, h - m * 0.6); g.stroke();
        g.fillStyle = col; g.beginPath(); rrect(g, x, y, bw, bh, bh * 0.25); g.fill();
        g.fillStyle = ink(col); g.beginPath(); g.arc(x + bh * 0.5, y + bh / 2, bh * 0.16, 0, PI * 2); g.fill();
        g.font = 'bold ' + fs + 'px sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('LIVE', x + bh * 0.85, y + bh / 2 + fs * 0.04);
      });
      add('cctv', 'Security cam', 'Cinema', '#ffffff', 0.05, function (g, w, h, m, col) {
        var fs = Math.max(8, Math.round(m * 0.9)), len = m * 2.6; g.font = 'bold ' + fs + 'px monospace'; g.fillStyle = col; g.textBaseline = 'top'; g.textAlign = 'left'; g.fillText('CAM 01', m, m * 0.8);
        g.fillStyle = '#ff2d2d'; g.beginPath(); g.arc(w - m * 3.6, m * 0.8 + fs * 0.5, fs * 0.28, 0, PI * 2); g.fill(); g.fillStyle = col; g.textAlign = 'right'; g.fillText('REC', w - m, m * 0.8);
        lw(g, Math.max(1, m * 0.12), col); g.lineCap = 'butt';
        corners(g, w, h, function () { g.beginPath(); g.moveTo(m * 0.45 + len, m * 0.45); g.lineTo(m * 0.45, m * 0.45); g.lineTo(m * 0.45, m * 0.45 + len); g.stroke(); });
      });
      add('hud', 'Tech HUD', 'Cinema', '#35e0ff', 0.05, function (g, w, h, m, col) {
        var len = m * 3.2, i, n = Math.floor(w / (m * 0.7)); lw(g, Math.max(1, m * 0.16), col); g.lineCap = 'butt';
        corners(g, w, h, function () { g.beginPath(); g.moveTo(m * 0.4 + len, m * 0.4); g.lineTo(m * 0.4, m * 0.4); g.lineTo(m * 0.4, m * 0.4 + len); g.stroke(); g.beginPath(); g.moveTo(m * 0.9 + len * 0.5, m * 0.9); g.lineTo(m * 0.9, m * 0.9); g.lineTo(m * 0.9, m * 0.9 + len * 0.5); g.stroke(); });
        lw(g, Math.max(1, m * 0.06), rgba(col, 0.8)); g.lineCap = 'butt'; g.beginPath();
        for (i = 0; i <= n; i++) { var x = w * i / n, tl = i % 5 ? m * 0.22 : m * 0.45; g.moveTo(x, m * 0.4); g.lineTo(x, m * 0.4 + tl); g.moveTo(x, h - m * 0.4); g.lineTo(x, h - m * 0.4 - tl); }
        g.stroke(); lw(g, Math.max(1, m * 0.1), col); g.beginPath(); g.moveTo(w / 2 - m * 0.7, h / 2); g.lineTo(w / 2 + m * 0.7, h / 2); g.moveTo(w / 2, h / 2 - m * 0.7); g.lineTo(w / 2, h / 2 + m * 0.7); g.stroke();
      });

      // ----- Corners -----
      add('brackets', 'Corner brackets', 'Corners', '#ffffff', 0.05, function (g, w, h, m, col) {
        lw(g, m * 0.3, col); g.lineCap = 'square'; corners(g, w, h, function () { g.beginPath(); g.moveTo(m * 0.7 + m * 3.6, m * 0.7); g.lineTo(m * 0.7, m * 0.7); g.lineTo(m * 0.7, m * 0.7 + m * 3.6); g.stroke(); });
      });
      add('cornerarcs', 'Corner arcs', 'Corners', '#ffffff', 0.05, function (g, w, h, m, col) {
        lw(g, m * 0.22, col); corners(g, w, h, function () { g.beginPath(); g.arc(0, 0, m * 3.4, 0, PI / 2); g.stroke(); g.beginPath(); g.arc(0, 0, m * 2.3, 0, PI / 2); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(m * 0.9, m * 0.9, m * 0.28, 0, PI * 2); g.fill(); });
      });
      add('ornate', 'Ornate corners', 'Corners', '#d9b24c', 0.05, function (g, w, h, m, col) {
        corners(g, w, h, function () {
          lw(g, m * 0.2, col); g.beginPath(); g.arc(m * 0.9, m * 0.9, m * 3, PI, PI * 1.5); g.stroke(); g.beginPath(); g.moveTo(m * 0.9, m * 3.9); g.lineTo(m * 0.9, m * 7); g.moveTo(m * 3.9, m * 0.9); g.lineTo(m * 7, m * 0.9); g.stroke();
          g.beginPath(); g.arc(m * 2.2, m * 2.2, m * 1.1, PI * 1.05, PI * 1.45); g.stroke();
          g.fillStyle = col; g.beginPath(); g.arc(m * 3.9, m * 0.9, m * 0.32, 0, PI * 2); g.arc(m * 0.9, m * 3.9, m * 0.32, 0, PI * 2); g.arc(m * 2.2, m * 2.2, m * 0.38, 0, PI * 2); g.fill();
        });
      });
      add('diamondcorners', 'Diamond corners', 'Corners', '#ffffff', 0.05, function (g, w, h, m, col) {
        corners(g, w, h, function () { g.fillStyle = col; poly(g, [[m * 1.2, m * 0.5], [m * 1.9, m * 1.2], [m * 1.2, m * 1.9], [m * 0.5, m * 1.2]]); g.fill(); lw(g, m * 0.12, col); g.lineCap = 'butt'; g.beginPath(); g.moveTo(m * 2.5, m * 1.2); g.lineTo(m * 8, m * 1.2); g.moveTo(m * 1.2, m * 2.5); g.lineTo(m * 1.2, m * 8); g.stroke(); });
      });
      add('crops', 'Crop marks', 'Corners', '#ffffff', 0.05, function (g, w, h, m, col) {
        lw(g, Math.max(1, m * 0.1), col); g.lineCap = 'butt'; corners(g, w, h, function () {
          g.beginPath(); g.arc(m * 1.6, m * 1.6, m * 0.7, 0, PI * 2); g.moveTo(m * 0.4, m * 1.6); g.lineTo(m * 2.8, m * 1.6); g.moveTo(m * 1.6, m * 0.4); g.lineTo(m * 1.6, m * 2.8); g.stroke();
          g.beginPath(); g.moveTo(m * 3.4, m * 1.6); g.lineTo(m * 5.4, m * 1.6); g.moveTo(m * 1.6, m * 3.4); g.lineTo(m * 1.6, m * 5.4); g.stroke();
        });
      });
      add('tape', 'Washi tape', 'Corners', '#f4a6c0', 0.05, function (g, w, h, m, col) {
        var tl = m * 6, tw = m * 1.5; corners(g, w, h, function () {
          g.save(); g.translate(m * 0.4, m * 0.4); g.rotate(-PI / 4); g.fillStyle = rgba(col, 0.82); g.fillRect(-tl / 2, -tw / 2, tl, tw);
          g.fillStyle = 'rgba(255,255,255,0.35)'; for (var i = -tl / 2 + m * 0.4; i < tl / 2; i += m * 0.9) g.fillRect(i, -tw / 2, m * 0.3, tw);
          g.restore();
        });
      });

      // ----- Patterns -----
      add('checker', 'Checker', 'Pattern', '#111111', 0.05, function (g, w, h, m, col) {
        var s = m / 2, a = col, b = ink(col) === '#ffffff' ? '#ffffff' : '#ffffff', x, y, i, j; b = ink(col);
        for (j = 0; j * s < h; j++) for (i = 0; i * s < w; i++) { x = i * s; y = j * s; if (x < m || y < m || x + s > w - m || y + s > h - m) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(x, y, s + 0.5, s + 0.5); } }
      });
      add('candy', 'Candy stripes', 'Pattern', '#e8334a', 0.05, function (g, w, h, m, col) { stripes(g, w, h, m, col, '#ffffff', m * 0.8); });
      add('caution', 'Caution tape', 'Pattern', '#ffd400', 0.05, function (g, w, h, m, col) { stripes(g, w, h, m, col, '#141414', m * 0.8); });
      add('airmail', 'Airmail', 'Pattern', '#e11d2e', 0.05, function (g, w, h, m, col) { stripes(g, w, h, m, col, '#1f4fd8', m * 0.7); g.fillStyle = '#ffffff'; clipBand(g, w, h, m); });
      add('zigzag', 'Zigzag', 'Pattern', '#ffffff', 0.05, function (g, w, h, m, col) {
        band(g, w, h, m * 0.5, col, 0); g.fillStyle = col; along(w, h, m * 0.5, m * 0.9, function (x, y, a) { put(g, x, y, a, function () { poly(g, [[-m * 0.45, 0], [m * 0.45, 0], [0, m * 0.95]]); g.fill(); }); });
      });
      add('waves', 'Waves', 'Pattern', '#ffffff', 0.05, function (g, w, h, m, col) {
        var i, n = 90; lw(g, m * 0.3, col); g.beginPath();
        for (i = 0; i <= n; i++) { var x = w * i / n, y = m * 0.6 + Math.sin(i / n * w / (m * 1.7) * PI) * m * 0.3; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); g.beginPath();
        for (i = 0; i <= n; i++) { var x2 = w * i / n, y2 = h - m * 0.6 + Math.sin(i / n * w / (m * 1.7) * PI) * m * 0.3; if (i) g.lineTo(x2, y2); else g.moveTo(x2, y2); } g.stroke(); g.beginPath();
        for (i = 0; i <= n; i++) { var y3 = h * i / n, x3 = m * 0.6 + Math.sin(i / n * h / (m * 1.7) * PI) * m * 0.3; if (i) g.lineTo(x3, y3); else g.moveTo(x3, y3); } g.stroke(); g.beginPath();
        for (i = 0; i <= n; i++) { var y4 = h * i / n, x4 = w - m * 0.6 + Math.sin(i / n * h / (m * 1.7) * PI) * m * 0.3; if (i) g.lineTo(x4, y4); else g.moveTo(x4, y4); } g.stroke();
      });
      add('polka', 'Polka dots', 'Pattern', '#ff7aa8', 0.06, function (g, w, h, m, col) {
        g.fillStyle = col; [m * 0.3, m * 0.75].forEach(function (o, k) { along(w, h, o, m * 0.78, function (x, y, a, i) { if ((i + k) % 2 === 0) { g.beginPath(); g.arc(x, y, m * 0.2, 0, PI * 2); g.fill(); } }); });
        g.fillStyle = mix(col, '#ffffff', 0.55); along(w, h, m * 0.52, m * 0.78, function (x, y) { g.beginPath(); g.arc(x, y, m * 0.14, 0, PI * 2); g.fill(); });
      });
      add('greek', 'Greek key', 'Pattern', '#d9b24c', 0.05, function (g, w, h, m, col) {
        var u = m * 0.85; lw(g, Math.max(1, m * 0.14), col); g.lineJoin = 'miter'; g.lineCap = 'butt';
        along(w, h, m * 0.55, u * 1.3, function (x, y, a) { put(g, x, y, a, function () { g.beginPath(); g.moveTo(-u / 2, u / 2); g.lineTo(-u / 2, -u / 2); g.lineTo(u / 2, -u / 2); g.lineTo(u / 2, u * 0.2); g.lineTo(-u * 0.12, u * 0.2); g.lineTo(-u * 0.12, -u * 0.12); g.lineTo(u * 0.12, -u * 0.12); g.stroke(); }); });
        lw(g, Math.max(1, m * 0.08), col); g.beginPath(); g.rect(m * 0.12, m * 0.12, w - m * 0.24, h - m * 0.24); g.stroke(); g.beginPath(); g.rect(m * 0.98, m * 0.98, w - m * 1.96, h - m * 1.96); g.stroke();
      });
      add('stitch', 'Stitched', 'Pattern', '#c9783b', 0.06, function (g, w, h, m, col) {
        band(g, w, h, m, col, m * 0.5); lw(g, m * 0.1, mix(col, '#000000', 0.4)); g.beginPath(); rrect(g, m, m, w - 2 * m, h - 2 * m, m * 0.5); g.stroke();
        lw(g, m * 0.13, '#f6efe0'); g.lineCap = 'butt'; g.setLineDash([m * 0.42, m * 0.3]); g.beginPath(); rrect(g, m * 0.55, m * 0.55, w - m * 1.1, h - m * 1.1, m * 0.25); g.stroke(); g.setLineDash([]);
      });
      add('rope', 'Rope', 'Pattern', '#c8a465', 0.05, function (g, w, h, m, col) {
        var dark = mix(col, '#000000', 0.4); along(w, h, m * 0.5, m * 0.5, function (x, y, a) { put(g, x, y, a, function () { g.rotate(0.65); g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, m * 0.5, m * 0.24, 0, 0, PI * 2); g.fill(); lw(g, m * 0.06, dark); g.stroke(); }); });
      });

      // ----- Fun -----
      add('hearts', 'Hearts', 'Fun', '#ff4d79', 0.06, function (g, w, h, m, col) {
        along(w, h, m * 0.5, m * 1.5, function (x, y, a, i) { put(g, x, y, a, function () { g.fillStyle = i % 2 ? mix(col, '#ffffff', 0.5) : col; heartPath(g, m * (i % 2 ? 0.34 : 0.5)); g.translate(0, -m * 0.2); g.fill(); }); });
      });
      add('starchain', 'Star chain', 'Fun', '#ffd60a', 0.06, function (g, w, h, m, col) {
        along(w, h, m * 0.55, m * 1.4, function (x, y, a, i) { put(g, x, y, a, function () { g.fillStyle = i % 2 ? mix(col, '#ffffff', 0.55) : col; starPath(g, m * (i % 2 ? 0.34 : 0.55), 5, 0.45); g.fill(); }); });
      });
      add('confetti', 'Confetti', 'Fun', '#ff4d6d', 0.07, function (g, w, h, m, col) {
        var r = rnd(21), n = Math.round(2 * (w + h) / (m * 0.8)), i, side, t, x, y, k;
        for (i = 0; i < n; i++) {
          side = Math.floor(r() * 4); t = r(); k = r() * m * 1.5;
          x = side === 0 ? t * w : side === 2 ? t * w : side === 1 ? w - k : k; y = side === 1 || side === 3 ? t * h : side === 0 ? k : h - k;
          g.save(); g.translate(x, y); g.rotate(r() * PI); g.fillStyle = hueShift(col, Math.floor(r() * 5) * 72);
          if (r() < 0.4) { g.beginPath(); g.arc(0, 0, m * (0.1 + r() * 0.12), 0, PI * 2); g.fill(); } else g.fillRect(-m * 0.16, -m * 0.07, m * (0.22 + r() * 0.22), m * 0.14);
          g.restore();
        }
      });
      add('bubbles', 'Bubbles', 'Fun', '#7fd8ff', 0.07, function (g, w, h, m, col) {
        var r = rnd(8), n = Math.round(2 * (w + h) / (m * 1.2)), i, side, t, k, x, y, rad;
        for (i = 0; i < n; i++) {
          side = Math.floor(r() * 4); t = r(); k = r() * m * 1.4; rad = m * (0.18 + r() * 0.42);
          x = side < 2 ? (side === 0 ? t * w : w - k) : (side === 2 ? t * w : k); y = side === 1 || side === 3 ? t * h : side === 0 ? k : h - k;
          g.fillStyle = rgba(col, 0.22); g.beginPath(); g.arc(x, y, rad, 0, PI * 2); g.fill(); lw(g, Math.max(1, rad * 0.14), rgba('#ffffff', 0.75)); g.beginPath(); g.arc(x, y, rad, 0, PI * 2); g.stroke();
          lw(g, Math.max(1, rad * 0.16), rgba('#ffffff', 0.9)); g.beginPath(); g.arc(x, y, rad * 0.68, PI * 1.1, PI * 1.45); g.stroke();
        }
      });
      add('sparkles', 'Sparkles', 'Fun', '#fff3a0', 0.07, function (g, w, h, m, col) {
        var r = rnd(33), n = Math.round(2 * (w + h) / (m * 1.7)), i, side, t, k, x, y, s;
        for (i = 0; i < n; i++) {
          side = Math.floor(r() * 4); t = r(); k = r() * m * 1.6; s = m * (0.2 + r() * 0.55);
          x = side < 2 ? (side === 0 ? t * w : w - k) : (side === 2 ? t * w : k); y = side === 1 || side === 3 ? t * h : side === 0 ? k : h - k;
          g.save(); g.translate(x, y); g.fillStyle = i % 3 ? col : '#ffffff'; starPath(g, s, 4, 0.22); g.fill(); g.restore();
        }
      });
      add('clouds', 'Clouds', 'Fun', '#ffffff', 0.06, function (g, w, h, m, col) {
        band(g, w, h, m * 0.5, col, 0); g.fillStyle = col; along(w, h, m * 0.55, m * 0.95, function (x, y, a, i) { g.beginPath(); g.arc(x, y, m * (0.62 + 0.18 * ((i * 7) % 3) / 2), 0, PI * 2); g.fill(); });
        g.fillStyle = 'rgba(120,160,210,0.18)'; along(w, h, m * 1.0, m * 0.95, function (x, y) { g.beginPath(); g.arc(x, y, m * 0.2, 0, PI * 2); g.fill(); });
      });
      add('flowers', 'Flower chain', 'Fun', '#ff8fb8', 0.06, function (g, w, h, m, col) {
        lw(g, m * 0.1, '#3f9b4a'); g.beginPath(); g.rect(m * 0.55, m * 0.55, w - m * 1.1, h - m * 1.1); g.stroke();
        along(w, h, m * 0.55, m * 1.5, function (x, y, a, i) { put(g, x, y, a, function () { var c = i % 2 ? col : hueShift(col, 40), k; g.fillStyle = c; for (k = 0; k < 5; k++) { g.beginPath(); g.arc(Math.cos(k * PI * 0.4) * m * 0.3, Math.sin(k * PI * 0.4) * m * 0.3, m * 0.24, 0, PI * 2); g.fill(); } g.fillStyle = '#ffd84d'; g.beginPath(); g.arc(0, 0, m * 0.18, 0, PI * 2); g.fill(); }); });
      });
      add('leaves', 'Leafy vine', 'Fun', '#3f9b4a', 0.06, function (g, w, h, m, col) {
        lw(g, m * 0.1, mix(col, '#000000', 0.35)); g.beginPath(); g.rect(m * 0.55, m * 0.55, w - m * 1.1, h - m * 1.1); g.stroke();
        along(w, h, m * 0.55, m * 0.9, function (x, y, a, i) { put(g, x, y, a, function () { var s = i % 2 ? 1 : -1; g.translate(s * m * 0.28, 0); g.rotate(s * 0.9); g.fillStyle = i % 3 ? col : mix(col, '#c8f060', 0.4); g.beginPath(); g.ellipse(0, 0, m * 0.5, m * 0.2, 0, 0, PI * 2); g.fill(); }); });
      });
      function flame(g, bw, ht, lean, col) { g.beginPath(); g.moveTo(-bw / 2, 0); g.bezierCurveTo(-bw / 2, ht * 0.35, lean - bw * 0.12, ht * 0.62, lean, ht); g.bezierCurveTo(lean + bw * 0.12, ht * 0.62, bw / 2, ht * 0.35, bw / 2, 0); g.closePath(); g.fillStyle = col; g.fill(); }
      add('fire', 'Fire', 'Fun', '#ff5a00', 0.07, function (g, w, h, m, col) {
        var r = rnd(11), core = mix(col, '#fff3a0', 0.85), mid = mix(col, '#ffcf1a', 0.65);
        g.fillStyle = col; g.fillRect(0, h - m * 0.4, w, m * 0.4);
        along(w, h, 0, m * 0.8, function (x, y, a) {
          if (a === 0) return; if (a !== PI && y < h * 0.45) return;
          var ht = m * (1.7 + r() * 2.6) * (a === PI ? 1 : 0.55), lean = (r() - 0.5) * m * 0.9;
          put(g, x, y, a, function () { flame(g, m * 1.05, ht, lean, col); flame(g, m * 0.72, ht * 0.7, lean * 0.8, mid); flame(g, m * 0.4, ht * 0.4, lean * 0.6, core); });
        });
      });
      add('icicles', 'Icicles', 'Fun', '#bfe9ff', 0.06, function (g, w, h, m, col) {
        var r = rnd(4); g.fillStyle = col; g.fillRect(0, 0, w, m * 0.55); g.fillRect(0, 0, m * 0.4, h * 0.3); g.fillRect(w - m * 0.4, 0, m * 0.4, h * 0.3);
        along(w, h, 0, m * 0.62, function (x, y, a) { if (a !== 0) return; var ht = m * (0.9 + r() * 2.8); put(g, x, y + m * 0.4, a, function () { poly(g, [[-m * 0.26, 0], [m * 0.26, 0], [0, ht]]); g.fillStyle = col; g.fill(); poly(g, [[-m * 0.1, 0], [m * 0.02, 0], [-m * 0.03, ht * 0.7]]); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill(); }); });
      });
      add('electric', 'Electric', 'Fun', '#38bdf8', 0.06, function (g, w, h, m, col) {
        var r = rnd(17), o = m * 0.6, sides = [[o, o, w - o, o], [w - o, o, w - o, h - o], [w - o, h - o, o, h - o], [o, h - o, o, o]], k;
        [[1.8, 0], [0.8, 1]].forEach(function (p) {
          r = rnd(17); for (k = 0; k < 4; k++) { g.beginPath(); jag(g, sides[k][0], sides[k][1], sides[k][2], sides[k][3], m * 0.38, r, m * 0.5); lw(g, m * (p[1] ? 0.07 : 0.2), p[1] ? '#ffffff' : col); glowOn(g, col, p[1] ? 0 : m * 1.2); g.stroke(); }
        }); glowOff(g);
      });
      add('bunting', 'Party bunting', 'Fun', '#ff4d6d', 0.07, function (g, w, h, m, col) {
        var n = Math.max(4, Math.round(w / (m * 1.7))), sag = m * 1.5, y0 = m * 0.5, i, t, x, y, bw = w / n * 0.78;
        function py(tt) { return y0 + 4 * sag * tt * (1 - tt); }
        lw(g, Math.max(1, m * 0.08), '#5a4632'); g.beginPath(); for (i = 0; i <= 40; i++) { t = i / 40; if (i) g.lineTo(w * t, py(t)); else g.moveTo(0, py(0)); } g.stroke();
        for (i = 0; i < n; i++) { t = (i + 0.5) / n; x = w * t; y = py(t); g.fillStyle = hueShift(col, i * 47); poly(g, [[x - bw / 2, y - m * 0.02], [x + bw / 2, y - m * 0.02], [x, y + m * 1.5]]); g.fill(); }
      });

      // ----- Neon -----
      add('neon', 'Neon sign', 'Neon', '#ff2fa8', 0.05, function (g, w, h, m, col) { neon(g, col, m, function () { rrect(g, m * 1.3, m * 1.3, w - m * 2.6, h - m * 2.6, m * 1.6); }); });
      add('neondouble', 'Double neon', 'Neon', '#18e6ff', 0.05, function (g, w, h, m, col) {
        neon(g, col, m, function () { rrect(g, m * 0.9, m * 0.9, w - m * 1.8, h - m * 1.8, m * 1.2); }); neon(g, hueShift(col, 150), m * 0.7, function () { rrect(g, m * 2.2, m * 2.2, w - m * 4.4, h - m * 4.4, m * 0.8); });
      });
      add('neoncorners', 'Neon corners', 'Neon', '#7cff4d', 0.05, function (g, w, h, m, col) {
        var len = m * 4.5; neon(g, col, m, function () { g.moveTo(m * 1.2 + len, m * 1.2); g.lineTo(m * 1.2, m * 1.2); g.lineTo(m * 1.2, m * 1.2 + len); g.moveTo(w - m * 1.2 - len, m * 1.2); g.lineTo(w - m * 1.2, m * 1.2); g.lineTo(w - m * 1.2, m * 1.2 + len); g.moveTo(m * 1.2 + len, h - m * 1.2); g.lineTo(m * 1.2, h - m * 1.2); g.lineTo(m * 1.2, h - m * 1.2 - len); g.moveTo(w - m * 1.2 - len, h - m * 1.2); g.lineTo(w - m * 1.2, h - m * 1.2); g.lineTo(w - m * 1.2, h - m * 1.2 - len); });
      });
      add('cyber', 'Cyber', 'Neon', '#b26bff', 0.05, function (g, w, h, m, col) {
        var i = m * 1.2, c = m * 2.6; neon(g, col, m, function () { g.moveTo(i + c, i); g.lineTo(w - i - c, i); g.lineTo(w - i, i + c); g.lineTo(w - i, h - i - c); g.lineTo(w - i - c, h - i); g.lineTo(i + c, h - i); g.lineTo(i, h - i - c); g.lineTo(i, i + c); g.closePath(); });
        g.fillStyle = col; g.fillRect(w / 2 - m * 2.4, i - m * 0.2, m * 4.8, m * 0.4); g.fillRect(w / 2 - m * 2.4, h - i - m * 0.2, m * 4.8, m * 0.4);
      });

      // ----- Paper -----
      add('torn', 'Torn paper', 'Paper', '#f6f1e6', 0.07, function (g, w, h, m, col) {
        var r = rnd(9), pts = [], step = m * 0.4, x, y, j = function () { return (r() - 0.5) * m * 0.9; };
        for (x = m; x < w - m; x += step) pts.push([x, m + j()]); for (y = m; y < h - m; y += step) pts.push([w - m + j(), y]);
        for (x = w - m; x > m; x -= step) pts.push([x, h - m + j()]); for (y = h - m; y > m; y -= step) pts.push([m + j(), y]);
        g.fillStyle = col; g.beginPath(); g.rect(0, 0, w, h); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); g.fill('evenodd');
        lw(g, Math.max(1, m * 0.05), 'rgba(0,0,0,0.18)'); g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); g.stroke();
      });
      add('ticket', 'Ticket', 'Paper', '#f2d27a', 0.07, function (g, w, h, m, col) {
        band(g, w, h, m, col, 0); g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; [[0, h / 2], [w, h / 2], [w / 2, 0], [w / 2, h]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], m * 0.95, 0, PI * 2); g.fill(); }); g.restore();
        lw(g, m * 0.08, mix(col, '#000000', 0.45)); g.lineCap = 'butt'; g.setLineDash([m * 0.3, m * 0.25]); g.beginPath(); g.rect(m * 0.5, m * 0.5, w - m, h - m); g.stroke(); g.setLineDash([]);
      });
      add('sketch', 'Hand drawn', 'Paper', '#ffffff', 0.05, function (g, w, h, m, col) {
        var r = rnd(2), k, i, n; for (k = 0; k < 3; k++) {
          lw(g, m * (0.1 + k * 0.03), rgba(col, 0.92 - k * 0.2)); g.beginPath(); var pts = [], o = m * (0.5 + k * 0.12);
          for (i = 0; i <= 24; i++) pts.push([o + (w - 2 * o) * i / 24, o + (r() - 0.5) * m * 0.22]); for (i = 1; i <= 14; i++) pts.push([w - o + (r() - 0.5) * m * 0.22, o + (h - 2 * o) * i / 14]);
          for (i = 1; i <= 24; i++) pts.push([w - o - (w - 2 * o) * i / 24, h - o + (r() - 0.5) * m * 0.22]); for (i = 1; i <= 14; i++) pts.push([o + (r() - 0.5) * m * 0.22, h - o - (h - 2 * o) * i / 14]);
          for (n = 0; n < pts.length; n++) if (n) g.lineTo(pts[n][0], pts[n][1]); else g.moveTo(pts[n][0], pts[n][1]); g.stroke();
        }
      });
      add('notebook', 'Notebook', 'Paper', '#f7f4ea', 0.06, function (g, w, h, m, col) {
        var bw = m * 1.6, y; g.fillStyle = col; g.fillRect(0, 0, bw, h); g.fillRect(0, 0, w, m * 0.35); g.fillRect(w - m * 0.35, 0, m * 0.35, h); g.fillRect(0, h - m * 0.35, w, m * 0.35);
        g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; for (y = m * 1.1; y < h - m * 0.6; y += m * 1.25) { g.beginPath(); g.arc(bw * 0.55, y, m * 0.26, 0, PI * 2); g.fill(); } g.restore();
        lw(g, m * 0.14, '#5b5f66'); for (y = m * 1.1; y < h - m * 0.6; y += m * 1.25) { g.beginPath(); g.moveTo(bw * 0.18, y + m * 0.1); g.lineTo(bw * 0.95, y - m * 0.1); g.stroke(); }
        lw(g, Math.max(1, m * 0.05), 'rgba(220,80,80,0.55)'); g.beginPath(); g.moveTo(bw + m * 0.2, 0); g.lineTo(bw + m * 0.2, h); g.stroke();
      });

      // ----- Social -----
      add('storybar', 'Story bar', 'Social', '#ffffff', 0.05, function (g, w, h, m, col) {
        var n = 4, gap = m * 0.3, sw = (w - 2 * m * 0.8 - gap * (n - 1)) / n, x, i, hh = Math.max(2, m * 0.3);
        for (i = 0; i < n; i++) { x = m * 0.8 + i * (sw + gap); g.fillStyle = rgba(col, 0.35); g.beginPath(); rrect(g, x, m * 0.8, sw, hh, hh / 2); g.fill(); g.fillStyle = col; g.beginPath(); rrect(g, x, m * 0.8, i < 2 ? sw : i === 2 ? sw * 0.5 : 0.01, hh, hh / 2); g.fill(); }
      });
      add('progress', 'Video progress', 'Social', '#ff2e3d', 0.05, function (g, w, h, m, col) {
        var bh = Math.max(3, m * 0.34), y = h - bh - m * 0.3, p = 0.42; g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(0, y, w, bh); g.fillStyle = col; g.fillRect(0, y, w * p, bh);
        g.beginPath(); g.arc(w * p, y + bh / 2, bh * 1.2, 0, PI * 2); g.fill();
      });
      add('phone', 'Phone screen', 'Social', '#0e0e10', 0.06, function (g, w, h, m, col) {
        band(g, w, h, m * 0.9, col, m * 3.2); var nw = Math.min(w * 0.3, m * 8); g.fillStyle = col; g.beginPath(); rrect(g, w / 2 - nw / 2, -m * 1.2, nw, m * 2.9, m * 0.9); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); rrect(g, w / 2 - w * 0.14, h - m * 0.62, w * 0.28, Math.max(2, m * 0.2), m * 0.1); g.fill();
      });
    })();