'use strict';
/* Naki stickers: emoji and symbols laid over the picture for a stretch of time. The same drawing is used by the editor preview's
   numbers (position, size, turn), the fast export engine and the ffmpeg engine (which gets each sticker as a transparent picture). */
var NakiStickers = (function () {
  var EMOJI = ['😀', '😂', '😍', '😎', '🥳', '😭', '🔥', '❤️', '👍', '👏', '🙏', '💯', '🎉', '⭐', '✨', '🌈', '🎵', '🎬', '📌', '⚡',
    '💥', '👀', '🤔', '😱', '🥰', '😅', '🙌', '💪', '🎁', '🚀', '🌟', '☀️', '🌙', '🍿', '📣', '✅', '❌', '⚠️', '➡️', '👉'];
  var SYMBOLS = ['★', '♥', '✔', '✖', '➤', '●', '◆', '✦', '♪', '☀', '❝', '❞'];
  var FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Segoe UI Symbol",system-ui,sans-serif';
  // symbols can be coloured; emoji keep their own colours
  function isSymbol(g) { return SYMBOLS.indexOf(g) >= 0; }
  // where a sticker sits in a W x H frame: centre in pixels, text size in pixels, turn in degrees
  function layout(s, W, H) {
    return { px: Math.max(8, Math.round((s.size || 0.2) * H)), cx: (s.x == null ? 0.5 : s.x) * W, cy: (s.y == null ? 0.5 : s.y) * H, rot: s.rot || 0 };
  }
  function drawSticker(g, s, W, H) {
    if (!s || !s.glyph) return;
    var L = layout(s, W, H);
    g.save();
    g.translate(L.cx, L.cy); g.rotate(L.rot * Math.PI / 180);
    g.font = L.px + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = isSymbol(s.glyph) ? (s.color || '#ffffff') : '#ffffff';
    g.fillText(s.glyph, 0, 0);
    g.restore();
  }
  var api = { EMOJI: EMOJI, SYMBOLS: SYMBOLS, FONT: FONT, isSymbol: isSymbol, layout: layout, drawSticker: drawSticker };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiStickers = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['stickers.js'] = 'effects'; }
  return api;
})();
