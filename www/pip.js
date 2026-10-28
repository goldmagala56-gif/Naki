'use strict';
/* Naki picture-in-picture layouts: where to put an overlay so it sits in a corner, fills a half of the screen, or fits the whole frame.
   Pure maths, no browser needed, so it is tested. The numbers match what an overlay stores:
     x, y  = where the CENTRE of the overlay is, as a fraction of the frame (0 to 1)
     size  = the overlay's WIDTH as a fraction of the frame's width (its height follows from its own shape)
   place(key, frame, media, o) gives { x, y, size } for one overlay. split(kind, frame, a, b) gives two places for a split screen.
   o (all optional): margin = gap to the edge as a fraction of the frame width (0.04), corner = widest a corner overlay may be (0.32 of the width),
   cornerH = tallest a corner overlay may be (0.45 of the height). */
var NakiPip = (function () {
  var LIST = [
    { key: 'tl', label: 'Top left' }, { key: 'tr', label: 'Top right' }, { key: 'bl', label: 'Bottom left' }, { key: 'br', label: 'Bottom right' },
    { key: 'center', label: 'Centre' }, { key: 'left', label: 'Left half' }, { key: 'right', label: 'Right half' },
    { key: 'top', label: 'Top half' }, { key: 'bottom', label: 'Bottom half' }, { key: 'full', label: 'Fit' }, { key: 'fill', label: 'Fill' }
  ];
  function find(key) { for (var i = 0; i < LIST.length; i++) if (LIST[i].key === key) return LIST[i]; return null; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function dims(frame, media) {
    var W = frame && frame.w > 0 ? frame.w : 1280, H = frame && frame.h > 0 ? frame.h : 720;
    var mw = media && media.w > 0 ? media.w : 16, mh = media && media.h > 0 ? media.h : 9;
    return { W: W, H: H, mw: mw, mh: mh };
  }
  // the biggest copy of the media that fits inside a box of bw x bh pixels (cover = the smallest that covers it), as a width in pixels
  function fitWidth(d, bw, bh, cover) {
    var s = cover ? Math.max(bw / d.mw, bh / d.mh) : Math.min(bw / d.mw, bh / d.mh);
    return d.mw * s;
  }
  // an overlay of width w (pixels) centred in the box [x0, y0, x1, y1]
  function inBox(d, w, x0, y0, x1, y1) {
    return { x: r3((x0 + x1) / 2 / d.W), y: r3((y0 + y1) / 2 / d.H), size: r3(w / d.W) };
  }

  function place(key, frame, media, o) {
    if (!find(key)) return null;
    o = o || {};
    var d = dims(frame, media), W = d.W, H = d.H, m = (o.margin == null ? 0.04 : o.margin) * W;
    var cw = (o.corner == null ? 0.32 : o.corner) * W, ch = (o.cornerH == null ? 0.45 : o.cornerH) * H, w, h;
    switch (key) {
      case 'tl': case 'tr': case 'bl': case 'br':
        w = fitWidth(d, cw, ch, false); h = w * d.mh / d.mw;
        var cx = (key === 'tl' || key === 'bl') ? m + w / 2 : W - m - w / 2, cy = (key === 'tl' || key === 'tr') ? m + h / 2 : H - m - h / 2;
        return { x: r3(cx / W), y: r3(cy / H), size: r3(w / W) };
      case 'center': return inBox(d, fitWidth(d, W * 0.6, H * 0.6, false), 0, 0, W, H);
      case 'left': return inBox(d, fitWidth(d, W / 2, H, false), 0, 0, W / 2, H);
      case 'right': return inBox(d, fitWidth(d, W / 2, H, false), W / 2, 0, W, H);
      case 'top': return inBox(d, fitWidth(d, W, H / 2, false), 0, 0, W, H / 2);
      case 'bottom': return inBox(d, fitWidth(d, W, H / 2, false), 0, H / 2, W, H);
      case 'full': return inBox(d, fitWidth(d, W, H, false), 0, 0, W, H);
      case 'fill': return inBox(d, fitWidth(d, W, H, true), 0, 0, W, H);
    }
    return null;
  }

  // Two overlays side by side ('sbs') or one above the other ('stack'), each fitted into its own half. Returns [placeForA, placeForB].
  function split(kind, frame, a, b) {
    return kind === 'stack' ? [place('top', frame, a), place('bottom', frame, b)] : [place('left', frame, a), place('right', frame, b)];
  }

  var api = { LIST: LIST, find: find, place: place, split: split };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiPip = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['pip.js'] = 'tools'; }
  return api;
})();
