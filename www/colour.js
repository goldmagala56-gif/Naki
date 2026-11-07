'use strict';
/* Naki colour tools: curves, colour mixer (HSL per colour band) and 3D LUTs, all baked into one 3D lookup table. */
var NakiColour = (function () {
  var BANDS = [{ key: 'red', label: 'Red', h: 0 }, { key: 'orange', label: 'Orange', h: 30 }, { key: 'yellow', label: 'Yellow', h: 60 }, { key: 'green', label: 'Green', h: 120 },
    { key: 'cyan', label: 'Cyan', h: 180 }, { key: 'blue', label: 'Blue', h: 240 }, { key: 'purple', label: 'Purple', h: 275 }, { key: 'magenta', label: 'Magenta', h: 315 }];
  var CHANNELS = ['m', 'r', 'g', 'b'];
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function sym(v) { v = +v; if (isNaN(v)) v = 0; return r3(Math.max(-1, Math.min(1, v))); }

  // ----- curves -----
  function cleanCurve(pts) {
    if (!Array.isArray(pts) || pts.length < 2) return null;
    var a = pts.map(function (p) { return [clamp01(+p[0]), clamp01(+p[1])]; }).filter(function (p) { return !isNaN(p[0]) && !isNaN(p[1]); }).sort(function (x, y) { return x[0] - y[0]; });
    if (a.length < 2) return null;
    a[0][0] = 0; a[a.length - 1][0] = 1;
    var out = [a[0]], i;
    for (i = 1; i < a.length - 1; i++) if (a[i][0] - out[out.length - 1][0] >= 0.02 && 1 - a[i][0] >= 0.02) out.push(a[i]);
    out.push(a[a.length - 1]);
    while (out.length > 12) out.splice(out.length - 2, 1);
    out = out.map(function (p) { return [r3(p[0]), r3(p[1])]; });
    var identity = out.every(function (p) { return Math.abs(p[1] - p[0]) < 0.002; });
    return identity ? null : out;
  }
  // A smooth curve through the points that never overshoots (monotone cubic). Returns a function 0..1 -> 0..1.
  function curveFn(pts) {
    var n = pts.length, x = [], y = [], dx = [], s = [], m = [], i;
    for (i = 0; i < n; i++) { x.push(pts[i][0]); y.push(pts[i][1]); }
    for (i = 0; i < n - 1; i++) { dx[i] = x[i + 1] - x[i]; s[i] = (y[i + 1] - y[i]) / dx[i]; }
    m[0] = s[0]; m[n - 1] = s[n - 2];
    for (i = 1; i < n - 1; i++) m[i] = s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (s[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      var a = m[i] / s[i], b = m[i + 1] / s[i], h = a * a + b * b;
      if (h > 9) { var t = 3 / Math.sqrt(h); m[i] = t * a * s[i]; m[i + 1] = t * b * s[i]; }
    }
    return function (v) {
      if (v <= x[0]) return y[0];
      if (v >= x[n - 1]) return y[n - 1];
      var k = 0; while (k < n - 2 && v > x[k + 1]) k++;
      var hh = dx[k], tt = (v - x[k]) / hh, t2 = tt * tt, t3 = t2 * tt;
      var r = (2 * t3 - 3 * t2 + 1) * y[k] + (t3 - 2 * t2 + tt) * hh * m[k] + (-2 * t3 + 3 * t2) * y[k + 1] + (t3 - t2) * hh * m[k + 1];
      return r < 0 ? 0 : r > 1 ? 1 : r;
    };
  }

  // ----- the grade: { curves: { m, r, g, b: [[x, y]...] }, hsl: { red: [hue, sat, lum] ... each -1..1 }, lut: { name, size, b64 }, lutAmt: 0..1 } -----
  function cleanGrade(g) {
    if (!g) return null;
    var o = {}, i;
    if (g.curves) { var c = {}; CHANNELS.forEach(function (k) { var p = cleanCurve(g.curves[k]); if (p) c[k] = p; }); if (Object.keys(c).length) o.curves = c; }
    if (g.hsl) {
      var hs = {};
      BANDS.forEach(function (b) { var v = g.hsl[b.key]; if (!v) return; var h = sym(v[0]), s = sym(v[1]), l = sym(v[2]); if (h || s || l) hs[b.key] = [h, s, l]; });
      if (Object.keys(hs).length) o.hsl = hs;
    }
    if (g.lut && g.lut.b64 && g.lut.size >= 2) {
      o.lut = { name: String(g.lut.name || 'LUT').slice(0, 60), size: g.lut.size | 0, b64: String(g.lut.b64) };
      var a = +g.lutAmt; if (isNaN(a)) a = 1; a = r3(clamp01(a)); if (a < 0.999) o.lutAmt = a;
    }
    return Object.keys(o).length ? o : null;
  }
  // patch: { curves: { m: points | null }, hsl: { red: [h, s, l] | null }, lut: {...} | null, lutAmt, replace: grade | null }
  function merge(cur, patch) {
    patch = patch || {};
    if (Object.prototype.hasOwnProperty.call(patch, 'replace')) return cleanGrade(patch.replace);
    var o = JSON.parse(JSON.stringify(cur || {}));
    if (patch.curves) { o.curves = o.curves || {}; Object.keys(patch.curves).forEach(function (k) { if (patch.curves[k]) o.curves[k] = patch.curves[k]; else delete o.curves[k]; }); }
    if (patch.hsl) { o.hsl = o.hsl || {}; Object.keys(patch.hsl).forEach(function (k) { if (patch.hsl[k]) o.hsl[k] = patch.hsl[k]; else delete o.hsl[k]; }); }
    if (patch.lut !== undefined) { if (patch.lut) o.lut = patch.lut; else { delete o.lut; delete o.lutAmt; } }
    if (patch.lutAmt !== undefined) o.lutAmt = patch.lutAmt;
    return cleanGrade(o);
  }

  // ----- colour spaces -----
  function rgb2hsl(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d > 1e-9) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hue2rgb(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
  function hsl2rgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    if (s <= 0) return [l, l, l];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
  }
  function bandW(h, bh) { var d = Math.abs(h - bh); if (d > 180) d = 360 - d; return d >= 45 ? 0 : 1 - d / 45; }

  // ----- 3D LUTs (.cube) -----
  // A table is a Float32Array of size^3 * 3, red changing fastest, then green, then blue (the .cube order).
  function parseCube(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n'), size = 0, data = [], title = '', dmin = [0, 0, 0], dmax = [1, 1, 1], i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === '#') continue;
      if (/^TITLE/i.test(line)) title = line.replace(/^TITLE\s*/i, '').replace(/"/g, '').trim();
      else if (/^LUT_1D_SIZE/i.test(line)) return { error: 'This is a 1D LUT. Naki needs a 3D .cube LUT.' };
      else if (/^LUT_3D_SIZE/i.test(line)) size = parseInt(line.split(/\s+/)[1], 10);
      else if (/^DOMAIN_MIN/i.test(line)) dmin = line.split(/\s+/).slice(1).map(Number);
      else if (/^DOMAIN_MAX/i.test(line)) dmax = line.split(/\s+/).slice(1).map(Number);
      else if (/^[-+0-9.]/.test(line)) { var p = line.split(/\s+/); if (p.length >= 3) data.push(+p[0], +p[1], +p[2]); }
    }
    if (!(size >= 2 && size <= 129)) return { error: 'This file has no usable LUT_3D_SIZE.' };
    if (data.length !== size * size * size * 3) return { error: 'The LUT has ' + (data.length / 3) + ' entries, but a size ' + size + ' LUT needs ' + (size * size * size) + '.' };
    var out = new Float32Array(data.length);
    for (i = 0; i < data.length; i++) { var k = i % 3, span = (dmax[k] - dmin[k]) || 1, v = (data[i] - dmin[k]) / span; out[i] = isNaN(v) ? 0 : clamp01(v); }
    return { size: size, data: out, title: title };
  }
  function sampleLut(data, size, r, g, b, out) {
    var n = size - 1, x = clamp01(r) * n, y = clamp01(g) * n, z = clamp01(b) * n, x0 = Math.min(n - 1, x | 0), y0 = Math.min(n - 1, y | 0), z0 = Math.min(n - 1, z | 0);
    var fx = x - x0, fy = y - y0, fz = z - z0, sr = 3, sg = size * 3, sb = size * size * 3, base = z0 * sb + y0 * sg + x0 * sr;
    for (var c = 0; c < 3; c++) {
      var i0 = base + c;
      var c00 = data[i0] * (1 - fx) + data[i0 + sr] * fx, c10 = data[i0 + sg] * (1 - fx) + data[i0 + sg + sr] * fx;
      var c01 = data[i0 + sb] * (1 - fx) + data[i0 + sb + sr] * fx, c11 = data[i0 + sb + sg] * (1 - fx) + data[i0 + sb + sg + sr] * fx;
      out[c] = (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
    }
    return out;
  }
  function b64enc(u8) {
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    var s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  function b64dec(s) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    var bin = atob(s), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  // Resamples a parsed LUT to size n and keeps it as 8-bit numbers in text, small enough to live inside the project.
  function encodeLut(parsed, n) {
    n = n || 25;
    var u8 = new Uint8Array(n * n * n * 3), t = [0, 0, 0], idx = 0;
    for (var bi = 0; bi < n; bi++) for (var gi = 0; gi < n; gi++) for (var ri = 0; ri < n; ri++) {
      sampleLut(parsed.data, parsed.size, ri / (n - 1), gi / (n - 1), bi / (n - 1), t);
      u8[idx++] = Math.round(clamp01(t[0]) * 255); u8[idx++] = Math.round(clamp01(t[1]) * 255); u8[idx++] = Math.round(clamp01(t[2]) * 255);
    }
    return { size: n, b64: b64enc(u8) };
  }
  function decodeLut(l) {
    var u8 = b64dec(l.b64), f = new Float32Array(u8.length);
    for (var i = 0; i < u8.length; i++) f[i] = u8[i] / 255;
    return f;
  }

  // Bakes the whole grade (curves, then colour mixer, then LUT) into one table. A null grade gives the identity table.
  function bakeLut(grade, size) {
    size = size || 33;
    var g = grade || {}, fn = {}, k;
    CHANNELS.forEach(function (c) { if (g.curves && g.curves[c]) fn[c] = curveFn(g.curves[c]); });
    var bands = []; BANDS.forEach(function (b) { if (g.hsl && g.hsl[b.key]) bands.push({ h: b.h, v: g.hsl[b.key] }); });
    var lut = g.lut ? decodeLut(g.lut) : null, lsize = g.lut ? g.lut.size : 0, amt = g.lutAmt == null ? 1 : g.lutAmt;
    var out = new Float32Array(size * size * size * 3), idx = 0, t = [0, 0, 0], bi, gi, ri, r, gg, b;
    for (bi = 0; bi < size; bi++) for (gi = 0; gi < size; gi++) for (ri = 0; ri < size; ri++) {
      r = ri / (size - 1); gg = gi / (size - 1); b = bi / (size - 1);
      if (fn.m) { r = fn.m(r); gg = fn.m(gg); b = fn.m(b); }
      if (fn.r) r = fn.r(r); if (fn.g) gg = fn.g(gg); if (fn.b) b = fn.b(b);
      if (bands.length) {
        var hs = rgb2hsl(r, gg, b), sw = Math.min(1, hs[1] * 3), dh = 0, ds = 0, dl = 0;
        if (sw > 0) {
          for (k = 0; k < bands.length; k++) { var w = bandW(hs[0], bands[k].h) * sw; if (w > 0) { dh += bands[k].v[0] * 30 * w; ds += bands[k].v[1] * w; dl += bands[k].v[2] * 0.25 * w; } }
          if (dh || ds || dl) { var rgb = hsl2rgb(hs[0] + dh, clamp01(hs[1] * (1 + ds)), clamp01(hs[2] + dl)); r = rgb[0]; gg = rgb[1]; b = rgb[2]; }
        }
      }
      if (lut) { sampleLut(lut, lsize, r, gg, b, t); r = r + (t[0] - r) * amt; gg = gg + (t[1] - gg) * amt; b = b + (t[2] - b) * amt; }
      out[idx++] = clamp01(r); out[idx++] = clamp01(gg); out[idx++] = clamp01(b);
    }
    return out;
  }
  function toCube(lut, size, title) {
    var lines = ['TITLE "' + String(title || 'Naki').replace(/"/g, '') + '"', 'LUT_3D_SIZE ' + size], n = size * size * size;
    for (var i = 0; i < n; i++) lines.push(lut[i * 3].toFixed(6) + ' ' + lut[i * 3 + 1].toFixed(6) + ' ' + lut[i * 3 + 2].toFixed(6));
    return lines.join('\n') + '\n';
  }
  // Applies a table to canvas pixel data (RGBA bytes), in place.
  function applyToImageData(px, lut, size) {
    var n = size - 1, sr = 3, sg = size * 3, sb = size * size * 3, i, c;
    for (i = 0; i < px.length; i += 4) {
      var x = px[i] / 255 * n, y = px[i + 1] / 255 * n, z = px[i + 2] / 255 * n, x0 = x | 0, y0 = y | 0, z0 = z | 0;
      if (x0 >= n) x0 = n - 1; if (y0 >= n) y0 = n - 1; if (z0 >= n) z0 = n - 1;
      var fx = x - x0, fy = y - y0, fz = z - z0, base = z0 * sb + y0 * sg + x0 * sr;
      for (c = 0; c < 3; c++) {
        var i0 = base + c;
        var c00 = lut[i0] * (1 - fx) + lut[i0 + sr] * fx, c10 = lut[i0 + sg] * (1 - fx) + lut[i0 + sg + sr] * fx;
        var c01 = lut[i0 + sb] * (1 - fx) + lut[i0 + sb + sr] * fx, c11 = lut[i0 + sb + sg] * (1 - fx) + lut[i0 + sb + sg + sr] * fx;
        px[i + c] = ((c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz) * 255 + 0.5;
      }
    }
    return px;
  }

  var PRESETS = [
    { key: 'warm', label: 'Warm', grade: { curves: { r: [[0, 0], [0.5, 0.55], [1, 1]], b: [[0, 0.03], [0.5, 0.45], [1, 0.95]] }, hsl: { orange: [0, 0.2, 0.05] } } },
    { key: 'tealorange', label: 'Teal & orange', grade: { curves: { m: [[0, 0], [0.25, 0.2], [0.75, 0.8], [1, 1]] }, hsl: { orange: [0, 0.25, 0.05], blue: [-0.2, 0.2, -0.1], cyan: [0.1, 0.2, -0.05] } } },
    { key: 'matte', label: 'Matte', grade: { curves: { m: [[0, 0.08], [0.5, 0.5], [1, 0.94]] }, hsl: { red: [0, -0.1, 0], green: [0, -0.2, 0] } } },
    { key: 'contrast', label: 'Contrast', grade: { curves: { m: [[0, 0], [0.25, 0.17], [0.75, 0.85], [1, 1]] } } },
    { key: 'cold', label: 'Cold', grade: { curves: { r: [[0, 0], [0.5, 0.45], [1, 0.96]], b: [[0, 0.02], [0.5, 0.56], [1, 1]] }, hsl: { blue: [0, 0.2, 0] } } }
  ];

  var api = { BANDS: BANDS, CHANNELS: CHANNELS, PRESETS: PRESETS, cleanCurve: cleanCurve, curveFn: curveFn, cleanGrade: cleanGrade, merge: merge, parseCube: parseCube,
    encodeLut: encodeLut, decodeLut: decodeLut, bakeLut: bakeLut, toCube: toCube, applyToImageData: applyToImageData, sampleLut: sampleLut };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiColour = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['colour.js'] = 'colour'; }
  return api;
})();