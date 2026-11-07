'use strict';
/* Naki layouts: mirror and split-screen. Pure helpers shared by the project model, the editor preview and both export engines.
   A layout is { preset, gap, color, zoom }: gap = width of the dividers (fraction of the short side), color = divider colour, zoom = how far each cell
   is zoomed into its part of the picture. cells() turns it into pixel rectangles (all even numbers, so ffmpeg is happy); draw() paints them on a canvas
   and graph() writes the same thing as an ffmpeg filter graph, so the preview and the exports agree. */
var NakiLayout = (function () {
  var GROUPS = [{ key: 'mirror', label: 'Mirror' }, { key: 'split', label: 'Split screen' }];
  var LIST = [], BY = {};
  function def(key, group, label, gap, cells) { var e = { key: key, group: group, label: label, gap: gap, cells: cells }; LIST.push(e); BY[key] = e; }
  function grid(cols, rows, flipFn) {
    var out = [], i, j;
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) { var f = flipFn ? flipFn(i, j) : [0, 0]; out.push([i / cols, j / rows, 1 / cols, 1 / rows, null, f[0], f[1]]); }
    return out;
  }
  // a cell is [x, y, w, h, source, flipH, flipV] (fractions of the frame); source = [x, y, w, h] of the picture it shows, or null for the whole picture
  var Q = [0, 0, 0.5, 0.5], BR = [0.5, 0.5, 0.5, 0.5];
  def('mirror_lr', 'mirror', 'Left to right', 0, [[0, 0, 0.5, 1, [0, 0, 0.5, 1]], [0.5, 0, 0.5, 1, [0, 0, 0.5, 1], 1, 0]]);
  def('mirror_rl', 'mirror', 'Right to left', 0, [[0, 0, 0.5, 1, [0.5, 0, 0.5, 1], 1, 0], [0.5, 0, 0.5, 1, [0.5, 0, 0.5, 1]]]);
  def('mirror_tb', 'mirror', 'Top to bottom', 0, [[0, 0, 1, 0.5, [0, 0, 1, 0.5]], [0, 0.5, 1, 0.5, [0, 0, 1, 0.5], 0, 1]]);
  def('mirror_bt', 'mirror', 'Bottom to top', 0, [[0, 0, 1, 0.5, [0, 0.5, 1, 0.5], 0, 1], [0, 0.5, 1, 0.5, [0, 0.5, 1, 0.5]]]);
  def('mirror_quad', 'mirror', 'Four-way', 0, [[0, 0, 0.5, 0.5, Q], [0.5, 0, 0.5, 0.5, Q, 1, 0], [0, 0.5, 0.5, 0.5, Q, 0, 1], [0.5, 0.5, 0.5, 0.5, Q, 1, 1]]);
  def('mirror_quad_in', 'mirror', 'Centre out', 0, [[0, 0, 0.5, 0.5, BR, 1, 1], [0.5, 0, 0.5, 0.5, BR, 0, 1], [0, 0.5, 0.5, 0.5, BR, 1, 0], [0.5, 0.5, 0.5, 0.5, BR]]);
  def('split2v', 'split', '2 columns', 0.012, grid(2, 1));
  def('split2h', 'split', '2 rows', 0.012, grid(1, 2));
  def('split3v', 'split', '3 columns', 0.012, grid(3, 1));
  def('split3h', 'split', '3 rows', 0.012, grid(1, 3));
  def('grid4', 'split', '4 grid', 0.012, grid(2, 2));
  def('grid6', 'split', '6 grid', 0.012, grid(3, 2));
  def('grid9', 'split', '9 grid', 0.012, grid(3, 3));
  def('big_left', 'split', 'Big left + 2', 0.012, [[0, 0, 2 / 3, 1], [2 / 3, 0, 1 / 3, 0.5], [2 / 3, 0.5, 1 / 3, 0.5]]);
  def('big_top', 'split', 'Big top + 2', 0.012, [[0, 0, 1, 2 / 3], [0, 2 / 3, 0.5, 1 / 3], [0.5, 2 / 3, 0.5, 1 / 3]]);
  def('split2v_flip', 'split', '2 columns, one flipped', 0.012, grid(2, 1, function (i) { return [i % 2, 0]; }));
  def('grid4_flip', 'split', '4 grid, mirrored', 0.012, grid(2, 2, function (i, j) { return [i % 2, j % 2]; }));

  function r3(x) { return Math.round(x * 1000) / 1000; }
  function r6(x) { return Math.round(x * 1e6) / 1e6; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function num(v, d) { v = +v; return isNaN(v) ? d : v; }
  function ev(v) { return Math.floor(v / 2) * 2; }
  function hex(c, d) { var m = /^#?([0-9a-f]{6})$/i.exec(String(c == null ? '' : c).trim()); return m ? '#' + m[1].toLowerCase() : d; }
  function has(key) { return !!BY[key]; }
  function label(key) { return BY[key] ? BY[key].label : String(key); }
  function groupOf(key) { return BY[key] ? BY[key].group : GROUPS[0].key; }
  function inGroup(g) { return LIST.filter(function (e) { return e.group === g; }).map(function (e) { return { key: e.key, label: e.label }; }); }
  // Tidies a layout (limits, defaults). Null when the preset is not known.
  function clean(g) {
    if (!g || typeof g !== 'object' || !BY[g.preset]) return null;
    return { preset: g.preset, gap: r3(clamp(num(g.gap, BY[g.preset].gap), 0, 0.1)), color: hex(g.color, '#111111'), zoom: r3(clamp(num(g.zoom, 1), 1, 3)) };
  }
  // The cells in pixels for a frame W x H. Every number is even. Each cell also says which part of the frame it shows (sx, sy, sw, sh) and whether it is flipped.
  // The part shown is cut (from the middle) to the shape of the cell, so nothing is ever stretched.
  function cells(layout, W, H) {
    var L = clean(layout); if (!L) return [];
    var d = BY[L.preset], hg = Math.round(L.gap * Math.min(W, H)) / 2, out = [];
    function edge(f, N) { return ev(Math.round(f * N)); }
    d.cells.forEach(function (c) {
      var fx0 = c[0], fy0 = c[1], fx1 = r6(c[0] + c[2]), fy1 = r6(c[1] + c[3]);
      var x0 = edge(fx0, W), y0 = edge(fy0, H), x1 = edge(fx1, W), y1 = edge(fy1, H);
      if (fx0 > 0.001) x0 = ev(x0 + hg); if (fy0 > 0.001) y0 = ev(y0 + hg);
      if (fx1 < 0.999) x1 = ev(x1 - hg); if (fy1 < 0.999) y1 = ev(y1 - hg);
      var w = Math.max(2, x1 - x0), h = Math.max(2, y1 - y0);
      var s = c[4] || [0, 0, 1, 1], bx = s[0] * W, by = s[1] * H, bw = s[2] * W, bh = s[3] * H, ta = w / h, cw, ch;
      if (bw / bh > ta) { ch = bh; cw = bh * ta; } else { cw = bw; ch = bw / ta; }
      cw /= L.zoom; ch /= L.zoom;
      var sw = Math.max(2, ev(cw)), sh = Math.max(2, ev(ch)), sx = ev(bx + (bw - sw) / 2), sy = ev(by + (bh - sh) / 2);
      sx = Math.max(0, Math.min(sx, ev(W - sw))); sy = Math.max(0, Math.min(sy, ev(H - sh)));
      out.push({ x: x0, y: y0, w: w, h: h, sx: sx, sy: sy, sw: sw, sh: sh, fh: !!c[5], fv: !!c[6] });
    });
    return out;
  }
  // Paints the layout on a canvas context: src is a canvas the same size as the frame (W x H) holding the picture.
  function draw(g, layout, W, H, src) {
    var L = clean(layout); if (!L) return;
    g.save(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = L.color; g.fillRect(0, 0, W, H);
    cells(L, W, H).forEach(function (c) {
      g.save(); g.beginPath(); g.rect(c.x, c.y, c.w, c.h); g.clip();
      g.translate(c.x + c.w / 2, c.y + c.h / 2); g.scale(c.fh ? -1 : 1, c.fv ? -1 : 1);
      g.drawImage(src, c.sx, c.sy, c.sw, c.sh, -c.w / 2, -c.h / 2, c.w, c.h);
      g.restore();
    });
    g.restore();
  }
  // The same thing as a piece of ffmpeg filter graph: [cur] in, [out] out, laid over the picture only between a0 and b0 seconds.
  function graph(layout, a0, b0, cur, out, W, H) {
    var L = clean(layout); if (!L) return '[' + cur + ']null[' + out + ']';
    var cs = cells(L, W, H), p = 'ly' + out + '_', labels = '[' + p + 'k][' + p + 'b]', s = [];
    cs.forEach(function (c, i) { labels += '[' + p + 'c' + i + ']'; });
    s.push('[' + cur + ']split=' + (cs.length + 2) + labels);
    s.push('[' + p + 'b]drawbox=x=0:y=0:w=iw:h=ih:color=0x' + L.color.slice(1) + ':t=fill[' + p + 'g0]');
    cs.forEach(function (c, i) {
      s.push('[' + p + 'c' + i + ']crop=' + c.sw + ':' + c.sh + ':' + c.sx + ':' + c.sy + ',scale=' + c.w + ':' + c.h + ':flags=bicubic' + (c.fh ? ',hflip' : '') + (c.fv ? ',vflip' : '') + '[' + p + 't' + i + ']');
      s.push('[' + p + 'g' + i + '][' + p + 't' + i + ']overlay=' + c.x + ':' + c.y + '[' + p + 'g' + (i + 1) + ']');
    });
    s.push('[' + p + 'k][' + p + 'g' + cs.length + "]overlay=0:0:enable='between(t," + a0.toFixed(3) + ',' + b0.toFixed(3) + ")':eof_action=pass[" + out + ']');
    return s.join(';');
  }
  var api = { GROUPS: GROUPS, LIST: LIST, has: has, label: label, groupOf: groupOf, inGroup: inGroup, clean: clean, cells: cells, draw: draw, graph: graph };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiLayout = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['layout.js'] = 'layout'; }
  return api;
})();